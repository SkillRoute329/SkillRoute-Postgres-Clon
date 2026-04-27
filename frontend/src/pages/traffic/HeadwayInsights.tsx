/**
 * HeadwayInsights — Bunching/Gapping single-op + HRR cross-op
 * ==============================================================
 * Sprint 2 entrega 2.1 del roadmap international-grade.
 *
 * Diferenciador clave: combina paridad con Swiftly Headway Insights
 * (tab Single-Op) + HRR cross-op único en el mercado mundial (tab
 * Cross-Op). Ningún competidor mundial ofrece la combinación.
 *
 * Bajo Regla §12: muestra explícitamente cuando una línea NO es
 * medible por falta de horarios_stm, en lugar de devolver 0%
 * engañoso.
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  GitMerge,
  Info,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useEmpresaPropia, EMPRESAS_OPCIONES } from '../../hooks/useEmpresaPropia';
import {
  calcularHeadwaySingleOp,
  calcularHRRCrossOp,
  type HeadwayLineaResumen,
  type HRRCrossOp,
  type EmpresaName,
} from '../../services/headwayInsightsService';

type Tab = 'single' | 'cross' | 'historico';

const ESTADO_BADGE: Record<string, { color: string; label: string }> = {
  BUNCHING: { color: 'bg-rose-500/15 text-rose-300 border-rose-400/40', label: 'Bunching' },
  NORMAL: { color: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40', label: 'Normal' },
  GAPPING: { color: 'bg-amber-500/15 text-amber-300 border-amber-400/40', label: 'Gapping' },
  NO_MEDIBLE: { color: 'bg-slate-700/40 text-slate-400 border-slate-600/40', label: 'No medible' },
  CRITICO: { color: 'bg-rose-500/15 text-rose-300 border-rose-400/40', label: 'Crítico' },
  PRECAUCION: { color: 'bg-amber-500/15 text-amber-300 border-amber-400/40', label: 'Precaución' },
  OK: { color: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40', label: 'OK' },
};

function Badge({ estado }: { estado: string }) {
  const cfg = ESTADO_BADGE[estado] || {
    color: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
    label: estado,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}
    >
      {cfg.label}
    </span>
  );
}

export default function HeadwayInsights() {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const [tab, setTab] = useState<Tab>('single');
  const [single, setSingle] = useState<HeadwayLineaResumen[] | null>(null);
  const [cross, setCross] = useState<HRRCrossOp[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const empresaName = empresaCfg.label as EmpresaName;

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c] = await Promise.all([
        calcularHeadwaySingleOp(empresaName),
        calcularHRRCrossOp(empresaName),
      ]);
      setSingle(s);
      setCross(c);
      setLastUpdate(new Date());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [empresaName]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60000); // refresh cada 60s
    return () => clearInterval(t);
  }, [cargar]);

  const resumenSingle = useMemo(() => {
    if (!single) return null;
    const totalPares = single.reduce((s, l) => s + l.paresAnalizados, 0);
    if (totalPares === 0) {
      return { lineas: single.length, totalPares: 0, pctBunching: 0, pctNormal: 0, pctGapping: 0, pctNoMedible: 0 };
    }
    const sumW = (key: 'pctBunching' | 'pctNormal' | 'pctGapping' | 'pctNoMedible') =>
      Math.round(
        single.reduce((s, l) => s + (l[key] / 100) * l.paresAnalizados, 0) /
          totalPares *
          100,
      );
    return {
      lineas: single.length,
      totalPares,
      pctBunching: sumW('pctBunching'),
      pctNormal: sumW('pctNormal'),
      pctGapping: sumW('pctGapping'),
      pctNoMedible: sumW('pctNoMedible'),
    };
  }, [single]);

  const resumenCross = useMemo(() => {
    if (!cross) return null;
    const total = cross.length;
    const cnt = (e: string) => cross.filter((c) => c.estado === e).length;
    return {
      total,
      criticos: cnt('CRITICO'),
      precaucion: cnt('PRECAUCION'),
      ok: cnt('OK'),
      noMedibles: cnt('NO_MEDIBLE'),
    };
  }, [cross]);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight flex items-center gap-2">
            <GitMerge className="w-7 h-7 text-amber-400" />
            Análisis de Headway · {empresaCfg.label}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Bunching y gapping single-op (paridad con Swiftly) + HRR cross-op
            (único en el mercado mundial).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400" />
          <select
            value={empresaPropia}
            onChange={(e) => setEmpresaPropia(Number(e.target.value))}
            className="rounded-md border border-slate-700 bg-slate-900/60 text-sm px-3 py-2 text-white"
          >
            {EMPRESAS_OPCIONES.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.label}
              </option>
            ))}
          </select>
          <button
            onClick={cargar}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 hover:bg-slate-800 px-3 py-2 text-sm font-bold disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-400/40 bg-rose-950/30 p-4 text-sm text-rose-200">
          <div className="flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold">Error cargando datos</p>
              <p className="font-mono text-xs mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {[
          { id: 'single' as const, label: 'Single-Op (mi flota)', icon: <Activity className="w-4 h-4" /> },
          { id: 'cross' as const, label: 'Cross-Op (HRR)', icon: <Zap className="w-4 h-4" /> },
          { id: 'historico' as const, label: 'Histórico', icon: <TrendingUp className="w-4 h-4" /> },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition ${
              tab === t.id
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'single' && (
        <div className="flex flex-col gap-4">
          {resumenSingle && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <SummaryCard label="Líneas analizadas" value={resumenSingle.lineas} />
              <SummaryCard label="Pares evaluados" value={resumenSingle.totalPares} />
              <SummaryCard label="% Bunching" value={`${resumenSingle.pctBunching}%`} tone="rose" />
              <SummaryCard label="% Normal" value={`${resumenSingle.pctNormal}%`} tone="emerald" />
              <SummaryCard label="% Gapping" value={`${resumenSingle.pctGapping}%`} tone="amber" />
            </div>
          )}

          {single && single.length === 0 && (
            <EmptyState
              titulo={`Sin datos suficientes para ${empresaCfg.label}`}
              mensaje={`No hay viajes_activos con al menos 2 buses en la misma línea/variante para ${empresaCfg.label}. Probá con otro operador o esperá a que haya más buses operando.`}
            />
          )}

          {single && single.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
              <table className="w-full text-sm">
                <thead className="bg-slate-950/60 text-xs uppercase font-bold text-slate-400">
                  <tr>
                    <th className="text-left px-4 py-3">Línea</th>
                    <th className="text-right px-4 py-3">Buses</th>
                    <th className="text-right px-4 py-3">Pares</th>
                    <th className="text-right px-4 py-3">Headway prom.</th>
                    <th className="text-right px-4 py-3">Frec. esperada</th>
                    <th className="text-right px-4 py-3">Bunching</th>
                    <th className="text-right px-4 py-3">Normal</th>
                    <th className="text-right px-4 py-3">Gapping</th>
                    <th className="text-right px-4 py-3">No medible</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {single.map((l) => (
                    <tr key={`${l.linea}`} className="hover:bg-slate-900/40">
                      <td className="px-4 py-3 font-bold text-white">{l.linea}</td>
                      <td className="px-4 py-3 text-right">{l.busesActivos}</td>
                      <td className="px-4 py-3 text-right text-slate-400">{l.paresAnalizados}</td>
                      <td className="px-4 py-3 text-right">
                        {l.headwayPromedioMin !== null ? `${l.headwayPromedioMin} min` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">
                        {l.frecuenciaEsperadaMin !== null ? `${l.frecuenciaEsperadaMin} min` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-rose-300">{l.pctBunching}%</td>
                      <td className="px-4 py-3 text-right text-emerald-300">{l.pctNormal}%</td>
                      <td className="px-4 py-3 text-right text-amber-300">{l.pctGapping}%</td>
                      <td className="px-4 py-3 text-right text-slate-500">{l.pctNoMedible}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'cross' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-amber-400/30 bg-amber-950/20 p-4 text-sm text-amber-100">
            <div className="flex gap-2 items-start">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
              <div>
                <p className="font-bold mb-1">Diferenciador único cross-operador</p>
                <p className="text-amber-200/80">
                  HRR (Headway-to-Rival Ratio) es una métrica académica TCRP 195 que ningún
                  competidor mundial implementa cross-operador en producción. SkillRoute mide
                  en tiempo real cuán cerca está cada bus de {empresaCfg.label} de un bus rival
                  de otro operador en la misma línea. Si HRR &lt; 0.3, hay bunching cross-op
                  (ineficiencia detectada).
                </p>
              </div>
            </div>
          </div>

          {resumenCross && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryCard label="Buses propios analizados" value={resumenCross.total} />
              <SummaryCard label="Críticos (HRR<0.3)" value={resumenCross.criticos} tone="rose" />
              <SummaryCard label="Precaución" value={resumenCross.precaucion} tone="amber" />
              <SummaryCard label="OK" value={resumenCross.ok} tone="emerald" />
            </div>
          )}

          {cross && cross.length === 0 && (
            <EmptyState
              titulo="Sin pares cross-op para evaluar"
              mensaje={`Ningún bus de ${empresaCfg.label} comparte línea con un bus de otro operador en este momento. Esto puede ser normal si los rivales no operan corredores compartidos hoy.`}
            />
          )}

          {cross && cross.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
              <table className="w-full text-sm">
                <thead className="bg-slate-950/60 text-xs uppercase font-bold text-slate-400">
                  <tr>
                    <th className="text-left px-4 py-3">Línea</th>
                    <th className="text-left px-4 py-3">Bus propio</th>
                    <th className="text-left px-4 py-3">Rival más próximo</th>
                    <th className="text-right px-4 py-3">Distancia</th>
                    <th className="text-right px-4 py-3">Tiempo a rival</th>
                    <th className="text-right px-4 py-3">HRR</th>
                    <th className="text-center px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {cross.map((c, i) => (
                    <tr key={`${c.busPropio.interno}_${c.busRivalProximo.interno}_${i}`}>
                      <td className="px-4 py-3 font-bold text-white">{c.linea}</td>
                      <td className="px-4 py-3">
                        <span className="text-amber-300 font-bold">#{c.busPropio.interno}</span>{' '}
                        <span className="text-slate-500 text-xs">({c.busPropio.empresa})</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-200 font-bold">#{c.busRivalProximo.interno}</span>{' '}
                        <span className="text-slate-500 text-xs">({c.busRivalProximo.empresa})</span>
                      </td>
                      <td className="px-4 py-3 text-right">{c.distanciaMetros} m</td>
                      <td className="px-4 py-3 text-right">{c.tiempoARivalMin} min</td>
                      <td className="px-4 py-3 text-right font-bold">
                        {c.hrr !== null ? c.hrr : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge estado={c.estado} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'historico' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center">
          <TrendingDown className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h3 className="font-black text-white mb-1">Histórico 7 días</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Próxima entrega del Sprint 2 — chart de % bunching por hora del día,
            últimos 7 días. Se va a alimentar de snapshots diarios de headway.
          </p>
        </div>
      )}

      {/* Footer status */}
      <div className="flex justify-between items-center text-xs text-slate-500 mt-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3 h-3" />
          {lastUpdate
            ? `Última actualización: ${lastUpdate.toLocaleTimeString('es-UY')}`
            : 'Cargando…'}
        </div>
        <div>Auto-refresh cada 60s</div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'rose' | 'amber' | 'emerald';
}) {
  const toneClasses =
    tone === 'rose'
      ? 'text-rose-300'
      : tone === 'amber'
        ? 'text-amber-300'
        : tone === 'emerald'
          ? 'text-emerald-300'
          : 'text-white';
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-black ${toneClasses}`}>{value}</p>
    </div>
  );
}

function EmptyState({ titulo, mensaje }: { titulo: string; mensaje: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center">
      <Info className="w-10 h-10 text-slate-500 mx-auto mb-3" />
      <h3 className="font-black text-white mb-1">{titulo}</h3>
      <p className="text-sm text-slate-400 max-w-md mx-auto">{mensaje}</p>
    </div>
  );
}
