import sqlDb from './src/config/database';

async function test() {
  try {
    const route = await sqlDb('gtfs.competitor_overlap').limit(1);
    console.log("Sample overlap:", route);

    const routes = await sqlDb('gtfs.routes').whereIn('route_id', [route[0].base_route_id, route[0].competitor_route_id]);
    console.log("Matching routes from gtfs.routes:", routes.map(r => ({ id: r.route_id, short: r.route_short_name, agency: r.agency_id })));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

test();
