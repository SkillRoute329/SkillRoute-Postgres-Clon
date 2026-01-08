import pool from '../src/db';

async function fixTimeColumn() {
    console.log('--- Fixing time column type ---');
    try {
        // Change time column from TIMESTAMP to VARCHAR(5) 
        await pool.query('ALTER TABLE "Shift" ALTER COLUMN "time" TYPE VARCHAR(5) USING to_char("time", \'HH24:MI\')');
        console.log('✓ Changed time column to VARCHAR(5)');

        // Change date column to DATE type
        await pool.query('ALTER TABLE "Shift" ALTER COLUMN "date" TYPE DATE');
        console.log('✓ Changed date column to DATE');

        console.log('Shift table updated successfully!');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

fixTimeColumn();
