import sqlDb from './src/config/database';

async function test() {
  try {
    const lines = await sqlDb('gtfs.routes')
      .distinct('agency_id');
    console.log("Distinct agency_ids:", lines);
    
    // Also let's check one route
    const oneRoute = await sqlDb('gtfs.routes').limit(1);
    console.log("Sample route:", oneRoute);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

test();
