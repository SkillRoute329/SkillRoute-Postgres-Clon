/**
 * LineInspectorAgent — Agente Inspector Digital por Línea UCOT
 * ============================================================
 * Cada instancia es un inspector especializado en UNA línea.
 * Conoce todo lo que sabría un inspector humano:
 *   - Recorrido real (GPS verificado)
 *   - Frecuencias y horarios por franja horaria
 *   - Rivales que comparten corredor geográfico (verificado)
 *   - Métricas de recaudación estimada
 *   - Alertas de headway (separación entre buses)
 *   - Incidencias activas en el recorrido
 *   - Pasajeros estimados por tramo
 */

import { getLineVariants } from './ucotLinesService';
import type { LineaUCOT } from '../types/lineasUcot';
import {
  CompetitorIntelligenceEngine,
  type ReporteInteligenciaCompetitiva,
} from './CompetitorIntelligenceEngine';
import { getMasterLineas } from '../data/ucotMaster';
import { STMScheduleService, type STMScheduleItem } from './stmScheduleService';
import { haversineKm as geoHaversineKm } from '../utils/geomath';

// ─── Tipos de Inspector ──────────────────────────────────────────────────────

export interface FrequencyBand {
  label: string; // "Hora pico mañana"
  horaInicio: string; // "06:30"
  horaFin: string; // "09:00"
  frecuenciaMin: number; // Minutos entre salidas
  diasAplica: ('LUN' | 'MAR' | 'MIE' | 'JUE' | 'VIE' | 'SAB' | 'DOM')[];
}

export interface RivalVerificado {
  lineId: string;
  empresa: string;
  /** Porcentaje estimado de recorrido compartido con UCOT */
  solapamientoPct: number;
  /** Tramo donde compiten directamente */
  tramoCompartido: string;
  /** Frecuencia del rival en minutos (estimada) */
  frecuenciaRivalMin?: number;
}

export interface BusPosition {
  lat: number;
  lng: number;
  interno?: string;
  variante?: string;
  timestamp?: number;
}

export interface AlertaHeadway {
  tipo: 'AGRUPAMIENTO' | 'HUECO' | 'OK';
  mensaje: string;
  gravedad: 'CRITICO' | 'ADVERTENCIA' | 'NORMAL';
  minutosDesviacion?: number;
  /** Buses detectados en agrupamiento (bunching) */
  bunchingPares?: Array<{ interno1: string; interno2: string; distanciaKm: number }>;
  /** Buses con GPS activo */
  busesConGPS?: number;
  /** Distancia promedio entre buses consecutivos (km) */
  separacionPromedioKm?: number;
}

/** Fórmula de Haversine: distancia en km entre dos coordenadas GPS */
// FASE 5.16: delega en utils/geomath (fuente única). API local intacta.
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return geoHaversineKm(lat1, lng1, lat2, lng2);
}

export interface MetricaRecaudacion {
  pasajerosEstimadosDia: number;
  tarifaPromedio: number; // UYU
  recaudacionEstimadaDia: number; // UYU
  ocupacionPromedioPct: number; // 0-100
  /** Tramo de mayor demanda */
  tramoHotspot?: string;
}

export interface InspectorReport {
  lineId: string;
  timestamp: Date;
  idaData: LineaUCOT | null;
  vueltaData: LineaUCOT | null;
  /** Alertas de headway detectadas */
  alertas: AlertaHeadway[];
  /** Métricas de recaudación */
  metricas: MetricaRecaudacion;
  /** Rivales activos en el corredor ahora mismo */
  rivalesActivos: RivalVerificado[];
  /** Resumen ejecutivo para la UI */
  resumenEjecutivo: string;
  /** Horarios oficiales obtenidos directamente desde la intendencia STM de mvd */
  horariosSTMOficiales: STMScheduleItem[];
}

// ─── Datos de líneas verificados geográficamente ────────────────────────────
// Fuente: análisis de recorridos reales del GeoServer IMM + operación UCOT

export interface LineInspectorConfig {
  lineId: string;
  nombreComercial: string;
  empresa: 'UCOT';
  /** Terminales reales */
  terminalA: string;
  terminalB: string;
  /** Zonas/barrios principales que sirve la línea (para detección automática de competencia) */
  zonasServidas: string[];
  /** Kilómetros totales del recorrido (IDA) */
  kmRecorrido: number;
  /** Capacidad del vehículo (pasajeros sentados) */
  capacidadVehiculo: number;
  /** Frecuencias por franja horaria */
  frecuencias: FrequencyBand[];
  /** Rivales verificados manualmente — complementa el motor automático */
  rivalesVerificados: RivalVerificado[];
  /** BBox del corredor [latMin, lngMin, latMax, lngMax] */
  corridorBbox: [number, number, number, number];
  /** Tramos de alta demanda (para alertas de recaudación) */
  tramosAlaDemanda: string[];
}

// ─── Configuración de cada línea UCOT ───────────────────────────────────────

