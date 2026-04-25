/**
 * Setup global para tests Vitest.
 * Stubs de variables de entorno y polyfills para jsdom.
 */
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Stub import.meta.env vars que el código consume
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_SENTRY_DSN: undefined,
    VITE_APP_VERSION: 'test',
    VITE_FCM_VAPID_KEY: 'TEST_VAPID_PLACEHOLDER',
    MODE: 'test',
    DEV: false,
    PROD: false,
  },
  writable: true,
});

// Mock console para que no inunde la salida
const origError = console.error;
const origWarn = console.warn;
console.error = vi.fn((...args) => {
  if (process.env.VERBOSE) origError(...args);
});
console.warn = vi.fn((...args) => {
  if (process.env.VERBOSE) origWarn(...args);
});
