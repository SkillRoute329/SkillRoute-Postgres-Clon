import sqlDb from './src/config/database';

async function run() {
  const r = await sqlDb.raw(`
    SELECT base_route_id, base_direction_id, competitor_route_id, competitor_direction_id, shared_stops_count 
    FROM gtfs.competitor_overlap 
    WHERE competitor_route_id IN (SELECT route_id FROM gtfs.routes WHERE route_short_name = '106') 
      AND base_route_id IN (SELECT route_id FROM gtfs.routes WHERE route_short_name = '300')
  `);
  console.log("Overlap Line 300 vs 106:", r.rows);
  
  process.exit(0);
}
run();
