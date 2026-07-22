import knex from 'knex';

const sqlDb = knex({
  client: 'pg',
  connection: {
    host: '127.0.0.1',
    user: 'postgres',
    password: 'I0SAv9zhoQDUfTPc7L+KmkAw',
    database: 'skillroute_master',
  }
});

async function testQuery(linea: string, directionId: number) {
  const query = `
    WITH TargetShape AS (
      SELECT t.shape_id, COUNT(*) as pts
      FROM gtfs.trips t
      JOIN gtfs.routes r ON t.route_id = r.route_id
      JOIN gtfs.shapes s ON s.shape_id = t.shape_id
      WHERE r.route_short_name = '${linea}'
      AND t.direction_id = ${directionId}
      GROUP BY t.shape_id
      ORDER BY pts DESC
      LIMIT 1
    )
    SELECT s.shape_pt_lat as lat, s.shape_pt_lon as lng
    FROM gtfs.shapes s
    JOIN TargetShape ts ON s.shape_id = ts.shape_id
    ORDER BY s.shape_pt_sequence ASC;
  `;
  const res = await sqlDb.raw(query);
  return res.rows;
}

async function run() {
  try {
    // Test con linea 306 sentido 0 (IDA)
    const ida = await testQuery('306', 0);
    console.log('306 IDA POINTS:', ida.length);
    if(ida.length > 0) console.log('306 IDA Sample:', ida[0]);
    
    // Test con linea 306 sentido 1 (VUELTA)
    const vuelta = await testQuery('306', 1);
    console.log('306 VUELTA POINTS:', vuelta.length);
    if(vuelta.length > 0) console.log('306 VUELTA Sample:', vuelta[0]);

    process.exit(0);
  } catch (err) {
    console.error('DB Error:', err);
    process.exit(1);
  }
}
run();
