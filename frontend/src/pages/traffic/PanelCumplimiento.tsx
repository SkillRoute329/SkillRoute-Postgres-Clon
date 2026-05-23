/**
 * PanelCumplimiento — CENTRO DE COMANDO (FASE 5.17).
 *
 * Carga AUTOMÁTICAMENTE (sin que el usuario busque coche por coche) y
 * muestra TODA la flota con problemas de cumplimiento del día, ranqueada
 * por severidad: no salió, atrasado, sin cartón, baja cobertura. Click en
 * una fila → comparación detallada de ese coche.
 */
import { useState, useEffect, useCallback, Fragment } from 'react';
import { RefreshCw, AlertTriangle, Bus, GitCompare, ChevronDown, Clock } from 'lucide-react';
import {
  getPanelCumplimiento,
  getComparacionCoche,
  type PanelCumplimiento,
  type EstadoPanel,
  type ComparacionResultado,
} from '../../services/comparacionServicioService';
import CocheEventosModal from '../../components/CocheEventosModal';

const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' });

const COLOR: Record<EstadoPanel, string> = {
  NO_SALIO: 'text-red-300 bg-red-500/15 border-red-500/40',
  ATRASADO: 'text-red-400 bg-red-500/10 border-red-500/30',
  BAJA_COBERTURA: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  ADELANTADO: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  SIN_CARTON: 'text-slate-300 bg-slate-700/30 border-slate-600/40',
  OK: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
};

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2.5">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest">{label}</div>
      <div className={`text-2xl font-black ${tone}`}>{value}</div>
    </div>
  );
}

const TRAMO_COLOR: Record<string, string> = {
  EN_TIEMPO: 'text-emerald-400',
  ATRASADO: 'text-red-400',
  ADELANTADO: 'text-amber-300',
  SIN_GPS: 'text-slate-500',
  SIN_CARTON: 'text-slate-500',
};

