/**
 * FlotaInteligente — Perfil de flota por empresa del sistema metropolitano.
 * Fuente: vehicle_events + auto_stats (GPS real IMM, todas las empresas).
 * Muestra: coche, líneas operadas, OTP%, velocidad media, desvío promedio.
 */
import { useState, useEffect, useCallback, Fragment } from 'react';
import { Bus, RefreshCw, ChevronDown, TrendingUp, TrendingDown, Minus, Clock, Zap } from 'lucide-react';
import {
  fetchFleetRanking,
  VehicleSummary,
  AGENCY_LABELS,
} from '../../services/autoStatsService';

const EMPRESAS = [
  { id: '10', label: 'COETC',  color: 'indigo' },
  { id: '20', label: 'COME',   color: 'sky'    },
  { id: '50', label: 'CUTCSA', color: 'amber'  },
  { id: '70', label: 'UCOT',   color: 'emerald'},
];

const DIAS_OPTS = [7, 14, 30];

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
  const sign = min > 0 ? '+' : '';
  return `${sign}${min.toFixed(1)} min`;
};

const fmtVel = (v: number) => `${Math.round(v)} km/h`;

const fmtFecha = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit' });
};

export default function FlotaInteligente() {
  const [empresa, setEmpresa] = useState<string>('70');
  const [dias, setDias]       = useState<number>(7);
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [total, setTotal]     = useState(0);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFleetRanking(empresa, dias);
      if (res.ok) {
        setVehicles(res.vehicles ?? []);
        setTotal(res.totalVehiculos ?? 0);
      } else {
        setError('Sin datos disponibles para este período.');
      }
    } catch {
      setError('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }, [empresa, dias]);

  useEffect(() => { void cargar(); }, [cargar]);

  const cfg = EMPRESAS.find(e => e.id === empresa) ?? EMPRESAS[3];

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-3">
            <Bus className="w-6 h-6 text-blue-400" />
            Inteligencia de Flota
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Historial real de coches por línea, OTP y velocidad — COETC, COME, CUTCSA, UCOT
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
                empresa === e.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>

        {/* Selector días */}
        <div className="relative">
          <select
            value={dias}
            onChange={e => setDias(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-xl pl-4 pr-8 py-2 text-sm text-white focus:outline-none appearance-none"
          >
            {DIAS_OPTS.map(d => (
              <option key={d} value={d}>Últimos {d} días</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <span className="self-center text-xs text-slate-500">
          {total} coches registrados · {AGENCY_LABELS[empresa] ?? empresa}
        </span>
      </div>

      {/* Estado vacío / error */}
      {error && (
        <div className="bg-red-500/10 border border-red-700/40 rounded-xl p-4 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
          <span className="text-slate-400">Cargando flota {cfg.label}…</span>
        </div>
      ) : vehicles.length === 0 && !error ? (
        <div className="text-center py-20 text-slate-500">
          <Bus className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Sin actividad de flota en los últimos {dias} días para {cfg.label}.</p>
          <p className="text-xs mt-1">Los datos se acumulan a medida que el sistema recopila GPS de IMM.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60">
                <th className="text-left px-4 py-3 text-slate-400 font-medium w-24">Coche</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Líneas</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium w-24">OTP%</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium w-28">Vel. media</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium w-32">Desvío prom.</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium w-28">Último serv.</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map(v => {
                const otp = Math.round(v.pctEnTiempo);
                const isOpen = expandido === v.idBus;
                return (
                  <Fragment key={v.idBus}>
                    <tr
                      onClick={() => setExpandido(isOpen ? null : v.idBus)}
                      className={`border-b border-slate-800/40 hover:bg-slate-900/40 transition-colors cursor-pointer ${isOpen ? 'bg-slate-900/30' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-white font-bold">{v.idBus}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(v.lineasOperadas ?? []).slice(0, 5).map(l => (
                            <span key={l} className="inline-block bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                              {l}
                            </span>
                          ))}
                          {(v.lineasOperadas ?? []).length > 5 && (
                            <span className="text-slate-500 text-[10px] self-center">
                              +{v.lineasOperadas.length - 5}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {v.pctSinHorario > 80 ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-slate-700/60 text-slate-500"
                            title="Sin referencia horaria GTFS para calcular OTP">
                            Sin ref.
                          </span>
                        ) : (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${OTP_BG(otp)} ${OTP_COLOR(otp)}`}>
                            {otp}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="flex items-center justify-end gap-1 text-slate-300">
                          <Zap className="w-3 h-3 text-yellow-400" />
                          {fmtVel(v.velocidadMedia)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="flex items-center justify-end gap-1">
                          <DesvioIcon min={v.desviacionMediaMin} />
                          <span className={v.desviacionMediaMin !== null && v.desviacionMediaMin > 1 ? 'text-red-400' : 'text-slate-300'}>
                            {fmtDesvio(v.desviacionMediaMin)}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="flex items-center justify-end gap-1 text-slate-400 text-xs">
                          <Clock className="w-3 h-3" />
                          {fmtFecha(v.ultimaActividad)}
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-slate-800/40 bg-slate-900/20">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                            <div>
                              <p className="text-slate-500 mb-1">En tiempo</p>
                              <p className="text-emerald-400 font-semibold">{Math.round(v.pctEnTiempo)}%</p>
                            </div>
                            <div>
                              <p className="text-slate-500 mb-1">Atrasado</p>
                              <p className="text-red-400 font-semibold">{Math.round(v.pctAtrasado)}%</p>
                            </div>
                            <div>
                              <p className="text-slate-500 mb-1">Adelantado</p>
                              <p className="text-blue-400 font-semibold">{Math.round(v.pctAdelantado)}%</p>
                            </div>
                            <div>
                              <p className="text-slate-500 mb-1">Sin horario</p>
                              <p className="text-slate-400 font-semibold">{Math.round(v.pctSinHorario)}%</p>
                            </div>
                            <div>
                              <p className="text-slate-500 mb-1">Eventos GPS</p>
                              <p className="text-white font-semibold">{v.totalEventos.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 mb-1">Primera actividad</p>
                              <p className="text-slate-300">{fmtFecha(v.primeraActividad)}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-slate-500 mb-1">Todas las líneas operadas</p>
                              <div className="flex flex-wrap gap-1">
                                {(v.lineasOperadas ?? []).map(l => (
                                  <span key={l} className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                                    {l}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
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
