const knex = require('knex');
const sqlDb = knex({
  client: 'pg',
  connection: {
    connectionString: 'postgresql://postgres:I0SAv9zhoQDUfTPc7L+KmkAw@localhost:5432/skillroute_master'
  }
});

async function run() {
  try {
    const shapes = await sqlDb('gtfs.shapes').count();
    const routes = await sqlDb('gtfs.routes').count();
    console.log('--- GTFS SQL DATASET REPORT ---');
    console.log('gtfs.shapes count:', shapes[0]);
    console.log('gtfs.routes count:', routes[0]);
    
    // Veamos una muestra de las líneas de la empresa 70
    const ucotLines = await sqlDb('gtfs.routes')
      .whereRaw("route_short_name ~ '^(3[0-9]{2}|L)'")
      .select('route_short_name')
      .distinct()
      .limit(5);
    console.log('Sample UCOT lines in DB:', ucotLines.map(l => l.route_short_name));
    
  } catch (err) {
    console.error('Error querying GTFS dataset:', err);
  } finally {
    await sqlDb.destroy();
  }
}
run();
