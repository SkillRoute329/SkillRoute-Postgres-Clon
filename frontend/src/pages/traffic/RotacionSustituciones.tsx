/**
 * RotacionSustituciones — Distribución de servicios por coche + detección
 * de sustituciones (FASE 5.17). UCOT-first.
 *
 *  • Distribución: qué servicios suele realizar un coche y cómo le va
 *    (desvío medio vs IMM del motor de cumplimiento) — del historial.
 *  • Sustituciones: qué coche tenía servicio asignado y NO salió, y qué
 *    coche (no asignado a esa línea) operó en su lugar.
 */
import { useState, useCallback } from 'react';
import { Search, RefreshCw, AlertTriangle, Repeat, Bus, TrendingUp } from 'lucide-react';
import {
  getDistribucionCoche,
  getSustituciones,
  type DistribucionResultado,
  type SustitucionesResultado,
} from '../../services/comparacionServicioService';

const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' });

function desvColor(v: number | string | null): string {
  if (v == null) return 'text-slate-500';
  const n = Number(v);
  if (Math.abs(n) <= 4) return 'text-emerald-400';
  if (Math.abs(n) <= 10) return 'text-amber-400';
  return 'text-red-400';
}

export default function RotacionSustituciones() {
  const [coche, setCoche] = useState('');
  const [fecha, setFecha] = useState(HOY);
  const [dist, setDist] = useState<DistribucionResultado | null>(null);
  const [sust, setSust] = useState<SustitucionesResultado | null>(null);
  const [loadingD, setLoadingD] = useState(false);
  const [loadingS, setLoadingS] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const buscarDist = useCallback(async () => {
    if (!coche.trim()) return;
    setLoadingD(true);
    setErr(null);
    try {
      setDist(await getDistribucionCoche(coche.trim(), '70'));
    } catch (e) {
      setErr(`Distribución: ${e instanceof Error ? e.message : String(e)}`);
      setDist(null);
    } finally {
      setLoadingD(false);
    }
  }, [coche]);

  const buscarSust = useCallback(async () => {
    setLoadingS(true);
    setErr(null);
    try {
      setSust(await getSustituciones(fecha, '70'));
    } catch (e) {
      setErr(`Sustituciones: ${e instanceof Error ? e.message : String(e)}`);
      setSust(null);
    } finally {
      setLoadingS(false);
    }
  }, [fecha]);

  return (
    <div className="p-6 max-w-[1300px] mx-auto space-y-8">
      {err && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {err}
        </div>
      )}

      {/* ── Distribución por coche ─────────────────────────────── */}
      <section>
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          Distribución de servicios por coche
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Qué servicios suele realizar el coche y cómo le va (desvío medio vs IMM). El historial se
          acumula a diario.
        </p>
        <div className="flex items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-widest mb-1">Coche</label>
            <input
              value={coche}
              onChange={(e) => setCoche(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarDist()}
              placeholder="ej. 102"
              className="w-28 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
            />
          </div>
          <button
            onClick={buscarDist}
            disabled={loadingD || !coche.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-md"
          >
            {loadingD ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Ver distribución
          </button>
        </div>
        {dist && (
          <div className="border border-slate-800 rounded-lg overflow-x-auto">
            <div className="px-4 py-2 text-xs text-slate-400 bg-slate-900 border-b border-slate-800">
              Coche <span className="text-white font-semibold">{dist.coche}</span> —{' '}
              {dist.serviciosDistintos} servicio(s) distinto(s) en el historial
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-900/60 text-slate-500 text-[10px] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Servicio</th>
                  <th className="px-3 py-2 text-left">Línea</th>
                  <th className="px-3 py-2 text-left">Tipo día</th>
                  <th className="px-3 py-2 text-center">Veces</th>
                  <th className="px-3 py-2 text-center">Primera</th>
                  <th className="px-3 py-2 text-center">Última</th>
                  <th className="px-3 py-2 text-center">Desvío medio vs IMM</th>
                </tr>
              </thead>
              <tbody>
                {dist.servicios.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                      Sin historial aún para este coche (se acumula a diario).
                    </td>
                  </tr>
                )}
                {dist.servicios.map((s, i) => (
                  <tr key={s.servicio + i} className={i % 2 ? 'bg-slate-900/40' : 'bg-slate-900/20'}>
                    <td className="px-3 py-2 font-mono text-violet-200">{s.servicio}</td>
                    <td className="px-3 py-2 text-slate-300">{s.linea ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-400">{s.tipo_dia ?? '—'}</td>
                    <td className="px-3 py-2 text-center text-slate-200">{s.veces}</td>
                    <td className="px-3 py-2 text-center text-slate-500 text-xs">
                      {String(s.primera_fecha).slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500 text-xs">
                      {String(s.ultima_fecha).slice(0, 10)}
                    </td>
                    <td className={`px-3 py-2 text-center font-mono font-semibold ${desvColor(s.desvio_medio_vs_imm_min)}`}>
                      {s.desvio_medio_vs_imm_min == null ? '—' : `${s.desvio_medio_vs_imm_min} min`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Sustituciones ──────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
          <Repeat className="w-5 h-5 text-orange-400" />
          Detección de sustituciones
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Coches con servicio asignado que NO salieron, y qué coche (no asignado a esa línea) operó
          en su lugar.
        </p>
        <div className="flex items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-widest mb-1">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
            />
          </div>
          <button
            onClick={buscarSust}
            disabled={loadingS}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-semibold rounded-md"
          >
            {loadingS ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Analizar día
          </button>
        </div>
        {sust && (
          <div className="border border-slate-800 rounded-lg overflow-x-auto">
            <div className="px-4 py-2 text-xs text-slate-400 bg-slate-900 border-b border-slate-800 flex gap-4">
              <span>
                Esperados: <span className="text-white font-semibold">{sust.esperados}</span>
              </span>
              <span>
                No salieron:{' '}
                <span className={`font-semibold ${sust.noSalieron ? 'text-red-400' : 'text-emerald-400'}`}>
                  {sust.noSalieron}
                </span>
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-900/60 text-slate-500 text-[10px] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Coche que no salió</th>
                  <th className="px-3 py-2 text-left">Servicio asignado</th>
                  <th className="px-3 py-2 text-left">Línea</th>
                  <th className="px-3 py-2 text-center">Pts GPS</th>
                  <th className="px-3 py-2 text-left">Posibles sustitutos</th>
                </tr>
              </thead>
              <tbody>
                {sust.detalle.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-emerald-400">
                      Sin sustituciones detectadas: todos los coches asignados operaron.
                    </td>
                  </tr>
                )}
                {sust.detalle.map((d, i) => (
                  <tr key={d.coche + i} className={i % 2 ? 'bg-slate-900/40' : 'bg-slate-900/20'}>
                    <td className="px-3 py-2 font-semibold text-red-300 flex items-center gap-1.5">
                      <Bus className="w-3.5 h-3.5" />
                      {d.coche}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-300">{d.servicioAsignado ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-300">{d.linea ?? '—'}</td>
                    <td className="px-3 py-2 text-center text-slate-500">{d.ptsGps}</td>
                    <td className="px-3 py-2">
                      {d.posiblesSustitutos.length ? (
                        <span className="text-amber-300 font-mono">
                          {d.posiblesSustitutos.join(', ')}
                        </span>
                      ) : (
                        <span className="text-slate-600">sin candidato claro</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
