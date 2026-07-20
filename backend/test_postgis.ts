import sqlDb from './src/config/database';

async function testPostgis() {
  try {
    console.time("Intersection Query");
    const result = await sqlDb.raw(`
      WITH base_shape AS (
        SELECT ST_MakeLine(
            ST_SetSRID(ST_MakePoint(s.shape_pt_lon, s.shape_pt_lat), 4326)
            ORDER BY s.shape_pt_sequence
          )::geography AS geom
        FROM gtfs.shapes s
        JOIN gtfs.trips t ON s.shape_id = t.shape_id
        WHERE t.route_id = '13000235' AND t.direction_id = 0
        LIMIT 1
      ),
      comp_shape AS (
        SELECT ST_MakeLine(
            ST_SetSRID(ST_MakePoint(s.shape_pt_lon, s.shape_pt_lat), 4326)
            ORDER BY s.shape_pt_sequence
          )::geography AS geom
        FROM gtfs.shapes s
        JOIN gtfs.trips t ON s.shape_id = t.shape_id
        WHERE t.route_id = '2701164' AND t.direction_id = 0
        LIMIT 1
      )
      SELECT 
        ST_Length(base_shape.geom) / 1000 AS base_km,
        ST_Length(comp_shape.geom) / 1000 AS comp_km,
        ST_Length(ST_Intersection(base_shape.geom::geometry, ST_Buffer(comp_shape.geom::geometry, 0.0002))::geography) / 1000 AS shared_km
      FROM base_shape, comp_shape
    `);
    console.timeEnd("Intersection Query");
    console.log("Result:", result.rows[0]);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
testPostgis();
