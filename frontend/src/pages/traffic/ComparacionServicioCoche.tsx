/**
 * ComparacionServicioCoche — Vista de 3 columnas por tramo (FASE 5.17).
 *
 * Para un coche UCOT: IMM oficial · Servicio UCOT (cartón estructurado) ·
 * GPS real. Resuelve coche → nº de servicio (rotación scrapeada) → horarios
 * del documento, los cruza con las pasadas GPS y marca dónde están las
 * diferencias y qué correcciones realizar. UCOT-first.
 */
import { useState, useCallback } from 'react';
import { Search, RefreshCw, AlertTriangle, CheckCircle2, Clock, MapPin, Bus } from 'lucide-react';
import {
  getComparacionCoche,
  type ComparacionResultado,
  type FilaTramo,
  type EstadoTramo,
} from '../../services/comparacionServicioService';

const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' }); // YYYY-MM-DD

const COLOR: Record<EstadoTramo, string> = {
  EN_TIEMPO: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  ATRASADO: 'text-red-400 bg-red-500/10 border-red-500/30',
  ADELANTADO: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  SIN_GPS: 'text-slate-400 bg-slate-700/30 border-slate-600/40',
  SIN_CARTON: 'text-slate-400 bg-slate-700/30 border-slate-600/40',
};

function signo(n: number | null): string {
  if (n == null) return '—';
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : `${n}`;
}

function Diff({ min, invertColor }: { min: number | null; invertColor?: boolean }) {
  if (min == null) return <span className="text-slate-600">—</span>;
  const fuera = Math.abs(min) > 4;
  const cls = !fuera
    ? 'text-emerald-400'
    : (min > 0) !== !!invertColor
      ? 'text-red-400'
      : 'text-amber-400';
  return <span className={`font-mono font-semibold ${cls}`}>{signo(min)} min</span>;
}

