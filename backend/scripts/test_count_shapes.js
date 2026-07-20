const knex = require('knex');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });
const db = knex({ client: 'pg', connection: { connectionString: process.env.DATABASE_URL } });
async function run() {
  try {
    const res1 = await db.raw("SELECT count(*) FROM gtfs.shapes");
    const res2 = await db.raw("SELECT count(*) FROM public.gtfs_shapes");
    console.log("gtfs.shapes:", res1.rows[0].count);
    console.log("public.gtfs_shapes:", res2.rows[0].count);
  } catch (e) { console.error(e); } finally { process.exit(0); }
}
run();
