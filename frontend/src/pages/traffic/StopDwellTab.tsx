import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Flame,
  Gauge,
  Timer,
} from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { fetchEtapaLineas } from '../../services/etapaStatsService';
import { fetchStopDwellTimes } from '../../services/analyticsService';
import type { StopDwellTime } from '../../services/analyticsService';
import { OPERADORES_ID_NOMBRE } from '../../utils/operadores';

export default function StopDwellTab() {
  const { empresaPropia } = useEmpresaPropia();
  const agencyId = String(empresaPropia);

  const [lineas, setLineas] = useState<string[]>([]);
  const [lineaSeleccionada, setLinea] = useState<string>('');
  const [days, setDays] = useState<number>(3);

  const [loadingLineas, setLoadingLineas] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [dwellTimes, setDwellTimes] = useState<StopDwellTime[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);

  // Filtros locales
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroCongestion, setFiltroCongestion] = useState<'TODOS' | 'ALTO' | 'MEDIO' | 'BAJO'>('TODOS');
  const [ordenarPor, setOrdenarPor] = useState<'avg' | 'max' | 'name'>('avg');

  // Cargar líneas al cambiar de operador
  useEffect(() => {
    setLinea('');
    setDwellTimes([]);
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
      const res = await fetchStopDwellTimes(agencyId, lineaSeleccionada, days);
      if (res && res.ok) {
        setDwellTimes(res.dwellTimes || []);
        setUltimaActualizacion(
          new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      } else {
        setDwellTimes([]);
        setError('No se encontraron registros de tiempos de parada para los filtros seleccionados.');
      }
    } catch (e) {
      setError('Error al conectar con el servidor de analíticas.');
    } finally {
      setLoadingData(false);
    }
  }, [agencyId, lineaSeleccionada, days]);

  // Cargar datos cuando cambia la línea o rango de días
  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Filtrar y ordenar datos localmente
  const filteredAndSortedDwellTimes = useMemo(() => {
    let result = [...dwellTimes];

    // Filtro texto
    if (filtroTexto.trim()) {
      const query = filtroTexto.toLowerCase();
      result = result.filter((d) => d.stopName.toLowerCase().includes(query));
    }

    // Filtro congestión
    if (filtroCongestion !== 'TODOS') {
      result = result.filter((d) => d.congestionLevel === filtroCongestion);
    }

    // Ordenar
    result.sort((a, b) => {
      if (ordenarPor === 'avg') return b.avgDwellSeconds - a.avgDwellSeconds;
      if (ordenarPor === 'max') return b.maxDwellSeconds - a.maxDwellSeconds;
      return a.stopName.localeCompare(b.stopName);
    });

    return result;
  }, [dwellTimes, filtroTexto, filtroCongestion, ordenarPor]);

  // KPIs
  const stats = useMemo(() => {
    if (!dwellTimes.length) return { avg: 0, max: 0, highCount: 0, totalSamples: 0 };
    const totalAvg = dwellTimes.reduce((acc, d) => acc + d.avgDwellSeconds, 0);
    const maxVal = Math.max(...dwellTimes.map((d) => d.maxDwellSeconds));
    const high = dwellTimes.filter((d) => d.congestionLevel === 'ALTO').length;
    const samples = dwellTimes.reduce((acc, d) => acc + d.sampleCount, 0);

    return {
      avg: Math.round(totalAvg / dwellTimes.length),
      max: maxVal,
      highCount: high,
      totalSamples: samples,
    };
  }, [dwellTimes]);

  const agencyLabel = OPERADORES_ID_NOMBRE.find(a => a.id === agencyId)?.nombre ?? agencyId;

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Timer className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-bold text-slate-200">Tiempos de Detención en Paradas (Stop Dwell Times)</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Mide el tiempo de detención promedio y máximo en cada parada para identificar cuellos de botella por ascenso/descenso de pasajeros o congestión vial.
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

      {/* Filtros de Entrada */}
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
          <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold block mb-1">Dwell Time Medio</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black ${stats.avg > 45 ? 'text-amber-400' : stats.avg > 0 ? 'text-emerald-400' : 'text-slate-550'}`}>
              {stats.avg}s
            </span>
            <span className="text-xs text-slate-500">promedio por parada</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold block mb-1">Máxima Detención</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-350">{stats.max >= 60 ? `${Math.round(stats.max / 60)}m` : `${stats.max}s`}</span>
            {stats.max > 0 && <span className="text-xs text-slate-500">({stats.max}s)</span>}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold block mb-1">Congestión Crítica</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black ${stats.highCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {stats.highCount}
            </span>
            <span className="text-xs text-slate-500">paradas con detención alta</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold block mb-1">Eventos Analizados</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-200">{stats.totalSamples.toLocaleString()}</span>
            <span className="text-xs text-slate-500">pings procesados</span>
          </div>
        </div>
      </div>

      {/* Filtros Locales de Tabla */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar parada por nombre..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              className="bg-slate-950 border border-slate-850 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-350 focus:border-blue-500 focus:outline-none w-full"
            />
          </div>

          {/* Selector congestión */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-1">
            <Flame className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={filtroCongestion}
              onChange={(e) => setFiltroCongestion(e.target.value as any)}
              className="bg-transparent text-xs text-slate-350 focus:outline-none cursor-pointer"
            >
              <option value="TODOS">Todos los Niveles</option>
              <option value="ALTO">Alto (&gt;90s)</option>
              <option value="MEDIO">Medio (35s-90s)</option>
              <option value="BAJO">Bajo (&lt;35s)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <SlidersHorizontal className="w-4 h-4 text-slate-500" />
          <div className="flex bg-slate-950 border border-slate-850 rounded-lg p-0.5">
            <button
              onClick={() => setOrdenarPor('avg')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                ordenarPor === 'avg' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
            >
              Dwell Medio
            </button>
            <button
              onClick={() => setOrdenarPor('max')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                ordenarPor === 'max' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
            >
              Detención Max
            </button>
            <button
              onClick={() => setOrdenarPor('name')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                ordenarPor === 'name' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
            >
              Nombre
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de Detalle */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                <th className="text-left px-6 py-3 font-semibold">Parada</th>
                <th className="text-right px-4 py-3 font-semibold">Dwell Promedio</th>
                <th className="text-right px-4 py-3 font-semibold">Dwell Máximo</th>
                <th className="text-right px-4 py-3 font-semibold">Nivel Congestión</th>
                <th className="text-right px-6 py-3 font-semibold">Muestras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loadingData ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-450">
                    <div className="flex items-center justify-center gap-2.5">
                      <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                      <span>Cargando y calculando tiempos de parada...</span>
                    </div>
                  </td>
                </tr>
              ) : error && dwellTimes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2 text-amber-400 font-medium">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  </td>
                </tr>
              ) : filteredAndSortedDwellTimes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic">
                    No hay paradas que coincidan con los filtros locales.
                  </td>
                </tr>
              ) : (
                filteredAndSortedDwellTimes.map((d, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/10 transition-colors">
                    {/* Nombre Parada */}
                    <td className="px-6 py-3">
                      <span className="font-semibold text-slate-200 block">{d.stopName}</span>
                      <span className="text-[10px] text-slate-550 uppercase tracking-widest font-semibold">
                        Código Parada
                      </span>
                    </td>

                    {/* Promedio */}
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-mono font-bold text-sm ${
                          d.congestionLevel === 'ALTO'
                            ? 'text-red-400'
                            : d.congestionLevel === 'MEDIO'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {d.avgDwellSeconds}s
                      </span>
                    </td>

                    {/* Máximo */}
                    <td className="px-4 py-3 text-right font-mono text-slate-400 text-xs">
                      {d.maxDwellSeconds >= 60
                        ? `${Math.floor(d.maxDwellSeconds / 60)}m ${d.maxDwellSeconds % 60}s`
                        : `${d.maxDwellSeconds}s`}
                    </td>

                    {/* Congestión Badge */}
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          d.congestionLevel === 'ALTO'
                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                            : d.congestionLevel === 'MEDIO'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }`}
                      >
                        <Gauge className="w-3 h-3" />
                        {d.congestionLevel}
                      </span>
                    </td>

                    {/* Muestras */}
                    <td className="px-6 py-3 text-right font-mono text-slate-500 text-xs">
                      {d.sampleCount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Nota */}
      <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl flex items-start gap-2.5">
        <Clock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">
          <span className="text-slate-400 font-semibold">Explicación Metodológica:</span> El tiempo de parada (Dwell Time) se calcula agrupando eventos donde la velocidad reportada del bus es inferior o igual a 1 km/h en la cercanía de una parada. Se miden intervalos contiguos de pings con brechas menores a 120 segundos. Los periodos de inactividad de larga duración (&gt;15 min) en terminales son filtrados de las estadísticas.
        </p>
      </div>
    </div>
  );
}
