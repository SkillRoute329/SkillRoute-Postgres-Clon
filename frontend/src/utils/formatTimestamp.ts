/**
 * formatTimestamp.ts — Helpers de formateo consistente para Montevideo
 * =====================================================================
 * Pre-CUTCSA #5 (2026-04-23)
 *
 * Unifica el formateo de fechas/horas en toda la app usando `America/Montevideo`
 * como zona horaria canonical. Evita el desfase de 3h que aparece cuando el
 * servidor corre en UTC (default en Cloud Functions) y el cliente interpreta
 * el timestamp en local del navegador.
 *
 * Reemplaza usos de:
 *   new Date(x).toLocaleTimeString()
 *   new Date(x).toLocaleString()
 *   ts.toDate().toLocaleTimeString()
 */

const TZ = 'America/Montevideo';
const LOCALE = 'es-UY';

/**
 * Acepta cualquier input razonable (Firestore Timestamp, Date, number ms,
 * string ISO) y devuelve un Date. null/undefined → null.
 */
function toDate(input: unknown): Date | null {
  if (input == null) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === 'number') return new Date(input);
  if (typeof input === 'string') {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Firestore Timestamp — pato-tipo
  const fsTs = input as { toDate?: () => Date; toMillis?: () => number; seconds?: number };
  if (typeof fsTs.toDate === 'function') {
    try {
      const d = fsTs.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (typeof fsTs.toMillis === 'function') {
    try {
      return new Date(fsTs.toMillis());
    } catch {
      return null;
    }
  }
  if (typeof fsTs.seconds === 'number') return new Date(fsTs.seconds * 1000);
  return null;
}

/**
 * "HH:MM" en Montevideo. Ej: "14:32".
 */
export function formatHoraMvd(input: unknown, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * "HH:MM:SS" en Montevideo. Ej: "14:32:08".
 */
export function formatHoraSegundosMvd(input: unknown, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * "DD/MM/YYYY HH:MM" en Montevideo. Ej: "23/04/2026 14:32".
 */
export function formatFechaHoraMvd(input: unknown, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * "DD/MM/YYYY" en Montevideo.
 */
export function formatFechaMvd(input: unknown, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Relativo ("hace 5 min", "hace 2 h", "hoy 14:32").
 * Para timestamps recientes — antigüedad > 24 h devuelve formato completo.
 */
export function formatRelativoMvd(input: unknown, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHora = Math.round(diffMin / 60);
  if (diffSec < 10) return 'ahora';
  if (diffSec < 60) return `hace ${diffSec} s`;
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffHora < 24) return `hoy ${formatHoraMvd(d)}`;
  return formatFechaHoraMvd(d);
}

/**
 * ISO string con offset Montevideo (-0300). Útil para logs / API payloads.
 */
export function toIsoMvd(input: unknown): string | null {
  const d = toDate(input);
  if (!d) return null;
  // Intl no da offset directo — usamos toLocaleString y reconstruimos
  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const y = get('year');
  const mo = get('month');
  const da = get('day');
  const h = get('hour');
  const mi = get('minute');
  const s = get('second');
  // Uruguay no usa DST desde 2015 — siempre UTC-3
  return `${y}-${mo}-${da}T${h}:${mi}:${s}-03:00`;
}

/**
 * Parsea "HH:MM" (o "HH:MM:SS") a minutos desde las 00:00.
 *
 * FASE 5.16: este parser estaba reimplementado ~10 veces (CEODashboard
 * parseHoraToMinutes, OTPDashboard horaToMin, driverTimelineUtils
 * parseHoraTimeline, variantIntelligenceService hhmmToMin, etc.). Todas
 * con la misma semántica "parte inválida = 0". Esta es la única.
 *
 * Partes inválidas/ausentes cuentan como 0 (NUNCA NaN) para no romper
 * comparaciones aritméticas. Si necesitás "inválido = centinela", NO uses
 * esta — schedulesService.hhmmToMinutes devuelve null y
 * BoletinInspeccion.horaAMinutos devuelve -1 a propósito.
 */
export function hhmmAMin(hhmm: string): number {
  const [h, m] = String(hhmm ?? '').trim().split(':');
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

/**
 * Formato completo "DD/MM/YYYY HH:MM:SS" en Montevideo.
 */
export function formatTimestampMvd(input: unknown, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

// ─── Export default para imports rápidos ─────────────────────────────────
export default {
  hora: formatHoraMvd,
  horaSegundos: formatHoraSegundosMvd,
  fecha: formatFechaMvd,
  fechaHora: formatFechaHoraMvd,
  relativo: formatRelativoMvd,
  iso: toIsoMvd,
  hhmmAMin,
  timestamp: formatTimestampMvd,
};
