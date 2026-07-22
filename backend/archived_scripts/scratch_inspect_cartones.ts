import sqlDb from './src/config/database';

async function run() {
  try {
    // Check tables containing carton or schedule
    const tables = await sqlDb('information_schema.tables')
      .select('table_name')
      .whereRaw("table_name LIKE '%carton%' OR table_name LIKE '%horario%' OR table_name LIKE '%service%'");
    
    console.log("Schedule related tables:", tables.map(t => t.table_name));
    
    // Count check
    for (const t of tables) {
      try {
        const count = await sqlDb(t.table_name).count();
        console.log(`Count for ${t.table_name}:`, count[0].count);
        if (Number(count[0].count) > 0) {
          const sample = await sqlDb(t.table_name).select('*').limit(1);
          console.log(`Sample from ${t.table_name}:`, JSON.stringify(sample, null, 2));
        }
      } catch(e) {}
    }
  } catch(err) {
    console.error(err);
  } finally {
    await sqlDb.destroy();
  }
}
run();
