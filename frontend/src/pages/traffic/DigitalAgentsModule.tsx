/**
 * DigitalAgentsModule — Agentes Digitales UCOT (Datos Reales)
 * ============================================================
 * PROHIBIDO SIMULAR. Todo dato mostrado proviene de:
 *   1. JSON Maestro (ucot_master_intelligence_2026) → servicios, horarios, puntos de control
 *   2. LINE_INSPECTOR_CONFIGS → competencia verificada, frecuencias, corredores
 *   3. IMM API → posiciones en tiempo real de coches
 *   4. CartonService (Firestore) → cartones complementarios
 *
 * Cada agente es especialista en UNA línea. Conoce todos los servicios,
 * su horario de pasada por cada punto de control, y la competencia del corredor.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Bot,
  MapPin,
  Clock,
  Activity,
  Bus,
  ShieldAlert,
  Send,
  Target,
  RefreshCw,
  Calendar,
  Route,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
} from 'lucide-react';
import clsx from 'clsx';
import { getMasterLineas, getMasterServicios } from '../../data/ucotMaster';
import type { MasterLinea, MasterServicio } from '../../data/ucotMaster';
import { LINE_INSPECTOR_CONFIGS, getLineInspector } from '../../services/LineInspectorAgent';
import type {
  RivalVerificado,
  FrequencyBand,
  LineInspectorConfig,
  InspectorReport,
} from '../../services/LineInspectorAgent';
import type {
  ReporteInteligenciaCompetitiva,
  AnalisisCompetitivo,
} from '../../services/CompetitorIntelligenceEngine';
import { Toast } from '@capacitor/toast';
// Sweep timestamps #74 (2026-04-23): helper Montevideo UTC-3
import { formatHoraMvd } from '../../utils/formatTimestamp';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { auth } from '../../config/firebase';
// Fix #6 (2026-04-23): persistencia real de delegaciones al inspector humano.

// ── Tipos ────────────────────────────────────────────────────────────────────

interface IMMPosition {
  lat: number;
  lng: number;
  variante?: string;
  interno?: string;
}

/** Servicio activo según hora actual – derivado del cartón real */
interface ServicioActivo {
  serviceNumber: string;
  servicioId: string;
  lineaId: string;
  variante: string;
  tipo_dia: string;
  puntosControl: string[];
  /** Headers del cartón (ida+vuelta) */
  headers: Array<{ id: string; location: string }>;
  /** Matriz de horarios (cada fila es un viaje) */
  rawMatrix: Array<{ checkpoints: string[] }>;
  /** Viaje actual (fila de la rawMatrix) más cercano a la hora actual */
  viajeActualIdx: number;
  /** Hora de inicio del viaje actual */
  horaInicioViaje: string;
  /** Hora de fin del viaje actual */
  horaFinViaje: string;
  /** Destino del viaje actual (último punto con hora) */
  destinoActual: string;
  /** Origen del viaje actual (primer punto con hora) */
  origenActual: string;
  /** Estado: 'en_viaje' si hay horario activo, 'pendiente' si el próximo viaje no empezó */
  estado: 'en_viaje' | 'pendiente' | 'finalizado';
  /** Diferencia en minutos entre la hora actual y el inicio del viaje */
  diffMinutos: number;
  /** Coche o unidad física vinculada al cartón, si está definida */
  internoAsignado?: string;
}

/** Recomendación táctica autónoma generada por el agente */
interface RecomendacionTactica {
  nivel: 'CRITICO' | 'ADVERTENCIA' | 'OPORTUNIDAD';
  titulo: string;
  detalle: string;
  accion: string;
}

/** Estado completo del agente de una línea */
interface AgentState {
  lineaId: string;
  lineaNombre: string;
  servicios: MasterServicio[];
  serviciosActivos: ServicioActivo[];
  totalServicios: number;
  inspectorConfig: LineInspectorConfig | null;
  frecuenciaActual: FrequencyBand | null;
  /** @deprecated solo para compatibilidad — usar competitorReport */
  rivales: RivalVerificado[];
  posicionesIMM: IMMPosition[];
  /** Reporte completo generado autónomamente por el LineInspectorAgent */
  report: InspectorReport | null;
  /** Reporte de inteligencia competitiva COMPLETO del Motor autónomo */
  competitorReport: ReporteInteligenciaCompetitiva | null;
  /** Recomendaciones tácticas calculadas automáticamente */
  recomendaciones: RecomendacionTactica[];
  intelligenceData: {
    ok: boolean;
    linea: string;
    timestamp: string;
    hoy: { tipo: string; descripcion: string; horaMontevideo: string };
    ucot: {
      busesActivos: number;
      frecuenciaRealMinutos: number;
      frecuenciaProgramadaMinutos: number;
      puntualidad: number;
    };
    competencia: any[];
    alertaNivel: string;
    resumenEjecutivo: string;
  } | null;
  loading: boolean;
  lastUpdate: Date | null;
}

// ── Helpers (sin simulación) ────────────────────────────────────────────────


/** Parsea un string "HH:MM" a minutos desde medianoche. Retorna -1 si inválido. */
function parseTimeToMinutes(t: string): number {
  if (!t || !t.includes(':')) return -1;
  const clean = t.replace(/[^0-9:]/g, '');
  const parts = clean.split(':');
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  if (isNaN(hh) || isNaN(mm)) return -1;
  return hh * 60 + mm;
}

