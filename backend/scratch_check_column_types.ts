import knex from 'knex';

const sqlDb = knex({
  client: 'pg',
  connection: {
    host: '127.0.0.1',
    user: 'postgres',
    password: 'I0SAv9zhoQDUfTPc7L+KmkAw',
    database: 'skillroute_master',
  }
});

async function run() {
  try {
    const res = await sqlDb.raw(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'gtfs' AND table_name = 'shapes'
    `);
    console.log('SHAPES TABLE COLUMNS TYPES:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
