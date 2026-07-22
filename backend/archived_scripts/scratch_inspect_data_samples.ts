import sqlDb from './src/config/database';

async function run() {
  try {
    console.log("--- stm_validaciones_mensual sample ---");
    const valSample = await sqlDb('stm_validaciones_mensual').select('*').limit(2);
    console.log(JSON.stringify(valSample, null, 2));

    console.log("\n--- corridor_overlap sample ---");
    const overlapSample = await sqlDb('corridor_overlap').select('*').limit(2);
    console.log(JSON.stringify(overlapSample, null, 2));
    
    console.log("\n--- vehicle_events sample ---");
    const gpsSample = await sqlDb('vehicle_events')
      .select('linea', 'desviacion_min', 'sentido')
      .whereNotNull('desviacion_min')
      .limit(2);
    console.log(JSON.stringify(gpsSample, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
