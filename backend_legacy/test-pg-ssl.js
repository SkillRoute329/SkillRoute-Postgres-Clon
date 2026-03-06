const { Client } = require('pg');
require('dotenv').config();

async function test() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL.replace('?sslmode=no-verify', ''),
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    console.log('Connecting with SSL...');
    await client.connect();
    console.log('Connected successfully!');
    const res = await client.query('SELECT NOW()');
    console.log('DB Time:', res.rows[0]);
  } catch (err) {
    console.error('Handshake Error:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    await client.end();
  }
}

test();
