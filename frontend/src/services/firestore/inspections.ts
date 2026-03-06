import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Inspection, InspectionCreate } from '../../types/inspections';

const COL = 'inspections';

function mapDoc(id: string, data: Record<string, unknown>): Inspection {
  return {
    id,
    cartonServiceId: data.cartonServiceId as string,
    lineId: data.lineId as string,
    controlPointId: data.controlPointId as string,
    serviceDate: data.serviceDate as string,
    scheduledTime: data.scheduledTime as string,
    actualPassedAt: data.actualPassedAt as Inspection['actualPassedAt'],
    timeDeltaMinutes: data.timeDeltaMinutes as number,
    passengerLoad: data.passengerLoad as Inspection['passengerLoad'],
    inspectorId: data.inspectorId as string | undefined,
    createdAt: data.createdAt as Inspection['createdAt'],
  };
}

/** Payload para crear inspección: actualPassedAt puede ser Timestamp o ms (number) */
type CreatePayload = Omit<InspectionCreate, 'actualPassedAt'> & {
  actualPassedAt: Timestamp | number;
};

export const InspectionService = {
  async create(data: CreatePayload): Promise<Inspection> {
    const actualPassedAt =
      data.actualPassedAt instanceof Timestamp
        ? data.actualPassedAt
        : Timestamp.fromMillis(
            typeof data.actualPassedAt === 'number' ? data.actualPassedAt : Date.now(),
          );
    const payload = {
      ...data,
      actualPassedAt,
      createdAt: Timestamp.now(),
    };
    const ref = await addDoc(collection(db, COL), payload);
    return mapDoc(ref.id, { ...payload, id: ref.id });
  },

  async getAll(filters?: { serviceDate?: string; lineId?: string }): Promise<Inspection[]> {
    const colRef = collection(db, COL);
    const q = query(colRef, orderBy('actualPassedAt', 'desc'));
    const snap = await getDocs(q);
    let list = snap.docs.map((d) => mapDoc(d.id, { ...d.data(), id: d.id }));
    if (filters?.serviceDate) list = list.filter((i) => i.serviceDate === filters.serviceDate);
    if (filters?.lineId) list = list.filter((i) => i.lineId === filters.lineId);
    return list;
  },

  /** Inspecciones de un cartón/servicio para análisis cruzado (motor de alertas). */
  async getByCartonServiceId(cartonServiceId: string): Promise<Inspection[]> {
    const colRef = collection(db, COL);
    const q = query(colRef, where('cartonServiceId', '==', cartonServiceId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapDoc(d.id, { ...d.data(), id: d.id }));
  },

  /**
   * Inspecciones de un día (y opcionalmente una línea) para Control Inspectores.
   * Usado para cargar y actualizar la matriz del día en tiempo real.
   */
  async getForDate(serviceDate: string, lineId?: string): Promise<Inspection[]> {
    const colRef = collection(db, COL);
    const constraints = lineId
      ? [
          where('serviceDate', '==', serviceDate),
          where('lineId', '==', lineId),
          orderBy('actualPassedAt', 'asc'),
        ]
      : [where('serviceDate', '==', serviceDate), orderBy('actualPassedAt', 'asc')];
    const q = query(colRef, ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapDoc(d.id, { ...d.data(), id: d.id }));
  },

  /**
   * Suscripción en tiempo real a inspecciones del día (y opcionalmente línea).
   * Retorna función de limpieza (unsubscribe).
   */
  subscribeForDate(
    serviceDate: string,
    lineId: string | undefined,
    callback: (inspections: Inspection[]) => void,
  ): () => void {
    const colRef = collection(db, COL);
    const constraints = lineId
      ? [
          where('serviceDate', '==', serviceDate),
          where('lineId', '==', lineId),
          orderBy('actualPassedAt', 'asc'),
        ]
      : [where('serviceDate', '==', serviceDate), orderBy('actualPassedAt', 'asc')];
    const q = query(colRef, ...constraints);
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => mapDoc(d.id, { ...d.data(), id: d.id }));
      callback(list);
    });
  },
};
