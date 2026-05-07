// Selector de período con presets
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §5.4

import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Granularidad, PeriodRange } from '../../types/compliance';

type Preset = 'hoy' | '7d' | '30d' | 'mes_actual' | 'personalizado';

interface Props {
  value: PeriodRange;
  onChange: (range: PeriodRange) => void;
  presets?: Preset[];
  className?: string;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function makePreset(preset: Preset, granularity: Granularidad): PeriodRange {
  const today = startOfDay(new Date());
  switch (preset) {
    case 'hoy':       return { from: today, to: today, granularity: 'DAILY' };
    case '7d':        return { from: addDays(today, -6), to: today, granularity: 'DAILY' };
    case '30d':       return { from: addDays(today, -29), to: today, granularity: 'DAILY' };
    case 'mes_actual':return { from: startOfMonth(today), to: today, granularity: 'MONTHLY' };
    default:          return { from: addDays(today, -6), to: today, granularity };
  }
}

const PRESET_LABELS: Record<Preset, string> = {
  hoy: 'Hoy',
  '7d': '7 días',
  '30d': '30 días',
  mes_actual: 'Este mes',
  personalizado: 'Personalizado...',
};

function detectPreset(v: PeriodRange): Preset | null {
  const today = startOfDay(new Date()).getTime();
  const from = startOfDay(v.from).getTime();
  const to = startOfDay(v.to).getTime();
  if (from === today && to === today) return 'hoy';
  if (from === addDays(new Date(today), -6).getTime() && to === today) return '7d';
  if (from === addDays(new Date(today), -29).getTime() && to === today) return '30d';
  if (from === startOfMonth(new Date(today)).getTime()) return 'mes_actual';
  return 'personalizado';
}

export default function TimeRangeSelector({
  value,
  onChange,
  presets = ['hoy', '7d', '30d', 'mes_actual'],
  className = '',
}: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const active = detectPreset(value);

  return (
    <div className={`flex items-center gap-1 flex-wrap ${className}`}>
      {presets.map(p => (
        <button
          key={p}
          onClick={() => {
            if (p === 'personalizado') { setShowCustom(v => !v); return; }
            setShowCustom(false);
            onChange(makePreset(p, value.granularity));
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            active === p
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
          }`}
        >
          {PRESET_LABELS[p]}
        </button>
      ))}

      {showCustom && (
        <div className="flex items-center gap-2 ml-2">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <input
            type="date"
            value={value.from.toISOString().slice(0, 10)}
            onChange={e => onChange({ ...value, from: new Date(e.target.value + 'T12:00:00') })}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:border-blue-500 outline-none"
          />
          <span className="text-slate-500 text-xs">→</span>
          <input
            type="date"
            value={value.to.toISOString().slice(0, 10)}
            onChange={e => onChange({ ...value, to: new Date(e.target.value + 'T12:00:00') })}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:border-blue-500 outline-none"
          />
        </div>
      )}
    </div>
  );
}
