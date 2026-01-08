
import pool from '../src/db';

async function migrate() {
    try {
        console.log('--- Adding endTime column to Shift table ---');
        await pool.query(`
      ALTER TABLE "Shift" 
      ADD COLUMN IF NOT EXISTS "endTime" VARCHAR(5);
    `);
        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

migrate();
