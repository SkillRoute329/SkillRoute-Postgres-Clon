
import pool from '../src/db';

async function checkSchema() {
    try {
        console.log('--- User Columns ---');
        const userRes = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'User';
    `);
        console.log(JSON.stringify(userRes.rows, null, 2));

        console.log('--- Shift Columns ---');
        const shiftRes = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'Shift';
    `);
        console.log(JSON.stringify(shiftRes.rows, null, 2));

    } catch (error) {
        console.error(error);
    } finally {
        await pool.end();
    }
}

checkSchema();
