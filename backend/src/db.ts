import { Pool } from 'pg';
import dotenv from 'dotenv';
// Cargar variables de entorno si estamos en local (en prod ya están cargadas)
dotenv.config();

// 1. Obtener la URL real
const connectionString = process.env.DATABASE_URL;

// 2. Log de Diagnóstico (Ocultando la contraseña)
if (connectionString) {
    const masked = connectionString.replace(/:([^:@]+)@/, ':****@');
    console.log(`🔌 [DB] Intentando conectar a: ${masked}`);
} else {
    console.error('❌ [DB] FATAL: No existe DATABASE_URL. Usando localhost (Fallará en Prod).');
}

// 3. Configurar el Pool
const pool = new Pool({
    connectionString: connectionString, // Si es undefined, fallará visiblemente en lugar de usar default silencioso
    ssl: process.env.NODE_ENV === 'production' && connectionString && !connectionString.includes('localhost')
        ? { rejectUnauthorized: false } // Necesario para algunas nubes, seguro para Railway interno
        : undefined
});

pool.on('connect', () => {
    console.log('✅ [DB] ¡Conexión exitosa a la Base de Datos!');
});

pool.on('error', (err) => {
    console.error('🔥 [DB] Error en la conexión:', err);
});

export default pool;
