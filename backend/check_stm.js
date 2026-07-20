const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'skillroute',
  port: 5432
});

async function check() {
  try {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE 'stm%' OR table_name LIKE 'mv_stm%';
    `);
    console.log('Tables found:');
    console.table(res.rows);
    
    const count = await pool.query('SELECT count(*) as c FROM stm_validaciones_mensual').catch(() => ({rows: [{c: 0}]}));
    console.log('Rows in stm_validaciones_mensual:', count.rows[0].c);
  } catch (e) {
    console.error(e.message);
  } finally {
    pool.end();
  }
}
check();
