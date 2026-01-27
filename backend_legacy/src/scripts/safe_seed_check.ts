
import { PrismaClient } from '@prisma/client';
import { IngestLegacyData } from '../workers/ingestLegacyData';

const prisma = new PrismaClient();

async function safeSeed() {
    console.log("🛡️ SAFE SEED PROTOCOL INITIATED");

    try {
        // 1. SAFETY CHECK CHECK
        const tripCount = await prisma.tripSchedule.count();
        console.log(`📊 Current System State: ${tripCount} TripSchedules found.`);

        if (tripCount > 5000) {
            console.log("⚠️ Large dataset detected (>5000). Use 'legacy-import' for appending instead of full seed to avoid timeouts.");
            // We proceed anyway because we are UPSERTING, but we log the warning.
        }

        if (tripCount > 0) {
            console.log("✅ Data exists. Entering UPDATE/APPEND mode (No Delete).");
        } else {
            console.log("ℹ️ Database appears empty. Entering INITIAL LOAD mode.");
        }

        // 2. TRIGGER INGESTION
        // This helper (written earlier) already uses UPSERT logic.
        // It reads from backend/legacy_data which should be populated in the repo or volume.
        console.log("🚀 Starting Ingestion Worker...");
        await IngestLegacyData();

        console.log("✅ Safe Seed Completed.");

    } catch (e) {
        console.error("❌ Safe Seed Failed:", e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

safeSeed();
