/**
 * AssignmentService: Motor de Rotación Dinámica UCOT 2026.
 * Vincula Coche (ID) ↔ Servicio (ID) ↔ Conductor (UID).
 * - reasignarPersonal: cambia conductor sin borrar histórico; valida 9h descanso.
 * - reportarAveria: marca servicio "PENDIENTE DE COCHE" y sugiere reemplazo por categoría (Retén/Reserva).
 */
import { ServicioEstadoService } from './firestore/servicioEstado';
import { ProgramacionDiariaService } from './firestore/programacionDiaria';
import { ActiveAssignmentsService } from './firestore/activeAssignments';
import { getCategoriaReemplazoParaAveria, getCochesByCategoria } from '../data/ucotMaster2026';
import { validateAssignment } from '../utils/syndicateRules';
import type { Vehicle } from './firestore/types';

export interface ReasignarPersonalOptions {
  date: string;
  servicioId: string;
  nuevoChoferId: string;
  /** Coche actual (se mantiene). Si no se pasa, se usa el del estado del servicio. */
  cocheId?: string;
  /** Inicio del turno del servicio (para validar 9h). */
  horaInicio?: string;
  /** Fin del turno anterior del conductor (para validar 9h). */
  lastEndConductor?: string;
}

export interface ReasignarPersonalResult {
  ok: boolean;
  error?: string;
}

/**
 * Reasigna el personal (conductor) de un servicio sin borrar el histórico.
 * Valida regla de 9h de descanso entre turnos (doble turno).
 */
export async function reasignarPersonal(
  options: ReasignarPersonalOptions,
): Promise<ReasignarPersonalResult> {
  const { date, servicioId, nuevoChoferId, horaInicio, lastEndConductor } = options;

  if (horaInicio && lastEndConductor) {
    const validation = validateAssignment(nuevoChoferId, horaInicio, lastEndConductor);
    if (!validation.valid) {
      return { ok: false, error: validation.error ?? 'No cumple 9h de descanso entre turnos.' };
    }
  }

  const estado = await ServicioEstadoService.getByServicioId(servicioId, date);
  const cocheId = options.cocheId ?? estado?.cocheActual ?? null;
  if (!cocheId) {
    return {
      ok: false,
      error: 'Servicio sin coche asignado. Asigne coche antes de reasignar conductor.',
    };
  }

  await ServicioEstadoService.setState(servicioId, date, {
    choferActual: nuevoChoferId,
    cocheActual: cocheId,
    status: 'activo',
  });

  await ActiveAssignmentsService.recordAssignment(servicioId, date, cocheId, nuevoChoferId, {
    linea: estado?.linea,
    horaInicio: estado?.horaInicio ?? options.horaInicio,
  });

  const progList = await ProgramacionDiariaService.getByDate(date);
  const existing = progList.find(
    (p) => p.servicio === servicioId || p.servicio === estado?.servicio,
  );
  if (existing) {
    await ProgramacionDiariaService.update(existing.id, { conductor: nuevoChoferId });
  }

  return { ok: true };
}

export interface ReportarAveriaResult {
  cocheId: string;
  serviciosMarcadosPendiente: string[];
  categoriaReemplazo: string | null;
  cochesSugeridos: Vehicle[];
  cochesRetenReserva: string[];
}

/**
 * Reportar avería: marca los servicios que usan ese coche como "PENDIENTE DE COCHE"
 * y sugiere reemplazo por coches de la misma categoría (ej. LINEA_FIJA) disponibles en la flota.
 */
export async function reportarAveria(
  cocheId: string,
  date: string,
  allVehicles: Vehicle[],
  assignedVehicleIds: Set<string>,
): Promise<ReportarAveriaResult> {
  const serviciosMarcadosPendiente: string[] = [];
  const estados = await ServicioEstadoService.getByDate(date);

  for (const e of estados) {
    if (e.cocheActual && String(e.cocheActual) === String(cocheId)) {
      await ServicioEstadoService.setState(e.servicioId, date, {
        status: 'pendiente_de_coche',
        cocheActual: null,
        choferActual: e.choferActual,
      });
      serviciosMarcadosPendiente.push(e.servicioId);
    }
  }

  const categoriaReemplazo = getCategoriaReemplazoParaAveria(cocheId);
  const cochesRetenReserva = categoriaReemplazo ? getCochesByCategoria(categoriaReemplazo) : [];

  const cochesSugeridos = allVehicles.filter((v) => {
    const id = String(v.internalNumber ?? v.id ?? v);
    const docId = v.id != null ? String(v.id) : '';
    if (assignedVehicleIds.has(id) || (docId && assignedVehicleIds.has(docId))) return false;
    if (cochesRetenReserva.length === 0) return true;
    return cochesRetenReserva.some(
      (c) => String(c).trim() === id || (docId && String(c).trim() === docId),
    );
  });

  return {
    cocheId,
    serviciosMarcadosPendiente,
    categoriaReemplazo,
    cochesSugeridos,
    cochesRetenReserva,
  };
}

/**
 * Sugerencia automática de reemplazo para avería: coches de la categoría del coche averiado
 * que estén disponibles (no asignados) en la colección vehiculos.
 * Verificación: Coche 104 a las 15:00 → sugiere LINEA_FIJA disponibles.
 */
export function sugerirReemplazoAveria(
  cocheId: string,
  allVehicles: Vehicle[],
  assignedVehicleIds: Set<string>,
): { categoria: string | null; coches: Vehicle[] } {
  const categoria = getCategoriaReemplazoParaAveria(cocheId);
  const idsCategoria = categoria ? getCochesByCategoria(categoria) : [];
  const coches = allVehicles.filter((v) => {
    const id = String(v.internalNumber ?? v.id ?? v);
    const docId = v.id != null ? String(v.id) : '';
    if (assignedVehicleIds.has(id) || (docId && assignedVehicleIds.has(docId))) return false;
    if (idsCategoria.length === 0) return true;
    return idsCategoria.some((c) => String(c).trim() === id || String(c).trim() === docId);
  });
  return { categoria, coches };
}
