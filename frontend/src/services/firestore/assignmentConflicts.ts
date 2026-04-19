import { collection, doc, getDocs, setDoc, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { AssignmentConflict } from './types';

const COL = 'assignment_conflicts';

function mapConflict(id: string, data: Record<string, unknown>): AssignmentConflict {
  return {
    id,
    type: (data?.type as 'Conflicto de Asignación') ?? 'Conflicto de Asignación',
    shiftId: data?.shiftId as string | undefined,
    serviceId: data?.serviceId as string | undefined,
    vehicleId: data?.vehicleId as string | undefined,
    driverId: data?.driverId as string | undefined,
    guardId: data?.guardId as string | undefined,
    driverName: data?.driverName as string | undefined,
    guardName: data?.guardName as string | undefined,
    vehicleInternalNumber: data?.vehicleInternalNumber as string | undefined,
    message: data?.message as string | undefined,
    status: (data?.status as 'open' | 'resolved') ?? 'open',
    createdAt: data?.createdAt as string | undefined,
    resolvedAt: data?.resolvedAt as string | undefined,
    ...data,
  } as AssignmentConflict;
}

export const AssignmentConflictService = {
  async getOpen(): Promise<AssignmentConflict[]> {
    const q = query(collection(db, COL), where('status', '==', 'open'));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => mapConflict(d.id, { ...d.data(), id: d.id }));
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return list;
  },

  subscribe(callback: (conflicts: AssignmentConflict[]) => void) {
    const q = query(collection(db, COL), where('status', '==', 'open'));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => mapConflict(d.id, { ...d.data(), id: d.id }));
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callback(list);
    });
  },

  async markResolved(id: string) {
    const ref = doc(db, COL, id);
    await setDoc(
      ref,
      { status: 'resolved', resolvedAt: new Date().toISOString() },
      { merge: true },
    );
  },

  /** Registra notificación de atraso/incidencia para inspector (sin conflicto de asignación). */
  async notifyInspector(params: {
    serviceId: string;
    message: string;
    vehicleId?: string;
    vehicleInternalNumber?: string;
  }) {
    const id = `notif_${params.serviceId}_${Date.now()}`;
    const ref = doc(db, COL, id);
    await setDoc(ref, {
      type: 'Notificación Inspector',
      serviceId: params.serviceId,
      message: params.message,
      vehicleId: params.vehicleId,
      vehicleInternalNumber: params.vehicleInternalNumber,
      status: 'open',
      createdAt: new Date().toISOString(),
    });
  },
};
