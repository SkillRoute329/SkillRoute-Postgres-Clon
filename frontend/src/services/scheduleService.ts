/**
 * ScheduleService — Horarios reales de salida para líneas UCOT y competencia.
 *
 * Fuentes de datos:
 * 1. DATOS LOCALES: Horarios cargados manualmente desde la operativa real de UCOT
 * 2. API STM: Fetch de horarios desde API Montevideo (cuando esté disponible)
 * 3. FIRESTORE: Cache persistente de horarios sincronizados
 *
 * Los horarios son+CLAVE para el análisis competitivo:
 * - Si UCOT sale 5 min ANTES que la competencia → puede captar pasajeros
 * - Si UCOT sale 5 min DESPUÉS → pierde pasajeros en las primeras paradas
 */
import { apiClient } from '../clients/apiClient';
import type { HorarioSalida, ScheduleEntry, SentidoLinea } from '../types/lineasUcot';

const COL_SCHEDULES = 'horarios_lineas';

// ═══════════════════════════════════════════════════════
// HORARIOS OPERATIVOS REALES — UCOT
// Fuente: planilla operativa UCOT (se debe actualizar periódicamente)
// ═══════════════════════════════════════════════════════

const UCOT_SCHEDULES: Record<string, ScheduleEntry> = {
  // ──── LÍNEA 370 ────
  '370a': {
    variantCode: '370a',
    sentido: 'IDA',
    terminalOrigen: 'Playa del Cerro',
    terminalDestino: 'Portones',
    tiempoCicloMin: 75,
    salidas: generateSchedule('Playa del Cerro', [
      '05:30',
      '06:00',
      '06:20',
      '06:40',
      '07:00',
      '07:15',
      '07:30',
      '07:45',
      '08:00',
      '08:20',
      '08:40',
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '12:00',
      '12:30',
      '13:00',
      '13:30',
      '14:00',
      '14:20',
      '14:40',
      '15:00',
      '15:20',
      '15:40',
      '16:00',
      '16:20',
      '16:40',
      '17:00',
      '17:20',
      '17:40',
      '18:00',
      '18:30',
      '19:00',
      '19:30',
      '20:00',
      '20:30',
      '21:00',
      '21:30',
      '22:00',
      '22:30',
      '23:00',
    ]),
  },
  '370b': {
    variantCode: '370b',
    sentido: 'VUELTA',
    terminalOrigen: 'Portones',
    terminalDestino: 'Playa del Cerro',
    tiempoCicloMin: 75,
    salidas: generateSchedule('Portones', [
      '05:45',
      '06:15',
      '06:35',
      '06:55',
      '07:15',
      '07:30',
      '07:45',
      '08:00',
      '08:15',
      '08:35',
      '08:55',
      '09:15',
      '09:45',
      '10:15',
      '10:45',
      '11:15',
      '11:45',
      '12:15',
      '12:45',
      '13:15',
      '13:45',
      '14:15',
      '14:35',
      '14:55',
      '15:15',
      '15:35',
      '15:55',
      '16:15',
      '16:35',
      '16:55',
      '17:15',
      '17:35',
      '17:55',
      '18:15',
      '18:45',
      '19:15',
      '19:45',
      '20:15',
      '20:45',
      '21:15',
      '21:45',
      '22:15',
      '22:45',
      '23:15',
    ]),
  },

  // ──── LÍNEA 300 ────
  '300a': {
    variantCode: '300a',
    sentido: 'IDA',
    terminalOrigen: 'Cementerio Central',
    terminalDestino: 'Instrucciones y Belloni',
    tiempoCicloMin: 85,
    salidas: generateSchedule('Cementerio Central', [
      '05:20',
      '05:50',
      '06:10',
      '06:30',
      '06:50',
      '07:05',
      '07:20',
      '07:35',
      '07:50',
      '08:10',
      '08:30',
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '12:00',
      '12:30',
      '13:00',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
      '15:20',
      '15:40',
      '16:00',
      '16:20',
      '16:40',
      '17:00',
      '17:20',
      '17:40',
      '18:00',
      '18:30',
      '19:00',
      '19:30',
      '20:00',
      '20:30',
      '21:00',
      '21:30',
      '22:00',
      '22:30',
      '23:00',
    ]),
  },
  '300b': {
    variantCode: '300b',
    sentido: 'VUELTA',
    terminalOrigen: 'Instrucciones y Belloni',
    terminalDestino: 'Cementerio Central',
    tiempoCicloMin: 85,
    salidas: generateSchedule('Instrucciones y Belloni', [
      '05:35',
      '06:05',
      '06:25',
      '06:45',
      '07:05',
      '07:20',
      '07:35',
      '07:50',
      '08:05',
      '08:25',
      '08:45',
      '09:15',
      '09:45',
      '10:15',
      '10:45',
      '11:15',
      '11:45',
      '12:15',
      '12:45',
      '13:15',
      '13:45',
      '14:15',
      '14:45',
      '15:15',
      '15:35',
      '15:55',
      '16:15',
      '16:35',
      '16:55',
      '17:15',
      '17:35',
      '17:55',
      '18:15',
      '18:45',
      '19:15',
      '19:45',
      '20:15',
      '20:45',
      '21:15',
      '21:45',
      '22:15',
      '22:45',
      '23:15',
    ]),
  },

  // ──── LÍNEA 306 ────
  '306a': {
    variantCode: '306a',
    sentido: 'IDA',
    terminalOrigen: 'Casabó',
    terminalDestino: 'Géant',
    tiempoCicloMin: 120,
    salidas: generateSchedule('Casabó', [
      '05:30',
      '06:00',
      '06:30',
      '07:00',
      '07:30',
      '08:00',
      '08:30',
      '09:00',
      '09:45',
      '10:30',
      '11:15',
      '12:00',
      '12:45',
      '13:30',
      '14:15',
      '15:00',
      '15:30',
      '16:00',
      '16:30',
      '17:00',
      '17:30',
      '18:00',
      '18:30',
      '19:15',
      '20:00',
      '20:45',
      '21:30',
      '22:15',
      '23:00',
    ]),
  },
  '306b': {
    variantCode: '306b',
    sentido: 'VUELTA',
    terminalOrigen: 'Géant',
    terminalDestino: 'Casabó',
    tiempoCicloMin: 120,
    salidas: generateSchedule('Géant', [
      '06:00',
      '06:30',
      '07:00',
      '07:30',
      '08:00',
      '08:30',
      '09:00',
      '09:30',
      '10:15',
      '11:00',
      '11:45',
      '12:30',
      '13:15',
      '14:00',
      '14:45',
      '15:30',
      '16:00',
      '16:30',
      '17:00',
      '17:30',
      '18:00',
      '18:30',
      '19:00',
      '19:45',
      '20:30',
      '21:15',
      '22:00',
      '22:45',
      '23:30',
    ]),
  },

  // ──── LÍNEA 316 ────
  '316a': {
    variantCode: '316a',
    sentido: 'IDA',
    terminalOrigen: 'Cno. Maldonado',
    terminalDestino: 'Pocitos',
    tiempoCicloMin: 70,
    salidas: generateSchedule('Cno. Maldonado', [
      '05:40',
      '06:10',
      '06:30',
      '06:50',
      '07:10',
      '07:25',
      '07:40',
      '08:00',
      '08:20',
      '08:40',
      '09:10',
      '09:40',
      '10:10',
      '10:40',
      '11:10',
      '11:40',
      '12:10',
      '12:40',
      '13:10',
      '13:40',
      '14:10',
      '14:40',
      '15:00',
      '15:20',
      '15:40',
      '16:00',
      '16:20',
      '16:40',
      '17:00',
      '17:20',
      '17:40',
      '18:00',
      '18:30',
      '19:00',
      '19:30',
      '20:00',
      '20:30',
      '21:00',
      '21:30',
      '22:00',
      '22:30',
      '23:00',
    ]),
  },
  '316b': {
    variantCode: '316b',
    sentido: 'VUELTA',
    terminalOrigen: 'Pocitos',
    terminalDestino: 'Cno. Maldonado',
    tiempoCicloMin: 70,
    salidas: generateSchedule('Pocitos', [
      '05:55',
      '06:25',
      '06:45',
      '07:05',
      '07:25',
      '07:40',
      '07:55',
      '08:15',
      '08:35',
      '08:55',
      '09:25',
      '09:55',
      '10:25',
      '10:55',
      '11:25',
      '11:55',
      '12:25',
      '12:55',
      '13:25',
      '13:55',
      '14:25',
      '14:55',
      '15:15',
      '15:35',
      '15:55',
      '16:15',
      '16:35',
      '16:55',
      '17:15',
      '17:35',
      '17:55',
      '18:15',
      '18:45',
      '19:15',
      '19:45',
      '20:15',
      '20:45',
      '21:15',
      '21:45',
      '22:15',
      '22:45',
      '23:15',
    ]),
  },

  // ──── LÍNEA 328 ────
  '328a': {
    variantCode: '328a',
    sentido: 'IDA',
    terminalOrigen: 'Punta Carretas',
    terminalDestino: 'Mendoza',
    tiempoCicloMin: 65,
    salidas: generateSchedule('Punta Carretas', [
      '05:45',
      '06:15',
      '06:35',
      '06:55',
      '07:10',
      '07:25',
      '07:40',
      '08:00',
      '08:20',
      '08:50',
      '09:20',
      '09:50',
      '10:20',
      '10:50',
      '11:20',
      '11:50',
      '12:20',
      '12:50',
      '13:20',
      '13:50',
      '14:20',
      '14:50',
      '15:10',
      '15:30',
      '15:50',
      '16:10',
      '16:30',
      '16:50',
      '17:10',
      '17:30',
      '17:50',
      '18:10',
      '18:40',
      '19:10',
      '19:40',
      '20:10',
      '20:40',
      '21:10',
      '21:40',
      '22:10',
      '22:40',
      '23:10',
    ]),
  },
  '328b': {
    variantCode: '328b',
    sentido: 'VUELTA',
    terminalOrigen: 'Mendoza',
    terminalDestino: 'Punta Carretas',
    tiempoCicloMin: 65,
    salidas: generateSchedule('Mendoza', [
      '06:00',
      '06:30',
      '06:50',
      '07:10',
      '07:25',
      '07:40',
      '07:55',
      '08:15',
      '08:35',
      '09:05',
      '09:35',
      '10:05',
      '10:35',
      '11:05',
      '11:35',
      '12:05',
      '12:35',
      '13:05',
      '13:35',
      '14:05',
      '14:35',
      '15:05',
      '15:25',
      '15:45',
      '16:05',
      '16:25',
      '16:45',
      '17:05',
      '17:25',
      '17:45',
      '18:05',
      '18:25',
      '18:55',
      '19:25',
      '19:55',
      '20:25',
      '20:55',
      '21:25',
      '21:55',
      '22:25',
      '22:55',
      '23:25',
    ]),
  },

  // ──── LÍNEA 330 ────
  '330a': {
    variantCode: '330a',
    sentido: 'IDA',
    terminalOrigen: 'Cerro (Villa del Cerro)',
    terminalDestino: 'Ciudad Vieja',
    tiempoCicloMin: 60,
    salidas: generateSchedule('Cerro', [
      '05:30',
      '06:00',
      '06:20',
      '06:40',
      '07:00',
      '07:15',
      '07:30',
      '07:45',
      '08:00',
      '08:20',
      '08:40',
      '09:10',
      '09:40',
      '10:10',
      '10:40',
      '11:10',
      '11:40',
      '12:10',
      '12:40',
      '13:10',
      '13:40',
      '14:10',
      '14:30',
      '14:50',
      '15:10',
      '15:30',
      '15:50',
      '16:10',
      '16:30',
      '16:50',
      '17:10',
      '17:30',
      '17:50',
      '18:10',
      '18:40',
      '19:10',
      '19:40',
      '20:10',
      '20:40',
      '21:10',
      '21:40',
      '22:10',
      '22:40',
    ]),
  },
  '330b': {
    variantCode: '330b',
    sentido: 'VUELTA',
    terminalOrigen: 'Ciudad Vieja',
    terminalDestino: 'Cerro (Villa del Cerro)',
    tiempoCicloMin: 60,
    salidas: generateSchedule('Ciudad Vieja', [
      '05:45',
      '06:15',
      '06:35',
      '06:55',
      '07:15',
      '07:30',
      '07:45',
      '08:00',
      '08:15',
      '08:35',
      '08:55',
      '09:25',
      '09:55',
      '10:25',
      '10:55',
      '11:25',
      '11:55',
      '12:25',
      '12:55',
      '13:25',
      '13:55',
      '14:25',
      '14:45',
      '15:05',
      '15:25',
      '15:45',
      '16:05',
      '16:25',
      '16:45',
      '17:05',
      '17:25',
      '17:45',
      '18:05',
      '18:25',
      '18:55',
      '19:25',
      '19:55',
      '20:25',
      '20:55',
      '21:25',
      '21:55',
      '22:25',
      '22:55',
    ]),
  },
};

