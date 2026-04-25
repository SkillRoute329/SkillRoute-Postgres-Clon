/**
 * Centro de Control de Flota — GPS en tiempo real (STM)
 * Muestra UCOT + competidores en mapa oscuro con KPIs y alertas de bunching.
 * Fuente de datos: /api/positions (Cloud Function → STM GPS)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Radio, AlertTriangle, Bus, TrendingUp, Activity,
  RefreshCw, Eye, EyeOff, Filter,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BusLive {
  id: string;
  codigoBus: string;
  empresa: string;
  empresaId: number;
  linea: string;
  sublinea: string | null;
  destino: string;
  lat: number;
  lng: number;
  timestamp: string;
}

interface AlertaBunching {
  linea: string;
  bus1: string;
  bus2: string;
  distanciaKm: number;
}

interface KPIs {
  totalPropios: number;
  totalRivales: number;
  lineasActivas: number;
  bunchingPares: number;
  empresas: Record<string, number>;
}

const EMPRESA_COLORES: Record<string, string> = {
  UCOT:   '#eab308',
  CUTCSA: '#3b82f6',
  COETC:  '#ef4444',
  COME:   '#22c55e',
};

const MONTEVIDEO_CENTER: [number, number] = [-34.9, -56.16];

// ─── Haversine ────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Íconos Leaflet ───────────────────────────────────────────────────────────

function makeBusIcon(color: string, label: string) {
  return L.divIcon({
    html: `<div style="background:${color};color:#000;padding:2px 5px;border-radius:5px;font-size:10px;font-weight:900;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.5)">${label}</div>`,
    className: '',
    iconSize: [40, 20],
    iconAnchor: [20, 10],
  });
}

// ─── MapRecenter ──────────────────────────────────────────────────────────────

function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom()); }, [center, map]);
  return null;
}

// ─── Fetch datos GPS ──────────────────────────────────────────────────────────

async function fetchBuses(): Promise<BusLive[]> {
  const res = await fetch('/api/positions', { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.buses ?? []) as BusLive[];
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function FleetMonitorModule() {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const [buses, setBuses] = useState<BusLive[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [alertas, setAlertas] = useState<AlertaBunching[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [mostrarRivales, setMostrarRivales] = useState(true);
  const [lineaFiltro, setLineaFiltro] = useState<string>('todas');
  const [tabActiva, setTabActiva] = useState<'mapa' | 'lista'>('mapa');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const procesar = useCallback((raw: BusLive[]) => {
    const propiosBuses = raw.filter((b) => b.empresaId === empresaPropia);
    const rivales   = raw.filter((b) => b.empresaId !== empresaPropia);

    // KPIs
    const lineasActivas = new Set(propiosBuses.map((b) => b.linea).filter(Boolean)).size;
    const empresas: Record<string, number> = {};
    for (const b of raw) {
      if (!b.empresa) continue;
      empresas[b.empresa] = (empresas[b.empresa] || 0) + 1;
    }

    // Bunching UCOT (pares < 800m)
    const bunchingAlertas: AlertaBunching[] = [];
    for (let i = 0; i < propiosBuses.length; i++) {
      for (let j = i + 1; j < propiosBuses.length; j++) {
        if (propiosBuses[i].linea !== propiosBuses[j].linea) continue;
        const dist = haversineKm(propiosBuses[i].lat, propiosBuses[i].lng, propiosBuses[j].lat, propiosBuses[j].lng);
        if (dist < 0.8) {
          bunchingAlertas.push({
            linea: propiosBuses[i].linea,
            bus1: propiosBuses[i].codigoBus,
            bus2: propiosBuses[j].codigoBus,
            distanciaKm: Math.round(dist * 1000) / 1000,
          });
        }
      }
    }

    setKpis({
      totalPropios: propiosBuses.length,
      totalRivales: rivales.length,
      lineasActivas,
      bunchingPares: bunchingAlertas.length,
      empresas,
    });
    setAlertas(bunchingAlertas);
    setBuses(raw);
    setLastUpdate(new Date());
  }, []);

  const cargar = useCallback(async () => {
    try {
      const raw = await fetchBuses();
      procesar(raw);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al obtener GPS');
    } finally {
      setLoading(false);
    }
  }, [procesar]);

  useEffect(() => {
    cargar();
    intervalRef.current = setInterval(cargar, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [cargar]);

  // Buses a mostrar en mapa/lista
  const propiosBuses = buses.filter((b) => b.empresaId === empresaPropia);
  const rivales   = buses.filter((b) => b.empresaId !== empresaPropia);

  const lineasPropias = [...new Set(propiosBuses.map((b) => b.linea).filter(Boolean))].sort();

  const propiosFiltrados = lineaFiltro === 'todas'
    ? propiosBuses
    : propiosBuses.filter((b) => b.linea === lineaFiltro);

  const todosEnMapa = mostrarRivales
    ? [...propiosFiltrados, ...rivales]
    : propiosFiltrados;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden">

      {/* Header */}
      <div className="flex-none px-5 py-3 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/20 flex items-center justify-center">
              <Radio className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-base font-black text-white">Radar de Flota en Vivo — {empresaCfg.label}</h1>
            <div className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-slate-400" /><select value={empresaPropia} onChange={(e) => setEmpresaPropia(Number(e.target.value))} className="bg-slate-800 border border-slate-700 rounded-lg px-1.5 py-1 text-[11px] text-white"><option value={70}>UCOT</option><option value={50}>CUTCSA</option><option value={20}>COME</option><option value={10}>COETC</option></select></div>
              <p className="text-[10px] text-slate-500">
                {lastUpdate
                  ? `Actualizado ${lastUpdate.toLocaleTimeString('es-UY')}`
                  : 'Cargando señal STM…'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filtro línea */}
            <div className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-700/50 rounded-lg px-2 py-1">
              <Filter className="w-3 h-3 text-slate-400" />
              <select
                value={lineaFiltro}
                onChange={(e) => setLineaFiltro(e.target.value)}
                className="bg-transparent text-[11px] text-white outline-none"
              >
                <option value="todas">Todas las líneas</option>
                {lineasPropias.map((l) => (
                  <option key={l} value={l}>Línea {l}</option>
                ))}
              </select>
            </div>

            {/* Toggle rivales */}
            <button
              onClick={() => setMostrarRivales((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                mostrarRivales
                  ? 'bg-red-900/20 border-red-500/40 text-red-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {mostrarRivales ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              Rivales
            </button>

            {/* Toggle mapa/lista */}
            <div className="flex bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
              {(['mapa', 'lista'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTabActiva(t)}
                  className={`px-3 py-1.5 text-[11px] font-bold capitalize transition-colors ${
                    tabActiva === t ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <button
              onClick={cargar}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* KPI strip */}
        {kpis && (
          <div className="mt-2.5 grid grid-cols-5 gap-2">
            {[
              { label: empresaCfg.label + ' activos', value: kpis.totalPropios, color: 'text-amber-400', icon: Bus },
              { label: 'Rivales en vía', value: kpis.totalRivales, color: 'text-blue-400', icon: Activity },
              { label: 'Líneas operando', value: kpis.lineasActivas, color: 'text-emerald-400', icon: TrendingUp },
              { label: 'Bunching ' + empresaCfg.label + ' ', value: kpis.bunchingPares, color: kpis.bunchingPares > 0 ? 'text-red-400' : 'text-slate-500', icon: AlertTriangle },
              { label: 'Total en ruta', value: kpis.totalUCOT + kpis.totalRivales, color: 'text-white', icon: Radio },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="bg-slate-800/40 rounded-lg px-3 py-1.5 flex items-center gap-2">
                <Icon className={`w-3.5 h-3.5 flex-none ${color}`} />
                <div>
                  <p className={`text-sm font-black leading-tight ${color}`}>{value}</p>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wide leading-none">{label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Alertas bunching */}
        {alertas.length > 0 && (
          <div className="mt-2 flex gap-2 flex-wrap">
            {alertas.slice(0, 4).map((a, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-red-900/20 border border-red-500/30 rounded-lg px-2 py-1 text-[10px] text-red-300">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="font-bold">L{a.linea}</span>
                <span title={`Bunching: dos UCOT misma línea a ${a.distanciaKm} km — degrada headway`}>
                  INT {a.bus1} y {a.bus2} — {a.distanciaKm} km
                </span>
              </div>
            ))}
            {alertas.length > 4 && (
              <span className="text-[10px] text-slate-500 self-center">+{alertas.length - 4} bunching más</span>
            )}
          </div>
        )}

        {error && (
          <div className="mt-2 text-[11px] text-red-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" />
            {error}
          </div>
        )}
      </div>

      {/* Contenido principal */}
      <div className="flex-1 overflow-hidden">
        {tabActiva === 'mapa' ? (
          <div className="h-full w-full">
            {loading && buses.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-500 flex-col gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
                <p className="text-sm">Obteniendo posiciones GPS…</p>
              </div>
            ) : (
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
                <MapRecenter center={MONTEVIDEO_CENTER} />

                {ucotFiltrados.map((b) => (
                  <Marker
                    key={b.id}
                    position={[b.lat, b.lng]}
                    icon={makeBusIcon('#eab308', `${b.linea || '?'}`)}
                  >
                    <Popup>
                      <div className="text-xs min-w-[160px]">
                        <div className="font-bold text-amber-600">{empresaCfg.label} — L{b.linea}</div>
                        <div>INT {b.codigoBus}</div>
                        <div className="text-slate-500 text-[10px]">{b.destino}</div>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {mostrarRivales && rivales.map((b) => {
                  const color = EMPRESA_COLORES[b.empresa] ?? '#94a3b8';
                  return (
                    <Marker
                      key={b.id}
                      position={[b.lat, b.lng]}
                      icon={makeBusIcon(color, `${b.linea || '?'}`)}
                    >
                      <Popup>
                        <div className="text-xs min-w-[160px]">
                          <div className="font-bold" style={{ color }}>{b.empresa} — L{b.linea}</div>
                          <div>INT {b.codigoBus}</div>
                          <div className="text-slate-500 text-[10px]">{b.destino}</div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            )}
          </div>
        ) : (
          /* Vista lista */
          <div className="h-full overflow-y-auto p-4 custom-scrollbar">
            <div className="grid grid-cols-1 gap-1.5">
              {/* Encabezado */}
              <div className="grid grid-cols-[2fr_1fr_1fr_2fr] gap-2 px-3 text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">
                <span>Empresa / Línea</span>
                <span>Interno</span>
                <span>Empresa</span>
                <span>Destino</span>
              </div>

              {todosEnMapa.length === 0 && (
                <div className="text-center text-slate-600 text-sm py-16">
                  <Bus className="w-10 h-10 mx-auto mb-3 text-slate-700" />
                  Sin buses detectados ahora mismo
                </div>
              )}

              {todosEnMapa.map((b) => {
                const esUCOT = b.empresaId === empresaPropia;
                const color = EMPRESA_COLORES[b.empresa] ?? '#94a3b8';
                return (
                  <div
                    key={b.id}
                    className={`grid grid-cols-[2fr_1fr_1fr_2fr] gap-2 items-center px-3 py-2 rounded-lg border transition-all ${
                      esUCOT
                        ? 'bg-amber-900/10 border-amber-500/20'
                        : 'bg-slate-800/30 border-slate-700/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-none"
                        style={{ background: color }}
                      />
                      <span className="text-xs font-bold text-white">L{b.linea || '—'}</span>
                      {b.sublinea && <span className="text-[9px] text-slate-500">{b.sublinea}</span>}
                    </div>
                    <span className="text-[11px] text-slate-300 font-mono">{b.codigoBus}</span>
                    <span className="text-[10px]" style={{ color }}>{b.empresa}</span>
                    <span className="text-[10px] text-slate-400 truncate">{b.destino}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
