/**
 * Constantes globales de la aplicación
 */

import 'dotenv/config';

export const Config = {
  // Server
  PORT: process.env.PORT ?? 3000,
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  // Security
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-secret-key-change-in-production',
  JWT_EXPIRATION: process.env.JWT_EXPIRATION ?? '24h',

  // CORS
  CORS_ORIGINS: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5173', 'http://localhost:3000'],

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

export default Config;
