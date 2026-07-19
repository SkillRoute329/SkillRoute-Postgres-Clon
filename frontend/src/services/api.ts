/**
 * Punto de entrada único: integra Servicios Firestore con la API Backend 2.0.
 */

export {
  UserService,
  ShiftService,
  FleetService,
  BulletinService,
  CartonService,
  MaintenanceService,
  DepartmentService,
  RoadAlertService,
  PenaltyService,
  DiscountService,
  DataImportService,
  SystemHealthService,
  DriverService,
  UniversalService,
  ServiceMatrixService,
  InspectionService,
  ProgramacionDiariaService,
} from './firestore';

export type { Shift, User, Vehicle } from './firestore';

import { authHeader } from '../utils/tokenStore';

/** URL base de API (Usa el proxy de Vite en desarrollo: /api -> localhost:3002). */
export const API_URL = '/api';

/**
 * Función fetch estandarizada para uso con la API backend 2.0.
 * Inyecta automáticamente los headers de autorización.
 */
export async function apiFetch(path: string, opts?: RequestInit) {
  const url = path.startsWith('/api') ? path : `${API_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...opts?.headers,
    },
  });
  return await res.json();
}

/**
 * API Client real para llamar al Backend 2.0 Hardened.
 */
// FASE 5.16: authHeader() del tokenStore único (no más getItem('tf_token')).
const api = {
  get: async (path: string) => {
    const url = path.startsWith('/api') ? path : `${API_URL}${path}`;
    const response = await fetch(url, {
      headers: { ...authHeader() },
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return { data: await response.json() };
  },
  post: async (path: string, data: Record<string, unknown>) => {
    const url = path.startsWith('/api') ? path : `${API_URL}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return { data: await response.json() };
  },
};

export default api;
