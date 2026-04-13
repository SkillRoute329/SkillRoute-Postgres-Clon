/**
 * feriados.ts — Colección `feriados` en Firestore
 * Gestión de feriados nacionales, departamentales y especiales UCOT.
 */
import {
  collection, doc, setDoc, deleteDoc,
  getDocs, query, where, orderBy, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const COL = 'feriados';

export type TipoFeriado =
  | 'nacional'        // Feriado nacional (Semana de Turismo, etc.)
  | 'departamental'   // Feriado departamental
  | 'ucot_especial'   // Día especial UCOT (evento, paro, etc.)
  | 'sabado_especial' // Sábado con grilla de domingo
  | 'domingo_especial'; // Domingo con grilla de sábado

export interface Feriado {
  id: string;         // YYYY-MM-DD
  fecha: string;      // YYYY-MM-DD
  nombre: string;
  tipo: TipoFeriado;
  grilla?: 'habil' | 'sabado' | 'domingo' | 'sin_servicio';
  notas?: string;
}

// Feriados fijos Uruguay 2026 pre-cargados
export const FERIADOS_URUGUAY_2026: Omit<Feriado, 'id'>[] = [
  { fecha: '2026-01-01', nombre: 'Año Nuevo',            tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-01-06', nombre: 'Reyes',                tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-02-16', nombre: 'Carnaval',             tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-02-17', nombre: 'Carnaval',             tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-03-23', nombre: 'Semana de Turismo',    tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-03-24', nombre: 'Semana de Turismo',    tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-03-25', nombre: 'Semana de Turismo',    tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-03-26', nombre: 'Semana de Turismo',    tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-04-19', nombre: 'Desembarco de los 33', tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-05-01', nombre: 'Día del Trabajo',      tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-05-18', nombre: 'Batalla de Las Piedras', tipo: 'nacional',   grilla: 'domingo' },
  { fecha: '2026-06-19', nombre: 'Artigas',              tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-07-18', nombre: 'Jura de la Constitución', tipo: 'nacional',  grilla: 'domingo' },
  { fecha: '2026-08-25', nombre: 'Independencia',        tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-10-12', nombre: 'Día de la Raza',       tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-11-02', nombre: 'Difuntos',             tipo: 'nacional',     grilla: 'domingo' },
  { fecha: '2026-12-25', nombre: 'Navidad',              tipo: 'nacional',     grilla: 'domingo' },
];

export const FeriadosService = {
  /** Carga feriados pre-definidos de Uruguay 2026 si no existen */
  async seedFeriados(): Promise<void> {
    for (const f of FERIADOS_URUGUAY_2026) {
      const ref = doc(db, COL, f.fecha);
      await setDoc(ref, { ...f, id: f.fecha }, { merge: true });
    }
  },

  /** Obtiene todos los feriados del año */
  async getAll(): Promise<Feriado[]> {
    const snap = await getDocs(query(collection(db, COL), orderBy('fecha')));
    return snap.docs.map((d) => d.data() as Feriado);
  },

  /** Obtiene feriados en un rango de fechas */
  async getByRango(desde: string, hasta: string): Promise<Feriado[]> {
    const q = query(
      collection(db, COL),
      where('fecha', '>=', desde),
      where('fecha', '<=', hasta),
      orderBy('fecha'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Feriado);
  },

  /** Escucha cambios en tiempo real */
  subscribe(onChange: (feriados: Feriado[]) => void): () => void {
    const q = query(collection(db, COL), orderBy('fecha'));
    return onSnapshot(q, (snap) => {
      onChange(snap.docs.map((d) => d.data() as Feriado));
    });
  },

  async save(feriado: Omit<Feriado, 'id'>): Promise<void> {
    await setDoc(doc(db, COL, feriado.fecha), { ...feriado, id: feriado.fecha }, { merge: true });
  },

  async delete(fecha: string): Promise<void> {
    await deleteDoc(doc(db, COL, fecha));
  },

  /** Determina el tipo de día para una fecha dada */
  async calcularTipoDia(fecha: string): Promise<'habil' | 'sabado' | 'domingo' | 'festivo' | 'sin_servicio'> {
    const d = new Date(fecha + 'T12:00:00');
    const dow = d.getDay(); // 0=dom, 6=sab

    // Consultar feriado
    const feriadoSnap = await getDocs(query(collection(db, COL), where('fecha', '==', fecha)));
    if (!feriadoSnap.empty) {
      const f = feriadoSnap.docs[0].data() as Feriado;
      return f.grilla ?? 'festivo';
    }

    if (dow === 0) return 'domingo';
    if (dow === 6) return 'sabado';
    return 'habil';
  },
};
