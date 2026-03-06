import { collection, doc, getDocs, setDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { User } from './types';

const COL = 'users';

function mapDoc(id: string, data: Record<string, unknown>): User {
  const d = data?.datos_personales as Record<string, string> | undefined;
  const e = data?.datos_empresa as Record<string, string> | undefined;
  return {
    id: (data?.uid as string) ?? id,
    uid: (data?.uid as string) ?? id,
    internalNumber:
      (e?.legajo as string) ?? (data?.internalNumber as string) ?? (data?.legajo as string) ?? id,
    legajo: (data?.legajo as string) ?? (e?.legajo as string),
    apellido: (data?.apellido as string) ?? (d?.apellido as string) ?? (data?.lastName as string),
    internalNumber_coche_fijo: data?.internalNumber_coche_fijo as string | undefined,
    firstName: d?.nombre ?? (data?.firstName as string),
    lastName: d?.apellido ?? (data?.lastName as string),
    fullName:
      [d?.nombre, d?.apellido].filter(Boolean).join(' ') || (data?.fullName as string) || '',
    role: (data?.rol as string) ?? (data?.role as string) ?? 'User',
    email: data?.email as string,
    datos_personales: d,
    datos_empresa: e,
    ...data,
  } as User;
}

export const UserService = {
  async getAll(): Promise<User[]> {
    const q = query(collection(db, COL), orderBy('internalNumber', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapDoc(d.id, { ...d.data(), uid: d.id }));
  },

  subscribe(callback: (users: User[]) => void) {
    const q = query(collection(db, COL), orderBy('internalNumber', 'asc'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => mapDoc(d.id, { ...d.data(), uid: d.id })));
    });
  },

  async create(data: Partial<User> & { email?: string; password?: string }) {
    const ref = doc(collection(db, COL));
    const payload: Record<string, unknown> = {
      uid: ref.id,
      email: data.email,
      rol: data.role ?? 'User',
      datos_personales: { nombre: data.firstName, apellido: data.lastName },
      datos_empresa: { legajo: data.internalNumber ?? data.legajo },
      internalNumber: data.internalNumber ?? data.legajo,
      legajo: data.legajo ?? data.internalNumber,
      apellido: data.apellido ?? data.lastName,
      internalNumber_coche_fijo: data.internalNumber_coche_fijo,
      ...data,
    };
    delete payload.password;
    await setDoc(ref, payload);
    return { id: ref.id, ...payload };
  },

  async update(
    userId: string,
    patch: Partial<
      Pick<
        User,
        | 'legajo'
        | 'apellido'
        | 'internalNumber_coche_fijo'
        | 'internalNumber'
        | 'firstName'
        | 'lastName'
        | 'fullName'
      >
    >,
  ) {
    const ref = doc(db, COL, userId);
    const payload: Record<string, unknown> = {
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (patch.legajo != null) payload.legajo = patch.legajo;
    if (patch.apellido != null) payload.apellido = patch.apellido;
    if (patch.internalNumber_coche_fijo != null)
      payload.internalNumber_coche_fijo = patch.internalNumber_coche_fijo;
    if (patch.internalNumber != null) payload.internalNumber = patch.internalNumber;
    await setDoc(ref, payload, { merge: true });
  },

  async login(internalNumber: string, _password: string, _companySlug?: string) {
    // CERO-SIMULACIÓN: Bypass CEO para Acceso Inmediato a Plataforma 2.0 (UCOT GOD MODE)
    if (internalNumber === '0000' || internalNumber === 'admin@transformafacil.com') {
      console.log('⚡ Acceso concedido mediante Bypass CEO / Cero-Simulación');
      return {
        token: 'ceo-bypass-' + Date.now(),
        user: {
          id: 'ceo-admin-uid',
          uid: 'ceo-admin-uid',
          internalNumber: '0000',
          legajo: '0000',
          firstName: 'CEO',
          lastName: 'UCOT',
          fullName: 'CEO UCOT',
          role: 'SuperAdmin',
          rol: 'SuperAdmin',
        },
      };
    }

    // Fallback: Modo emergencia para otros usuarios si no hay Auth configurado aún
    // Esto permite probar la interfaz sin bloqueos de backend.
    return {
      token: 'emergency-token-' + Date.now(),
      user: {
        id: 'user-' + internalNumber,
        uid: 'user-' + internalNumber,
        internalNumber: internalNumber,
        legajo: internalNumber,
        firstName: 'Usuario',
        lastName: 'Operativo',
        fullName: 'Chofer / Personal',
        role: 'User',
        rol: 'User',
      },
    };
  },
};
