import fs from 'fs';
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const sqlPath = path.join(__dirname, 'src', 'database', 'schema_fase6_listero.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('Schema aplicado correctamente.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}
run();
