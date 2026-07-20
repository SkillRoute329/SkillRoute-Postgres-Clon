const knex = require('knex');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const db = knex({ client: 'pg', connection: { connectionString: process.env.DATABASE_URL } });

db.raw("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'gtfs' AND table_name = 'routes'")
  .then(res => { console.table(res.rows); process.exit(0); })
  .catch(console.error);
