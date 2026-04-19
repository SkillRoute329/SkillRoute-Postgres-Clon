/**
 * Cliente API centralizado — Re-exportación desde services/api.
 *
 * Varios hooks (useDashboardData, useSTMData) importan `api` desde esta ruta.
 * El cliente real vive en services/api.ts — aquí solo lo re-exportamos
 * para mantener la consistencia de imports.
 */

export { default as api, API_URL } from '../services/api';
