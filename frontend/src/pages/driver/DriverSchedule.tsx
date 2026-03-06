import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Calendar, Clock, MapPin, Bus, AlertCircle } from 'lucide-react';
import { DriverService } from '../../services/api';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface ScheduleItem {
  id: number;
  date: string; // ISO
  dateStr: string;
  dayOfWeek: string;
  serviceNumber: string;
  line: string;
  startTime: string;
  endTime: string;
  vehicle: string | null;
  variant: string;
  notes: string;
  shiftType: 'MATUTINO' | 'VESPERTINO';
  isHolidays: boolean;
}

const DriverSchedule = () => {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Filter controls
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    loadSchedule();
  }, [viewMode, currentDate]);

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      const data = await DriverService.getSchedule(month, year, viewMode);
      setSchedule((data || []) as ScheduleItem[]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getShiftColor = (type: string) => {
    return type === 'MATUTINO' ? 'border-amber-400' : 'border-blue-400';
  };

  const getShiftBadge = (type: string) => {
    return type === 'MATUTINO' ? 'bg-amber-400/20 text-amber-300' : 'bg-blue-400/20 text-blue-300';
  };

  // Group by Week Logic (Simple grouping by week number is tricky without moment/fns helper, so just listing vertically for "Monthly Diagram" style is also fine, often preferred.
  // But let's add a visual separator for weeks.)

  return (
    <div className="space-y-4 pb-24 animate-fade-in-up md:max-w-xl md:mx-auto">
      {/* Header */}
      <div className="bg-slate-900/80 backdrop-blur sticky top-0 z-10 p-4 border-b border-slate-800 rounded-b-2xl shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            Mi Diagrama
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('week')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                viewMode === 'week' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400',
              )}
            >
              Semana
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                viewMode === 'month' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400',
              )}
            >
              Mes
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between bg-slate-800/50 rounded-xl p-2 md:p-3">
          <button
            onClick={() =>
              setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))
            }
            className="p-1 hover:bg-slate-700 rounded-lg"
          >
            <ChevronDown className="rotate-90 w-5 h-5 text-slate-400" />
          </button>
          <span className="text-lg font-bold text-white uppercase tracking-wider">
            {format(currentDate, 'MMMM yyyy', { locale: es })}
          </span>
          <button
            onClick={() =>
              setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))
            }
            className="p-1 hover:bg-slate-700 rounded-lg"
          >
            <ChevronDown className="-rotate-90 w-5 h-5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
        </div>
      ) : schedule.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Calendar className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p>No hay servicios asignados para este período.</p>
        </div>
      ) : (
        <div className="space-y-3 px-2">
          {schedule.map((item, index) => {
            // Week Separator (logic: if Monday and not first, or date gap)
            const showWeekSep = index > 0 && new Date(item.date).getDay() === 1; // Monday starts new block

            return (
              <div key={item.id}>
                {showWeekSep && <div className="h-4"></div>}

                <div
                  onClick={() => toggleExpand(item.id)}
                  className={clsx(
                    'bg-slate-800 rounded-2xl p-4 border-l-4 shadow-sm hover:bg-slate-700/80 transition-all cursor-pointer relative overflow-hidden',
                    getShiftColor(item.shiftType),
                  )}
                >
                  {/* Abstract BG Pattern for aesthetics */}
                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <Bus className="w-24 h-24" />
                  </div>

                  <div className="flex justify-between items-start relative z-10">
                    {/* Left: Date */}
                    <div className="flex flex-col items-center justify-center bg-slate-900/50 rounded-xl p-2 min-w-[3.5rem] border border-slate-700/50">
                      <span className="text-xs font-bold text-slate-400 uppercase">
                        {item.dayOfWeek}
                      </span>
                      <span className="text-xl font-black text-white">
                        {format(parseISO(item.date), 'dd')}
                      </span>
                    </div>

                    {/* Center: Time & Line */}
                    <div className="flex-1 px-4 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-3xl font-black text-white tracking-tighter">
                          {item.startTime}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">HS</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={clsx(
                            'text-xs px-2 py-0.5 rounded font-bold uppercase',
                            getShiftBadge(item.shiftType),
                          )}
                        >
                          {item.shiftType}
                        </span>
                        <span className="text-slate-400 text-sm">•</span>
                        <span className="text-sm font-bold text-slate-200">Línea {item.line}</span>
                      </div>
                    </div>

                    {/* Right: Service Number */}
                    <div className="flex flex-col items-end justify-center">
                      <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                        Servicio
                      </span>
                      <span className="text-2xl font-bold bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">
                        {item.serviceNumber}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedId === item.id && (
                    <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-3 animate-in fade-in slide-in-from-top-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-700/50">
                          <span className="text-xs text-slate-500 block mb-1">Coche Asignado</span>
                          <div className="flex items-center gap-2 text-emerald-400 font-bold">
                            <Bus className="w-4 h-4" />
                            {item.vehicle ? `Int. ${item.vehicle}` : 'Sin Asignar'}
                          </div>
                        </div>
                        <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-700/50">
                          <span className="text-xs text-slate-500 block mb-1">Fin de Jornada</span>
                          <div className="flex items-center gap-2 text-slate-300 font-bold">
                            <Clock className="w-4 h-4" />
                            {item.endTime || '--:--'}
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-700/50">
                        <span className="text-xs text-slate-500 block mb-1">
                          Recorrido / Variante
                        </span>
                        <div className="flex items-start gap-2 text-slate-300 text-sm">
                          <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-indigo-400" />
                          {item.variant || 'Standard'}
                        </div>
                      </div>

                      {item.notes && (
                        <div className="bg-yellow-500/10 p-3 rounded-xl border border-yellow-500/20">
                          <div className="flex items-start gap-2 text-yellow-200 text-sm">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            {item.notes}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Chevron Hint */}
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 opacity-30">
                    {expandedId === item.id ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DriverSchedule;
