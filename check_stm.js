const knex = require('knex');
const config = require('./backend/src/config/database');
const db = knex(config);

async function check() {
  try {
    const res = await db.raw(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE 'stm%' OR table_name LIKE 'mv_stm%';
    `);
    console.log('Tables found:');
    console.table(res.rows);
    
    const count = await db('stm_validaciones_mensual').count('* as c').catch(() => [{c: 0}]);
    console.log('Rows in stm_validaciones_mensual:', count[0].c);
  } catch (e) {
    console.error(e.message);
  } finally {
    db.destroy();
  }
}
check();
