import sqlDb from './src/config/database';

async function checkGtfsLines() {
  try {
    console.log(">>> CONSULTANDO MUESTRAS DE LÍNEAS ACTIVAS EN GTFS...");
    const res = await sqlDb('gtfs.trips')
      .join('gtfs.routes', 'gtfs.trips.route_id', 'gtfs.routes.route_id')
      .select('gtfs.routes.route_short_name as linea', 'gtfs.trips.trip_headsign as headsign', 'gtfs.trips.direction_id')
      .whereIn('gtfs.routes.route_short_name', ['329', '330', '300', '306'])
      .distinct('gtfs.routes.route_short_name', 'gtfs.trips.trip_headsign', 'gtfs.trips.direction_id')
      .orderBy('gtfs.routes.route_short_name', 'gtfs.trips.direction_id');

    console.log("Líneas Encontradas:");
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

checkGtfsLines();
