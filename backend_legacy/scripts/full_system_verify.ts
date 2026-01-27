import fetch from 'node-fetch'; // Standard fetch might be available in Node 22 but let's use global if strict
import { strict as assert } from 'assert';

// Allow users to pass URL as argument, default to localhost
const BASE_URL = process.argv[2] || 'http://localhost:3000/api';

console.log(`\n🚀 INICIANDO VERIFICACIÓN DE SISTEMA COMPLETO`);
console.log(`🎯 TARGET: ${BASE_URL}`);
console.log(`--------------------------------------------------\n`);

async function runTest() {
    try {
        // 1. HEALTH CHECK
        console.log('1️⃣  [TEST] Health Check...');
        const healthRes = await fetch(`${BASE_URL}/health`);
        if (!healthRes.ok) throw new Error(`Health check failed: ${healthRes.statusText}`);
        const healthData = await healthRes.json();
        console.log(`   ✅ OK! Version: ${healthData.version || 'Unknown'}`);

        // 2. ADMIN LOGIN (Seed Creds)
        console.log('\n2️⃣  [TEST] Login Admin (9999)...');
        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ internalNumber: '9999', password: 'admin123' })
        });

        if (loginRes.status === 401) {
            console.warn('   ⚠️ Login Failed (401). Seed might have different password or DB not ready.');
            console.warn('   Assuming "admin" as backup password...');
            // Retry with 'admin' just in case old seed used it
            const loginRetry = await fetch(`${BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ internalNumber: '9999', password: 'admin' })
            });
            if (!loginRetry.ok) throw new Error('Admin login completely failed.');
            var adminData = await loginRetry.json();
        } else if (!loginRes.ok) {
            const err = await loginRes.text();
            console.error(`❌ Login Error Details: Status ${loginRes.status} - ${loginRes.statusText}`);
            console.error(`❌ Response Body: ${err}`);
            throw new Error(`Login failed: ${err}`);
        } else {
            console.log('original login ok');
            var adminData = await loginRes.json();
        }

        const ADMIN_TOKEN = adminData.token;
        console.log(`   ✅ OK! Admin Token acquired.`);

        // 3. CREATE NEW USER (Driver)
        const newUserId = Math.floor(Math.random() * 10000).toString();
        const testUser = {
            internalNumber: newUserId,
            firstName: 'Test',
            lastName: 'Driver',
            email: `test${newUserId}@example.com`,
            password: 'password123',
            role: 'User',
            tenantId: 1
        };

        console.log(`\n3️⃣  [TEST] Creating Test User (${testUser.internalNumber})...`);
        const createUserRes = await fetch(`${BASE_URL}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            },
            body: JSON.stringify(testUser)
        });

        if (!createUserRes.ok) {
            const txt = await createUserRes.text();
            throw new Error(`User creation failed: ${txt}`);
        }
        const createdUser = await createUserRes.json();
        console.log(`   ✅ OK! User created with ID: ${createdUser.id}`);

        // 4. LOGIN AS NEW USER
        console.log(`\n4️⃣  [TEST] Login as New Driver...`);
        const driverLoginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ internalNumber: testUser.internalNumber, password: testUser.password })
        });
        if (!driverLoginRes.ok) throw new Error('Driver login failed');
        const driverData = await driverLoginRes.json();
        const DRIVER_TOKEN = driverData.token;
        console.log(`   ✅ OK! Driver Logged in.`);

        // 5. CREATE SHIFT
        console.log(`\n5️⃣  [TEST] Creating Shift...`);
        const shiftData = {
            date: new Date().toISOString(),
            time: '08:00',
            carNumber: '101',
            line: '505',
            categoryId: 1, // Assumes category 1 exists from seed
            serviceNumber: '1001',
            totalValue: 50000
        };

        const createShiftRes = await fetch(`${BASE_URL}/shifts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DRIVER_TOKEN}`
            },
            body: JSON.stringify(shiftData)
        });

        if (!createShiftRes.ok) {
            const txt = await createShiftRes.text();
            throw new Error(`Shift creation failed: ${txt}`);
        }
        const createdShift = await createShiftRes.json();
        console.log(`   ✅ OK! Shift Created ID: ${createdShift.id}`);

        // 6. VERIFY SHIFT (Admin View)
        console.log(`\n6️⃣  [TEST] Admin verifying shift...`);
        const listShiftRes = await fetch(`${BASE_URL}/shifts`, {
            headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
        });
        const shifts = await listShiftRes.json();
        // Handle pagination response vs array
        const shiftArray = Array.isArray(shifts) ? shifts : shifts.data;

        const found = shiftArray.find((s: any) => s.id === createdShift.id);
        if (!found) throw new Error('Shift not found in admin list');
        console.log(`   ✅ OK! Shift found in list.`);

        // 7. CLEANUP (Delete User - cascades/soft deletes shifts usually, or we verify delete shift first)
        console.log(`\n7️⃣  [TEST] Cleanup: Deleting User...`);
        const deleteUserRes = await fetch(`${BASE_URL}/users/${createdUser.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
        });
        if (!deleteUserRes.ok) console.warn('   ⚠️ Warning: Failed to delete test user');
        else console.log(`   ✅ OK! Test user deleted.`);

        console.log(`\n==================================================`);
        console.log(`🎉 VERIFICACIÓN COMPLETADA EXITOSAMENTE`);
        console.log(`El sistema está operativo, acepta usuarios, autentica y procesa datos.`);
        console.log(`==================================================`);

    } catch (error) {
        console.error(`\n❌ [FATAL] FINAL TEST FAILED`);
        console.error(error);
        process.exit(1);
    }
}

runTest();
