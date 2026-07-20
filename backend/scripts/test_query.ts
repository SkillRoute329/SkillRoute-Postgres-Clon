import sqlDb from '../src/config/database';

async function check() {
  try {
    const route = await sqlDb('gtfs.routes').where('route_short_name', '17').limit(5);
    console.log('Routes for 17:', route);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}
check();
