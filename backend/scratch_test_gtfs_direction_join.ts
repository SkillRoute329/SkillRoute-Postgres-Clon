import sqlDb from './src/config/database';

async function run() {
  try {
    console.log("--- Testing GTFS validation classification by direction for line 329 ---");
    const stopsByDirection = await sqlDb('gtfs.stop_times as st')
      .join('gtfs.trips as t', 'st.trip_id', 't.trip_id')
      .join('gtfs.stops as s', 'st.stop_id', 's.stop_id')
      .join('gtfs.routes as r', 't.route_id', 'r.route_id')
      .where('r.route_short_name', '329')
      .distinct('s.stop_code', 't.direction_id')
      .orderBy('t.direction_id');

    console.log(`Found ${stopsByDirection.length} distinct stop/direction pairs.`);
    
    const countDir0 = stopsByDirection.filter((d: any) => d.direction_id === 0).length;
    const countDir1 = stopsByDirection.filter((d: any) => d.direction_id === 1).length;
    console.log(`Direction 0 (IDA): ${countDir0} stops`);
    console.log(`Direction 1 (VUELTA): ${countDir1} stops`);
    
    const sample0 = stopsByDirection.filter((d: any) => d.direction_id === 0).slice(0, 3).map((d: any) => d.stop_code);
    const sample1 = stopsByDirection.filter((d: any) => d.direction_id === 1).slice(0, 3).map((d: any) => d.stop_code);
    console.log(`Sample IDA stops: ${sample0}`);
    console.log(`Sample VUELTA stops: ${sample1}`);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
