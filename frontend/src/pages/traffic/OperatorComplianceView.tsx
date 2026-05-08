// Vista Operador — Cumplimiento por línea
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §3
// Ruta: /dashboard/traffic/cumplimiento

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { RefreshCw, Download, Info, ChevronRight, AlertTriangle } from 'lucide-react';
import { PeriodRange, OperatorData, OPERATOR_NAMES } from '../../types/compliance';
import { fetchOperatorData } from '../../services/complianceService';
import { useAuth } from '../../context/AuthContext';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import TimeRangeSelector from '../../components/shared/TimeRangeSelector';
import DataQualityIndicator from '../../components/shared/DataQualityIndicator';
import OperatorLineList from '../../components/cumplimiento/OperatorLineList';

const AuditoriaLineaTimeline = lazy(() => import('./AuditoriaLineaTimeline'));

// ── Helpers ─────────────────────────────────────────────────────────────────

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtLabel(range: PeriodRange): string {
  const f = range.from.toLocaleDateString('es-UY', { day: 'numeric', month: 'short', year: 'numeric' });
  const t = range.to.toLocaleDateString('es-UY',   { day: 'numeric', month: 'short', year: 'numeric' });
  return f === t ? f : `${f} — ${t}`;
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color = 'text-white',
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
      <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Modal metodología ────────────────────────────────────────────────────────

function ModalMetodologia({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6 shadow-2xl">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-black text-white">Metodología de indicadores</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">✕</button>
        </div>
        <div className="space-y-4 text-sm">
          {[
            { label: 'OTP — Puntualidad', desc: '% viajes dentro de ±5 min del horario programado. Métrica primaria para líneas de baja frecuencia (intervalo > 12 min). Estándar: TCRP 165 §4.4.2.' },
            { label: 'EWT — Exceso de espera', desc: 'Tiempo adicional de espera respecto al programado. Métrica primaria para líneas de alta frecuencia (intervalo ≤ 12 min). Estándar: TfL / UITP.' },
            { label: 'SD % — Servicio entregado', desc: '% de viajes programados efectivamente operados. Calculado como buses únicos observados / viajes GTFS programados.' },
            { label: 'Cobertura GPS', desc: '% de eventos con posición válida (≤ 80 m del recorrido GTFS, confianza no-CERO). Umbral publicable: ≥ 70 %.' },
            { label: 'Estado INSUFICIENTE', desc: 'Menos de 30 observaciones válidas. El indicador no es estadísticamente representativo.' },
            { label: 'Estado OK Provisional', desc: 'Entre 30 y 200 observaciones. El indicador es válido pero el IC95 es amplio (mostrado en ámbar).' },
          ].map(({ label, desc }) => (
            <div key={label} className="border-b border-slate-800 pb-4 last:border-0">
              <h4 className="font-bold text-blue-400 mb-1">{label}</h4>
              <p className="text-slate-300 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-600 mt-4">
          Fuente: GPS oficial IMM (POST stm-online) + GTFS oficial. aggregation-engine SkillRoute v1.
        </p>
      </div>
    </div>
  );
}

// ── Componente principal ────────────────────────────────────────────────────

export default function OperatorComplianceView() {
  const { token } = useAuth();
  const { empresaCfg } = useEmpresaPropia();
  const agencyId = empresaCfg.agencyId;

  const [period, setPeriod] = useState<PeriodRange>({
    from: addDays(today(), -6),
    to: today(),
    granularity: 'DAILY',
  });

  const [data, setData]       = useState<OperatorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);

  // Drill-down: linea seleccionada
  const [drillDown, setDrillDown] = useState<{ linea: string; sentido: string } | null>(null);

  const load = useCallback(async (force = false) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOperatorData(token, agencyId, period.from, period.to, period.granularity);
      setData(result);
    } catch (err: any) {
      if (force || !data) setError(err?.message ?? 'Error al cargar datos de cumplimiento');
    } finally {
      setLoading(false);
    }
  }, [token, agencyId, period.from, period.to, period.granularity]);

  useEffect(() => { load(); }, [load]);

  // KPIs de resumen
  const totalLines    = data?.lines.length ?? 0;
  const linesOk       = data?.lines.filter(l => l.estado === 'OK' || l.estado === 'OK_PROVISIONAL').length ?? 0;
  const linesAlert    = data?.lines.filter(l => l.estado === 'INSUFICIENTE' || l.estado === 'COBERTURA_BAJA').length ?? 0;
  const operatorName  = OPERATOR_NAMES[agencyId] ?? agencyId;

  return (
    <div className="bg-slate-950 min-h-full">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-700/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Encabezado ─────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Tráfico</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-300">Cumplimiento por Línea</span>
          </div>

          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-black text-white">
                Cumplimiento de{' '}
                <span
                  className="font-black"
                  style={{ color: empresaCfg.color }}
                >
                  {operatorName}
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Fuente: GPS oficial IMM (POST stm-online) + GTFS oficial
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowMethodology(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold transition-all"
              >
                <Info className="w-3.5 h-3.5" />
                Metodología
              </button>
              <button
                onClick={() => load(true)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
              <button
                disabled
                title="Exportación PDF disponible próximamente"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600/50 border border-blue-600/30 text-blue-300/70 text-xs font-semibold disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar PDF
              </button>
            </div>
          </div>
        </div>

        {/* ── Selector de período ────────────────────────────────────────── */}
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs text-slate-500">Período:</span>
          <TimeRangeSelector
            value={period}
            onChange={setPeriod}
            presets={['hoy', '7d', '30d', 'mes_actual', 'personalizado']}
          />
          {!loading && data && (
            <span className="text-xs text-slate-600">{fmtLabel(period)}</span>
          )}
        </div>

        {/* ── Indicador calidad GPS ─────────────────────────────────────── */}
        {data?.coverage?.operatorGps != null && (
          <DataQualityIndicator
            coverage={data.coverage.operatorGps}
            n={data.coverage.totalEvents}
            threshold={70}
          />
        )}

        {/* ── KPIs resumen ─────────────────────────────────────────────── */}
        {(data || loading) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard
              label="Líneas monitoreadas"
              value={loading ? '—' : String(totalLines)}
              sub="con datos en el período"
            />
            <KpiCard
              label="Cobertura GPS"
              value={loading ? '—' : `${data?.coverage.operatorGps.toFixed(1) ?? '—'}%`}
              color={
                data?.coverage.operatorGps != null
                  ? data.coverage.operatorGps >= 70 ? 'text-emerald-400' : 'text-amber-400'
                  : 'text-white'
              }
              sub="promedio ponderado"
            />
            <KpiCard
              label="Líneas OK"
              value={loading ? '—' : String(linesOk)}
              color="text-emerald-400"
              sub="OK + OK Provisional"
            />
            <KpiCard
              label="Con alerta"
              value={loading ? '—' : String(linesAlert)}
              color={linesAlert > 0 ? 'text-amber-400' : 'text-slate-400'}
              sub="insuficiente o GPS bajo"
            />
          </div>
        )}

        {/* ── Bloque de error ────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-3">
            <p className="text-red-400 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              No se pudieron cargar los datos de cumplimiento
            </p>
            <p className="text-red-400/70 text-xs">{error}</p>
            <button
              onClick={() => load(true)}
              className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-300 text-xs font-semibold transition-all"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* ── Tabla de líneas ────────────────────────────────────────────── */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-white text-sm uppercase tracking-wide">
                Estado por línea
              </h2>
              {!loading && data && (
                <p className="text-xs text-slate-500 mt-0.5">{fmtLabel(period)}</p>
              )}
            </div>
            {loading && (
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Cargando agregados…
              </span>
            )}
          </div>

          <OperatorLineList
            lines={data?.lines ?? []}
            loading={loading}
            onDrillDown={(linea, sentido) => setDrillDown({ linea, sentido })}
          />
        </div>

        {/* Sin datos */}
        {!loading && !error && (data?.lines.length ?? 0) === 0 && data !== null && (
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 text-center">
            <p className="text-slate-400 text-sm font-semibold mb-1">
              Sin datos publicables para este período
            </p>
            <p className="text-slate-600 text-xs">
              El motor de agregación produce datos a las 03:00 UY.
              Si seleccionaste "Hoy", los datos estarán disponibles mañana.
            </p>
          </div>
        )}

        {/* Nota de versión */}
        {!loading && data && (
          <p className="text-xs text-slate-700 text-center">
            Generado: {new Date(data.meta.generatedAt).toLocaleString('es-UY')} ·
            matching-engine v1.0.0 · aggregation-engine v1
          </p>
        )}
      </div>

      {/* ── Drill-down: AuditoriaLineaTimeline (full-screen takeover) ────── */}
      {drillDown && (
        <div className="fixed inset-0 z-50 bg-slate-950 overflow-y-auto">
          <Suspense fallback={null}>
            <AuditoriaLineaTimeline
              agencyId={agencyId}
              linea={drillDown.linea}
              operadorNombre={operatorName}
              onCerrar={() => setDrillDown(null)}
            />
          </Suspense>
        </div>
      )}

      {/* ── Modal metodología ────────────────────────────────────────────── */}
      {showMethodology && (
        <ModalMetodologia onClose={() => setShowMethodology(false)} />
      )}
    </div>
  );
}
