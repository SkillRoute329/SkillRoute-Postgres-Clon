import db from '../src/config/database';

async function run() {
  try {
    const rows = await db('gtfs.routes')
      .select('route_short_name as codigo', 'route_long_name as nombre', 'agency_id')
      .whereIn('route_short_name', ['L31', 'L32', 'L33', 'D8', 'Ce1', 'DM1']);
    console.table(rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
