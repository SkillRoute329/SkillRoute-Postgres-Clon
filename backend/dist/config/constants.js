"use strict";
/**
 * Constantes globales de la aplicación
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
require("dotenv/config");
// ───────────────────────────────────────────────────────────────────────
// FASE 1 — Validación fail-fast del JWT_SECRET (regla -3 OWASP A05)
// ───────────────────────────────────────────────────────────────────────
// En producción JAMÁS arrancamos con un secret default. Si JWT_SECRET no
// está definido, el proceso muere de inmediato con mensaje claro. En
// development se permite un secret por defecto pero se imprime warning.
// ───────────────────────────────────────────────────────────────────────
const NODE_ENV_VAL = process.env.NODE_ENV ?? 'development';
let resolvedJwtSecret;
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
    resolvedJwtSecret = process.env.JWT_SECRET;
}
else if (NODE_ENV_VAL === 'production') {
    // eslint-disable-next-line no-console
    console.error('[CRITICAL] JWT_SECRET no definido o demasiado corto en NODE_ENV=production.\n' +
        '  → Agregar a backend/.env: JWT_SECRET=<48+ bytes random base64>\n' +
        '  → Se cortará el arranque para evitar correr con secret inseguro.');
    process.exit(1);
}
else {
    // eslint-disable-next-line no-console
    console.warn('[SECURITY WARN] JWT_SECRET no definido en development; usando secret de desarrollo.\n' +
        '  → NUNCA arrancar producción sin JWT_SECRET fuerte en .env.');
    resolvedJwtSecret = 'dev-secret-key-change-in-production';
}
exports.Config = {
    // Server
    PORT: process.env.PORT ?? 3000,
    NODE_ENV: NODE_ENV_VAL,
    // Security
    JWT_SECRET: resolvedJwtSecret,
    JWT_EXPIRATION: process.env.JWT_EXPIRATION ?? '24h',
    // CORS
    CORS_ORIGINS: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
        : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3005', 'http://127.0.0.1:3005'],
    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000', 10),
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '100', 10),
    // Database
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIRESTORE_EMULATOR: process.env.FIRESTORE_EMULATOR_HOST,
    // Collections
    Collections: {
        PERSONAL: 'personal',
        VEHICLES: 'vehicles',
        CARTONES: 'cartones_completados',
        FLEET_CHECKS: 'fleet_checks',
        SHIFTS: 'shifts',
        USERS: 'users',
        TURNOS_DIA: 'turnos_dia',
        ALERTAS_OPERATIVAS: 'alertas_operativas',
    },
    // Roles
    Roles: {
        SUPER_ADMIN: 'SuperAdmin',
        ADMIN: 'Admin',
        INSPECTOR: 'Inspector',
        DRIVER: 'Driver',
        USER: 'User',
    },
    // Request limits
    REQUEST_LIMIT: '10mb',
    JSON_LIMIT: '10mb',
    // Validation
    MIN_PASSWORD_LENGTH: 4,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCK_TIME_MINUTES: 15,
    // API Timeouts
    DB_TIMEOUT_MS: 10000,
    API_TIMEOUT_MS: 30000,
};
exports.default = exports.Config;
