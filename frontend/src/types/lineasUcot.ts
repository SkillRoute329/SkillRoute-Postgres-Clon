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

export interface LineaUCOT {
  codigo: string;
  numeroAPI: string;
  nombre: string;
  /** Compañía operadora (ej. UCOT, COME, CUCTSA). */
  empresa?: string;
  /** Origen del recorrido (ej. "PLAYA MALVÍN"). */
  origen?: string;
  /** Destino del recorrido (ej. "URUGUAY Y FLORIDA"). */
  destino?: string;
  varianteIdx: number;
  paradas: ParadaUcot[];
  recorrido: PuntoLatLng[];
  desviosFijos: DesvioFijo[];
  desviosTemporales: DesvioTemporal[];
  ultimaActualizacion: Timestamp;
}
