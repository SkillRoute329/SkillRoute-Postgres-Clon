
// import pool from '../src/db';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: 'postgresql://postgres:admin123@127.0.0.1:5432/transformafacil_db'
});

async function migrate() {
    try {
        console.log('Starting Manual Migration (Defined connection)...');

        // 1. Create SystemConfig Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "SystemConfig" (
                "key" TEXT NOT NULL,
                "value" TEXT NOT NULL,
                "description" TEXT,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
            );
        `);
        console.log('✅ SystemConfig table created/verified.');

        // 2. Add baseValue to ShiftCategory if not exists
        try {
            await pool.query(`
                ALTER TABLE "ShiftCategory" 
                ADD COLUMN "baseValue" DECIMAL(10,2) NOT NULL DEFAULT 0;
            `);
            console.log('✅ Added baseValue to ShiftCategory');
        } catch (e: any) {
            if (e.code === '42701') { // duplicate_column
                console.log('ℹ️ baseValue already exists in ShiftCategory');
            } else {
                throw e;
            }
        }

        console.log('Migration Completed Successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration Failed:', error);
        process.exit(1);
    }
}

migrate();
