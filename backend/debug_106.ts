import sqlDb from './src/config/database';

async function run() {
  const t = await sqlDb.raw(`SELECT count(*) as c FROM gtfs.trips WHERE route_id='3001179'`);
  console.log("Trips for 3001179:", t.rows);

  const t106 = await sqlDb.raw(`SELECT count(*) as c FROM gtfs.trips WHERE route_id='106'`);
  console.log("Trips for 106:", t106.rows);
  
  process.exit(0);
}
run();
