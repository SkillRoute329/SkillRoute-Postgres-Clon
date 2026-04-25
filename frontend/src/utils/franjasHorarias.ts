/**
 * franjasHorarias.ts — Fuente única de verdad para franjas y turnos
 * ===================================================================
 * DIRECTRIZ 2026-04-24: datos reales del dominio, no categorías inventadas.
 *
 * Antes había etiquetas locales en cada página (`madrugada | mañana | tarde
 * | noche`) con rangos arbitrarios — no correspondían ni a cómo el STM
 * clasifica horarios ni a cómo los operadores organizan turnos de personal.
 * Este módulo separa explícitamente dos dimensiones que nunca debieron
 * mezclarse:
 *
 *   1. **FranjaSTM** — clasificación del servicio según el STM/IMM.
 *      Es binaria: `regular` vs `especial`. El STM le pone `especial: true`
 *      a variantes nocturnas y refuerzos en su propia API (ver
 *      immScheduleService.ts, interface IMMVariante). No inventamos el
 *      corte horario — el STM ya lo dice.
 *
 *   2. **TurnoPersonal** — asignación interna de personal del operador.
 *      Cada empresa (UCOT, CUTCSA, COME, COETC) puede tener su propio
 *      esquema. Los defaults acá son placeholders hasta que Admin >
 *      Parámetros Operativos permita configurar por operador.
 *
 * Adicional: `TipoDia` — ya existía bien tipado en immScheduleService
 * (`HABIL | SABADO | DOMINGO | ESPECIAL`), lo reexportamos para uso común.
 *
 * COMPATIBILIDAD: la función `franjaLegacy()` al final reproduce las 4
 * etiquetas inventadas (madrugada/mañana/tarde/noche) SÓLO para el código
 * legacy que todavía las espera visualmente. Marcada @deprecated —
 * migrar a clasificarFranjaSTM / clasificarTurnoPersonal.
 */

// ─── Tipos canónicos ─────────────────────────────────────────────────────────

/** Clasificación STM del servicio (según flag `especial` del IMM). */
export type FranjaSTM = 'regular' | 'especial';

/** Tipo de día operativo — mismos valores que el STM usa en sus minutas. */
export type TipoDia = 'HABIL' | 'SABADO' | 'DOMINGO' | 'ESPECIAL';

/** Un turno de personal (cómo el operador asigna su gente). */
export interface TurnoPersonal {
  /** Identificador estable para queries/filtros. */
  id: 'primer' | 'segundo' | 'tarde' | 'noche' | string;
  /** Label visible al usuario — puede variar por operador. */
  label: string;
  /** Hora de inicio en formato HH:MM (24h). */
  horaInicio: string;
  /** Hora de fin en formato HH:MM (24h). Puede cruzar medianoche. */
  horaFin: string;
}

// ─── Turnos por defecto por operador ─────────────────────────────────────────

/**
 * Defaults sensatos basados en esquemas típicos de operadores uruguayos.
 * Son placeholders — la fuente de verdad debe ser
 * `parametros_operativos/{agencyId}/turnos` en Firestore, editable desde
 * Admin > Parámetros Operativos (pendiente: otra sesión).
 *
 * Claves = agencyId numérico (70=UCOT, 50=CUTCSA, 20=COME, 10=COETC).
 */
