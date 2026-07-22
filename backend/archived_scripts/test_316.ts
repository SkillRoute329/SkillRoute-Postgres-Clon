import sqlDb from './src/config/database';

async function test() {
  try {
    const data = await sqlDb('gtfs.competitor_overlap').where({ base_route_id: '316' });
    console.log(`Found ${data.length} competitors for route 316`);
    if (data.length > 0) {
      console.log(data);
    } else {
      const allRoutes = await sqlDb.raw(`SELECT DISTINCT base_route_id FROM gtfs.competitor_overlap LIMIT 20`);
      console.log("Some available route_ids:", allRoutes.rows.map(r => r.base_route_id));
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

test();
