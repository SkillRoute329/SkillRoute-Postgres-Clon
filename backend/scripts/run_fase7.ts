import fs from 'fs';
import path from 'path';
import db from '../src/config/database';

async function run() {
  try {
    const sqlPath = path.join(__dirname, '../src/database/schema_fase7_intelligence.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Running Fase 7 Migration...');
    await db.raw(sql);
    console.log('Migration successful!');
    
  } catch (err: any) {
    console.error('Error running migration:', err.message);
  } finally {
    await db.destroy();
  }
}

run();
