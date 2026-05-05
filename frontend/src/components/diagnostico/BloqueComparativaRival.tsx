import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { Bloque3Result, LineaComparativa } from '../../services/diagnosticoEjecutivoService';

interface Props { data: Bloque3Result; }

function DeltaBadge({ diff }: { diff: number | null }) {
  if (diff === null) return <span className="text-slate-600 text-xs">—</span>;
  if (diff > 3) return (
    <span className="flex items-center gap-0.5 text-xs font-bold text-emerald-400">
      <ArrowUp className="w-3 h-3" />+{diff}pts
    </span>
  );
  if (diff < -3) return (
    <span className="flex items-center gap-0.5 text-xs font-bold text-red-400">
      <ArrowDown className="w-3 h-3" />{diff}pts
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-xs font-bold text-slate-400">
      <Minus className="w-3 h-3" />{diff}pts
    </span>
  );
}

function OTPCell({ val }: { val: number | null }) {
  if (val === null) return <span className="text-slate-600 text-xs">—</span>;
  const color = val >= 75 ? 'text-emerald-400' : val >= 65 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`text-xs font-semibold ${color}`}>{val}%</span>;
}

function ComparativaRow({ c }: { c: LineaComparativa }) {
  const rowColor = c.diferencia !== null && c.diferencia < -10
    ? 'bg-red-500/5 border-l-2 border-red-500/50'
    : c.diferencia !== null && c.diferencia > 10
    ? 'bg-emerald-500/5 border-l-2 border-emerald-500/50'
    : '';
  return (
    <tr className={`border-b border-slate-800 last:border-0 ${rowColor}`}>
      <td className="py-2.5 px-3 text-xs text-slate-200">
        L{c.lineaPropia} <span className="text-slate-500">{c.sentido}</span>
      </td>
      <td className="py-2.5 px-3 text-xs text-slate-400">
        {c.empresaRival} L{c.lineaRival}
      </td>
      <td className="py-2.5 px-3 text-center"><OTPCell val={c.otpPropio} /></td>
      <td className="py-2.5 px-3 text-center"><OTPCell val={c.otpRival} /></td>
      <td className="py-2.5 px-3 text-center"><DeltaBadge diff={c.diferencia} /></td>
      <td className="py-2.5 px-3 text-center text-xs text-slate-400">
        {c.velPropia !== null ? `${c.velPropia}` : '—'} / {c.velRival !== null ? `${c.velRival}` : '—'}
        <span className="text-slate-600 ml-0.5">km/h</span>
      </td>
    </tr>
  );
}

export default function BloqueComparativaRival({ data }: Props) {
  if (data.sinDatos) {
    return (
      <p className="text-sm text-slate-400 italic py-4">
        Sin datos suficientes para comparativa vs rivales.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300 leading-relaxed">{data.conclusion}</p>

      <div className="flex gap-4 text-xs">
        <span className="text-emerald-400 font-bold">{data.lineasSuperior} líneas superiores al rival</span>
        <span className="text-red-400 font-bold">{data.lineasInferior} líneas por debajo</span>
        <span className="text-slate-500">
          {data.comparativas.length - data.lineasSuperior - data.lineasInferior} parejas similares
        </span>
      </div>

      {data.comparativas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="py-2 px-3 text-xs text-slate-500 font-medium">Línea propia</th>
                <th className="py-2 px-3 text-xs text-slate-500 font-medium">Rival principal</th>
                <th className="py-2 px-3 text-xs text-slate-500 font-medium text-center">OTP propio</th>
                <th className="py-2 px-3 text-xs text-slate-500 font-medium text-center">OTP rival</th>
                <th className="py-2 px-3 text-xs text-slate-500 font-medium text-center">Δ</th>
                <th className="py-2 px-3 text-xs text-slate-500 font-medium text-center">Vel.</th>
              </tr>
            </thead>
            <tbody>
              {data.comparativas.map((c, i) => (
                <ComparativaRow key={i} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
