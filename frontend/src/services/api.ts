/**
 * Punto de entrada único: reexporta servicios Firestore (reemplazo de la API backend eliminada).
 * No levantar servidor; todo el acceso a datos es vía Firestore en tiempo real.
 */
import { getDocs, addDoc, collection } from 'firebase/firestore';
import { db } from '../config/firebase';

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

/** URL base de API (ya no hay backend local; se deja por compatibilidad con componentes que la referencian). */
export const API_URL = '';

/** Compatibilidad: stub para componentes que usan api.get/post (p. ej. TenantsManager). */
const apiStub = {
  get: async (path: string) => {
    if (path === '/tenants') {
      const snap = await getDocs(collection(db, 'tenants'));
      return { data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
    }
    if (path === '/system-health/status') return { data: { status: 'ok' } };
    return { data: null };
  },
  post: async (path: string, data: Record<string, unknown>) => {
    if (path === '/tenants') {
      const ref = await addDoc(collection(db, 'tenants'), data);
      return { data: { id: ref.id, ...data } };
    }
    return { data: null };
  },
};

export default apiStub;
