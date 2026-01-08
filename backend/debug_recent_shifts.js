
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    try {
        console.log('--- LAST 5 SHIFTS ---');
        const res = await pool.query(`
        SELECT id, "serviceNumber", "status", "tenantId", "assignedTo", "createdBy", "date", "deletedAt"
        FROM "Shift"
        ORDER BY "createdAt" DESC
        LIMIT 5
    `);
        console.log(JSON.stringify(res.rows, null, 2));

        if (res.rowCount > 0) {
            console.log('NOTE: createdBy should match the User ID');
        }

    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

main();
