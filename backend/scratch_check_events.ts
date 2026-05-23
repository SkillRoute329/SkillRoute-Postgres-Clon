import sqlDb from './src/config/database';

async function checkEvents() {
  try {
    console.log(">>> CONSULTANDO ÚLTIMOS EVENTOS DE VEHÍCULOS (UCOT=70)...");
    const res = await sqlDb('vehicle_events')
      .where('agency_id', '70')
      .orderBy('created_at', 'desc')
      .limit(10);
    console.log(JSON.stringify(res, null, 2));

    console.log("\n>>> CONTEO DE EVENTOS ÚLTIMA HORA POR LÍNEA...");
    const counts = await sqlDb('vehicle_events')
      .where('agency_id', '70')
      .where('created_at', '>', sqlDb.raw("NOW() - INTERVAL '1 hour'"))
      .select('linea')
      .count('* as count')
      .groupBy('linea');
    console.log(JSON.stringify(counts, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

checkEvents();
