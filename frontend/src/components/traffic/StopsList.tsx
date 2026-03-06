/**
 * Lista lateral de paradas del Navegador UCOT.
 * Click en parada centra el mapa en esa parada.
 */
import type { ParadaUcot } from '../../types/lineasUcot';

interface StopsListProps {
  paradas: ParadaUcot[];
  /** IDs de paradas afectadas por desvío activo (para resaltar). */
  affectedStopIds: Set<string>;
  /** Parada seleccionada (resaltar en la lista). */
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
}

export default function StopsList({
  paradas,
  affectedStopIds,
  selectedStopId,
  onSelectStop,
}: StopsListProps) {
  if (paradas.length === 0) {
    return (
      <div className="p-4 text-slate-500 text-sm">No hay paradas cargadas para esta línea.</div>
    );
  }

  return (
    <ul className="divide-y divide-slate-700/50 max-h-[400px] overflow-y-auto custom-scrollbar">
      {paradas.map((p, i) => {
        const isFirst = i === 0;
        const isLast = i === paradas.length - 1;
        const isAffected = affectedStopIds.has(p.id);
        const isSelected = selectedStopId === p.id;

        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelectStop(p.id)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors touch-manipulation min-h-[44px] active:bg-slate-700/80 ${
                isSelected
                  ? 'bg-primary-600/30 border-l-4 border-primary-500'
                  : 'hover:bg-slate-800/80 border-l-4 border-transparent'
              } ${isAffected ? 'ring-1 ring-amber-500/50' : ''}`}
            >
              <span
                className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                  isFirst
                    ? 'bg-emerald-600 text-white'
                    : isLast
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-700 text-slate-300'
                }`}
              >
                {isFirst ? 'I' : isLast ? 'F' : p.orden || i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{p.nombre}</span>
              {isAffected && (
                <span className="shrink-0 text-amber-400" title="Afectada por desvío">
                  ⚠
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
