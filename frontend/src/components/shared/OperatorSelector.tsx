// Selector de operador — soporte para selección individual o múltiple
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §5.5

import { Building2 } from 'lucide-react';
import { OPERATOR_NAMES, OPERATOR_IDS } from '../../types/compliance';

interface Props {
  value: string | 'all';
  onChange: (agencyId: string | 'all') => void;
  multi?: boolean;
  className?: string;
}

export default function OperatorSelector({ value, onChange, multi = false, className = '' }: Props) {
  if (!multi) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <Building2 className="w-3.5 h-3.5 text-slate-500" />
        <select
          value={value}
          onChange={e => onChange(e.target.value as any)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none cursor-pointer"
        >
          <option value="all">Todos los operadores</option>
          {OPERATOR_IDS.map(id => (
            <option key={id} value={id}>{OPERATOR_NAMES[id]} ({id})</option>
          ))}
        </select>
      </div>
    );
  }

  // Modo multi (vista regulador)
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold px-1">
        Operadores
      </label>
      {OPERATOR_IDS.map(id => (
        <label key={id} className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">
          <input
            type="checkbox"
            checked={value === 'all'}
            readOnly
            className="accent-blue-500 w-3.5 h-3.5"
          />
          <span className="text-xs text-slate-300">
            {OPERATOR_NAMES[id]} <span className="text-slate-500">({id})</span>
          </span>
        </label>
      ))}
    </div>
  );
}
