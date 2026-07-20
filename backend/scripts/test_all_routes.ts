import db from '../src/config/database';

async function run() {
  try {
    const rows = await db('gtfs.routes').distinct('route_short_name');
    console.log(rows.map(r => r.route_short_name).sort().join(', '));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
