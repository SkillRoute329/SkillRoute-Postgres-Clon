/**
 * Filtros Inteligentes CEO: Punto de Control, Ventana de Tiempo (±10 min), Estado del Personal (quién está libre ahora).
 * Sin tablas Excel; vista simple para Listero/Chofer.
 */
import { useState, useMemo } from 'react';
import { Search, Clock, MapPin, Users } from 'lucide-react';
import { getMasterPuntosControl } from '../../data/ucotMaster';
import type { User } from '../../services/firestore/types';

function parseTimeToMinutes(value: string): number {
  if (!value || typeof value !== 'string') return NaN;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return NaN;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN;
  return h * 60 + min;
}

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export interface QuickSearchFilters {
  puntoControlId: string;
  puntoControlNombre: string;
  tiempoDesde: string;
  tiempoHasta: string;
  soloLibresAhora: boolean;
  query: string;
}

export interface QuickSearchControlProps {
  /** Conductores a filtrar */
  drivers?: User[];
  /** Turnos del día (start/end) para calcular "libre ahora" */
  shiftsToday?: Array<{ start?: string; end?: string; assignedTo?: string; driverId?: string }>;
  /** Hora actual en "HH:mm" para "libre ahora" */
  nowTime?: string;
  /** Rol para filtrar (ej. conductor) */
  roleFilter?: string;
  onChange: (filters: QuickSearchFilters) => void;
  initialFilters?: Partial<QuickSearchFilters>;
  className?: string;
}

const DEFAULT_FILTERS: QuickSearchFilters = {
  puntoControlId: '',
  puntoControlNombre: '',
  tiempoDesde: '',
  tiempoHasta: '',
  soloLibresAhora: false,
  query: '',
};

export default function QuickSearchControl({
  drivers = [],
  shiftsToday = [],
  nowTime,
  roleFilter = 'conductor',
  onChange,
  initialFilters,
  className = '',
}: QuickSearchControlProps) {
  const [filters, setFilters] = useState<QuickSearchFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  });
  const puntosControl = useMemo(() => getMasterPuntosControl(), []);

  const update = (patch: Partial<QuickSearchFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    onChange(next);
  };

  const nowMinutes = nowTime ? parseTimeToMinutes(nowTime) : NaN;
  const ventanaMin = filters.tiempoDesde ? parseTimeToMinutes(filters.tiempoDesde) : NaN;
  const ventanaMax = filters.tiempoHasta ? parseTimeToMinutes(filters.tiempoHasta) : NaN;

  const driversFilteredByRole = useMemo(() => {
    if (!roleFilter) return drivers;
    return drivers.filter(
      (d) => String(d.role ?? d.rol ?? '').toLowerCase() === roleFilter.toLowerCase(),
    );
  }, [drivers, roleFilter]);

  const assignedNow = useMemo(() => {
    if (!Number.isFinite(nowMinutes)) return new Set<string>();
    const set = new Set<string>();
    shiftsToday.forEach((s) => {
      const start = parseTimeToMinutes((s.start ?? '').slice(0, 5));
      const end = parseTimeToMinutes((s.end ?? '').slice(0, 5));
      if (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        nowMinutes >= start &&
        nowMinutes <= end
      ) {
        const id = String((s as { driverId?: string }).driverId ?? s.assignedTo ?? '');
        if (id) set.add(id);
      }
    });
    return set;
  }, [shiftsToday, nowMinutes]);

  const libresAhora = useMemo(() => {
    return driversFilteredByRole.filter((d) => !assignedNow.has(String(d.id ?? d.uid ?? '')));
  }, [driversFilteredByRole, assignedNow]);

  const enVentana = useMemo(() => {
    if (!Number.isFinite(ventanaMin) || !Number.isFinite(ventanaMax)) return driversFilteredByRole;
    return driversFilteredByRole.filter((d) => {
      const id = String(d.id ?? d.uid ?? '');
      const shift = shiftsToday.find(
        (s) => String((s as { driverId?: string }).driverId ?? s.assignedTo) === id,
      );
      if (!shift?.start) return true;
      const start = parseTimeToMinutes((shift.start ?? '').slice(0, 5));
      return start < ventanaMin || start > ventanaMax;
    });
  }, [driversFilteredByRole, shiftsToday, ventanaMin, ventanaMax]);

  return (
    <div
      className={`rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-4 ${className}`}
    >
      <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
        <Search className="w-4 h-4" />
        Filtros rápidos
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">
            <MapPin className="w-3 h-3 inline mr-1" />
            Punto de control
          </label>
          <select
            value={filters.puntoControlId}
            onChange={(e) => {
              const opt = e.target.selectedOptions[0];
              update({
                puntoControlId: e.target.value,
                puntoControlNombre: opt?.text ?? '',
              });
            }}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="">— Todos —</option>
            {puntosControl.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">
            <Clock className="w-3 h-3 inline mr-1" />
            Ventana ±10 min (desde)
          </label>
          <input
            type="time"
            value={filters.tiempoDesde}
            onChange={(e) => update({ tiempoDesde: e.target.value })}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Ventana (hasta)</label>
          <input
            type="time"
            value={filters.tiempoHasta}
            onChange={(e) => update({ tiempoHasta: e.target.value })}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.soloLibresAhora}
              onChange={(e) => update({ soloLibresAhora: e.target.checked })}
              className="rounded border-slate-600 bg-slate-800 text-primary-500"
            />
            <span className="text-sm text-slate-400 flex items-center gap-1">
              <Users className="w-4 h-4" />
              ¿Quién está libre ahora?
            </span>
          </label>
        </div>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre o legajo..."
        value={filters.query}
        onChange={(e) => update({ query: e.target.value })}
        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500"
      />

      {filters.soloLibresAhora && Number.isFinite(nowMinutes) && (
        <p className="text-xs text-slate-500">
          En este momento ({nowTime ?? formatMinutes(nowMinutes)}): {libresAhora.length}{' '}
          conductor(es) libre(s).
        </p>
      )}
    </div>
  );
}

export function useQuickSearchResult(
  filters: QuickSearchFilters,
  drivers: User[],
  shiftsToday: Array<{ start?: string; end?: string; assignedTo?: string; driverId?: string }>,
  nowTime?: string,
): User[] {
  const roleFilter = 'conductor';
  const filtered = drivers.filter(
    (d) => String(d.role ?? d.rol ?? '').toLowerCase() === roleFilter.toLowerCase(),
  );
  let result = filtered;

  if (filters.soloLibresAhora && nowTime) {
    const nowMinutes = parseTimeToMinutes(nowTime);
    const assignedNow = new Set<string>();
    shiftsToday.forEach((s) => {
      const start = parseTimeToMinutes((s.start ?? '').slice(0, 5));
      const end = parseTimeToMinutes((s.end ?? '').slice(0, 5));
      if (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        nowMinutes >= start &&
        nowMinutes <= end
      ) {
        assignedNow.add(String((s as { driverId?: string }).driverId ?? s.assignedTo ?? ''));
      }
    });
    result = result.filter((d) => !assignedNow.has(String(d.id ?? d.uid ?? '')));
  }

  if (filters.query.trim()) {
    const q = filters.query.trim().toLowerCase();
    result = result.filter(
      (d) =>
        String(d.fullName ?? '')
          .toLowerCase()
          .includes(q) ||
        String(d.internalNumber ?? '')
          .toLowerCase()
          .includes(q) ||
        String(d.firstName ?? '')
          .toLowerCase()
          .includes(q) ||
        String(d.lastName ?? '')
          .toLowerCase()
          .includes(q),
    );
  }

  return result;
}
