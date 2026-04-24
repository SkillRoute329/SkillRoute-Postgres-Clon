/**
 * Tipos para la colección Firestore "inspections".
 * Control de Inspectores / Auditoría de pasada en puntos de control.
 * No modifica cartons.ts ni sus subcolecciones.
 */

import type { Timestamp } from 'firebase/firestore';

/** Carga de pasajeros: valor exacto o categoría rápida para el inspector */
export type PassengerLoadValue = number | PassengerLoadCategory;

export const PassengerLoadCategory = {
  BAJO: 'BAJO',
  MEDIO: 'MEDIO',
  ALTO: 'ALTO',
  VACIO: 'VACIO',
  SENTADOS: 'SENTADOS',
  LLENO: 'LLENO',
  EXPLOTADO: 'EXPLOTADO',
} as const;
export type PassengerLoadCategory =
  (typeof PassengerLoadCategory)[keyof typeof PassengerLoadCategory];

/**
 * Documento de la colección "inspections".
 * Una inspección = una pasada registrada en un punto de control para un servicio/cartón.
 */
export interface Inspection {
  /** ID del documento (opcional en creación; Firestore lo asigna) */
  id?: string;

  /** ID del cartón/servicio (ej. servicio en lineas/{lineId}/servicios/{serviceId}) */
  cartonServiceId: string;

  /** ID de la línea (ej. "300a", "300b") para filtros y analítica */
  lineId: string;

  /** ID del punto de control (parada/checkpoint). Puede ser índice numérico o ID de parada */
  controlPointId: string;

  /** Fecha del servicio (YYYY-MM-DD). Misma jornada que la pasada */
  serviceDate: string;

  /** Hora programada en el cartón (HH:mm). Horario teórico en ese punto */
  scheduledTime: string;

  /** Hora real de pasada: timestamp absoluto (guardado en Firestore como Timestamp) */
  actualPassedAt: Timestamp;

  /**
   * Diferencia en minutos: real - programada.
   * > 0 = atraso, < 0 = adelanto, 0 = en hora.
   * Calculado en frontend en el momento del click.
   */
  timeDeltaMinutes: number;

  /**
   * Carga de pasajeros: número exacto o categoría ('BAJO' | 'MEDIO' | 'ALTO').
   */
  passengerLoad: PassengerLoadValue;

  /** UID del inspector que registró (opcional, para trazabilidad) */
  inspectorId?: string;

  /** URL de foto adjunta (opcional), vinculada al servicioId */
  photoUrl?: string;

  /**
   * Mes+1 #7 (2026-04-23): coordenadas GPS del dispositivo del inspector al
   * momento de la captura. Opcionales — pueden faltar si el navegador no
   * tiene permiso o la geolocalización falla.
   */
  lat?: number;
  lng?: number;

  /** Momento de creación del registro (opcional) */
  createdAt?: Timestamp;
}

/** Datos mínimos para crear una inspección (sin id ni createdAt) */
export type InspectionCreate = Omit<Inspection, 'id' | 'createdAt'>;
