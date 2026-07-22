import sqlDb from './src/config/database';

async function run() {
  try {
    const sample = await sqlDb('vehiculos').select('*').limit(3);
    console.log("Vehicles Sample Rows:", JSON.stringify(sample, null, 2));
  } catch(err) {
    console.error(err);
  } finally {
    await sqlDb.destroy();
  }
}
run();