function DetalleCoche({ d }: { d: ComparacionResultado }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
        <span>
          Servicio:{' '}
          <span className="text-violet-200 font-mono">{d.meta.serviceNumber ?? '—'}</span>
        </span>
        <span>
          Línea: <span className="text-white font-semibold">{d.meta.linea ?? '—'}</span>
        </span>
        <span>
          Tipo día: <span className="text-slate-200">{d.meta.tipoDia}</span>
        </span>
        <span>
          Cumpl. salida:{' '}
          <span className="text-white">
            {d.resumen.cumplimientoSalidaPct == null
              ? '—'
              : `${d.resumen.cumplimientoSalidaPct}%`}
          </span>
        </span>
        <span className="text-emerald-400">{d.resumen.enTiempo} en tiempo</span>
        <span className="text-red-400">{d.resumen.atrasado} atrasado</span>
        <span className="text-amber-300">{d.resumen.adelantado} adelantado</span>
        <span className="text-slate-500">{d.resumen.sinGps} sin GPS</span>
      </div>

      {d.capas.notas.length > 0 && (
        <ul className="text-[11px] text-slate-500 list-disc list-inside">
          {d.capas.notas.map((n, k) => (
            <li key={k}>{n}</li>
          ))}
        </ul>
      )}

      {d.filas.length === 0 ? (
        <p className="text-xs text-slate-500">
          Sin tramos comparables (falta cartón estructurado o GPS para este coche/fecha).
        </p>
      ) : (
        <div className="border border-slate-800 rounded-md overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-900 text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-2 py-1.5 text-left">V</th>
                <th className="px-2 py-1.5 text-left">Tramo</th>
                <th className="px-2 py-1.5 text-center">IMM</th>
                <th className="px-2 py-1.5 text-center">Cartón</th>
                <th className="px-2 py-1.5 text-center">Desv. vs IMM</th>
                <th className="px-2 py-1.5 text-left">Estado</th>
                <th className="px-2 py-1.5 text-left">Corrección</th>
              </tr>
            </thead>
            <tbody>
              {d.filas.map((f, k) => (
                <tr key={k} className={k % 2 ? 'bg-slate-900/40' : ''}>
                  <td className="px-2 py-1.5 text-slate-400">{f.vuelta}</td>
                  <td className="px-2 py-1.5 text-slate-300">
                    {f.origen} → {f.destino}
                  </td>
                  <td className="px-2 py-1.5 text-center font-mono text-slate-300">
                    {f.immSalida ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-center font-mono text-slate-300">
                    {f.cartonSalida ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-center font-mono text-slate-300">
                    {f.desvioMedioVsImmMin == null
                      ? '—'
                      : `${f.desvioMedioVsImmMin > 0 ? '+' : ''}${f.desvioMedioVsImmMin} min`}
                  </td>
                  <td className={`px-2 py-1.5 font-semibold ${TRAMO_COLOR[f.estado] ?? 'text-slate-400'}`}>
                    {f.estado}
                  </td>
                  <td className="px-2 py-1.5 text-slate-500">{f.correccion ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PanelCumplimiento() {
  const [fecha, setFecha] = useState(HOY);
  const [data, setData] = useState<PanelCumplimiento | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [detData, setDetData] = useState<ComparacionResultado | null>(null);
  const [detLoading, setDetLoading] = useState(false);
  const [detErr, setDetErr] = useState<string | null>(null);
  // FASE 5.38 (2026-05-22): modal con eventos individuales del coche (cada
  // atraso con fecha, hora, línea, parada y desviación reales).
  const [cocheEventosModal, setCocheEventosModal] = useState<string | null>(null);

  const abrirDetalle = useCallback(
    async (coche: string, f: string) => {
      if (detalle === coche) {
        setDetalle(null);
        setDetData(null);
        return;
      }
      setDetalle(coche);
      setDetData(null);
      setDetErr(null);
      setDetLoading(true);
      try {
        setDetData(await getComparacionCoche(coche, f, '70'));
      } catch (e) {
        setDetErr(e instanceof Error ? e.message : String(e));
      } finally {
        setDetLoading(false);
      }
    },
    [detalle],
  );

  const cargar = useCallback(async (f: string) => {
    setLoading(true);
    setErr(null);
    try {
      setData(await getPanelCumplimiento(f, '70'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga AUTOMÁTICA al abrir (no requiere que el usuario busque).
  useEffect(() => {
    void cargar(fecha);
  }, [fecha, cargar]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Panel de Cumplimiento — Flota UCOT
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Todo lo que tiene problemas hoy, ranqueado. Política OTP{' '}
            <span className="text-slate-300">{data?.politicaOtp ?? '±4 min (IMM)'}</span>. No hay que
            buscar coche por coche.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
          />
          <button
            onClick={() => cargar(fecha)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-semibold rounded-md"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {err}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
          Escaneando toda la flota…
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-3 md:grid-cols-7 gap-3 mb-5">
            <Kpi label="Flota c/datos" value={data.resumen.flotaConDatos} tone="text-white" />
            <Kpi label="Con problemas" value={data.resumen.conProblemas} tone="text-amber-400" />
            <Kpi label="No salieron" value={data.resumen.noSalieron} tone="text-red-300" />
            <Kpi label="Atrasados" value={data.resumen.atrasados} tone="text-red-400" />
            <Kpi label="Adelantados" value={data.resumen.adelantados} tone="text-amber-300" />
            <Kpi label="Sin cartón" value={data.resumen.sinCarton} tone="text-slate-300" />
            <Kpi label="Baja cobertura" value={data.resumen.bajaCobertura} tone="text-amber-400" />
          </div>

          <div className="border border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2.5 text-left">Estado</th>
                  <th className="px-3 py-2.5 text-left">Coche</th>
                  <th className="px-3 py-2.5 text-left">Servicio</th>
                  <th className="px-3 py-2.5 text-left">Líneas</th>
                  <th className="px-3 py-2.5 text-center">Desvío vs IMM</th>
                  <th className="px-3 py-2.5 text-center">% En tiempo</th>
                  <th className="px-3 py-2.5 text-center">Cobertura</th>
                  <th className="px-3 py-2.5 text-center">Eventos GPS</th>
                  <th className="px-3 py-2.5 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {data.problemas.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-emerald-400">
                      Sin problemas detectados en la flota para esta fecha.
                    </td>
                  </tr>
                )}
                {data.problemas.map((p, i) => (
                  <Fragment key={p.coche + i}>
                  <tr className={i % 2 ? 'bg-slate-900/40' : 'bg-slate-900/20'}>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${COLOR[p.estado]}`}>
                        {p.estado}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-white flex items-center gap-1.5">
                      <Bus className="w-3.5 h-3.5 text-slate-500" />
                      {p.coche}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-violet-200">{p.servicioAsignado ?? '—'}</td>
                    <td className="px-3 py-2.5 text-slate-300">
                      {p.lineaAsignada ? (
                        <span className="font-semibold text-white">{p.lineaAsignada}</span>
                      ) : (
                        <span className="text-slate-500">sin asignar</span>
                      )}
                      {p.lineasObservadas.length > 0 &&
                        !(
                          p.lineasObservadas.length === 1 &&
                          p.lineasObservadas[0] === p.lineaAsignada
                        ) && (
                          <span className="block text-[10px] text-slate-500 mt-0.5">
                            GPS: {p.lineasObservadas.join(', ')}
                          </span>
                        )}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-center font-mono font-semibold ${
                        p.desvioMedioVsImmMin == null
                          ? 'text-slate-600'
                          : Math.abs(p.desvioMedioVsImmMin) <= 4
                            ? 'text-emerald-400'
                            : 'text-red-400'
                      }`}
                    >
                      {p.desvioMedioVsImmMin == null
                        ? '—'
                        : `${p.desvioMedioVsImmMin > 0 ? '+' : ''}${p.desvioMedioVsImmMin} min`}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-300">
                      {p.pctEnTiempo == null ? '—' : `${p.pctEnTiempo}%`}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-center ${p.coberturaPct < 40 ? 'text-amber-400' : 'text-slate-400'}`}
                    >
                      {p.coberturaPct}%
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-500">{p.eventosGps}</td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setCocheEventosModal(p.coche)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 font-bold"
                          title="Ver cada atraso individual: fecha, hora, línea, parada, desviación"
                        >
                          <Clock className="w-3 h-3" />
                          Ver atrasos
                        </button>
                        <button
                          onClick={() => abrirDetalle(p.coche, data.fecha)}
                          className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 text-xs"
                          title="Ver comparación por tramo (cartón vs GPS vs IMM)"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform ${detalle === p.coche ? 'rotate-180' : ''}`}
                          />
                          tramos
                        </button>
                      </div>
                    </td>
                  </tr>
                  {detalle === p.coche && (
                    <tr className="bg-slate-950/70">
                      <td colSpan={9} className="px-4 py-4">
                        {detLoading && (
                          <div className="flex items-center gap-2 text-slate-400 text-xs">
                            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                            Cargando comparación por tramo del coche {p.coche}…
                          </div>
                        )}
                        {detErr && (
                          <div className="text-red-400 text-xs flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            {detErr}
                          </div>
                        )}
                        {!detLoading && !detErr && detData && (
                          <DetalleCoche d={detData} />
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* FASE 5.38 (2026-05-22): modal con eventos individuales del coche. */}
      <CocheEventosModal
        idBus={cocheEventosModal}
        fecha={fecha}
        onClose={() => setCocheEventosModal(null)}
      />
    </div>
  );
}
