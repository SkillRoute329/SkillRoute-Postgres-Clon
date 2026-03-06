/**
 * Colección mantenimiento_logs: registro automático cuando un coche pasa a Taller.
 * Vínculo de Oro: Coche-Servicio-Chofer respetado en el registro.
 */
import { collection, addDoc, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'mantenimiento_logs';

export interface MantenimientoLogEntry {
  vehicleId: string;
  vehicleInternalNumber?: string;
  date: string;
  status: string;
  servicioIdsAfectados?: string[];
  choferIdsNotificados?: string[];
  createdAt: string;
}

export const MantenimientoLogsService = {
  async add(entry: Omit<MantenimientoLogEntry, 'createdAt'>): Promise<string> {
    const ref = await addDoc(collection(db, COL), {
      ...entry,
      createdAt: new Date().toISOString(),
    });
    return ref.id;
  },

  async getByVehicleAndMonth(
    vehicleId: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<MantenimientoLogEntry[]> {
    const q = query(
      collection(db, COL),
      where('vehicleId', '==', vehicleId),
      where('date', '>=', monthStart),
      where('date', '<=', monthEnd),
      orderBy('date', 'desc'),
      limit(50),
    );
    const snap = await getDocs(q);
    return snap.docs.map(
      (d) =>
        ({
          id: d.id,
          ...d.data(),
          createdAt: d.data().createdAt,
        }) as unknown as MantenimientoLogEntry,
    );
  },
};
