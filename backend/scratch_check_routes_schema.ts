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
    const sample = await sqlDb.raw('SELECT * FROM gtfs.routes LIMIT 1');
    console.log('ROUTES COLUMNS:', Object.keys(sample.rows[0]));
    console.log('SAMPLE ROW:', sample.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
