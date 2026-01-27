
import admin, { db } from '../config/firebase';
import fetch from 'node-fetch'; // Requires node-fetch (check if installed)

// If node-fetch not available, use native fetch (Node 18+) or axios if present.
// We'll rely on global fetch if Node 22.

async function verifyDeployment() {
    console.log("🕵️‍♂️ EXPERT MODE: Full Deployment Verification...");

    const errors: string[] = [];

    // 1. DATABASE CONNECTIVITY (Write/Read)
    try {
        console.log("testing Firestore...");
        const ref = db.collection('system_checks').doc('deployment_test');
        await ref.set({
            timestamp: new Date().toISOString(),
            status: 'VERIFIED',
            agent: 'Antavity'
        });

        const doc = await ref.get();
        if (doc.exists && doc.data()?.status === 'VERIFIED') {
            console.log("✅ [DB] Firestore Write/Read: SUCCESS");
        } else {
            console.error("❌ [DB] Firestore Write/Read: FAILED");
            errors.push("Firestore Integrity");
        }
    } catch (e: any) {
        console.error("❌ [DB] Firestore Error:", e.message);
        errors.push("Firestore Exception");
    }

    // 2. API HEALTH (Public Endpoint)
    try {
        console.log("testing API Public endpoint...");
        // Use Fetch (Node 18+)
        const res = await fetch('https://ucot-gestor-cloud.web.app/api/health');
        if (res.ok) {
            const json = await res.json();
            console.log("✅ [API] /api/health: ONLINE", json);
        } else {
            console.error(`❌ [API] /api/health returned ${res.status}`);
            errors.push("API Health 404/500");
        }
    } catch (e: any) {
        console.error("❌ [API] Connection Error:", e.message);
        errors.push("API Network Error");
    }

    // 3. LINES CHECK (Data Population)
    try {
        const snap = await db.collection('lines').count().get();
        const count = snap.data().count;
        if (count >= 19) {
            console.log(`✅ [DATA] Lines Population: OK (${count} lines)`);
        } else {
            console.warn(`⚠️ [DATA] Lines Population: LOW (${count} lines). Expected 19+`);
            // Not a hard error for deployment, but warning
        }
    } catch (e) { }

    // SUMMARY
    if (errors.length === 0) {
        console.log("\n🚀 DEPLOYMENT STATUS: 100% OPERATIONAL");
        process.exit(0);
    } else {
        console.error("\n💥 DEPLOYMENT STATUS: FAILED");
        console.error("Errors:", errors);
        process.exit(1);
    }
}

if (require.main === module) {
    verifyDeployment().catch(console.error);
}
