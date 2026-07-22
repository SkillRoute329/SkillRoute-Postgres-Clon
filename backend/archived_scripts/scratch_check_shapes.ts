import sqlDb from './src/config/database';

async function run() {
  try {
    const count = await sqlDb('shapes_cross_operator').count();
    console.log("Total Shapes:", count[0].count);
    
    if (Number(count[0].count) > 0) {
      const samples = await sqlDb('shapes_cross_operator')
        .select('key', 'agencyId', 'linea', 'sentido')
        .where('agencyId', '70')
        .limit(20);
      console.log("UCOT Shapes Sample:", JSON.stringify(samples, null, 2));
    }
  } catch(err) {
    console.error(err);
  } finally {
    await sqlDb.destroy();
  }
}
run();
