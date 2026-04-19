/**
 * Motor de Rotación de Personal.
 * Función pura generarRotacion: cruza personal, flota y cartones; aplica 15_15 / semana_semana y día de descanso.
 * Incluye bloqueo automático por ficha médica vencida (Skill 7: Gestión Talento/Salud).
 */
import type {
  AsignacionGenerada,
  PersonalRotacion,
  ReglaRotacion,
  ServicioCarton,
  VehiculoRotacion,
} from '../types/rotation';
import type { Feriado } from './feriadosService';

/** Verifica si un documento de salud/habilitación está vencido. */
function isDocumentoVencido(
  fechaVencimiento: string | undefined | null,
  fechaReferencia: string,
): boolean {
  if (!fechaVencimiento) return false; // Sin fecha registrada → no bloquea (pero genera advertencia)
  return fechaReferencia > fechaVencimiento;
}

/** Resultado del chequeo de aptitud para un conductor. */
export interface AptitudResult {
  apto: boolean;
  motivos: string[];
}

/** Chequea la aptitud médica y documental de un conductor. */
export function verificarAptitud(
  personal: PersonalRotacion,
  fechaReferencia: string,
): AptitudResult {
  const motivos: string[] = [];

  const carneSalud = (personal as Record<string, unknown>).carneSaludVencimiento as
    | string
    | undefined;
  const libretaProfesional = (personal as Record<string, unknown>).libretaProfesionalVencimiento as
    | string
    | undefined;
  const suspendido = (personal as Record<string, unknown>).suspendido as boolean | undefined;
  const aptoPsicofisico = (personal as Record<string, unknown>).aptoPsicofisico as
    | boolean
    | undefined;

  if (isDocumentoVencido(carneSalud, fechaReferencia)) {
    motivos.push(`Carné de Salud vencido (${carneSalud})`);
  }
  if (isDocumentoVencido(libretaProfesional, fechaReferencia)) {
    motivos.push(`Libreta Profesional vencida (${libretaProfesional})`);
  }
  if (suspendido === true) {
    motivos.push('Conductor suspendido administrativamente');
  }
  if (aptoPsicofisico === false) {
    motivos.push('No apto psicofísico');
  }

  return { apto: motivos.length === 0, motivos };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toEpochDay(dateStr: string): number {
  return Math.floor(new Date(dateStr + 'T12:00:00').getTime() / DAY_MS);
}

function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay();
}

function weekNumber(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return 1 + Math.floor((d.getTime() - yearStart.getTime()) / (7 * DAY_MS));
}

/** Determina si el día es de descanso para el conductor según patronDescanso. */
function esDiaDescanso(
  dateStr: string,
  patronDescanso: PersonalRotacion['patronDescanso'],
  diaDescansoSemana?: number,
  seedAlternativa?: number,
): boolean {
  const dow = dayOfWeek(dateStr);
  if (diaDescansoSemana !== undefined && diaDescansoSemana >= 0 && diaDescansoSemana <= 6) {
    return dow === diaDescansoSemana;
  }
  switch (patronDescanso) {
    case 'lunes':
      return dow === 1;
    case 'martes':
      return dow === 2;
    case 'miercoles':
      return dow === 3;
    case 'jueves':
      return dow === 4;
    case 'viernes':
      return dow === 5;
    case 'sabado':
      return dow === 6;
    case 'domingo':
      return dow === 0;
    case 'fin_de_semana_rotativo': {
      const wn = weekNumber(dateStr);
      const useSabado = (seedAlternativa ?? wn) % 2 === 0;
      return useSabado ? dow === 6 : dow === 0;
    }
    default:
      return false;
  }
}

/**
 * Para 15_15: alterna por bloques de 15 días (0-14 = bloque 0, 15-29 = bloque 1, ...).
 * Para semana_semana: alterna por semana (semana par = turno 1, impar = turno 2).
 * Para fijo: siempre turno actual del personal.
 */
function turnoParaFecha(
  dateStr: string,
  regimen: ReglaRotacion['regimen'],
  turnoActual: PersonalRotacion['turnoActual'],
  epochStart: number,
): 1 | 2 | 3 {
  const epochDay = toEpochDay(dateStr);
  const dayOffset = epochDay - epochStart;

  if (regimen === 'fijo') {
    return turnoActual;
  }

  if (regimen === '15_15') {
    const bloque = Math.floor(dayOffset / 15) % 2;
    return (bloque === 0 ? turnoActual : turnoActual === 1 ? 2 : turnoActual === 2 ? 1 : 3) as
      | 1
      | 2
      | 3;
  }

  if (regimen === 'semana_semana') {
    const wn = weekNumber(dateStr);
    const par = wn % 2 === 0;
    return (par ? turnoActual : turnoActual === 1 ? 2 : turnoActual === 2 ? 1 : 3) as 1 | 2 | 3;
  }

  return turnoActual;
}

export interface GenerarRotacionParams {
  fechaInicio: string;
  fechaFin: string;
  personal: PersonalRotacion[];
  reglas: ReglaRotacion[];
  flota: VehiculoRotacion[];
  cartones: ServicioCarton[];
  feriados?: Feriado[];
}

