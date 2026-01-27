const axios = require('axios');

const BASE_URL = 'https://ucot-gestor-cloud.web.app/api';

async function testEndpoint(name, url, method = 'GET', data = null) {
    try {
        console.log(`Testing ${name} (${url})...`);
        const options = { method, url: `${BASE_URL}${url}`, data };
        const start = Date.now();
        const res = await axios(options);
        const duration = Date.now() - start;
        console.log(`✅ ${name}: ${res.status} (${duration}ms)`);
        if (url.includes('version')) console.log('   Version:', JSON.stringify(res.data, null, 2));
        if (res.data && Array.isArray(res.data)) console.log(`   Count: ${res.data.length}`);
        return true;
    } catch (error) {
        console.error(`❌ ${name} Failed: ${error.message}`);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Data:`, JSON.stringify(error.response.data, null, 2));
        }
        return false;
    }
}

async function run() {
    console.log("🔍 STARTING REMOTE DIAGNOSTIC...");

    // 1. Check Version
    const versionRes = await axios.get(`${BASE_URL}/version`);
    console.log("Remote Version:", versionRes.data.desc || versionRes.data);

    // Explicit check for v3.5 availability
    try {
        const schemaRes = await axios.get(`${BASE_URL}/debug-schema`);
        console.log("\n🔍 SCHEMA DEBUG INFO RECEIVED:");
        console.log(JSON.stringify(schemaRes.data, null, 2));
    } catch (e) {
        if (e.response && e.response.status === 404) {
            console.log("⚠️ /api/debug-schema not found. Deployment probably still in progress (v3.5 not active).");
        } else {
            console.log("❌ Error fetching schema:", e.message);
        }
    }

    // 2. Check Health (DB Connection)
    await testEndpoint('Health Check', '/health');

    // 3. Check Users (Requires valid token technically, but let's see if 401 or 500)
    // Note: The endpoints often require auth, so this might fail with 401 if we don't login.
    // Let's rely on the public health/version first.
    // If we need auth, we can try to login as admin if we had creds, but for now let's see if the server responds at all.

    // Attempt Admin Login to get token (using hardcoded fallback creds from seed if possible)
    console.log("\nAttempting Login to verify Database writes/reads...");
    let token = null;
    try {
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            internalNumber: 'admin',
            password: process.env.ADMIN_PASSWORD || '123456'
        });
        token = loginRes.data.token;
        console.log("✅ Login Successful. Token acquired.");
    } catch (e) {
        console.error("❌ Login Failed:", e.message);
        if (e.response) console.error("   Response:", e.response.data);
    }

    if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        // 4. Check Users (Prisma Mapping Test)
        await testEndpoint('Get Users (Prisma Check)', '/users');

        // 5. Check Shifts (SQL Check)
        await testEndpoint('Get Shifts (SQL Check)', '/shifts?page=1&limit=5');

        // 6. Check Notifications (Specific Error Check)
        await testEndpoint('Get Notifications (Case Sensitivity Check)', '/notifications');
    }
}

run();
