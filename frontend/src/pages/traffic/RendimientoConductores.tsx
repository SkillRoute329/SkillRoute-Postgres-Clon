/**
 * RendimientoConductores — Perfil de desempeño por conductor UCOT.
 * Fuente: conductor_stats (cruzado de distribuciones_diarias × vehicle_events).
 * Muestra: interno, nombre, días activos, OTP%, velocidad media, desvío promedio.
 */
import { useState, useEffect, useCallback, Fragment } from 'react';
import { Users, RefreshCw, ChevronDown, TrendingUp, TrendingDown, Minus, Clock, Zap, Calendar } from 'lucide-react';
import {
  fetchConductorRanking,
  ConductorSummary,
  AGENCY_LABELS,
} from '../../services/autoStatsService';

const EMPRESAS = [
  { id: '10', label: 'COETC' },
  { id: '20', label: 'COME' },
  { id: '50', label: 'CUTCSA' },
  { id: '70', label: 'UCOT' },
];

const OTP_COLOR = (pct: number) =>
  pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400';

const OTP_BG = (pct: number) =>
  pct >= 80 ? 'bg-emerald-500/10' : pct >= 60 ? 'bg-yellow-500/10' : 'bg-red-500/10';

const DesvioIcon = ({ min }: { min: number | null }) => {
  if (min === null) return <Minus className="w-3 h-3 text-slate-500" />;
  if (min > 1)      return <TrendingDown className="w-3 h-3 text-red-400" />;
  if (min < -1)     return <TrendingUp  className="w-3 h-3 text-emerald-400" />;
  return <Minus className="w-3 h-3 text-slate-400" />;
};

const fmtDesvio = (min: number | null) => {
  if (min === null) return '—';
  return `${min > 0 ? '+' : ''}${min.toFixed(1)} min`;
};

const fmtFecha = (iso: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
};

const fmtNombre = (nombre: string) => {
  if (!nombre) return '—';
  const partes = nombre.trim().split(/\s+/);
  if (partes.length <= 2) return nombre;
  return `${partes[0]} ${partes[partes.length - 1]}`;
};

