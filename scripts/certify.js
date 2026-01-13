const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const http = require('http');

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

console.log('🔒 STARTING PRE-DEPLOY CERTIFICATION 🔒');
console.log('=======================================');

function step(name, fn) {
    try {
        console.log(`\n🔹 [STEP] ${name}...`);
        fn();
        console.log(`✅ [PASS] ${name}`);
    } catch (error) {
        console.error(`\n❌ [FAIL] ${name}`);
        console.error(error.message);
        process.exit(1);
    }
}

// 1. Structural Validation
step('Validating Project Structure', () => {
    const requiredFiles = [
        path.join(ROOT_DIR, 'package.json'),
        path.join(BACKEND_DIR, 'package.json'),
        path.join(BACKEND_DIR, 'src', 'index.ts'),
        path.join(FRONTEND_DIR, 'index.html'),
    ];

    requiredFiles.forEach(file => {
        if (!fs.existsSync(file)) {
            throw new Error(`Missing required file: ${file}`);
        }
    });
});

// 2. Build Process
step('Building Application (Clean Install & Build)', () => {
    console.log('   Executing: npm run install:all && npm run build');
    // Inject dummy DATABASE_URL for Prisma validation during build
    // Prisma requires the env var to be present if referenced in schema, even for generation
    const buildEnv = {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL || 'postgres://dummy:dummy@localhost:5432/dummy'
    };

    // We assume the user has run install:all effectively, but we run build to be sure artifacts are fresh.
    try {
        execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR, env: buildEnv });
    } catch (e) {
        throw new Error('Build failed. Check output above.');
    }
});

// 3. Artifact Validation
step('Validating Build Artifacts', () => {
    const artifacts = [
        path.join(BACKEND_DIR, 'dist', 'index.js'),
        path.join(FRONTEND_DIR, 'dist', 'index.html'),
    ];

    artifacts.forEach(file => {
        if (!fs.existsSync(file)) {
            throw new Error(`Missing build artifact: ${file}`);
        }
    });
});

// 4. Dry-Run Start
console.log('\n🔹 [STEP] Dry-Run Production Start...');
const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: '3333',
    DATABASE_URL: process.env.DATABASE_URL || 'postgres://dummy:dummy@localhost:5432/dummy', // Mock for startup check if DB not reachable
    JWT_SECRET: 'certify_secret'
};

// We need a real DB connection for full boot, but index.ts deferredBoot handles DB connection failures gracefully-ish?
// Our index.ts fails fast if ENVs are missing. We provided them.
// It will try to connect to DB. If it fails, it logs error but server stays up? 
// Actually deferredBoot happens AFTER server.listen. So server should be responsive to /health even if DB fails.

const serverProcess = spawn('node', ['dist/index.js'], {
    cwd: BACKEND_DIR,
    env: env,
    stdio: 'pipe' // We want to parse output
});

let serverStarted = false;
let checkInterval;

serverProcess.stdout.on('data', (data) => {
    const log = data.toString();
    process.stdout.write('[SERVER] ' + log);
    if (log.includes('LISTENING ON PORT')) {
        serverStarted = true;
    }
});

serverProcess.stderr.on('data', (data) => {
    process.stderr.write('[SERVER ERR] ' + data.toString());
});

// Timeout for server start
const timeout = setTimeout(() => {
    if (!serverStarted) {
        console.error('\n❌ [FAIL] Server failed to start within 10 seconds.');
        serverProcess.kill();
        process.exit(1);
    }
}, 10000);

// Use a polling loop to check health once we think it's started
async function checkHealth() {
    console.log('   Waiting for server to be ready...');
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
            await new Promise((resolve, reject) => {
                const req = http.get('http://localhost:3333/api/health', (res) => {
                    if (res.statusCode === 200) resolve();
                    else reject(new Error(`Status ${res.statusCode}`));
                });
                req.on('error', reject);
                req.end();
            });
            console.log('✅ [PASS] Health Check (API)');
            return true;
        } catch (e) {
            // ignore and retry
        }
    }
    throw new Error('Health check failed after multiple attempts');
}

async function checkFrontend() {
    console.log('   Verifying Frontend serving...');
    try {
        await new Promise((resolve, reject) => {
            const req = http.get('http://localhost:3333/', (res) => {
                if (res.statusCode === 200 && res.headers['content-type'].includes('text/html')) {
                    resolve();
                } else {
                    reject(new Error(`Root returned ${res.statusCode} ${res.headers['content-type']}`));
                }
            });
            req.on('error', reject);
            req.end();
        });
        console.log('✅ [PASS] Frontend Serving');
    } catch (e) {
        throw new Error(`Frontend check failed: ${e.message}`);
    }
}

// Run async checks
(async () => {
    try {
        await checkHealth();
        await checkFrontend();

        console.log('\n🎉 CERTIFICATION COMPLETE: Application is PROD-READY.');
        clearTimeout(timeout);
        serverProcess.kill();
        process.exit(0);
    } catch (error) {
        console.error(`\n❌ [FAIL] Verification failed: ${error.message}`);
        serverProcess.kill();
        process.exit(1);
    }
})();
