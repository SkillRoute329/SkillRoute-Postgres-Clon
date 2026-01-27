const { Client } = require('pg');
require('dotenv').config();

// Habilitar debug de pg
process.env.NODE_DEBUG = 'pg';

async function test() {
    console.log('--- TEST DE CONEXIÓN NIVEL PROTOCOLO ---');
    console.log('URL de Destino:', process.env.DATABASE_URL.split('@')[1]);

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        },
        connectionTimeoutMillis: 10000,
    });

    try {
        console.log('Intentando conectar...');
        await client.connect();
        console.log('✅ CONECTADO AL PROTOCOLO!');

        const res = await client.query('SELECT version();');
        console.log('Versión DB:', res.rows[0].version);

        await client.end();
        console.log('Conexión cerrada limpiamente.');
    } catch (err) {
        console.error('❌ ERROR CRÍTICO DE CONEXIÓN:');
        console.error('Mensaje:', err.message);
        console.error('Código:', err.code);
        console.error('Stack:', err.stack);

        if (err.code === 'ECONNRESET') {
            console.log('\n--- DIAGNÓSTICO ---');
            console.log('ECONNRESET: El servidor (Railway) cerró el socket.');
            console.log('Causas posibles:');
            console.log('1. Railway requiere SSL y no lo estamos enviando correctamente.');
            console.log('2. Railway alcanzó el límite de conexiones.');
            console.log('3. Firewall local está cortando el tráfico Postgres.');
        }
    }
}

test();
