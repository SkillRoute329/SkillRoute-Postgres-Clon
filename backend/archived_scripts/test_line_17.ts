import db from './src/config/database';

async function test() {
  try {
    const routes = await db('gtfs.routes').where('route_short_name', '17').select('route_id', 'route_short_name', 'route_long_name');
    console.log("ROUTES:", routes);

    const trips = await db('gtfs.trips')
      .join('gtfs.routes', 'gtfs.trips.route_id', 'gtfs.routes.route_id')
      .where('gtfs.routes.route_short_name', '17')
      .select('gtfs.trips.route_id', 'direction_id', 'trip_headsign', 'shape_id')
      .limit(10);
    console.log("TRIPS:", trips);
  } catch (err: any) {
    console.error("DB Error:", err.message);
  } finally {
    db.destroy();
  }
}

test();
