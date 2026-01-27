const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

async function check() {
    console.log('--- DIAGNÓSTICO DE CONEXIÓN RAILWAY ---');
    console.log('URL:', process.env.DATABASE_URL.replace(/:[^:@]*@/, ':****@'));

    const prisma = new PrismaClient({
        log: ['query', 'info', 'warn', 'error'],
        errorFormat: 'pretty',
    });

    try {
        console.log('1. Intentando handshake TCP...');
        // Handshake already verified by Test-NetConnection

        console.log('2. Intentando conexión Prisma...');
        await prisma.$connect();
        console.log('✅ CONEXIÓN EXITOSA!');

        const count = await prisma.user.count();
        console.log(`3. Consulta exitosa. Usuarios en DB: ${count}`);

    } catch (e) {
        console.error('❌ FALLO DE CONEXIÓN:');
        console.error('Mensaje:', e.message);
        console.error('Código:', e.code);
        if (e.message.includes('ECONNRESET')) {
            console.error('--- EXPLICACIÓN ---');
            console.error('El servidor de Railway aceptó la conexión pero la cerró inmediatamente.');
            console.error('Esto suele significar que tu IP no tiene permiso o que el SSL falló.');
        }
    } finally {
        await prisma.$disconnect();
    }
}

check();
