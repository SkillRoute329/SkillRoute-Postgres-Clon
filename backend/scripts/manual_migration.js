const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load env from parent directory
dotenv.config({ path: path.join(__dirname, '../.env') });

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function migrate() {
    try {
        await client.connect();
        console.log('Connected to DB');

        // Add endTime to Shift
        try {
            await client.query('ALTER TABLE "Shift" ADD COLUMN "endTime" VARCHAR(5)');
            console.log('Added endTime to Shift');
        } catch (e) {
            console.log('endTime error (likely exists):', e.message);
        }

        // Add extraHourValue to ShiftCategory
        try {
            await client.query('ALTER TABLE "ShiftCategory" ADD COLUMN "extraHourValue" DECIMAL(10, 2) DEFAULT 0');
            console.log('Added extraHourValue to ShiftCategory');
        } catch (e) {
            console.log('extraHourValue error (likely exists):', e.message);
        }

        // Update existing nulls
        await client.query('UPDATE "ShiftCategory" SET "extraHourValue" = 0 WHERE "extraHourValue" IS NULL');
        console.log('Updated null extraHourValues');

        console.log('Migration complete');
    } catch (err) {
        console.error('Migration failed', err);
    } finally {
        await client.end();
    }
}

migrate();
