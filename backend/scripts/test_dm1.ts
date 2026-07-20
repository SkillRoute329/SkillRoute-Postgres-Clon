import db from '../src/config/database';

async function run() {
  try {
    const rows = await db('gtfs.routes')
      .select('route_short_name as codigo', 'route_long_name as nombre')
      .whereRaw('UPPER(route_short_name) LIKE ?', ['%DM%']);
    console.table(rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
