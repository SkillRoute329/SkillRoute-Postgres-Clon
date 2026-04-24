/**
 * dailyBriefingService.ts — Generador de Briefing Diario
 * ========================================================
 * Produce el informe de turno completo a las 06:00 AM.
 * El inspector entra al turno con toda la inteligencia ya procesada.
 *
 * FLUJO:
 *  1. Tomar la "Foto del Día" ya creada por ScheduleWatchdog (01:00-03:00 AM)
 *  2. Cruzar horarios propios (UCOT) vs horarios rivales
 *  3. Identificar franjas horarias de máxima competencia
 *  4. Resume infracciones del día anterior del Dossier
 *  5. Genera alerta de buses rivales a vigilar en el turno
 */

import {
  cargarFotoDesdecache,
  getSalidasEsperadasAhora,
  type FotoDelDia,
  type IMMSalida,
} from './immScheduleService';

import {
  getEstadisticasDossier,
  obtenerRegistros,
} from './dossierRegulatorio';

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Franja horaria de alta competencia */
export interface FranjaCompetencia {
  horaInicio: string; // HH:mm
  horaFin: string;    // HH:mm
  lineasUCOT: string[];
  lineasRivales: string[];
  nivelConflicto: 'ALTO' | 'MEDIO' | 'BAJO';
  descripcion: string;
}

/** Alerta para el inspector del turno */
export interface AlertaTurno {
  prioridad: 'CRITICA' | 'ALTA' | 'MEDIA' | 'INFO';
  tipo: 'COMPETIDOR' | 'INFRACCION' | 'HORARIO' | 'SISTEMA';
  titulo: string;
  descripcion: string;
  accionRecomendada?: string;
  timestamp: Date;
}

/** Briefing completo del día */
export interface BriefingDiario {
  fecha: string;           // YYYY-MM-DD
  turno: 'MAÑANA' | 'TARDE' | 'NOCHE';
  generadoEn: Date;
  
  /** Resumen del servicio del día */
  estadoServicio: {
    fotoDiaDisponible: boolean;
    fuenteDatos: 'IMM_LIVE' | 'PROXY_CACHE' | 'LOCAL_CACHE' | 'MASTER' | 'SIN_DATOS';
    totalSalidasHoy: number;
    lineasActivas: string[];
  };
  
  /** Franjas de máxima competencia */
  franjasCompetencia: FranjaCompetencia[];
  
  /** Alertas para el inspector */
  alertas: AlertaTurno[];
  
  /** Resumen del dossier regulatorio */
  dossierResumen: {
    infraccionesAyer: number;
    infraccionesHoy: number;
    infraccionesGravesTotal: number;
    empresaConMasInfracciones: string | null;
  };
  