/** Determina el tipo de día actual: HABIL, SABADO, DOMINGO */
function getTipoDiaActual(): string {
  const day = new Date().getDay();
  if (day === 0) return 'DOMINGO';
  if (day === 6) return 'SABADO';
  return 'HABIL';
}

/** Analiza los servicios del maestro y calcula cuáles están activos ahora */
function analizarServiciosActivos(servicios: MasterServicio[]): ServicioActivo[] {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const tipoDia = getTipoDiaActual();

  const activos: ServicioActivo[] = [];

  for (const svc of servicios) {
    // Filtrar por tipo de día si está disponible
    const svcAny = svc as unknown as { tipo_dia?: string };
    if (svcAny.tipo_dia && svcAny.tipo_dia !== tipoDia) continue;

    const svcExtended = svc as unknown as {
      headers: { id: string; location: string }[];
      rawMatrix: { checkpoints: string[] }[];
    };
    const headers = svcExtended.headers || [];
    const rawMatrix = svcExtended.rawMatrix || [];

    if (rawMatrix.length === 0) continue;

    // Encontrar el viaje (fila) más cercano a la hora actual
    let bestViajeIdx = -1;
    let bestDiff = Infinity;
    let bestStart = -1;
    let bestEnd = -1;
    let bestOrigen = '';
    let bestDestino = '';

    rawMatrix.forEach((row: { checkpoints: string[] }, rowIdx: number) => {
      const checkpoints = row.checkpoints || [];

      // Encontrar primer y último tiempo válido en esta fila
      let firstTime = -1;
      let lastTime = -1;
      let firstLocation = '';
      let lastLocation = '';

      checkpoints.forEach((cp: string, cpIdx: number) => {
        const mins = parseTimeToMinutes(cp);
        if (mins >= 0) {
          if (firstTime === -1) {
            firstTime = mins;
            firstLocation = headers[cpIdx]?.location || `Punto ${cpIdx + 1}`;
          }
          lastTime = mins;
          lastLocation = headers[cpIdx]?.location || `Punto ${cpIdx + 1}`;
        }
      });

      if (firstTime === -1) return; // Fila sin tiempos válidos

      // Calcular distancia temporal
      const diff = Math.abs(currentMinutes - firstTime);

      if (diff < bestDiff) {
        bestDiff = diff;
        bestViajeIdx = rowIdx;
        bestStart = firstTime;
        bestEnd = lastTime;
        bestOrigen = firstLocation;
        bestDestino = lastLocation;
      }
    });

    if (bestViajeIdx === -1) continue;

    // Determinar estado
    let estado: 'en_viaje' | 'pendiente' | 'finalizado' = 'pendiente';
    if (currentMinutes >= bestStart && currentMinutes <= bestEnd) {
      estado = 'en_viaje';
    } else if (currentMinutes > bestEnd) {
      estado = 'finalizado';
    }

    const formatTime = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    activos.push({
      serviceNumber: svc.serviceNumber || svc.servicioId,
      servicioId: svc.servicioId,
      lineaId: svc.lineaId || svc.linea,
      variante: (svc as unknown as { variante?: string; tipo_dia?: string }).variante || '',
      tipo_dia: (svc as unknown as { variante?: string; tipo_dia?: string }).tipo_dia || tipoDia,
      puntosControl: svc.puntosControl || [],
      headers,
      rawMatrix,
      viajeActualIdx: bestViajeIdx,
      horaInicioViaje: formatTime(bestStart),
      horaFinViaje: formatTime(bestEnd),
      destinoActual: bestDestino,
      origenActual: bestOrigen,
      estado,
      diffMinutos: bestDiff,
      internoAsignado: (svc as unknown as { coche?: string }).coche || '',
    });
  }

  // Ordenar: primero los que están en viaje, luego por proximidad
  activos.sort((a, b) => {
    if (a.estado === 'en_viaje' && b.estado !== 'en_viaje') return -1;
    if (b.estado === 'en_viaje' && a.estado !== 'en_viaje') return 1;
    return a.diffMinutos - b.diffMinutos;
  });

  return activos;
}

// ── Componente Principal ────────────────────────────────────────────────────

