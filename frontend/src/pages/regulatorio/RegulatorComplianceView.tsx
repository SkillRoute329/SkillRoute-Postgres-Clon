// Vista Regulador — Cumplimiento del Sistema Metropolitano
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §2
// Ruta: /dashboard/admin/regulatorio/cumplimiento

import { useState, lazy, Suspense } from 'react';
import { RefreshCw, Download, Info, ChevronRight } from 'lucide-react';
import { type Granularidad, type PeriodRange, type OperatorSummary, OPERATOR_NAMES } from '../../types/compliance';
import { useComplianceData } from '../../hooks/useComplianceData';
import DataQualityIndicator from '../../components/shared/DataQualityIndicator';
import TimeRangeSelector from '../../components/shared/TimeRangeSelector';
import RegulatorMetricsTable from '../../components/cumplimiento/RegulatorMetricsTable';

const LineDeepDive = lazy(() => import('../../components/cumplimiento/LineDeepDive'));

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

// ── Esqueleto de carga ────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-4">
          <div className="h-5 bg-slate-800 rounded w-24" />
          <div className="h-5 bg-slate-800 rounded w-16 ml-auto" />
          <div className="h-5 bg-slate-800 rounded w-16" />
          <div className="h-5 bg-slate-800 rounded w-20" />
          <div className="h-5 bg-slate-800 rounded w-16" />
          <div className="h-5 bg-slate-800 rounded w-12" />
          <div className="h-5 bg-slate-800 rounded w-10" />
        </div>
      ))}
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
            { label: 'EWT — Exceso de espera', desc: 'Tiempo de espera adicional respecto al programado: EWT = AWT_observado − AWT_programado. Métrica primaria para líneas de alta frecuencia (intervalo ≤ 12 min). Estándar: TfL / UITP.' },
            { label: 'SD % — Servicio entregado', desc: '% de viajes programados efectivamente operados. Calculado como buses únicos observados / viajes programados GTFS. Estándar: NYC MTA.' },
            { label: 'Cobertura GPS', desc: '% de eventos GPS con posición válida (distancia al recorrido ≤ 80 m, confianza no-CERO). Indicador de calidad de datos. Umbral publicable: ≥ 70 %.' },
            { label: 'n mínimo', desc: 'Se requieren al menos 30 observaciones válidas para reportar una métrica. Con 30–200 se muestra IC95 en ámbar. Con ≥ 200 se considera estadísticamente robusto.' },
            { label: 'Tipo de cumplimiento', desc: '"PLENO" = calculado contra cronograma oficial (boletín + cartones UCOT). "GPS" = observado exclusivamente desde GPS, no comparable con Pleno.' },
          ].map(({ label, desc }) => (
            <div key={label} className="border-b border-slate-800 pb-4 last:border-0">
              <h4 className="font-bold text-blue-400 mb-1">{label}</h4>
              <p className="text-slate-300 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-600 mt-4">
          Fuente: GPS oficial IMM (POST stm-online) + GTFS oficial IMM + cronograma UCOT.
          Motor de análisis de cumplimiento SkillRoute v1.
        </p>
      </div>
    </div>
  );
}

// ── Componente principal ────────────────────────────────────────────────────

