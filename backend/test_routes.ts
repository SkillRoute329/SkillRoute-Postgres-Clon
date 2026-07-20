import db from './src/config/database';

async function test() {
  try {
    const res = await db('gtfs.routes').where('agency_id', '70').select('route_id', 'route_short_name', 'route_long_name');
    console.log(JSON.stringify(res, null, 2));
  } catch (err: any) {
    console.error("DB Error:", err.message);
  } finally {
    db.destroy();
  }
}

test();
