// Tooltip de metodología — muestra fuente, fórmula y estándar de cada KPI
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §5.2

import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { METHODOLOGY_CATALOG } from '../../data/methodologyCatalog';

type MetricKey = keyof typeof METHODOLOGY_CATALOG;

interface Props {
  metric: MetricKey;
  trigger?: 'hover' | 'click';
  className?: string;
}

export default function MethodologyTooltip({ metric, trigger = 'hover', className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const entry = METHODOLOGY_CATALOG[metric];

  useEffect(() => {
    if (!open || trigger !== 'click') return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, trigger]);

  if (!entry) return null;

  const handlers = trigger === 'hover'
    ? { onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false) }
    : { onClick: () => setOpen(v => !v) };

  return (
    <div className={`relative inline-flex ${className}`} ref={ref}>
      <button
        type="button"
        {...handlers}
        className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
        aria-label={`Ver metodología: ${entry.label}`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-80 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-4 text-left">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h4 className="text-sm font-bold text-white leading-tight">{entry.label}</h4>
            {trigger === 'click' && (
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <p className="text-xs text-slate-300 leading-relaxed mb-3">{entry.definicion}</p>

          <div className="space-y-2 text-xs">
            <div className="bg-slate-900 rounded-lg px-3 py-2 font-mono text-blue-300 break-all">
              {entry.formula}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-400">
              <span className="text-slate-500">Aplicable a:</span>
              <span>{entry.aplicable}</span>
              <span className="text-slate-500">Estándar:</span>
              <span className="text-slate-300 font-medium">{entry.estandar}</span>
              <span className="text-slate-500">Cob. mínima:</span>
              <span>{entry.cobMinima}</span>
              <span className="text-slate-500">n mínimo:</span>
              <span>{entry.nMinimo}</span>
            </div>
          </div>

          {/* Flecha */}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-slate-600" />
        </div>
      )}
    </div>
  );
}