  /** Texto generado para lectura rápida */
  resumenEjecutivo: string;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Líneas operadas por UCOT (fuente: UCOT_LINEAS_REALES) */
const LINEAS_UCOT = ['17', '71', '79', '300', '306', '316', '328', '329', '330', '370', '396'];

/** Líneas rivales conocidas que comparten corredores con UCOT */
const RIVALES_CONOCIDOS: { lineId: string; empresa: string }[] = [
  { lineId: '103', empresa: 'CUTCSA' },
  { lineId: '110', empresa: 'CUTCSA' },
  { lineId: '125', empresa: 'CUTCSA' },
  { lineId: '147', empresa: 'CUTCSA' },
  { lineId: '148', empresa: 'CUTCSA' },
  { lineId: '180', empresa: 'CUTCSA' },
  { lineId: '185', empresa: 'CUTCSA' },
  { lineId: '106', empresa: 'COME' },
  { lineId: '175', empresa: 'COME' },
  { lineId: 'D1',  empresa: 'DINATA' },
  { lineId: '109', empresa: 'RAINCOOP' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTurnoActual(): BriefingDiario['turno'] {
  const hora = new Date().getHours();
  if (hora >= 6 && hora < 14)  return 'MAÑANA';
  if (hora >= 14 && hora < 22) return 'TARDE';
  return 'NOCHE';
}

function formatearHora(date: Date): string {
  return date.toTimeString().substring(0, 5);
}

function calcularFranjasCompetencia(foto: FotoDelDia, lineasPropias: string[] = LINEAS_UCOT): FranjaCompetencia[] {
  const franjas: FranjaCompetencia[] = [];
  if (lineasPropias.length === 0) return franjas;

  for (let hora = 5; hora <= 23; hora++) {
    const horaStr = `${hora.toString().padStart(2, '0')}:00`;

    let salidasPropias = 0;
    let salidasRivales = 0;
    const lineasPropiasActivas = new Set<string>();
    const lineasRivalesActivas = new Set<string>();
    const propiasSet = new Set(lineasPropias);

    lineasPropias.forEach((lineId) => {
      const salidas = getSalidasEsperadasAhora(foto, lineId, 60);
      if (salidas.length > 0) {
        salidasPropias += salidas.length;
        lineasPropiasActivas.add(lineId);
      }
    });

    RIVALES_CONOCIDOS.forEach(({ lineId }) => {
      if (propiasSet.has(lineId)) return; // no contar propias como rivales
      const salidas = getSalidasEsperadasAhora(foto, lineId, 60);
      if (salidas.length > 0) {
        salidasRivales += salidas.length;
        lineasRivalesActivas.add(lineId);
      }
    });

    if (salidasPropias > 0 && salidasRivales > 0) {
      const ratio = salidasRivales / Math.max(salidasPropias, 1);
      const nivelConflicto: FranjaCompetencia['nivelConflicto'] =
        ratio > 1.5 ? 'ALTO' : ratio > 0.8 ? 'MEDIO' : 'BAJO';

      franjas.push({
        horaInicio: horaStr,
        horaFin: `${(hora + 1).toString().padStart(2, '0')}:00`,
        lineasUCOT: Array.from(lineasPropiasActivas),
        lineasRivales: Array.from(lineasRivalesActivas),
        nivelConflicto,
        descripcion: `Propias: ${salidasPropias} salidas | Rivales: ${salidasRivales} salidas`,
      });
    }
  }

  return franjas;
}

function generarAlertas(
  foto: FotoDelDia | null,
  dossierStats: ReturnType<typeof getEstadisticasDossier>,
): AlertaTurno[] {
  const alertas: AlertaTurno[] = [];
  const ahora = new Date();
  
  // Alerta de fuente de datos
  if (!foto) {
    alertas.push({
      prioridad: 'CRITICA',
      tipo: 'SISTEMA',
      titulo: 'Sin Foto del Día disponible',
      descripcion: 'No se pudo sincronizar horarios desde la IMM esta noche. El sistema opera con datos históricos.',
      accionRecomendada: 'Verificar conectividad del servidor bridge en http://localhost:3099',
      timestamp: ahora,
    });
  } else if (foto.source !== 'IMM_LIVE') {
    alertas.push({
      prioridad: 'ALTA',
      tipo: 'SISTEMA',
      titulo: `Datos de horario: ${foto.source}`,
      descripcion: `Los horarios del día se obtuvieron de ${foto.source}, no en tiempo real desde la IMM.`,
      accionRecomendada: 'Monitorear si hay cambios de horario no capturados.',
      timestamp: ahora,
    });
  }
  
  // Alerta de infracciones graves
  if (dossierStats.infraccionesGraves > 0) {
    alertas.push({
      prioridad: 'CRITICA',
      tipo: 'INFRACCION',
      titulo: `${dossierStats.infraccionesGraves} Infracción(es) GRAVE(S) en el dossier`,
      descripcion: `Se detectaron adelantos de horario graves (>10 min). Empresa con más registros: ${dossierStats.empresaConMasInfracciones ?? 'N/D'}.`,
      accionRecomendada: 'Revisar el Dossier Regulatorio y reportar al supervisor de turno.',
      timestamp: ahora,
    });
  }
  
  // Alerta de infracciones hoy
  if (dossierStats.registrosHoy > 0) {
    alertas.push({
      prioridad: 'ALTA',
      tipo: 'INFRACCION',
      titulo: `${dossierStats.registrosHoy} infracción(es) detectada(s) hoy`,
      descripcion: 'El sistema ha registrado infracciones durante el turno actual.',
      accionRecomendada: 'Verificar en el Dossier y confirmar con inspector de campo.',
      timestamp: ahora,
    });
  }
  
  // Info: sistema operativo
  if (foto) {
    alertas.push({
      prioridad: 'INFO',
      tipo: 'SISTEMA',
      titulo: 'Sistema operativo — Foto del Día cargada',
      descripcion: `Datos sincronizados el ${new Date(foto.timestamp).toLocaleString('es-UY')} desde ${foto.source}.`,
      timestamp: ahora,
    });
  }
  
  return alertas.sort((a, b) => {
    const prioridades = { CRITICA: 0, ALTA: 1, MEDIA: 2, INFO: 3 };
    return prioridades[a.prioridad] - prioridades[b.prioridad];
  });
}

// ─── API Pública ─────────────────────────────────────────────────────────────

/** Genera el briefing completo del turno actual */
export async function generarBriefingDiario(agencyId = '70', ownLineIds?: string[]): Promise<BriefingDiario> {
  const ahora = new Date();
  const foto = cargarFotoDesdecache();
  const dossierStats = getEstadisticasDossier();

  // Líneas propias: usa las pasadas, o fallback a LINEAS_UCOT solo para UCOT
  const lineasPropias = ownLineIds && ownLineIds.length > 0
    ? ownLineIds
    : agencyId === '70' ? LINEAS_UCOT : [];

  const agencyLabel = { '70': 'UCOT', '50': 'CUTCSA', '20': 'COME', '10': 'COETC' }[agencyId] ?? agencyId;

  // Calcular infracciones de ayer
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  ayer.setHours(0, 0, 0, 0);
  const finAyer = new Date(ayer);
  finAyer.setHours(23, 59, 59, 999);

  const registrosAyer = obtenerRegistros({ desde: ayer, hasta: finAyer });

  // Resumen de servicio
  let totalSalidas = 0;
  const lineasActivas = new Set<string>();

  if (foto) {
    lineasPropias.forEach((lineId) => {
      const salidas = getSalidasEsperadasAhora(foto, lineId, 24 * 60);
      if (salidas.length > 0) {
        totalSalidas += salidas.length;
        lineasActivas.add(lineId);
      }
    });
  }

  const franjasCompetencia = foto ? calcularFranjasCompetencia(foto, lineasPropias) : [];
  const alertas = generarAlertas(foto, dossierStats);
  const turno = getTurnoActual();

  // Identificar franja de máxima competencia
  const franjaAlta = franjasCompetencia.filter((f) => f.nivelConflicto === 'ALTO');
  const horasPico = franjaAlta.map((f) => f.horaInicio).join(', ') || 'N/D';

  const resumenEjecutivo = [
    `📋 BRIEFING DE TURNO — ${agencyLabel} — ${turno} — ${ahora.toLocaleDateString('es-UY')}`,
    ``,
    `SERVICIO:`,
    `  • Foto del Día: ${foto ? `✅ ${foto.source}` : '❌ No disponible'}`,
    `  • Líneas ${agencyLabel} activas: ${Array.from(lineasActivas).join(', ') || (lineasPropias.length === 0 ? 'Sin líneas configuradas' : 'N/D')}`,
    `  • Total salidas programadas: ${totalSalidas}`,
    ``,
    `COMPETENCIA:`,
    `  • Franjas de alta competencia: ${franjaAlta.length} franja(s)`,
    `  • Horas pico de conflicto: ${horasPico}`,
    ``,
    `DOSSIER:`,
    `  • Infracciones ayer: ${registrosAyer.length}`,
    `  • Infracciones hoy: ${dossierStats.registrosHoy}`,
    `  • Infracciones graves (históricas): ${dossierStats.infraccionesGraves}`,
    `  • Empresa a vigilar: ${dossierStats.empresaConMasInfracciones ?? 'N/D'}`,
    ``,
    `ALERTAS ACTIVAS: ${alertas.filter((a) => a.prioridad !== 'INFO').length}`,
  ].join('\n');
  
  return {
    fecha: ahora.toISOString().split('T')[0],
    turno,
    generadoEn: ahora,
    estadoServicio: {
      fotoDiaDisponible: foto !== null,
      fuenteDatos: foto?.source ?? 'SIN_DATOS',
      totalSalidasHoy: totalSalidas,
      lineasActivas: Array.from(lineasActivas),
    },
    franjasCompetencia,
    alertas,
    dossierResumen: {
      infraccionesAyer: registrosAyer.length,
      infraccionesHoy: dossierStats.registrosHoy,
      infraccionesGravesTotal: dossierStats.infraccionesGraves,
      empresaConMasInfracciones: dossierStats.empresaConMasInfracciones,
    },
    resumenEjecutivo,
  };
}
