
import fs from 'fs';
import pool from '../src/db';

async function listCategories() {
    try {
        const res = await pool.query('SELECT * FROM "ShiftCategory" ORDER BY id ASC');
        const output = JSON.stringify(res.rows, null, 2);
        fs.writeFileSync('prisma/debug_output.txt', output);
        console.log('Done writing');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

listCategories();
