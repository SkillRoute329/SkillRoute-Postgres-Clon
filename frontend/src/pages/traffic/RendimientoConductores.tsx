/**
 * RendimientoConductores — Perfil de desempeño por coche para las 4 empresas.
 *
 * Fuente: vehicle_stats (vehicle_events GPS real IMM, todas las empresas).
 * Para UCOT con distribuciones: enriquece con conductor (interno + nombre).
 * Para el resto: datos de coche solo — OTP%, velocidad, líneas, historial.
 */
import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  Bus, Users, RefreshCw, TrendingUp, TrendingDown,
  Minus, Clock, Zap, Calendar, ChevronDown,
} from 'lucide-react';
import {
  fetchVehicleStats,
  VehicleStats,
  AGENCY_LABELS,
} from '../../services/autoStatsService';

const EMPRESAS = [
  { id: '10', label: 'COETC'  },
  { id: '20', label: 'COME'   },
  { id: '50', label: 'CUTCSA' },
  { id: '70', label: 'UCOT'   },
];

const SORT_OPTS = [
  { value: 'otp',      label: 'Menor OTP primero'  },
  { value: 'actividad', label: 'Más recientes primero' },
] as const;

type SortOpt = 'otp' | 'actividad';

const OTP_COLOR = (p: number) =>
  p >= 80 ? 'text-emerald-400' : p >= 60 ? 'text-yellow-400' : 'text-red-400';
const OTP_BG = (p: number) =>
  p >= 80 ? 'bg-emerald-500/10' : p >= 60 ? 'bg-yellow-500/10' : 'bg-red-500/10';

const DesvioIcon = ({ min }: { min: number | null }) => {
  if (min === null) return <Minus className="w-3 h-3 text-slate-500" />;
  if (min > 1)      return <TrendingDown className="w-3 h-3 text-red-400" />;
  if (min < -1)     return <TrendingUp className="w-3 h-3 text-emerald-400" />;
  return <Minus className="w-3 h-3 text-slate-400" />;
};

const fmtDesvio = (min: number | null) => {
  if (min === null) return '—';
  return `${min > 0 ? '+' : ''}${min.toFixed(1)} min`;
};

