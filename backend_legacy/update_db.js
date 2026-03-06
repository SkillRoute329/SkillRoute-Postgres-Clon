require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to DB');

    // Add isPaid column
    await client.query(
      'ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "isPaid" BOOLEAN NOT NULL DEFAULT false;',
    );
    console.log('Column isPaid added successfully');

    await client.end();
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

run();