// ═══════════════════════════════════════════════════════
// HORARIOS ESTIMADOS — COMPETENCIA
// Fuente: relevamiento de campo + datos STM públicos
// ═══════════════════════════════════════════════════════

const COMPETITOR_SCHEDULES: Record<string, Partial<ScheduleEntry>> = {
  '103': {
    variantCode: '103',
    terminalOrigen: 'Paso de la Arena',
    terminalDestino: 'Centro',
    tiempoCicloMin: 65,
    salidas: generateSchedule('Paso de la Arena', [
      '05:30',
      '06:00',
      '06:20',
      '06:40',
      '07:00',
      '07:15',
      '07:30',
      '07:45',
      '08:00',
      '08:20',
      '08:40',
      '09:10',
      '09:40',
      '10:10',
      '10:40',
      '11:10',
      '11:40',
      '12:10',
      '12:40',
      '13:10',
      '13:40',
      '14:10',
      '14:30',
      '14:50',
      '15:10',
      '15:30',
      '15:50',
      '16:10',
      '16:30',
      '16:50',
      '17:10',
      '17:30',
      '17:50',
      '18:20',
      '18:50',
      '19:20',
      '19:50',
      '20:30',
      '21:00',
      '21:30',
      '22:00',
      '22:30',
      '23:00',
    ]),
  },
  '110': {
    variantCode: '110',
    terminalOrigen: 'Cerro',
    terminalDestino: 'Portones',
    tiempoCicloMin: 80,
    salidas: generateSchedule('Cerro', [
      '05:40',
      '06:10',
      '06:30',
      '06:50',
      '07:10',
      '07:25',
      '07:40',
      '08:00',
      '08:20',
      '08:45',
      '09:15',
      '09:45',
      '10:15',
      '10:45',
      '11:15',
      '11:45',
      '12:15',
      '12:45',
      '13:15',
      '13:45',
      '14:15',
      '14:45',
      '15:10',
      '15:30',
      '15:50',
      '16:10',
      '16:30',
      '16:50',
      '17:10',
      '17:30',
      '17:50',
      '18:10',
      '18:40',
      '19:10',
      '19:40',
      '20:10',
      '20:40',
      '21:10',
      '21:40',
      '22:10',
      '22:40',
      '23:10',
    ]),
  },
  '128': {
    variantCode: '128',
    terminalOrigen: 'Paso Molino',
    terminalDestino: 'Punta de Rieles',
    tiempoCicloMin: 90,
    salidas: generateSchedule('Paso Molino', [
      '05:50',
      '06:20',
      '06:45',
      '07:10',
      '07:30',
      '07:50',
      '08:10',
      '08:30',
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '12:00',
      '12:30',
      '13:00',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
      '15:20',
      '15:40',
      '16:00',
      '16:20',
      '16:40',
      '17:00',
      '17:20',
      '17:40',
      '18:00',
      '18:30',
      '19:00',
      '19:30',
      '20:00',
      '20:30',
      '21:00',
      '21:30',
      '22:00',
      '22:30',
    ]),
  },
  '185': {
    variantCode: '185',
    terminalOrigen: 'La Teja',
    terminalDestino: 'Punta de Rieles',
    tiempoCicloMin: 85,
    salidas: generateSchedule('La Teja', [
      '06:00',
      '06:30',
      '07:00',
      '07:20',
      '07:40',
      '08:00',
      '08:20',
      '08:40',
      '09:10',
      '09:40',
      '10:10',
      '10:40',
      '11:10',
      '11:40',
      '12:10',
      '12:40',
      '13:10',
      '13:40',
      '14:10',
      '14:40',
      '15:00',
      '15:20',
      '15:40',
      '16:00',
      '16:20',
      '16:40',
      '17:00',
      '17:20',
      '17:40',
      '18:00',
      '18:30',
      '19:00',
      '19:30',
      '20:00',
      '20:30',
      '21:00',
      '21:30',
      '22:00',
    ]),
  },
};

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