export const LINE_INSPECTOR_CONFIGS: Record<string, LineInspectorConfig> = {
  // ─────────────────────────────────────────────────────────────────────────
  // NOTA: 18 líneas UCOT verificadas — fuente oficial: IMM/STM + Cartones UCOT 2026
  // IDs: 221, 300, 306, 316, 328, 329, 330, 370, 396,
  //      CE1, DM1, L-12, L-13, L-31, L-32, L-33, XA1, XA2
  // ELIMINADAS: 317, 371, 379 (eran líneas Cutcsa 17/71/79 con prefijo erróneo)
  // ─────────────────────────────────────────────────────────────────────────

  // 317, 371, 379: ELIMINADAS — eran líneas Cutcsa (17/71/79) con prefijo inventado
  // No existen en el registro oficial de la IMM para UCOT.

  'CE1': {
    lineId: 'CE1',
    nombreComercial: 'Línea CE1 — Corredor Este Expreso',
    empresa: 'UCOT',
    terminalA: 'Terminal Tres Cruces',
    terminalB: 'Ciudad de la Costa',
    zonasServidas: ['Tres Cruces', 'Av. Italia', 'Portones', 'Ciudad de la Costa'],
    kmRecorrido: 24.0,
    capacidadVehiculo: 85,
    frecuencias: [
      { label: 'Pico mañana', horaInicio: '06:00', horaFin: '09:30', frecuenciaMin: 12, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Valle día', horaInicio: '09:30', horaFin: '17:00', frecuenciaMin: 20, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Pico tarde', horaInicio: '17:00', horaFin: '20:30', frecuenciaMin: 12, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Nocturno', horaInicio: '20:30', horaFin: '23:00', frecuenciaMin: 30, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Finde', horaInicio: '07:00', horaFin: '22:00', frecuenciaMin: 25, diasAplica: ['SAB', 'DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '721', empresa: 'Copsa', solapamientoPct: 75, tramoCompartido: 'Av. Italia → Ciudad de la Costa', frecuenciaRivalMin: 15 },
      { lineId: '103', empresa: 'Cutcsa', solapamientoPct: 40, tramoCompartido: 'Av. Italia completa', frecuenciaRivalMin: 6 },
    ],
    corridorBbox: [-34.9, -56.15, -34.82, -55.95],
    tramosAlaDemanda: ['Tres Cruces (intercambiador)', 'Portones de Carrasco', 'Ciudad de la Costa'],
  },

  'DM1': {
    lineId: 'DM1',
    nombreComercial: 'Línea DM1 — Diagonal Metropolis 1',
    empresa: 'UCOT',
    terminalA: 'Terminal Paso del Molino',
    terminalB: 'Intercambiador Belloni',
    zonasServidas: ['Paso del Molino', 'Av. Lezica', 'Goes', 'Av. Italia', 'Schroeder', 'Belloni'],
    kmRecorrido: 18.5,
    capacidadVehiculo: 80,
    frecuencias: [
      { label: 'Pico mañana', horaInicio: '06:00', horaFin: '09:00', frecuenciaMin: 15, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Valle día', horaInicio: '09:00', horaFin: '17:00', frecuenciaMin: 22, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Pico tarde', horaInicio: '17:00', horaFin: '20:00', frecuenciaMin: 15, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Nocturno', horaInicio: '20:00', horaFin: '23:00', frecuenciaMin: 30, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Finde', horaInicio: '07:00', horaFin: '22:00', frecuenciaMin: 28, diasAplica: ['SAB', 'DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '181', empresa: 'Cutcsa', solapamientoPct: 60, tramoCompartido: 'Av. Italia → Schroeder', frecuenciaRivalMin: 8 },
      { lineId: '196', empresa: 'Cutcsa', solapamientoPct: 50, tramoCompartido: 'Goes → Belloni', frecuenciaRivalMin: 10 },
    ],
    corridorBbox: [-34.91, -56.22, -34.84, -56.06],
    tramosAlaDemanda: ['Paso del Molino (intercambiador)', 'Av. Italia y Propios', 'Belloni'],
  },



  '300': {
    lineId: '300',
    nombreComercial: 'Línea 300 — Cementerio Central / Instrucciones',
    empresa: 'UCOT',
    terminalA: 'Cementerio Central',
    terminalB: 'Instrucciones y Belloni',
    zonasServidas: [
      'Cementerio Central',
      'Centro',
      '18 de Julio',
      'Av. Italia',
      'Instrucciones',
      'Belloni',
    ],
    kmRecorrido: 16.8,
    capacidadVehiculo: 80,
    frecuencias: [
      {
        label: 'Pico mañana',
        horaInicio: '06:00',
        horaFin: '09:00',
        frecuenciaMin: 12,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Valle día',
        horaInicio: '09:00',
        horaFin: '17:00',
        frecuenciaMin: 20,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Pico tarde',
        horaInicio: '17:00',
        horaFin: '20:00',
        frecuenciaMin: 12,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Nocturno',
        horaInicio: '20:00',
        horaFin: '23:00',
        frecuenciaMin: 28,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Sábado',
        horaInicio: '06:30',
        horaFin: '22:30',
        frecuenciaMin: 22,
        diasAplica: ['SAB'],
      },
      {
        label: 'Domingo',
        horaInicio: '08:00',
        horaFin: '21:00',
        frecuenciaMin: 35,
        diasAplica: ['DOM'],
      },
    ],
    rivalesVerificados: [
      {
        lineId: '161',
        empresa: 'Copsa',
        solapamientoPct: 55,
        tramoCompartido: 'Av. Italia → Instrucciones',
        frecuenciaRivalMin: 15,
      },
      {
        lineId: '162',
        empresa: 'Copsa',
        solapamientoPct: 50,
        tramoCompartido: 'Av. Italia → Belloni',
        frecuenciaRivalMin: 18,
      },
      {
        lineId: '163',
        empresa: 'Copsa',
        solapamientoPct: 40,
        tramoCompartido: 'Instrucciones y Belloni',
        frecuenciaRivalMin: 20,
      },
    ],
    corridorBbox: [-34.92, -56.2, -34.83, -56.05],
    tramosAlaDemanda: ['Av. Italia y Propios', 'Instrucciones y Rivera', 'Belloni'],
  },

  '17': {
    lineId: '17',
    nombreComercial: 'Línea 17 — Terminal Casabó / Punta Carretas',
    empresa: 'UCOT',
    terminalA: 'Terminal Casabó',
    terminalB: 'Punta Carretas',
    zonasServidas: [
      'Casabó',
      'Cno. Ramírez',
      'Ciudad Vieja',
      'Centro',
      'Rambla Sur',
      'Pocitos',
      'Punta Carretas',
    ],
    kmRecorrido: 18.5,
    capacidadVehiculo: 80,
    // Horarios derivados de scraping STM (id 508) 2026-04-19:
    //   Hábiles 123 salidas / freq dominante 19 min / ventana 01:32-23:25
    //   Sábados 64 salidas / freq dominante 41 min
    //   Domingos 44 salidas / freq dominante 60 min
    frecuencias: [
      {
        label: 'Pico mañana',
        horaInicio: '06:00',
        horaFin: '09:00',
        frecuenciaMin: 15,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Valle día',
        horaInicio: '09:00',
        horaFin: '17:00',
        frecuenciaMin: 22,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Pico tarde',
        horaInicio: '17:00',
        horaFin: '20:00',
        frecuenciaMin: 15,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Nocturno',
        horaInicio: '20:00',
        horaFin: '23:25',
        frecuenciaMin: 30,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Sábado',
        horaInicio: '01:32',
        horaFin: '23:10',
        frecuenciaMin: 41,
        diasAplica: ['SAB'],
      },
      {
        label: 'Domingo',
        horaInicio: '01:32',
        horaFin: '23:25',
        frecuenciaMin: 60,
        diasAplica: ['DOM'],
      },
    ],
    rivalesVerificados: [
      {
        lineId: '185',
        empresa: 'Cutcsa',
        solapamientoPct: 75,
        tramoCompartido: 'Casabó → Cno. Ramírez → Ciudad Vieja',
        frecuenciaRivalMin: 12,
      },
      {
        lineId: '147',
        empresa: 'Cutcsa',
        solapamientoPct: 60,
        tramoCompartido: 'Ciudad Vieja → Bvar. Artigas → Punta Carretas',
        frecuenciaRivalMin: 10,
      },
      {
        lineId: '148',
        empresa: 'Cutcsa',
        solapamientoPct: 40,
        tramoCompartido: 'Cno. Ramírez → Ciudad Vieja → 18 de Julio',
        frecuenciaRivalMin: 8,
      },
    ],
    corridorBbox: [-34.93, -56.3, -34.87, -56.15],
    tramosAlaDemanda: [
      'Cno. Ramírez y Millán',
      'Ciudad Vieja (Aduana)',
      'Bvar. Artigas',
      'Punta Carretas',
    ],
  },

  '79': {
    lineId: '79',
    nombreComercial: 'Línea 79 — Ciudadela / Intercambiador Belloni',
    empresa: 'UCOT',
    terminalA: 'Ciudadela (Ciudad Vieja)',
    terminalB: 'Intercambiador Belloni',
    zonasServidas: [
      'Ciudad Vieja',
      'Centro',
      '18 de Julio',
      'Cordón',
      'Av. Italia',
      'Belloni',
    ],
    kmRecorrido: 11.0,
    capacidadVehiculo: 80,
    // Horarios derivados de scraping STM (id 551) 2026-04-19:
    //   Hábiles 43 salidas / freq dominante 37 min / ventana 06:00-19:24
    //   Sábados 16 salidas / freq dominante 100 min / variante ramal desde Uruguay/F.Crespo
    //   Domingos 9 salidas / freq dominante 95 min
    frecuencias: [
      {
        label: 'Pico mañana',
        horaInicio: '06:00',
        horaFin: '09:00',
        frecuenciaMin: 25,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Valle día',
        horaInicio: '09:00',
        horaFin: '17:00',
        frecuenciaMin: 40,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Pico tarde',
        horaInicio: '17:00',
        horaFin: '19:24',
        frecuenciaMin: 30,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Sábado',
        horaInicio: '07:00',
        horaFin: '19:23',
        frecuenciaMin: 100,
        diasAplica: ['SAB'],
      },
      {
        label: 'Domingo',
        horaInicio: '10:20',
        horaFin: '16:38',
        frecuenciaMin: 95,
        diasAplica: ['DOM'],
      },
    ],
    rivalesVerificados: [
      {
        lineId: '103',
        empresa: 'Cutcsa',
        solapamientoPct: 85,
        tramoCompartido: 'Belloni → Av. Italia → 18 de Julio → Ciudad Vieja (mismo par OD)',
        frecuenciaRivalMin: 6,
      },
      {
        lineId: '180',
        empresa: 'Cutcsa',
        solapamientoPct: 55,
        tramoCompartido: 'Av. Italia → Belloni',
        frecuenciaRivalMin: 15,
      },
      {
        lineId: '125',
        empresa: 'Cutcsa',
        solapamientoPct: 45,
        tramoCompartido: '18 de Julio → Cordón',
        frecuenciaRivalMin: 7,
      },
    ],
    corridorBbox: [-34.92, -56.22, -34.87, -56.09],
    tramosAlaDemanda: [
      'Ciudadela / Plaza Independencia',
      '18 de Julio y Ejido',
      'Av. Italia y Propios',
      'Intercambiador Belloni',
    ],
  },

  '306': {
    lineId: '306',
    nombreComercial: 'Línea 306 — Casabó / Géant',
    empresa: 'UCOT',
    terminalA: 'Casabó',
    terminalB: 'Géant (Las Piedras)',
    zonasServidas: ['Casabó', 'Cno. Ramírez', 'Paso de la Arena', 'Ruta 1', 'Las Piedras', 'Géant'],
    kmRecorrido: 22.5,
    capacidadVehiculo: 80,
    frecuencias: [
      {
        label: 'Pico mañana',
        horaInicio: '06:00',
        horaFin: '09:00',
        frecuenciaMin: 15,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Valle día',
        horaInicio: '09:00',
        horaFin: '17:00',
        frecuenciaMin: 25,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Pico tarde',
        horaInicio: '17:00',
        horaFin: '20:00',
        frecuenciaMin: 15,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Nocturno',
        horaInicio: '20:00',
        horaFin: '23:00',
        frecuenciaMin: 35,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Sábado',
        horaInicio: '06:30',
        horaFin: '22:00',
        frecuenciaMin: 28,
        diasAplica: ['SAB'],
      },
      {
        label: 'Domingo',
        horaInicio: '08:00',
        horaFin: '20:00',
        frecuenciaMin: 40,
        diasAplica: ['DOM'],
      },
    ],
    rivalesVerificados: [
      {
        lineId: '185',
        empresa: 'Cutcsa',
        solapamientoPct: 70,
        tramoCompartido: 'Cno. Ramírez → Ruta 1 → Paso de la Arena',
        frecuenciaRivalMin: 12,
      },
      {
        lineId: 'G',
        empresa: 'Gómez',
        solapamientoPct: 60,
        tramoCompartido: 'Ruta 1 → Géant',
        frecuenciaRivalMin: 20,
      },
    ],
    corridorBbox: [-34.95, -56.3, -34.75, -56.1],
    tramosAlaDemanda: ['Cno. Ramírez y Millán', 'Ruta 1 (Paso de la Arena)', 'Géant'],
  },

  '316': {
    lineId: '316',
    nombreComercial: 'Línea 316 — Cno. Maldonado / Pocitos',
    empresa: 'UCOT',
    terminalA: 'Cno. Maldonado',
    terminalB: 'Pocitos',
    zonasServidas: ['Cno. Maldonado', 'Aparicio Saravia', 'Av. Millán', 'Garzón', 'Pocitos'],
    kmRecorrido: 11.2,
    capacidadVehiculo: 75,
    frecuencias: [
      {
        label: 'Pico mañana',
        horaInicio: '06:30',
        horaFin: '09:00',
        frecuenciaMin: 12,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Valle día',
        horaInicio: '09:00',
        horaFin: '17:00',
        frecuenciaMin: 20,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Pico tarde',
        horaInicio: '17:00',
        horaFin: '20:00',
        frecuenciaMin: 12,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Nocturno',
        horaInicio: '20:00',
        horaFin: '23:00',
        frecuenciaMin: 28,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Sábado',
        horaInicio: '06:30',
        horaFin: '22:30',
        frecuenciaMin: 22,
        diasAplica: ['SAB'],
      },
      {
        label: 'Domingo',
        horaInicio: '08:00',
        horaFin: '21:00',
        frecuenciaMin: 32,
        diasAplica: ['DOM'],
      },
    ],
    rivalesVerificados: [
      {
        lineId: '186',
        empresa: 'Cutcsa',
        solapamientoPct: 65,
        tramoCompartido: 'Av. Millán → Garzón → Pocitos',
        frecuenciaRivalMin: 10,
      },
      {
        lineId: '187',
        empresa: 'Cutcsa',
        solapamientoPct: 55,
        tramoCompartido: 'Av. Millán → Pocitos',
        frecuenciaRivalMin: 12,
      },
      {
        lineId: '188',
        empresa: 'Cutcsa',
        solapamientoPct: 40,
        tramoCompartido: 'Garzón → Pocitos',
        frecuenciaRivalMin: 15,
      },
    ],
    corridorBbox: [-34.91, -56.18, -34.86, -56.1],
    tramosAlaDemanda: [
      'Av. Millán y Garzón',
      'Pocitos (Bvar. España)',
      'Cno. Maldonado y Aparicio Saravia',
    ],
  },

  '328': {
    lineId: '328',
    nombreComercial: 'Línea 328 — Punta Carretas / Mendoza',
    empresa: 'UCOT',
    terminalA: 'Punta Carretas',
    terminalB: 'Mendoza (Est. Goes)',
    zonasServidas: ['Punta Carretas', 'Pocitos', 'Cordón', '18 de Julio', 'Goes', 'Mendoza'],
    kmRecorrido: 13.6,
    capacidadVehiculo: 80,
    frecuencias: [
      {
        label: 'Pico mañana',
        horaInicio: '06:00',
        horaFin: '09:00',
        frecuenciaMin: 10,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Valle día',
        horaInicio: '09:00',
        horaFin: '17:00',
        frecuenciaMin: 18,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Pico tarde',
        horaInicio: '17:00',
        horaFin: '20:00',
        frecuenciaMin: 10,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Nocturno',
        horaInicio: '20:00',
        horaFin: '23:00',
        frecuenciaMin: 25,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Sábado',
        horaInicio: '06:30',
        horaFin: '22:30',
        frecuenciaMin: 20,
        diasAplica: ['SAB'],
      },
      {
        label: 'Domingo',
        horaInicio: '08:00',
        horaFin: '21:00',
        frecuenciaMin: 30,
        diasAplica: ['DOM'],
      },
    ],
    rivalesVerificados: [
      {
        lineId: '125',
        empresa: 'Cutcsa',
        solapamientoPct: 70,
        tramoCompartido: 'Av. 18 de Julio → Goes → Mendoza',
        frecuenciaRivalMin: 7,
      },
      {
        lineId: '126',
        empresa: 'Cutcsa',
        solapamientoPct: 60,
        tramoCompartido: 'Av. 18 de Julio → Mendoza',
        frecuenciaRivalMin: 8,
      },
      {
        lineId: 'D1',
        empresa: 'Dinata',
        solapamientoPct: 35,
        tramoCompartido: 'Goes → Mendoza',
        frecuenciaRivalMin: 20,
      },
    ],
    corridorBbox: [-34.92, -56.2, -34.88, -56.13],
    tramosAlaDemanda: ['18 de Julio y Ejido', '18 de Julio y Yi', 'Goes y Mendoza'],
  },

  '329': {
    lineId: '329',
    nombreComercial: 'Línea 329 — Punta Carretas / Instrucciones',
    empresa: 'UCOT',
    terminalA: 'Punta Carretas',
    terminalB: 'Instrucciones (Manga)',
    zonasServidas: ['Punta Carretas', 'Pocitos', 'Av. Italia', 'Instrucciones', 'Manga'],
    kmRecorrido: 17.9,
    capacidadVehiculo: 80,
    frecuencias: [
      {
        label: 'Pico mañana',
        horaInicio: '06:00',
        horaFin: '09:00',
        frecuenciaMin: 12,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Valle día',
        horaInicio: '09:00',
        horaFin: '17:00',
        frecuenciaMin: 20,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Pico tarde',
        horaInicio: '17:00',
        horaFin: '20:00',
        frecuenciaMin: 12,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Nocturno',
        horaInicio: '20:00',
        horaFin: '23:00',
        frecuenciaMin: 28,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Sábado',
        horaInicio: '06:30',
        horaFin: '22:30',
        frecuenciaMin: 22,
        diasAplica: ['SAB'],
      },
      {
        label: 'Domingo',
        horaInicio: '08:00',
        horaFin: '21:00',
        frecuenciaMin: 35,
        diasAplica: ['DOM'],
      },
    ],
    rivalesVerificados: [
      {
        lineId: '181',
        empresa: 'Cutcsa',
        solapamientoPct: 75,
        tramoCompartido: 'Av. Italia → Instrucciones',
        frecuenciaRivalMin: 8,
      },
      {
        lineId: '182',
        empresa: 'Cutcsa',
        solapamientoPct: 60,
        tramoCompartido: 'Av. Italia → Instrucciones',
        frecuenciaRivalMin: 10,
      },
      {
        lineId: '183',
        empresa: 'Cutcsa',
        solapamientoPct: 55,
        tramoCompartido: 'Av. Italia → Manga',
        frecuenciaRivalMin: 12,
      },
    ],
    corridorBbox: [-34.92, -56.18, -34.83, -56.05],
    tramosAlaDemanda: ['Av. Italia y Propios', 'Av. Italia y Rivera', 'Instrucciones y Manga'],
  },

  '330': {
    lineId: '330',
    nombreComercial: 'Línea 330 — Cerro / Ciudad Vieja',
    empresa: 'UCOT',
    terminalA: 'Cerro (Villa del Cerro)',
    terminalB: 'Ciudad Vieja',
    zonasServidas: [
      'Cerro',
      'Villa del Cerro',
      'Cno. Ramírez',
      'Paso del Molino',
      'Bvar. Batlle',
      'Ciudad Vieja',
    ],
    kmRecorrido: 14.2,
    capacidadVehiculo: 80,
    frecuencias: [
      {
        label: 'Pico mañana',
        horaInicio: '06:00',
        horaFin: '09:00',
        frecuenciaMin: 10,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Valle día',
        horaInicio: '09:00',
        horaFin: '17:00',
        frecuenciaMin: 18,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Pico tarde',
        horaInicio: '17:00',
        horaFin: '20:00',
        frecuenciaMin: 10,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Nocturno',
        horaInicio: '20:00',
        horaFin: '23:00',
        frecuenciaMin: 25,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Sábado',
        horaInicio: '06:00',
        horaFin: '22:30',
        frecuenciaMin: 20,
        diasAplica: ['SAB'],
      },
      {
        label: 'Domingo',
        horaInicio: '07:30',
        horaFin: '21:00',
        frecuenciaMin: 30,
        diasAplica: ['DOM'],
      },
    ],
    rivalesVerificados: [
      {
        lineId: '148',
        empresa: 'Cutcsa',
        solapamientoPct: 80,
        tramoCompartido: 'Cerro → Cno. Ramírez → Ciudad Vieja',
        frecuenciaRivalMin: 8,
      },
      {
        lineId: '185',
        empresa: 'Cutcsa',
        solapamientoPct: 50,
        tramoCompartido: 'Cno. Ramírez → Ciudad Vieja',
        frecuenciaRivalMin: 12,
      },
      {
        lineId: '147',
        empresa: 'Cutcsa',
        solapamientoPct: 40,
        tramoCompartido: 'Villa del Cerro → Ciudad Vieja',
        frecuenciaRivalMin: 15,
      },
    ],
    corridorBbox: [-34.93, -56.3, -34.88, -56.2],
    tramosAlaDemanda: ['Cno. Ramírez y Millán', 'Bvar. Batlle y Ordóñez', 'Ciudad Vieja (Aduana)'],
  },

  '370': {
    lineId: '370',
    nombreComercial: 'Línea 370 — Cerro / Portones de Carrasco',
    empresa: 'UCOT',
    terminalA: 'Playa del Cerro',
    terminalB: 'Portones de Carrasco',
    zonasServidas: [
      'Cerro',
      'Rambla Sur',
      'Ciudad Vieja',
      'Punta Carretas',
      'Pocitos',
      'Bvar. Batlle',
      'Av. Italia',
      'Malvín',
      'Carrasco',
      'Portones de Carrasco',
    ],
    kmRecorrido: 28.7,
    capacidadVehiculo: 85,
    frecuencias: [
      {
        label: 'Pico mañana',
        horaInicio: '06:00',
        horaFin: '09:00',
        frecuenciaMin: 8,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Valle día',
        horaInicio: '09:00',
        horaFin: '17:00',
        frecuenciaMin: 15,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Pico tarde',
        horaInicio: '17:00',
        horaFin: '20:00',
        frecuenciaMin: 8,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Nocturno',
        horaInicio: '20:00',
        horaFin: '23:30',
        frecuenciaMin: 20,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Sábado',
        horaInicio: '06:00',
        horaFin: '23:00',
        frecuenciaMin: 18,
        diasAplica: ['SAB'],
      },
      {
        label: 'Domingo',
        horaInicio: '07:00',
        horaFin: '22:00',
        frecuenciaMin: 25,
        diasAplica: ['DOM'],
      },
    ],
    rivalesVerificados: [
      {
        lineId: '110',
        empresa: 'Cutcsa',
        solapamientoPct: 85,
        tramoCompartido: 'Rambla Sur/Rep. → Av. Italia → Carrasco',
        frecuenciaRivalMin: 6,
      },
      {
        lineId: '103',
        empresa: 'Cutcsa',
        solapamientoPct: 65,
        tramoCompartido: 'Bvar. Artigas → Av. Italia',
        frecuenciaRivalMin: 6,
      },
      {
        lineId: '128',
        empresa: 'Cutcsa',
        solapamientoPct: 55,
        tramoCompartido: 'Rambla → Carrasco (vuelta)',
        frecuenciaRivalMin: 10,
      },
      {
        lineId: '137',
        empresa: 'Cutcsa',
        solapamientoPct: 50,
        tramoCompartido: 'Portones → Carrasco',
        frecuenciaRivalMin: 12,
      },
    ],
    corridorBbox: [-34.95, -56.3, -34.87, -56.0],
    tramosAlaDemanda: ['Rambla y Punta Carretas', 'Av. Italia y Propios', 'Portones (Carrasco)'],
  },

  '396': {
    lineId: '396',
    nombreComercial: 'Línea 396 — Punta Carretas / Instrucciones (Schroeder)',
    empresa: 'UCOT',
    terminalA: 'Punta Carretas',
    terminalB: 'Instrucciones (Schroeder)',
    zonasServidas: ['Punta Carretas', 'Pocitos', 'Av. Italia', 'Schroeder', 'Instrucciones'],
    kmRecorrido: 16.5,
    capacidadVehiculo: 80,
    frecuencias: [
      {
        label: 'Pico mañana',
        horaInicio: '06:00',
        horaFin: '09:00',
        frecuenciaMin: 12,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Valle día',
        horaInicio: '09:00',
        horaFin: '17:00',
        frecuenciaMin: 22,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Pico tarde',
        horaInicio: '17:00',
        horaFin: '20:00',
        frecuenciaMin: 12,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Nocturno',
        horaInicio: '20:00',
        horaFin: '23:00',
        frecuenciaMin: 28,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Sábado',
        horaInicio: '06:30',
        horaFin: '22:30',
        frecuenciaMin: 22,
        diasAplica: ['SAB'],
      },
      {
        label: 'Domingo',
        horaInicio: '08:00',
        horaFin: '21:00',
        frecuenciaMin: 35,
        diasAplica: ['DOM'],
      },
    ],
    rivalesVerificados: [
      {
        lineId: '181',
        empresa: 'Cutcsa',
        solapamientoPct: 65,
        tramoCompartido: 'Av. Italia → Instrucciones',
        frecuenciaRivalMin: 8,
      },
      {
        lineId: '196',
        empresa: 'Cutcsa',
        solapamientoPct: 70,
        tramoCompartido: 'Av. Italia → Schroeder → Instrucciones',
        frecuenciaRivalMin: 10,
      },
      {
        lineId: '197',
        empresa: 'Cutcsa',
        solapamientoPct: 55,
        tramoCompartido: 'Schroeder → Instrucciones',
        frecuenciaRivalMin: 12,
      },
    ],
    corridorBbox: [-34.92, -56.18, -34.83, -56.05],
    tramosAlaDemanda: [
      'Av. Italia y Propios',
      'Schroeder y Instrucciones',
      'Instrucciones y Belloni',
    ],
  },

  'XA1': {
    lineId: 'XA1',
    nombreComercial: 'Línea XA1 — Expreso Aeropuerto 1',
    empresa: 'UCOT',
    terminalA: 'Terminal Tres Cruces',
    terminalB: 'Aeropuerto Internacional de Carrasco',
    zonasServidas: ['Tres Cruces', 'Centro', 'Bvar. Artigas', 'Carrasco', 'Aeropuerto'],
    kmRecorrido: 20.5,
    capacidadVehiculo: 85,
    frecuencias: [
      { label: 'Madrugada/Nocturno', horaInicio: '00:00', horaFin: '05:59', frecuenciaMin: 25, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'] },
      { label: 'Diurno', horaInicio: '06:00', horaFin: '22:00', frecuenciaMin: 15, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Nocturno', horaInicio: '22:00', horaFin: '23:59', frecuenciaMin: 25, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Finde diurno', horaInicio: '06:00', horaFin: '23:59', frecuenciaMin: 20, diasAplica: ['SAB', 'DOM'] },
    ],
    rivalesVerificados: [
      { lineId: 'COT', empresa: 'COT', solapamientoPct: 70, tramoCompartido: 'Tres Cruces → Aeropuerto', frecuenciaRivalMin: 30 },
    ],
    corridorBbox: [-34.9, -56.18, -34.82, -55.95],
    tramosAlaDemanda: ['Terminal Tres Cruces', 'Carrasco (acceso)', 'Aeropuerto'],
  },

  'XA2': {
    lineId: 'XA2',
    nombreComercial: 'Línea XA2 — Expreso Aeropuerto 2 (Cerro)',
    empresa: 'UCOT',
    terminalA: 'Playa del Cerro',
    terminalB: 'Aeropuerto Internacional de Carrasco',
    zonasServidas: ['Cerro', 'Centro', 'Av. Italia', 'Carrasco', 'Aeropuerto'],
    kmRecorrido: 34.0,
    capacidadVehiculo: 85,
    frecuencias: [
      { label: 'Madrugada', horaInicio: '00:00', horaFin: '05:59', frecuenciaMin: 35, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'] },
      { label: 'Diurno', horaInicio: '06:00', horaFin: '22:00', frecuenciaMin: 18, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Nocturno', horaInicio: '22:00', horaFin: '23:59', frecuenciaMin: 30, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Finde', horaInicio: '06:00', horaFin: '23:59', frecuenciaMin: 25, diasAplica: ['SAB', 'DOM'] },
    ],
    rivalesVerificados: [
      { lineId: 'XA1', empresa: 'UCOT', solapamientoPct: 40, tramoCompartido: 'Av. Italia → Aeropuerto', frecuenciaRivalMin: 15 },
    ],
    corridorBbox: [-34.93, -56.28, -34.82, -55.95],
    tramosAlaDemanda: ['Centro (18 de Julio)', 'Av. Italia y Bvar. Batlle', 'Aeropuerto'],
  },

  'L12': {
    lineId: 'L12',
    nombreComercial: 'Línea L12 — Local 12 (Paso Carrasco)',
    empresa: 'UCOT',
    terminalA: 'Ciudad Vieja (Aduana)',
    terminalB: 'Paso Carrasco',
    zonasServidas: ['Ciudad Vieja', 'Centro', 'Bvar. Artigas', 'Pocitos', 'Malvín', 'Paso Carrasco'],
    kmRecorrido: 19.0,
    capacidadVehiculo: 75,
    frecuencias: [
      { label: 'Pico mañana', horaInicio: '06:30', horaFin: '09:00', frecuenciaMin: 15, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Valle', horaInicio: '09:00', horaFin: '17:00', frecuenciaMin: 25, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Pico tarde', horaInicio: '17:00', horaFin: '20:00', frecuenciaMin: 15, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Nocturno', horaInicio: '20:00', horaFin: '23:00', frecuenciaMin: 35, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Finde', horaInicio: '07:00', horaFin: '22:00', frecuenciaMin: 30, diasAplica: ['SAB', 'DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '104', empresa: 'Cutcsa', solapamientoPct: 55, tramoCompartido: 'Bvar. Artigas → Malvín', frecuenciaRivalMin: 10 },
    ],
    corridorBbox: [-34.91, -56.18, -34.86, -56.04],
    tramosAlaDemanda: ['Pocitos (Rambla)', 'Malvín (Av. Rivera)', 'Paso Carrasco'],
  },

  'L13': {
    lineId: 'L13',
    nombreComercial: 'Línea L13 — Local 13 (Punta de Rieles)',
    empresa: 'UCOT',
    terminalA: 'Terminal Tres Cruces',
    terminalB: 'Punta de Rieles',
    zonasServidas: ['Tres Cruces', 'Goes', 'Av. Millán', 'Instrucciones', 'Punta de Rieles'],
    kmRecorrido: 15.5,
    capacidadVehiculo: 75,
    frecuencias: [
      { label: 'Pico mañana', horaInicio: '06:00', horaFin: '09:00', frecuenciaMin: 18, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Valle', horaInicio: '09:00', horaFin: '17:00', frecuenciaMin: 28, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Pico tarde', horaInicio: '17:00', horaFin: '20:00', frecuenciaMin: 18, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Nocturno', horaInicio: '20:00', horaFin: '23:00', frecuenciaMin: 40, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Finde', horaInicio: '07:30', horaFin: '21:30', frecuenciaMin: 35, diasAplica: ['SAB', 'DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '196', empresa: 'Cutcsa', solapamientoPct: 60, tramoCompartido: 'Av. Instrucciones → Punta de Rieles', frecuenciaRivalMin: 10 },
    ],
    corridorBbox: [-34.9, -56.18, -34.84, -56.06],
    tramosAlaDemanda: ['Tres Cruces', 'Goes (Av. Millán)', 'Punta de Rieles'],
  },

  'L31': {
    lineId: 'L31',
    nombreComercial: 'Línea L31 — Local 31 (Sayago)',
    empresa: 'UCOT',
    terminalA: 'Terminal Paso del Molino',
    terminalB: 'Sayago (Av. Carlos María Ramírez)',
    zonasServidas: ['Paso del Molino', 'Belvedere', 'Sayago', 'Cno. Tomkinson'],
    kmRecorrido: 9.5,
    capacidadVehiculo: 75,
    frecuencias: [
      { label: 'Pico mañana', horaInicio: '06:30', horaFin: '09:00', frecuenciaMin: 20, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Valle', horaInicio: '09:00', horaFin: '17:00', frecuenciaMin: 30, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Pico tarde', horaInicio: '17:00', horaFin: '20:00', frecuenciaMin: 20, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Nocturno', horaInicio: '20:00', horaFin: '22:30', frecuenciaMin: 40, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Finde', horaInicio: '08:00', horaFin: '21:00', frecuenciaMin: 40, diasAplica: ['SAB', 'DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '155', empresa: 'Cutcsa', solapamientoPct: 50, tramoCompartido: 'Belvedere → Sayago', frecuenciaRivalMin: 18 },
    ],
    corridorBbox: [-34.88, -56.24, -34.84, -56.16],
    tramosAlaDemanda: ['Paso del Molino', 'Belvedere (Av. Millán)', 'Sayago centro'],
  },

  'L32': {
    lineId: 'L32',
    nombreComercial: 'Línea L32 — Local 32 (Manga)',
    empresa: 'UCOT',
    terminalA: 'Terminal Hipódromo de Maroñas',
    terminalB: 'Manga',
    zonasServidas: ['Hipódromo', 'Punta de Rieles', 'Manga'],
    kmRecorrido: 11.0,
    capacidadVehiculo: 75,
    frecuencias: [
      { label: 'Pico mañana', horaInicio: '06:00', horaFin: '09:00', frecuenciaMin: 22, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Valle', horaInicio: '09:00', horaFin: '17:00', frecuenciaMin: 32, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Pico tarde', horaInicio: '17:00', horaFin: '20:00', frecuenciaMin: 22, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Nocturno', horaInicio: '20:00', horaFin: '22:30', frecuenciaMin: 45, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Finde', horaInicio: '08:00', horaFin: '21:00', frecuenciaMin: 45, diasAplica: ['SAB', 'DOM'] },
    ],
    rivalesVerificados: [],
    corridorBbox: [-34.88, -56.1, -34.82, -56.0],
    tramosAlaDemanda: ['Hipódromo (intercambiador)', 'Punta de Rieles', 'Manga'],
  },

  'L33': {
    lineId: 'L33',
    nombreComercial: 'Línea L33 — Local 33 (Cno. Carrasco)',
    empresa: 'UCOT',
    terminalA: 'Terminal Tres Cruces',
    terminalB: 'Cno. Carrasco (Colonia Nicolich)',
    zonasServidas: ['Tres Cruces', 'Av. Italia', 'Cno. Carrasco', 'Colonia Nicolich'],
    kmRecorrido: 22.0,
    capacidadVehiculo: 75,
    frecuencias: [
      { label: 'Pico mañana', horaInicio: '06:00', horaFin: '09:00', frecuenciaMin: 20, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Valle', horaInicio: '09:00', horaFin: '17:00', frecuenciaMin: 30, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Pico tarde', horaInicio: '17:00', horaFin: '20:00', frecuenciaMin: 20, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Nocturno', horaInicio: '20:00', horaFin: '23:00', frecuenciaMin: 40, diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'] },
      { label: 'Finde', horaInicio: '07:30', horaFin: '22:00', frecuenciaMin: 35, diasAplica: ['SAB', 'DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '721', empresa: 'Copsa', solapamientoPct: 45, tramoCompartido: 'Cno. Carrasco → Nicolich', frecuenciaRivalMin: 20 },
    ],
    corridorBbox: [-34.88, -56.15, -34.82, -55.98],
    tramosAlaDemanda: ['Av. Italia y Cno. Carrasco', 'Colonia Nicolich'],
  },


  '71': {
    lineId: '71',
    nombreComercial: 'Línea 71 — Mendoza / Pocitos',
    empresa: 'UCOT',
    terminalA: 'Mendoza (Goes/Garzón)',
    terminalB: 'Pocitos (Bvar. España)',
    zonasServidas: ['Goes', 'Garzón', 'Av. Millán', 'Pocitos', 'Bvar. España'],
    kmRecorrido: 8.5,
    capacidadVehiculo: 75,
    frecuencias: [
      { label: 'Pico', horaInicio: '06:00', horaFin: '20:00', frecuenciaMin: 12, diasAplica: ['LUN','MAR','MIE','JUE','VIE'] },
      { label: 'Finde', horaInicio: '07:00', horaFin: '22:00', frecuenciaMin: 25, diasAplica: ['SAB','DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '187', empresa: 'Cutcsa', solapamientoPct: 70, tramoCompartido: 'Av. Millán → Pocitos', frecuenciaRivalMin: 8 },
    ],
    corridorBbox: [-34.9, -56.17, -34.87, -56.08],
    tramosAlaDemanda: ['Garzón y Millán', 'Pocitos (Bvar. España)'],
  },

  'PB': {
    lineId: 'PB',
    nombreComercial: 'Línea PB — Paso de los Baños',
    empresa: 'UCOT',
    terminalA: 'Terminal Casabó',
    terminalB: 'Ciudad Vieja (Aduana)',
    zonasServidas: ['Casabó', 'Paso de los Baños', 'Cno. Ramírez', 'Ciudad Vieja'],
    kmRecorrido: 14.5,
    capacidadVehiculo: 75,
    frecuencias: [
      { label: 'Pico', horaInicio: '06:00', horaFin: '20:00', frecuenciaMin: 20, diasAplica: ['LUN','MAR','MIE','JUE','VIE'] },
      { label: 'Finde', horaInicio: '07:00', horaFin: '21:00', frecuenciaMin: 35, diasAplica: ['SAB','DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '185', empresa: 'Cutcsa', solapamientoPct: 65, tramoCompartido: 'Cno. Ramírez → Ciudad Vieja', frecuenciaRivalMin: 12 },
    ],
    corridorBbox: [-34.93, -56.3, -34.9, -56.18],
    tramosAlaDemanda: ['Cno. Ramírez y Millán', 'Ciudad Vieja (Aduana)'],
  },

  '11A': {
    lineId: '11A',
    nombreComercial: 'Línea 11A — Casabó / Punta Carretas (Expreso)',
    empresa: 'UCOT',
    terminalA: 'Terminal Casabó',
    terminalB: 'Punta Carretas',
    zonasServidas: ['Casabó', 'Cno. Ramírez', 'Ciudad Vieja', 'Punta Carretas'],
    kmRecorrido: 17.5,
    capacidadVehiculo: 80,
    frecuencias: [
      { label: 'Pico', horaInicio: '06:00', horaFin: '20:00', frecuenciaMin: 15, diasAplica: ['LUN','MAR','MIE','JUE','VIE'] },
      { label: 'Finde', horaInicio: '07:00', horaFin: '21:00', frecuenciaMin: 30, diasAplica: ['SAB','DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '185', empresa: 'Cutcsa', solapamientoPct: 75, tramoCompartido: 'Cno. Ramírez → Ciudad Vieja', frecuenciaRivalMin: 12 },
    ],
    corridorBbox: [-34.93, -56.3, -34.87, -56.15],
    tramosAlaDemanda: ['Cno. Ramírez y Millán', 'Ciudad Vieja (Aduana)', 'Punta Carretas'],
  },

  '8SR': {
    lineId: '8SR',
    nombreComercial: 'Línea 8SR — Casabó / Centro (Rápido)',
    empresa: 'UCOT',
    terminalA: 'Terminal Casabó',
    terminalB: 'Centro (18 de Julio)',
    zonasServidas: ['Casabó', 'Cno. Ramírez', 'Ciudad Vieja', 'Centro'],
    kmRecorrido: 16.0,
    capacidadVehiculo: 80,
    frecuencias: [
      { label: 'Pico', horaInicio: '06:00', horaFin: '20:00', frecuenciaMin: 18, diasAplica: ['LUN','MAR','MIE','JUE','VIE'] },
      { label: 'Finde', horaInicio: '07:00', horaFin: '21:00', frecuenciaMin: 35, diasAplica: ['SAB','DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '185', empresa: 'Cutcsa', solapamientoPct: 70, tramoCompartido: 'Cno. Ramírez → Centro', frecuenciaRivalMin: 12 },
    ],
    corridorBbox: [-34.93, -56.3, -34.9, -56.17],
    tramosAlaDemanda: ['Cno. Ramírez y Millán', 'Centro (18 de Julio)'],
  },

  'LM12': {
    lineId: 'LM12',
    nombreComercial: 'Línea LM12 — Metropolitana 12 (Ciudad de la Costa)',
    empresa: 'UCOT',
    terminalA: 'Terminal Tres Cruces',
    terminalB: 'Ciudad de la Costa (Lomas de Solymar)',
    zonasServidas: ['Tres Cruces', 'Av. Italia', 'Carrasco', 'Ciudad de la Costa'],
    kmRecorrido: 28.0,
    capacidadVehiculo: 85,
    frecuencias: [
      { label: 'Pico', horaInicio: '06:00', horaFin: '21:00', frecuenciaMin: 22, diasAplica: ['LUN','MAR','MIE','JUE','VIE'] },
      { label: 'Finde', horaInicio: '07:00', horaFin: '22:00', frecuenciaMin: 40, diasAplica: ['SAB','DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '721', empresa: 'Copsa', solapamientoPct: 60, tramoCompartido: 'Av. Italia → Ciudad de la Costa', frecuenciaRivalMin: 18 },
    ],
    corridorBbox: [-34.9, -56.18, -34.83, -55.92],
    tramosAlaDemanda: ['Tres Cruces', 'Portones de Carrasco', 'Ciudad de la Costa'],
  },

  'LM13': {
    lineId: 'LM13',
    nombreComercial: 'Línea LM13 — Metropolitana 13 (Colonia Nicolich)',
    empresa: 'UCOT',
    terminalA: 'Terminal Tres Cruces',
    terminalB: 'Colonia Nicolich',
    zonasServidas: ['Tres Cruces', 'Cno. Carrasco', 'Ciudad de la Costa', 'Nicolich'],
    kmRecorrido: 34.0,
    capacidadVehiculo: 85,
    frecuencias: [
      { label: 'Pico', horaInicio: '06:00', horaFin: '21:00', frecuenciaMin: 28, diasAplica: ['LUN','MAR','MIE','JUE','VIE'] },
      { label: 'Finde', horaInicio: '07:00', horaFin: '21:00', frecuenciaMin: 50, diasAplica: ['SAB','DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '722', empresa: 'Copsa', solapamientoPct: 55, tramoCompartido: 'Ciudad de la Costa → Nicolich', frecuenciaRivalMin: 25 },
    ],
    corridorBbox: [-34.9, -56.18, -34.82, -55.85],
    tramosAlaDemanda: ['Tres Cruces', 'Ciudad de la Costa', 'Colonia Nicolich'],
  },

  'U11C': {
    lineId: 'U11C',
    nombreComercial: 'Línea U11C — Casabó / Terminal Cerro',
    empresa: 'UCOT',
    terminalA: 'Terminal Casabó',
    terminalB: 'Terminal Cerro',
    zonasServidas: ['Casabó', 'Cno. Ramírez', 'Cerro', 'Villa del Cerro'],
    kmRecorrido: 10.0,
    capacidadVehiculo: 75,
    frecuencias: [
      { label: 'Pico', horaInicio: '06:00', horaFin: '21:00', frecuenciaMin: 18, diasAplica: ['LUN','MAR','MIE','JUE','VIE'] },
      { label: 'Finde', horaInicio: '07:00', horaFin: '21:00', frecuenciaMin: 35, diasAplica: ['SAB','DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '148', empresa: 'Cutcsa', solapamientoPct: 60, tramoCompartido: 'Cerro → Casabó', frecuenciaRivalMin: 8 },
    ],
    corridorBbox: [-34.93, -56.32, -34.9, -56.25],
    tramosAlaDemanda: ['Terminal Casabó', 'Terminal Cerro'],
  },

  'U11S': {
    lineId: 'U11S',
    nombreComercial: 'Línea U11S — Casabó / Centro',
    empresa: 'UCOT',
    terminalA: 'Terminal Casabó',
    terminalB: 'Centro (18 de Julio)',
    zonasServidas: ['Casabó', 'Cerro', 'Ciudad Vieja', 'Centro'],
    kmRecorrido: 17.0,
    capacidadVehiculo: 80,
    frecuencias: [
      { label: 'Pico', horaInicio: '06:00', horaFin: '21:00', frecuenciaMin: 20, diasAplica: ['LUN','MAR','MIE','JUE','VIE'] },
      { label: 'Finde', horaInicio: '07:00', horaFin: '21:00', frecuenciaMin: 40, diasAplica: ['SAB','DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '148', empresa: 'Cutcsa', solapamientoPct: 65, tramoCompartido: 'Cerro → Ciudad Vieja → Centro', frecuenciaRivalMin: 8 },
    ],
    corridorBbox: [-34.93, -56.32, -34.9, -56.17],
    tramosAlaDemanda: ['Terminal Casabó', 'Ciudad Vieja', 'Centro (18 de Julio)'],
  },

  'U11T': {
    lineId: 'U11T',
    nombreComercial: 'Línea U11T — Casabó / Terminal Tres Cruces',
    empresa: 'UCOT',
    terminalA: 'Terminal Casabó',
    terminalB: 'Terminal Tres Cruces',
    zonasServidas: ['Casabó', 'Cerro', 'Ciudad Vieja', 'Centro', 'Tres Cruces'],
    kmRecorrido: 20.0,
    capacidadVehiculo: 80,
    frecuencias: [
      { label: 'Pico', horaInicio: '06:00', horaFin: '21:00', frecuenciaMin: 22, diasAplica: ['LUN','MAR','MIE','JUE','VIE'] },
      { label: 'Finde', horaInicio: '07:00', horaFin: '21:00', frecuenciaMin: 45, diasAplica: ['SAB','DOM'] },
    ],
    rivalesVerificados: [
      { lineId: '148', empresa: 'Cutcsa', solapamientoPct: 55, tramoCompartido: 'Cerro → Centro', frecuenciaRivalMin: 8 },
    ],
    corridorBbox: [-34.93, -56.32, -34.9, -56.17],
    tramosAlaDemanda: ['Terminal Casabó', 'Ciudad Vieja', 'Terminal Tres Cruces'],
  },

  '221': {
    lineId: '221',
    nombreComercial: 'Línea 221 — Baltasar Brum / El Pinar (Ciudad de la Costa)',
    empresa: 'UCOT',
    terminalA: 'Terminal Baltasar Brum',
    terminalB: 'El Pinar',
    zonasServidas: [
      'Baltasar Brum',
      'Tres Cruces',
      'Ruta Interbalnearia',
      'Bola de Nieve',
      'Ciudad de la Costa',
      'El Pinar',
    ],
    kmRecorrido: 38.5,
    capacidadVehiculo: 85,
    frecuencias: [
      {
        label: 'Mañana',
        horaInicio: '06:00',
        horaFin: '12:00',
        frecuenciaMin: 25,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Tarde',
        horaInicio: '12:00',
        horaFin: '20:00',
        frecuenciaMin: 25,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Nocturno',
        horaInicio: '20:00',
        horaFin: '23:00',
        frecuenciaMin: 45,
        diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      },
      {
        label: 'Sábado',
        horaInicio: '06:30',
        horaFin: '22:00',
        frecuenciaMin: 30,
        diasAplica: ['SAB'],
      },
      {
        label: 'Domingo',
        horaInicio: '08:00',
        horaFin: '20:00',
        frecuenciaMin: 45,
        diasAplica: ['DOM'],
      },
    ],
    rivalesVerificados: [
      {
        lineId: '721',
        empresa: 'Copsa',
        solapamientoPct: 85,
        tramoCompartido: 'Ruta Interbalnearia → El Pinar',
        frecuenciaRivalMin: 20,
      },
      {
        lineId: 'C6',
        empresa: 'Copsa',
        solapamientoPct: 75,
        tramoCompartido: 'Ciudad de la Costa → El Pinar',
        frecuenciaRivalMin: 22,
      },
      {
        lineId: '722',
        empresa: 'Copsa',
        solapamientoPct: 60,
        tramoCompartido: 'Interbalnearia tramo medio',
        frecuenciaRivalMin: 25,
      },
    ],
    corridorBbox: [-34.9, -56.1, -34.75, -55.8],
    tramosAlaDemanda: ['Bola de Nieve (acceso costa)', 'Ciudad de la Costa centro', 'El Pinar'],
  },

};

// ─── Motor del Inspector ─────────────────────────────────────────────────────

export class LineInspectorAgent {
  private config: LineInspectorConfig;

  constructor(lineId: string) {
    const cfg = LINE_INSPECTOR_CONFIGS[lineId.replace(/[ab]$/i, '')];
    if (!cfg) throw new Error(`[Inspector] No hay configuración para línea ${lineId}`);
    this.config = cfg;
  }

  /** Obtiene la frecuencia esperada para el momento actual */
  getCurrentFrequency(): FrequencyBand | null {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dias = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'] as const;
    const diaHoy = dias[now.getDay()];

    return (
      this.config.frecuencias.find((f) => {
        const aplica = f.diasAplica.includes(diaHoy);
        const dentro = hhmm >= f.horaInicio && hhmm <= f.horaFin;
        return aplica && dentro;
      }) ?? null
    );
  }

  /** Analiza el headway real entre buses usando posiciones GPS — detecta bunching y huecos */
  analyzeHeadway(busesEnLinea: BusPosition[]): AlertaHeadway {
    const freq = this.getCurrentFrequency();
    if (!freq) return { tipo: 'OK', mensaje: 'Fuera de horario operativo', gravedad: 'NORMAL', busesConGPS: 0 };

    const conGPS = busesEnLinea.filter((b) => b.lat !== 0 && b.lng !== 0);

    if (conGPS.length === 0) {
      return {
        tipo: 'HUECO',
        mensaje: `Sin telemetría GPS activa. Frecuencia esperada: ${freq.frecuenciaMin} min`,
        gravedad: 'CRITICO',
        busesConGPS: 0,
      };
    }

    if (conGPS.length < 2) {
      return {
        tipo: 'HUECO',
        mensaje: `Solo 1 bus con GPS activo (interno: ${conGPS[0].interno || 'N/D'}). Frecuencia esperada: ${freq.frecuenciaMin} min`,
        gravedad: 'ADVERTENCIA',
        busesConGPS: 1,
      };
    }

    // Calcular separación entre buses consecutivos con Haversine
    const BUNCHING_THRESHOLD_KM = 0.8; // < 800m = bunching
    const bunchingPares: Array<{ interno1: string; interno2: string; distanciaKm: number }> = [];
    const separaciones: number[] = [];

    for (let i = 0; i < conGPS.length - 1; i++) {
      const a = conGPS[i];
      const b = conGPS[i + 1];
      const dist = haversineKm(a.lat, a.lng, b.lat, b.lng);
      separaciones.push(dist);
      if (dist < BUNCHING_THRESHOLD_KM) {
        bunchingPares.push({
          interno1: a.interno || `Bus ${i + 1}`,
          interno2: b.interno || `Bus ${i + 2}`,
          distanciaKm: Math.round(dist * 100) / 100,
        });
      }
    }

    const separacionPromedio = separaciones.reduce((s, v) => s + v, 0) / separaciones.length;
    // Cada km de separación ≈ freq/kmRecorrido * km minutos
    const minPorKm = freq.frecuenciaMin / (this.config.kmRecorrido || 20);
    const minutosReales = separacionPromedio * minPorKm;
    const desviacion = Math.round(minutosReales - freq.frecuenciaMin);

    if (bunchingPares.length > 0) {
      return {
        tipo: 'AGRUPAMIENTO',
        mensaje: `⚠️ Bunching detectado: ${bunchingPares.length} par(es) de buses a <${BUNCHING_THRESHOLD_KM * 1000}m. Sep. promedio: ${separacionPromedio.toFixed(1)} km`,
        gravedad: bunchingPares.length >= 2 ? 'CRITICO' : 'ADVERTENCIA',
        minutosDesviacion: desviacion,
        bunchingPares,
        busesConGPS: conGPS.length,
        separacionPromedioKm: Math.round(separacionPromedio * 100) / 100,
      };
    }

    // Verificar si hay hueco grande (separación > 2× frecuencia esperada)
    const maxSep = Math.max(...separaciones);
    const maxMinutos = maxSep * minPorKm;
    if (maxMinutos > freq.frecuenciaMin * 2) {
      return {
        tipo: 'HUECO',
        mensaje: `⚠️ Brecha detectada: separación máx. ${maxSep.toFixed(1)} km (~${Math.round(maxMinutos)} min). Frecuencia esperada: ${freq.frecuenciaMin} min`,
        gravedad: 'ADVERTENCIA',
        minutosDesviacion: Math.round(maxMinutos - freq.frecuenciaMin),
        busesConGPS: conGPS.length,
        separacionPromedioKm: Math.round(separacionPromedio * 100) / 100,
      };
    }

    return {
      tipo: 'OK',
      mensaje: `✅ ${conGPS.length} buses activos con GPS. Separación promedio: ${separacionPromedio.toFixed(1)} km. Headway OK (~${Math.round(minutosReales)} min)`,
      gravedad: 'NORMAL',
      busesConGPS: conGPS.length,
      separacionPromedioKm: Math.round(separacionPromedio * 100) / 100,
    };
  }

  /** Calcula métricas de recaudación estimada */
  estimateRevenue(busesActivos: number): MetricaRecaudacion {
    const freq = this.getCurrentFrequency();
    const frecMin = freq?.frecuenciaMin ?? 20;
    const horasOperacion = 16;
    const viajesEstimados = Math.floor((60 / frecMin) * horasOperacion * busesActivos);
    const ocupacionPct = frecMin <= 10 ? 75 : frecMin <= 20 ? 55 : 35;
    const pasajerosViaje = Math.floor(this.config.capacidadVehiculo * (ocupacionPct / 100));
    const pasajerosDia = viajesEstimados * pasajerosViaje;
    const tarifa = 36; // UYU tarifa STM 2025
    return {
      pasajerosEstimadosDia: pasajerosDia,
      tarifaPromedio: tarifa,
      recaudacionEstimadaDia: pasajerosDia * tarifa,
      ocupacionPromedioPct: ocupacionPct,
      tramoHotspot: this.config.tramosAlaDemanda[0],
    };
  }

  /**
   * NUEVO — Motor Autónomo de Inteligencia Competitiva
   * Detecta automáticamente todos los competidores STM que comparten
   * destino u origen con esta línea UCOT.
   */
  getCompetitorReport(): ReporteInteligenciaCompetitiva {
    const freq = this.getCurrentFrequency();
    return CompetitorIntelligenceEngine.generarReporte(
      {
        lineId: this.config.lineId,
        terminalA: this.config.terminalA,
        terminalB: this.config.terminalB,
        zonasServidas: this.config.zonasServidas,
        frecPicoMin: freq?.frecuenciaMin ?? this.config.frecuencias[0]?.frecuenciaMin ?? 15,
        rivalesVerificados: this.config.rivalesVerificados,
      },
      this.config.nombreComercial,
    );
  }

  /**
   * NUEVO — Retorna solo los rivales que llevan al mismo destino final
   * (mismo terminal B o A — para análisis de captación por OD pair)
   */
  getRivalsByDestination(): RivalVerificado[] {
    const report = this.getCompetitorReport();
    return report.competidoresDetectados
      .filter((c) => c.tipoCompetencia === 'DESTINO_COMPARTIDO' || c.tipoCompetencia === 'AMBOS')
      .map((c) => ({
        lineId: c.rivalLineId,
        empresa: c.rivalEmpresa,
        solapamientoPct: c.solapamientoRecorridoPct,
        tramoCompartido: c.puntosCompetencia.join(' → '),
        frecuenciaRivalMin: c.frecRivalPicoMin,
      }));
  }

  /** @deprecated Usar getCompetitorReport() para análisis completo */
  getGeographicallyRelevantRivals(): RivalVerificado[] {
    return this.config.rivalesVerificados.filter((r) => r.solapamientoPct >= 30);
  }

  async generateReport(posicionesGPS: BusPosition[] = [], realtimeIntelligenceData?: any): Promise<InspectorReport> {
    const [{ ida, vuelta }, freq, horariosSTMOficiales] = await Promise.all([
      getLineVariants(this.config.lineId),
      Promise.resolve(this.getCurrentFrequency()),
      STMScheduleService.getSchedules(this.config.lineId)
    ]);

    const numBuses = posicionesGPS.length > 0 
      ? posicionesGPS.length 
      : (realtimeIntelligenceData?.ucot?.busesActivos || 0);

    const metricas = this.estimateRevenue(numBuses || 1); // EVitar 0 recaudo si no hay gps
    const competitorReport = this.getCompetitorReport();
    
    // 🔥 Cruzamos con Telemetría Real si existe
    let rivalesActivos = competitorReport.competidoresDetectados.map((c) => {
      // Buscar si la inteligencia backend (GPS real) detectó a este rival en rango vivo
      const vivo = realtimeIntelligenceData?.competencia?.find((r: any) => 
        r.linea === c.rivalLineId && r.empresa === c.rivalEmpresa.toUpperCase()
      );
      return {
        lineId: c.rivalLineId,
        empresa: c.rivalEmpresa,
        solapamientoPct: c.solapamientoRecorridoPct,
        tramoCompartido: c.puntosCompetencia.slice(0, 2).join(' → '),
        frecuenciaRivalMin: vivo ? vivo.frecuenciaRealMinutos : c.frecRivalPicoMin,
        detectadoEnRuta: !!vivo // true si está físicamente en la ruta ahora
      };
    });

    const alertas: AlertaHeadway[] = [];
    const ucotVivoInfo = realtimeIntelligenceData?.ucot;

    if (numBuses === 0) {
      alertas.push({
        tipo: 'HUECO',
        mensaje: 'Sin cobertura GPS de la flota en el corredor',
        gravedad: 'CRITICO',
      });
    }

    if (ucotVivoInfo?.bunchingPares > 0) {
      alertas.push({
        tipo: 'AGRUPAMIENTO',
        mensaje: `Agrupamiento (Bunching) Severo: ${ucotVivoInfo.bunchingPares} pares de buses perdiendo eficiencia. Puntualidad cayó a ${ucotVivoInfo.puntualidad}%`,
        gravedad: 'CRITICO',
      });
    }

    // Análisis Táctico de Regulador
    const frecRealEst = ucotVivoInfo?.frecuenciaRealMinutos || (numBuses > 0 ? Math.round(((this.config.kmRecorrido * 2 / 16) * 60) / numBuses) : 0);
    const frecOficial = freq?.frecuenciaMin || 0;
    
    let conclusionTactiva = '';
    const rivalPrincipalVivo = rivalesActivos.find(r => r.detectadoEnRuta);
    
    if (frecRealEst > 0 && frecOficial > 0) {
      if (frecRealEst > frecOficial + 5) {
        conclusionTactiva = `🧠 Táctica: HUECO DETECTADO. Real (${frecRealEst} min) rezagado vs Oficial (${frecOficial} min). ${rivalPrincipalVivo ? `Riesgo de fuga de boletos hacia ${rivalPrincipalVivo.empresa} (${rivalPrincipalVivo.lineId}).` : 'Fuga de pasajeros inminente.'}`;
      } else if (frecRealEst < frecOficial - 3) {
        conclusionTactiva = `🧠 Táctica: OFERTA EXCECIDA. Frecuencia Real (${frecRealEst} min) muy rápida. Regular marcha para evitar quemar combustible u originar bunching en terminal.`;
      } else {
        conclusionTactiva = `🧠 Táctica: SERVICIO ÓPTIMO. Cadencia (${frecRealEst}m) alineada al STM. Puntualidad estimada: ${ucotVivoInfo?.puntualidad || 85}%.`;
      }
    } else {
      conclusionTactiva = `🧠 Táctica: Operando sin cruzamiento de horarios (Real: ${frecRealEst}m / Oficial: ${frecOficial}m).`;
    }

    const resumenEjecutivo = [
      `📍 ${this.config.nombreComercial}`,
      `🕐 Oficial STM: ${frecOficial > 0 ? frecOficial + ' min' : 'ND'} | 🕒 Flota Viva: ${frecRealEst > 0 ? frecRealEst + ' min' : 'ND'}`,
      horariosSTMOficiales.length > 0 ? `📅 Salida Planificada: ${horariosSTMOficiales[0]?.horaSalida}` : `📅 Sincronizando con matriz STM...`,
      `🚌 Activos: ${numBuses}`,
      `💰 Ingreso Diario Teórico: $${metricas.recaudacionEstimadaDia.toLocaleString('es-UY')}`,
      competitorReport.amenazaPrincipal
        ? `⚠️ Amenaza Mayor: Lín.${competitorReport.amenazaPrincipal.rivalLineId} ${rivalPrincipalVivo ? '(¡DETECTADO EN RUTA!)' : '(Monitoreando GPS)'}`
        : `✅ Corredor Despejado`,
      conclusionTactiva
    ].join(' | ');

    return {
      lineId: this.config.lineId,
      timestamp: new Date(),
      idaData: ida,
      vueltaData: vuelta,
      alertas,
      metricas,
      rivalesActivos,
      resumenEjecutivo,
      horariosSTMOficiales,
    };
  }

  get lineConfig(): LineInspectorConfig {
    return this.config;
  }
}

/**
 * Obtiene (o crea) el Inspector para una línea.
 * Genera una configuración base automáticamente si no existe en los configs estáticos 
 * permitiendo que el motor competitivo actúe para todas las líneas.
 */
export function getLineInspector(lineId: string): LineInspectorAgent {
  const clean = lineId.replace(/[ab]$/i, '');
  if (!LINE_INSPECTOR_CONFIGS[clean]) {
    const lineasMaster = getMasterLineas();
    const lineaInfo = lineasMaster.find(l => l.id.replace(/[ab]$/i, '') === clean);
    const nombreFull = lineaInfo?.nombre || `Línea ${clean}`;
    
    // Extraer terminales primitivas del nombre "ORIGEN - DESTINO"
    const partes = nombreFull.split(' - ');
    const terminalA = partes[0]?.trim() || 'Desconocido';
    const terminalB = partes[1]?.trim() || 'Desconocido';

    LINE_INSPECTOR_CONFIGS[clean] = {
      lineId: clean,
      empresa: 'UCOT',
      nombreComercial: nombreFull,
      terminalA,
      terminalB,
      zonasServidas: [terminalA, terminalB],
      kmRecorrido: 20, // baseline
      capacidadVehiculo: 75,
      frecuencias: [
        {
          label: 'Todo el día',
          horaInicio: '00:00',
          horaFin: '23:59',
          frecuenciaMin: 20,
          diasAplica: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'],
        },
      ],
      rivalesVerificados: [],
      corridorBbox: [-34.9, -56.1, -34.75, -55.8],
      tramosAlaDemanda: [terminalA, terminalB],
    };
  }
  return new LineInspectorAgent(clean);
}
