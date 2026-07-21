const { Client } = require('pg');
const fs = require('fs');

async function main() {
  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'skillroute_soberano',
    password: 'Skill329',
    port: 5433,
  });

  try {
    await client.connect();

    // Corredor A: 316 + 300
    // Get full 316 (Cno Maldonado)
    const res316 = await client.query(`
       WITH best AS (
         SELECT t.shape_id, COUNT(*) AS pts FROM gtfs.trips t JOIN gtfs.routes r ON r.route_id = t.route_id
          WHERE r.route_short_name = '316' AND t.direction_id = 0 AND t.shape_id IS NOT NULL GROUP BY t.shape_id ORDER BY pts DESC LIMIT 1
       )
       SELECT s.shape_pt_lat AS lat, s.shape_pt_lon AS lon FROM gtfs.shapes s JOIN best b ON b.shape_id = s.shape_id ORDER BY s.shape_pt_sequence
    `);
    
    // Corredor B: 214 or 221
    const res214 = await client.query(`
       WITH best AS (
         SELECT t.shape_id, COUNT(*) AS pts FROM gtfs.trips t JOIN gtfs.routes r ON r.route_id = t.route_id
          WHERE r.route_short_name IN ('214','714','221') AND t.direction_id = 0 AND t.shape_id IS NOT NULL GROUP BY t.shape_id ORDER BY pts DESC LIMIT 1
       )
       SELECT s.shape_pt_lat AS lat, s.shape_pt_lon AS lon FROM gtfs.shapes s JOIN best b ON b.shape_id = s.shape_id ORDER BY s.shape_pt_sequence
    `);

    let shapeA = res316.rows.map(r => [parseFloat(r.lat), parseFloat(r.lon)]);
    let shapeB = res214.rows.map(r => [parseFloat(r.lat), parseFloat(r.lon)]);

    const content = `export const brtShapes = ${JSON.stringify({ A: shapeA, B: shapeB }, null, 2)};\n`;
    fs.writeFileSync('../frontend/src/pages/traffic/data/brtShapesData.ts', content);
    console.log("Shapes written successfully from GTFS! A: " + shapeA.length + " B: " + shapeB.length);
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

main();
