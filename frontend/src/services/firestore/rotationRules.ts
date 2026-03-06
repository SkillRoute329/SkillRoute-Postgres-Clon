import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { ReglaRotacion } from '../../types/rotation';

const COL = 'reglas_rotacion';

function mapRegla(id: string, data: Record<string, unknown>): ReglaRotacion {
  return {
    id,
    nombre: (data?.nombre as string) ?? '',
    regimen: (data?.regimen as ReglaRotacion) ?? '15_15',
    patronDescanso:
      (data?.patronDescanso as ReglaRotacion['patronDescanso']) ?? 'fin_de_semana_rotativo',
    descripcion: data?.descripcion as string | undefined,
    activo: data?.activo !== false,
    createdAt: data?.createdAt as string | undefined,
    updatedAt: data?.updatedAt as string | undefined,
    ...data,
  } as ReglaRotacion;
}

export const RotationRulesService = {
  async getAll(): Promise<ReglaRotacion[]> {
    const snap = await getDocs(query(collection(db, COL), orderBy('nombre', 'asc')));
    return snap.docs.map((d) => mapRegla(d.id, { ...d.data() }));
  },

  subscribe(callback: (reglas: ReglaRotacion[]) => void) {
    const q = query(collection(db, COL), orderBy('nombre', 'asc'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => mapRegla(d.id, { ...d.data() })));
    });
  },

  async getById(id: string): Promise<ReglaRotacion | null> {
    const ref = doc(db, COL, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return mapRegla(snap.id, { ...snap.data() });
  },

  async create(data: Omit<ReglaRotacion, 'id'>): Promise<ReglaRotacion> {
    const payload = {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const ref = await addDoc(collection(db, COL), payload);
    return { ...data, id: ref.id } as ReglaRotacion;
  },

  async update(id: string, data: Partial<ReglaRotacion>): Promise<void> {
    const ref = doc(db, COL, id);
    await setDoc(ref, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
  },
};
