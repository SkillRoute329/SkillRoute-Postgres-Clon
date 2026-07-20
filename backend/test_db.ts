import sqlDb from './src/config/database';

async function test() {
  try {
    const count = await sqlDb.raw(`SELECT count(*) FROM gtfs.competitor_overlap`);
    console.log("Count:", count.rows[0].count);
    const sample = await sqlDb.raw(`SELECT * FROM gtfs.competitor_overlap LIMIT 5`);
    console.log("Sample:", sample.rows);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

test();
