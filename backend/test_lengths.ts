import sqlDb from './src/config/database';

async function testLengths() {
  try {
    console.time("Lengths Query");
    const res = await sqlDb.raw(`
      WITH target_routes AS (
        SELECT route_id FROM gtfs.routes WHERE route_short_name = '316' OR route_id = '316'
      ),
      competitors AS (
        SELECT c.*, r.route_short_name
        FROM gtfs.competitor_overlap c
        JOIN gtfs.routes r ON c.competitor_route_id = r.route_id
        WHERE c.base_route_id IN (SELECT route_id FROM target_routes)
        AND c.base_direction_id = 0
        ORDER BY c.shared_stops_count DESC
        LIMIT 20
      )
      SELECT 
        c.route_short_name,
        (
          SELECT ST_Length(ST_MakeLine(ST_SetSRID(ST_MakePoint(s.shape_pt_lon, s.shape_pt_lat), 4326) ORDER BY s.shape_pt_sequence)::geography) / 1000
          FROM gtfs.shapes s
          JOIN gtfs.trips t ON s.shape_id = t.shape_id
          WHERE t.route_id = c.competitor_route_id AND t.direction_id = c.competitor_direction_id
          LIMIT 1
        ) AS comp_km
      FROM competitors c;
    `);
    console.timeEnd("Lengths Query");
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
testLengths();