const fmtFecha = (iso: string | null) => {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export default function RendimientoConductores() {
  const [empresa, setEmpresa]     = useState<string>('70');
  const [sortBy, setSortBy]       = useState<SortOpt>('otp');
  const [loading, setLoading]     = useState(false);
  const [buses, setBuses]         = useState<VehicleStats[]>([]);
  const [total, setTotal]         = useState(0);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchVehicleStats(empresa, sortBy);
      if (res.ok) {
        setBuses(res.buses ?? []);
        setTotal(res.totalBuses ?? 0);
      } else {
        setError('Sin datos disponibles.');
      }
    } catch {
      setError('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }, [empresa, sortBy]);

  useEffect(() => { void cargar(); }, [cargar]);

  const label    = AGENCY_LABELS[empresa] ?? empresa;
  // ¿Esta empresa tiene datos de conductor? (solo UCOT por ahora)
  const tieneCondutor = empresa === '70';

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 p-6">

      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-3">
            <Bus className="w-6 h-6 text-blue-400" />
            Rendimiento por Coche
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            OTP real por vehículo desde GPS IMM
            {tieneCondutor && ' · con conductor asignado cuando disponible'}
          </p>
        </div>
        <button
          onClick={cargar}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-sm border border-slate-700 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Selector empresa */}
        <div className="flex gap-1 bg-slate-900 border border-slate-700 rounded-xl p-1">
          {EMPRESAS.map(e => (
            <button
              key={e.id}
              onClick={() => setEmpresa(e.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                empresa === e.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>

        {/* Orden */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOpt)}
            className="bg-slate-900 border border-slate-700 rounded-xl pl-4 pr-8 py-2 text-sm text-white focus:outline-none appearance-none"
          >
            {SORT_OPTS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <span className="self-center text-xs text-slate-500">
          {total} coches registrados · {label}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-700/40 rounded-xl p-4 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
          <span className="text-slate-400">Cargando flota {label}…</span>
        </div>
      ) : buses.length === 0 && !error ? (
        <div className="text-center py-20 text-slate-500">
          <Bus className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Sin datos de flota para {label}.</p>
          <p className="text-xs mt-1">
            El sistema acumula datos cada noche a las 23:45 desde el GPS de IMM.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60">
                <th className="text-left px-4 py-3 text-slate-400 font-medium w-20">Coche</th>
                {tieneCondutor && (
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Conductor</th>
                )}
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Líneas</th>
                <th className="text-right px-3 py-3 text-slate-400 font-medium w-14">Días</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium w-24">OTP%</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium w-28">Vel. media</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium w-32">Desvío prom.</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium w-24">Última act.</th>
              </tr>
            </thead>
            <tbody>
              {buses.map(b => {
                const otp    = Math.round(b.pctEnTiempo);
                const isOpen = expandido === b.idBus;
                return (
                  <Fragment key={b.idBus}>
                    <tr
                      onClick={() => setExpandido(isOpen ? null : b.idBus)}
                      className={`border-b border-slate-800/40 hover:bg-slate-900/40 transition-colors cursor-pointer ${isOpen ? 'bg-slate-900/30' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-white font-bold">{b.idBus}</span>
                      </td>
                      {tieneCondutor && (
                        <td className="px-4 py-3">
                          {b.ultimoNombre ? (
                            <span className="flex items-center gap-1.5 text-slate-200">
                              <Users className="w-3 h-3 text-blue-400 flex-shrink-0" />
                              <span className="truncate max-w-[140px]">{b.ultimoNombre}</span>
                              {b.ultimoInterno && (
                                <span className="text-slate-500 text-xs">#{b.ultimoInterno}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-600 text-xs italic">sin asignar</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(b.lineasOperadas ?? []).slice(0, 4).map(l => (
                            <span key={l} className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                              {l}
                            </span>
                          ))}
                          {(b.lineasOperadas ?? []).length > 4 && (
                            <span className="text-slate-500 text-[10px] self-center">
                              +{b.lineasOperadas.length - 4}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="flex items-center justify-end gap-1 text-slate-400 text-xs">
                          <Calendar className="w-3 h-3 text-slate-600" />
                          {b.diasActivos}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${OTP_BG(otp)} ${OTP_COLOR(otp)}`}>
                          {otp}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="flex items-center justify-end gap-1 text-slate-300">
                          <Zap className="w-3 h-3 text-yellow-400" />
                          {b.velocidadMedia > 0 ? `${Math.round(b.velocidadMedia)} km/h` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="flex items-center justify-end gap-1">
                          <DesvioIcon min={b.desviacionMediaMin} />
                          <span className={b.desviacionMediaMin !== null && b.desviacionMediaMin > 1 ? 'text-red-400' : 'text-slate-300'}>
                            {fmtDesvio(b.desviacionMediaMin)}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="flex items-center justify-end gap-1 text-slate-400 text-xs">
                          <Clock className="w-3 h-3" />
                          {fmtFecha(b.ultimaActividad)}
                        </span>
                      </td>
                    </tr>

                    {/* Fila expandida */}
                    {isOpen && (
                      <tr className="border-b border-slate-800/40 bg-slate-900/20">
                        <td colSpan={tieneCondutor ? 8 : 7} className="px-6 py-4">

                          {/* Estadísticas agregadas */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs mb-4">
                            <div>
                              <p className="text-slate-500 mb-1">En tiempo</p>
                              <p className="text-emerald-400 font-semibold">{Math.round(b.pctEnTiempo)}%</p>
                            </div>
                            <div>
                              <p className="text-slate-500 mb-1">Atrasado</p>
                              <p className="text-red-400 font-semibold">{Math.round(b.pctAtrasado)}%</p>
                            </div>
                            <div>
                              <p className="text-slate-500 mb-1">Adelantado</p>
                              <p className="text-blue-400 font-semibold">{Math.round(b.pctAdelantado)}%</p>
                            </div>
                            <div>
                              <p className="text-slate-500 mb-1">Eventos GPS</p>
                              <p className="text-white font-semibold">{b.totalEventos.toLocaleString()}</p>
                            </div>
                          </div>

                          {/* Conductores conocidos (UCOT) */}
                          {tieneCondutor && b.conductoresConocidos.length > 0 && (
                            <div className="mb-4 text-xs">
                              <p className="text-slate-500 mb-1">Internos que condujeron este coche</p>
                              <div className="flex flex-wrap gap-1">
                                {b.conductoresConocidos.map(i => (
                                  <span key={i} className="bg-blue-900/30 border border-blue-800/40 text-blue-300 px-2 py-0.5 rounded font-mono text-[10px]">
                                    #{i}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Todas las líneas */}
                          <div className="mb-4 text-xs">
                            <p className="text-slate-500 mb-1">Todas las líneas operadas</p>
                            <div className="flex flex-wrap gap-1">
                              {b.lineasOperadas.map(l => (
                                <span key={l} className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono text-[10px]">{l}</span>
                              ))}
                            </div>
                          </div>

                          {/* Historial por día */}
                          {b.historial.length > 0 && (
                            <div>
                              <p className="text-slate-500 text-xs mb-2">Historial diario</p>
                              <div className="overflow-x-auto">
                                <table className="text-xs w-full">
                                  <thead>
                                    <tr className="text-slate-500 border-b border-slate-800">
                                      <th className="text-left py-1 pr-3">Fecha</th>
                                      {tieneCondutor && <th className="text-left py-1 pr-3">Conductor</th>}
                                      <th className="text-left py-1 pr-3">Líneas</th>
                                      <th className="text-right py-1 pr-3">OTP%</th>
                                      <th className="text-right py-1 pr-3">Vel.</th>
                                      <th className="text-right py-1">Desvío</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...b.historial].reverse().map(h => {
                                      const hotp = Math.round(h.pctEnTiempo);
                                      return (
                                        <tr key={h.fecha} className="border-b border-slate-800/30">
                                          <td className="py-1 pr-3 text-slate-400">{fmtFecha(h.fecha)}</td>
                                          {tieneCondutor && (
                                            <td className="py-1 pr-3 text-slate-300">
                                              {h.nombre
                                                ? <span>{h.nombre} <span className="text-slate-500">Nº {h.interno}</span></span>
                                                : <span className="text-slate-600 italic">—</span>
                                              }
                                            </td>
                                          )}
                                          <td className="py-1 pr-3 text-slate-400">
                                            {(h.lineas ?? []).join(', ') || '—'}
                                          </td>
                                          <td className="py-1 pr-3 text-right">
                                            <span className={`font-bold ${OTP_COLOR(hotp)}`}>{hotp}%</span>
                                          </td>
                                          <td className="py-1 pr-3 text-right text-slate-300">
                                            {h.velocidadMedia > 0 ? `${h.velocidadMedia} km/h` : '—'}
                                          </td>
                                          <td className="py-1 text-right">
                                            <span className={h.desviacionMediaMin !== null && h.desviacionMediaMin > 1 ? 'text-red-400' : 'text-slate-300'}>
                                              {fmtDesvio(h.desviacionMediaMin)}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
