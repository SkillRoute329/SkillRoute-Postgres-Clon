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

/** URL base de API (Usa el proxy de Vite en desarrollo: /api -> localhost:3002). */
export const API_URL = '/api';

/**
 * API Client real para llamar al Backend 2.0 Hardened.
 */
const api = {
  get: async (path: string) => {
    const token = localStorage.getItem('tf_token');
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return { data: await response.json() };
  },
  post: async (path: string, data: Record<string, unknown>) => {
    const token = localStorage.getItem('tf_token');
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return { data: await response.json() };
  },
};

export default api;
