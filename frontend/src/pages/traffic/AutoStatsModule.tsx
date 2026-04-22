/**
 * AutoStatsModule — Estadísticas automáticas de cumplimiento horario
 * Sin inspectores. GPS en vivo + Malla GTFS oficial (invierno 2026).
 * Funciona para UCOT, CUTCSA, COETC, COME.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity, Bus, CheckCircle2, XCircle, AlertTriangle, Clock,
  RefreshCw, Search, BarChart3, TrendingUp, TrendingDown,
  Shield, Wifi, WifiOff, ChevronRight, Timer, User,
  Building2, Route,
} from 'lucide-react';
import {
  fetchAgencies, fetchComplianceRealtime, fetchVehicleHistory, fetchEndpointHealth,
  AGENCY_LABELS, AGENCY_COLORS,
  type AgencyInfo, type ComplianceResponse,
  type BusComplianceResult, type VehicleHistoryResponse, type EndpointHealth,
} from '../../services/autoStatsService';

// ── Helpers visuales ──────────────────────────────────────────────────────

const ESTADO_CONFIG = {
  EN_TIEMPO:        { label: 'En tiempo',      color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-500' },
  ADELANTADO:       { label: 'Adelantado',     color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/30',         dot: 'bg-sky-500'     },
  ATRASADO:         { label: 'Atrasado',       color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30',         dot: 'bg-red-500 animate-pulse' },
  SIN_HORARIO:      { label: 'Sin horario GTFS', color: 'text-slate-400', bg: 'bg-slate-700/30 border-slate-600/30',    dot: 'bg-slate-500'   },
  FUERA_DE_SERVICIO:{ label: 'Fuera de horario', color: 'text-slate-500', bg: 'bg-slate-800/30 border-slate-700/20',   dot: 'bg-slate-700'   },
};

function EstadoBadge({ estado }: { estado: BusComplianceResult['estadoCumplimiento'] }) {
  const cfg = ESTADO_CONFIG[estado] ?? ESTADO_CONFIG.SIN_HORARIO;
  return (
    <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function AgencyPill({ agencyId, active, onClick }: { agencyId: string; active: boolean; onClick: () => void }) {
  const color = AGENCY_COLORS[agencyId] ?? 'slate';
  return (
    <button
      onClick={onClick}
      className={`flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
        active
          ? `bg-${color}-500/20 border-${color}-500/50 text-${color}-300 shadow-md`
          : 'bg-slate-800/40 border-slate-700/30 text-slate-400 hover:text-slate-200 hover:border-slate-500/50'
      }`}
    >
      <Building2 className="w-3 h-3" />
      {AGENCY_LABELS[agencyId] ?? agencyId}
    </button>
  );
}

// ── Panel de historial de coche ───────────────────────────────────────────

function VehicleProfilePanel({ idBus, onClose }: { idBus: string; onClose: () => void }) {
  const [data, setData] = useState<VehicleHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    fetchVehicleHistory(idBus, days)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [idBus, days]);

  const s = data?.summary;

  return (
    <div className="w-[420px] flex-none border-l border-slate-800/60 flex flex-col bg-slate-900/70 overflow-hidden">
      {/* Header */}
      <div className="flex-none px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bus className="w-4 h-4 text-indigo-400" />
            <h2 className="text-base font-extrabold text-white">Coche #{idBus}</h2>
          </div>
          {s && <p className="text-[10px] text-slate-500 mt-0.5">{s.empresa} · {s.lineasOperadas.join(', ')}</p>}
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1">
          <XCircle className="w-5 h-5" />
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && !s && (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3">
          <WifiOff className="w-10 h-10 text-slate-700" />
          <p className="text-slate-500 text-sm">Sin historial para el coche #{idBus}</p>
          <p className="text-slate-600 text-xs">Los datos se acumulan con cada snapshot GPS (cada 2 min).</p>
        </div>
      )}

      {!loading && s && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {/* Selector días */}
          <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1">
            {[1, 7, 30].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all ${days === d ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {d === 1 ? 'Hoy' : `${d} días`}
              </button>
            ))}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Vel. media', value: `${s.velocidadMedia} km/h`, color: 'text-sky-400' },
              { label: 'Registros', value: String(s.totalEventos), color: 'text-white' },
              { label: 'Líneas operadas', value: s.lineasOperadas.length, color: 'text-indigo-400' },
              { label: 'Desv. media', value: s.desviacionMediaMin != null ? `${s.desviacionMediaMin > 0 ? '+' : ''}${s.desviacionMediaMin} min` : '—', color: s.desviacionMediaMin != null && Math.abs(s.desviacionMediaMin) > 3 ? 'text-amber-400' : 'text-emerald-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-3">
                <p className={`text-lg font-extrabold ${color}`}>{value}</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</p>
              </div>
            ))}
          </div>

          {/* Cumplimiento */}
          <div>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Shield className="w-3 h-3" /> Cumplimiento horario
            </h3>
            <div className="space-y-1.5">
              {[
                { label: 'En tiempo',    pct: s.pctEnTiempo,    color: 'bg-emerald-500' },
                { label: 'Atrasado',     pct: s.pctAtrasado,    color: 'bg-red-500'     },
                { label: 'Adelantado',   pct: s.pctAdelantado,  color: 'bg-sky-500'     },
                { label: 'Sin horario',  pct: s.pctSinHorario,  color: 'bg-slate-600'   },
              ].map(({ label, pct, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-slate-400">{label}</span>
                    <span className="text-slate-300 font-bold">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Líneas operadas */}
          <div>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Route className="w-3 h-3" /> Líneas operadas
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {s.lineasOperadas.map(l => (
                <span key={l} className="text-[11px] font-extrabold bg-slate-800/60 border border-slate-700/40 text-white px-2 py-1 rounded-lg">{l}</span>
              ))}
            </div>
          </div>

          {/* Timeline últimos eventos */}
          {data!.history.length > 0 && (
            <div>
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Últimos eventos
              </h3>
              <div className="space-y-1">
                {data!.history.slice(0, 12).map((ev, i) => {
                  const cfg = ESTADO_CONFIG[ev.estadoCumplimiento as keyof typeof ESTADO_CONFIG] ?? ESTADO_CONFIG.SIN_HORARIO;
                  return (
                    <div key={i} className="flex items-center gap-2 bg-slate-800/40 rounded-lg px-3 py-2">
                      <div className={`w-1.5 h-1.5 rounded-full flex-none ${cfg.dot}`} />
                      <span className="text-[11px] font-extrabold text-white w-8 flex-none">{ev.linea}</span>
                      <span className={`text-[10px] ${cfg.color} font-bold flex-1`}>{cfg.label}</span>
                      {ev.desviacionMin != null && (
                        <span className={`text-[9px] font-bold ${Math.abs(ev.desviacionMin) > 3 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {ev.desviacionMin > 0 ? '+' : ''}{ev.desviacionMin}min
                        </span>
                      )}
                      <span className="text-[9px] text-slate-600">
                        {new Date(ev.timestampGPS).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {s.ultimaActividad && (
            <p className="text-[9px] text-slate-700 text-center">
              Última actividad: {new Date(s.ultimaActividad).toLocaleString('es-UY')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Banner de estado del endpoint GPS ────────────────────────────────────

function GpsStatusBanner({ health, dataTimestamp }: { health: EndpointHealth | null; dataTimestamp?: string | null }) {
  if (!health || health.status === 'UP' || health.status === 'UNKNOWN') return null;

  const downSince = health.downSince ? new Date(health.downSince) : null;
  const lastOk = health.lastSuccessfulCollection
    ? new Date(health.lastSuccessfulCollection).toLocaleString('es-UY', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : null;

  let elapsed = '';
  if (downSince) {
    const mins = Math.round((Date.now() - downSince.getTime()) / 60000);
    elapsed = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}min`;
  }

  return (
    <div className="flex-none mx-4 mt-3 flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
      <WifiOff className="w-4 h-4 text-amber-400 flex-none mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-amber-300">
          Fuente GPS no disponible
          {elapsed && <span className="font-normal text-amber-400/70"> · caída hace {elapsed}</span>}
        </p>
        <p className="text-[10px] text-amber-500/80 mt-0.5">
          Mostrando último estado conocido
          {dataTimestamp && ` al ${new Date(dataTimestamp).toLocaleString('es-UY', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`}
          {' · '}reconectando automáticamente cada 5 min
          {health.consecutiveFailures > 1 && ` (intento #${health.consecutiveFailures})`}
        </p>
      </div>
      {lastOk && (
        <span className="text-[9px] text-amber-600 flex-none">Último OK: {lastOk}</span>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────

export default function AutoStatsModule() {
  const [agencies, setAgencies] = useState<AgencyInfo[]>([]);
  const [selectedAgency, setSelectedAgency] = useState<string>('70'); // UCOT por defecto
  const [compliance, setCompliance] = useState<ComplianceResponse | null>(null);
  const [health, setHealth] = useState<EndpointHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [searchBus, setSearchBus] = useState('');
  const [selectedBus, setSelectedBus] = useState<string | null>(null);
  const [filterEstado, setFilterEstado] = useState<string>('TODOS');
  const [filterLinea, setFilterLinea] = useState<string>('TODAS');

  // Cargar lista de empresas
  useEffect(() => {
    fetchAgencies().then(setAgencies).catch(console.error);
  }, []);

  const loadCompliance = useCallback(async () => {
    setLoading(true);
    try {
      const [data, healthData] = await Promise.all([
        fetchComplianceRealtime(selectedAgency),
        fetchEndpointHealth().catch(() => null),
      ]);
      setCompliance(data);
      setHealth(healthData);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('[AutoStats] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedAgency]);

  useEffect(() => {
    loadCompliance();
    const interval = setInterval(loadCompliance, 120_000); // cada 2 min
    return () => clearInterval(interval);
  }, [loadCompliance]);

  // Buses filtrados
  const filteredBuses = useMemo(() => {
    if (!compliance) return [];
    return compliance.buses.filter(b => {
      if (filterEstado !== 'TODOS' && b.estadoCumplimiento !== filterEstado) return false;
      if (filterLinea !== 'TODAS' && b.linea !== filterLinea) return false;
      if (searchBus && !b.idBus.includes(searchBus)) return false;
      return true;
    });
  }, [compliance, filterEstado, filterLinea, searchBus]);

  const lineasDisponibles = useMemo(() => {
    if (!compliance) return [];
    return [...new Set(compliance.buses.map(b => b.linea))].sort();
  }, [compliance]);

  const summaryList = Object.values(compliance?.summary ?? {}).sort(
    (a, b) => b.busesActivos - a.busesActivos,
  );

  const globalStats = useMemo(() => {
    if (!compliance) return null;
    const buses = compliance.buses;
    const withSchedule = buses.filter(b => b.estadoCumplimiento !== 'SIN_HORARIO' && b.estadoCumplimiento !== 'FUERA_DE_SERVICIO');
    const enTiempo = buses.filter(b => b.estadoCumplimiento === 'EN_TIEMPO').length;
    const atrasados = buses.filter(b => b.estadoCumplimiento === 'ATRASADO').length;
    return {
      total: buses.length,
      enTiempo,
      atrasados,
      pct: withSchedule.length > 0 ? Math.round((enTiempo / withSchedule.length) * 100) : 0,
    };
  }, [compliance]);

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden rounded-xl">
      {/* Header */}
      <div className="flex-none px-6 py-4 border-b border-slate-800/60 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              Estadísticas Automáticas
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
              {health?.status === 'DOWN'
                ? <><WifiOff className="w-3 h-3 text-amber-500" /><span className="text-amber-500">GPS no disponible</span></>
                : <><Wifi className="w-3 h-3 text-emerald-500" /><span>GPS en vivo</span></>
              }
              <span>· Malla GTFS oficial · Sin inspectores</span>
            </p>
          </div>
          <button
            onClick={loadCompliance}
            disabled={loading}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        {/* Selector de empresa */}
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {(['70', '10', '50', '20'] as string[]).map(agId => (
            <AgencyPill
              key={agId}
              agencyId={agId}
              active={selectedAgency === agId}
              onClick={() => { setSelectedAgency(agId); setSelectedBus(null); setFilterLinea('TODAS'); }}
            />
          ))}
        </div>

        {/* KPI Bar global */}
        {globalStats && (
          <div className="flex items-center gap-6 overflow-x-auto">
            <div className="flex items-center gap-2 flex-none">
              <Bus className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-400">
                <span className="text-white font-bold">{globalStats.total}</span> buses en calle
              </span>
            </div>
            <div className="flex items-center gap-2 flex-none">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs text-slate-400">
                <span className="text-emerald-400 font-bold">{globalStats.pct}%</span> cumplimiento
              </span>
            </div>
            {globalStats.atrasados > 0 && (
              <div className="flex items-center gap-2 flex-none">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs text-red-400 font-bold">{globalStats.atrasados} atrasados</span>
              </div>
            )}
            {lastUpdate && (
              <div className="ml-auto flex items-center gap-1 text-[10px] text-slate-600 flex-none">
                <Clock className="w-3 h-3" />
                {lastUpdate.toLocaleTimeString('es-UY')} · auto 2min
              </div>
            )}
          </div>
        )}
      </div>

      {/* Banner GPS caído */}
      <GpsStatusBanner health={health} dataTimestamp={compliance?.dataTimestamp} />

      {/* Contenido */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Panel izquierdo: resumen por línea + lista de buses */}
        <div className={`flex flex-col flex-1 min-h-0 overflow-hidden transition-all ${selectedBus ? 'max-w-[calc(100%-420px)]' : ''}`}>
          {/* Filtros */}
          <div className="flex-none flex items-center gap-2 px-4 pt-3 pb-2 flex-wrap">
            {/* Buscar coche */}
            <div className="flex items-center gap-1.5 bg-slate-800/50 border border-slate-700/40 rounded-xl px-2.5 py-1.5 flex-none">
              <Search className="w-3 h-3 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar coche #"
                value={searchBus}
                onChange={e => setSearchBus(e.target.value)}
                className="bg-transparent text-xs text-slate-300 placeholder-slate-600 outline-none w-24"
              />
            </div>
            {/* Filtro estado */}
            <select
              value={filterEstado}
              onChange={e => setFilterEstado(e.target.value)}
              className="bg-slate-800/50 border border-slate-700/40 text-xs text-slate-300 rounded-xl px-2.5 py-1.5 outline-none"
            >
              <option value="TODOS">Todos los estados</option>
              <option value="EN_TIEMPO">En tiempo</option>
              <option value="ATRASADO">Atrasados</option>
              <option value="ADELANTADO">Adelantados</option>
              <option value="SIN_HORARIO">Sin horario GTFS</option>
            </select>
            {/* Filtro línea */}
            <select
              value={filterLinea}
              onChange={e => setFilterLinea(e.target.value)}
              className="bg-slate-800/50 border border-slate-700/40 text-xs text-slate-300 rounded-xl px-2.5 py-1.5 outline-none"
            >
              <option value="TODAS">Todas las líneas</option>
              {lineasDisponibles.map(l => <option key={l} value={l}>Línea {l}</option>)}
            </select>
          </div>

          {/* Tabla de resumen por línea */}
          {summaryList.length > 0 && !searchBus && filterEstado === 'TODOS' && filterLinea === 'TODAS' && (
            <div className="flex-none px-4 pb-2">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                <BarChart3 className="w-3 h-3" /> Resumen por línea
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5">
                {summaryList.map(s => (
                  <button
                    key={s.linea}
                    onClick={() => setFilterLinea(s.linea)}
                    className="flex items-center gap-2 bg-slate-800/40 border border-slate-700/30 rounded-xl px-3 py-2 text-left hover:border-slate-500/50 transition-all"
                  >
                    <span className="text-sm font-extrabold text-white w-10 flex-none">{s.linea}</span>
                    <div className="flex-1 min-w-0">
                      <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${s.pctCumplimiento >= 70 ? 'bg-emerald-500' : s.pctCumplimiento >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${s.pctCumplimiento}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[9px] text-slate-600">{s.busesActivos} buses</span>
                        <span className={`text-[9px] font-bold ${s.pctCumplimiento >= 70 ? 'text-emerald-400' : s.pctCumplimiento >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                          {s.pctCumplimiento}%
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Lista de buses */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
            {loading && filteredBuses.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 text-xs">Consultando GPS + GTFS…</p>
              </div>
            )}
            {!loading && filteredBuses.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <WifiOff className="w-10 h-10 text-slate-700" />
                <p className="text-slate-500 text-sm">Sin buses que coincidan con los filtros.</p>
              </div>
            )}
            {filteredBuses.length > 0 && (
              <div className="space-y-1.5 mt-1">
                <p className="text-[10px] text-slate-600 mb-2">
                  {filteredBuses.length} bus{filteredBuses.length !== 1 ? 'es' : ''} mostrado{filteredBuses.length !== 1 ? 's' : ''}
                </p>
                {filteredBuses.map(bus => {
                  const cfg = ESTADO_CONFIG[bus.estadoCumplimiento] ?? ESTADO_CONFIG.SIN_HORARIO;
                  const isSelected = selectedBus === bus.idBus;
                  return (
                    <button
                      key={`${bus.idBus}-${bus.linea}`}
                      onClick={() => setSelectedBus(isSelected ? null : bus.idBus)}
                      className={`w-full text-left flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all hover:scale-[1.01] ${
                        isSelected
                          ? 'bg-indigo-500/10 border-indigo-500/50'
                          : `bg-slate-800/30 border-slate-700/30 hover:border-slate-500/50 ${bus.estadoCumplimiento === 'ATRASADO' ? 'border-l-2 border-l-red-500/60' : ''}`
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full flex-none ${cfg.dot}`} />
                      <span className="text-sm font-extrabold text-white w-12 flex-none">#{bus.idBus}</span>
                      <span className="text-[11px] font-bold text-slate-400 w-8 flex-none">L{bus.linea}</span>
                      <EstadoBadge estado={bus.estadoCumplimiento} />
                      {bus.desviacionMin != null && (
                        <span className={`text-[10px] font-bold ml-auto ${Math.abs(bus.desviacionMin) > 3 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {bus.desviacionMin > 0 ? '+' : ''}{bus.desviacionMin} min
                        </span>
                      )}
                      {bus.proximaParadaControl && (
                        <span className="text-[9px] text-slate-600 ml-1 hidden lg:block truncate max-w-[120px]" title={bus.proximaParadaControl.name}>
                          → {bus.proximaParadaControl.name}
                        </span>
                      )}
                      <span className="text-[9px] text-slate-500 flex-none">{Math.round(bus.velocidad)} km/h</span>
                      {isSelected && <ChevronRight className="w-3 h-3 text-indigo-400 flex-none" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Panel derecho: perfil del coche seleccionado */}
        {selectedBus && (
          <VehicleProfilePanel
            idBus={selectedBus}
            onClose={() => setSelectedBus(null)}
          />
        )}
      </div>
    </div>
  );
}
