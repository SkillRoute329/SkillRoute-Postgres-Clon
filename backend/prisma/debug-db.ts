import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function test() {
    console.log('Testing connection to:', process.env.DATABASE_URL);
    try {
        await client.connect();
        const res = await client.query('SELECT NOW()');
        console.log('Success! Database time:', res.rows[0]);
    } catch (err) {
        console.error('Connection error:', err);
    } finally {
        await client.end();
    }
}

test();
