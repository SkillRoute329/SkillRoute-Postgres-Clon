/**
 * Acceso backend UCOT: cartones_completados (1 pestaña = 1 doc) y programacion_diaria (asignaciones Listero).
 */
import { apiClient } from '../clients/apiClient';

const CARTONES_COMPLETADOS = 'cartones_completados';
const PROGRAMACION_DIARIA = 'programacion_diaria';

export type CartonFisicoDoc = {
  id: string;
  linea: string;
  servicio: string;
  paradas: string[];
  viajes: { fila: number; tiempos: string[] }[];
  notasCabecera: string[];
  notasPie: string[];
  sheetName?: string;
};

export type ProgramacionDiariaRecord = {
  id: string;
  date: string;
  linea: string;
  servicio: string;
  vehiculo: string;
  conductor: string;
  horaInicio?: string;
  createdAt?: string;
};

export const firestoreUCOT = {
  async getCartonesFisicos(): Promise<CartonFisicoDoc[]> {
    const result = await apiClient.get(`/api/db/${CARTONES_COMPLETADOS}`, { query: { limit: 5000 } }) as CartonFisicoDoc[];
    return Array.isArray(result) ? result : [];
  },

  async getCartonFisicoById(id: string): Promise<CartonFisicoDoc | null> {
    try {
      const result = await apiClient.get(`/api/db/${CARTONES_COMPLETADOS}/` + encodeURIComponent(id)) as CartonFisicoDoc | null;
      return result;
    } catch {
      return null;
    }
  },

  async getProgramacionByDate(date: string): Promise<ProgramacionDiariaRecord[]> {
    const result = await apiClient.get(`/api/db/${PROGRAMACION_DIARIA}`, {
      query: { where: `date:${date}` },
    }) as ProgramacionDiariaRecord[];
    const list = Array.isArray(result) ? result : [];
    list.sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || ''));
    return list;
  },

  async addProgramacion(
    record: Omit<ProgramacionDiariaRecord, 'id' | 'createdAt'>,
  ): Promise<ProgramacionDiariaRecord> {
    const id =
      `pd_${record.date}_${record.linea}_${String(record.servicio).replace(/\s/g, '_')}_${Date.now()}`.slice(
        0,
        80,
      );
    const payload = { ...record, id, createdAt: new Date().toISOString() };
    await apiClient.put(`/api/db/${PROGRAMACION_DIARIA}/` + encodeURIComponent(id), payload);
    return payload as ProgramacionDiariaRecord;
  },
};