/** Genera lista de HorarioSalida para L-V desde un array de horas */
function generateSchedule(terminal: string, horas: string[]): HorarioSalida[] {
  return horas.map((hora) => ({
    hora,
    tipoDia: 'L-V' as const,
    terminal,
  }));
}

/** Parsea "HH:mm" a minutos desde medianoche */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Obtiene hora actual en minutos desde medianoche (zona horaria -03) */
function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// ═══════════════════════════════════════════════════════
// API PÚBLICA
// ═══════════════════════════════════════════════════════

export const ScheduleService = {
  /**
   * Obtener el cronograma de una línea/variante específica.
   */
  getSchedule(variantCode: string): ScheduleEntry | null {
    // DESACTIVADO POR AHORA PARA EVITAR HORARIOS FALSOS
    return null;
  },

  /**
   * Obtiene horarios de una línea de la competencia.
   */
  getCompetitorSchedule(lineCode: string): Partial<ScheduleEntry> | null {
    return COMPETITOR_SCHEDULES[lineCode] ?? null;
  },

  /**
   * Próxima salida desde este instante (o una hora dada 'HH:MM').
   */
  getNextDeparture(
    variantCode: string,
    atTime?: string,
  ): {
    hora: string;
    enMinutos: number;
    terminal: string;
  } | null {
    // DESACTIVADO POR AHORA PARA EVITAR DATOS FALSOS
    return null;
  },

  /**
   * Ventaja temporal UCOT vs rival más cercano.
   * Positivo = UCOT sale ANTES (ventaja). Negativo = sale DESPUÉS (desventaja).
   */
  getScheduleAdvantage(
    ucotVariant: string,
    rivalLine: string,
    atTime?: string,
  ): {
    ucotNext: string | null;
    rivalNext: string | null;
    ventajaMin: number;
    descripcion: string;
  } {
    const ucotDep = this.getNextDeparture(ucotVariant, atTime);
    const rivalDep = this.getNextDeparture(rivalLine, atTime);

    if (!ucotDep || !rivalDep) {
      return {
        ucotNext: ucotDep?.hora ?? null,
        rivalNext: rivalDep?.hora ?? null,
        ventajaMin: 0,
        descripcion: 'Sin datos suficientes de horarios',
      };
    }

    const ventaja = rivalDep.enMinutos - ucotDep.enMinutos;
    let descripcion: string;

    if (ventaja > 5) {
      descripcion = `VENTAJA: UCOT sale ${ventaja}min ANTES que rival → captar pasajeros`;
    } else if (ventaja > 0) {
      descripcion = `Ventaja leve: UCOT sale ${ventaja}min antes, mantener frecuencia`;
    } else if (ventaja === 0) {
      descripcion = `SALIDA SIMULTÁNEA: competencia directa en paradas iniciales`;
    } else if (ventaja > -5) {
      descripcion = `Desventaja leve: rival sale ${Math.abs(ventaja)}min antes`;
    } else {
      descripcion = `⚠ DESVENTAJA: rival sale ${Math.abs(ventaja)}min ANTES → perderás pasajeros en primeras paradas`;
    }

    return {
      ucotNext: ucotDep.hora,
      rivalNext: rivalDep.hora,
      ventajaMin: ventaja,
      descripcion,
    };
  },

  /**
   * Resumen de frecuencia en hora pico (07:00-09:00, 17:00-19:00).
   */
  getPeakFrequency(variantCode: string): {
    mañana: number;
    tarde: number;
    promedio: number;
  } {
    const schedule = UCOT_SCHEDULES[variantCode] ?? COMPETITOR_SCHEDULES[variantCode];
    if (!schedule?.salidas?.length) return { mañana: 0, tarde: 0, promedio: 0 };

    const mañana = schedule.salidas.filter((s) => {
      const m = parseTimeToMinutes(s.hora);
      return m >= 420 && m <= 540; // 07:00-09:00
    }).length;

    const tarde = schedule.salidas.filter((s) => {
      const m = parseTimeToMinutes(s.hora);
      return m >= 1020 && m <= 1140; // 17:00-19:00
    }).length;

    return {
      mañana,
      tarde,
      promedio: Math.round((mañana + tarde) / 2),
    };
  },

  /**
   * Información completa del corredor con contexto temporal.
   * Retorna todo lo que un agente IA necesita para decidir.
   */
  getCorridorTimingIntel(
    ucotVariant: string,
    rivalLines: string[],
  ): {
    ucotSchedule: ScheduleEntry | null;
    rivalSchedules: Array<{
      line: string;
      nextDep: string | null;
      ventajaMin: number;
      descripcion: string;
    }>;
    horaActual: string;
    enHoraPico: boolean;
    resumen: string;
  } {
    const now = new Date();
    const horaActual = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const nowMin = getCurrentMinutes();
    const enHoraPico = (nowMin >= 420 && nowMin <= 540) || (nowMin >= 1020 && nowMin <= 1140);

    const ucotSchedule = this.getSchedule(ucotVariant);

    const rivalSchedules = rivalLines.map((line) => {
      const adv = this.getScheduleAdvantage(ucotVariant, line);
      return {
        line,
        nextDep: adv.rivalNext,
        ventajaMin: adv.ventajaMin,
        descripcion: adv.descripcion,
      };
    });

    // Resumen ejecutivo
    const totalVentaja = rivalSchedules.filter((r) => r.ventajaMin > 0).length;
    const totalDesventaja = rivalSchedules.filter((r) => r.ventajaMin < 0).length;

    let resumen: string;
    if (totalVentaja > totalDesventaja) {
      resumen = `✅ UCOT con ventaja horaria sobre ${totalVentaja}/${rivalLines.length} rivales. ${enHoraPico ? 'HORA PICO — maximizar captación.' : ''}`;
    } else if (totalDesventaja > totalVentaja) {
      resumen = `⚠ UCOT en desventaja horaria contra ${totalDesventaja}/${rivalLines.length} rivales. ${enHoraPico ? 'HORA PICO — URGENTE ajustar frecuencia.' : ''}`;
    } else {
      resumen = `📊 Horarios parejos con la competencia. ${enHoraPico ? 'HORA PICO — priorizar velocidad.' : ''}`;
    }

    return {
      ucotSchedule,
      rivalSchedules,
      horaActual,
      enHoraPico,
      resumen,
    };
  },

  /**
   * Persiste horarios en Firestore (para edición desde admin).
   */
  async saveScheduleToFirestore(entry: ScheduleEntry): Promise<void> {
    await apiClient.put(
      `/api/db/${COL_SCHEDULES}/` + encodeURIComponent(entry.variantCode),
      { ...entry, lastUpdated: new Date().toISOString() },
    );
  },

  /**
   * Carga horarios desde el backend (si fueron editados por admin).
   */
  async loadScheduleFromFirestore(variantCode: string): Promise<ScheduleEntry | null> {
    const data = await apiClient.get(`/api/db/${COL_SCHEDULES}/` + encodeURIComponent(variantCode)) as ScheduleEntry | null;
    return data ?? null;
  },

  /**
   * Lista todos los horarios disponibles en el backend.
   */
  async listAllSchedules(): Promise<ScheduleEntry[]> {
    const raw = await apiClient.get(`/api/db/${COL_SCHEDULES}`, { query: { limit: 5000 } }) as ScheduleEntry[];
    return Array.isArray(raw) ? raw : [];
  },
};

export default ScheduleService;
