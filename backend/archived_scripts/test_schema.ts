import sqlDb from './src/config/database';

async function checkSchema() {
  try {
    const overlapCols = await sqlDb.raw(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'gtfs' AND table_name = 'stop_times';
    `);
    console.log("gtfs.stop_times columns:", overlapCols.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
checkSchema();
