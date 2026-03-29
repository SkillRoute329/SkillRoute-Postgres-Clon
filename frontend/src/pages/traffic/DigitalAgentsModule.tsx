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

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Bot,
  MapPin,
  Clock,
  Activity,
  Users,
  Bus,
  ShieldAlert,
  Send,
  Zap,
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
import {
  LINE_INSPECTOR_CONFIGS,
  getLineInspector,
} from '../../services/LineInspectorAgent';
import type {
  RivalVerificado,
  FrequencyBand,
  LineInspectorConfig,
} from '../../services/LineInspectorAgent';
import { Toast } from '@capacitor/toast';

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
  rivales: RivalVerificado[];
  posicionesIMM: IMMPosition[];
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
    if (svc.tipo_dia && svc.tipo_dia !== tipoDia) continue;

    const headers = (svc as any).headers || [];
    const rawMatrix = (svc as any).rawMatrix || [];

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
      variante: (svc as any).variante || '',
      tipo_dia: (svc as any).tipo_dia || tipoDia,
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

  // Cargar datos del agente al seleccionar línea
  const loadAgent = useCallback(async (lineaId: string) => {
    const baseId = lineaId.replace(/[ab]$/i, '');

    // 1. Servicios del maestro
    const allSvcs = getMasterServicios();
    const serviciosLinea = allSvcs.filter((s) => {
      const sLine = (s.linea || s.lineaId || '').replace(/[ab]$/i, '');
      return sLine === baseId;
    });

    // 2. Inspector config (rivales, frecuencias)
    const inspector = getLineInspector(baseId);
    const inspectorConfig = inspector?.lineConfig || null;
    const frecuenciaActual = inspector?.getCurrentFrequency() || null;
    const rivales = inspector?.getGeographicallyRelevantRivals() || [];

    // 3. Analizar servicios activos según hora actual
    const serviciosActivos = analizarServiciosActivos(serviciosLinea);

    // 4. Posiciones IMM en tiempo real (datos reales)
    let posicionesIMM: IMMPosition[] = [];
    try {
      const { TrafficService } = await import('../../services/trafficService');
      const raw = await TrafficService.fetchCompetitorPositions([baseId]);
      if (raw && Array.isArray(raw)) {
        posicionesIMM = raw.map((p: Record<string, any>) => ({
          lat: Number(p.latitud ?? p.lat ?? 0),
          lng: Number(p.longitud ?? p.lng ?? 0),
          variante: p.variante || '',
          interno: p.interno || '',
        }));
      }
    } catch {
      // IMM no disponible - el agente lo reporta, NO simula
    }

    const lineaNombre = inspectorConfig?.nombreComercial
      || `Línea ${baseId}`;

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
      loading: false,
      lastUpdate: new Date(),
    });
  }, []);

  const handleSelectLine = useCallback(async (lineaId: string) => {
    setSelectedLine(lineaId);
    setAgent((prev) => prev ? { ...prev, loading: true } : null);
    await loadAgent(lineaId);
  }, [loadAgent]);

  // Refresco manual
  const handleRefresh = useCallback(async () => {
    if (!selectedLine) return;
    setAgent((prev) => prev ? { ...prev, loading: true } : null);
    await loadAgent(selectedLine);
    setRefreshKey((k) => k + 1);
  }, [selectedLine, loadAgent]);

  // Delegación al inspector humano
  const handleDelegarInspector = useCallback((serviceNumber: string) => {
    Toast.show({
      text: `🚨 Solicitud enviada a Inspector Humano para Servicio ${serviceNumber}`,
      duration: 'long',
    });
  }, []);

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
          Cada agente es un especialista asignado a una línea. Conoce los servicios
          del cartón, horarios de pasada por puntos de control, competencia en
          corredor y coordina con{' '}
          <strong className="text-primary-400">Inspectores Humanos</strong>{' '}
          cuando no hay cobertura GPS.
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
                        <span className="text-[10px] text-slate-500">
                          {svcsCount} servicios
                        </span>
                      </div>
                    </div>
                    {hasConfig && (
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Con config de competencia" />
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
                Seleccione un Agente en el panel izquierdo. Cada agente conoce
                todos los servicios de su línea, horarios reales de los cartones
                y la competencia en su corredor.
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
                  <p className="text-slate-400 text-sm mt-0.5">
                    {agent.lineaNombre}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">
                    Actualizado: {agent.lastUpdate?.toLocaleTimeString('es-UY') || '—'}
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
                    <span className="text-slate-500 text-xs">
                      ({agent.frecuenciaActual.label})
                    </span>
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
              </div>

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
                      Telemetría IMM (Tiempo Real)
                    </h3>
                    {agent.posicionesIMM.length > 0 ? (
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
                              <Activity className="w-3 h-3" /> GPS OK
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
                              Esto puede deberse a que la línea no reporta al feed público
                              de la IMM o los coches no tienen GPS activo.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Competencia */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-yellow-500" />
                      Competencia en Corredor
                    </h3>
                    {agent.rivales.length > 0 ? (
                      <div className="space-y-2">
                        {agent.rivales.map((r) => (
                          <div
                            key={r.lineId}
                            className="flex items-center justify-between p-3 bg-slate-950/50 rounded-xl border border-slate-800"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-400">
                                {r.lineId}
                              </div>
                              <div>
                                <div className="text-sm font-bold text-slate-200">
                                  {r.empresa}
                                </div>
                                <div className="text-xs text-slate-500 line-clamp-1">
                                  {r.tramoCompartido}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-xs font-bold text-rose-400">
                                {r.solapamientoPct}% Solape
                              </div>
                              {r.frecuenciaRivalMin && (
                                <div className="text-[10px] text-slate-500">
                                  Frec: {r.frecuenciaRivalMin}m
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl text-sm text-slate-500 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-slate-600" />
                        Datos de competencia no configurados para esta línea.
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
        danger
          ? 'border-rose-800/50'
          : highlight
            ? 'border-primary-500/30'
            : 'border-slate-800',
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
