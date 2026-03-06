/**
 * Colección inspecciones_flota: multas/infracciones vinculadas a vehículo, servicio y conductor.
 * El conductor se resuelve por historial de rotación (active_assignments) para la fecha.
 */
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { ActiveAssignmentsService } from './activeAssignments';

const COL = 'inspecciones_flota';

export interface InspeccionFlotaEntry {
  id?: string;
  vehicleId: string;
  vehicleInternalNumber?: string;
  servicioId: string;
  conductorId: string | null;
  date: string;
  tipo: 'infraccion' | 'multa' | 'observacion';
  descripcion: string;
  inspectorId?: string;
  createdAt: string;
}

export const InspeccionesFlotaService = {
  /**
   * Registra una infracción. Si conductorId no se pasa, se resuelve por active_assignments (quien manejaba el coche ese día).
   */
  async add(params: {
    vehicleId: string;
    vehicleInternalNumber?: string;
    servicioId: string;
    conductorId?: string | null;
    date: string;
    tipo: InspeccionFlotaEntry['tipo'];
    descripcion: string;
    inspectorId?: string;
  }): Promise<InspeccionFlotaEntry> {
    let conductorId = params.conductorId ?? null;
    if (conductorId === undefined || conductorId === null) {
      const assignments = await ActiveAssignmentsService.getByDate(params.date);
      const doc = assignments.find(
        (a) => String(a.cocheId) === String(params.vehicleId) && a.servicioId === params.servicioId,
      );
      if (doc?.choferId) conductorId = doc.choferId;
      else {
        const byCoche = assignments.find((a) => String(a.cocheId) === String(params.vehicleId));
        if (byCoche?.choferId) conductorId = byCoche.choferId;
      }
    }
    const ref = await addDoc(collection(db, COL), {
      vehicleId: params.vehicleId,
      vehicleInternalNumber: params.vehicleInternalNumber,
      servicioId: params.servicioId,
      conductorId,
      date: params.date,
      tipo: params.tipo,
      descripcion: params.descripcion,
      inspectorId: params.inspectorId,
      createdAt: Timestamp.now(),
    });
    return {
      id: ref.id,
      ...params,
      conductorId,
      createdAt: new Date().toISOString(),
    } as InspeccionFlotaEntry;
  },

  async getByVehicleAndDate(vehicleId: string, date: string): Promise<InspeccionFlotaEntry[]> {
    const q = query(
      collection(db, COL),
      where('vehicleId', '==', vehicleId),
      where('date', '==', date),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const snap = await getDocs(q);
    return snap.docs.map(
      (d) =>
        ({
          id: d.id,
          ...d.data(),
          createdAt: (d.data().createdAt as Timestamp)?.toDate?.()?.toISOString?.() ?? '',
        }) as unknown as InspeccionFlotaEntry,
    );
  },

  async getByDate(date: string): Promise<InspeccionFlotaEntry[]> {
    const q = query(
      collection(db, COL),
      where('date', '==', date),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    const snap = await getDocs(q);
    return snap.docs.map(
      (d) =>
        ({
          id: d.id,
          ...d.data(),
          createdAt: (d.data().createdAt as Timestamp)?.toDate?.()?.toISOString?.() ?? '',
        }) as unknown as InspeccionFlotaEntry,
    );
  },
};
