import sqlDb from './src/config/database';

async function checkGtfsLines() {
  try {
    console.log(">>> CONSULTANDO MUESTRAS DE LÍNEAS ACTIVAS EN GTFS PARA AGENCIA 70 (UCOT)...");
    const res = await sqlDb('gtfs.trips')
      .join('gtfs.routes', 'gtfs.trips.route_id', 'gtfs.routes.route_id')
      .select('gtfs.routes.route_short_name as linea', 'gtfs.trips.trip_headsign as headsign')
      .where('gtfs.routes.agency_id', '70')
      .distinct('gtfs.routes.route_short_name', 'gtfs.trips.trip_headsign')
      .orderBy('gtfs.routes.route_short_name');

    console.log("Líneas Encontradas:");
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

checkGtfsLines();
