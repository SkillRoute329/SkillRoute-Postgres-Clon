/**
 * MiLinea — Radar de Competencia y Posicionamiento en Vivo
 *
 * ARQUITECTURA SOBERANA:
 *  - Selector de línea libre: el usuario elige cualquier línea STM.
 *  - Fuente de datos: GET /api/positions → bus_last_pos (poller IMM, refresh 10s).
 *  - Sin dependencia de turno activo: el mapa es siempre accesible.
 *  - Si el usuario tiene turno hoy → se pre-selecciona su línea automáticamente.
 *  - Buses UCOT (empresaId=70): marcador AZUL.
 *  - Competidores: marcador NARANJA con nombre de empresa.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Bus, RefreshCw, Activity, Users, Zap, AlertTriangle,
  TrendingUp, Search, Navigation, Clock,
} from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { apiClient } from '../../clients/apiClient';
import { useAuth } from '../../context/AuthContext';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface BusPosition {
  idBus: string;
  linea: string;
  empresa: string;
  empresaId: number;
  lat: number;
  lng: number;
  velocidad: number | null;
  estado: string | null;
  destino?: string;
  sublinea?: string;
  timestamp: string;
}

interface MiTurno {
  linea_id: string;
  vehiculo_id?: string | null;
  vehiculo_interno?: string | null;
  hora_salida?: string | null;
  estado?: string | null;
}

const EMPRESA_NAMES: Record<number, string> = {
  70: 'UCOT',
  50: 'CUTCSA',
  20: 'COME',
  10: 'COETC',
};

// ── Centrador dinámico de mapa ─────────────────────────────────────────────────
function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13, { animate: true });
  }, [center, map]);
  return null;
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function MiLinea() {
  const { user } = useAuth();

  // ── Estado del selector ──────────────────────────────────────────────────────
  const [lineaInput, setLineaInput] = useState('');
  const [lineaActiva, setLineaActiva] = useState<string | null>(null);

  // ── Estado del mapa y posiciones ──────────────────────────────────────────────
  const [allBuses, setAllBuses] = useState<BusPosition[]>([]);
  const [filteredBuses, setFilteredBuses] = useState<BusPosition[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-34.9011, -56.1645]);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorFetch, setErrorFetch] = useState<string | null>(null);

  // ── Estado del turno (opcional, para pre-selección) ───────────────────────────
  const [turno, setTurno] = useState<MiTurno | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Carga de posiciones desde /api/positions (bus_last_pos IMM) ───────────────
  const fetchPositions = useCallback(async () => {
    try {
      const res = await apiClient.get<{ ok: boolean; buses: BusPosition[]; total: number }>('/api/positions');
      // apiClient puede retornar la data directamente o en .data
      const buses: BusPosition[] = (res as any)?.buses
        ?? (res as any)?.data?.buses
        ?? [];
      setAllBuses(buses);
      setLastFetch(new Date());
      setErrorFetch(null);
    } catch (e: any) {
      setErrorFetch('Error conectando con el servidor IMM. Verificá la red.');
      console.error('[MiLinea] fetchPositions error:', e);
    }
  }, []);

  // ── Inicio: carga inicial + polling 10s ───────────────────────────────────────
  useEffect(() => {
    setCargando(true);
    fetchPositions().finally(() => setCargando(false));

    intervalRef.current = setInterval(() => {
      fetchPositions();
    }, 10_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchPositions]);

  // ── Carga turno activo (silenciosa, solo para pre-selección) ──────────────────
  useEffect(() => {
    apiClient.get<{ turno?: MiTurno | null }>('/api/mi-turno')
      .then((res) => {
        const t = (res as any)?.turno ?? (res as any)?.data?.turno ?? null;
        if (t?.linea_id) {
          setTurno(t);
          // Auto-seleccionar la línea del turno si no hay una seleccionada aún
          setLineaInput(t.linea_id);
          setLineaActiva(t.linea_id);
        }
      })
      .catch(() => {
        // Sin turno — flujo normal sin pre-selección
      });
  }, []);

  // ── Filtrado reactivo cuando cambia lineaActiva o allBuses ────────────────────
  useEffect(() => {
    if (!lineaActiva) {
      setFilteredBuses([]);
      return;
    }
    const norm = lineaActiva.replace(/^0+/, '').toUpperCase();
    const filtered = allBuses.filter((b) => {
      const bl = String(b.linea ?? '').replace(/^0+/, '').toUpperCase();
      return bl === norm;
    });
    setFilteredBuses(filtered);

    // Centrar mapa en primer bus propio, luego cualquiera
    const propio = filtered.find((b) => b.empresaId === 70);
    const primero = propio ?? filtered[0];
    if (primero?.lat && primero?.lng) {
      setMapCenter([primero.lat, primero.lng]);
    }
  }, [lineaActiva, allBuses]);

  // ── Acción: activar la línea seleccionada ─────────────────────────────────────
  const activarLinea = () => {
    const l = lineaInput.trim();
    if (!l) return;
    setLineaActiva(l);
  };

  // ── Métricas calculadas ───────────────────────────────────────────────────────
  const busesUcot = filteredBuses.filter((b) => b.empresaId === 70);
  const busesRivales = filteredBuses.filter((b) => b.empresaId !== 70);
  const velocidadMedia = (() => {
    const vels = filteredBuses.map((b) => b.velocidad ?? 0).filter((v) => v > 0);
    return vels.length ? (vels.reduce((a, v) => a + v, 0) / vels.length).toFixed(1) : null;
  })();

  const totalServicio = allBuses.length;

  // ── Distribución por empresa en la línea ──────────────────────────────────────
  const porEmpresa: Record<string, number> = {};
  filteredBuses.forEach((b) => {
    const nombre = EMPRESA_NAMES[b.empresaId] ?? `Empresa ${b.empresaId}`;
    porEmpresa[nombre] = (porEmpresa[nombre] ?? 0) + 1;
  });

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in-up pb-24">

      {/* ── Cabecera ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Navigation className="w-7 h-7 text-blue-400" />
            Radar de Competencia
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Posicionamiento en vivo IMM · Fuente: STM-Online · Refresh automático cada 10s
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          {lastFetch && (
            <>
              <Clock className="w-3 h-3" />
              Último update: {lastFetch.toLocaleTimeString('es-UY')}
            </>
          )}
          <span className="text-emerald-500 font-bold ml-2">
            ● {totalServicio} buses en Montevideo
          </span>
        </div>
      </div>

      {/* ── Turno activo (si existe) ───────────────────────────────────────── */}
      {turno && (
        <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <Bus className="w-5 h-5 text-blue-400 shrink-0" />
          <div className="text-sm">
            <span className="text-blue-300 font-bold">Turno activo detectado — </span>
            <span className="text-white">
              Línea {turno.linea_id}
              {turno.vehiculo_interno && <> · Coche {turno.vehiculo_interno}</>}
              {turno.hora_salida && <> · Salida {turno.hora_salida}</>}
            </span>
          </div>
        </div>
      )}

      {/* ── Selector de línea ─────────────────────────────────────────────── */}
      <div className="bg-slate-900/60 border border-slate-700 rounded-2xl p-5">
        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">
          Seleccionar Línea a Monitorear
        </label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Ej: 300, 371, 180, D1..."
              className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-11 pr-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
              value={lineaInput}
              onChange={(e) => setLineaInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') activarLinea(); }}
            />
          </div>
          <button
            onClick={activarLinea}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-blue-900/30"
          >
            <Activity className="w-5 h-5" />
            Monitorear
          </button>
          <button
            onClick={() => fetchPositions()}
            disabled={cargando}
            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl border border-slate-700 transition-colors"
            title="Refrescar ahora"
          >
            <RefreshCw className={`w-5 h-5 ${cargando ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Líneas rápidas UCOT conocidas */}
        <div className="flex flex-wrap gap-2 mt-3">
          {['300', '371', '317', '383', '180', '183', '190', 'D1', 'D12', 'C1'].map((l) => (
            <button
              key={l}
              onClick={() => { setLineaInput(l); setLineaActiva(l); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                lineaActiva === l
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
              }`}
            >
              L{l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error de conexión ─────────────────────────────────────────────── */}
      {errorFetch && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-red-300 text-sm">{errorFetch}</p>
        </div>
      )}

      {/* ── KPIs (solo cuando hay línea seleccionada) ─────────────────────── */}
      {lineaActiva && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total en Línea</div>
              <div className="text-3xl font-black text-white">{filteredBuses.length}</div>
              <div className="text-[10px] text-slate-500 mt-1">buses activos</div>
            </div>
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-4 text-center">
              <div className="text-[10px] text-blue-400 uppercase font-bold mb-1">🔵 UCOT</div>
              <div className="text-3xl font-black text-blue-300">{busesUcot.length}</div>
              <div className="text-[10px] text-blue-500/70 mt-1">buses propios</div>
            </div>
            <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-4 text-center">
              <div className="text-[10px] text-orange-400 uppercase font-bold mb-1">🟠 Rivales</div>
              <div className="text-3xl font-black text-orange-300">{busesRivales.length}</div>
              <div className="text-[10px] text-orange-500/70 mt-1">buses competencia</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1 flex items-center justify-center gap-1">
                <Zap className="w-3 h-3" /> Vel. Media
              </div>
              <div className="text-3xl font-black text-purple-300">{velocidadMedia ?? '—'}</div>
              <div className="text-[10px] text-slate-500 mt-1">km/h</div>
            </div>
          </div>

          {/* Distribución por empresa */}
          {Object.keys(porEmpresa).length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="text-[11px] text-slate-500 uppercase font-bold mb-3 flex items-center gap-2">
                <Users className="w-3.5 h-3.5" />
                Distribución por Operadora en Línea {lineaActiva}
              </div>
              <div className="flex flex-wrap gap-3">
                {Object.entries(porEmpresa).map(([empresa, cantidad]) => (
                  <div
                    key={empresa}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-sm ${
                      empresa === 'UCOT'
                        ? 'bg-blue-900/30 border-blue-500/40 text-blue-300'
                        : 'bg-orange-900/20 border-orange-500/30 text-orange-300'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${empresa === 'UCOT' ? 'bg-blue-400' : 'bg-orange-400'}`} />
                    {empresa}
                    <span className="text-white ml-1">{cantidad}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── MAPA EN VIVO ─────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
        {/* Header del mapa */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-white">
              {lineaActiva
                ? `Posicionamiento en Vivo — Línea ${lineaActiva}`
                : 'Seleccioná una línea para ver el mapa'}
            </span>
            <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
              IMM STM-Online · Poller 10s
            </span>
          </div>
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-500 border-2 border-blue-300 inline-block" />
              <span className="text-slate-400">UCOT ({busesUcot.length})</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-orange-400 border-2 border-orange-200 inline-block" />
              <span className="text-slate-400">Rivales ({busesRivales.length})</span>
            </span>
            {!lineaActiva && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                <span className="text-emerald-400">{totalServicio} buses en Montevideo</span>
              </span>
            )}
          </div>
        </div>

        {/* Contenedor del mapa */}
        <div style={{ height: '460px' }}>
          <MapContainer
            center={mapCenter}
            zoom={lineaActiva ? 13 : 12}
            style={{ height: '100%', width: '100%', background: '#0f172a' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapRecenter center={mapCenter} />

            {/* Si hay línea seleccionada: mostrar solo buses de esa línea */}
            {lineaActiva && filteredBuses.map((bus) => {
              const esUcot = bus.empresaId === 70;
              return (
                <CircleMarker
                  key={bus.idBus}
                  center={[bus.lat, bus.lng]}
                  radius={esUcot ? 10 : 8}
                  pathOptions={{
                    fillColor: esUcot ? '#3b82f6' : '#fb923c',
                    color: esUcot ? '#93c5fd' : '#fdba74',
                    weight: 2,
                    fillOpacity: 0.9,
                  }}
                >
                  <Popup>
                    <div style={{ minWidth: 180, fontFamily: 'sans-serif' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: 6, fontSize: 14 }}>
                        {esUcot ? '🔵 UCOT' : `🟠 ${EMPRESA_NAMES[bus.empresaId] ?? bus.empresa}`}
                      </div>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr><td style={{ color: '#888', paddingRight: 8 }}>Línea</td><td><b>{bus.linea}</b></td></tr>
                          {bus.destino && <tr><td style={{ color: '#888' }}>Destino</td><td>{bus.destino}</td></tr>}
                          {bus.sublinea && <tr><td style={{ color: '#888' }}>Sublinea</td><td>{bus.sublinea}</td></tr>}
                          {bus.velocidad != null && <tr><td style={{ color: '#888' }}>Velocidad</td><td>{bus.velocidad} km/h</td></tr>}
                          {bus.estado && <tr><td style={{ color: '#888' }}>Estado</td><td>{bus.estado}</td></tr>}
                          <tr><td style={{ color: '#888' }}>Bus ID</td><td style={{ fontSize: 10 }}>{bus.idBus}</td></tr>
                          <tr><td style={{ color: '#888' }}>GPS</td><td style={{ fontSize: 10 }}>{new Date(bus.timestamp).toLocaleTimeString('es-UY')}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {/* Si NO hay línea seleccionada: mostrar todos los buses de UCOT en Montevideo */}
            {!lineaActiva && allBuses.filter(b => b.empresaId === 70).map((bus) => (
              <CircleMarker
                key={bus.idBus}
                center={[bus.lat, bus.lng]}
                radius={6}
                pathOptions={{
                  fillColor: '#3b82f6',
                  color: '#93c5fd',
                  weight: 1,
                  fillOpacity: 0.7,
                }}
              >
                <Popup>
                  <div style={{ fontSize: 12 }}>
                    <b>🔵 UCOT — Línea {bus.linea}</b><br />
                    {bus.destino && <span>Destino: {bus.destino}<br /></span>}
                    {bus.velocidad != null && <span>Vel: {bus.velocidad} km/h</span>}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* Footer informativo */}
        <div className="px-4 py-2 bg-slate-950/50 border-t border-slate-800 flex justify-between items-center">
          <span className="text-[10px] text-slate-500">
            {lineaActiva
              ? `${filteredBuses.length} buses en Línea ${lineaActiva} · ${busesUcot.length} UCOT · ${busesRivales.length} competencia`
              : `Vista general UCOT · ${allBuses.filter(b => b.empresaId === 70).length} unidades propias en servicio`
            }
          </span>
          <span className="text-[10px] text-slate-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
            Datos en vivo · IMM Montevideo
          </span>
        </div>
      </div>

      {/* ── Lista de buses de la línea (tabla) ────────────────────────────── */}
      {lineaActiva && filteredBuses.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-bold text-white">
              Detalle de Flota — Línea {lineaActiva}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-widest">
                  <th className="px-4 py-2 text-left">Operadora</th>
                  <th className="px-4 py-2 text-left">Bus ID</th>
                  <th className="px-4 py-2 text-left">Destino</th>
                  <th className="px-4 py-2 text-right">Velocidad</th>
                  <th className="px-4 py-2 text-left">Estado</th>
                  <th className="px-4 py-2 text-right">GPS</th>
                </tr>
              </thead>
              <tbody>
                {filteredBuses
                  .sort((a, b) => (a.empresaId === 70 ? -1 : 1) - (b.empresaId === 70 ? -1 : 1))
                  .map((bus) => {
                    const esUcot = bus.empresaId === 70;
                    return (
                      <tr key={bus.idBus} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <span className={`flex items-center gap-2 font-bold text-xs ${esUcot ? 'text-blue-400' : 'text-orange-400'}`}>
                            <span className={`w-2 h-2 rounded-full ${esUcot ? 'bg-blue-400' : 'bg-orange-400'}`} />
                            {EMPRESA_NAMES[bus.empresaId] ?? bus.empresa}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-300 font-mono text-xs">{bus.idBus}</td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{bus.destino ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-white">
                          {bus.velocidad != null ? `${bus.velocidad} km/h` : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {bus.estado ? (
                            <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                              bus.estado === 'ATRASADO' ? 'bg-red-500/20 text-red-400' :
                              bus.estado === 'EN_HORA' ? 'bg-emerald-500/20 text-emerald-400' :
                              'bg-slate-700 text-slate-400'
                            }`}>
                              {bus.estado}
                            </span>
                          ) : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[10px] text-slate-500 font-mono">
                          {new Date(bus.timestamp).toLocaleTimeString('es-UY')}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Estado vacío cuando hay línea pero no hay buses */}
      {lineaActiva && filteredBuses.length === 0 && !cargando && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center">
          <Bus className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-bold">Sin buses activos en Línea {lineaActiva}</p>
          <p className="text-slate-600 text-sm mt-1">
            El poller IMM tiene {totalServicio} buses activos en total. Verificá el número de línea o esperá el próximo ciclo de 10s.
          </p>
          <p className="text-slate-600 text-xs mt-2">
            Líneas con datos ahora: {[...new Set(allBuses.map(b => b.linea))].slice(0, 15).join(', ')}...
          </p>
        </div>
      )}
    </div>
  );
}
