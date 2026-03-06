const { Client } = require('pg');
require('dotenv').config();

async function test() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    console.log('Connecting via PG client...');
    await client.connect();
    console.log('Connected!');
    const res = await client.query('SELECT 1 as connected');
    console.log(res.rows);
  } catch (err) {
    console.error('PG Connection Error:', err);
  } finally {
    await client.end();
  }
}

test();
