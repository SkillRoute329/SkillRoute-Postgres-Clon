// Tabla cross-operador asimétrica — Vista Regulador
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §2.1

import { ChevronDown, ChevronRight } from 'lucide-react';
import { type OperatorSummary, type PeriodRange, OPERATOR_NAMES } from '../../types/compliance';
import MetricBadge from '../shared/MetricBadge';
import MethodologyTooltip from '../shared/MethodologyTooltip';

interface Props {
  data: OperatorSummary[];
  period: PeriodRange;
  onDrillDown: (agencyId: string) => void;
  expandedId: string | null;
}

function CumplimientoBadge({ agencyId }: { agencyId: string }) {
  const isPleno = agencyId === '70'; // Solo UCOT tiene cumplimiento pleno
  return (
    <span
      title={isPleno
        ? 'Calculado contra cronograma oficial UCOT (boletín + cartones)'
        : 'Calculado solo desde GPS — no comparable a Pleno'
      }
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border cursor-help ${
        isPleno
          ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
          : 'bg-slate-500/10 border-slate-600 text-slate-400'
      }`}
    >
      {isPleno ? 'PLENO' : 'GPS'}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {[...Array(7)].map((_, i) => (
        <td key={i} className="px-4 py-4">
          <div className="h-4 bg-slate-800 rounded animate-pulse w-16" />
        </td>
      ))}
    </tr>
  );
}

export default function RegulatorMetricsTable({ data, period: _period, onDrillDown, expandedId }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        Sin datos publicables para este período.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Operador
            </th>
            <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Servicios
            </th>
            <th className="text-right px-4 py-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-end gap-1">
                SD %
                <MethodologyTooltip metric="SD" />
              </span>
            </th>
            <th className="text-right px-4 py-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-end gap-1">
                EWT alta freq
                <MethodologyTooltip metric="EWT" />
              </span>
            </th>
            <th className="text-right px-4 py-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-end gap-1">
                OTP baja freq
                <MethodologyTooltip metric="OTP" />
              </span>
            </th>
            <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Cobertura
            </th>
            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
              Tipo
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map(op => {
            const isExpanded = expandedId === op.agencyId;
            return (
              <tr
                key={op.agencyId}
                onClick={() => onDrillDown(op.agencyId)}
                className="border-b border-slate-800 hover:bg-slate-900/50 cursor-pointer transition-colors group"
              >
                {/* Operador */}
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    {isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
                      : <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400" />
                    }
                    <div>
                      <p className="font-bold text-white">{OPERATOR_NAMES[op.agencyId] ?? op.agencyId}</p>
                      <p className="text-xs text-slate-500">{op.lineCount} líneas</p>
                    </div>
                  </div>
                </td>

                {/* Servicios */}
                <td className="px-4 py-4 text-right">
                  <span className="text-white tabular-nums font-semibold">
                    {op.services.value.toLocaleString('es-UY')}
                  </span>
                  <br />
                  <span className="text-[10px] text-slate-500">MEDIDO</span>
                </td>

                {/* Service Delivered */}
                <td className="px-4 py-4 text-right">
                  {op.serviceDelivered ? (
                    <MetricBadge
                      value={op.serviceDelivered.value}
                      unit="pct"
                      n={op.serviceDelivered.n}
                      cobertura={op.coverageGps}
                      badge={op.serviceDelivered.badge}
                      fuente="ESTIMADO"
                      showInline
                    />
                  ) : (
                    <span className="text-xs text-slate-600">—</span>
                  )}
                </td>

                {/* EWT */}
                <td className="px-4 py-4 text-right">
                  {op.ewt?.applicable ? (
                    <MetricBadge
                      value={op.ewt.value}
                      unit="min"
                      n={op.ewt.n}
                      ic95={op.ewt.ic95 ?? null}
                      cobertura={op.coverageGps}
                      badge={op.ewt.badge}
                      fuente="MEDIDO"
                      meta={1.0}
                      higherIsBetter={false}
                      showInline
                    />
                  ) : (
                    <span className="text-xs text-slate-600">—</span>
                  )}
                </td>

                {/* OTP */}
                <td className="px-4 py-4 text-right">
                  {op.otp?.applicable ? (
                    <MetricBadge
                      value={op.otp.value}
                      unit="pct"
                      n={op.otp.n}
                      ic95={op.otp.ic95 ?? null}
                      cobertura={op.coverageGps}
                      badge={op.otp.badge}
                      fuente="MEDIDO"
                      meta={85}
                      showInline
                    />
                  ) : (
                    <span className="text-xs text-slate-600">—</span>
                  )}
                </td>

                {/* Cobertura GPS */}
                <td className="px-4 py-4 text-right">
                  <span className={`font-semibold tabular-nums text-sm ${op.coverageGps >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {op.coverageGps.toFixed(1)} %
                  </span>
                </td>

                {/* Tipo de cumplimiento */}
                <td className="px-4 py-4 text-center">
                  <CumplimientoBadge agencyId={op.agencyId} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Leyenda */}
      <div className="px-4 py-3 border-t border-slate-800 flex items-center gap-6 text-xs text-slate-500">
        <span>
          <span className="text-blue-300 font-bold">PLENO</span> = Calculado contra cronograma oficial (boletín + cartones)
        </span>
        <span>
          <span className="text-slate-400 font-bold">GPS</span> = Confiabilidad observada desde GPS — no comparable con Pleno
        </span>
      </div>
    </div>
  );
}

export { SkeletonRow };
