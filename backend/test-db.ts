
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });
    try {
        console.log('Connecting to:', process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':****@'));
        await client.connect();
        console.log('Connection successful!');
        const res = await client.query('SELECT NOW()');
        console.log('Server time:', res.rows[0]);
        await client.end();
    } catch (err) {
        console.error('Connection error:', err);
    }
}

testConnection();
