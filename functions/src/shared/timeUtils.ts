/**
 * Helpers de tiempo / timezone Montevideo (-03:00).
 *
 * Se comparten entre Cloud Functions de distintos dominios.
 * Centralizar evita duplicación y asegura que el tratamiento de fecha/hora
 * sea consistente en toda la aplicación.
 */

/** Fecha YYYY-MM-DD de hoy en horario Montevideo (UTC-3). */
export function fechaHoyMVD(): string {
  const ahora = new Date();
  const mvd = new Date(ahora.getTime() - 3 * 60 * 60 * 1000);
  return mvd.toISOString().split('T')[0];
}

/** Hora HH:MM actual en horario Montevideo. */
export function hhmmAhoraMontevideo(): string {
  const now = new Date();
  const mvd = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return `${String(mvd.getUTCHours()).padStart(2, '0')}:${String(mvd.getUTCMinutes()).padStart(2, '0')}`;
}

/** Tipo de día operativo en Montevideo (para tabla de frecuencias). */
export function tipoDiaHoyMontevideo(): 'Hábiles' | 'Sábados' | 'Domingos' {
  const now = new Date();
  const mvd = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const dow = mvd.getUTCDay();
  if (dow === 0) return 'Domingos';
  if (dow === 6) return 'Sábados';
  return 'Hábiles';
}

/** "HH:MM" → minutos desde medianoche. null si inválido. */
export function hhmmToMin(s: string): number | null {
  const m = s?.match?.(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}
