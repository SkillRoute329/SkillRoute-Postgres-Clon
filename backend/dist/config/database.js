"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = exports.db = void 0;
const knex_1 = __importDefault(require("knex"));
const path_1 = __importDefault(require("path"));
const dotenv = __importStar(require("dotenv"));
// 1. Cargar variables de entorno para PostgreSQL Local
dotenv.config({ path: path_1.default.join(__dirname, '../../.env') });
// 2. Mantener retrocompatibilidad con Firebase (Para no romper la compilación general)
var firebase_1 = require("./firebase");
Object.defineProperty(exports, "db", { enumerable: true, get: function () { return firebase_1.db; } });
Object.defineProperty(exports, "auth", { enumerable: true, get: function () { return firebase_1.auth; } });
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
const STMT_TIMEOUT = Number(process.env.STATEMENT_TIMEOUT_MS) || 30000;
const sqlDb = (0, knex_1.default)({
    client: 'pg',
    connection: {
        connectionString: process.env.DATABASE_URL,
    },
    pool: {
        min: 2,
        max: Number(process.env.PG_POOL_MAX) || 20,
        acquireTimeoutMillis: 20000,
        afterCreate: (conn, done) => {
            // Cada conexión nueva: corta queries que excedan el timeout y libera
            // la conexión para que el resto de la app (y el frontend) respire.
            conn.query(`SET statement_timeout = ${STMT_TIMEOUT}; SET idle_in_transaction_session_timeout = 60000;`, (err) => {
                done(err, conn);
            });
        },
    },
    // debug deshabilitado para no loggear queries SQL crudas con parámetros
    // en producción. Reactivar solo en desarrollo local si hace falta.
    debug: false
});
exports.default = sqlDb;
