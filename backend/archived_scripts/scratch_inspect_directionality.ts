import sqlDb from './src/config/database';

async function run() {
  try {
    console.log("--- Unique values of tramo_ordinal in stm_validaciones_mensual ---");
    const ordinals = await sqlDb('stm_validaciones_mensual')
      .select('tramo_ordinal')
      .count('id as qty')
      .groupBy('tramo_ordinal');
    console.log(ordinals);

    // Let's check schema of views or look if we have a master table for directions
    console.log("\n--- Querying schema_fase5_views or views related to validations ---");
    const views = await sqlDb('information_schema.views')
      .select('table_name')
      .where('table_schema', 'public')
      .whereLike('table_name', '%valid%');
    console.log(views);

    // Check columns of 'vehicle_events' sentido values
    console.log("\n--- Sentido values in vehicle_events ---");
    const sentidos = await sqlDb('vehicle_events')
      .select('sentido')
      .count('id as count')
      .groupBy('sentido');
    console.log(sentidos);
    
    // Check 'corridor_overlap' sentidos
    console.log("\n--- Sentido values in corridor_overlap ---");
    const coSentidos = await sqlDb('corridor_overlap')
      .select('sentido_a')
      .count('id as count')
      .groupBy('sentido_a');
    console.log(coSentidos);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