export default function RegulatorComplianceView() {
  const [period, setPeriod] = useState<PeriodRange>({
    from: addDays(today(), -6),
    to: today(),
    granularity: 'DAILY',
  });

  const [drillDownId, setDrillDownId] = useState<string | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);

  const { data, loading, error, refresh } = useComplianceData({
    agencyId: 'all',
    from: period.from,
    to: period.to,
    granularity: period.granularity,
  });

  const handleDrillDown = (agencyId: string) => {
    setDrillDownId(prev => prev === agencyId ? null : agencyId);
  };

  // Calcular cobertura del sistema
  const systemCoverage = data?.coverage?.systemGps ?? null;
  const byOperator = data?.coverage?.byOperator ?? {};

  return (
    <div className="bg-slate-950 min-h-full">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-700/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Encabezado ─────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Regulatorio</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-300">Cumplimiento del Sistema Metropolitano</span>
          </div>

          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-black text-white">
                Cumplimiento del Sistema Metropolitano
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Fuente: GPS oficial IMM (POST stm-online) + GTFS oficial
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMethodology(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold transition-all"
              >
                <Info className="w-3.5 h-3.5" />
                Metodología
              </button>
              <button
                onClick={refresh}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
              <button
                onClick={() => window.print()}
                title="Exportar este informe a PDF (Guardar como PDF)"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 border border-blue-600/30 text-white text-xs font-semibold transition-all"
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

        {/* ── Indicador de calidad de datos ─────────────────────────────── */}
        {systemCoverage != null && (
          <DataQualityIndicator
            coverage={systemCoverage}
            n={data?.operators?.reduce((s, op) => s + op.totalEvents, 0)}
            threshold={70}
          />
        )}

        {/* Cobertura por operador */}
        {Object.keys(byOperator).length > 0 && (
          <div className="flex items-center gap-4 flex-wrap px-2">
            <span className="text-xs text-slate-500">Cobertura por operador:</span>
            {Object.entries(byOperator).map(([id, cov]) => (
              <span key={id} className="text-xs">
                <span className="text-slate-400 font-semibold">{OPERATOR_NAMES[id] ?? id}</span>
                <span className={`ml-1 font-bold tabular-nums ${cov >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {cov.toFixed(1)} %
                </span>
              </span>
            ))}
          </div>
        )}

        {/* ── Panel cross-operador ──────────────────────────────────────── */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-white text-sm uppercase tracking-wide">
                Panel Cross-Operador
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{fmtLabel(period)}</p>
            </div>
            {loading && (
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Cargando agregados…
              </span>
            )}
          </div>

          {error ? (
            <div className="p-6">
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-3">
                <p className="text-red-400 text-sm font-semibold">
                  ⚠ No se pudieron cargar los datos de cumplimiento
                </p>
                <p className="text-red-400/70 text-xs">{error}</p>
                <button
                  onClick={refresh}
                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-300 text-xs font-semibold transition-all"
                >
                  Reintentar
                </button>
              </div>
            </div>
          ) : loading ? (
            <div className="p-4">
              <TableSkeleton />
            </div>
          ) : (
            <RegulatorMetricsTable
              data={data?.operators ?? []}
              period={period}
              onDrillDown={handleDrillDown}
              expandedId={drillDownId}
            />
          )}
        </div>

        {/* ── Nota informativa ──────────────────────────────────────────── */}
        {!loading && !error && (data?.operators?.length ?? 0) === 0 && (
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 text-center">
            <p className="text-slate-400 text-sm font-semibold mb-1">
              Sin datos publicables para este período
            </p>
            <p className="text-slate-600 text-xs">
              El motor de agregación nocturno produce datos a las 03:00 UY.
              Si seleccionaste "Hoy", los datos estarán disponibles mañana.
            </p>
          </div>
        )}

        {/* Nota de versión */}
        {!loading && data && (
          <p className="text-xs text-slate-700 text-center">
            Generado: {new Date(data.meta.generatedAt).toLocaleString('es-UY')}
          </p>
        )}
      </div>

      {/* ── Drill-down modal ──────────────────────────────────────────────── */}
      {drillDownId && (
        <Suspense fallback={null}>
          <LineDeepDive
            agencyId={drillDownId}
            desde={fmtDate(period.from)}
            hasta={fmtDate(period.to)}
            onClose={() => setDrillDownId(null)}
          />
        </Suspense>
      )}

      {/* ── Modal metodología ────────────────────────────────────────────── */}
      {showMethodology && (
        <ModalMetodologia onClose={() => setShowMethodology(false)} />
      )}
    </div>
  );
}
