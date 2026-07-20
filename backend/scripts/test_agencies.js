const knex = require('knex');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const db = knex({ client: 'pg', connection: { connectionString: process.env.DATABASE_URL } });

async function run() {
  try {
    const res = await db.raw("SELECT DISTINCT agency_id FROM gtfs.routes");
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
