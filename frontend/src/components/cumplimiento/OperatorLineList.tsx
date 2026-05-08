// Lista de líneas con métricas de cumplimiento — Vista Operador
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §3.1

import { ChevronRight, AlertTriangle, CheckCircle2, HelpCircle, WifiOff } from 'lucide-react';
import { LineResult, LineEstado } from '../../types/compliance';

interface Props {
  lines: LineResult[];
  loading: boolean;
  onDrillDown: (linea: string, sentido: string) => void;
}

function EstadoBadge({ estado }: { estado: LineEstado }) {
  switch (estado) {
    case 'OK':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold">
          <CheckCircle2 className="w-3 h-3" />
          OK
        </span>
      );
    case 'OK_PROVISIONAL':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-xs font-semibold">
          ≈ Provisional
        </span>
      );
    case 'COBERTURA_BAJA':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 text-xs font-semibold">
          <WifiOff className="w-3 h-3" />
          Cobertura baja
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 text-xs font-semibold">
          <HelpCircle className="w-3 h-3" />
          Insuficiente
        </span>
      );
  }
}

function MetricCell({ line }: { line: LineResult }) {
  const m = line.isHighFreq ? line.metrics.ewt : line.metrics.otp;
  if (!m || m.value == null) {
    return <span className="text-slate-600 text-xs">—</span>;
  }
  const label = line.isHighFreq ? 'EWT' : 'OTP';
  const unit  = line.isHighFreq ? ' min' : '%';
  const color = m.badge === 'OK'
    ? 'text-emerald-400'
    : m.badge === 'IC_VISIBLE'
      ? 'text-amber-400'
      : 'text-slate-500';
  return (
    <span className={`text-sm font-bold tabular-nums ${color}`}>
      {m.value.toFixed(1)}{unit}
      <span className="text-xs font-normal ml-1 text-slate-500">({label})</span>
    </span>
  );
}

function RowSkeleton() {
  return (
    <tr>
      <td className="px-6 py-3"><div className="h-5 bg-slate-800 rounded w-12 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-5 bg-slate-800 rounded w-14 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-slate-800 rounded w-16 animate-pulse" /></td>
      <td className="px-4 py-3 text-right"><div className="h-4 bg-slate-800 rounded w-14 ml-auto animate-pulse" /></td>
      <td className="px-4 py-3 text-right"><div className="h-4 bg-slate-800 rounded w-12 ml-auto animate-pulse" /></td>
      <td className="px-4 py-3 text-right"><div className="h-4 bg-slate-800 rounded w-20 ml-auto animate-pulse" /></td>
      <td className="px-4 py-3 text-center"><div className="h-5 bg-slate-800 rounded-full w-20 mx-auto animate-pulse" /></td>
      <td className="px-4 py-3" />
    </tr>
  );
}

export default function OperatorLineList({ lines, loading, onDrillDown }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
            <th className="px-6 py-3 text-left font-semibold">Línea</th>
            <th className="px-4 py-3 text-left font-semibold">Sentido</th>
            <th className="px-4 py-3 text-left font-semibold">Tipo</th>
            <th className="px-4 py-3 text-right font-semibold">Obs.</th>
            <th className="px-4 py-3 text-right font-semibold">GPS</th>
            <th className="px-4 py-3 text-right font-semibold">Métrica</th>
            <th className="px-4 py-3 text-center font-semibold">Estado</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {loading ? (
            [...Array(6)].map((_, i) => <RowSkeleton key={i} />)
          ) : lines.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-6 py-10 text-center">
                <p className="text-slate-400 text-sm font-semibold">Sin datos para este período</p>
                <p className="text-slate-600 text-xs mt-1">
                  El motor de agregación produce datos a las 03:00 UY.
                </p>
              </td>
            </tr>
          ) : (
            lines.map((line, idx) => (
              <tr
                key={`${line.linea}-${line.sentido}-${idx}`}
                className="hover:bg-slate-800/30 cursor-pointer transition-colors group"
                onClick={() => onDrillDown(line.linea, line.sentido)}
              >
                <td className="px-6 py-3">
                  <span className="inline-block bg-blue-600/20 border border-blue-600/30 text-blue-300 font-black text-sm px-2.5 py-0.5 rounded-md">
                    {line.linea}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    line.sentido === 'IDA'
                      ? 'bg-blue-500/15 text-blue-300'
                      : 'bg-purple-500/15 text-purple-300'
                  }`}>
                    {line.sentido}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-slate-400">
                    {line.isHighFreq ? 'Alta frec.' : 'Baja frec.'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-300 text-xs">
                  {line.totalEventsObserved.toLocaleString('es-UY')}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-xs font-bold">
                  <span className={line.globalCoverageGps >= 70 ? 'text-emerald-400' : 'text-amber-400'}>
                    {line.globalCoverageGps.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <MetricCell line={line} />
                </td>
                <td className="px-4 py-3 text-center">
                  <EstadoBadge estado={line.estado} />
                </td>
                <td className="px-4 py-3">
                  <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-slate-400 transition-colors" />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {!loading && lines.length > 0 && (
        <div className="px-6 py-3 border-t border-slate-800/50 flex items-center justify-between">
          <span className="text-xs text-slate-600">
            {lines.length} línea{lines.length !== 1 ? 's' : ''} ·{' '}
            {lines.filter(l => l.estado === 'OK' || l.estado === 'OK_PROVISIONAL').length} OK ·{' '}
            {lines.filter(l => l.estado === 'INSUFICIENTE' || l.estado === 'COBERTURA_BAJA').length} con alerta
          </span>
          <span className="text-xs text-slate-700">
            Haz clic en una fila para ver el detalle de la línea
          </span>
        </div>
      )}
    </div>
  );
}