export const TURNOS_DEFAULT_POR_OPERADOR: Record<number, TurnoPersonal[]> = {
  70: [
    { id: 'primer', label: 'Primer turno', horaInicio: '04:30', horaFin: '12:30' },
    { id: 'segundo', label: 'Segundo (mediodía)', horaInicio: '10:00', horaFin: '18:00' },
    { id: 'tarde', label: 'Tarde', horaInicio: '13:00', horaFin: '21:00' },
    { id: 'noche', label: 'Noche', horaInicio: '20:00', horaFin: '04:30' },
  ],
  50: [
    { id: 'primer', label: 'Primer turno', horaInicio: '04:30', horaFin: '12:30' },
    { id: 'segundo', label: 'Segundo (mediodía)', horaInicio: '10:00', horaFin: '18:00' },
    { id: 'tarde', label: 'Tarde', horaInicio: '13:00', horaFin: '21:00' },
    { id: 'noche', label: 'Noche', horaInicio: '20:00', horaFin: '04:30' },
  ],
  20: [
    { id: 'primer', label: 'Primer turno', horaInicio: '04:30', horaFin: '12:30' },
    { id: 'segundo', label: 'Segundo (mediodía)', horaInicio: '10:00', horaFin: '18:00' },
    { id: 'tarde', label: 'Tarde', horaInicio: '13:00', horaFin: '21:00' },
    { id: 'noche', label: 'Noche', horaInicio: '20:00', horaFin: '04:30' },
  ],
  10: [
    { id: 'primer', label: 'Primer turno', horaInicio: '04:30', horaFin: '12:30' },
    { id: 'segundo', label: 'Segundo (mediodía)', horaInicio: '10:00', horaFin: '18:00' },
    { id: 'tarde', label: 'Tarde', horaInicio: '13:00', horaFin: '21:00' },
    { id: 'noche', label: 'Noche', horaInicio: '20:00', horaFin: '04:30' },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Clasifica un viaje/variante según el flag `especial` del STM.
 * **Este es el único dato canónico que el STM publica sobre franjas.**
 *
 * @example
 * const franja = clasificarFranjaSTM(variante); // 'regular' | 'especial'
 */
export function clasificarFranjaSTM(variante: { especial?: boolean | null }): FranjaSTM {
  return variante?.especial === true ? 'especial' : 'regular';
}

/** Convierte "HH:MM" en minutos desde 00:00. Devuelve 0 si el formato es inválido. */
function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return 0;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  return hours * 60 + mins;
}

/**
 * Dado una hora y el operador, devuelve el turno personal correspondiente.
 * Retorna `null` si no hay match (raro — los turnos suelen cubrir 24h).
 *
 * Maneja turnos que cruzan medianoche (ej. "20:00–04:30").
 *
 * @param hora "HH:MM" de la salida o asignación
 * @param agencyId código numérico del operador (70=UCOT, etc.)
 * @param turnosOverride opcional — si vas a cargar turnos de Firestore, pasalos acá
 */
export function clasificarTurnoPersonal(
  hora: string,
  agencyId: number,
  turnosOverride?: TurnoPersonal[],
): TurnoPersonal | null {
  const turnos = turnosOverride ?? TURNOS_DEFAULT_POR_OPERADOR[agencyId] ?? TURNOS_DEFAULT_POR_OPERADOR[70]!;
  const mHora = toMinutes(hora);
  for (const t of turnos) {
    const mIni = toMinutes(t.horaInicio);
    const mFin = toMinutes(t.horaFin);
    if (mIni <= mFin) {
      // Turno dentro del mismo día (ej. 10:00 - 18:00)
      if (mHora >= mIni && mHora < mFin) return t;
    } else {
      // Turno que cruza medianoche (ej. 20:00 - 04:30)
      if (mHora >= mIni || mHora < mFin) return t;
    }
  }
  return null;
}

/**
 * Dado una fecha, devuelve el tipo de día operativo según las minutas STM.
 * (Por ahora no tiene excepciones de feriados — cuando Admin > Feriados
 * esté conectado, aceptar un parámetro `feriados: Set<string>`).
 */
export function tipoDiaDe(d: Date): TipoDia {
  const dow = d.getDay(); // 0=dom, 6=sáb
  if (dow === 0) return 'DOMINGO';
  if (dow === 6) return 'SABADO';
  return 'HABIL';
}

// ─── Compatibilidad con código legacy ────────────────────────────────────────

/**
 * @deprecated Usar `clasificarTurnoPersonal(hora, agencyId)` o
 * `clasificarFranjaSTM(variante)`. Esta función reproduce las 4 etiquetas
 * inventadas que había antes (madrugada/mañana/tarde/noche) SÓLO para el
 * código legacy que todavía las espera visualmente. Migrar cuando se toque
 * el archivo.
 */
export type FranjaLegacy = 'madrugada' | 'manana' | 'tarde' | 'noche';

/** @deprecated — ver {@link FranjaLegacy}. */
export function franjaLegacy(hora: string): FranjaLegacy {
  const m = toMinutes(hora);
  if (m < 6 * 60) return 'madrugada';
  if (m < 12 * 60) return 'manana';
  if (m < 18 * 60) return 'tarde';
  return 'noche';
}

/**
 * @deprecated — mapping de las etiquetas legacy a labels humanos.
 * Migrar a los labels dinámicos del turno personal cuando se pueda.
 */
export const FRANJA_LEGACY_LABEL: Record<FranjaLegacy, string> = {
  madrugada: 'Madrugada',
  manana: 'Mañana',
  tarde: 'Tarde',
  noche: 'Noche',
};
