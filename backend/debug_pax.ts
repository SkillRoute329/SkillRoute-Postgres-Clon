import sqlDb from './src/config/database';

async function run() {
  const r = await sqlDb.raw(`
    SELECT route_id, SUM(passenger_count) as total
    FROM gtfs.stm_passenger_trends
    WHERE month = '2026-05'
    GROUP BY route_id
    ORDER BY total DESC
    LIMIT 20
  `);
  console.log("Top 20 lines by pax (May 2026):", r.rows);
  
  const rBot = await sqlDb.raw(`
    SELECT route_id, SUM(passenger_count) as total
    FROM gtfs.stm_passenger_trends
    WHERE month = '2026-05'
    GROUP BY route_id
    ORDER BY total ASC
    LIMIT 20
  `);
  console.log("Bottom 20 lines by pax:", rBot.rows);
  process.exit(0);
}
run();
