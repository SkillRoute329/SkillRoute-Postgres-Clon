import sqlDb from './src/config/database';

async function run() {
  try {
    const cols = await sqlDb('information_schema.columns')
      .select('column_name')
      .where('table_name', 'shapes_cross_operator');
    console.log("shapes_cross_operator columns:", cols.map(c => c.column_name));
    
    const cols2 = await sqlDb('information_schema.columns')
      .select('column_name')
      .where('table_name', 'corridor_overlap');
    console.log("corridor_overlap columns:", cols2.map(c => c.column_name));
  } catch(err) {
    console.error(err);
  } finally {
    await sqlDb.destroy();
  }
}
run();
