
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:4000/api'; // Testing local first, or change to production URL

async function main() {
    console.log('🔥 [STRESS-TEST] Initializing Sentinel Protocol...');

    // 1. Get Qualified User
    const user = await prisma.user.findFirst({
        where: { role: { in: ['Admin', 'SuperAdmin'] } }
    });

    if (!user) {
        console.error('❌ No Admin user found for stress test.');
        process.exit(1);
    }

    // 2. Forge Token (Bypassing Login Network Trip for pure logic test)
    const SECRET = process.env.JWT_SECRET;
    if (!SECRET) {
        console.error('❌ JWT_SECRET missing in .env');
        process.exit(1);
    }

    const token = jwt.sign(
        { id: user.id, tenantId: user.tenantId, role: user.role, internalNumber: user.internalNumber },
        SECRET,
        { expiresIn: '1h' }
    );

    console.log(`✅ Sentinel Identity: ${user.fullName} (${user.internalNumber})`);
    console.log(`🔑 Token Forged. Starting Artillery...`);

    // 3. Prepare Payload
    // We need a valid vehicle ID
    const vehicle = await prisma.vehicle.findFirst({ where: { tenantId: user.tenantId } });
    if (!vehicle) {
        console.error('❌ No vehicle found to inspect.');
        process.exit(1);
    }

    const payload = {
        vehicleId: vehicle.id,
        type: "StartShift",
        odometer: 50000,
        fuelLevel: "Full",
        status: "OK",
        notes: "Stress Test Automated Entry",
        // Malicious Injection Attempt (Should be ignored by controller)
        userId: 999999,
        tenantId: 999999
    };

    // 4. Fire 50 Requests
    const REQUEST_COUNT = 50;
    const promises = [];
    const startTime = Date.now();

    console.log(`🚀 Launching ${REQUEST_COUNT} concurrent requests against /fleet/inspections...`);

    for (let i = 0; i < REQUEST_COUNT; i++) {
        promises.push(
            fetch(`${API_URL}/fleet/inspections`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...payload,
                    notes: `Stress Test Entry #${i} - ${new Date().toISOString()}`
                })
            }).then(async res => {
                const data: any = await res.json().catch(() => ({}));
                return { status: res.status, data };
            })
        );
    }

    // 5. Analyze Results
    const results = await Promise.all(promises);
    const endTime = Date.now();

    const successes = results.filter(r => r.status === 201).length;
    const failures = results.filter(r => r.status !== 201);

    console.log('\n📊 [REPORT] Stress Test Results:');
    console.log(`   Total Requests: ${REQUEST_COUNT}`);
    console.log(`   Time Taken: ${(endTime - startTime) / 1000}s`);
    console.log(`   ✅ Success: ${successes}`);
    console.log(`   ❌ Failures: ${failures.length}`);

    if (failures.length > 0) {
        console.log('\n⚠️ Failure Sample:');
        console.log(JSON.stringify(failures[0], null, 2));
    }

    // 6. Verify Integrity
    // Check if any record was created with userId 999999
    const corruptedRecords = await prisma.inspection.count({
        where: { userId: 999999 }
    });

    if (corruptedRecords > 0) {
        console.error(`\n💀 CRITICAL: IDOR VULNERABILITY DETECTED! Found ${corruptedRecords} records with injected ID.`);
        process.exit(1);
    } else {
        console.log(`\n🛡️ INTEGRITY CHECK PASSED: No IDOR injections found. Controller ignored malicious payload.`);
    }

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
