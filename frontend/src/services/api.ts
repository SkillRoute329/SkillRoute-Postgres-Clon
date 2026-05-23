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
 * API Client real para llamar al Backend 2.0 Hardened.
 */
// FASE 5.16: authHeader() del tokenStore único (no más getItem('tf_token')).
const api = {
  get: async (path: string) => {
    const response = await fetch(`${API_URL}${path}`, {
      headers: { ...authHeader() },
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return { data: await response.json() };
  },
  post: async (path: string, data: Record<string, unknown>) => {
    const response = await fetch(`${API_URL}${path}`, {
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
