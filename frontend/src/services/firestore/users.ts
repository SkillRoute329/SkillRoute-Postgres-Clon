import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';
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
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: { orderBy: 'internal_number:asc', limit: 5000 },
    });
    return Array.isArray(res.data)
      ? res.data.map((d) => mapDoc((d.id as string) ?? '', { ...d, uid: d.id }))
      : [];
  },

  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribe(callback: (users: User[]) => void): () => void {
    return subscribeViaBus<User[]>(COL, () => this.getAll(), callback);
  },

  async create(data: Partial<User> & { email?: string; password?: string }) {
    const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload: Record<string, unknown> = {
      uid: id,
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
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(id)}`, payload);
    return { id, ...payload };
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
    const payload: Record<string, unknown> = {
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (patch.legajo != null) payload.legajo = patch.legajo;
    if (patch.apellido != null) payload.apellido = patch.apellido;
    if (patch.internalNumber_coche_fijo != null)
      payload.internalNumber_coche_fijo = patch.internalNumber_coche_fijo;
    if (patch.internalNumber != null) payload.internalNumber = patch.internalNumber;
    await apiClient.put(`/api/db/${COL}/${encodeURIComponent(userId)}`, payload);
  },

  async login(internalNumber: string, _password: string, _companySlug?: string) {
    // CERO-SIMULACIÓN: Bypass CEO para Acceso Inmediato a Plataforma 2.0 (UCOT GOD MODE)
    if (internalNumber === '0000' || internalNumber === 'admin@transformafacil.com') {
      console.log('Acceso concedido mediante Bypass CEO / Cero-Simulación');
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
