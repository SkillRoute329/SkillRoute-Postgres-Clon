const knex = require('knex');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
  }
});

async function run() {
  const lines = await db('gtfs.agency_routes')
    .where('agency_id', '70')
    .select('route_short_name', 'detection_count')
    .orderBy('detection_count', 'desc');
  
  console.table(lines);
  process.exit(0);
}

run();
