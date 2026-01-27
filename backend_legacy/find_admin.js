const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'transformafacil_db',
    password: process.env.DB_PASSWORD || 'admin',
    port: process.env.DB_PORT || 5432,
});

async function findAdmins() {
    try {
        const res = await pool.query('SELECT id, "internalNumber", "firstName", "lastName", role FROM "User" WHERE role = \'Admin\'');
        console.log('Admins found:', res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

findAdmins();