export default function RendimientoConductores() {
  const [empresa, setEmpresa]   = useState<string>('70');
  const [loading, setLoading]   = useState(false);
  const [conductores, setConductores] = useState<ConductorSummary[]>([]);
  const [total, setTotal]       = useState(0);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchConductorRanking(empresa);
      if (res.ok) {
        setConductores(res.conductores ?? []);
        setTotal(res.totalConductores ?? 0);
      } else {
        setError('Sin datos de conductores disponibles.');
      }
    } catch {
      setError('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }, [empresa]);

  useEffect(() => { void cargar(); }, [cargar]);

  const label = AGENCY_LABELS[empresa] ?? empresa;

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-400" />
            Rendimiento de Conductores
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            OTP real por conductor — cruzado de planillas de distribución × GPS IMM
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

      {/* Filtro empresa */}
      <div className="flex flex-wrap gap-3 mb-6">
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
        <span className="self-center text-xs text-slate-500">
          {total} conductores con datos GPS · {label}
        </span>
      </div>

      {/* Aviso fuente */}
      {total === 0 && !loading && !error && (
        <div className="bg-blue-500/10 border border-blue-700/40 rounded-xl p-4 text-blue-300 text-sm mb-4">
          <p className="font-semibold mb-1">Datos acumulados por día</p>
          <p>
            El sistema cruza las planillas de distribución con el GPS en tiempo real.
            Los datos se generan automáticamente cada noche a las 23:30 para los conductores
            que operaron ese día. Los primeros registros aparecen al día siguiente de la primera operación.
          </p>
        </div>
      )}

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
          <span className="text-slate-400">Cargando conductores {label}…</span>
        </div>
      ) : conductores.length === 0 && !error ? (
        <div className="text-center py-20 text-slate-500">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Sin datos de conductores para {label}.</p>
          <p className="text-xs mt-1">
            El sistema acumula datos cada noche al cruzar distribuciones con GPS.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60">
                <th className="text-left px-4 py-3 text-slate-400 font-medium w-16">Int.</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Conductor</th>
                <th className="text-right px-3 py-3 text-slate-400 font-medium w-16">Días</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium w-24">OTP%</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium w-28">Vel. media</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium w-32">Desvío prom.</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium w-28">Última act.</th>
              </tr>
            </thead>
            <tbody>
              {conductores.map(c => {
                const otp    = Math.round(c.pctEnTiempo);
                const isOpen = expandido === c.interno;
                return (
                  <Fragment key={c.interno}>
                    <tr
                      onClick={() => setExpandido(isOpen ? null : c.interno)}
                      className={`border-b border-slate-800/40 hover:bg-slate-900/40 transition-colors cursor-pointer ${isOpen ? 'bg-slate-900/30' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-slate-400 text-xs">{c.interno}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-white font-medium">{fmtNombre(c.nombre)}</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="flex items-center justify-end gap-1 text-slate-300 text-xs">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          {c.diasActivos}
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
                          {c.velocidadMedia > 0 ? `${Math.round(c.velocidadMedia)} km/h` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="flex items-center justify-end gap-1">
                          <DesvioIcon min={c.desviacionMediaMin} />
                          <span className={c.desviacionMediaMin !== null && c.desviacionMediaMin > 1 ? 'text-red-400' : 'text-slate-300'}>
                            {fmtDesvio(c.desviacionMediaMin)}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="flex items-center justify-end gap-1 text-slate-400 text-xs">
                          <Clock className="w-3 h-3" />
                          {fmtFecha(c.ultimaActividad)}
                        </span>
                      </td>
                    </tr>

                    {/* Fila expandida: historial por día */}
                    {isOpen && (
                      <tr className="border-b border-slate-800/40 bg-slate-900/20">
                        <td colSpan={7} className="px-6 py-4">
                          {/* Estadísticas agregadas */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs mb-4">
                            <div>
                              <p className="text-slate-500 mb-1">En tiempo</p>
                              <p className="text-emerald-400 font-semibold">{Math.round(c.pctEnTiempo)}%</p>
                            </div>
                            <div>
                              <p className="text-slate-500 mb-1">Atrasado</p>
                              <p className="text-red-400 font-semibold">{Math.round(c.pctAtrasado)}%</p>
                            </div>
                            <div>
                              <p className="text-slate-500 mb-1">Adelantado</p>
                              <p className="text-blue-400 font-semibold">{Math.round(c.pctAdelantado)}%</p>
                            </div>
                            <div>
                              <p className="text-slate-500 mb-1">Eventos GPS</p>
                              <p className="text-white font-semibold">{c.totalEventos.toLocaleString()}</p>
                            </div>
                          </div>

                          {/* Coches y líneas */}
                          <div className="grid grid-cols-2 gap-4 text-xs mb-4">
                            <div>
                              <p className="text-slate-500 mb-1">Coches operados</p>
                              <div className="flex flex-wrap gap-1">
                                {c.cochesOperados.map(co => (
                                  <span key={co} className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono text-[10px]">{co}</span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-slate-500 mb-1">Líneas operadas</p>
                              <div className="flex flex-wrap gap-1">
                                {c.lineasOperadas.map(l => (
                                  <span key={l} className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono text-[10px]">{l}</span>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Historial por día */}
                          {c.historial.length > 0 && (
                            <div>
                              <p className="text-slate-500 text-xs mb-2">Historial por día</p>
                              <div className="overflow-x-auto">
                                <table className="text-xs w-full">
                                  <thead>
                                    <tr className="text-slate-500 border-b border-slate-800">
                                      <th className="text-left py-1 pr-4">Fecha</th>
                                      <th className="text-left py-1 pr-4">Coche</th>
                                      <th className="text-left py-1 pr-4">Turno</th>
                                      <th className="text-right py-1 pr-4">OTP%</th>
                                      <th className="text-right py-1 pr-4">Vel.</th>
                                      <th className="text-right py-1">Desvío</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...c.historial].reverse().map(h => {
                                      const hotp = Math.round(h.pctEnTiempo);
                                      return (
                                        <tr key={h.fecha} className="border-b border-slate-800/30">
                                          <td className="py-1 pr-4 text-slate-400">{fmtFecha(h.fecha)}</td>
                                          <td className="py-1 pr-4 font-mono text-slate-300">{h.coche}</td>
                                          <td className="py-1 pr-4 text-slate-400">{h.turno ?? '—'}</td>
                                          <td className="py-1 pr-4 text-right">
                                            <span className={`font-bold ${OTP_COLOR(hotp)}`}>{hotp}%</span>
                                          </td>
                                          <td className="py-1 pr-4 text-right text-slate-300">
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
