
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:4000/api';

const results = {};

async function main() {
    console.log('--- STARTING SYSTEM-WIDE AUDIT (User 329) ---');
    let token = '';

    // 1. LOGIN
    try {
        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ internalNumber: '329', password: '123456' })
        });

        if (!loginRes.ok) throw new Error(`Status ${loginRes.status}`);
        const authData = await loginRes.json();
        token = authData.token;
        results.login = { status: 'OK', userId: authData.user.id };
    } catch (error) {
        results.login = { status: 'FAILED', error: error.message };
        writeResults();
        process.exit(1);
    }

    const headers = { 'Authorization': `Bearer ${token}` };

    await checkEndpoint('shifts', `${BASE_URL}/shifts`, headers);
    await checkEndpoint('balances', `${BASE_URL}/shifts/balances`, headers);
    await checkEndpoint('categories', `${BASE_URL}/categories`, headers);
    await checkEndpoint('notifications', `${BASE_URL}/notifications`, headers);
    await checkEndpoint('users', `${BASE_URL}/users`, headers);
    await checkEndpoint('systemConfig', `${BASE_URL}/system-config`, headers);

    writeResults();
    console.log('--- AUDIT COMPLETE ---');
}

async function checkEndpoint(key, url, headers) {
    try {
        const res = await fetch(url, { headers });
        if (res.ok) {
            const data = await res.json();
            const count = Array.isArray(data) ? data.length : (data.data ? data.data.length : (data.users ? data.users.length : 'Obj'));
            results[key] = { status: 'OK', statusCode: res.status, items: count };
        } else {
            const err = await res.text();
            results[key] = { status: 'FAILED', statusCode: res.status, error: err };
        }
    } catch (error) {
        results[key] = { status: 'CRASHED', error: error.message };
    }
}

function writeResults() {
    require('fs').writeFileSync('audit_report.json', JSON.stringify(results, null, 2));
}

main();
