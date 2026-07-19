require('dotenv').config();
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => {
  try {
    await client.query("UPDATE turnos_dia SET turno = 'mañana' WHERE turno IS NULL");
    console.log("Fix applied successfully");
  } catch (err) {
    console.error("Error applying fix", err);
  } finally {
    client.end();
  }
});
