// Drill-down por línea — histograma de desviaciones + métricas
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §2.2

import { useState, useEffect } from 'react';
import { X, TrendingUp, Activity, Clock } from 'lucide-react';
import { collection, query, where, getDocs, limit, orderBy } from '../../config/firestoreShim';
import { db } from '../../config/firebase';
import { type LineAggregate, OPERATOR_NAMES } from '../../types/compliance';
import MetricBadge from '../shared/MetricBadge';
import DataQualityIndicator from '../shared/DataQualityIndicator';
import MethodologyTooltip from '../shared/MethodologyTooltip';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

interface Props {
  agencyId: string;
  desde: string;
  hasta: string;
  onClose: () => void;
}

function LineCard({ doc }: { doc: LineAggregate }) {
  const m = doc.metrics;
  const isHF = doc.isHighFreq;

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-black text-white">L{doc.linea}</span>
            <span className="text-sm text-slate-400">{doc.sentido}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
              isHF
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                : 'bg-slate-700 border-slate-600 text-slate-400'
            }`}>
              {isHF ? 'ALTA FREQ.' : 'BAJA FREQ.'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {doc.totalEventsObserved.toLocaleString('es-UY')} eventos · {doc.totalTripsScheduled} viajes prog.
          </p>
        </div>
        <DataQualityIndicator
          coverage={doc.globalCoverageGps}
          variant="inline"
        />
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Métrica primaria */}
        {isHF && m.ewt_high_freq ? (
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1 mb-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">EWT</p>
              <MethodologyTooltip metric="EWT" />
            </div>
            <MetricBadge
              value={m.ewt_high_freq.value}
              unit="min"
              n={m.ewt_high_freq.n}
              ic95={m.ewt_high_freq.ic95Low != null ? [m.ewt_high_freq.ic95Low, m.ewt_high_freq.ic95High!] : null}
              cobertura={doc.globalCoverageGps}
              badge={m.ewt_high_freq.badge}
              fuente="MEDIDO"
              meta={1.0}
              higherIsBetter={false}
            />
          </div>
        ) : m.otp_low_freq ? (
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1 mb-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">OTP</p>
              <MethodologyTooltip metric="OTP" />
            </div>
            <MetricBadge
              value={m.otp_low_freq.value}
              unit="pct"
              n={m.otp_low_freq.n}
              ic95={m.otp_low_freq.ic95Low != null ? [m.otp_low_freq.ic95Low, m.otp_low_freq.ic95High!] : null}
              cobertura={doc.globalCoverageGps}
              badge={m.otp_low_freq.badge}
              fuente="MEDIDO"
              meta={85}
            />
          </div>
        ) : null}

        {/* GPS Coverage */}
        {m.gps_coverage && (
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1 mb-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Cobertura GPS</p>
              <MethodologyTooltip metric="GPS_COV" />
            </div>
            <MetricBadge
              value={m.gps_coverage.value}
              unit="pct"
              n={m.gps_coverage.n}
              cobertura={doc.globalCoverageGps}
              badge={m.gps_coverage.badge}
              fuente="MEDIDO"
            />
          </div>
        )}

        {/* SRS */}
        {m.service_reliability_score && (
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1 mb-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Confiabilidad</p>
              <MethodologyTooltip metric="SRS" />
            </div>
            <MetricBadge
              value={m.service_reliability_score.value}
              unit="score"
              n={m.service_reliability_score.n}
              cobertura={doc.globalCoverageGps}
              badge={m.service_reliability_score.badge}
              fuente="CALIBRADO"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function LineDeepDive({ agencyId, desde, hasta, onClose }: Props) {
  const [docs, setDocs] = useState<LineAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const q = query(
          collection(db, 'compliance_aggregates'),
          where('agencyId', '==', agencyId),
          where('granularidad', '==', 'DAILY'),
          where('periodo', '>=', desde),
          where('periodo', '<=', hasta),
          orderBy('periodo', 'desc'),
          limit(200),
        );
        const snap = await getDocs(q);
        if (mounted) {
          setDocs(snap.docs.map(d => d.data() as LineAggregate));
        }
      } catch (err: any) {
        if (mounted) setError(err?.message ?? 'Error al cargar detalle');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [agencyId, desde, hasta]);

  // Agrupar por línea+sentido y tomar el más reciente
  const byLine = new Map<string, LineAggregate>();
  for (const d of docs) {
    const k = `${d.linea}__${d.sentido}`;
    if (!byLine.has(k) || d.periodo > byLine.get(k)!.periodo) {
      byLine.set(k, d);
    }
  }
  const lines = Array.from(byLine.values())
    .sort((a, b) => a.linea.localeCompare(b.linea, 'es', { numeric: true }));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-lg font-black text-white">
              Detalle por línea — {OPERATOR_NAMES[agencyId] ?? agencyId}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Período: {desde} → {hasta}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-slate-900 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
              ⚠ {error}
            </div>
          )}

          {!loading && !error && lines.length === 0 && (
            <div className="text-center py-12 text-slate-500 text-sm">
              Sin datos para este operador en el período seleccionado.
            </div>
          )}

          {!loading && lines.map(doc => (
            <LineCard key={doc.id} doc={doc} />
          ))}
        </div>
      </div>
    </div>
  );
}
