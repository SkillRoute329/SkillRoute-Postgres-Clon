/**
 * Colección notificaciones_flota: notificaciones al chofer (ej. "Servicio Suspendido").
 */
import { collection, addDoc, query, where, getDocs, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'notificaciones_flota';

export interface NotificacionFlotaEntry {
  driverId: string;
  tipo: 'servicio_suspendido' | 'prioridad_alta' | 'alerta_general';
  titulo: string;
  mensaje: string;
  servicioId?: string;
  vehicleId?: string;
  leida?: boolean;
  createdAt: string;
}

export const NotificacionesFlotaService = {
  async create(entry: Omit<NotificacionFlotaEntry, 'createdAt'>): Promise<string> {
    const ref = await addDoc(collection(db, COL), {
      ...entry,
      leida: false,
      createdAt: new Date().toISOString(),
    });
    return ref.id;
  },

  async notifyServicioSuspendido(params: {
    driverId: string;
    servicioId: string;
    vehicleId: string;
    vehicleInternalNumber?: string;
  }): Promise<string> {
    return this.create({
      driverId: params.driverId,
      tipo: 'servicio_suspendido',
      titulo: 'Servicio Suspendido',
      mensaje: `El coche ${params.vehicleInternalNumber ?? params.vehicleId} está en taller. Su servicio ha sido suspendido. Consulte con el listero.`,
      servicioId: params.servicioId,
      vehicleId: params.vehicleId,
    });
  },

  async getByDriver(driverId: string, limitCount = 20): Promise<NotificacionFlotaEntry[]> {
    const q = query(collection(db, COL), where('driverId', '==', driverId), limit(limitCount * 2));
    const snap = await getDocs(q);
    const list = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as unknown as NotificacionFlotaEntry,
    );
    list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return list.slice(0, limitCount);
  },

  subscribeByDriver(driverId: string, callback: (items: NotificacionFlotaEntry[]) => void) {
    const q = query(collection(db, COL), where('driverId', '==', driverId), limit(50));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as unknown as NotificacionFlotaEntry,
      );
      list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      callback(list.slice(0, 30));
    });
  },
};
