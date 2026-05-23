import knex from 'knex';
import path from 'path';
import * as dotenv from 'dotenv';

// 1. Cargar variables de entorno para PostgreSQL Local
dotenv.config({ path: path.join(__dirname, '../../.env') });

// 2. Mantener retrocompatibilidad con Firebase (Para no romper la compilación general)
export { db, auth } from './firebase';

// 3. Instancia central del Pool de Conexiones a PostgreSQL Soberano
// FASE 5.17 (2026-05-16): el frontend se congelaba porque una query pesada
// (COUNT(DISTINCT) sobre vehicle_events 28.8M filas/11GB, o un REFRESH MV
// apilado) retenía una conexión por minutos y agotaba el pool de 10 →
// TODAS las requests del front quedaban esperando. Solución sistémica:
//   1. statement_timeout por conexión: ninguna query puede colgar el pool
//      más de STATEMENT_TIMEOUT_MS (default 30s). El analytics pesado debe
//      ir por MV/background, no bloquear el pool de la API.
//   2. pool.max mayor + acquireTimeout explícito (falla rápido y claro en
//      vez de colgar el request indefinidamente).
const STMT_TIMEOUT = Number(process.env.STATEMENT_TIMEOUT_MS) || 30_000;

const sqlDb = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
  },
  pool: {
    min: 2,
    max: Number(process.env.PG_POOL_MAX) || 20,
    acquireTimeoutMillis: 20_000,
    afterCreate: (conn: { query: (sql: string, cb: (err: unknown) => void) => void }, done: (err: unknown, c: unknown) => void) => {
      // Cada conexión nueva: corta queries que excedan el timeout y libera
      // la conexión para que el resto de la app (y el frontend) respire.
      conn.query(`SET statement_timeout = ${STMT_TIMEOUT}; SET idle_in_transaction_session_timeout = 60000;`, (err: unknown) => {
        done(err, conn);
      });
    },
  },
  // debug deshabilitado para no loggear queries SQL crudas con parámetros
  // en producción. Reactivar solo en desarrollo local si hace falta.
  debug: false
});

export default sqlDb;
