import sqlDb from './src/config/database';

async function checkRoutesSchema() {
  try {
    const res = await sqlDb.raw(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'gtfs' AND table_name = 'routes';
    `);
    console.log("gtfs.routes columns:", res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
checkRoutesSchema();
