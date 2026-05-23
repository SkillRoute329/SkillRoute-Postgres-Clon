import sqlDb from './src/config/database';

async function checkAgencies() {
  try {
    console.log(">>> CONSULTANDO AGENCIAS EN GTFS...");
    const res = await sqlDb('gtfs.agency').select('*');
    console.log(JSON.stringify(res, null, 2));

    console.log("\n>>> CONSULTANDO CONTEO DE TRIPS POR AGENCIA...");
    const counts = await sqlDb('gtfs.trips')
      .join('gtfs.routes', 'gtfs.trips.route_id', 'gtfs.routes.route_id')
      .select('gtfs.routes.agency_id')
      .count('gtfs.trips.trip_id as count')
      .groupBy('gtfs.routes.agency_id');
    console.log(JSON.stringify(counts, null, 2));

    console.log("\n>>> MUESTRA DE RUTAS...");
    const routes = await sqlDb('gtfs.routes').select('*').limit(10);
    console.log(JSON.stringify(routes, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

checkAgencies();
