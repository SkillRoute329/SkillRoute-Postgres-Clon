import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Navigation,
  Clock,
  AlertTriangle,
  Activity,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { fetchEtapaLineas } from '../../services/etapaStatsService';
import { fetchRunTimes } from '../../services/analyticsService';
import type { RunTimeSegment } from '../../services/analyticsService';
import { OPERADORES_ID_NOMBRE } from '../../utils/operadores';

export default function RunTimesTab() {
  const { empresaPropia } = useEmpresaPropia();
  const agencyId = String(empresaPropia);

  const [lineas, setLineas] = useState<string[]>([]);
  const [lineaSeleccionada, setLinea] = useState<string>('');
  const [sentido, setSentido] = useState<'IDA' | 'VUELTA'>('IDA');
  const [days, setDays] = useState<number>(3);
  
  const [loadingLineas, setLoadingLineas] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [segments, setSegments] = useState<RunTimeSegment[]>([]);
  const [bottlenecks, setBottlenecks] = useState<RunTimeSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);

  // Cargar líneas al cambiar de operador
  useEffect(() => {
    setLinea('');
    setSegments([]);
    setBottlenecks([]);
    setLoadingLineas(true);
    fetchEtapaLineas(agencyId)
      .then((ls) => {
        setLineas(ls);
        if (ls.length) {
          setLinea(ls[0]);
        }
      })
      .catch(() => setError('Error al cargar las líneas del operador.'))
      .finally(() => setLoadingLineas(false));
  }, [agencyId]);

  const cargarDatos = useCallback(async () => {
    if (!lineaSeleccionada) return;
    setLoadingData(true);
    setError(null);
    try {
      const res = await fetchRunTimes(agencyId, lineaSeleccionada, days, sentido);
      if (res && res.ok) {
        setSegments(res.segments || []);
        setBottlenecks(res.bottlenecks || []);
        setUltimaActualizacion(
          new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      } else {
        setSegments([]);
        setBottlenecks([]);
        setError('No se encontraron registros de tiempos de viaje para los filtros seleccionados.');
      }
    } catch (e) {
      setError('Error al conectar con el servidor de analíticas.');
    } finally {
      setLoadingData(false);
    }
  }, [agencyId, lineaSeleccionada, days, sentido]);

  // Cargar datos cuando cambia la línea, sentido o días
  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const totalDemoraAcumulada = useMemo(() => {
    return segments.reduce((acc, s) => acc + Math.max(0, s.avgDelayMinutes), 0);
  }, [segments]);

  const segmentMaxDemora = useMemo(() => {
    if (!segments.length) return null;
    return segments.reduce((max, s) => (s.avgDelayMinutes > max.avgDelayMinutes ? s : max), segments[0]);
  }, [segments]);

  const agencyLabel = OPERADORES_ID_NOMBRE.find(a => a.id === agencyId)?.nombre ?? agencyId;

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Navigation className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-bold text-slate-200">Análisis de Tiempos de Viaje (Run Times)</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Compara los tiempos teóricos planificados (GTFS) contra los tiempos de viaje reales obtenidos por telemetría GPS.
          </p>
        </div>
        
        <button
          onClick={cargarDatos}
          disabled={loadingData || !lineaSeleccionada}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-slate-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-4 bg-slate-900/50 border border-slate-800/80 p-4 rounded-xl">
        {/* Línea */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Línea</span>
          {loadingLineas ? (
            <span className="text-xs text-slate-400 animate-pulse py-2">Cargando...</span>
          ) : lineas.length === 0 ? (
            <span className="text-xs text-slate-500 italic py-2">Sin líneas</span>
          ) : (
            <select
              value={lineaSeleccionada}
              onChange={(e) => setLinea(e.target.value)}
              className="bg-slate-850 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:border-blue-500 focus:outline-none min-w-[100px]"
            >
              {lineas.map((l) => (
                <option key={l} value={l}>
                  Línea {l}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Sentido */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Sentido</span>
          <div className="flex rounded-lg overflow-hidden border border-slate-700">
            <button
              onClick={() => setSentido('IDA')}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                sentido === 'IDA' ? 'bg-blue-600 text-white' : 'bg-slate-850 text-slate-400 hover:bg-slate-800'
              }`}
            >
              IDA
            </button>
            <button
              onClick={() => setSentido('VUELTA')}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                sentido === 'VUELTA' ? 'bg-blue-600 text-white' : 'bg-slate-850 text-slate-400 hover:bg-slate-800'
              }`}
            >
              VUELTA
            </button>
          </div>
        </div>

        {/* Rango Días */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Rango de Días</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-slate-850 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value={1}>Último día</option>
            <option value={3}>Últimos 3 días</option>
            <option value={5}>Últimos 5 días</option>
            <option value={7}>Última semana</option>
          </select>
        </div>

        {ultimaActualizacion && (
          <div className="ml-auto text-right self-end pb-1.5">
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Actualizado: {ultimaActualizacion} · {agencyLabel}
            </span>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold block mb-1">Segmentos</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-blue-400">{segments.length}</span>
            <span className="text-xs text-slate-500">tramos en ruta</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold block mb-1">Demora Acumulada</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black ${totalDemoraAcumulada > 5 ? 'text-red-400' : totalDemoraAcumulada > 0 ? 'text-emerald-400' : 'text-slate-550'}`}>
              +{totalDemoraAcumulada.toFixed(1)}
            </span>
            <span className="text-xs text-slate-500">minutos totales</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold block mb-1">Cuellos de Botella</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black ${bottlenecks.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {bottlenecks.length}
            </span>
            <span className="text-xs text-slate-500">puntos críticos</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold block mb-1">Peor Segmento</span>
          <span className="text-xs font-bold text-red-400 block truncate mt-1" title={segmentMaxDemora ? `${segmentMaxDemora.fromStop} ➔ ${segmentMaxDemora.toStop}` : ''}>
            {segmentMaxDemora ? `${segmentMaxDemora.fromStop.split(' ').slice(0, 2).join(' ')} ➔ ${segmentMaxDemora.toStop.split(' ').slice(0, 2).join(' ')}` : '—'}
          </span>
          {segmentMaxDemora && (
            <span className="text-xs text-slate-500">+{segmentMaxDemora.avgDelayMinutes.toFixed(1)} min de demora</span>
          )}
        </div>
      </div>

      {/* Cuellos de Botella Críticos */}
      {bottlenecks.length > 0 && (
        <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h3 className="font-bold text-sm uppercase tracking-wider">Cuellos de Botella Críticos Detectados</h3>
          </div>
          <p className="text-xs text-slate-400">
            Tramos donde el tiempo real excede en más del 25% al programado y acumulan un retraso promedio superior a 1.5 minutos.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {bottlenecks.map((b, idx) => (
              <div key={idx} className="bg-slate-900/90 border border-red-900/30 rounded-lg p-3 flex items-center justify-between">
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <span className="truncate max-w-[120px]" title={b.fromStop}>{b.fromStop}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate max-w-[120px]" title={b.toStop}>{b.toStop}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{b.sampleCount} muestras analizadas</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs text-red-400 font-bold block">+{b.avgDelayMinutes.toFixed(1)} min</span>
                  <span className="text-[9px] text-slate-500">Plan: {b.avgScheduledMinutes}m | Real: {b.avgRealMinutes}m</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detalle de Segmentos */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Progreso y Demora por Segmento</h3>
            <p className="text-xs text-slate-500 mt-0.5">Ordenados cronológicamente a lo largo de la ruta</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-slate-600 inline-block" /> Programado
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block" /> Real Promedio
            </span>
          </div>
        </div>

        <div className="divide-y divide-slate-800/60">
          {loadingData ? (
            <div className="p-12 text-center text-slate-450 flex items-center justify-center gap-2.5">
              <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
              <span>Calculando y comparando tiempos de viaje...</span>
            </div>
          ) : error && segments.length === 0 ? (
            <div className="p-12 text-center text-slate-500 flex items-center justify-center gap-2 text-amber-400 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : segments.length === 0 ? (
            <div className="p-12 text-center text-slate-500 italic">
              No hay segmentos disponibles para esta línea.
            </div>
          ) : (
            segments.map((s, idx) => {
              const totalBarVal = Math.max(s.avgScheduledMinutes, s.avgRealMinutes);
              const schedPct = (s.avgScheduledMinutes / totalBarVal) * 100;
              const realPct = (s.avgRealMinutes / totalBarVal) * 100;
              const delayStr = s.avgDelayMinutes > 0 ? `+${s.avgDelayMinutes.toFixed(1)}` : `${s.avgDelayMinutes.toFixed(1)}`;
              
              return (
                <div key={idx} className="p-4 sm:px-6 hover:bg-slate-800/10 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Tramo */}
                  <div className="md:w-1/3 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                      <span className="bg-slate-800 text-slate-400 w-5 h-5 rounded-full flex items-center justify-center text-[10px]">
                        {idx + 1}
                      </span>
                      <span className="truncate max-w-[150px]" title={s.fromStop}>{s.fromStop}</span>
                      <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="truncate max-w-[150px]" title={s.toStop}>{s.toStop}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 ml-7">{s.sampleCount} observaciones</span>
                  </div>

                  {/* Comparación Visual */}
                  <div className="flex-1 space-y-1.5">
                    {/* Barra Programada */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 w-10 text-right">Plan</span>
                      <div className="flex-1 bg-slate-800/40 h-2 rounded-full overflow-hidden">
                        <div className="bg-slate-600 h-full rounded-full" style={{ width: `${schedPct}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono w-10">{s.avgScheduledMinutes.toFixed(1)}m</span>
                    </div>

                    {/* Barra Real */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 w-10 text-right">Real</span>
                      <div className="flex-1 bg-slate-800/40 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            s.isBottleneck ? 'bg-red-500' : s.avgDelayMinutes > 1.5 ? 'bg-amber-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${realPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-300 font-mono w-10 font-bold">
                        {s.avgRealMinutes.toFixed(1)}m
                      </span>
                    </div>
                  </div>

                  {/* Desviación */}
                  <div className="md:w-32 text-right shrink-0 flex md:flex-col items-center md:items-end justify-between md:justify-center">
                    <span className="text-xs text-slate-500 md:hidden font-medium">Demora:</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-sm font-bold ${
                          s.isBottleneck
                            ? 'text-red-400 bg-red-950/40 px-2 py-0.5 rounded border border-red-900/30'
                            : s.avgDelayMinutes > 1.5
                            ? 'text-amber-400'
                            : s.avgDelayMinutes < -0.5
                            ? 'text-emerald-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {delayStr} min
                      </span>
                      {s.isBottleneck && (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" title="Cuello de botella" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Nota */}
      <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl flex items-start gap-2.5">
        <Activity className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">
          <span className="text-slate-400 font-semibold">Explicación Metodológica:</span> Los tiempos de viaje se obtienen calculando el intervalo de tiempo entre el primer ping GPS detectado en la parada de origen y el primer ping en la parada de destino para cada servicio (`trip_id`). Los datos se promedian y se descartan outliers.
        </p>
      </div>
    </div>
  );
}
