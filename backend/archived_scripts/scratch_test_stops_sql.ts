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

async function testStops(linea: string, directionId: number) {
  const query = `
    WITH TargetTrip AS (
      SELECT t.trip_id, COUNT(*) as num_stops
      FROM gtfs.trips t
      JOIN gtfs.routes r ON t.route_id = r.route_id
      JOIN gtfs.stop_times st ON st.trip_id = t.trip_id
      WHERE r.route_short_name = '${linea}'
      AND t.direction_id = ${directionId}
      GROUP BY t.trip_id
      ORDER BY num_stops DESC
      LIMIT 1
    )
    SELECT 
      st.stop_id as id,
      st.stop_sequence as orden,
      s.stop_name as nombre,
      s.stop_lat as lat,
      s.stop_lon as lng
    FROM gtfs.stop_times st
    JOIN gtfs.stops s ON st.stop_id = s.stop_id
    JOIN TargetTrip tt ON st.trip_id = tt.trip_id
    ORDER BY st.stop_sequence ASC;
  `;
  const res = await sqlDb.raw(query);
  return res.rows;
}

async function run() {
  try {
    const stops = await testStops('306', 0);
    console.log('306 IDA STOPS COUNT:', stops.length);
    if(stops.length > 0) console.log('Sample Stop:', stops[0]);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
