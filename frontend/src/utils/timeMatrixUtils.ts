import { DateTime } from 'luxon';

// Time Utils for Matrix Logic

export const getStatusColor = (scheduled: string, actual?: string | null): string => {
  if (!actual) {
    // Not passed yet. Check if it's NEXT
    // Simplified logic: If scheduled is within next 20 mins?
    return 'bg-slate-800 text-slate-300';
  }
  return 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30'; // Passed
};

export const getDelayBorder = (scheduled: string): string => {
  const now = DateTime.now();
  const [h, m] = scheduled.split(':').map(Number);
  const schedTime = now.set({ hour: h, minute: m });

  // If scheduled was > 5 mins ago and no control -> Late
  if (schedTime.diff(now, 'minutes').minutes < -5) {
    return 'border border-red-500/50 shadow-[inset_0_0_10px_rgba(239,68,68,0.2)]';
  }
  return 'border border-slate-700';
};

export const calculateProjectedTimes = (
  originalSchedule: Record<string, string>, // { StopName: "HH:mm" }
  deltaMinutes: number,
): Record<string, string> => {
  // Propagate delta to all times
  const projected: Record<string, string> = {};

  Object.entries(originalSchedule).forEach(([stop, time]) => {
    if (!time) return;
    const dt = DateTime.fromFormat(time, 'HH:mm');
    const newDt = dt.plus({ minutes: deltaMinutes });
    projected[stop] = newDt.toFormat('HH:mm');
  });

  return projected;
};
