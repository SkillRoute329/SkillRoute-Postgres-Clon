import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  BrainCircuit,
  Signal,
  Activity,
  Zap,
  Globe,
  Navigation,
  Clock,
  ArrowUpDown,
} from 'lucide-react';
import { collection, onSnapshot, query, limit, orderBy, where, getDocs } from '../config/firestoreShim';
import { db } from '../config/firebase';
import {
  checkCorridorThreat,
  COMPETITOR_MAP,
  CORRIDOR_MAP,
  detectCorridor,
  getCorridorsForLine,
  getVariantCodeForCorridor,
} from '../services/CompetitorIntelligence';
import type { CorridorDefinition } from '../services/CompetitorIntelligence';
import { LINEAS_UCOT_BASE } from '../services/ucotLinesService';
import { AIIntelligenceService } from '../services/aiIntelligenceService';
import { TrafficService } from '../services/trafficService';
import { ScheduleService } from '../services/scheduleService';
import { tacticalDataBus } from '../services/tacticalDataBus';
import STMLayeredMap from './STMLayeredMap';
import TacticalRouteMap from './TacticalRouteMap';
import { LineStatsModal } from './LineStatsModal';

interface ThreatResult {
  lineId: string;
  corridor: CorridorDefinition | null;
  threat: {
    detected: boolean;
    threatLevel: 'CRITICAL' | 'WARN' | 'SAFE';
    message: string;
    competitorLine?: string;
    distance?: number;
    gapMinutes?: number;
    recommendation?: string;
    rivalDirection?: string;
    scheduleIntel?: {
      ucotNextDep: string | null;
      rivalNextDep: string | null;
      ventajaMin: number;
      descripcion: string;
    };
  };
  ucotBusFound: boolean;
}

interface ScheduleInfo {
  ucotNextDep: string | null;
  rivalNextDep: string | null;
  ventajaMin: number;
  descripcion: string;
  enHoraPico: boolean;
  terminalOrigen: string;
  terminalDestino: string;
}

/**
 * Props del widget — prop empresaPropia (DIRECTRIZ 2026-04-24).
 * El algoritmo de threat-scan ahora identifica buses propios y rivales
 * dinámicamente según `empresaPropia` en lugar de hardcodear UCOT.
 * Default 70 (UCOT). El catálogo de líneas propias sigue siendo
 * LINEAS_UCOT_BASE como referencia mínima — pendiente generalizar a
 * shapes_cross_operator. Para CUTCSA/COME/COETC, el escaneo se hace
 * sobre las mismas líneas pero el filtro propio/rival respeta el
 * operador seleccionado.
 */
interface CompetitorThreatWidgetProps {
  empresaPropia?: number;
}

/**
 * Mapeo agency code ↔ nombre canónico STM (mismo que usa el endpoint
 * /api/positions). Usado por el threat-scan para identificar buses
 * propios vs rivales sin hardcodear "UCOT".
 */
const AGENCY_NAME_BY_ID: Record<number, string> = {
  10: 'COETC',
  20: 'COME',
  50: 'CUTCSA',
  70: 'UCOT',
};

