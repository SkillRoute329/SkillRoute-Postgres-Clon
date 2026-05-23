import sqlDb from './src/config/database';

async function explore() {
  try {
    console.log('Testing connection and fetching GTFS tables structure...');
    
    // Check schema columns for routes
    const columns = await sqlDb('information_schema.columns')
      .where('table_schema', 'gtfs')
      .where('table_name', 'routes')
      .select('column_name');
    console.log('Routes Columns:', columns.map(c => c.column_name));

    // Also check agencies
    const agencies = await sqlDb('gtfs.agency').select('*');
    console.log('Agencies:', agencies);

    // Try a draft overlap query for Line 300
    const testLine = '300';
    console.log(`\nTesting overlapping routes for line ${testLine}...`);
    
    const overlaps = await sqlDb.raw(`
      WITH TargetStops AS (
        SELECT DISTINCT st.stop_id
        FROM gtfs.routes r
        JOIN gtfs.trips t ON t.route_id = r.route_id
        JOIN gtfs.stop_times st ON st.trip_id = t.trip_id
        WHERE r.route_short_name = ?
      )
      SELECT 
        r.route_short_name as route,
        r.route_long_name as name,
        a.agency_name as company,
        COUNT(DISTINCT st.stop_id) as shared_stops
      FROM gtfs.stop_times st
      JOIN gtfs.trips t ON st.trip_id = t.trip_id
      JOIN gtfs.routes r ON t.route_id = r.route_id
      JOIN gtfs.agency a ON r.agency_id = a.agency_id
      JOIN TargetStops ts ON st.stop_id = ts.stop_id
      WHERE r.route_short_name != ?
      GROUP BY r.route_short_name, r.route_long_name, a.agency_name
      ORDER BY shared_stops DESC
      LIMIT 10;
    `, [testLine, testLine]);

    console.log('Top Overlapping Rivals:', overlaps.rows);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
explore();