export default function ComparacionServicioCoche() {
  const [coche, setCoche] = useState('');
  const [fecha, setFecha] = useState(HOY);
  const [data, setData] = useState<ComparacionResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    if (!coche.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getComparacionCoche(coche.trim(), fecha, '70');
      setData(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`No se pudo obtener la comparación: ${msg}`);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [coche, fecha]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Bus className="w-5 h-5 text-blue-400" />
          Comparación por tramo — Coche UCOT
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          IMM oficial · Servicio UCOT (cartón) · GPS real. El coche resuelve su nº de servicio por
          la rotación scrapeada; los horarios salen del documento de minutas.
        </p>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-end gap-3 mb-6 bg-slate-900/60 border border-slate-800 rounded-lg p-4">
        <div>
          <label className="block text-xs text-slate-500 uppercase tracking-widest mb-1">Coche</label>
          <input
            value={coche}
            onChange={(e) => setCoche(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="ej. 30"
            className="w-28 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
          />
        </div>
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
          onClick={buscar}
          disabled={loading || !coche.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-md transition-colors"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {loading ? 'Cruzando…' : 'Comparar'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Meta + resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
            <Kpi label="Servicio" value={data.meta.serviceNumber ?? '—'} sub={`Línea ${data.meta.linea ?? '?'}`} />
            <Kpi label="Tipo día" value={data.meta.tipoDia} />
            <Kpi label="Tramos" value={String(data.resumen.tramos)} />
            <Kpi label="En tiempo" value={String(data.resumen.enTiempo)} tone="ok" />
            <Kpi label="Atrasado" value={String(data.resumen.atrasado)} tone="bad" />
            <Kpi label="Adelantado" value={String(data.resumen.adelantado)} tone="warn" />
            <Kpi
              label="Cumpl. salida"
              value={data.resumen.cumplimientoSalidaPct != null ? `${data.resumen.cumplimientoSalidaPct}%` : '—'}
              tone={
                data.resumen.cumplimientoSalidaPct == null
                  ? undefined
                  : data.resumen.cumplimientoSalidaPct >= 80
                    ? 'ok'
                    : data.resumen.cumplimientoSalidaPct >= 50
                      ? 'warn'
                      : 'bad'
              }
            />
          </div>

          {data.meta.instruccionSalida && (
            <div className="text-xs text-slate-400 mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-300 font-medium">Instrucción cartón:</span>{' '}
              {data.meta.instruccionSalida}
            </div>
          )}

          {data.capas.notas.length > 0 && (
            <div className="text-xs text-amber-400/90 bg-amber-500/5 border border-amber-500/20 rounded-md px-3 py-2 mb-4 space-y-1">
              {data.capas.notas.map((n, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{n}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tabla 3 columnas por tramo */}
          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-3 py-3 text-left font-semibold">Tramo</th>
                  <th className="px-3 py-3 text-center font-semibold bg-sky-500/5 text-sky-300">IMM oficial</th>
                  <th className="px-3 py-3 text-center font-semibold bg-violet-500/5 text-violet-300" colSpan={3}>
                    Servicio UCOT (cartón)
                  </th>
                  <th className="px-3 py-3 text-center font-semibold bg-emerald-500/5 text-emerald-300" colSpan={3}>
                    GPS real (vs IMM)
                  </th>
                  <th className="px-3 py-3 text-center font-semibold">Δ Cartón/IMM</th>
                  <th className="px-3 py-3 text-center font-semibold">Δ GPS/Cartón</th>
                  <th className="px-3 py-3 text-left font-semibold">Estado / Corrección</th>
                </tr>
                <tr className="bg-slate-900/60 text-slate-500 text-[10px] uppercase">
                  <th className="px-3 py-1.5 text-left">origen → destino</th>
                  <th className="px-3 py-1.5 text-center bg-sky-500/5">salida</th>
                  <th className="px-3 py-1.5 text-center bg-violet-500/5">salida</th>
                  <th className="px-3 py-1.5 text-center bg-violet-500/5">llegada</th>
                  <th className="px-3 py-1.5 text-center bg-violet-500/5">espera</th>
                  <th className="px-3 py-1.5 text-center bg-emerald-500/5">desv. salida</th>
                  <th className="px-3 py-1.5 text-center bg-emerald-500/5">desv. medio</th>
                  <th className="px-3 py-1.5 text-center bg-emerald-500/5">pts</th>
                  <th className="px-3 py-1.5"></th>
                  <th className="px-3 py-1.5"></th>
                  <th className="px-3 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {data.filas.map((f: FilaTramo, idx) => (
                  <tr
                    key={`${f.vuelta}-${f.tramoEnVuelta}-${idx}`}
                    className={idx % 2 === 0 ? 'bg-slate-900/20' : 'bg-slate-900/40'}
                  >
                    <td className="px-3 py-2.5 text-slate-200">
                      <div className="font-medium flex items-center gap-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400">
                          V{f.vuelta}.{f.tramoEnVuelta}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-600" />
                        {f.origen} → {f.destino}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-sky-300 bg-sky-500/[0.03]">
                      {f.immSalida ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-violet-200 bg-violet-500/[0.03]">
                      {f.cartonSalida ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-violet-200/80 bg-violet-500/[0.03]">
                      {f.cartonLlegada ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-400 bg-violet-500/[0.03]">
                      {f.esperaProgMin != null ? `${f.esperaProgMin}'` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center bg-emerald-500/[0.03]">
                      <Diff min={f.desvioInicioVsImmMin} />
                    </td>
                    <td className="px-3 py-2.5 text-center bg-emerald-500/[0.03]">
                      <Diff min={f.desvioMedioVsImmMin} />
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-500 bg-emerald-500/[0.03]">
                      {f.puntosGps}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Diff min={f.difCartonVsImmMin} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Diff min={f.difGpsVsCartonMin} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border ${COLOR[f.estado]}`}
                      >
                        {f.estado === 'EN_TIEMPO' && <CheckCircle2 className="w-3 h-3" />}
                        {(f.estado === 'ATRASADO' || f.estado === 'ADELANTADO') && (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                        {f.estado}
                      </span>
                      {f.correccion && (
                        <div className="text-xs text-slate-400 mt-1.5 max-w-md leading-snug">{f.correccion}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-600 mt-3 leading-relaxed">
            Δ Cartón/IMM = compromiso del operador vs regulador. Δ GPS/Cartón = operación real vs servicio
            comprometido (derivado del desvío vs IMM ya validado por el motor de cumplimiento; tolerancia
            ±4 min). La precisión etapa-a-etapa requiere un gazetteer etapa-UCOT→geo (pendiente).
          </p>
        </>
      )}

      {!data && !loading && !error && (
        <div className="text-center text-slate-500 py-20 text-sm">
          Ingresá un número de coche UCOT y la fecha para ver la comparación de 3 columnas.
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'ok' | 'bad' | 'warn';
}) {
  const toneCls =
    tone === 'ok'
      ? 'text-emerald-400'
      : tone === 'bad'
        ? 'text-red-400'
        : tone === 'warn'
          ? 'text-amber-400'
          : 'text-white';
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2.5">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest">{label}</div>
      <div className={`text-lg font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
