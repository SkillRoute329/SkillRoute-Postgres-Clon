/**
 * Estado dinámico del servicio (Cerebro Operativo CEO).
 * Fuente de verdad de asignación: servicioId como clave primaria.
 * UNIFICACIÓN: un solo estado por servicio por fecha; no duplicar con service_definitions/cartones_completados.
 */
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'servicio_estado';

export type ServicioEstadoStatus = 'activo' | 'pendiente' | 'incidencia' | 'pendiente_de_coche';

export interface ServicioEstadoRecord {
  servicioId: string;
  date: string;
  status: ServicioEstadoStatus;
  cocheActual: string | null;
  choferActual: string | null;
  linea?: string;
  servicio?: string;
  horaInicio?: string;
  /** Minutos de atraso en punto de control (sin GPS simulado). Fuente: inspección / registro real. */
  atrasoMinutos?: number;
  historial?: Array<{ choferId: string; cocheId: string; at: string }>;
  updatedAt?: string;
}

function mapDoc(id: string, data: Record<string, unknown>): ServicioEstadoRecord {
  return {
    servicioId: (data.servicioId as string) ?? id,
    date: data.date as string,
    status: (data.status as ServicioEstadoStatus) ?? 'pendiente',
    cocheActual: (data.cocheActual as string) ?? null,
    choferActual: (data.choferActual as string) ?? null,
    linea: data.linea as string | undefined,
    servicio: data.servicio as string | undefined,
    horaInicio: data.horaInicio as string | undefined,
    atrasoMinutos: data.atrasoMinutos != null ? Number(data.atrasoMinutos) : undefined,
    historial: (data.historial as ServicioEstadoRecord['historial']) ?? [],
    updatedAt: data.updatedAt as string | undefined,
    ...data,
  } as ServicioEstadoRecord;
}

export const ServicioEstadoService = {
  docId(servicioId: string, date: string): string {
    return `${servicioId}_${date}`.replace(/\s+/g, '_').slice(0, 80);
  },

  async getByDate(date: string): Promise<ServicioEstadoRecord[]> {
    const q = query(collection(db, COL), where('date', '==', date));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) =>
      mapDoc(d.id, { ...d.data(), servicioId: d.data().servicioId ?? d.id }),
    );
    list.sort((a, b) => (a.servicioId || '').localeCompare(b.servicioId || ''));
    return list;
  },

  async getByServicioId(servicioId: string, date: string): Promise<ServicioEstadoRecord | null> {
    const id = ServicioEstadoService.docId(servicioId, date);
    const snap = await getDoc(doc(db, COL, id));
    if (!snap.exists()) return null;
    return mapDoc(snap.id, { ...snap.data(), servicioId: snap.data()?.servicioId ?? servicioId });
  },

  subscribeByDate(date: string, callback: (records: ServicioEstadoRecord[]) => void) {
    const q = query(collection(db, COL), where('date', '==', date));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) =>
        mapDoc(d.id, { ...d.data(), servicioId: d.data().servicioId ?? d.id }),
      );
      list.sort((a, b) => (a.servicioId || '').localeCompare(b.servicioId || ''));
      callback(list);
    });
  },

  async setState(
    servicioId: string,
    date: string,
    patch: Partial<
      Pick<
        ServicioEstadoRecord,
        | 'status'
        | 'cocheActual'
        | 'choferActual'
        | 'linea'
        | 'servicio'
        | 'horaInicio'
        | 'atrasoMinutos'
      >
    >,
  ): Promise<ServicioEstadoRecord> {
    const id = ServicioEstadoService.docId(servicioId, date);
    const ref = doc(db, COL, id);
    const existing = await getDoc(ref).then((s) => (s.exists() ? s.data() : null));
    const historial = (existing?.historial as ServicioEstadoRecord['historial']) ?? [];
    if (patch.choferActual && patch.cocheActual) {
      historial.push({
        choferId: patch.choferActual,
        cocheId: patch.cocheActual,
        at: new Date().toISOString(),
      });
    }
    const payload: Record<string, unknown> = {
      servicioId,
      date,
      status: patch.status ?? existing?.status ?? 'pendiente',
      cocheActual: patch.cocheActual ?? existing?.cocheActual ?? null,
      choferActual: patch.choferActual ?? existing?.choferActual ?? null,
      linea: patch.linea ?? existing?.linea,
      servicio: patch.servicio ?? existing?.servicio,
      horaInicio: patch.horaInicio ?? existing?.horaInicio,
      atrasoMinutos:
        patch.atrasoMinutos !== undefined
          ? patch.atrasoMinutos
          : (existing?.atrasoMinutos as number | undefined),
      historial: historial.slice(-50),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(ref, payload, { merge: true });
    return payload as unknown as ServicioEstadoRecord;
  },

  /** Asigna conductor/coche a un servicio sin borrar historial (Vínculo de Oro). */
  async assignDriverToService(
    servicioId: string,
    date: string,
    choferId: string,
    cocheId: string,
    meta?: { linea?: string; servicio?: string; horaInicio?: string },
  ): Promise<void> {
    await ServicioEstadoService.setState(servicioId, date, {
      choferActual: choferId,
      cocheActual: cocheId,
      status: 'activo',
      ...meta,
    });
  },
};
