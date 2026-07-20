import sqlDb from '../src/config/database';

async function check() {
  try {
    await sqlDb.raw(`TRUNCATE TABLE gtfs.stm_passenger_trends;`);
    console.log('Table truncated.');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}
check();
