/**
 * Centro de Control de Flota — GPS en tiempo real (STM)
 * Muestra empresa propia + competidores en mapa oscuro con KPIs y alertas de bunching.
 * Fuente de datos: /api/positions (Cloud Function → STM GPS)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { useLiveData } from '../../context/LiveDataContext';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Radio, AlertTriangle, Bus, TrendingUp, Activity,
  RefreshCw, Eye, EyeOff, Filter, Building2, MapPin,
} from 'lucide-react';
import {
  type BusLive,
  type AlertaBunching,
  type KPIs,
  normalizarBuses,
  detectarBunching,
  calcularKPIs,
} from './fleetMonitorUtils';
import FleetEtaPanel from './FleetEtaPanel';

const EMPRESA_COLORES: Record<string, string> = {
  UCOT:   '#eab308',
  CUTCSA: '#3b82f6',
  COETC:  '#ef4444',
  COME:   '#22c55e',
};

const MONTEVIDEO_CENTER: [number, number] = [-34.9, -56.16];

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

// ─── ZoomWatcher ──────────────────────────────────────────────────────────────

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    onZoom(map.getZoom());
    const h = () => onZoom(map.getZoom());
    map.on('zoomend', h);
    return () => { map.off('zoomend', h); };
  }, [map, onZoom]);
  return null;
}

// ─── Capa de paradas (imperativa — evita 4938 React re-renders) ──────────────

function ParadasLayer({
  paradas,
  zoom,
  paradaSelId,
  onSelect,
}: {
  paradas: { id: number; lat: number; lng: number; calle1: string; calle2: string }[];
  zoom:        number;
  paradaSelId: number | null;
  onSelect:    (p: { id: number; calle1: string; calle2: string }) => void;
}) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);
  const cbRef = useRef(onSelect);
  cbRef.current = onSelect;

  useEffect(() => {
    if (!layerRef.current) layerRef.current = L.layerGroup().addTo(map);
    const layer = layerRef.current;
    layer.clearLayers();
    if (zoom < 13 || paradas.length === 0) return;
    paradas.forEach((p) => {
      const isSel = paradaSelId === p.id;
      const m = L.circleMarker([p.lat, p.lng], {
        radius:      isSel ? 5 : 3,
        fillColor:   isSel ? '#3b82f6' : '#475569',
        color:       isSel ? '#93c5fd' : '#64748b',
        weight:      1,
        fillOpacity: 1,
        opacity:     1,
      });
      m.on('click', () => cbRef.current({ id: p.id, calle1: p.calle1, calle2: p.calle2 }));
      layer.addLayer(m);
    });
  }, [map, paradas, zoom, paradaSelId]);

  useEffect(() => () => { layerRef.current?.remove(); layerRef.current = null; }, [map]);

  return null;
}

// ─── URL de la API de paradas ─────────────────────────────────────────────────

const IMM_PARADAS_URL =
  'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/immParadasList';

// ─── Fetch datos GPS ──────────────────────────────────────────────────────────

const IMM_LIVE_URL =
  'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/immBusesLive?empresa=all';

async function fetchBuses(): Promise<BusLive[]> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    // Fuente primaria: API oficial IMM (GPS enriquecido con velocidad, acceso, AC, emisiones)
    const res = await fetch(IMM_LIVE_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`IMM HTTP ${res.status}`);
    const data = await res.json();
    if (data.ok && Array.isArray(data.buses) && data.buses.length > 0) {
      return normalizarBuses(data.buses as Record<string, unknown>[], 'IMM_OFICIAL');
    }
    throw new Error('Sin datos IMM');
  } catch {
    // Fallback: STM básico (sin campos enriquecidos)
    const res2 = await fetch('/api/positions');
    if (!res2.ok) throw new Error(`STM HTTP ${res2.status}`);
    const data2 = await res2.json();
    return normalizarBuses((data2.buses ?? []) as Record<string, unknown>[], 'STM');
  } finally {
    clearTimeout(timer);
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function FleetMonitorModule() {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const { selectedLine } = useLiveData();
  const [buses, setBuses] = useState<BusLive[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [alertas, setAlertas] = useState<AlertaBunching[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [fuenteActiva, setFuenteActiva] = useState<'IMM_OFICIAL' | 'STM' | null>(null);
  const [mostrarParadas, setMostrarParadas] = useState(false);
  const [paradas, setParadas] = useState<{ id: number; lat: number; lng: number; calle1: string; calle2: string }[]>([]);
  const [paradaSel, setParadaSel] = useState<{ id: number; calle1: string; calle2: string } | null>(null);
  const [mapZoom, setMapZoom] = useState(12);
  const paradasCargadas = useRef(false);
  const [mostrarRivales, setMostrarRivales] = useState(true);
  const [lineaFiltro, setLineaFiltro] = useState<string>(selectedLine ?? 'todas');
  const [tabActiva, setTabActiva] = useState<'mapa' | 'lista'>('mapa');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sincronizar filtro de línea con el contexto global
  useEffect(() => {
    if (selectedLine) setLineaFiltro(selectedLine);
  }, [selectedLine]);

  const procesar = useCallback((raw: BusLive[]) => {
    const propios      = raw.filter((b) => b.empresaId === empresaPropia);
    const kpisCalc     = calcularKPIs(raw, empresaPropia);
    const alertasCalc  = detectarBunching(propios);
    setKpis(kpisCalc);
    setAlertas(alertasCalc);
    setBuses(raw);
    setLastUpdate(new Date());
    setFuenteActiva(raw[0]?.fuente ?? null);
  }, [empresaPropia]);

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
    intervalRef.current = setInterval(cargar, 15_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [cargar]);

  // Carga de paradas (lazy — solo cuando el usuario activa el toggle)
  useEffect(() => {
    if (!mostrarParadas || paradasCargadas.current) return;
    paradasCargadas.current = true;
    fetch(IMM_PARADAS_URL)
      .then(r => r.json())
      .then(d => { if (d.ok) setParadas(d.paradas); })
      .catch(() => { paradasCargadas.current = false; }); // reintentar en próximo toggle
  }, [mostrarParadas]);

  // Líneas únicas del sistema (para ETA)
  const lineasSistema = [...new Set(buses.map(b => b.linea).filter(Boolean))];

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
                  : 'Cargando posiciones GPS…'}
                {fuenteActiva === 'IMM_OFICIAL' && (
                  <span className="ml-1.5 text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1 py-px font-bold">IMM OFICIAL</span>
                )}
                {fuenteActiva === 'STM' && (
                  <span className="ml-1.5 text-[9px] bg-slate-700/50 text-slate-400 rounded px-1 py-px">STM básico</span>
                )}
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

            {/* Toggle paradas */}
            <button
              onClick={() => { setMostrarParadas(v => !v); setParadaSel(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                mostrarParadas
                  ? 'bg-blue-900/20 border-blue-500/40 text-blue-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <MapPin className="w-3 h-3" />
              Paradas
            </button>

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
              { label: 'Total en ruta', value: kpis.totalPropios + kpis.totalRivales, color: 'text-white', icon: Radio },
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
          <div className="h-full w-full relative">
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
                <ZoomWatcher onZoom={setMapZoom} />

                {propiosFiltrados.map((b) => (
                  <Marker
                    key={b.id}
                    position={[b.lat, b.lng]}
                    icon={makeBusIcon('#eab308', `${b.linea || '?'}`)}
                  >
                    <Popup>
                      <div className="text-xs min-w-[180px] space-y-0.5">
                        <div className="font-bold text-amber-600">{empresaCfg.label} — L{b.linea}</div>
                        <div>INT {b.codigoBus}</div>
                        {b.velocidadKmh !== undefined && (
                          <div className="text-slate-600">{b.velocidadKmh} km/h</div>
                        )}
                        <div className="flex gap-1 flex-wrap pt-0.5">
                          {b.acceso === 'PISO BAJO' && (
                            <span className="text-[9px] bg-blue-100 text-blue-700 rounded px-1 font-bold">♿ PISO BAJO</span>
                          )}
                          {b.climatizacion && b.climatizacion !== 'SIN DATOS' && (
                            <span className="text-[9px] bg-cyan-100 text-cyan-700 rounded px-1 font-bold">❄ AC</span>
                          )}
                          {b.emisiones && b.emisiones !== 'SIN DATOS' && (
                            <span className="text-[9px] bg-green-100 text-green-700 rounded px-1 font-bold">⚡ ELÉCTRICO</span>
                          )}
                        </div>
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
                        <div className="text-xs min-w-[180px] space-y-0.5">
                          <div className="font-bold" style={{ color }}>{b.empresa} — L{b.linea}</div>
                          <div>INT {b.codigoBus}</div>
                          {b.velocidadKmh !== undefined && (
                            <div className="text-slate-600">{b.velocidadKmh} km/h</div>
                          )}
                          <div className="flex gap-1 flex-wrap pt-0.5">
                            {b.acceso === 'PISO BAJO' && (
                              <span className="text-[9px] bg-blue-100 text-blue-700 rounded px-1 font-bold">♿ PISO BAJO</span>
                            )}
                            {b.climatizacion && b.climatizacion !== 'SIN DATOS' && (
                              <span className="text-[9px] bg-cyan-100 text-cyan-700 rounded px-1 font-bold">❄ AC</span>
                            )}
                            {b.emisiones && b.emisiones !== 'SIN DATOS' && (
                              <span className="text-[9px] bg-green-100 text-green-700 rounded px-1 font-bold">⚡ ELÉCTRICO</span>
                            )}
                          </div>
                          <div className="text-slate-500 text-[10px]">{b.destino}</div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}

                {/* Capa de paradas imperativa (evita 4938 React renders) */}
                {mostrarParadas && (
                  <ParadasLayer
                    paradas={paradas}
                    zoom={mapZoom}
                    paradaSelId={paradaSel?.id ?? null}
                    onSelect={setParadaSel}
                  />
                )}
              </MapContainer>
            )}

            {/* Panel ETA — overlay sobre el mapa */}
            <FleetEtaPanel
              parada={paradaSel}
              lineas={lineasSistema}
              onClose={() => setParadaSel(null)}
            />

            {/* Aviso zoom cuando paradas están activas pero no hay suficiente zoom */}
            {mostrarParadas && mapZoom < 13 && paradas.length > 0 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-700 rounded-lg px-4 py-2 text-[11px] text-slate-400 z-[1000] whitespace-nowrap">
                <MapPin className="w-3 h-3 inline mr-1.5 text-blue-400" />
                Acercá el mapa para ver las {paradas.length.toLocaleString()} paradas
              </div>
            )}
          </div>
        ) : (
          /* Vista lista */
          <div className="h-full overflow-y-auto p-4 custom-scrollbar">
            <div className="grid grid-cols-1 gap-1.5">
              {/* Encabezado */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_2fr] gap-2 px-3 text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">
                <span>Empresa / Línea</span>
                <span>Interno</span>
                <span>Empresa</span>
                <span>Extras</span>
                <span>Destino</span>
              </div>

              {todosEnMapa.length === 0 && (
                <div className="text-center text-slate-600 text-sm py-16">
                  <Bus className="w-10 h-10 mx-auto mb-3 text-slate-700" />
                  Sin buses detectados ahora mismo
                </div>
              )}

              {todosEnMapa.map((b) => {
                const esPropio = b.empresaId === empresaPropia;
                const color = EMPRESA_COLORES[b.empresa] ?? '#94a3b8';
                return (
                  <div
                    key={b.id}
                    className={`grid grid-cols-[2fr_1fr_1fr_1fr_2fr] gap-2 items-center px-3 py-2 rounded-lg border transition-all ${
                      esPropio
                        ? 'bg-amber-900/10 border-amber-500/20'
                        : 'bg-slate-800/30 border-slate-700/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-none" style={{ background: color }} />
                      <span className="text-xs font-bold text-white">L{b.linea || '—'}</span>
                      {b.sublinea && <span className="text-[9px] text-slate-500">{b.sublinea}</span>}
                    </div>
                    <span className="text-[11px] text-slate-300 font-mono">{b.codigoBus}</span>
                    <span className="text-[10px]" style={{ color }}>{b.empresa}</span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {b.velocidadKmh !== undefined && (
                        <span className="text-[9px] text-slate-400 font-mono">{b.velocidadKmh}km/h</span>
                      )}
                      {b.acceso === 'PISO BAJO' && (
                        <span title="Piso bajo" className="text-[9px] text-blue-400">♿</span>
                      )}
                      {b.climatizacion && b.climatizacion !== 'SIN DATOS' && (
                        <span title="Aire acondicionado" className="text-[9px] text-cyan-400">❄</span>
                      )}
                      {b.emisiones && b.emisiones !== 'SIN DATOS' && (
                        <span title="Cero emisiones" className="text-[9px] text-emerald-400">⚡</span>
                      )}
                    </div>
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
