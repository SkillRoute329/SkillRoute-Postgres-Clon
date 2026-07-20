import db from '../src/config/database';

async function run() {
  try {
    const rows = await db('gtfs.routes')
      .select('route_short_name as codigo', 'route_long_name as nombre')
      .whereIn('route_short_name', ['317', '371', '379', 'PB', 'XA1', 'XA2', 'Pb', 'Xa1', 'Xa2']);
    console.table(rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
