/**
 * GPSPlayback — Timeline replay histórico de buses
 * ====================================================
 * Sprint 2 entrega 2.2 del roadmap international-grade.
 *
 * Diferenciador: paridad con Swiftly GPS Playback. Forensic analysis
 * de incidentes y reclamos.
 *
 * Schema verificado bajo §12 (vehicle_events: idBus, agencyId,
 * createdAt, lat, lon, velocidad, estadoCumplimiento, etc.).
 *
 * Uso típico:
 * 1) Operador entra al módulo, selecciona bus de su flota.
 * 2) Selecciona rango temporal (por defecto últimas 24h).
 * 3) Slider temporal permite "viajar" por la trayectoria.
 * 4) Mapa muestra polyline completa + marker en momento actual.
 * 5) Cards laterales muestran velocidad, estado, próxima parada en
 *    el momento seleccionado.
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Building2,
  Clock,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useEmpresaPropia, EMPRESAS_OPCIONES } from '../../hooks/useEmpresaPropia';
import {
  getTrayectoria,
  getBusesActivosUltimas24h,
  type TrayectoriaResultado,
  type GpsPing,
} from '../../services/gpsPlaybackService';

const ESTADO_COLOR: Record<string, string> = {
  EN_TIEMPO: '#10b981',
  ADELANTADO: '#f59e0b',
  SIN_HORARIO: '#64748b',
  FUERA_DE_SERVICIO: '#475569',
};

function colorPing(p: GpsPing): string {
  return ESTADO_COLOR[p.estadoCumplimiento] || '#94a3b8';
}

export default function GPSPlayback() {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const [busesDisponibles, setBusesDisponibles] = useState<string[]>([]);
  const [idBus, setIdBus] = useState<string>('');
  const [rangoHs, setRangoHs] = useState(24);
  const [trayectoria, setTrayectoria] = useState<TrayectoriaResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pingIdx, setPingIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Cargar lista de buses activos al cambiar empresa
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buses = await getBusesActivosUltimas24h(empresaCfg.label);
        if (!cancelled) {
          setBusesDisponibles(buses);
          if (buses.length > 0 && !idBus) {
            setIdBus(buses[0]);
          }
        }
      } catch (e) {
        console.warn('[GPSPlayback] error cargando buses', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [empresaCfg.label, idBus]);

  const cargarTrayectoria = useCallback(async () => {
    if (!idBus) {
      setError('Seleccioná un bus para ver su trayectoria.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const hasta = new Date();
      const desde = new Date(hasta.getTime() - rangoHs * 3600 * 1000);
      const r = await getTrayectoria(idBus, desde, hasta);
      setTrayectoria(r);
      setPingIdx(0);
      setPlaying(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [idBus, rangoHs]);

  // Auto-play
  useEffect(() => {
    if (!playing || !trayectoria) return;
    const t = setInterval(() => {
      setPingIdx((i) => {
        if (!trayectoria) return i;
        const next = i + 1;
        if (next >= trayectoria.pings.length) {
          setPlaying(false);
          return i;
        }
        return next;
      });
    }, 250);
    return () => clearInterval(t);
  }, [playing, trayectoria]);

  const pingActual = useMemo(
    () => (trayectoria && trayectoria.pings[pingIdx]) || null,
    [trayectoria, pingIdx],
  );

  const polylinePositions = useMemo(() => {
    if (!trayectoria) return [];
    return trayectoria.pings.map((p) => [p.lat, p.lon] as [number, number]);
  }, [trayectoria]);

  const center = useMemo<[number, number]>(() => {
    if (pingActual) return [pingActual.lat, pingActual.lon];
    if (polylinePositions[0]) return polylinePositions[0];
    return [-34.9011, -56.1645]; // Montevideo default
  }, [pingActual, polylinePositions]);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight flex items-center gap-2">
            <MapPin className="w-7 h-7 text-amber-400" />
            GPS Playback · {empresaCfg.label}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Replay histórico de la trayectoria de un bus. Útil para análisis
            de incidentes, reclamos y auditoría operativa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400" />
          <select
            value={empresaPropia}
            onChange={(e) => setEmpresaPropia(Number(e.target.value))}
            className="rounded-md border border-slate-700 bg-slate-900/60 text-sm px-3 py-2"
          >
            {EMPRESAS_OPCIONES.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Controles de búsqueda */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="flex-1 min-w-[150px]">
          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block mb-1">
            Bus (idBus)
          </label>
          <select
            value={idBus}
            onChange={(e) => setIdBus(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950/60 text-sm px-3 py-2"
          >
            <option value="">Seleccionar bus…</option>
            {busesDisponibles.map((b) => (
              <option key={b} value={b}>
                #{b}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500 mt-1">
            {busesDisponibles.length} buses con pings en últimas 24h.
          </p>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block mb-1">
            Rango
          </label>
          <select
            value={rangoHs}
            onChange={(e) => setRangoHs(Number(e.target.value))}
            className="rounded-md border border-slate-700 bg-slate-950/60 text-sm px-3 py-2"
          >
            <option value={1}>Última hora</option>
            <option value={4}>Últimas 4 horas</option>
            <option value={12}>Últimas 12 horas</option>
            <option value={24}>Últimas 24 horas</option>
            <option value={72}>Últimos 3 días</option>
            <option value={168}>Última semana</option>
          </select>
        </div>
        <button
          onClick={cargarTrayectoria}
          disabled={loading || !idBus}
          className="inline-flex items-center gap-2 rounded-md bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-bold text-slate-950"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          Buscar trayectoria
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-400/40 bg-rose-950/30 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Stats + advertencias */}
      {trayectoria && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Pings" value={trayectoria.meta.pingsEncontrados} />
          <Stat label="Distancia total" value={`${trayectoria.meta.distanciaTotalKm} km`} />
          <Stat
            label="Vel. promedio"
            value={
              trayectoria.meta.velocidadPromedio !== null
                ? `${trayectoria.meta.velocidadPromedio} km/h`
                : '—'
            }
          />
          <Stat
            label="Período"
            value={`${Math.round(trayectoria.meta.tiempoTotal.minutos / 60)} h`}
          />
          <Stat label="idBus" value={`#${trayectoria.meta.idBus}`} />
        </div>
      )}

      {trayectoria?.meta.advertencias && trayectoria.meta.advertencias.length > 0 && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-950/20 p-3 text-sm text-amber-200 space-y-1">
          {trayectoria.meta.advertencias.map((a, i) => (
            <p key={i}>⚠️ {a}</p>
          ))}
        </div>
      )}

      {/* Mapa + slider */}
      {trayectoria && trayectoria.pings.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Mapa */}
          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="h-[480px] relative">
              <MapContainer
                center={center}
                zoom={13}
                style={{ width: '100%', height: '100%' }}
                key={`${idBus}-${trayectoria.meta.desde.toISOString()}`}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap'
                />
                <Polyline positions={polylinePositions} color="#f59e0b" weight={3} opacity={0.8} />
                {pingActual && (
                  <CircleMarker
                    center={[pingActual.lat, pingActual.lon]}
                    radius={9}
                    pathOptions={{
                      color: colorPing(pingActual),
                      fillColor: colorPing(pingActual),
                      fillOpacity: 1,
                    }}
                  >
                    <Popup>
                      <div className="text-xs">
                        <p>
                          <strong>#{pingActual.idBus}</strong> — Línea {pingActual.linea}
                        </p>
                        <p>{pingActual.timestamp.toLocaleString('es-UY')}</p>
                        <p>
                          {pingActual.velocidad} km/h · {pingActual.estadoCumplimiento}
                        </p>
                        {pingActual.proximaParada && <p>Próx: {pingActual.proximaParada}</p>}
                      </div>
                    </Popup>
                  </CircleMarker>
                )}
              </MapContainer>
            </div>

            {/* Slider */}
            <div className="border-t border-slate-800 p-4 flex items-center gap-3">
              <button
                onClick={() => setPlaying((p) => !p)}
                className="rounded-md bg-amber-400 hover:bg-amber-300 text-slate-950 p-2"
                aria-label={playing ? 'Pausar' : 'Reproducir'}
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={trayectoria.pings.length - 1}
                value={pingIdx}
                onChange={(e) => setPingIdx(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-slate-400 min-w-[80px] text-right font-mono">
                {pingIdx + 1} / {trayectoria.pings.length}
              </span>
            </div>
          </div>

          {/* Info card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <h3 className="font-black text-white">Estado en este momento</h3>
            {pingActual ? (
              <>
                <InfoRow icon={<Clock className="w-4 h-4" />} label="Hora">
                  <span className="font-mono text-sm">
                    {pingActual.timestamp.toLocaleString('es-UY')}
                  </span>
                </InfoRow>
                <InfoRow label="Línea">
                  <span className="font-bold text-white">{pingActual.linea}</span>
                </InfoRow>
                <InfoRow label="Velocidad">
                  <span className="font-bold">{pingActual.velocidad} km/h</span>
                </InfoRow>
                <InfoRow label="Estado">
                  <span
                    className="font-bold"
                    style={{ color: colorPing(pingActual) }}
                  >
                    {pingActual.estadoCumplimiento || '—'}
                  </span>
                </InfoRow>
                <InfoRow label="Desviación">
                  <span>
                    {pingActual.desviacionMin !== null
                      ? `${pingActual.desviacionMin > 0 ? '+' : ''}${pingActual.desviacionMin} min`
                      : '—'}
                  </span>
                </InfoRow>
                <InfoRow label="Próxima parada">
                  <span className="text-xs">{pingActual.proximaParada || '—'}</span>
                </InfoRow>
                <InfoRow label="Sentido">
                  <span className="text-xs">{pingActual.sentido || '—'}</span>
                </InfoRow>
                <InfoRow label="Coordenadas">
                  <span className="font-mono text-[10px]">
                    {pingActual.lat.toFixed(5)}, {pingActual.lon.toFixed(5)}
                  </span>
                </InfoRow>
              </>
            ) : (
              <p className="text-sm text-slate-500">Cargando…</p>
            )}
          </div>
        </div>
      )}

      {trayectoria && trayectoria.pings.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center">
          <MapPin className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h3 className="font-black text-white mb-1">Sin pings encontrados</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            No hay datos GPS para el bus #{idBus} en el rango seleccionado.
            Probá ampliar el rango temporal o seleccionar otro bus.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-black text-white">{value}</p>
    </div>
  );
}

function InfoRow({
  label,
  children,
  icon,
}: {
  label: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3 text-sm border-b border-slate-800/60 pb-2 last:border-0 last:pb-0">
      <span className="text-slate-400 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="text-right">{children}</span>
    </div>
  );
}
