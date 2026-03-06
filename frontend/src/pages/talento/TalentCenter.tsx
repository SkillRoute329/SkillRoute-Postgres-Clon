/**
 * Fase 3 ERP: Centro de Gestión de Talento – Hoja de vida operativa.
 * Sidebar: buscador y lista con semáforo (vencimientos). Panel: perfil, cumplimiento legal, calendario vivo, Asignar Excepción.
 */
import { useState, useEffect, useMemo } from 'react';
import { UserService, ShiftService, PersonalService } from '../../services/firestore';
import type { User } from '../../services/firestore/types';
import type { PersonalRecord, DayException } from '../../services/firestore/personal';
import { Users, Calendar, AlertTriangle, Loader2 } from 'lucide-react';

const DAYS_IN_CALENDAR = 42;
const EXCEPTION_TYPES: { value: DayException['type']; label: string }[] = [
  { value: 'falta_medica', label: 'Falta Médica' },
  { value: 'franco', label: 'Franco' },
  { value: 'licencia', label: 'Licencia' },
  { value: 'otro', label: 'Otro' },
];

function daysToVencimiento(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function SemaphoreIcon({ days }: { days: number | null }) {
  if (days == null) return <span className="w-3 h-3 rounded-full bg-slate-500" />;
  if (days < 0) return <span className="w-3 h-3 rounded-full bg-red-500" title="Vencido" />;
  if (days < 30)
    return (
      <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" title={`${days} días`} />
    );
  return <span className="w-3 h-3 rounded-full bg-emerald-500" title="Al día" />;
}

export default function TalentCenter() {
  const [users, setUsers] = useState<User[]>([]);
  const [personal, setPersonal] = useState<Record<string, PersonalRecord>>({});
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exceptions, setExceptions] = useState<DayException[]>([]);
  const [shiftsByDate, setShiftsByDate] = useState<Record<string, boolean>>({});
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionType, setExceptionType] = useState<DayException['type']>('falta_medica');

  useEffect(() => {
    if (showExceptionModal) {
      setExceptionDate(new Date().toISOString().split('T')[0]);
    }
  }, [showExceptionModal]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = UserService.subscribe(setUsers);
    return () => unsub();
  }, []);

  useEffect(() => {
    PersonalService.getAll().then((list) => {
      const map: Record<string, PersonalRecord> = {};
      list.forEach((p) => {
        map[p.id] = p;
      });
      setPersonal(map);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const [y, m] = calendarMonth.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    PersonalService.getExceptionsForDriver(selectedId, start, end).then(setExceptions);
  }, [selectedId, calendarMonth]);

  useEffect(() => {
    if (!selectedId) return;
    const [y, m] = calendarMonth.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const dates: string[] = [];
    for (let d = 1; d <= lastDay; d++)
      dates.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    Promise.all(dates.map((date) => ShiftService.getAll(date))).then((arr) => {
      const map: Record<string, boolean> = {};
      arr.forEach((shifts, i) => {
        const date = dates[i];
        const worked = (shifts as { driverId?: string; assignedTo?: string }[]).some(
          (s) => String(s.driverId ?? s.assignedTo ?? '') === String(selectedId),
        );
        if (worked) map[date] = true;
      });
      setShiftsByDate(map);
    });
  }, [selectedId, calendarMonth]);

  useEffect(() => {
    setLoading(users.length === 0);
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        String(u.fullName ?? '')
          .toLowerCase()
          .includes(q) ||
        String(u.internalNumber ?? u.id ?? '')
          .toLowerCase()
          .includes(q),
    );
  }, [users, search]);

  const selectedUser = selectedId ? users.find((u) => String(u.id ?? u.uid) === selectedId) : null;
  const selectedPersonal = selectedId ? (personal[selectedId] ?? null) : null;

  const carneDays = useMemo(
    () =>
      selectedPersonal?.vencimiento_carne_salud
        ? daysToVencimiento(selectedPersonal.vencimiento_carne_salud)
        : null,
    [selectedPersonal],
  );
  const libretaDays = useMemo(
    () =>
      selectedPersonal?.vencimiento_libreta
        ? daysToVencimiento(selectedPersonal.vencimiento_libreta)
        : null,
    [selectedPersonal],
  );

  const exceptionDates = useMemo(() => new Set(exceptions.map((e) => e.date)), [exceptions]);

  const calendarDays = useMemo(() => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const startPad = first.getDay();
    const days: {
      date: string;
      isCurrentMonth: boolean;
      isWorked?: boolean;
      isException?: boolean;
      exceptionType?: string;
    }[] = [];
    for (let i = 0; i < startPad; i++) days.push({ date: '', isCurrentMonth: false });
    for (let d = 1; d <= last.getDate(); d++) {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const ex = exceptions.find((e) => e.date === date);
      days.push({
        date,
        isCurrentMonth: true,
        isWorked: shiftsByDate[date],
        isException: !!ex,
        exceptionType: ex?.type,
      });
    }
    while (days.length < DAYS_IN_CALENDAR) days.push({ date: '', isCurrentMonth: false });
    return days.slice(0, DAYS_IN_CALENDAR);
  }, [calendarMonth, shiftsByDate, exceptions]);

  const handleSaveException = async () => {
    if (!selectedId || !exceptionDate) return;
    setSaving(true);
    try {
      await PersonalService.setException({
        driverId: selectedId,
        date: exceptionDate,
        type: exceptionType,
      });
      setExceptions((prev) => {
        const filtered = prev.filter((e) => e.date !== exceptionDate);
        return [...filtered, { driverId: selectedId, date: exceptionDate, type: exceptionType }];
      });
      setShowExceptionModal(false);
      const [y, m] = calendarMonth.split('-').map(Number);
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const list = await PersonalService.getExceptionsForDriver(selectedId, start, end);
      setExceptions(list);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      <aside className="w-full md:w-72 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Users className="w-5 h-5 text-primary-500" />
          Talento
        </h2>
        <input
          type="search"
          placeholder="Buscar por nombre o legajo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full min-h-[44px] px-4 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500"
        />
        <div className="flex-1 overflow-y-auto space-y-1">
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            </div>
          )}
          {filtered.slice(0, 100).map((u) => {
            const id = String(u.id ?? u.uid ?? '');
            const rec = personal[id];
            const carneD = rec?.vencimiento_carne_salud
              ? daysToVencimiento(rec.vencimiento_carne_salud)
              : null;
            const libretaD = rec?.vencimiento_libreta
              ? daysToVencimiento(rec.vencimiento_libreta)
              : null;
            const worst =
              [carneD, libretaD].filter((x): x is number => x != null).sort((a, b) => a - b)[0] ??
              null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedId(id)}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 min-h-[44px] ${
                  selectedId === id
                    ? 'bg-primary-600/30 border border-primary-500/50'
                    : 'hover:bg-slate-800 border border-transparent'
                }`}
              >
                <SemaphoreIcon days={worst} />
                <span className="truncate flex-1">
                  {u.fullName ??
                    [u.firstName, u.lastName].filter(Boolean).join(' ') ??
                    u.internalNumber ??
                    id}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-4 md:p-6">
        {!selectedUser ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Users className="w-16 h-16 mb-4 opacity-50" />
            <p>Seleccione un conductor en la lista</p>
          </div>
        ) : (
          <>
            <header className="mb-6 pb-4 border-b border-slate-800">
              <h1 className="text-2xl font-bold">
                {selectedUser.fullName ??
                  [selectedUser.firstName, selectedUser.lastName].filter(Boolean).join(' ') ??
                  selectedUser.internalNumber}
              </h1>
              <p className="text-slate-400">
                Legajo {selectedUser.internalNumber ?? selectedUser.id} ·{' '}
                {selectedPersonal?.estado ?? '—'} · {selectedPersonal?.tipo ?? '—'}
              </p>
            </header>

            <section className="mb-6" aria-label="Cumplimiento legal">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Cumplimiento legal
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Carné de salud</p>
                  <div className="h-6 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        carneDays != null && carneDays < 0
                          ? 'bg-red-500'
                          : carneDays != null && carneDays < 30
                            ? 'bg-amber-500 animate-pulse'
                            : 'bg-emerald-500'
                      }`}
                      style={{
                        width:
                          carneDays != null && carneDays >= 0
                            ? Math.min(100, (carneDays / 90) * 100) + '%'
                            : '100%',
                      }}
                    />
                  </div>
                  <p className="text-xs mt-1">
                    {selectedPersonal?.vencimiento_carne_salud
                      ? carneDays != null && carneDays < 0
                        ? 'Vencido'
                        : `${carneDays ?? 0} días`
                      : 'Sin dato'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Libreta</p>
                  <div className="h-6 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        libretaDays != null && libretaDays < 0
                          ? 'bg-red-500'
                          : libretaDays != null && libretaDays < 30
                            ? 'bg-amber-500 animate-pulse'
                            : 'bg-emerald-500'
                      }`}
                      style={{
                        width:
                          libretaDays != null && libretaDays >= 0
                            ? Math.min(100, (libretaDays / 365) * 100) + '%'
                            : '100%',
                      }}
                    />
                  </div>
                  <p className="text-xs mt-1">
                    {selectedPersonal?.vencimiento_libreta
                      ? libretaDays != null && libretaDays < 0
                        ? 'Vencido'
                        : `${libretaDays ?? 0} días`
                      : 'Sin dato'}
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-6" aria-label="Calendario vivo">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Calendario
                </h3>
                <div className="flex items-center gap-2">
                  <input
                    type="month"
                    value={calendarMonth}
                    onChange={(e) => setCalendarMonth(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowExceptionModal(true)}
                    className="min-h-[44px] px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm"
                    data-testid="btn-asignar-excepcion"
                  >
                    Asignar excepción
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => (
                  <div key={d} className="text-xs text-slate-500 font-medium py-1">
                    {d}
                  </div>
                ))}
                {calendarDays.map((day, i) => (
                  <div
                    key={i}
                    data-testid={day.date ? `calendar-day-${day.date}` : undefined}
                    data-exception={day.isException ? day.exceptionType : undefined}
                    className={`min-h-[44px] flex items-center justify-center rounded-lg text-sm ${
                      !day.isCurrentMonth
                        ? 'bg-transparent text-slate-700'
                        : day.isException
                          ? 'bg-red-500/30 text-red-200'
                          : day.isWorked
                            ? 'bg-blue-500/30 text-blue-200'
                            : 'bg-slate-800/50 text-slate-400'
                    }`}
                    title={
                      day.date
                        ? day.isException
                          ? day.exceptionType
                          : day.isWorked
                            ? 'Trabajado'
                            : ''
                        : ''
                    }
                  >
                    {day.date ? new Date(day.date + 'T12:00:00').getDate() : ''}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Azul: trabajado · Verde: franco · Rojo: falta/excepción
              </p>
            </section>
          </>
        )}
      </main>

      {showExceptionModal && selectedId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => !saving && setShowExceptionModal(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">Asignar excepción</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-slate-400 text-sm mb-1">Fecha</label>
                <input
                  type="date"
                  value={exceptionDate}
                  onChange={(e) => setExceptionDate(e.target.value)}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  data-testid="exception-date-input"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1">Tipo</label>
                <select
                  value={exceptionType}
                  onChange={(e) => setExceptionType(e.target.value as DayException['type'])}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  data-testid="exception-type-select"
                >
                  {EXCEPTION_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowExceptionModal(false)}
                className="flex-1 min-h-[44px] rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveException}
                disabled={saving || !exceptionDate}
                className="flex-1 min-h-[44px] rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                data-testid="exception-modal-guardar"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
