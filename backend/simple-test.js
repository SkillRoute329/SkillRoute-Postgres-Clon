const { Client } = require('pg');

async function test() {
    const connectionString = "postgresql://postgres:RbkBdQlSGNNeNWSfuFBvFyWpmniwdXcP@caboose.proxy.rlwy.net:33793/railway";
    console.log('Testing connection to Railway Proxy...');

    const client = new Client({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        console.log('✅ Success!');
        const res = await client.query('SELECT NOW()');
        console.log('Time:', res.rows[0].now);
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
    }
}

test();
