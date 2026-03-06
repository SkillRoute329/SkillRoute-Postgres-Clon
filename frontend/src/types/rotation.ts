/**
 * Modelado de datos para el Motor de Rotación de Personal.
 * Colecciones Firestore: personal, reglas_rotacion; asignaciones generadas en daily_shifts o rotacion_asignaciones.
 */

/** Regímenes de rotación soportados (extensible). */
export type RegimenRotacion = '15_15' | 'semana_semana' | 'fijo';

/** Patrón de descanso semanal. */
export type PatronDescanso =
  | 'fin_de_semana_rotativo' // sábado/domingo alternado
  | 'sabado'
  | 'domingo'
  | 'lunes'
  | 'martes'
  | 'miercoles'
  | 'jueves'
  | 'viernes';

/** Turno del día (mañana, tarde, etc.). */
export type TurnoActual = 1 | 2 | 3;

export interface ReglaRotacion {
  id?: string;
  nombre: string;
  regimen: RegimenRotacion;
  patronDescanso: PatronDescanso;
  /** Descripción opcional para el administrador. */
  descripcion?: string;
  activo?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/**
 * Personal con datos de rotación (vinculado a User por userId/internalNumber).
 * Almacenado en colección "personal" (o "personal_rotacion") en Firestore.
 */
export interface PersonalRotacion {
  id?: string;
  userId?: string;
  internalNumber: string;
  fullName?: string;
  /** Coche asignado fijo; null = personal "de lista" (retén). */
  cocheFijo: string | null;
  /** Referencia a reglas_rotacion.id. */
  reglaId: string;
  /** Turno actual en el ciclo: 1 (T1), 2 (T2), 3 (T3). */
  turnoActual: TurnoActual;
  /** Patrón de descanso (puede sobrescribir el de la regla). */
  patronDescanso: PatronDescanso;
  /** Día de la semana fijo para descanso (0=domingo, 6=sábado) si aplica. */
  diaDescansoSemana?: number;
  activo?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/**
 * Una asignación generada por el motor para un día/servicio/vehículo.
 */
export interface AsignacionGenerada {
  date: string;
  vehicleId: string;
  vehicleInternalNumber: string;
  serviceId: string;
  serviceNumber: string;
  lineCode?: string;
  startTime?: string;
  endTime?: string;
  /** Id del conductor asignado (personal con coche fijo); null = hueco para Listero (de lista). */
  driverId: string | null;
  internalNumber?: string;
  fullName?: string;
  /** 1 = T1 (mañana), 2 = T2 (tarde), 3 = T3 si aplica. */
  turno: TurnoActual;
  /** true si el conductor es "de lista" (retén). */
  esLista: boolean;
  /** true si este día es el descanso del conductor. */
  diaLibre?: boolean;
  [key: string]: unknown;
}

/** Entrada de cartón/servicio para el motor (desde Matriz o Cartones). */
export interface ServicioCarton {
  serviceNumber: string;
  lineCode: string;
  startTime: string;
  endTime?: string;
  vehicleInternalNumber?: string;
  dayType?: string;
  [key: string]: unknown;
}

/** Vehículo mínimo para el motor. */
export interface VehiculoRotacion {
  id: string;
  internalNumber: string;
  status?: string;
  [key: string]: unknown;
}
