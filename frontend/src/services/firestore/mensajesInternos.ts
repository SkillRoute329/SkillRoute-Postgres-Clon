/**
 * Colección mensajes_internos: avisos rápidos Listero ↔ Chofer (y solicitudes como Cambio de Turno).
 */
import { apiClient } from '../../clients/apiClient';
import { subscribeViaBus } from '../../clients/firestoreSubscribe';

const COL = 'mensajes_internos';

export interface MensajeInternoEntry {
  id?: string;
  fromUserId: string;
  toUserId: string;
  tipo: 'aviso' | 'cambio_turno' | 'notificacion';
  titulo: string;
  mensaje: string;
  servicioId?: string;
  date?: string;
  readAt?: string | null;
  createdAt: string;
}

export const MensajesInternosService = {
  async create(params: {
    fromUserId: string;
    toUserId: string;
    tipo: MensajeInternoEntry['tipo'];
    titulo: string;
    mensaje: string;
    servicioId?: string;
    date?: string;
  }): Promise<MensajeInternoEntry> {
    const now = new Date().toISOString();
    const res = await apiClient.post<{ id: string }>(`/api/db/${COL}`, {
      ...params,
      createdAt: now,
    });
    return { id: res.data?.id ?? String(Date.now()), ...params, createdAt: now } as MensajeInternoEntry;
  },

  async getByUser(uid: string, limitCount = 30): Promise<MensajeInternoEntry[]> {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
      query: {
        where: `toUserId:${uid}`,
        orderBy: 'created_at:desc',
        limit: limitCount,
      },
    });
    return Array.isArray(res.data)
      ? res.data.map((data) => ({
          id: data.id as string | undefined,
          fromUserId: String(data.fromUserId || ''),
          toUserId: String(data.toUserId || ''),
          tipo: (data.tipo as MensajeInternoEntry['tipo']) || 'aviso',
          titulo: String(data.titulo || ''),
          mensaje: String(data.mensaje || ''),
          servicioId: data.servicioId ? String(data.servicioId) : undefined,
          date: data.date ? String(data.date) : undefined,
          readAt: data.readAt ? String(data.readAt) : null,
          createdAt: String(data.createdAt || ''),
        }) satisfies MensajeInternoEntry)
      : [];
  },

  // FASE 5.34 (2026-05-22): bus socket en lugar de polling 10s.
  subscribeByUser(uid: string, callback: (items: MensajeInternoEntry[]) => void): () => void {
    return subscribeViaBus<MensajeInternoEntry[]>(
      COL,
      () => this.getByUser(uid, 50),
      callback,
      { alsoListen: ['bus:db:mensajesInternos:any'] },
    );
  },

  /** Para el Listero: alertas de solicitud de cambio de turno. */
  // FASE 5.35 (2026-05-22): bus socket en lugar de polling 10s.
  subscribeCambioTurnoAlerts(callback: (items: MensajeInternoEntry[]) => void): () => void {
    return subscribeViaBus<MensajeInternoEntry[]>(
      COL,
      async () => {
        const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${COL}`, {
          query: {
            where: 'toUserId:listero,tipo:cambio_turno',
            orderBy: 'created_at:desc',
            limit: 20,
          },
        });
        return Array.isArray(res.data) ? (res.data as unknown as MensajeInternoEntry[]) : [];
      },
      callback,
      { alsoListen: ['bus:db:mensajesInternos:any'] },
    );
  },
};