export const CompetitorThreatWidget: React.FC<CompetitorThreatWidgetProps> = ({
  empresaPropia = 70,
}) => {
  /** Nombre del operador propio para comparaciones contra el campo empresa de los buses. */
  const empresaPropiaName = AGENCY_NAME_BY_ID[empresaPropia] ?? 'UCOT';
  const [activeThreats, setActiveThreats] = useState<ThreatResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedCorridor, setSelectedCorridor] = useState<CorridorDefinition | null>(null);
  const [livePositions, setLivePositions] = useState<Record<string, unknown>[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [externalRivals, setExternalRivals] = useState<Record<string, unknown>[]>([]);
  const [scheduleInfo, setScheduleInfo] = useState<ScheduleInfo | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);

  /**
   * Catálogo de líneas propias derivado dinámicamente de shapes_cross_operator
   * filtrado por agencyId === empresaPropia. Si la query falla o no devuelve
   * datos (operador sin shapes reconstruidas todavía), cae a LINEAS_UCOT_BASE
   * como fallback para no dejar el widget vacío.
   *
   * Se refetcha cuando cambia empresaPropia.
   */
  const [lineasFromShapes, setLineasFromShapes] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'shapes_cross_operator'),
            where('agencyId', '==', String(empresaPropia)),
            limit(500),
          ),
        );
        if (cancelled) return;
        const lineas = new Set<string>();
        for (const doc of snap.docs) {
          const d = doc.data();
          const linea = String(d.linea ?? '').trim();
          if (linea && linea !== '—') lineas.add(linea);
        }
        const arr = [...lineas].sort();
        setLineasFromShapes(arr.length > 0 ? arr : null);
      } catch (err) {
        if (cancelled) return;
        console.warn('[ThreatWidget] No se pudo cargar shapes_cross_operator:', err);
        setLineasFromShapes(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [empresaPropia]);

  /**
   * Mapa dinámico de rivales por línea propia, derivado de la matriz DRO
   * cross-operador (`corridor_overlap`). Reemplaza el COMPETITOR_MAP
   * hardcoded UCOT por datos reales: cada línea del operador propio se
   * mapea a las líneas rivales que pisan su corredor (otros operadores).
   *
   * Filtro: agencyA == empresaPropia AND sameEmpresa == false AND
   * pctAInB >= 5% (descarta solapamientos marginales).
   * Re-fetch al cambiar empresaPropia.
   */
  const [corridorRivalsMap, setCorridorRivalsMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'corridor_overlap'),
            where('agencyA', '==', String(empresaPropia)),
            where('sameEmpresa', '==', false),
            limit(2000),
          ),
        );
        if (cancelled) return;
        const map: Record<string, Set<string>> = {};
        for (const doc of snap.docs) {
          const d = doc.data();
          const lineaPropia = String(d.lineaA ?? '').trim();
          const lineaRival = String(d.lineaB ?? '').trim();
          const pct = Number(d.pctAInB ?? 0);
          if (!lineaPropia || !lineaRival || pct < 5) continue;
          if (!map[lineaPropia]) map[lineaPropia] = new Set();
          map[lineaPropia].add(lineaRival);
        }
        const result: Record<string, string[]> = {};
        Object.keys(map).forEach((k) => { result[k] = [...map[k]!].sort(); });
        setCorridorRivalsMap(result);
      } catch (err) {
        if (cancelled) return;
        console.warn('[ThreatWidget] No se pudo cargar corridor_overlap:', err);
        setCorridorRivalsMap({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [empresaPropia]);

  /**
   * Resuelve los rivales para una línea propia.
   * Prioridad:
   *   1. corridor_overlap (datos reales DRO cross-operador)
   *   2. COMPETITOR_MAP legacy (sólo UCOT, hardcoded — fallback compat)
   *   3. [] (operador sin matriz DRO todavía)
   */
  const getRivalsForLine = useCallback((lineId: string): string[] => {
    const fromDro = corridorRivalsMap[lineId];
    if (fromDro && fromDro.length > 0) return fromDro;
    if (empresaPropia === 70) return COMPETITOR_MAP[lineId] || [];
    return [];
  }, [corridorRivalsMap, empresaPropia]);

  // Unique line IDs from corridor map
  const uniqueLines = useMemo(() => {
    const lineSet = new Set(CORRIDOR_MAP.map((c) => c.lineId));
    return Array.from(lineSet);
  }, []);

  // 🛰️ AGENTES PERMANENTES: Listener de Firestore + Tactical Bus
  useEffect(() => {
    const unsubscribeBus = tacticalDataBus.subscribe(
      (simulatedBatch: Record<string, unknown>[]) => {
        setLivePositions((prev) => {
          const nonSimulated = prev.filter((p) => !(p.id as string)?.startsWith('sim-'));
          return [...nonSimulated, ...simulatedBatch];
        });
      },
    );

    const q = query(collection(db, 'viajes_activos'), orderBy('updatedAt', 'desc'), limit(200));

    const unsubscribeFirestore = onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        const realPositions = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p: Record<string, unknown>) => {
            const updatedAt =
              (p.updatedAt as { toMillis?: () => number })?.toMillis?.() ||
              (p.updatedAt as number) ||
              0;
            return now - updatedAt < 4 * 60 * 1000;
          });

        setLivePositions((prev) => {
          const simulados = prev.filter((p) => (p.id as string)?.startsWith('sim-'));
          return [...simulados, ...realPositions];
        });
      },
      (err) => console.error('Error Radar Sync:', err),
    );

    return () => {
      unsubscribeBus();
      unsubscribeFirestore();
    };
  }, []);

  /**
   * Líneas propias del operador seleccionado.
   * Prioridad:
   *   1) shapes_cross_operator filtrado por agencyId (datos reales del IMM).
   *   2) Si UCOT y la query falla/vacía → LINEAS_UCOT_BASE (catálogo verificado).
   *   3) Si otro operador y la query falla → LINEAS_UCOT_BASE como fallback
   *      mínimo para que el widget tenga algo que escanear.
   *
   * Cap a 30 líneas para no saturar el threat-scan (cada línea hace 1 query
   * STM y 1 detect-corridor por iteración del runTacticalScan).
   */
  const lineasPropias = useMemo(() => {
    if (lineasFromShapes && lineasFromShapes.length > 0) {
      return lineasFromShapes.slice(0, 30);
    }
    // Fallback sólo aplica para UCOT (donde LINEAS_UCOT_BASE existe como
    // catálogo verificado). Para otros operadores, devolver [] hasta que
    // shapes_cross_operator esté poblado — el UI muestra mensaje explícito.
    if (empresaPropia === 70) return LINEAS_UCOT_BASE;
    return [];
  }, [lineasFromShapes, empresaPropia]);

  const runTacticalScan = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    try {
      // 1. Obtener posiciones de rivales externos (STM)
      const allRivalLines = Array.from(
        new Set(lineasPropias.flatMap((l) => getRivalsForLine(l))),
      );
      const stmPositions = await TrafficService.fetchCompetitorPositions(allRivalLines);

      const stmFormatted = stmPositions.map((p: Record<string, unknown>) => ({
        id: `stm-${p.codigoBus || p.id || Math.random()}`,
        codigoLinea: p.linea || p.codigoLinea,
        posicion: { lat: p.latitud, lng: p.longitud },
        heading: p.heading || 0,
        empresa: 'RIVAL_STM',
        isExternal: true,
      }));
      setExternalRivals(stmFormatted);

      // 2. Mezclar STM con Rivales de Firestore.
      // Cualquier bus cuyo `empresa` no sea el operador propio se considera rival.
      const mergedRivalData: Record<string, unknown>[] = [...stmPositions];
      livePositions.forEach((p) => {
        const isRival = p.empresa !== empresaPropiaName && p.empresa !== empresaPropia;
        if (isRival && p.posicion) {
          const pos = p.posicion as Record<string, unknown>;
          mergedRivalData.push({
            linea: p.codigoLinea,
            latitud: pos.latitude || pos.lat,
            longitud: pos.longitude || pos.lng,
            heading: p.heading || 0,
          });
        }
      });

      // 3. ESCANEO POR CORREDOR (no por línea genérica)
      const results: ThreatResult[] = [];

      for (const lineId of lineasPropias) {
        const cleanId = lineId.toString().replace(/[ab]$/i, '');

        // Encontrar bus PROPIO de esta línea (cross-operador):
        // matchea por nombre del operador (UCOT/CUTCSA/COME/COETC) o
        // por el id numérico (legacy '2' UCOT).
        const propBus = livePositions.find((p) => {
          const pLine = (p.codigoLinea as string)?.toString().replace(/[ab]$/i, '');
          const isOwn =
            p.empresa === empresaPropiaName ||
            p.empresa === empresaPropia ||
            (empresaPropia === 70 && (p.empresa === 2 || (p.id as string)?.includes('sim-ucot')));
          return pLine === cleanId && isOwn;
        });

        if (propBus?.posicion) {
          const pos = propBus.posicion as Record<string, unknown>;
          const lat = Number(pos.latitude || pos.lat);
          const lng = Number(pos.longitude || pos.lng);
          const heading = Number(propBus.heading || 0);

          // AUTO-DETECTAR CORREDOR por heading
          const corridor = detectCorridor(lineId, heading);

          // Análisis por corredor (destination-aware)
          const threat = await checkCorridorThreat(
            lineId,
            lat,
            lng,
            heading,
            mergedRivalData,
            corridor || undefined,
          );

          results.push({ lineId, corridor, threat, ucotBusFound: true });

          // IA con contexto de corredor + variante + horarios
          AIIntelligenceService.processCommand({
            lineId,
            threat: threat as unknown as Record<string, unknown>,
            ucotFound: true,
            corridor: corridor?.label || lineId,
            destino: corridor?.destino || 'DESCONOCIDO',
            variantCode: corridor?.variantCode,
            // ucotBusId es el nombre legacy del campo en AIIntelligenceService;
            // ahora lleva el id del bus propio (cross-operador).
            ucotBusId: String(propBus.id || propBus.codigoBus || ''),
            rivals: corridor?.rivals,
          });
        } else {
          results.push({
            lineId,
            corridor: null,
            ucotBusFound: false,
            threat: {
              detected: false,
              threatLevel: 'SAFE',
              message: 'BUSCANDO SEÑAL GPS...',
            },
          });
          AIIntelligenceService.processCommand({
            lineId,
            threat: null,
            ucotFound: false,
            corridor: lineId,
            destino: '',
          });
        }
      }
      setActiveThreats(results);
    } catch (e) {
      console.error('Radar Scan Error:', e);
    } finally {
      setLoading(false);
    }
  }, [livePositions, loading]);

  useEffect(() => {
    const timer = setTimeout(runTacticalScan, 3000);
    return () => clearTimeout(timer);
  }, [livePositions, runTacticalScan]);

  // Cargar horarios del corredor (rutas ahora se ven en el mapa STM embebido)
  useEffect(() => {
    async function loadScheduleInfo() {
      if (!selectedLineId) {
        setScheduleInfo(null);
        return;
      }

      if (selectedCorridor) {
        const variantCode = getVariantCodeForCorridor(selectedCorridor);

        // Cargar horarios del corredor
        const timingIntel = ScheduleService.getCorridorTimingIntel(
          variantCode,
          selectedCorridor.rivals,
        );

        const primaryAdv = timingIntel.rivalSchedules[0];
        setScheduleInfo({
          ucotNextDep:
            primaryAdv?.ventajaMin !== undefined
              ? ScheduleService.getNextDeparture(variantCode)?.hora || null
              : null,
          rivalNextDep: primaryAdv
            ? ScheduleService.getNextDeparture(selectedCorridor.rivals[0])?.hora || null
            : null,
          ventajaMin: primaryAdv?.ventajaMin || 0,
          descripcion: timingIntel.resumen,
          enHoraPico: timingIntel.enHoraPico,
          terminalOrigen: selectedCorridor.terminalOrigen,
          terminalDestino: selectedCorridor.terminalDestino,
        });
      } else {
        setScheduleInfo(null);
      }
    }
    loadScheduleInfo();
  }, [selectedLineId, selectedCorridor]);

  // Seleccionar una línea y abrir sus corredores
  const handleLineSelect = (lineId: string) => {
    if (selectedLineId === lineId) {
      setSelectedLineId(null);
      setSelectedCorridor(null);
    } else {
      setSelectedLineId(lineId);
      // Auto-seleccionar el corredor que detectó el scan
      const scannedResult = activeThreats.find((t) => t.lineId === lineId);
      setSelectedCorridor(scannedResult?.corridor || null);
    }
  };

  const handleCorridorSelect = (corridor: CorridorDefinition) => {
    setSelectedCorridor(corridor);
    setSelectedLineId(corridor.lineId);
  };

  const selectedThreat = activeThreats.find((t) => t.lineId === selectedLineId);
  const agentInsight = selectedLineId
    ? AIIntelligenceService.getAgentInsight(selectedLineId)
    : AIIntelligenceService.getGlobalStatus(activeThreats);

  const filteredLines = uniqueLines.filter((l) =>
    l.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Corredores de la línea seleccionada
  const _availableCorridors = selectedLineId ? getCorridorsForLine(selectedLineId) : [];

  // Modo RUTAS por defecto → muestra recorridos reales con colores tácticos
  const [mapMode, setMapMode] = useState<'VIVO' | 'RUTAS'>('RUTAS');

  return (
    <div className="flex h-[750px] flex-col overflow-hidden border border-white/5 bg-slate-950 font-mono shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-2xl">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/40 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary-500/20 text-primary-400">
            <Signal className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-tighter text-white">
              {empresaPropia === 70 ? 'UCOT' : empresaPropia === 50 ? 'CUTCSA' : empresaPropia === 20 ? 'COME' : empresaPropia === 10 ? 'COETC' : 'OPERADOR'} CORRIDOR COMMAND <span className="text-primary-500">v5.0</span>
            </h3>
            <div className="flex items-center gap-2">
              <div
                className={`h-1.5 w-1.5 rounded-full ${loading ? 'animate-pulse bg-blue-500' : 'bg-green-500'}`}
              />
              <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">
                CORRIDOR MODE | {livePositions.length} UNITS | {CORRIDOR_MAP.length} CORRIDORS
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex items-center gap-2 rounded bg-primary-500/10 px-3 py-1 border border-primary-500/20">
            <Navigation className="h-3 w-3 text-primary-400 animate-pulse" />
            <span className="text-[9px] font-black text-primary-400 uppercase tracking-widest">
              Variant+Schedule Aware
            </span>
          </div>
          <button
            onClick={() => runTacticalScan()}
            disabled={loading}
            title="Refresh Tactical Scan"
            className="rounded-lg bg-slate-800 p-2 text-slate-400 hover:bg-slate-700 hover:text-white transition-all disabled:opacity-50 border border-white/10"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowStatsModal(true)}
            title="Abrir Estadísticas de Análisis"
            className="rounded-lg bg-cyan-900/40 p-2 text-cyan-400 hover:bg-cyan-900 hover:text-white transition-all border border-cyan-500/20 flex items-center gap-2"
          >
            <Activity className="h-3.5 w-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline-block">
              Estadísticas
            </span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT PANEL: Radar & Intelligence */}
        <div className="flex w-[420px] flex-col border-r border-white/10 bg-slate-900/10">
          {/* Search + Line List */}
          <div className="flex h-[300px] flex-col border-b border-white/5">
            <div className="p-2 bg-slate-800/20">
              <div className="relative">
                <input
                  type="text"
                  placeholder="BUSCAR LÍNEA O CORREDOR..."
                  className="w-full bg-slate-950 p-3 pl-9 text-[10px] text-white outline-none border border-white/10 rounded-lg font-black tracking-widest focus:border-primary-500/50 transition-all shadow-inner"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Signal className="absolute left-3 top-3 h-4 w-4 text-slate-600" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {/* Global Status Button */}
              <button
                onClick={() => {
                  setSelectedLineId(null);
                  setSelectedCorridor(null);
                }}
                className={`w-full py-2 px-3 text-left text-[9px] font-black flex items-center justify-between group transition-all ${!selectedLineId ? 'bg-primary-500/10 text-primary-400 border-l-2 border-primary-500' : 'text-slate-500 hover:bg-slate-800/40'}`}
              >
                <span>GLOBAL STATUS</span>
                <Globe
                  className={`h-3 w-3 ${!selectedLineId ? 'text-primary-400' : 'text-slate-700 opacity-0 group-hover:opacity-100'}`}
                />
              </button>

              {/* Lines with Corridor Sub-Items */}
              {filteredLines.map((lineId) => {
                const lineThreats = activeThreats.filter((t) => t.lineId === lineId);
                const hasCritical = lineThreats.some(
                  (t) => t.threat?.detected && t.threat.threatLevel !== 'SAFE',
                );
                const isLineSelected = selectedLineId === lineId;
                const corridors = getCorridorsForLine(lineId);
                const detectedCorridor = lineThreats[0]?.corridor;

                return (
                  <div key={lineId}>
                    {/* Line Header */}
                    <button
                      onClick={() => handleLineSelect(lineId)}
                      className={`relative w-full px-4 py-3 text-left text-[13px] font-black transition-all border-b border-white/5 flex items-center justify-between group ${
                        isLineSelected
                          ? 'bg-primary-500/15 text-white border-l-4 border-primary-500'
                          : 'text-slate-400 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className={isLineSelected ? 'text-primary-400' : ''}>
                          LÍNEA {lineId}
                        </span>
                        {detectedCorridor && (
                          <span className="text-[8px] text-slate-500 font-normal mt-0.5">
                            Activo: {detectedCorridor.destino}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {isLineSelected && (
                          <Activity className="h-4 w-4 text-primary-500 animate-pulse" />
                        )}
                        {hasCritical && (
                          <span className="flex h-3 w-3 relative">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600 shadow-[0_0_15px_rgba(220,38,38,1)]" />
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Corridor Sub-Items (visible when line is selected) */}
                    {isLineSelected && corridors.length > 0 && (
                      <div className="bg-slate-900/60 border-l-4 border-primary-500/30">
                        {corridors.map((corridor) => {
                          const isActiveCorridor =
                            selectedCorridor?.destino === corridor.destino &&
                            selectedCorridor?.lineId === corridor.lineId;
                          const corridorThreat = lineThreats.find(
                            (t) => t.corridor?.destino === corridor.destino,
                          );

                          return (
                            <button
                              key={`${corridor.lineId}-${corridor.destino}`}
                              onClick={() => handleCorridorSelect(corridor)}
                              className={`w-full px-6 py-2 text-left text-[10px] font-bold flex items-center justify-between transition-all ${
                                isActiveCorridor
                                  ? 'bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-500'
                                  : 'text-slate-500 hover:bg-slate-800/30 hover:text-slate-300'
                              }`}
                            >
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <Navigation
                                    className={`h-3 w-3 ${isActiveCorridor ? 'text-cyan-400' : 'text-slate-600'}`}
                                  />
                                  <span>{corridor.label}</span>
                                </div>
                                <span className="text-[7px] text-slate-600 ml-5">
                                  {corridor.terminalOrigen} → {corridor.terminalDestino}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[8px] text-slate-600">
                                  vs {corridor.rivals.join(', ')}
                                </span>
                                {corridorThreat?.threat?.detected &&
                                  corridorThreat.threat.threatLevel !== 'SAFE' && (
                                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                  )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Intelligence Panel */}
          <div className="flex-1 flex flex-col bg-slate-950/40">
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {selectedLineId ? (
                <div className="space-y-4">
                  {/* Corridor Context Header */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-primary-500 tracking-widest uppercase border-b border-primary-500/30 pb-1">
                      {selectedCorridor
                        ? selectedCorridor.label
                        : `Línea ${selectedLineId} — Tactical`}
                    </span>
                    {selectedCorridor && (
                      <span className="text-[8px] text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded">
                        {selectedCorridor.terminalOrigen} → {selectedCorridor.terminalDestino}
                      </span>
                    )}
                  </div>

                  {/* ★ SCHEDULE INTELLIGENCE PANEL */}
                  {scheduleInfo && selectedCorridor && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-3 w-3 text-amber-400" />
                        <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest">
                          Inteligencia Horaria
                        </span>
                        {scheduleInfo.enHoraPico && (
                          <span className="text-[7px] font-black text-red-400 bg-red-500/20 px-1.5 py-0.5 rounded animate-pulse">
                            HORA PICO
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div className="bg-slate-950/50 p-2 rounded text-center">
                          <span className="text-[7px] text-slate-500 block">UCOT PRÓX</span>
                          <span className="text-[13px] font-black text-cyan-400">
                            {scheduleInfo.ucotNextDep || '--:--'}
                          </span>
                        </div>
                        <div className="bg-slate-950/50 p-2 rounded text-center">
                          <span className="text-[7px] text-slate-500 block">RIVAL PRÓX</span>
                          <span className="text-[13px] font-black text-red-400">
                            {scheduleInfo.rivalNextDep || '--:--'}
                          </span>
                        </div>
                        <div className="bg-slate-950/50 p-2 rounded text-center">
                          <span className="text-[7px] text-slate-500 block">VENTAJA</span>
                          <span
                            className={`text-[13px] font-black ${
                              scheduleInfo.ventajaMin > 0
                                ? 'text-emerald-400'
                                : scheduleInfo.ventajaMin < 0
                                  ? 'text-red-400'
                                  : 'text-slate-400'
                            }`}
                          >
                            {scheduleInfo.ventajaMin > 0 ? '+' : ''}
                            {scheduleInfo.ventajaMin}min
                          </span>
                        </div>
                      </div>
                      <div className="text-[9px] text-slate-300 leading-relaxed">
                        {scheduleInfo.descripcion}
                      </div>
                    </div>
                  )}

                  {/* Active Corridor Rivals */}
                  {selectedCorridor && (
                    <div className="rounded-lg bg-slate-900/80 p-4 border border-rose-500/20 shadow-[0_0_15px_rgba(225,29,72,0.1)]">
                      <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-rose-500" />
                          <span className="text-[10px] text-rose-400 uppercase font-black tracking-widest">
                            Líneas de Mayor Competencia
                          </span>
                        </div>
                        <ArrowUpDown className="h-3 w-3 text-slate-600" />
                      </div>
                      <div className="flex flex-col gap-2">
                        {selectedCorridor.rivals.map((rival) => {
                          const rivalDep = ScheduleService.getNextDeparture(rival);
                          // Si ventaja > 0, UCOT sale después. Si < 0, UCOT sale antes. Aquí sólo evaluamos presencia del rival
                          return (
                            <div
                              key={rival}
                              className="flex items-center justify-between bg-slate-950/50 p-2 rounded border border-white/5 hover:border-rose-500/30 transition-all group"
                            >
                              <div className="flex items-center gap-3">
                                <div className="h-6 w-1 rounded-full bg-rose-600 group-hover:bg-rose-500 shadow-[0_0_8px_rgba(225,29,72,1)]" />
                                <span className="text-[14px] font-black text-slate-200">
                                  Línea {rival}
                                </span>
                              </div>
                              <div className="flex items-center gap-4">
                                {rivalDep ? (
                                  <div className="flex flex-col items-end">
                                    <span className="text-[8px] text-slate-500 font-bold uppercase">
                                      Próxima Salida
                                    </span>
                                    <span className="text-[12px] text-rose-400 font-black">
                                      {rivalDep.hora}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-600 italic">
                                    Sin datos
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Threat HUD */}
                  <div
                    className={`rounded-xl border ${selectedThreat?.threat?.threatLevel === 'CRITICAL' || (scheduleInfo && scheduleInfo.ventajaMin < 0) ? 'border-red-500/50 bg-red-950/20 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'border-white/10 bg-slate-900/80 shadow-2xl'} p-5 backdrop-blur-sm relative overflow-hidden`}
                  >
                    {/* Urgency Overlay */}
                    {((scheduleInfo && scheduleInfo.ventajaMin < 0) ||
                      selectedThreat?.threat?.rivalDirection === 'AHEAD') && (
                      <div className="absolute top-0 left-0 w-full bg-red-600/90 text-[10px] font-black text-white px-2 py-1 flex items-center justify-center gap-2 tracking-widest uppercase shadow-md animate-pulse z-10">
                        <Zap className="h-3 w-3" />
                        ¡ATENCIÓN INSPECTOR! COMPETENCIA POR DELANTE O SALIENDO ANTES
                        <Zap className="h-3 w-3" />
                      </div>
                    )}

                    <div
                      className={`mb-4 flex items-center justify-between border-b border-white/10 pb-2 ${(scheduleInfo && scheduleInfo.ventajaMin < 0) || selectedThreat?.threat?.rivalDirection === 'AHEAD' ? 'pt-6' : ''}`}
                    >
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        {selectedCorridor
                          ? `Corredor: ${selectedCorridor.destino}`
                          : 'Sector: Metropolitan'}
                      </span>
                      {selectedThreat?.ucotBusFound && (
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] text-emerald-400 font-bold uppercase">
                            UCOT Online
                          </span>
                          <Signal className="h-3 w-3 text-emerald-500 animate-pulse" />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="bg-slate-950/50 p-3 rounded-lg border border-white/5">
                        <span className="text-[8px] text-slate-500 block uppercase mb-1 font-bold">
                          Gap Rival
                        </span>
                        <span
                          className={`text-2xl font-black tracking-tighter ${selectedThreat?.threat?.threatLevel === 'CRITICAL' ? 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'text-cyan-400'}`}
                        >
                          {selectedThreat?.threat?.distance
                            ? `${selectedThreat.threat.distance}m`
                            : '---'}
                        </span>
                        {/* Rival direction indicator */}
                        {selectedThreat?.threat?.rivalDirection && (
                          <span className="text-[8px] text-amber-400 block mt-1 font-bold">
                            {selectedThreat.threat.rivalDirection === 'AHEAD'
                              ? '↗ POR DELANTE'
                              : selectedThreat.threat.rivalDirection === 'BEHIND'
                                ? '↙ POR DETRÁS'
                                : '→ LATERAL'}
                          </span>
                        )}
                      </div>
                      <div className="bg-slate-950/50 p-3 rounded-lg border border-white/5 flex flex-col items-end">
                        <span className="text-[8px] text-slate-500 block uppercase mb-1 font-bold">
                          IA Recommendation
                        </span>
                        <div
                          className={`text-[12px] font-black px-3 py-1 rounded inline-block shadow-lg ${
                            selectedThreat?.threat?.recommendation === 'DELAY'
                              ? 'bg-red-600 text-white animate-pulse'
                              : selectedThreat?.threat?.recommendation === 'SPEED_UP'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {selectedThreat?.threat?.recommendation || 'SCANNING'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Neural Report */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <BrainCircuit className="h-4 w-4 text-primary-400" />
                      <span className="text-[10px] font-black text-slate-300 tracking-[0.2em] uppercase italic bg-primary-500/10 px-2 py-0.5 rounded">
                        Neural_Report
                      </span>
                    </div>
                    <div className="rounded-xl border-l-4 border-primary-500 bg-slate-900/60 p-5 text-[14px] leading-relaxed text-slate-200 font-medium shadow-xl">
                      {agentInsight || 'Procesando telemetría de combate...'}
                    </div>
                  </div>
                </div>
              ) : (
                /* GLOBAL VIEW */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-black text-red-500 tracking-widest uppercase">
                      Hot Zones (Corridor-Aware)
                    </span>
                    <Activity className="h-3 w-3 text-red-500 animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    {activeThreats
                      .filter((t) => t.threat?.detected && t.threat.threatLevel !== 'SAFE')
                      .map((t) => (
                        <div
                          key={`${t.lineId}-${t.corridor?.destino || 'generic'}`}
                          className="flex items-center justify-between p-2 bg-red-950/20 border-l-2 border-red-600 rounded text-[9px] cursor-pointer hover:bg-red-900/30 transition-all"
                          onClick={() => {
                            setSelectedLineId(t.lineId);
                            setSelectedCorridor(t.corridor);
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="font-black text-white">LÍNEA {t.lineId}</span>
                            {t.corridor && (
                              <span className="text-[8px] text-red-300 mt-0.5">
                                → {t.corridor.destino}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {t.threat.rivalDirection && (
                              <span className="text-[7px] text-amber-400 font-bold">
                                {t.threat.rivalDirection === 'AHEAD' ? 'DELANTE' : 'DETRÁS'}
                              </span>
                            )}
                            <span className="text-red-400 font-bold uppercase">
                              {t.threat.threatLevel === 'CRITICAL' ? 'BARRIDO' : 'PRESIÓN'}
                            </span>
                          </div>
                        </div>
                      ))}
                    {activeThreats.filter(
                      (t) => t.threat?.detected && t.threat.threatLevel !== 'SAFE',
                    ).length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-slate-800">
                        <Zap className="h-8 w-8 mb-2 opacity-20" />
                        <span className="text-[8px] font-black uppercase opacity-20">
                          No critical corridor incursions
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sub-Footer */}
            <div className="border-t border-white/5 bg-slate-900/40 px-3 py-2">
              <div className="flex items-center justify-between text-[7px] font-black text-slate-600 uppercase italic">
                <span>
                  Corridors: {CORRIDOR_MAP.length} | Active Scans:{' '}
                  {activeThreats.filter((t) => t.ucotBusFound).length}
                </span>
                <span>Node_HQ_01 | v5.0</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: VIVO (iframe STM competencia) / RUTAS (Leaflet datos reales) */}
        <div className="relative flex flex-1 flex-col overflow-hidden bg-slate-950">
          {/* ═══ TOGGLE VIVO / RUTAS ═══ */}
          <div className="absolute top-3 right-3 z-[1001] flex gap-1 rounded-lg bg-slate-900/95 border border-white/10 p-1 shadow-xl backdrop-blur">
            <button
              onClick={() => setMapMode('VIVO')}
              className={`px-3 py-1.5 rounded-md text-xs font-black tracking-widest transition-all ${
                mapMode === 'VIVO'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              🔴 VIVO
            </button>
            <button
              onClick={() => setMapMode('RUTAS')}
              className={`px-3 py-1.5 rounded-md text-xs font-black tracking-widest transition-all ${
                mapMode === 'RUTAS'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              🗺️ RUTAS
            </button>
          </div>

          {/* ═══ VIVO: iframe STM con competencia real ═══ */}
          {mapMode === 'VIVO' && (
            <STMLayeredMap
              liveBuses={[
                ...livePositions
                  .filter((p) => {
                    const isUCOT =
                      p.empresa === 'UCOT' ||
                      p.empresa === 2 ||
                      (p.id as string)?.includes('sim-ucot');

                    if (!selectedLineId) return isUCOT; // En vista global, mostrar todos (cuidado con la cantidad)
                    if (isUCOT && p.codigoLinea === selectedLineId) return true;

                    const cRivals =
                      selectedCorridor?.rivals || getRivalsForLine(selectedLineId);
                    const pLine = (p.codigoLinea as string)?.toString().replace(/[ab]$/i, '');
                    return cRivals.includes(pLine);
                  })
                  .map((p) => {
                    const pos = p.posicion as Record<string, unknown>;
                    return {
                      id: p.id as string,
                      linea: p.codigoLinea as string,
                      lat: Number(pos?.latitude || pos?.lat || 0),
                      lng: Number(pos?.longitude || pos?.lng || 0),
                      heading: Number(p.heading || 0),
                      empresa: p.empresa as string | number,
                    };
                  }),
                ...externalRivals
                  .filter((p) => {
                    if (!selectedLineId) return false; // NUNCA mostrar miles de rivales en vista global (crasha la app)
                    const cRivals =
                      selectedCorridor?.rivals || getRivalsForLine(selectedLineId);
                    const pLine = (p.codigoLinea as string)?.toString().replace(/[ab]$/i, '');
                    return cRivals.includes(pLine);
                  })
                  .map((p) => {
                    const pos = p.posicion as Record<string, unknown>;
                    return {
                      id: p.id as string,
                      linea: p.codigoLinea as string,
                      lat: Number(pos?.lat || 0),
                      lng: Number(pos?.lng || 0),
                      heading: Number(p.heading || 0),
                      empresa: 'RIVAL_STM' as string | number,
                    };
                  }),
              ]}
              selectedLineId={selectedLineId || undefined}
              corridorLabel={selectedCorridor?.label}
              corridorTerminals={
                selectedCorridor
                  ? `${selectedCorridor.terminalOrigen} → ${selectedCorridor.terminalDestino}`
                  : undefined
              }
              corridorRivals={selectedCorridor?.rivals}
              scheduleInfo={scheduleInfo}
              threatLevel={selectedThreat?.threat?.threatLevel || 'SAFE'}
              recommendation={selectedThreat?.threat?.recommendation}
            />
          )}

          {/* ═══ RUTAS: Leaflet con recorridos REALES de la API STM ═══ */}
          {mapMode === 'RUTAS' && (
            <TacticalRouteMap
              liveBuses={[
                ...livePositions
                  .filter((p) => {
                    const isUCOT =
                      p.empresa === 'UCOT' ||
                      p.empresa === 2 ||
                      (p.id as string)?.includes('sim-ucot');
                    if (!selectedLineId) return isUCOT;
                    if (isUCOT && p.codigoLinea === selectedLineId) return true;

                    const cRivals =
                      selectedCorridor?.rivals || getRivalsForLine(selectedLineId);
                    const pLine = (p.codigoLinea as string)?.toString().replace(/[ab]$/i, '');
                    return cRivals.includes(pLine);
                  })
                  .map((p) => {
                    const pos = p.posicion as Record<string, unknown>;
                    return {
                      id: p.id as string,
                      linea: p.codigoLinea as string,
                      lat: Number(pos?.latitude || pos?.lat || 0),
                      lng: Number(pos?.longitude || pos?.lng || 0),
                      heading: Number(p.heading || 0),
                      empresa: p.empresa as string | number,
                    };
                  }),
                ...externalRivals
                  .filter((p) => {
                    if (!selectedLineId) return false;
                    const cRivals =
                      selectedCorridor?.rivals || getRivalsForLine(selectedLineId);
                    const pLine = (p.codigoLinea as string)?.toString().replace(/[ab]$/i, '');
                    return cRivals.includes(pLine);
                  })
                  .map((p) => {
                    const pos = p.posicion as Record<string, unknown>;
                    return {
                      id: p.id as string,
                      linea: p.codigoLinea as string,
                      lat: Number(pos?.lat || 0),
                      lng: Number(pos?.lng || 0),
                      heading: Number(p.heading || 0),
                      empresa: 'RIVAL_STM' as string | number,
                    };
                  }),
              ]}
              selectedLineId={selectedLineId || undefined}
              corridorLabel={selectedCorridor?.label}
              corridorTerminals={
                selectedCorridor
                  ? `${selectedCorridor.terminalOrigen} → ${selectedCorridor.terminalDestino}`
                  : undefined
              }
              corridorRivals={selectedCorridor?.rivals}
              scheduleInfo={scheduleInfo}
              threatLevel={selectedThreat?.threat?.threatLevel || 'SAFE'}
              recommendation={selectedThreat?.threat?.recommendation}
            />
          )}
        </div>
      </div>

      {/* Stats Modal */}
      {showStatsModal && (
        <LineStatsModal onClose={() => setShowStatsModal(false)} filteredLineId={selectedLineId} />
      )}
    </div>
  );
};
