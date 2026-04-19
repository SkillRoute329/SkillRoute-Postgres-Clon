/**
 * Servicio Firestore para categorías de vehículos.
 * Colección: vehicle_categories
 * Permite crear categorías como: Híbrido, Piso Bajo, MT15, Convencional, etc.
 */
import {
  collection,
  doc,
  getDocs,
  addDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { VehicleCategory } from './types';

const COL = 'vehicle_categories';

export const VehicleCategoryService = {
  /** Obtener todas las categorías */
  async getAll(): Promise<VehicleCategory[]> {
    const q = query(collection(db, COL), orderBy('name', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as VehicleCategory);
  },

  /** Suscripción en tiempo real */
  subscribe(callback: (cats: VehicleCategory[]) => void) {
    const q = query(collection(db, COL), orderBy('name', 'asc'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as VehicleCategory));
    });
  },

  /** Crear nueva categoría */
  async create(data: Omit<VehicleCategory, 'id'>): Promise<VehicleCategory> {
    const docRef = await addDoc(collection(db, COL), {
      ...data,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, ...data } as VehicleCategory;
  },

  /** Actualizar categoría */
  async update(id: string, data: Partial<VehicleCategory>): Promise<void> {
    await setDoc(doc(db, COL, id), data, { merge: true });
  },

  /** Eliminar categoría */
  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, COL, id));
  },
};
