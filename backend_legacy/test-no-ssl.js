const { Client } = require('pg');
require('dotenv').config();

async function test() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL.split('?')[0],
        ssl: false
    });

    try {
        console.log('Connecting WITHOUT SSL...');
        await client.connect();
        console.log('Connected!');
    } catch (err) {
        console.error('Non-SSL Error:', err.message);
    } finally {
        await client.end();
    }
}

test();
