
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:4000/api'; // Backend URL (not Vite proxy)

async function main() {
    try {
        console.log('1. Logging in as 329...');
        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ internalNumber: '329', password: '123456' })
        });

        if (!loginRes.ok) {
            console.error('Login Failed:', await loginRes.text());
            return;
        }

        const authData = await loginRes.json();
        const token = authData.token;
        console.log('Login OK. Token obtained.');
        console.log('User Tenant:', authData.user.tenantId || 'Inside Token');

        console.log('\n2. Fetching Shifts...');
        const shiftRes = await fetch(`${BASE_URL}/shifts`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!shiftRes.ok) {
            console.error('Shifts Request Failed:', shiftRes.status, await shiftRes.text());
            return;
        }

        const shifts = await shiftRes.json();
        console.log('Shifts Response Status:', shiftRes.status);
        console.log('Shifts Count:', Array.isArray(shifts) ? shifts.length : `Pagination: ${shifts.data.length}`);

        if (Array.isArray(shifts) && shifts.length > 0) {
            console.log('First Shift:', JSON.stringify(shifts[0], null, 2));
        } else if (shifts.data && shifts.data.length > 0) {
            console.log('First Shift:', JSON.stringify(shifts.data[0], null, 2));
        }

    } catch (error) {
        console.error('Script Error:', error);
    }
}

main();
