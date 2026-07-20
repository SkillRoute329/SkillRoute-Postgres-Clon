const knex = require('knex');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });
const db = knex({ client: 'pg', connection: { connectionString: process.env.DATABASE_URL } });

async function run() {
  try {
    const query = `
      SELECT DISTINCT route_short_name as codigo
      FROM gtfs.routes
      WHERE route_short_name LIKE 'D%' OR route_short_name = 'XA1' OR route_short_name = 'XA2'
      ORDER BY codigo ASC
    `;
    const res = await db.raw(query);
    console.table(res.rows);
  } catch (e) { console.error(e); } finally { process.exit(0); }
}
run();
