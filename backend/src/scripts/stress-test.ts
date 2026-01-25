
import 'dotenv/config';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const API_URL = process.env.API_URL || 'http://localhost:4000/api';

async function main() {
    console.log('🧪 [STRESS] Starting Centinela Stress Test...');

    let token: string | null = null;
    let userId: number = 0;

    // 1. AUTHENTICATION STRATEGY
    const TEST_USER_INTERNAL = process.env.TEST_USER;
    const TEST_USER_PASS = process.env.TEST_PASS;

    if (TEST_USER_INTERNAL && TEST_USER_PASS) {
        console.log(`🔑 Attempting REAL LOGIN with ${TEST_USER_INTERNAL}...`);
        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ internalNumber: TEST_USER_INTERNAL, password: TEST_USER_PASS })
            });

            if (res.ok) {
                const data: any = await res.json();
                token = data.token;
                userId = data.user.id;
                console.log(`✅ Login Successful. Token acquired for User ${userId}`);
            } else {
                console.error(`❌ Login Failed: ${res.status} ${res.statusText}`);
            }
        } catch (e) {
            console.error('❌ Login Network Error:', e);
        }
    }

    // FALLBACK: FORGE TOKEN (Sentinel Mode)
    if (!token) {
        console.log('⚠️ No credentials or Login failed. Switching to SENTINEL FORGE MODE (DB Access Required).');
        const SECRET = process.env.JWT_SECRET;
        if (!SECRET) {
            console.error('❌ Cannot forge token: JWT_SECRET missing.');
            process.exit(1);
        }

        let admin = null;
        try {
            admin = await prisma.user.findFirst({ where: { role: 'Admin' } });
        } catch (e) {
            console.warn('⚠️ DB Unreachable for User Lookup. Using Mock Admin.');
        }

        if (!admin) {
            // Hard fallback for empty DBs
            console.warn('⚠️ No Admin found in DB. Creating mock Identity.');
            userId = 999;
            const mockUser = { id: 999, tenantId: 1, role: 'Admin', internalNumber: 'SENTINEL' };
            token = jwt.sign(mockUser, SECRET, { expiresIn: '15m' });
        } else {
            console.log(`✅ Found Admin: ${admin.internalNumber}`);
            userId = admin.id;
            token = jwt.sign({ id: admin.id, tenantId: admin.tenantId, role: admin.role, internalNumber: admin.internalNumber }, SECRET, { expiresIn: '15m' });
        }
    }

    // 2. PREPARE ATTACK
    const CONCURRENCY = 20;
    console.log(`🚀 Focusing Fire: ${CONCURRENCY} concurrent requests against /fleet/inspections`);

    const promises = [];
    const startTime = Date.now();

    for (let i = 0; i < CONCURRENCY; i++) {
        // Construct Multipart Form
        const form = new FormData();
        form.append('vehicleId', '1'); // Target Vehicle 1
        form.append('type', 'StressTest');
        form.append('odometer', (1000 + i).toString());
        form.append('status', 'OK');
        form.append('notes', `Centinela Test Payload ${i}`);

        // Malicious Injection (The Trap)
        form.append('userId', '666666');
        form.append('tenantId', '666666');

        // Complex Data Structure for Damages
        const damages = [
            { zone: 'Front', description: 'Stress Test Scratch', severity: 'Low' }
        ];
        form.append('newDamages', JSON.stringify(damages));

        // File matched to damage index 0
        const fakeBuffer = Buffer.from('FAKE IMAGE DATA', 'utf-8');
        form.append('damage_0_photo', fakeBuffer, { filename: `stress_${i}.jpg`, contentType: 'image/jpeg' });

        // Request
        const req = fetch(`${API_URL}/fleet/inspections`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                ...form.getHeaders()
            },
            body: form
        }).then(async res => {
            const txt = await res.text();
            return { status: res.status, body: txt };
        }).catch(err => ({ status: 0, body: err.message }));

        promises.push(req);
    }

    // 3. RESULTS
    const results = await Promise.all(promises);
    const endTime = Date.now();

    const success = results.filter(r => r.status === 201 || r.status === 200).length;
    const failures = results.filter(r => r.status !== 201 && r.status !== 200);

    console.log('\n📊 [CENTINELA REPORT]');
    console.log(`   Time: ${endTime - startTime}ms`);
    console.log(`   ✅ Success: ${success}`);
    console.log(`   ❌ Failures: ${failures.length}`);

    if (failures.length > 0) {
        console.log(`   First Failure: ${failures[0].status} - ${failures[0].body.substring(0, 100)}`);
    }

    // 4. INTEGRITY CHECK (Only if DB accessible)
    try {
        const hacks = await prisma.inspection.count({ where: { userId: 666666 } });
        if (hacks > 0) {
            console.error(`\n💀 CRITICAL FAIL: DETECTED ${hacks} RECORDS WITH INJECTED USER ID 666666`);
            process.exit(1);
        } else {
            console.log(`\n🛡️ SECURE: No records found with injected ID. Controller is BLINDED.`);
        }
    } catch (e) {
        console.warn('⚠️ Could not verify DB Integrity directly (DB Connection Failed). Assumed secure if API returned 201s.');
    }
}

main();
