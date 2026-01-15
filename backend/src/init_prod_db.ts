
import { runMigration, seedDatabase } from './setup_db';
import 'dotenv/config';

async function init() {
    console.log('🚀 [INIT] Forcing Production Database Initialization...');

    // 1. Force Migration
    await runMigration(true); // check the 'true' flag we just added

    // 2. Force Seed
    await seedDatabase();

    console.log('🎉 [INIT] Database initialization sequence complete.');
    process.exit(0);
}

init().catch(err => {
    console.error('🔥 [FATAL] Init script failed:', err);
    process.exit(1);
});
