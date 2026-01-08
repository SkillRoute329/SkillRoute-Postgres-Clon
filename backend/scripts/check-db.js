
require('dotenv').config();
const { Client } = require('pg');

console.log('--- DB Check ---');
console.log('DATABASE_URL:', process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@')); // Mask password

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function check() {
    try {
        await client.connect();
        console.log('✅ Connected successfully!');
        const res = await client.query('SELECT NOW()');
        console.log('Time:', res.rows[0].now);
        await client.end();
    } catch (err) {
        console.error('❌ Connection error:', err.message);
    }
}

check();
