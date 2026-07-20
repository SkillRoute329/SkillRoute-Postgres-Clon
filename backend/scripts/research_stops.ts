import sqlDb from '../src/config/database';

async function research() {
  try {
    // Buscar la parada 1567
    const stop = await sqlDb('gtfs.stops').where('stop_code', '1567').orWhere('stop_id', '1567').first();
    console.log('Stop 1567:', stop);

    // Buscar viajes de la linea 127
    const route127 = await sqlDb('gtfs.routes').where('route_short_name', '127').select('route_id');
    const routeIds = route127.map(r => r.route_id);

    // En que direccion(es) de la linea 127 se sirve la parada 1567?
    const stopTimes = await sqlDb('gtfs.stop_times as st')
      .join('gtfs.trips as t', 'st.trip_id', 't.trip_id')
      .whereIn('t.route_id', routeIds)
      .andWhere('st.stop_id', stop ? stop.stop_id : '1567')
      .select('t.direction_id')
      .distinct();
    
    console.log('Direction IDs for stop 1567 on route 127:', stopTimes);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
research();
