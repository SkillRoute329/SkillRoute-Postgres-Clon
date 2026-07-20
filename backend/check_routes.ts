import sqlDb from './src/config/database';

async function check() {
  const routes = await sqlDb('gtfs.routes').limit(10);
  console.log('GTFS Routes:');
  console.log(routes);
  process.exit(0);
}
check();
