/**
 * Tipos para la colección Firestore lineas_ucot (Navegador UCOT).
 * Esquema 12.4 — fuente: API Montevideo + desvíos locales.
 */
import type { Timestamp } from 'firebase/firestore';

export interface ParadaUcot {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  orden: number;
}

export interface PuntoLatLng {
  lat: number;
  lng: number;
}

export interface DesvioFijo {
  id: string;
  tipo: 'feria' | 'obra' | 'permanente';
  descripcion: string;
  puntoDesde: PuntoLatLng;
  puntoHasta: PuntoLatLng;
  rutaAlternativa: PuntoLatLng[];
  activo: boolean;
  creadoEn: Timestamp;
}

/** Tipos de reporte en ruta (tipo Waze): conductor documenta lo que ve. */
export type TipoDesvioTemporal =
  | 'accidente'
  | 'obra_temp'
  | 'corte'
  | 'pozo'
  | 'desvio_momentaneo'
  | 'obstaculo'
  | 'otro';

export interface DesvioTemporal {
  id: string;
  tipo: TipoDesvioTemporal;
  descripcion: string;
  puntoAfectado: PuntoLatLng;
  activo: boolean;
  creadoEn: Timestamp;
  expiraEn: Timestamp | null;
  reportadoPor: string;
}

/** Sentido de marcha del recorrido */
export type SentidoLinea = 'IDA' | 'VUELTA';

/** Horario de salida desde terminal */
export interface HorarioSalida {
  /** Hora en formato "HH:mm" (ej: "06:15") */
  hora: string;
  /** Día de semana: 'L-V' | 'SAB' | 'DOM' | 'FERIADO' */
  tipoDia: 'L-V' | 'SAB' | 'DOM' | 'FERIADO';
  /** Nombre de la terminal de salida */
  terminal: string;
}

/** Entrada de horario completa para una variante */
export interface ScheduleEntry {
  /** Código de variante (ej: '370a') */
  variantCode: string;
  /** Sentido */
  sentido: SentidoLinea;
  /** Terminal de origen */
  terminalOrigen: string;
  /** Terminal de destino */
  terminalDestino: string;
  /** Lista de horarios de salida */
  salidas: HorarioSalida[];
  /** Tiempo de ciclo estimado en minutos */
  tiempoCicloMin: number;
}

export interface LineaUCOT {
  codigo: string;
  numeroAPI: string;
  nombre: string;
  /** Compañía operadora (ej. UCOT, COME, CUCTSA). */
  empresa?: string;
  /** Sentido: IDA o VUELTA (derivado de la variante a/b). */
  sentido?: SentidoLinea;
  /** Origen del recorrido (ej. "PLAYA MALVÍN"). */
  origen?: string;
  /** Destino del recorrido (ej. "URUGUAY Y FLORIDA"). */
  destino?: string;
  /** Terminal de salida para esta variante. */
  terminalSalida?: string;
  /** Terminal de llegada para esta variante. */
  terminalLlegada?: string;
  varianteIdx: number;
  paradas: ParadaUcot[];
  recorrido: PuntoLatLng[];
  desviosFijos: DesvioFijo[];
  desviosTemporales: DesvioTemporal[];
  /** Horarios de salida para esta variante (se cargan desde scheduleService). */
  horarios?: HorarioSalida[];
  ultimaActualizacion: Timestamp;
}
