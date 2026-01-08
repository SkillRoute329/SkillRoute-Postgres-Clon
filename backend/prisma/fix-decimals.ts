import pool from '../src/db';

async function fixDecimalPrecision() {
    console.log('--- Fixing Decimal Precision ---');
    try {
        const queries = [
            'ALTER TABLE "ShiftCategory" ALTER COLUMN "baseValue" TYPE DECIMAL(10,2)',
            'ALTER TABLE "ShiftCategory" ALTER COLUMN "extraHourValue" TYPE DECIMAL(10,2)',
            'ALTER TABLE "Shift" ALTER COLUMN "extraHours" TYPE DECIMAL(5,2)',
            'ALTER TABLE "Shift" ALTER COLUMN "tipValue" TYPE DECIMAL(10,2)',
            'ALTER TABLE "Shift" ALTER COLUMN "totalValue" TYPE DECIMAL(10,2)',
            'ALTER TABLE "Shift" ALTER COLUMN "transformaFacilDiscount" TYPE DECIMAL(10,2)',
            'ALTER TABLE "ShiftTransaction" ALTER COLUMN "amount" TYPE DECIMAL(10,2)',
        ];

        for (const query of queries) {
            await pool.query(query);
            console.log(`✓ ${query}`);
        }

        console.log('Decimal precision fixed successfully!');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

fixDecimalPrecision();
