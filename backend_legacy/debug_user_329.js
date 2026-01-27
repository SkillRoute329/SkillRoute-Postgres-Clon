
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    try {
        const res = await pool.query('SELECT id, "internalNumber", "role", "isActive", "tenantId", "passwordHash" FROM "User" WHERE "internalNumber" = $1', ['329']);
        if (res.rowCount === 0) {
            console.log('User 329 NOT FOUND');
        } else {
            const u = res.rows[0];
            console.log('User Found:', {
                id: u.id,
                internalNumber: u.internalNumber,
                role: u.role,
                isActive: u.isActive,
                tenantId: u.tenantId,
                hasPassword: !!u.passwordHash,
                passwordLength: u.passwordHash ? u.passwordHash.length : 0
            });

            // Check if tenant exists
            if (u.tenantId) {
                const tRes = await pool.query('SELECT * FROM "Tenant" WHERE id = $1', [u.tenantId]);
                console.log('Tenant Exists:', tRes.rowCount > 0);
            } else {
                console.log('User has NO tenantId!');
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

main();
