/**
 * Reglas sindicales UNOTT – Descanso obligatorio entre turnos.
 * UCOT_BUSINESS_RULES.md: entre el fin del turno anterior y el inicio del nuevo
 * debe haber al menos 9 horas de descanso.
 */

const MIN_REST_HOURS = 9;

/** Resultado de la validación de asignación */
export interface ValidateAssignmentResult {
  valid: boolean;
  restHours?: number;
  error?: string;
}

/**
 * Parsea una hora en formato "HH:mm" o "HH:mm:ss" a minutos desde medianoche.
 * Devuelve NaN si el formato no es válido.
 */
function parseTimeToMinutes(value: string): number {
  if (!value || typeof value !== 'string') return NaN;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return NaN;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = match[3] ? parseInt(match[3], 10) : 0;
  if (h < 0 || h > 23 || m < 0 || m > 59) return NaN;
  return h * 60 + m + s / 60;
}

/**
 * Parsea una fecha/hora ISO o solo hora a timestamp (ms).
 * Para "HH:mm" usa refDate como día de referencia.
 */
function toTimestamp(value: string, refDate: Date): number {
  if (!value || typeof value !== 'string') return NaN;
  const trimmed = value.trim();
  if (/^\d{1,2}:\d{2}/.test(trimmed)) {
    const minutes = parseTimeToMinutes(trimmed);
    if (Number.isNaN(minutes)) return NaN;
    const d = new Date(refDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime() + minutes * 60 * 1000;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? NaN : parsed.getTime();
}

/**
 * Valida que entre el fin del turno anterior y el inicio del turno nuevo
 * haya al menos 9 horas de descanso (regla sindical UNOTT).
 *
 * @param _driverId - Identificador del conductor (reservado para futuras reglas).
 * @param newShiftStartTime - Inicio del nuevo turno (ISO o "HH:mm").
 * @param previousShiftEndTime - Fin del turno anterior (ISO o "HH:mm").
 * @returns Resultado con valid, restHours y opcionalmente error.
 */
export function validateAssignment(
  _driverId: string,
  newShiftStartTime: string,
  previousShiftEndTime: string,
): ValidateAssignmentResult {
  if (!newShiftStartTime || !previousShiftEndTime) {
    return {
      valid: true,
      error: undefined,
    };
  }

  const now = new Date();
  const refDatePrev = new Date(now);
  refDatePrev.setDate(refDatePrev.getDate() - 1);
  const refDateNew = new Date(now);

  const endTs = toTimestamp(previousShiftEndTime, refDatePrev);
  const startTs = toTimestamp(newShiftStartTime, refDateNew);

  const endMinutes = parseTimeToMinutes(previousShiftEndTime);
  const startMinutes = parseTimeToMinutes(newShiftStartTime);
  if (!Number.isNaN(endMinutes) && !Number.isNaN(startMinutes)) {
    let restMinutes = startMinutes - endMinutes;
    if (restMinutes < 0) restMinutes += 24 * 60;
    const restHours = restMinutes / 60;
    const valid = restHours >= MIN_REST_HOURS;
    return {
      valid,
      restHours: Math.round(restHours * 100) / 100,
      error: valid
        ? undefined
        : `Descanso obligatorio: entre el fin del turno anterior (${previousShiftEndTime}) y el inicio del nuevo (${newShiftStartTime}) hay ${restHours.toFixed(1)} h. Se requieren al menos ${MIN_REST_HOURS} h.`,
    };
  }

  if (Number.isNaN(endTs) || Number.isNaN(startTs)) {
    return { valid: true, error: undefined };
  }

  const restMs = startTs - endTs;
  const restHours = restMs / (1000 * 60 * 60);
  const valid = restHours >= MIN_REST_HOURS;

  return {
    valid,
    restHours: Math.round(restHours * 100) / 100,
    error: valid
      ? undefined
      : `Descanso obligatorio: se requieren al menos ${MIN_REST_HOURS} h entre turnos. Actual: ${restHours.toFixed(1)} h.`,
  };
}

/** Máximo de horas de conducción en el día permitidas por UCOT (doble turno). */
export const MAX_HORAS_DIA_UCOT = 12;

export interface ValidateDobleTurnoResult {
  valid: boolean;
  totalHoras?: number;
  error?: string;
}

/**
 * Valida habilitación de doble turno: descanso >= 9h entre turnos y total de horas del día no exceda MAX_HORAS_DIA_UCOT.
 */
export function validateDobleTurno(
  turno1Start: string,
  turno1End: string,
  turno2Start: string,
  turno2End: string,
): ValidateDobleTurnoResult {
  const rest = validateAssignment('', turno2Start, turno1End);
  if (!rest.valid) {
    return { valid: false, error: rest.error };
  }
  const m1 = parseTimeToMinutes(turno1End) - parseTimeToMinutes(turno1Start);
  const m2 = parseTimeToMinutes(turno2End) - parseTimeToMinutes(turno2Start);
  if (Number.isNaN(m1) || Number.isNaN(m2)) {
    return { valid: true };
  }
  const totalHoras = (m1 + m2) / 60;
  const valid = totalHoras <= MAX_HORAS_DIA_UCOT;
  return {
    valid,
    totalHoras: Math.round(totalHoras * 100) / 100,
    error: valid
      ? undefined
      : `Horas de seguridad UCOT: máximo ${MAX_HORAS_DIA_UCOT} h/día. Total doble turno: ${totalHoras.toFixed(1)} h.`,
  };
}
