import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { PersonalRotacion } from '../../types/rotation';

const COL = 'personal';

function mapPersonal(id: string, data: Record<string, unknown>): PersonalRotacion {
  const turno = data?.turnoActual;
  const t = turno === 1 || turno === 2 || turno === 3 ? turno : 1;
  return {
    id,
    userId: data?.userId as string | undefined,
    internalNumber: (data?.internalNumber as string) ?? '',
    fullName: data?.fullName as string | undefined,
    cocheFijo: (data?.cocheFijo as string | null) ?? null,
    reglaId: (data?.reglaId as string) ?? '',
    turnoActual: t as 1 | 2 | 3,
    patronDescanso:
      (data?.patronDescanso as PersonalRotacion['patronDescanso']) ?? 'fin_de_semana_rotativo',
    diaDescansoSemana: data?.diaDescansoSemana as number | undefined,
    activo: data?.activo !== false,
    createdAt: data?.createdAt as string | undefined,
    updatedAt: data?.updatedAt as string | undefined,
    ...data,
  } as PersonalRotacion;
}

export const PersonalRotationService = {
  async getAll(): Promise<PersonalRotacion[]> {
    const snap = await getDocs(query(collection(db, COL), orderBy('internalNumber', 'asc')));
    return snap.docs.map((d) => mapPersonal(d.id, { ...d.data() }));
  },

  subscribe(callback: (personal: PersonalRotacion[]) => void) {
    const q = query(collection(db, COL), orderBy('internalNumber', 'asc'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => mapPersonal(d.id, { ...d.data() })));
    });
  },

  async getByCocheFijo(cocheInternalNumber: string): Promise<PersonalRotacion[]> {
    const all = await this.getAll();
    return all.filter((p) => p.cocheFijo === cocheInternalNumber);
  },

  async getDeLista(): Promise<PersonalRotacion[]> {
    const all = await this.getAll();
    return all.filter((p) => p.cocheFijo == null || p.cocheFijo === '');
  },

  async create(data: Omit<PersonalRotacion, 'id'>): Promise<PersonalRotacion> {
    const payload = {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const ref = await addDoc(collection(db, COL), payload);
    return { ...data, id: ref.id } as PersonalRotacion;
  },

  async update(id: string, data: Partial<PersonalRotacion>): Promise<void> {
    const ref = doc(db, COL, id);
    await setDoc(ref, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
  },
};
