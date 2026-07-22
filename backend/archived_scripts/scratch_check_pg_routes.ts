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
    // List actual short_names present in table
    const res = await sqlDb.raw(`
      SELECT DISTINCT route_short_name 
      FROM gtfs.routes 
      ORDER BY route_short_name ASC
    `);
    console.log('AVAILABLE ROUTE SHORT NAMES IN PG:');
    console.log(res.rows.map((r: any) => r.route_short_name).join(', '));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
