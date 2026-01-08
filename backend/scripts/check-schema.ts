
import pool from '../src/db';

async function checkSchema() {
    try {
        console.log('--- Checking User Table Schema ---');
        const userRes = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'User';
    `);
        console.table(userRes.rows);

        console.log('\n--- Checking Shift Table Schema ---');
        const shiftRes = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'Shift';
    `);
        console.table(shiftRes.rows);

    } catch (error) {
        console.error('Error checking schema:', error);
    } finally {
        await pool.end();
    }
}

checkSchema();
