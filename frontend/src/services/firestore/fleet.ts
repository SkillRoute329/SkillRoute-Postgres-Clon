import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Vehicle } from './types';
import { ServicioEstadoService } from './servicioEstado';
import { MantenimientoLogsService } from './mantenimientoLogs';
import { NotificacionesFlotaService } from './notificacionesFlota';

const COL = 'vehiculos';
const SHIFTS_COL = 'daily_shifts';
const CONFLICTS_COL = 'assignment_conflicts';
const ROTATION_COL = 'rotation_schemes';

function mapVehicle(id: string, data: Record<string, unknown>): Vehicle {
  return {
    id: data?.id ?? data?.internalNumber ?? id,
    internalNumber: (data?.internalNumber as string) ?? id,
    plate: data?.plate as string,
    brand: data?.brand as string,
    model: data?.model as string,
    make: data?.make ?? data?.brand,
    year: data?.year as string,
    capacity: data?.capacity as number,
    status: data?.status as string,
    features: data?.features as Record<string, unknown>,
    ...data,
  } as Vehicle;
}

export const FleetService = {
  async getVehicles(): Promise<Vehicle[]> {
    const q = query(collection(db, COL), orderBy('internalNumber', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapVehicle(d.id, { ...d.data(), id: d.id }));
  },

  subscribeVehicles(callback: (vehicles: Vehicle[]) => void) {
    const q = query(collection(db, COL), orderBy('internalNumber', 'asc'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => mapVehicle(d.id, { ...d.data(), id: d.id })));
    });
  },

  async getVehicleById(id: number | string) {
    const snap = await getDoc(doc(db, COL, String(id)));
    if (!snap.exists()) return null;
    return mapVehicle(snap.id, { ...snap.data(), id: snap.id });
  },

  async createVehicle(data: Record<string, unknown>) {
    const ref = await addDoc(collection(db, COL), data);
    return { id: ref.id, ...data };
  },

  async updateVehicle(id: number | string, data: Record<string, unknown>) {
    const ref = doc(db, COL, String(id));
    await setDoc(ref, data, { merge: true });
    const idStr = String(id);
    if (data.status === 'MAINTENANCE' || data.status === 'Taller') {
      const today = new Date().toISOString().split('T')[0];
      const vehicle = await getDoc(ref).then((d) => (d.exists() ? d.data() : null));
      const internalNumber = (vehicle?.internalNumber ?? vehicle?.id ?? id) as string;

      const estados = await ServicioEstadoService.getByDate(today);
      const afectados = estados.filter((e) => e.cocheActual && String(e.cocheActual) === idStr);
      const servicioIds: string[] = [];
      const choferIds: string[] = [];

      for (const e of afectados) {
        await ServicioEstadoService.setState(e.servicioId, today, {
          status: 'pendiente_de_coche',
          cocheActual: null,
          choferActual: e.choferActual,
        });
        servicioIds.push(e.servicioId);
        if (e.choferActual) choferIds.push(e.choferActual);
      }

      await MantenimientoLogsService.add({
        vehicleId: idStr,
        vehicleInternalNumber: internalNumber,
        date: today,
        status: 'Taller',
        servicioIdsAfectados: servicioIds,
        choferIdsNotificados: [...new Set(choferIds)],
      });

      for (const driverId of [...new Set(choferIds)]) {
        const svcId = afectados.find((e) => e.choferActual === driverId)?.servicioId;
        await NotificacionesFlotaService.notifyServicioSuspendido({
          driverId,
          servicioId: svcId ?? '',
          vehicleId: idStr,
          vehicleInternalNumber: internalNumber,
        });
      }

      const shiftsRef = collection(db, SHIFTS_COL);
      const q = query(shiftsRef, where('date', '==', today), where('vehicleId', '==', idStr));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const s = d.data();
        await addDoc(collection(db, CONFLICTS_COL), {
          type: 'Conflicto de Asignación',
          shiftId: d.id,
          serviceId: s.serviceId,
          vehicleId: idStr,
          vehicleInternalNumber: internalNumber,
          driverId: s.driverId ?? s.assignedTo,
          driverName: s.driverName ?? '',
          guardId: s.guardId,
          guardName: s.guardName ?? '',
          status: 'open',
          message: `Coche ${internalNumber} a taller`,
          createdAt: new Date().toISOString(),
        });
      }
    }
    return { id, ...data };
  },

  async getVehicleHistory(vehicleId: number | string): Promise<unknown[]> {
    const ref = collection(db, COL, String(vehicleId), 'history');
    const snap = await getDocs(ref);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async getRotationSchemes(): Promise<unknown[]> {
    try {
      const snap = await getDocs(collection(db, ROTATION_COL));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      return [];
    }
  },

  async getLastInspection(vehicleId: string): Promise<unknown> {
    const ref = collection(db, COL, vehicleId, 'inspections');
    const q = query(ref, orderBy('date', 'desc'));
    const snap = await getDocs(q);
    const first = snap.docs[0];
    return first ? { id: first.id, ...first.data() } : null;
  },

  async createInspection(data: { vehicleId: string; [k: string]: unknown }) {
    const ref = collection(db, COL, data.vehicleId as string, 'inspections');
    const docRef = await addDoc(ref, data);
    return { id: docRef.id, ...data };
  },
};
