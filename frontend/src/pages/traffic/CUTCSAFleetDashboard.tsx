/**
 * CUTCSAFleetDashboard — Presentación comercial para CUTCSA
 * Muestra la flota real de CUTCSA en tiempo real desde STM/IMM.
 * Propósito: demo de ventas — mostrar a CUTCSA que el sistema ya conoce su operación.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Bus, Activity, MapPin, RefreshCw, Wifi, WifiOff,
  TrendingUp, BarChart3, Navigation, ChevronRight,
  DollarSign, Plus, Minus, Calculator, CalendarDays, Settings,
} from 'lucide-react';
import {
  getAllVersiones, getValorEnFecha, PARAMETRO_META,
  type VersionParametro, type ParametroId,
} from '../../services/parametrosService';

// ─── Constantes fallback del simulador (si Firestore no tiene datos) ──────────
const VIAJES_BUS_DIA = 10;
const DIAS_MES       = 26;

function fmtPesos(n: number) {
  return `$${Math.round(n).toLocaleString('es-UY')}`;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BusCUTCSA {
  id: string;
  codigoBus: string;
  linea: string;
  sublinea: string | null;
  destino: string;
  velocidad: number;
  lat: number;
  lng: number;
}

interface LineaStat {
  linea: string;
  buses: number;
  destinos: string[];
}

interface FlotaResponse {
  ok: boolean;
  total: number;
  lineasActivas: number;
  buses: BusCUTCSA[];
  lineas: LineaStat[];
  timestamp: string;
}

const MONTEVIDEO_CENTER: [number, number] = [-34.9011, -56.165];
const CUTCSA_BLUE = '#3b82f6';

// ─── Bus icon ─────────────────────────────────────────────────────────────────

function busIcon(linea: string) {
  return L.divIcon({
    html: `<div style="background:${CUTCSA_BLUE};color:#fff;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:900;white-space:nowrap;box-shadow:0 2px 6px rgba(59,130,246,0.6);border:1px solid rgba(255,255,255,0.2)">${linea || '?'}</div>`,
    className: '',
    iconSize: [36, 20],
    iconAnchor: [18, 10],
  });
}

function MapFit({ buses }: { buses: BusCUTCSA[] }) {
  const map = useMap();
  useEffect(() => {
    if (buses.length === 0) return;
    const bounds = L.latLngBounds(buses.map((b) => [b.lat, b.lng]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
  }, [buses, map]);
  return null;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchFlotaCUTCSA(): Promise<FlotaResponse> {
  const res = await fetch('/api/positions/cutcsa', { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function CUTCSAFleetDashboard() {
  const [data, setData] = useState<FlotaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [tab, setTab] = useState<'mapa' | 'lineas' | 'simulador'>('mapa');
  const [deltaBuses, setDeltaBuses] = useState<Record<string, number>>({});
  // Parámetros desde Firestore
  const [params, setParams] = useState<Record<ParametroId, VersionParametro[]> | null>(null);
  const [fechaSim, setFechaSim] = useState<string>(hoyISO());
  const [lineaFiltro, setLineaFiltro] = useState<string>('todas');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetchFlotaCUTCSA();
      setData(res);
      setLastUpdate(new Date());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al conectar con STM');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    intervalRef.current = setInterval(cargar, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [cargar]);

  // Carga parámetros de Firestore una sola vez al montar
  useEffect(() => {
    getAllVersiones().then(setParams).catch(() => setParams(null));
  }, []);

  const buses = data?.buses ?? [];
  const lineas = data?.lineas ?? [];

  const busesFiltrados = lineaFiltro === 'todas'
    ? buses
    : buses.filter((b) => b.linea === lineaFiltro);

  const velPromedio = buses.length > 0
    ? Math.round(buses.reduce((s, b) => s + b.velocidad, 0) / buses.length)
    : 0;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-none px-5 py-3 border-b border-slate-800 bg-slate-900/90 backdrop-blur">

        <div className="flex items-center justify-between gap-4 flex-wrap">

          {/* Identidad */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)' }}>
              <Bus className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-white">CUTCSA — Flota en Tiempo Real</h1>
                {!loading && !error && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    En vivo · STM
                  </span>
                )}
                {error && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    <WifiOff className="w-2.5 h-2.5" /> Sin señal
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500">
                {lastUpdate
                  ? `Actualizado ${lastUpdate.toLocaleTimeString('es-UY')} · Fuente: IMM Montevideo`
                  : 'Conectando con STM…'}
              </p>
            </div>
          </div>

          {/* Controles */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
              {([
                { id: 'mapa',       label: 'Mapa GPS'            },
                { id: 'lineas',     label: 'Por Línea'           },
                { id: 'simulador',  label: '$ Simulador'         },
              ] as { id: 'mapa' | 'lineas' | 'simulador'; label: string }[]).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    tab === id
                      ? id === 'simulador'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'mapa' && lineas.length > 0 && (
              <select
                value={lineaFiltro}
                onChange={(e) => setLineaFiltro(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none"
              >
                <option value="todas">Todas las líneas</option>
                {lineas.map((l) => (
                  <option key={l.linea} value={l.linea}>Línea {l.linea} ({l.buses} buses)</option>
                ))}
              </select>
            )}

            <button
              onClick={cargar}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── KPI strip ──────────────────────────────────────────────────── */}
        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {[
            {
              label: 'Buses en Servicio',
              value: loading ? '…' : (data?.total ?? 0),
              sub: 'ahora mismo',
              color: 'text-blue-400',
              bg: 'bg-blue-500/10 border-blue-500/20',
              icon: Bus,
            },
            {
              label: 'Líneas Activas',
              value: loading ? '…' : (data?.lineasActivas ?? 0),
              sub: 'en operación',
              color: 'text-emerald-400',
              bg: 'bg-emerald-500/10 border-emerald-500/20',
              icon: Activity,
            },
            {
              label: 'Velocidad Prom.',
              value: loading ? '…' : `${velPromedio} km/h`,
              sub: 'flota completa',
              color: 'text-amber-400',
              bg: 'bg-amber-500/10 border-amber-500/20',
              icon: TrendingUp,
            },
            {
              label: 'Cobertura',
              value: 'Montevideo',
              sub: 'área metropolitana',
              color: 'text-purple-400',
              bg: 'bg-purple-500/10 border-purple-500/20',
              icon: MapPin,
            },
          ].map(({ label, value, sub, color, bg, icon: Icon }) => (
            <div key={label} className={`rounded-xl border px-3 py-2 flex items-center gap-2.5 ${bg}`}>
              <Icon className={`w-4 h-4 flex-none ${color}`} />
              <div>
                <p className={`text-sm font-black leading-tight ${color}`}>{value}</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wide">{label}</p>
                <p className="text-[8px] text-slate-600">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Contenido ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">

        {/* Estado de carga inicial */}
        {loading && !data && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <RefreshCw className="w-7 h-7 text-blue-400 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-300">Obteniendo flota CUTCSA desde STM…</p>
              <p className="text-xs text-slate-600 mt-1">Conectando con IMM Montevideo</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !data && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
            <WifiOff className="w-10 h-10 text-red-400" />
            <div className="text-center">
              <p className="text-sm font-bold text-red-300">Sin conexión con STM</p>
              <p className="text-xs text-slate-600 mt-1">{error}</p>
              <button
                onClick={cargar}
                className="mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition-colors"
              >
                Reintentar
              </button>
            </div>
          </div>
        )}

        {/* ── Vista mapa ─────────────────────────────────────────────────── */}
        {data && tab === 'mapa' && (
          <div className="h-full w-full relative">
            <MapContainer
              center={MONTEVIDEO_CENTER}
              zoom={12}
              className="h-full w-full"
              style={{ background: '#0f172a' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              <MapFit buses={busesFiltrados} />

              {busesFiltrados.map((b) => (
                <Marker key={b.id} position={[b.lat, b.lng]} icon={busIcon(b.linea)}>
                  <Popup>
                    <div className="text-xs min-w-[180px]">
                      <div className="font-black text-blue-600 text-sm mb-1">
                        CUTCSA — Línea {b.linea}
                      </div>
                      <div className="text-slate-700">INT {b.codigoBus || '—'}</div>
                      {b.destino && (
                        <div className="text-slate-500 text-[11px] mt-0.5">
                          <Navigation className="inline w-3 h-3 mr-1" />
                          {b.destino}
                        </div>
                      )}
                      {b.velocidad > 0 && (
                        <div className="text-slate-500 text-[11px]">{b.velocidad} km/h</div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>

            {/* Overlay info */}
            <div className="absolute top-3 right-3 z-[400] bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl p-3 min-w-[160px]">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-2">En pantalla</p>
              <p className="text-2xl font-black text-blue-400">{busesFiltrados.length}</p>
              <p className="text-[10px] text-slate-400">
                {lineaFiltro === 'todas' ? 'buses CUTCSA' : `buses Línea ${lineaFiltro}`}
              </p>
              {lineaFiltro !== 'todas' && (
                <button
                  onClick={() => setLineaFiltro('todas')}
                  className="mt-2 text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                >
                  Ver todas <ChevronRight className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Vista por línea ────────────────────────────────────────────── */}
        {data && tab === 'lineas' && (
          <div className="h-full overflow-y-auto p-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-bold text-slate-300">
                  {lineas.length} líneas activas — {data.total} buses totales
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {lineas.map((l) => {
                  const pct = Math.round((l.buses / (data.total || 1)) * 100);
                  return (
                    <div
                      key={l.linea}
                      className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 hover:border-blue-500/40 transition-colors cursor-pointer"
                      onClick={() => { setLineaFiltro(l.linea); setTab('mapa'); }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg font-black text-white">Línea {l.linea}</span>
                        <span className="text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full">
                          {l.buses} bus{l.buses !== 1 ? 'es' : ''}
                        </span>
                      </div>

                      {/* Barra de proporción */}
                      <div className="h-1.5 bg-slate-800 rounded-full mb-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(pct, 4)}%`, background: CUTCSA_BLUE }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-500">{pct}% de la flota</p>

                      {l.destinos.length > 0 && (
                        <p className="text-[10px] text-slate-400 mt-1.5 truncate">
                          <Navigation className="inline w-2.5 h-2.5 mr-1 text-slate-500" />
                          {l.destinos[0]}
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-1 text-[9px] text-blue-400 opacity-60 hover:opacity-100 transition-opacity">
                        <MapPin className="w-2.5 h-2.5" />
                        Ver en mapa
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Branding footer */}
              <div className="mt-8 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-700/50">
                  <Wifi className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] text-slate-500">
                    Datos en vivo · Fuente: IMM / STM Montevideo ·{' '}
                    <span className="text-blue-400 font-bold">SkillRoute</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Vista Simulador de Ingresos ────────────────────────────────── */}
        {data && tab === 'simulador' && (() => {
          // Parámetros vigentes en la fecha de simulación (Firestore o fallback)
          const tarifaBase = params
            ? getValorEnFecha(params.tarifa_base, fechaSim, PARAMETRO_META.tarifa_base.defaultValor)
            : PARAMETRO_META.tarifa_base.defaultValor;
          const pasajeros = params
            ? getValorEnFecha(params.pasajeros_pico, fechaSim, PARAMETRO_META.pasajeros_pico.defaultValor)
            : PARAMETRO_META.pasajeros_pico.defaultValor;

          const INGRESO_BUS_MES = tarifaBase * pasajeros * VIAJES_BUS_DIA * DIAS_MES;

          const esFechaHistorica = fechaSim < hoyISO();

          const totalExtraMes = lineas.reduce((acc, l) => {
            const d = deltaBuses[l.linea] ?? 0;
            return acc + d * INGRESO_BUS_MES;
          }, 0);

          const ingresoBaseMes = lineas.reduce((acc, l) => acc + l.buses * INGRESO_BUS_MES, 0);

          return (
            <div className="h-full overflow-y-auto p-4">
              <div className="max-w-3xl mx-auto space-y-3">

                {/* Cabecera + date-picker */}
                <div className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 mb-2">
                  <Calculator className="w-5 h-5 text-emerald-400 flex-none mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-emerald-300">Simulador de Ingresos en Tiempo Real</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Flota real CUTCSA · 10 viajes/bus/día · 26 días/mes
                    </p>
                  </div>
                  {/* Selector de fecha de simulación */}
                  <div className="flex-none flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                      <label className="text-[9px] text-slate-500 uppercase tracking-widest">Fecha de simulación</label>
                    </div>
                    <input
                      type="date"
                      value={fechaSim}
                      onChange={(e) => setFechaSim(e.target.value || hoyISO())}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:border-emerald-500 outline-none transition-colors"
                    />
                    {esFechaHistorica && (
                      <span className="text-[9px] text-amber-400 font-medium">⏪ Usando tarifa histórica</span>
                    )}
                  </div>
                </div>

                {/* Tarifa vigente en fecha seleccionada */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {[
                    { label: 'Tarifa base', valor: tarifaBase, unidad: '$UYU/pax', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                    { label: 'Pasajeros/viaje', valor: pasajeros, unidad: 'pax',        color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
                    { label: 'Ingreso/bus/mes', valor: `$${INGRESO_BUS_MES.toLocaleString('es-UY')}`, unidad: '', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                  ].map(({ label, valor, unidad, color, bg }) => (
                    <div key={label} className={`border rounded-xl p-3 flex items-center gap-2 ${bg}`}>
                      <div>
                        <p className={`text-sm font-black ${color}`}>{valor} <span className="text-[9px] font-normal text-slate-500">{unidad}</span></p>
                        <p className="text-[9px] text-slate-500 uppercase tracking-wide">{label}</p>
                        {params && <p className="text-[8px] text-slate-600">Firestore · {fechaSim}</p>}
                        {!params && <p className="text-[8px] text-amber-600">Valor por defecto</p>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Link a AdminParametros */}
                <div className="flex justify-end mb-1">
                  <a
                    href="/dashboard/admin/parametros"
                    className="flex items-center gap-1 text-[9px] text-slate-500 hover:text-indigo-400 transition-colors"
                  >
                    <Settings className="w-2.5 h-2.5" />
                    Gestionar parámetros en AdminParametros
                  </a>
                </div>

                {/* Ingreso base total */}
                <div className="grid grid-cols-2 gap-3 mb-1">
                  <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Ingreso base estimado / mes</p>
                    <p className="text-2xl font-black text-white">{fmtPesos(ingresoBaseMes)}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{data.total} buses actuales · {data.lineasActivas} líneas</p>
                  </div>
                  <div className={`border rounded-xl p-4 transition-all ${totalExtraMes > 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900 border-slate-700/50'}`}>
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Ingreso extra proyectado / mes</p>
                    <p className={`text-2xl font-black transition-colors ${totalExtraMes > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {totalExtraMes > 0 ? `+${fmtPesos(totalExtraMes)}` : '$0'}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {totalExtraMes > 0
                        ? `+${fmtPesos(totalExtraMes * 12)} / año`
                        : 'Mové los sliders para proyectar'}
                    </p>
                  </div>
                </div>

                {/* Líneas con sliders */}
                {lineas.map((l) => {
                  const delta = deltaBuses[l.linea] ?? 0;
                  const ingresoActual   = l.buses * INGRESO_BUS_MES;
                  const ingresoExtra    = delta * INGRESO_BUS_MES;
                  const ingresoTotal    = ingresoActual + ingresoExtra;

                  return (
                    <div
                      key={l.linea}
                      className={`bg-slate-900 border rounded-xl p-4 transition-all ${
                        delta > 0 ? 'border-emerald-500/30' : 'border-slate-700/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-white">Línea {l.linea}</span>
                          <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                            {l.buses} bus{l.buses !== 1 ? 'es' : ''} ahora
                          </span>
                          {delta > 0 && (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                              +{delta} en simulación
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-white">{fmtPesos(ingresoTotal)}<span className="text-[9px] text-slate-500 font-normal">/mes</span></p>
                          {delta > 0 && (
                            <p className="text-[11px] font-bold text-emerald-400">+{fmtPesos(ingresoExtra)}</p>
                          )}
                        </div>
                      </div>

                      {/* Slider */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setDeltaBuses((prev) => ({ ...prev, [l.linea]: Math.max(0, (prev[l.linea] ?? 0) - 1) }))}
                          className="w-6 h-6 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-500 transition-colors flex-none"
                        >
                          <Minus className="w-3 h-3" />
                        </button>

                        <div className="flex-1 relative">
                          <input
                            type="range"
                            min={0}
                            max={5}
                            value={delta}
                            onChange={(e) =>
                              setDeltaBuses((prev) => ({ ...prev, [l.linea]: Number(e.target.value) }))
                            }
                            className="w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer"
                            style={{
                              background: delta > 0
                                ? `linear-gradient(to right, #10b981 0%, #10b981 ${delta * 20}%, #334155 ${delta * 20}%, #334155 100%)`
                                : '#334155',
                            }}
                          />
                          <div className="flex justify-between mt-1 px-0.5">
                            {[0, 1, 2, 3, 4, 5].map((v) => (
                              <span key={v} className={`text-[8px] ${v === delta ? 'text-emerald-400 font-bold' : 'text-slate-600'}`}>
                                {v === 0 ? 'actual' : `+${v}`}
                              </span>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => setDeltaBuses((prev) => ({ ...prev, [l.linea]: Math.min(5, (prev[l.linea] ?? 0) + 1) }))}
                          className="w-6 h-6 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors flex-none"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Barra comparativa */}
                      {delta > 0 && (
                        <div className="mt-3 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-slate-500 w-14 text-right">Actual</span>
                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${(l.buses / (l.buses + delta)) * 100}%` }} />
                            </div>
                            <span className="text-[9px] text-slate-400 w-20">{fmtPesos(ingresoActual)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-emerald-400 w-14 text-right">+{delta} bus{delta > 1 ? 'es' : ''}</span>
                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: '100%' }} />
                            </div>
                            <span className="text-[9px] text-emerald-400 w-20 font-bold">{fmtPesos(ingresoTotal)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Botón reset */}
                {Object.values(deltaBuses).some((v) => v > 0) && (
                  <button
                    onClick={() => setDeltaBuses({})}
                    className="w-full py-2 rounded-xl border border-slate-700 text-[11px] text-slate-500 hover:text-white hover:border-slate-500 transition-colors"
                  >
                    Resetear simulación
                  </button>
                )}
              </div>

              {/* ── Total sticky bottom ──────────────────────────────────── */}
              {totalExtraMes > 0 && (
                <div className="sticky bottom-0 left-0 right-0 mt-6 mx-auto max-w-3xl">
                  <div className="bg-emerald-900/40 backdrop-blur border border-emerald-500/40 rounded-2xl p-5 text-center shadow-xl shadow-emerald-900/20">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      <p className="text-[11px] text-emerald-300 uppercase tracking-widest font-bold">
                        Ingreso extra mensual total con SkillRoute
                      </p>
                    </div>
                    <p className="text-4xl font-black text-emerald-400 tracking-tight">
                      +{fmtPesos(totalExtraMes)}
                    </p>
                    <p className="text-sm text-emerald-300/70 mt-1">
                      +{fmtPesos(totalExtraMes * 12)} anuales · Basado en flota CUTCSA real al {lastUpdate?.toLocaleTimeString('es-UY')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
