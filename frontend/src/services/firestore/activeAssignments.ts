/**
 * Colección central active_assignments: vínculo dinámico Coche ↔ Servicio ↔ Conductor.
 * Reasignar no borra el registro previo; se mantiene historial.
 */
import {
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'active_assignments';

export interface ActiveAssignmentRecord {
  servicioId: string;
  date: string;
  cocheId: string | null;
  choferId: string | null;
  linea?: string;
  horaInicio?: string;
  historial: Array<{ cocheId: string; choferId: string; at: string }>;
  updatedAt: string;
}

function docId(servicioId: string, date: string): string {
  return `${String(servicioId).replace(/\s+/g, '_')}_${date}`.slice(0, 80);
}

export const ActiveAssignmentsService = {
  docId,

  async get(servicioId: string, date: string): Promise<ActiveAssignmentRecord | null> {
    const ref = doc(db, COL, docId(servicioId, date));
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      servicioId: d?.servicioId ?? servicioId,
      date: d?.date ?? date,
      cocheId: d?.cocheId ?? null,
      choferId: d?.choferId ?? null,
      linea: d?.linea,
      horaInicio: d?.horaInicio,
      historial: (d?.historial ?? []).slice(-50),
      updatedAt: d?.updatedAt ?? '',
    };
  },

  async getByDate(date: string): Promise<ActiveAssignmentRecord[]> {
    const q = query(collection(db, COL), where('date', '==', date));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        servicioId: x?.servicioId ?? d.id,
        date: x?.date ?? date,
        cocheId: x?.cocheId ?? null,
        choferId: x?.choferId ?? null,
        linea: x?.linea,
        horaInicio: x?.horaInicio,
        historial: (x?.historial ?? []).slice(-50),
        updatedAt: x?.updatedAt ?? '',
      };
    });
  },

  /**
   * Historial de rotación: cuántas veces cambió de manos un coche en el mes (para CEO).
   * Suma los historial de todos los documentos del mes donde cocheId actual o historial coincide.
   */
  async getRotacionByCocheMonth(
    cocheId: string,
    yearMonth: string,
  ): Promise<{
    cambios: number;
    detalle: Array<{ date: string; servicioId: string; cambios: number }>;
  }> {
    const [y, m] = yearMonth.split('-').map(Number);
    const start = `${yearMonth}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
    const q = query(collection(db, COL), where('date', '>=', start), where('date', '<=', end));
    const snap = await getDocs(q);
    const detalle: Array<{ date: string; servicioId: string; cambios: number }> = [];
    let total = 0;
    const cid = String(cocheId);
    snap.docs.forEach((d) => {
      const x = d.data();
      const coche = x?.cocheId ?? null;
      const hist = (x?.historial ?? []) as ActiveAssignmentRecord['historial'];
      const cambiosCoche =
        coche === cid ? hist.length : hist.filter((h) => h.cocheId === cid).length;
      if (cambiosCoche > 0) {
        detalle.push({
          date: x?.date ?? '',
          servicioId: x?.servicioId ?? d.id,
          cambios: cambiosCoche,
        });
        total += cambiosCoche;
      }
    });
    return { cambios: total, detalle };
  },

  subscribeByDate(date: string, callback: (records: ActiveAssignmentRecord[]) => void) {
    const q = query(collection(db, COL), where('date', '==', date));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const x = d.data();
        return {
          servicioId: x?.servicioId ?? d.id,
          date: x?.date ?? date,
          cocheId: x?.cocheId ?? null,
          choferId: x?.choferId ?? null,
          linea: x?.linea,
          horaInicio: x?.horaInicio,
          historial: (x?.historial ?? []).slice(-50),
          updatedAt: x?.updatedAt ?? '',
        };
      });
      callback(list);
    });
  },

  /**
   * Historial por conductor: todos los servicios que corrió en un rango de fechas.
   */
  async getByChofer(
    choferId: string,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<ActiveAssignmentRecord[]> {
    const q = query(
      collection(db, COL),
      where('choferId', '==', choferId),
      where('date', '>=', fechaDesde),
      where('date', '<=', fechaHasta),
      orderBy('date', 'desc'),
      limit(200),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        servicioId: x?.servicioId ?? d.id,
        date: x?.date,
        cocheId: x?.cocheId ?? null,
        choferId: x?.choferId ?? null,
        linea: x?.linea,
        horaInicio: x?.horaInicio,
        historial: (x?.historial ?? []).slice(-50),
        updatedAt: x?.updatedAt ?? '',
      };
    });
  },

  /**
   * Historial por coche: todos los servicios que corrió ese coche en un rango de fechas.
   */
  async getByCoche(
    cocheId: string,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<ActiveAssignmentRecord[]> {
    const q = query(
      collection(db, COL),
      where('cocheId', '==', cocheId),
      where('date', '>=', fechaDesde),
      where('date', '<=', fechaHasta),
      orderBy('date', 'desc'),
      limit(200),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        servicioId: x?.servicioId ?? d.id,
        date: x?.date,
        cocheId: x?.cocheId ?? null,
        choferId: x?.choferId ?? null,
        linea: x?.linea,
        horaInicio: x?.horaInicio,
        historial: (x?.historial ?? []).slice(-50),
        updatedAt: x?.updatedAt ?? '',
      };
    });
  },

  /**
   * Registra o actualiza la asignación activa sin borrar el registro previo (añade a historial).
   */
  async recordAssignment(
    servicioId: string,
    date: string,
    cocheId: string,
    choferId: string,
    meta?: { linea?: string; horaInicio?: string },
  ): Promise<void> {
    const id = docId(servicioId, date);
    const ref = doc(db, COL, id);
    const existing = await getDoc(ref).then((s) => (s.exists() ? s.data() : null));
    const historial = (existing?.historial as ActiveAssignmentRecord['historial']) ?? [];
    const prevCoche = existing?.cocheId;
    const prevChofer = existing?.choferId;
    if (prevCoche && prevChofer && (prevCoche !== cocheId || prevChofer !== choferId)) {
      historial.push({
        cocheId: prevCoche,
        choferId: prevChofer,
        at: new Date().toISOString(),
      });
    }
    await setDoc(
      ref,
      {
        servicioId,
        date,
        cocheId,
        choferId,
        linea: meta?.linea ?? existing?.linea,
        horaInicio: meta?.horaInicio ?? existing?.horaInicio,
        historial: historial.slice(-50),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  },
};
