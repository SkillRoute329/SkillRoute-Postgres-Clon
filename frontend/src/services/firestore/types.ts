/**
 * Tipos compartidos para servicios Firestore (reemplazo de la antigua API).
 */

export interface Shift {
  id: number | string;
  date?: string;
  start?: string;
  end?: string;
  time?: string; // Standardized time field
  startTime?: string;
  endTime?: string;
  status?: string;
  assignedTo?: number | string;
  createdBy?: number | string;
  totalValue?: number;
  categoryId?: number;
  category?: string; // Readable category name
  vehicleId?: number | string;
  carNumber?: string; // Unified vehicle number field
  serviceId?: string;
  serviceNumber?: string;
  line?: string;
  extraHours?: number;
  tip?: boolean;
  tipValue?: number;
  [key: string]: unknown;
}

export interface User {
  id: number | string;
  internalNumber?: string;
  /** Número interno del empleado (legajo). */
  legajo?: string;
  /** Apellido para listados y Dashboard. */
  apellido?: string;
  /** ID del coche asignado si es propietario/fijo (UCOT 2026). */
  internalNumber_coche_fijo?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  role?: string;
  /** Campo alternativo de rol (compatibilidad legacy) */
  rol?: string;
  email?: string;
  uid?: string;
  assignedVehicleId?: string;
  datos_personales?: { nombre?: string; apellido?: string };
  datos_empresa?: { legajo?: string };
  [key: string]: unknown;
}

export interface Vehicle {
  id: number | string;
  internalNumber?: string;
  plate?: string;
  brand?: string;
  model?: string;
  capacity?: number;
  status?: string;
  make?: string;
  year?: string;
  /** Categoría del vehículo (ej: Híbrido, Piso Bajo, MT15) */
  category?: string;
  /** ID de categoría en colección vehicle_categories */
  categoryId?: string;
  /** Fotos/documentos subidos del vehículo */
  photos?: Array<{ url: string; name?: string }>;
  features?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Categoría de vehículo — colección Firestore: vehicle_categories */
export interface VehicleCategory {
  id?: string;
  name: string;
  description?: string;
  color?: string;
  createdAt?: string;
  [key: string]: unknown;
}

/** Alerta de Conflicto de Asignación (R1/R2/R3 UCOT_BUSINESS_RULES) */
export interface AssignmentConflict {
  id: string;
  type: 'Conflicto de Asignación';
  shiftId?: string;
  serviceId?: string;
  vehicleId?: string;
  driverId?: string;
  guardId?: string;
  driverName?: string;
  guardName?: string;
  vehicleInternalNumber?: string;
  message?: string;
  status: 'open' | 'resolved';
  createdAt?: string;
  resolvedAt?: string;
  [key: string]: unknown;
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  affectedLine?: string;
  status: 'ACTIVO' | 'RESUELTO';
  createdAt: string;
  vehicleNumber?: string;
  [key: string]: unknown;
}

export interface ServiceItem {
  id: string;
  tenantId: string;
  seasonId: string;
  serviceCode: string;
  serviceNumber: string;
  startTime: string;
  endTime?: string;
  lineCode: string;
  line?: string;
  vehicleType?: string;
  vehicleInternalNumber?: string;
  driverInternalNumber?: string;
  assignedTo?: string;
  routeData: string;
  status?: string;
  [key: string]: unknown;
}

export interface CartonHeader {
  id: string;
  location: string;
  isStop?: boolean;
}

export interface CartonRow {
  id: string;
  times: Record<string, string>;
}

export interface Carton {
  id: string;
  serviceNumber: string;
  linea: string;
  line: string;
  title: string;
  headers: CartonHeader[];
  rawMatrix: Array<{ checkpoints: string[] }>;
  routeData: {
    headers: CartonHeader[];
    rows: CartonRow[];
  };
  temporada?: string;
  tipo_dia?: string;
  [key: string]: unknown;
}
