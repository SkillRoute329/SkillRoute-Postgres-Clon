import sqlDb from './src/config/database';

async function checkRows() {
  try {
    const res = await sqlDb.raw(`SELECT COUNT(*) FROM gtfs.competitor_overlap;`);
    console.log("Total rows:", res.rows[0].count);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
checkRows();
