import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// URL DE EMERGENCIA (Proporcionada por el usuario para Railway Internal)
const FALLBACK_URL = "postgresql://postgres:RbkBdQlSGNNeNWSfuFBvFyWpmniwdXcP@postgres.railway.internal:5432/railway";

// Usar variable de entorno O el fallback explícito
const connectionString = process.env.DATABASE_URL || FALLBACK_URL;

console.log('🔌 [DB] Iniciando conexión...');
if (!process.env.DATABASE_URL) {
    console.warn('⚠️ [DB] ADVERTENCIA: DATABASE_URL no detectada. Usando URL de respaldo interna.');
}

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false },
    max: 20, // Limit pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});

pool.on('connect', () => console.log('✅ [DB] Conectado exitosamente a Postgres.'));
pool.on('error', (err) => console.error('🔥 [DB] Error en cliente de base de datos:', err));

export default pool;
