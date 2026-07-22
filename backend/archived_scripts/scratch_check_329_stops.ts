import sqlDb from './src/config/database';

async function check329() {
  try {
    console.log(">>> INVESTIGANDO RUTA 329 PARA PUNTOS DE CONTROL...");
    
    // Buscar el trip más largo para 329 IDA (1) y VUELTA (0)
    const trips = await sqlDb('gtfs.trips as t')
      .join('gtfs.routes as r', 't.route_id', 'r.route_id')
      .where('r.route_short_name', '329')
      .select('t.trip_id', 't.direction_id', 't.trip_headsign')
      .limit(10);
    
    for (const trip of trips) {
      const stops = await sqlDb('gtfs.stop_times as st')
        .join('gtfs.stops as s', 'st.stop_id', 's.stop_id')
        .where('st.trip_id', trip.trip_id)
        .select('s.stop_name', 'st.stop_sequence', 'st.shape_dist_traveled')
        .orderBy('st.stop_sequence');
      
      console.log(`\nTrip ${trip.trip_id} (${trip.trip_headsign}, Dir: ${trip.direction_id}):`);
      const sampleStops = [stops[0], stops[Math.floor(stops.length/4)], stops[Math.floor(stops.length/2)], stops[Math.floor(stops.length*3/4)], stops[stops.length-1]];
      console.log(JSON.stringify(sampleStops, null, 2));
    }

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

check329();