/**
 * Genera la matriz de asignaciones para el rango de fechas.
 * - Asigna personal con coche fijo a su coche respetando 15_15 o semana_semana.
 * - Marca día de descanso según patronDescanso.
 * - Deja huecos (driverId null, esLista true) para el Listero (personal de lista).
 */
export function generarRotacion(params: GenerarRotacionParams): AsignacionGenerada[] {
  const { fechaInicio, fechaFin, personal, reglas, flota, cartones, feriados = [] } = params;
  const reglasMap = new Map(reglas.map((r) => [r.id!, r]));
  const cocheToPersonal = new Map<string, PersonalRotacion>();
  personal.forEach((p) => {
    if (p.cocheFijo) cocheToPersonal.set(String(p.cocheFijo).trim(), p);
  });
  const vehiculosByNumber = new Map(flota.map((v) => [String(v.internalNumber).trim(), v]));

  const startEpoch = toEpochDay(fechaInicio);
  const endEpoch = toEpochDay(fechaFin);
  const results: AsignacionGenerada[] = [];

  for (let epoch = startEpoch; epoch <= endEpoch; epoch++) {
    const d = new Date(epoch * DAY_MS);
    const dateStr = d.toISOString().split('T')[0];
    
    // Verificamos si este día es Feriado
    const mmdd = dateStr.substring(5);
    const feriado = feriados.find((f) => f.fecha === dateStr || (f.recurrente && f.fecha.substring(5) === mmdd));

    cartones.forEach((svc) => {
      const vehicleNum = (svc.vehicleInternalNumber ?? '').toString().trim();
      if (!vehicleNum) return;

      const vehicle = vehiculosByNumber.get(vehicleNum);
      const vehicleId = vehicle?.id ?? vehicleNum;

      const conductor = cocheToPersonal.get(vehicleNum);
      const regla = conductor ? reglasMap.get(conductor.reglaId) : undefined;

      if (!conductor || !regla) {
        results.push({
          date: dateStr,
          vehicleId,
          vehicleInternalNumber: vehicleNum,
          serviceId: svc.serviceNumber,
          serviceNumber: svc.serviceNumber,
          lineCode: svc.lineCode,
          startTime: svc.startTime,
          endTime: svc.endTime,
          driverId: null,
          turno: 1,
          esLista: true,
          esFeriado: !!feriado,
          feriadoGrilla: feriado?.tipoHorario,
        });
        return;
      }

      // ── BLOQUEO POR APTITUD MÉDICA ─────────────────────────────────
      // Skill 7 (Gestión Talento/Salud): Impide asignar servicios a personal
      // con ficha médica vencida, libreta expirada o suspensión activa.
      const aptitud = verificarAptitud(conductor, dateStr);
      if (!aptitud.apto) {
        results.push({
          date: dateStr,
          vehicleId,
          vehicleInternalNumber: vehicleNum,
          serviceId: svc.serviceNumber,
          serviceNumber: svc.serviceNumber,
          lineCode: svc.lineCode,
          startTime: svc.startTime,
          endTime: svc.endTime,
          driverId: null,
          internalNumber: conductor.internalNumber,
          fullName: conductor.fullName,
          turno: turnoParaFecha(dateStr, regla.regimen, conductor.turnoActual, startEpoch),
          esLista: true,
          bloqueoPorAptitud: true,
          motivosBloqueo: aptitud.motivos,
          esFeriado: !!feriado,
          feriadoGrilla: feriado?.tipoHorario,
        });
        return;
      }

      const descanso = esDiaDescanso(
        dateStr,
        conductor.patronDescanso,
        conductor.diaDescansoSemana,
        toEpochDay(conductor.createdAt ?? fechaInicio),
      );

      if (descanso) {
        results.push({
          date: dateStr,
          vehicleId,
          vehicleInternalNumber: vehicleNum,
          serviceId: svc.serviceNumber,
          serviceNumber: svc.serviceNumber,
          lineCode: svc.lineCode,
          startTime: svc.startTime,
          endTime: svc.endTime,
          driverId: null,
          internalNumber: conductor.internalNumber,
          fullName: conductor.fullName,
          turno: turnoParaFecha(dateStr, regla.regimen, conductor.turnoActual, startEpoch),
          esLista: true,
          diaLibre: true,
          esFeriado: !!feriado,
          feriadoGrilla: feriado?.tipoHorario,
        });
        return;
      }

      const turno = turnoParaFecha(dateStr, regla.regimen, conductor.turnoActual, startEpoch);
      results.push({
        date: dateStr,
        vehicleId,
        vehicleInternalNumber: vehicleNum,
        serviceId: svc.serviceNumber,
        serviceNumber: svc.serviceNumber,
        lineCode: svc.lineCode,
        startTime: svc.startTime,
        endTime: svc.endTime,
        driverId: conductor.id ?? conductor.userId ?? null,
        internalNumber: conductor.internalNumber,
        fullName: conductor.fullName,
        turno,
        esLista: false,
        diaLibre: false,
        esFeriado: !!feriado,
        feriadoGrilla: feriado?.tipoHorario,
      });
    });
  }

  return results;
}
