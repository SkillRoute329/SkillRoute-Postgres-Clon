/**
 * LiveMapPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Mapa en tiempo real del STM — visualiza buses UCOT y competencia
 * usando la API oficial de la Intendencia de Montevideo.
 *
 * Misma fuente que: https://www.montevideo.gub.uy/buses/
 * Actualización: cada 7 segundos (igual al STM oficial)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  fetchSTMPosiciones,
  detectarSolapamiento,
  EMPRESA_COLORES,
  EMPRESA_NOMBRES,
  type BusSTM,
} from '../../services/stmLiveService';
import 'leaflet.heat';
import { Bus, RefreshCw, AlertTriangle, WifiOff, Layers, Filter, X, Flame } from 'lucide-react';

// ─── Fix Leaflet default icons broken by Vite ────────────────────────────────
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ─── Iconos SVG por empresa ───────────────────────────────────────────────────

function crearIconoBus(codigoEmpresa: number, linea: string): L.DivIcon {
  const color = EMPRESA_COLORES[codigoEmpresa] ?? '#94a3b8';
  const es_ucot = codigoEmpresa === 70;
  const size = es_ucot ? 42 : 28;

  // SVG de Wifi
  const wifiIcon = es_ucot
    ? `
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 1px;">
      <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
      <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
      <line x1="12" y1="20" x2="12.01" y2="20"></line>
    </svg>
  `
    : '';

  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
    html: `
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${color};border:${es_ucot ? '3px solid #fff' : '2px solid rgba(255,255,255,0.6)'};
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-size:${es_ucot ? 11 : 9}px;font-weight:800;color:${es_ucot ? '#000' : '#fff'};
        box-shadow:0 2px 8px rgba(0,0,0,0.5);
        font-family:sans-serif;letter-spacing:-0.5px;line-height:1;
        ${es_ucot ? 'box-shadow:0 0 0 3px rgba(234,179,8,0.4),0 2px 8px rgba(0,0,0,0.5);' : ''}
      ">
        ${wifiIcon}
        <span style="margin-top:${es_ucot ? '1px' : '0'}">${linea}</span>
      </div>
    `,
  });
}

// ─── Componente de centrado automático ───────────────────────────────────────

function AutoCenter({ buses }: { buses: BusSTM[] }) {
  const map = useMap();
  const centered = useRef(false);

  useEffect(() => {
    if (!centered.current && buses.length > 0) {
      const ucot = buses.filter((b) => b.codigoEmpresa === 70);
      if (ucot.length > 0) {
        const lat = ucot.reduce((s, b) => s + b.lat, 0) / ucot.length;
        const lng = ucot.reduce((s, b) => s + b.lng, 0) / ucot.length;
        map.setView([lat, lng], 13, { animate: true });
        centered.current = true;
      }
    }
  }, [buses, map]);

  return null;
}

// ─── Componente de Heatmap (leaflet.heat) ────────────────────────────────────

function HeatmapLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    const layer = (L as any)
      .heatLayer(points, {
        radius: 25,
        blur: 15,
        maxZoom: 14,
        max: 1.0,
        gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' },
      })
      .addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);

  return null;
}

// ─── Panel de estadísticas ────────────────────────────────────────────────────

const EMPRESAS_VISIBLES = [70, 50, 20, 10] as const;
type CodigoEmpresa = (typeof EMPRESAS_VISIBLES)[number];

const STYLE_MAP: Record<
  number,
  { border: string; bg: string; text: string; dot: string; badgeBg: string; badgeText: string }
> = {
  10: {
    border: 'border-red-500',
    bg: 'bg-red-500/20',
    text: 'text-red-500',
    dot: 'bg-red-500',
    badgeBg: 'bg-red-500',
    badgeText: 'text-black',
  },
  20: {
    border: 'border-green-500',
    bg: 'bg-green-500/20',
    text: 'text-green-500',
    dot: 'bg-green-500',
    badgeBg: 'bg-green-500',
    badgeText: 'text-black',
  },
  50: {
    border: 'border-blue-500',
    bg: 'bg-blue-500/20',
    text: 'text-blue-500',
    dot: 'bg-blue-500',
    badgeBg: 'bg-blue-500',
    badgeText: 'text-black',
  },
  70: {
    border: 'border-yellow-500',
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-500',
    dot: 'bg-yellow-500',
    badgeBg: 'bg-yellow-500',
    badgeText: 'text-black',
  },
};

const STYLE_INACTIVO = {
  border: 'border-slate-700',
  bg: 'bg-transparent',
  text: 'text-slate-600',
  dot: 'bg-slate-700',
  badgeBg: 'bg-slate-700',
  badgeText: 'text-slate-500',
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function LiveMapPage() {
  const [buses, setBuses] = useState<BusSTM[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  const [empresasActivas, setEmpresasActivas] = useState<Set<CodigoEmpresa>>(new Set([70, 50]));
  const [lineaFiltro, setLineaFiltro] = useState('');
  const [soloSolapamiento, setSoloSolapamiento] = useState(false);
  const [mostrarHeatmap, setMostrarHeatmap] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cargarBuses = useCallback(async () => {
    try {
      const datos = await fetchSTMPosiciones({ empresa: -1 });
      setBuses(datos);
      setUltimaActualizacion(new Date());
      setError(null);
    } catch (err) {
      setError('Sin conexión con STM. Reintentando...');
      console.warn('[LiveMap] Error STM:', err);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarBuses();
    intervalRef.current = setInterval(cargarBuses, 7000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [cargarBuses]);

  // ── Mock Heatmap Data (Densidad de Abordajes y Cuellos de botella) ──────────
  // Representan puntos críticos en Montevideo (8 de Octubre, Tres Cruces, etc.)
  const heatmapData: [number, number, number][] = [
    [-34.896, -56.166, 1.0], // Tres Cruces
    [-34.895, -56.164, 0.9],
    [-34.893, -56.16, 0.8],
    [-34.888, -56.151, 0.9], // 8 de Octubre y Garibaldi
    [-34.885, -56.142, 0.8],
    [-34.881, -56.134, 1.0], // 8 de Octubre y Propios
    [-34.877, -56.125, 0.7],
    [-34.873, -56.115, 0.9], // 8 de Octubre y Pan de Azucar
    [-34.869, -56.108, 0.8],
    [-34.862, -56.096, 0.7], // Curva de Maroñas
    [-34.905, -56.195, 0.8], // 18 de Julio y Ejido
    [-34.905, -56.185, 0.9], // 18 de Julio y Minas
    [-34.901, -56.175, 0.7], // 18 y Bvar Artigas
    [-34.884, -56.082, 0.6], // Portones
    [-34.885, -56.08, 0.8],
    [-34.832, -56.162, 0.7], // Casavalle
  ].flatMap(([lat, lng, w]) =>
    // Generar dispersión alrededor del punto para simular mapa de calor real
    Array.from({ length: 15 }).map(() => [
      lat + (Math.random() - 0.5) * 0.005,
      lng + (Math.random() - 0.5) * 0.005,
      w * (0.5 + Math.random() * 0.5),
    ]),
  ) as [number, number, number][];

  // ── Filtrado ────────────────────────────────────────────────────────────────
  const busesUCOT = buses.filter((b) => b.codigoEmpresa === 70);
  const busesUCOTFiltrados = busesUCOT.filter((b) => {
    if (lineaFiltro)
      return String(b.linea || '')
        .toUpperCase()
        .includes(lineaFiltro.toUpperCase());
    return true;
  });

  const busesRivalesActivos = buses.filter((b) => {
    return b.codigoEmpresa !== 70 && empresasActivas.has(b.codigoEmpresa as CodigoEmpresa);
  });

  // Calcular siempre para mostrar el badge en el botón
  const busesConSolapamiento = detectarSolapamiento(busesUCOTFiltrados, busesRivalesActivos, 1.0);

  const busesFinales = soloSolapamiento
    ? [...busesUCOTFiltrados, ...busesConSolapamiento]
    : buses.filter((b) => {
        if (!empresasActivas.has(b.codigoEmpresa as CodigoEmpresa)) return false;
        if (
          lineaFiltro &&
          !String(b.linea || '')
            .toUpperCase()
            .includes(lineaFiltro.toUpperCase())
        )
          return false;
        return true;
      });

  // ── Contadores ──────────────────────────────────────────────────────────────
  const contadores: Record<number, number> = {};
  for (const b of buses) {
    contadores[b.codigoEmpresa] = (contadores[b.codigoEmpresa] ?? 0) + 1;
  }

  const toggleEmpresa = (cod: CodigoEmpresa) => {
    setEmpresasActivas((prev) => {
      const next = new Set(prev);
      if (next.has(cod)) {
        next.delete(cod);
      } else {
        next.add(cod);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-700 flex items-center gap-3 flex-wrap shrink-0">
        {/* Título */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px] ${cargando ? 'bg-amber-500 shadow-amber-500 animate-pulse' : error ? 'bg-red-500 shadow-red-500' : 'bg-green-500 shadow-green-500'}`}
          />
          <Bus size={18} className="text-yellow-500" />
          <span className="text-slate-100 font-bold text-[15px]">Mapa STM en Vivo</span>
          {ultimaActualizacion && (
            <span className="text-slate-500 text-[11px]">
              · {ultimaActualizacion.toLocaleTimeString('es-UY')}
            </span>
          )}
        </div>

        {/* Indicador de error */}
        {error && (
          <div className="flex items-center gap-1.5 bg-red-900 rounded-md px-2 py-1">
            <WifiOff size={12} className="text-red-300" />
            <span className="text-red-300 text-[11px]">{error}</span>
          </div>
        )}

        {/* Fuente oficial */}
        <span className="text-slate-600 text-[10px] ml-auto">
          Fuente: IMM / montevideo.gub.uy — actualiza cada 7 seg
        </span>
      </div>

      {/* ── Controles ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-2 bg-slate-800 border-b border-[#1e3a5f] flex items-center gap-2.5 flex-wrap shrink-0">
        <Layers size={14} className="text-slate-500" />
        <span className="text-slate-400 text-xs font-semibold">Empresas:</span>

        {EMPRESAS_VISIBLES.map((cod) => {
          const activa = empresasActivas.has(cod);
          const nombre = EMPRESA_NOMBRES[cod];
          const cant = contadores[cod] ?? 0;
          const st = activa ? STYLE_MAP[cod] : STYLE_INACTIVO;
          return (
            <button
              key={cod}
              onClick={() => toggleEmpresa(cod)}
              title={`${activa ? 'Ocultar' : 'Mostrar'} ${nombre}`}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer transition-all duration-150 border-2 ${st?.border || ''} ${st?.bg || ''} ${st?.text || ''}`}
            >
              <span className={`w-2 h-2 rounded-full ${st?.dot || ''}`} />
              {nombre}
              {cant > 0 && (
                <span
                  className={`rounded-full px-1.5 text-[10px] font-bold ${st?.badgeBg || ''} ${st?.badgeText || ''}`}
                >
                  {cant}
                </span>
              )}
            </button>
          );
        })}

        {/* Filtro línea */}
        <div className="flex items-center gap-1.5 ml-2">
          <Filter size={13} className="text-slate-500" />
          <input
            type="text"
            value={lineaFiltro}
            onChange={(e) => setLineaFiltro(e.target.value)}
            placeholder="Ej: 300"
            className="w-[70px] px-2 py-1 rounded-md bg-slate-900 border border-slate-700 text-slate-200 text-xs"
          />
          {lineaFiltro && (
            <button
              onClick={() => setLineaFiltro('')}
              title="Limpiar filtro"
              className="bg-transparent border-none cursor-pointer text-slate-500 hover:text-slate-400"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Toggle solapamiento */}
        <button
          onClick={() => setSoloSolapamiento((p) => !p)}
          title="Mostrar solo rivales en corredor UCOT"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer border-2 transition-colors ${
            soloSolapamiento
              ? 'border-amber-500 bg-amber-500/20 text-amber-500'
              : 'border-slate-700 bg-transparent text-slate-600'
          }`}
        >
          <AlertTriangle size={12} />
          Solapamiento ({busesConSolapamiento.length})
        </button>

        {/* Toggle Heatmap */}
        <button
          onClick={() => setMostrarHeatmap((p) => !p)}
          title="Ver densidad de abordajes y cuellos de botella"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer border-2 transition-colors ${
            mostrarHeatmap
              ? 'border-red-500 bg-red-500/20 text-red-500'
              : 'border-slate-700 bg-transparent text-slate-600'
          }`}
        >
          <Flame size={12} />
          Densidad Abordajes
        </button>

        {/* Refrescar manual */}
        <button
          onClick={cargarBuses}
          title="Actualizar ahora"
          className="bg-transparent border-none cursor-pointer text-slate-500 hover:text-slate-400 flex items-center gap-1 text-[11px] ml-auto"
        >
          <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} />
          {busesFinales.length} buses
        </button>
      </div>

      {/* ── Mapa ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0">
        {cargando && buses.length === 0 && (
          <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-slate-900/60 gap-3">
            <RefreshCw size={32} className="text-yellow-500 animate-spin" />
            <span className="text-slate-400 text-sm">Cargando buses desde STM...</span>
          </div>
        )}

        <MapContainer
          center={[-34.9, -56.19]}
          zoom={13}
          style={{ width: '100%', height: '100%' }}
          zoomControl={true}
        >
          {/* Mapa base IMM (mismo que el STM oficial) */}
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | IMM Montevideo'
            maxZoom={19}
          />

          <AutoCenter buses={buses} />
          {mostrarHeatmap && <HeatmapLayer points={heatmapData} />}

          {busesFinales.map((bus) => {
            const solapado = soloSolapamiento
              ? bus.codigoEmpresa !== 70 && busesConSolapamiento.some((b) => b.id === bus.id)
              : false;

            return (
              <Marker
                key={bus.id}
                position={[bus.lat, bus.lng]}
                icon={crearIconoBus(bus.codigoEmpresa, bus.linea)}
              >
                <Popup>
                  <div className="min-w-[160px] font-sans">
                    <div
                      className={`font-bold text-[15px] mb-1 ${STYLE_MAP[bus.codigoEmpresa]?.text || 'text-slate-800'}`}
                    >
                      Línea {bus.linea} — {bus.empresa}
                    </div>
                    <div className="text-xs text-[#555] mb-0.5">
                      <strong>Destino:</strong> {bus.destinoDesc}
                    </div>
                    <div className="text-xs text-[#555] mb-0.5">
                      <strong>Ramal:</strong> {bus.sublinea}
                    </div>
                    <div className="text-xs text-[#555] mb-0.5">
                      <strong>Bus N°:</strong> {bus.codigoBus}
                    </div>
                    <div className="text-xs text-[#555] mb-0.5">
                      <strong>Velocidad:</strong> {bus.velocidad} km/h
                    </div>
                    {bus.velocidad === 0 && (
                      <div className="text-[11px] text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 mt-1">
                        ⚠️ Bus detenido
                      </div>
                    )}
                    {solapado && (
                      <div className="text-[11px] text-red-600 bg-red-100 rounded px-1.5 py-0.5 mt-1">
                        🔴 En corredor UCOT
                      </div>
                    )}
                    <div className="text-[10px] text-[#aaa] mt-1.5">
                      {bus.lat.toFixed(5)}, {bus.lng.toFixed(5)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* ── Leyenda ───────────────────────────────────────────────────────── */}
      <div className="px-4 py-1.5 bg-slate-800 border-t border-slate-700 flex gap-4 flex-wrap shrink-0">
        {EMPRESAS_VISIBLES.map((cod) => (
          <div key={cod} className="flex items-center gap-1.5">
            <div
              className={`w-3 h-3 rounded-full ${cod === 70 ? 'border-2 border-white' : ''} ${STYLE_MAP[cod]?.dot || 'bg-slate-500'}`}
            />
            <span className="text-slate-400 text-[11px]">
              {EMPRESA_NOMBRES[cod]} ({contadores[cod] ?? 0})
            </span>
          </div>
        ))}
        <span className="text-slate-600 text-[11px] ml-auto">
          Total: {buses.length} buses activos con GPS
        </span>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        .leaflet-container { background: #1e293b !important; }
      `}</style>
    </div>
  );
}
