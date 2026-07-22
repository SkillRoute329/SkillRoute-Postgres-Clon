import sqlDb from './src/config/database';

async function run() {
  try {
    const tables = await sqlDb('information_schema.tables')
      .select('table_name')
      .where('table_schema', 'public')
      .orderBy('table_name');
    
    console.log("Tables found in Database:");
    console.log(tables.map(t => t.table_name).join(', '));
    
    // Check schema for ticket sales or validations
    const candidateTables = tables.map(t => t.table_name).filter(name => 
      name.includes('bole') || name.includes('valid') || name.includes('vent') || name.includes('etapa') || name.includes('finan')
    );
    
    console.log("\nInspecting schemas for candidate tables:", candidateTables);
    for (const tName of candidateTables) {
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
