
import pool from '../src/db';

async function verifyAdminPayout() {
    try {
        console.log('--- Debugging Transforma Facil Shifts ---');

        // 1. List all shifts marked as Transforma Facil
        const rawShiftsQuery = `
            SELECT id, "serviceNumber", "status", "totalValue", "transformaFacil", "transformaFacilDiscount"
            FROM "Shift"
            WHERE "transformaFacil" = true;
        `;
        const rawRes = await pool.query(rawShiftsQuery);
        console.log('Raw Transforma Facil Shifts:', rawRes.rows);

        // 2. Run the exact calculation query used in shiftController
        const calcQuery = `
            SELECT COALESCE(SUM("totalValue" - COALESCE("transformaFacilDiscount", 0)), 0) as total_liability
            FROM "Shift" 
            WHERE "transformaFacil" = true 
            AND ("status" = 'Assigned' OR "status" = 'Public' OR "status" = 'Created');
        `;
        const calcRes = await pool.query(calcQuery);
        console.log('Calculated Liability (A Cubrir):', calcRes.rows[0]);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

verifyAdminPayout();
