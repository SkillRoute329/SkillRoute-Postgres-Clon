"use strict";
/**
 * Constantes globales de la aplicación
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
exports.Config = {
    // Server
    PORT: process.env.PORT ?? 3000,
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    // Security
    JWT_SECRET: process.env.JWT_SECRET ?? 'ucot-god-mode-secret-2026',
    JWT_EXPIRATION: '24h',
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
