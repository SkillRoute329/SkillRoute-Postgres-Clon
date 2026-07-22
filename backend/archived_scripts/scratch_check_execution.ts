import knex from 'knex';
import jwt from 'jsonwebtoken';

const sqlDb = knex({
  client: 'pg',
  connection: {
    host: '127.0.0.1',
    user: 'postgres',
    password: 'I0SAv9zhoQDUfTPc7L+KmkAw',
    database: 'skillroute_master',
  }
});

async function run() {
  try {
    // Manually query the new endpoints logic directly inside node
    // to verify it executes without crashing
    const shapeQuery = `
      WITH TargetShape AS (
        SELECT t.shape_id, COUNT(*) as pts
        FROM gtfs.trips t
        JOIN gtfs.routes r ON t.route_id = r.route_id
        JOIN gtfs.shapes s ON s.shape_id = t.shape_id
        WHERE r.route_short_name = '306'
        AND t.direction_id = 0
        GROUP BY t.shape_id
        ORDER BY pts DESC
        LIMIT 1
      )
      SELECT s.shape_pt_lat as lat, s.shape_pt_lon as lng
      FROM gtfs.shapes s
      JOIN TargetShape ts ON s.shape_id = ts.shape_id
      ORDER BY s.shape_pt_sequence ASC;
    `;
    const res = await sqlDb.raw(shapeQuery);
    console.log('EXECUTION SUCCESS. GOT ROWS:', res.rows.length);
    
    // NOW LETS ACTUALLY CURL THE ENDPOINT ON LOCALHOST:3000!
    // Wait, I need a valid token to bypass backend requireAuth.
    // Let's just hit http://localhost:3000/api/gtfs/lines?agencyId=70 directly
    // and pass some token to see if it 404s or gives AuthError.
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
