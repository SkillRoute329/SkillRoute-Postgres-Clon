import db from '../src/config/database';

async function check() {
  try {
    const res = await db.raw(`
      SELECT base_route_id, base_direction_id, competitor_route_id, competitor_direction_id, shared_stops_count 
      FROM gtfs.competitor_overlap 
      ORDER BY shared_stops_count DESC 
      LIMIT 10
    `);
    console.log('Top 10 overlaps:');
    console.table(res.rows);
    
    const count = await db('gtfs.competitor_overlap').count('* as c');
    console.log('Total overlaps found:', count[0].c);
  } catch(e) {
    console.error(e);
  } finally {
    db.destroy();
  }
}
check();