export default function DigitalAgentsModule() {
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentState | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Todas las líneas del maestro (fuente de verdad)
  const lineas = useMemo<MasterLinea[]>(() => {
    const masterLineas = getMasterLineas().filter((l) => l.activa !== false);
    // Deduplicar - agrupar las variantes bajo la línea base
    const seen = new Set<string>();
    return masterLineas.filter((l) => {
      const base = l.id.replace(/[ab]$/i, '');
      if (seen.has(base)) return false;
      seen.add(base);
      return true;
    });
  }, []);

  // ── Motor de recomendaciones tácticas autónomas ────────────────────────────
  // Ahora se alimenta del ReporteInteligenciaCompetitiva completo
  const generarRecomendaciones = useCallback(
    (
      config: LineInspectorConfig,
      posicionesIMM: IMMPosition[],
      competitorReport: ReporteInteligenciaCompetitiva | null,
    ): RecomendacionTactica[] => {
      const recs: RecomendacionTactica[] = [];

      // Alimentar recomendaciones desde el Motor de Inteligencia Competitiva
      if (competitorReport) {
        // Acciones prioritarias definidas por el motor
        competitorReport.accionesPrioritarias.forEach((accion) => {
          const isCritico = accion.startsWith('🔴');
          const isAlto = accion.startsWith('🟡');
          recs.push({
            nivel: isCritico ? 'CRITICO' : isAlto ? 'ADVERTENCIA' : 'OPORTUNIDAD',
            titulo: isCritico
              ? 'Acción Inmediata Requerida'
              : isAlto
                ? 'Monitoreo Activo'
                : 'Oportunidad Detectada',
            detalle: accion,
            accion:
              competitorReport.amenazaPrincipal?.recomendacion ??
              'Revisar análisis competitivo detallado.',
          });
        });

        // Agregar recomendaciones individuales de rivales CRÍTICOS y ALTOS
        competitorReport.competidoresDetectados
          .filter((c) => c.nivelAlerta === 'CRITICO' || c.nivelAlerta === 'ALTO')
          .slice(0, 3)
          .forEach((c) => {
            recs.push({
              nivel: c.nivelAlerta === 'CRITICO' ? 'CRITICO' : 'ADVERTENCIA',
              titulo: `${c.rivalEmpresa} Lín.${c.rivalLineId} — Score ${c.scoreAmenaza}/100`,
              detalle: c.analisis,
              accion: c.recomendacion,
            });
          });
      }

      // Alerta GPS si hay servicios activos sin cobertura
      if (posicionesIMM.length === 0 && config.frecuencias.length > 0) {
        recs.push({
          nivel: 'ADVERTENCIA',
          titulo: 'Sin telemetría GPS activa',
          detalle: 'No hay posiciones IMM disponibles para esta línea. Control manual necesario.',
          accion: 'Verificar estado de transponders en vehículos asignados. Contactar despacho.',
        });
      }

      // Si no hay competidores detectados, es una oportunidad
      if (competitorReport && competitorReport.competidoresDetectados.length === 0) {
        recs.push({
          nivel: 'OPORTUNIDAD',
          titulo: 'Corredor sin competencia STM significativa',
          detalle: `Tramos de alta demanda: ${config.tramosAlaDemanda.join(', ')}.`,
          accion:
            'Evaluar aumento de frecuencia para consolidar mercado. Alta retención de pasajeros posible.',
        });
      }

      // Deduplicar y ordenar: CRITICO primero
      const order = { CRITICO: 0, ADVERTENCIA: 1, OPORTUNIDAD: 2 };
      return recs.sort((a, b) => order[a.nivel] - order[b.nivel]);
    },
    [],
  );

  // Cargar datos del agente al seleccionar línea
  const loadAgent = useCallback(
    async (lineaId: string) => {
      const baseId = lineaId.replace(/[ab]$/i, '');

      // 1. Servicios del maestro — búsqueda por ID de línea (sin alias, los IDs son correctos)
      const allSvcs = getMasterServicios();
      const serviciosLinea = allSvcs.filter((s) => {
        const sLine = (s.linea || s.lineaId || '').replace(/[ab]$/i, '');
        return sLine === baseId;
      });

      // 2. Inspector config (frecuencias, corredor, zonas)
      const inspector = getLineInspector(baseId);
      const inspectorConfig = inspector?.lineConfig || null;
      const frecuenciaActual = inspector?.getCurrentFrequency() || null;

      // 3. ═══ MOTOR DE INTELIGENCIA COMPETITIVA AUTÓNOMO ═══
      // Detecta competidores por destino/zona compartida en toda la red STM
      let competitorReport: ReporteInteligenciaCompetitiva | null = null;
      if (inspector) {
        try {
          competitorReport = inspector.getCompetitorReport();
        } catch {
          // Motor no disponible — el agente opera sin análisis competitivo
        }
      }

      // Para compatibilidad de la UI legacy, mapear desde el reporte del motor
      const rivales: RivalVerificado[] = competitorReport
        ? competitorReport.competidoresDetectados.map((c) => ({
            lineId: c.rivalLineId,
            empresa: c.rivalEmpresa,
            solapamientoPct: c.solapamientoRecorridoPct,
            tramoCompartido: c.puntosCompetencia.slice(0, 2).join(' → '),
            frecuenciaRivalMin: c.frecRivalPicoMin,
          }))
        : (inspectorConfig?.rivalesVerificados ?? []);

      // 4. Analizar servicios activos según hora actual
      const serviciosActivos = analizarServiciosActivos(serviciosLinea);

      // 5. Posiciones Reales (Flota UCOT) — cadena de fallback sin simulación
      let posicionesIMM: IMMPosition[] = [];
      // 5.a Intentar Cloud Function proxy (TrafficService)
      try {
        const { TrafficService } = await import('../../services/trafficService');
        const raw = await TrafficService.fetchUcotPositions([baseId]);
        if (raw && Array.isArray(raw) && raw.length > 0) {
          posicionesIMM = raw.map((p: Record<string, unknown>) => ({
            lat: Number(p.latitud ?? p.lat ?? 0),
            lng: Number(p.longitud ?? p.lng ?? 0),
            variante: String(p.variante || p.line || ''),
            interno: String(p.interno || p.id || ''),
          }));
        }
      } catch (e) {
        console.warn('[Agent] Cloud proxy failed, trying STM relay:', e);
      }
      // 5.b Fallback: STM API directa via Vite proxy (/proxy-stm)
      if (posicionesIMM.length === 0) {
        try {
          const { fetchSTMPosiciones } = await import('../../services/stmLiveService');
          const stmBuses = await fetchSTMPosiciones({ empresa: 70, lineas: [baseId] });
          if (stmBuses && stmBuses.length > 0) {
            posicionesIMM = stmBuses.map(b => ({
              lat: b.lat,
              lng: b.lng,
              variante: b.sublinea || '',
              interno: String(b.codigoBus || ''),
            }));
          }
        } catch (e2) {
          console.error('[Agent] Both position sources failed:', e2);
        }
      }

      // 5.b Inyectar servicios detectados por telemetría si no están en el cartón
      if (posicionesIMM.length > 0) {
        const ghostServices: ServicioActivo[] = [];
        posicionesIMM.forEach((pos, idx) => {
          // Buscamos si el interno reportado ya empata con algún servicio real (por 'interno' o 'numero')
          const match = pos.interno
            ? serviciosActivos.some(
                (s) => s.internoAsignado === pos.interno || s.serviceNumber === pos.interno,
              )
            : false;
          if (!match) {
            ghostServices.push({
              serviceNumber: pos.interno ? `Extra-${pos.interno}` : `Extra-${idx + 1}`,
              servicioId: `gps-${pos.interno || idx}`,
              lineaId: baseId,
              variante: pos.variante || 'GPS/Dinámico',
              tipo_dia: getTipoDiaActual(),
              puntosControl: ['Rastreo Dinámico'],
              headers: [],
              rawMatrix: [],
              viajeActualIdx: 0,
              horaInicioViaje: '--:--',
              horaFinViaje: '--:--',
              origenActual: 'Posición GPS detectada',
              destinoActual: 'Servicio Libre/Fuera de Cartón',
              estado: 'en_viaje',
              diffMinutos: 0,
              internoAsignado: pos.interno || '',
            });
          }
        });
        serviciosActivos.push(...ghostServices);
      }

      // 6. ═══ API DE INTELIGENCIA (BACKEND BRIDGE) ═══
      let intelligenceData = null;
      try {
        // Usa el proxy de Vite /api → localhost:3000 (o prod) para evitar CORS
        const res = await fetch(`/api/inteligencia/${baseId}`, {
          signal: AbortSignal.timeout(25000), // 25s timeout para manejar cold starts pesados de Cloud Functions y fetch de 8MB del IMM
        });
        if (res.ok) {
          intelligenceData = await res.json();
        }
      } catch (e) {
        // No crítico — el agente opera sin análisis de inteligencia externo
        console.warn('[Agent] Intelligence bridge not available:', (e as Error)?.message);
      }

      // 7. Reporte ejecutivo completo cruzando métricas UI con los datos Reales de Inteligencia
      let report: InspectorReport | null = null;
      if (inspector) {
        try {
          // Pass the real-time competitor data from the backend to the agent's brain
          report = await inspector.generateReport(posicionesIMM, intelligenceData);
        } catch {
          // No crítico — el agente opera sin reporte completo
        }
      }

      // 8. Recomendaciones tácticas alimentadas por el Motor de Inteligencia Competitiva
      const recomendaciones = inspectorConfig
        ? generarRecomendaciones(inspectorConfig, posicionesIMM, competitorReport)
        : [];

      const lineaNombre = inspectorConfig?.nombreComercial || `Línea ${baseId}`;


      setAgent({
        lineaId: baseId,
        lineaNombre,
        servicios: serviciosLinea,
        serviciosActivos,
        totalServicios: serviciosLinea.length,
        inspectorConfig,
        frecuenciaActual,
        rivales,
        posicionesIMM,
        report,
        competitorReport,
        recomendaciones,
        intelligenceData,
        loading: false,
        lastUpdate: new Date(),
      });
    },
    [generarRecomendaciones],
  );

  const handleSelectLine = useCallback(
    async (lineaId: string) => {
      setSelectedLine(lineaId);
      setAgent((prev) => (prev ? { ...prev, loading: true } : null));
      await loadAgent(lineaId);
    },
    [loadAgent],
  );

  // Refresco manual
  const handleRefresh = useCallback(async () => {
    if (!selectedLine) return;
    setAgent((prev) => (prev ? { ...prev, loading: true } : null));
    await loadAgent(selectedLine);
    setRefreshKey((k) => k + 1);
  }, [selectedLine, loadAgent]);

  // Fix #6 (2026-04-23): Delegación al inspector humano — ahora persiste en
  // Firestore (colección `delegaciones_inspector`). Antes solo mostraba un toast
  // sin dejar rastro, lo que era un riesgo de cumplimiento operacional.
  const handleDelegarInspector = useCallback(async (serviceNumber: string) => {
    try {
      const user = auth.currentUser;
      await addDoc(collection(db, 'delegaciones_inspector'), {
        serviceNumber,
        lineaId: selectedLine ?? null,
        requestedBy: user?.uid ?? 'anonymous',
        requestedByName: user?.displayName ?? user?.email ?? 'Operador sin identificar',
        status: 'pending',     // pending | acknowledged | completed | cancelled
        createdAt: serverTimestamp(),
        // Fuente del disparo para trazabilidad
        source: 'DigitalAgentsModule',
      });
      await Toast.show({
        text: `✅ Solicitud registrada para Servicio ${serviceNumber}. Inspector notificado.`,
        duration: 'long',
      });
    } catch (err) {
      console.error('[DigitalAgents] Error delegando inspector:', err);
      await Toast.show({
        text: `❌ No se pudo registrar la solicitud. Reintentá o usá radio tradicional.`,
        duration: 'long',
      });
    }
  }, [selectedLine]);

  // Stats derivados (cero simulación)
  const stats = useMemo(() => {
    if (!agent) return null;
    const enViaje = agent.serviciosActivos.filter((s) => s.estado === 'en_viaje').length;
    const pendientes = agent.serviciosActivos.filter((s) => s.estado === 'pendiente').length;
    const finalizados = agent.serviciosActivos.filter((s) => s.estado === 'finalizado').length;
    const conGPS = agent.posicionesIMM.length;
    const sinGPS = enViaje > 0 ? Math.max(0, enViaje - conGPS) : 0;

    return { enViaje, pendientes, finalizados, conGPS, sinGPS };
  }, [agent]);

  return (
    <div className="flex flex-col h-full bg-slate-950 p-4 md:p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
          <Bot className="w-7 h-7 md:w-8 md:h-8 text-primary-500" />
          Agentes Digitales
        </h1>
        <p className="text-slate-400 mt-2 text-sm max-w-2xl">
          Cada agente es un especialista asignado a una línea. Conoce los servicios del cartón,
          horarios de pasada por puntos de control, competencia en corredor y coordina con{' '}
          <strong className="text-primary-400">Inspectores Humanos</strong> cuando no hay cobertura
          GPS.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full max-w-7xl mx-auto flex-1 min-h-0">
        {/* ── Panel Izquierdo: Lista de Agentes ── */}
        <div className="col-span-1 lg:col-span-3 space-y-3">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-2">
            Agentes por Línea ({lineas.length})
          </h2>
          <div className="space-y-2 max-h-[75vh] overflow-y-auto pr-1 custom-scrollbar">
            {lineas.map((linea) => {
              const base = linea.id.replace(/[ab]$/i, '');
              const isSelected = selectedLine === linea.id;
              const hasConfig = !!LINE_INSPECTOR_CONFIGS[base];
              const svcsCount = getMasterServicios().filter(
                (s) => (s.linea || s.lineaId || '').replace(/[ab]$/i, '') === base,
              ).length;

              return (
                <button
                  key={linea.id}
                  onClick={() => handleSelectLine(linea.id)}
                  className={clsx(
                    'w-full text-left p-3 md:p-4 rounded-xl border transition-all flex flex-col gap-1.5 relative overflow-hidden group',
                    isSelected
                      ? 'bg-primary-900/20 border-primary-500/50 shadow-[0_0_15px_rgba(14,165,233,0.15)]'
                      : 'bg-slate-900/50 border-slate-800 hover:border-primary-500/30 hover:bg-slate-800/50',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={clsx(
                          'w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm',
                          isSelected
                            ? 'bg-primary-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300',
                        )}
                      >
                        {base}
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-white text-sm line-clamp-1 block">
                          {linea.nombre || `Línea ${base}`}
                        </span>
                        <span className="text-[10px] text-slate-500">{svcsCount} servicios</span>
                      </div>
                    </div>
                    {hasConfig && (
                      <div
                        className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                        title="Con config de competencia"
                      />
                    )}
                  </div>
                  {isSelected && (
                    <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 to-transparent pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Panel Derecho: Dashboard del Agente ── */}
        <div className="col-span-1 lg:col-span-9 min-h-0">
          {!selectedLine ? (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/20">
              <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <Target className="w-10 h-10 text-slate-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-300">Ningún Agente Seleccionado</h3>
              <p className="text-slate-500 mt-2 max-w-md text-center">
                Seleccione un Agente en el panel izquierdo. Cada agente conoce todos los servicios
                de su línea, horarios reales de los cartones y la competencia en su corredor.
              </p>
            </div>
          ) : agent?.loading ? (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-slate-900/30 rounded-3xl border border-slate-800">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4" />
              <span className="text-primary-400 font-medium animate-pulse">
                Cargando datos del Agente...
              </span>
            </div>
          ) : agent ? (
            <div className="space-y-5 animate-fade-in" key={refreshKey}>
              {/* ── Cabecera del Agente ── */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-xl font-black text-white flex items-center gap-2">
                    <Bot className="w-6 h-6 text-primary-500" />
                    Agente {agent.lineaId}
                  </h2>
                  <p className="text-slate-400 text-sm mt-0.5">{agent.lineaNombre}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">
                    Actualizado: {formatHoraMvd(agent.lastUpdate, '—')}
                  </span>
                  <button
                    onClick={handleRefresh}
                    className="min-h-[36px] min-w-[36px] p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    title="Refrescar datos"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* ── KPIs Reales ── */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <KPICard
                  icon={<Bus className="w-4 h-4 text-emerald-500" />}
                  label="Total Servicios"
                  value={agent.totalServicios}
                />
                <KPICard
                  icon={<Activity className="w-4 h-4 text-sky-500" />}
                  label="En Viaje Ahora"
                  value={stats?.enViaje ?? 0}
                  highlight
                />
                <KPICard
                  icon={<Clock className="w-4 h-4 text-amber-500" />}
                  label="Pendientes"
                  value={stats?.pendientes ?? 0}
                />
                <KPICard
                  icon={<Eye className="w-4 h-4 text-emerald-400" />}
                  label="Con GPS (IMM)"
                  value={stats?.conGPS ?? 0}
                />
                <KPICard
                  icon={<XCircle className="w-4 h-4 text-rose-500" />}
                  label="Sin GPS"
                  value={stats?.sinGPS ?? 0}
                  danger={!!stats && stats.sinGPS > 0}
                />
              </div>

              {/* ── Frecuencia y Día ── */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-400">Tipo día:</span>
                  <span className="font-bold text-white">{getTipoDiaActual()}</span>
                </div>
                {agent.frecuenciaActual && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-400">Frecuencia:</span>
                    <span className="font-bold text-white">
                      {agent.frecuenciaActual.frecuenciaMin} min
                    </span>
                    <span className="text-slate-500 text-xs">({agent.frecuenciaActual.label})</span>
                  </div>
                )}
                {agent.inspectorConfig && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm">
                    <Route className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-400">Recorrido:</span>
                    <span className="font-bold text-white">
                      {agent.inspectorConfig.kmRecorrido} km
                    </span>
                  </div>
                )}
                {agent.intelligenceData && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-900/10 border border-primary-500/30 text-sm">
                    <ShieldAlert className="w-4 h-4 text-primary-400" />
                    <span className="text-slate-400">Puntualidad:</span>
                    <span
                      className={clsx(
                        'font-bold',
                        agent.intelligenceData.ucot.puntualidad >= 80
                          ? 'text-emerald-400'
                          : agent.intelligenceData.ucot.puntualidad >= 50
                            ? 'text-amber-400'
                            : 'text-rose-400',
                      )}
                    >
                      {agent.intelligenceData.ucot.puntualidad}%
                    </span>
                  </div>
                )}
              </div>

              {/* ── ALERTA DE INTELIGENCIA (NUEVO) ── */}
              {agent.intelligenceData && (
                <div
                  className={clsx(
                    'p-4 rounded-2xl border flex items-center justify-between gap-4',
                    agent.intelligenceData.alertaNivel.includes('ALTA')
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : 'bg-emerald-950/10 border-emerald-500/20',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={clsx(
                        'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                        agent.intelligenceData.alertaNivel.includes('ALTA')
                          ? 'bg-rose-500 text-white'
                          : 'bg-emerald-500 text-white',
                      )}
                    >
                      {agent.intelligenceData.alertaNivel.includes('ALTA') ? (
                        <AlertTriangle className="w-6 h-6" />
                      ) : (
                        <CheckCircle2 className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Estado del Servicio · {agent.intelligenceData.alertaNivel}
                      </p>
                      <div className="text-sm text-slate-200 mt-0.5 space-y-1">
                        {agent.report?.resumenEjecutivo 
                          ? agent.report.resumenEjecutivo.split(' | ').map((line, idx) => (
                              <p key={idx}>{line}</p>
                            ))
                          : <p>{agent.intelligenceData.resumenEjecutivo}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-slate-500 uppercase font-bold">
                      Frecuencia Real
                    </p>
                    <p className="text-lg font-black text-white">
                      {agent.intelligenceData.ucot.frecuenciaRealMinutos} min
                    </p>
                  </div>
                </div>
              )}

              {/* ── Paneles Principales ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* ── Servicios del Cartón ── */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-primary-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

                  <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-primary-500" />
                    Servicios del Cartón
                    <span className="text-xs text-slate-500 font-normal ml-auto">
                      {agent.serviciosActivos.length} servicios hoy
                    </span>
                  </h3>

                  <div className="space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
                    {agent.serviciosActivos.length === 0 ? (
                      <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl text-center">
                        <p className="text-slate-500 text-sm">
                          No hay servicios programados para {getTipoDiaActual()} en esta línea.
                        </p>
                      </div>
                    ) : (
                      agent.serviciosActivos.map((svc) => (
                        <div
                          key={`${svc.servicioId}-${svc.viajeActualIdx}`}
                          className={clsx(
                            'p-3 rounded-xl border flex flex-col gap-2 transition-all',
                            svc.estado === 'en_viaje'
                              ? 'bg-emerald-950/20 border-emerald-700/40'
                              : svc.estado === 'pendiente'
                                ? 'bg-slate-950/50 border-slate-800'
                                : 'bg-slate-950/30 border-slate-800/50 opacity-60',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div
                                className={clsx(
                                  'w-11 h-11 rounded-lg flex items-center justify-center font-black text-sm shrink-0',
                                  svc.estado === 'en_viaje'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-800 text-slate-300',
                                )}
                              >
                                {svc.serviceNumber}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-slate-200 text-sm">
                                    Servicio {svc.serviceNumber}
                                  </span>
                                  <span
                                    className={clsx(
                                      'text-[10px] uppercase font-bold px-1.5 py-0.5 rounded',
                                      svc.estado === 'en_viaje'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : svc.estado === 'pendiente'
                                          ? 'bg-amber-500/20 text-amber-400'
                                          : 'bg-slate-700/50 text-slate-500',
                                    )}
                                  >
                                    {svc.estado === 'en_viaje'
                                      ? 'En viaje'
                                      : svc.estado === 'pendiente'
                                        ? 'Pendiente'
                                        : 'Finalizado'}
                                  </span>
                                  {svc.variante && (
                                    <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                                      Var. {svc.variante.toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
                                  <Clock className="w-3 h-3" />
                                  <span>
                                    {svc.horaInicioViaje} → {svc.horaFinViaje}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Acción: delegar si no hay GPS */}
                            {svc.estado === 'en_viaje' && agent.posicionesIMM.length === 0 && (
                              <button
                                onClick={() => handleDelegarInspector(svc.serviceNumber)}
                                className="shrink-0 bg-primary-600 hover:bg-primary-500 text-white px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-transform active:scale-95"
                              >
                                <Send className="w-3 h-3" />
                                Inspector
                              </button>
                            )}
                          </div>

                          {/* Recorrido: origen → destino */}
                          <div className="flex items-center gap-2 text-xs pl-14">
                            <span className="text-sky-400 font-medium truncate">
                              {svc.origenActual}
                            </span>
                            <span className="text-slate-600">→</span>
                            <span className="text-amber-400 font-medium truncate">
                              {svc.destinoActual}
                            </span>
                          </div>

                          {/* Puntos de control */}
                          {svc.puntosControl.length > 0 && (
                            <div className="flex flex-wrap gap-1 pl-14">
                              {svc.puntosControl.slice(0, 6).map((pc, idx) => (
                                <span
                                  key={idx}
                                  className="text-[10px] bg-slate-800/80 text-slate-400 px-1.5 py-0.5 rounded"
                                >
                                  {pc}
                                </span>
                              ))}
                              {svc.puntosControl.length > 6 && (
                                <span className="text-[10px] text-slate-600">
                                  +{svc.puntosControl.length - 6} más
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* ── Panel Derecho: Competencia + Alertas ── */}
                <div className="space-y-5">
                  {/* Posiciones IMM */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                      <Activity className="w-5 h-5 text-emerald-500" />
                      Telemetría IMM (Portal Público)
                    </h3>
                    {agent.intelligenceData ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800">
                            <p className="text-[10px] text-slate-500 uppercase font-bold">
                              Programada ({agent.intelligenceData.hoy.tipo})
                            </p>
                            <p className="text-xl font-black text-sky-400">
                              {agent.frecuenciaActual?.frecuenciaMin ?? agent.intelligenceData.ucot.frecuenciaProgramadaMinutos} min
                            </p>
                          </div>
                          <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800">
                            <p className="text-[10px] text-slate-500 uppercase font-bold">
                              Tiempo Real (GPS)
                            </p>
                            <p className="text-xl font-black text-emerald-400">
                              {agent.intelligenceData.ucot.frecuenciaRealMinutos} min
                            </p>
                          </div>
                        </div>

                        <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-primary-500" />
                            <span className="text-xs text-slate-300">
                              {agent.intelligenceData.hoy.descripcion}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {agent.intelligenceData.hoy.horaMontevideo.split(',')[1]}
                          </span>
                        </div>

                        <p className="text-[10px] text-slate-500 italic mt-2">
                          * Datos extraídos dinámicamente de la web de la IMM y telemetría STM.
                        </p>
                      </div>
                    ) : agent.posicionesIMM.length > 0 ? (
                      <div className="space-y-2">
                        {agent.posicionesIMM.map((pos, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 bg-slate-950/50 rounded-xl border border-slate-800"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-emerald-900/50 flex items-center justify-center">
                                <Bus className="w-4 h-4 text-emerald-400" />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-slate-200">
                                  Coche {pos.interno || idx + 1}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
                                </div>
                              </div>
                            </div>
                            <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                              <Activity className="w-3 h-3" /> GPS Activo
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-amber-950/20 border border-amber-700/30 rounded-xl">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-amber-200 text-sm font-medium">
                              Sin datos GPS de la IMM para esta línea
                            </p>
                            <p className="text-amber-200/60 text-xs mt-1">
                              Los servicios activos requieren control por Inspector Humano.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* ═══ Análisis Competitivo Autónomo — Motor de Inteligencia ═══ */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-yellow-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />

                    {/* Header con posición global */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                          <ShieldAlert className="w-5 h-5 text-yellow-500" />
                          Inteligencia Competitiva
                        </h3>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Motor autónomo · Red STM completa (Cutcsa, COETC, COME, Copsa)
                        </p>
                      </div>
                      {agent.competitorReport && (
                        <div
                          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-black border ${
                            agent.competitorReport.pozicionCompetitivaGlobal === 'CRITICA'
                              ? 'bg-red-950/40 border-red-700/50 text-red-300'
                              : agent.competitorReport.pozicionCompetitivaGlobal === 'VULNERABLE'
                                ? 'bg-amber-950/40 border-amber-700/50 text-amber-300'
                                : agent.competitorReport.pozicionCompetitivaGlobal === 'COMPETITIVA'
                                  ? 'bg-sky-950/40 border-sky-700/50 text-sky-300'
                                  : 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300'
                          }`}
                        >
                          {agent.competitorReport.pozicionCompetitivaGlobal === 'CRITICA'
                            ? '🔴'
                            : agent.competitorReport.pozicionCompetitivaGlobal === 'VULNERABLE'
                              ? '🟠'
                              : agent.competitorReport.pozicionCompetitivaGlobal === 'COMPETITIVA'
                                ? '🔵'
                                : '🟢'}{' '}
                          {agent.competitorReport.pozicionCompetitivaGlobal}
                        </div>
                      )}
                    </div>

                    {/* Score de Riesgo Global */}
                    {agent.competitorReport && (
                      <div className="mb-4 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Score Riesgo Mercado
                          </span>
                          <span
                            className={`text-lg font-black ${
                              agent.competitorReport.scoreRiesgoMercado >= 70
                                ? 'text-red-400'
                                : agent.competitorReport.scoreRiesgoMercado >= 50
                                  ? 'text-amber-400'
                                  : agent.competitorReport.scoreRiesgoMercado >= 25
                                    ? 'text-sky-400'
                                    : 'text-emerald-400'
                            }`}
                          >
                            {agent.competitorReport.scoreRiesgoMercado}
                            <span className="text-xs text-slate-500">/100</span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${
                              agent.competitorReport.scoreRiesgoMercado >= 70
                                ? 'bg-red-500'
                                : agent.competitorReport.scoreRiesgoMercado >= 50
                                  ? 'bg-amber-500'
                                  : agent.competitorReport.scoreRiesgoMercado >= 25
                                    ? 'bg-sky-500'
                                    : 'bg-emerald-500'
                            }`}
                            ref={(el) => {
                              if (el) {
                                el.style.width = `${agent.competitorReport?.scoreRiesgoMercado}%`;
                              }
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          {agent.competitorReport.competidoresDetectados.length} competidores
                          detectados en red STM
                        </p>
                      </div>
                    )}

                    {/* Rivales ordenados por Score de Amenaza */}
                    {agent.competitorReport &&
                    agent.competitorReport.competidoresDetectados.length > 0 ? (
                      <div className="space-y-2 mb-4 max-h-[40vh] overflow-y-auto custom-scrollbar pr-1">
                        {(
                          agent.competitorReport.competidoresDetectados as AnalisisCompetitivo[]
                        ).map((c) => (
                          <div
                            key={c.rivalLineId}
                            className={`p-3 rounded-xl border ${
                              c.nivelAlerta === 'CRITICO'
                                ? 'bg-red-950/20 border-red-700/30'
                                : c.nivelAlerta === 'ALTO'
                                  ? 'bg-amber-950/20 border-amber-700/30'
                                  : c.nivelAlerta === 'MEDIO'
                                    ? 'bg-slate-950/50 border-slate-700'
                                    : 'bg-slate-950/30 border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center font-bold text-xs ${
                                    c.nivelAlerta === 'CRITICO'
                                      ? 'bg-red-900/60 text-red-300'
                                      : c.nivelAlerta === 'ALTO'
                                        ? 'bg-amber-900/60 text-amber-300'
                                        : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {c.rivalLineId}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-slate-200 truncate">
                                    {c.rivalEmpresa}
                                  </div>
                                  <div className="text-[10px] text-slate-500 truncate">
                                    {c.tipoCompetencia === 'AMBOS'
                                      ? '⚔️ Destino + Recorrido'
                                      : c.tipoCompetencia === 'DESTINO_COMPARTIDO'
                                        ? '🎯 Mismo destino'
                                        : '🛣️ Tramo compartido'}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div
                                  className={`text-sm font-black ${
                                    c.nivelAlerta === 'CRITICO'
                                      ? 'text-red-400'
                                      : c.nivelAlerta === 'ALTO'
                                        ? 'text-amber-400'
                                        : c.nivelAlerta === 'MEDIO'
                                          ? 'text-sky-400'
                                          : 'text-slate-400'
                                  }`}
                                >
                                  {c.scoreAmenaza}
                                  <span className="text-[10px] text-slate-600">/100</span>
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  c/{c.frecRivalPicoMin}m rival
                                </div>
                              </div>
                            </div>
                            {/* Análisis narrativo del rival */}
                            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed line-clamp-2">
                              {c.analisis}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 mb-4 bg-emerald-950/20 border border-emerald-700/30 rounded-xl text-sm text-emerald-400 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Sin competidores STM significativos en este corredor.
                      </div>
                    )}

                    {/* Recomendaciones del Motor */}
                    {agent.recomendaciones.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                          Acciones del Agente
                        </p>
                        <div className="space-y-2">
                          {agent.recomendaciones.slice(0, 4).map((rec, i) => (
                            <div
                              key={i}
                              className={`p-3 rounded-xl border ${
                                rec.nivel === 'CRITICO'
                                  ? 'bg-red-950/20 border-red-700/30'
                                  : rec.nivel === 'ADVERTENCIA'
                                    ? 'bg-amber-950/20 border-amber-700/30'
                                    : 'bg-emerald-950/20 border-emerald-700/30'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <span className="text-base shrink-0">
                                  {rec.nivel === 'CRITICO'
                                    ? '🔴'
                                    : rec.nivel === 'ADVERTENCIA'
                                      ? '⚠️'
                                      : '💡'}
                                </span>
                                <div>
                                  <p
                                    className={`text-xs font-black ${
                                      rec.nivel === 'CRITICO'
                                        ? 'text-red-300'
                                        : rec.nivel === 'ADVERTENCIA'
                                          ? 'text-amber-300'
                                          : 'text-emerald-300'
                                    }`}
                                  >
                                    {rec.titulo}
                                  </p>
                                  <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">
                                    {rec.detalle}
                                  </p>
                                  <p className="text-[10px] text-slate-300 mt-1 font-semibold">
                                    → {rec.accion}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Resumen Ejecutivo del Inspector */}
                    {agent.report && (
                      <div className="mt-4 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                          Resumen Ejecutivo
                        </p>
                        <div className="text-[10px] text-slate-400 leading-relaxed space-y-0.5">
                          {agent.report.resumenEjecutivo.split(' | ').map((line, i) => (
                            <p key={i}>{line}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Componente KPI ───────────────────────────────────────────────────────────

function KPICard({
  icon,
  label,
  value,
  highlight,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={clsx(
        'bg-slate-900 border p-4 rounded-2xl flex flex-col',
        danger ? 'border-rose-800/50' : highlight ? 'border-primary-500/30' : 'border-slate-800',
      )}
    >
      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
        {icon} {label}
      </span>
      <span
        className={clsx(
          'text-2xl font-black',
          danger ? 'text-rose-400' : highlight ? 'text-primary-400' : 'text-white',
        )}
      >
        {value}
      </span>
    </div>
  );
}
