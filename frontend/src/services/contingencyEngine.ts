/**
 * Módulo de Contingencia Dinámica (CEO Mode).
 * handleServiceInterruption(cocheId): listar servicios afectados, coches libres, choferes retén, sugerir por Punto de Control.
 * (La creación de conflictos en Firestore la hace FleetService.updateVehicle al marcar status MAINTENANCE.)
 */
import { getDocs, query, collection, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getMasterServicios, getMasterPuntosControl } from '../data/ucotMaster';
import { validateAssignment } from '../utils/syndicateRules';
import { FeriadosService } from './feriadosService';
import type { Vehicle } from './firestore/types';
import type { User } from './firestore/types';

const SHIFTS_COL = 'daily_shifts';

const OPERATIONAL_STATUSES = ['ACTIVE', 'OPERATIONAL', 'OK', 'active', 'operational'];

export interface ServiceInterruptionResult {
  cocheId: string;
  cocheInternalNumber: string;
  serviciosAfectados: Array<{
    servicioId: string;
    linea: string;
    horaInicio?: string;
    shiftId?: string;
  }>;
  esFeriado: boolean;
  tipoHorario?: 'DOMINGO' | 'SABADO' | 'ESPECIAL';
  cochesLibres: Vehicle[];
  choferesReten: User[];
  sugerenciaPorPuntoControl: Array<{ puntoControl: string; servicioId: string; linea: string }>;
}

/**
 * Dado un coche (ej. a taller): lista servicios afectados, coches libres, choferes de retén (9h), sugerencia por punto de control.
 */
export async function handleServiceInterruption(
  cocheId: string,
  date: string,
  allVehicles: Vehicle[],
  allDrivers: User[],
  assignedVehicleIds: Set<string>,
  assignedDriverIds: Set<string>,
  lastEndByDriver: Map<string, string>,
  shiftStartByConflict?: string,
): Promise<ServiceInterruptionResult> {
  const vehicle = allVehicles.find((v) => String(v.id) === String(cocheId));
  const cocheInternalNumber = (vehicle?.internalNumber ?? vehicle?.id ?? cocheId) as string;

  const serviciosMaster = getMasterServicios();
  const puntosControl = getMasterPuntosControl();

  const feriado = await FeriadosService.isFeriado(date);

  const serviciosAfectados: ServiceInterruptionResult['serviciosAfectados'] = [];

  try {
    const q = query(
      collection(db, SHIFTS_COL),
      where('date', '==', date),
      where('vehicleId', '==', String(cocheId)),
    );
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const s = d.data();
      const serviceId = s.serviceId as string;
      const master = serviciosMaster.find(
        (m) => m.servicioId === serviceId || m.serviceNumber === serviceId,
      );
      serviciosAfectados.push({
        servicioId: serviceId ?? 'PENDIENTE',
        linea: master?.linea ?? (s.linea as string) ?? 'PENDIENTE',
        horaInicio: master?.horaInicioReferencia ?? (s.start as string),
        shiftId: d.id,
      });
    });
  } catch {
    // ignore
  }

  const cochesLibres = allVehicles.filter(
    (v) =>
      OPERATIONAL_STATUSES.includes(String(v.status ?? '').toUpperCase()) &&
      !assignedVehicleIds.has(String(v.id)),
  );

  const choferesReten = allDrivers.filter((d) => {
    const id = String(d.id ?? d.uid ?? '');
    if (assignedDriverIds.has(id)) return false;
    const lastEnd = lastEndByDriver.get(id);
    if (!lastEnd || !shiftStartByConflict) return true;
    return validateAssignment(id, shiftStartByConflict, lastEnd).valid;
  });

  const sugerenciaPorPuntoControl: ServiceInterruptionResult['sugerenciaPorPuntoControl'] = [];
  for (const svc of serviciosAfectados) {
    const master = serviciosMaster.find((m) => m.servicioId === svc.servicioId);
    const puntos = master?.puntosControl ?? [];
    for (const nombre of puntos) {
      const pc = puntosControl.find((p) => p.nombre === nombre || (p.alias ?? []).includes(nombre));
      if (pc) {
        sugerenciaPorPuntoControl.push({
          puntoControl: pc.nombre,
          servicioId: svc.servicioId,
          linea: svc.linea,
        });
        break;
      }
    }
  }

  return {
    cocheId,
    cocheInternalNumber,
    serviciosAfectados,
    esFeriado: !!feriado,
    tipoHorario: feriado?.tipoHorario,
    cochesLibres,
    choferesReten,
    sugerenciaPorPuntoControl,
  };
}
