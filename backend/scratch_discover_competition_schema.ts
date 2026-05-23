import sqlDb from './src/config/database';

async function run() {
  try {
    const compTables = ['corridor_overlap', 'competencia_monitoreo', 'competidores'];
    for (const tName of compTables) {
      const cols = await sqlDb('information_schema.columns')
        .select('column_name', 'data_type')
        .where('table_name', tName);
      console.log(`\nColumns in ${tName}:`);
      cols.forEach(c => console.log(`  - ${c.column_name} (${c.data_type})`));
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
