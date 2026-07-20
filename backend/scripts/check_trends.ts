import sqlDb from '../src/config/database';

async function check() {
  try {
    const count = await sqlDb('gtfs.stm_passenger_trends').count('* as total');
    console.log('Total rows in stm_passenger_trends:', count[0].total);
    
    const sample = await sqlDb('gtfs.stm_passenger_trends').limit(5);
    console.log('Sample data:', sample);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}
check();
