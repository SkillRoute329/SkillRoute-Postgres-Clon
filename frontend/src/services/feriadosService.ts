import { apiClient } from '../clients/apiClient';

const FERIADOS_COL = 'feriados';

export interface Feriado {
  id?: string;
  fecha: string; // YYYY-MM-DD
  nombre: string;
  recurrente: boolean; // Si es verdadero, se repite todos los años el mismo MM-DD
  tipoHorario?: 'DOMINGO' | 'SABADO' | 'ESPECIAL'; // Qué grilla usar
}

export const FeriadosService = {
  // TODO FASE 4.5: Socket.io firestore:feriados
  subscribe(callback: (feriados: Feriado[]) => void): () => void {
    let active = true;

    const fetch = async () => {
      try {
        const raw = await apiClient.get(`/api/db/${FERIADOS_COL}`, {
          query: { orderBy: 'fecha:asc', limit: 500 },
        }) as Feriado[];
        if (active) callback(Array.isArray(raw) ? raw : []);
      } catch {
        // ignore
      }
    };

    fetch();
    const interval = setInterval(fetch, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  },

  async getAll(): Promise<Feriado[]> {
    const raw = await apiClient.get(`/api/db/${FERIADOS_COL}`, {
      query: { orderBy: 'fecha:asc', limit: 500 },
    }) as Feriado[];
    return Array.isArray(raw) ? raw : [];
  },

  async isFeriado(fechaStr: string): Promise<Feriado | null> {
    // fechaStr format: YYYY-MM-DD
    const all = await this.getAll();
    const mmdd = fechaStr.substring(5);
    const result = all.find(
      (f) => f.fecha === fechaStr || (f.recurrente && f.fecha.substring(5) === mmdd),
    );
    return result || null;
  },

  async add(feriado: Omit<Feriado, 'id'>): Promise<string> {
    const result = await apiClient.post(`/api/db/${FERIADOS_COL}`, feriado) as { id: string };
    return result.id;
  },

  async update(id: string, updates: Partial<Feriado>): Promise<void> {
    await apiClient.put(`/api/db/${FERIADOS_COL}/` + encodeURIComponent(id), updates);
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/api/db/${FERIADOS_COL}/` + encodeURIComponent(id));
  },
};
