const knex = require('knex');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const db = knex({
  client: 'pg',
  connection: { connectionString: process.env.DATABASE_URL }
});

db.raw("SELECT table_name, table_schema FROM information_schema.tables WHERE table_schema IN ('public', 'gtfs')")
  .then(res => { console.table(res.rows); process.exit(0); })
  .catch(console.error);
