const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const root = process.cwd();

function waitFor(url, maxMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) return resolve();
        if (Date.now() - start > maxMs) return reject(new Error('Timeout'));
        setTimeout(check, 500);
      });
      req.on('error', () => {
        if (Date.now() - start > maxMs) return reject(new Error('Timeout'));
        setTimeout(check, 500);
      });
    }
    check();
  });
}

async function main() {
  const backend = spawn('npm', ['run', 'dev'], {
    cwd: path.join(root, 'backend'),
    stdio: 'inherit',
    shell: true,
  });
  await waitFor('http://localhost:3001/api/health');

  const frontend = spawn('npm', ['run', 'dev'], {
    cwd: path.join(root, 'frontend'),
    stdio: 'inherit',
    shell: true,
  });
  await waitFor('http://localhost:5173');

  [backend, frontend].forEach((p) => {
    p.on('close', (code) => process.exit(code || 0));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
