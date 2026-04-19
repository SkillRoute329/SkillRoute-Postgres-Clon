import {
  collection,
  doc,
  getDocs,
  updateDoc,
  onSnapshot,
  setDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface TarifaSTM {
  id: string;
  nombre: string;
  precio: number;
  categoria: 'URBANO' | 'SUBURBANO' | 'ZONAL' | 'DIFERENCIAL' | string;
  // TODO: Agregar campos de feriados si es necesario, o mantenerlo separado.
}

const COLLECTION_NAME = 'tarifario_stm';

/** Obtiene las tarifas de Firestore (Lectura única) */
export async function getTarifas(): Promise<TarifaSTM[]> {
  const snapshot = await getDocs(query(collection(db, COLLECTION_NAME), orderBy('precio')));
  return snapshot.docs.map((doc) => ({
    ...(doc.data() as Omit<TarifaSTM, 'id'>),
    id: doc.id,
  }));
}

/** Escucha en tiempo real las tarifas para mantener el cliente siempre actualizado */
export function listenToTarifas(onUpdate: (tarifas: TarifaSTM[]) => void): () => void {
  const q = query(collection(db, COLLECTION_NAME), orderBy('precio'));
  return onSnapshot(q, (snapshot) => {
    const tarifas = snapshot.docs.map((doc) => ({
      ...(doc.data() as Omit<TarifaSTM, 'id'>),
      id: doc.id,
    }));
    onUpdate(tarifas);
  });
}

/** Inserta un array inicial para rellenar (seed) la base de datos si está vacía. Solo admin. */
export async function setSeedTarfias(tarifasSeed: TarifaSTM[]) {
  for (const t of tarifasSeed) {
    // usamos t.id como el id del documento para que no haya duplicados si se lanza varias veces
    await setDoc(doc(db, COLLECTION_NAME, t.id), {
      nombre: t.nombre,
      precio: t.precio,
      categoria: t.categoria,
    });
  }
}

/** Actualiza el precio de una tarifa */
export async function updatePrecioTarifa(id: string, nuevoPrecio: number) {
  const ref = doc(db, COLLECTION_NAME, id);
  await updateDoc(ref, {
    precio: nuevoPrecio,
  });
}
