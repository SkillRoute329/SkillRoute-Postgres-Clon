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
      SELECT route_id, route_short_name, route_long_name 
      FROM gtfs.routes 
      WHERE route_short_name = '306' OR route_short_name = '17'
    `);
    console.log('MATCHING ROUTES:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
