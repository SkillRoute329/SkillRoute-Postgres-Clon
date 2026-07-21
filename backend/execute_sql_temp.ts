import fs from 'fs';
import path from 'path';
import sqlDb from './src/config/database';

async function run() {
  try {
    const sqlPath = path.join(__dirname, 'src/database/schema_brt_module.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Ejecutando SQL...');
    await sqlDb.raw(sql);
    console.log('Exito!');
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await sqlDb.destroy();
  }
}
run();
