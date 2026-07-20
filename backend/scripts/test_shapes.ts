import db from '../src/config/database';

async function run() {
  try {
    const hasTable = await db.schema.hasTable('shapes_cross_operator');
    if (hasTable) {
      const rows = await db('shapes_cross_operator')
        .distinct('linea')
        .where('agencyId', '70');
      console.log('Lines in shapes_cross_operator for UCOT (70):');
      console.log(rows.map(r => r.linea).sort().join(', '));
    } else {
      console.log('Table shapes_cross_operator does not exist.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
