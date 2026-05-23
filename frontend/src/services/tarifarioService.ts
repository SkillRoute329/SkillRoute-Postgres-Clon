import { apiClient } from '../clients/apiClient';

export interface TarifaSTM {
  id: string;
  nombre: string;
  precio: number;
  categoria: 'URBANO' | 'SUBURBANO' | 'ZONAL' | 'DIFERENCIAL' | string;
  // TODO: Agregar campos de feriados si es necesario, o mantenerlo separado.
}

const COLLECTION_NAME = 'tarifario_stm';

/** Obtiene las tarifas del backend (Lectura única) */
export async function getTarifas(): Promise<TarifaSTM[]> {
  const raw = await apiClient.get(`/api/db/${COLLECTION_NAME}`, {
    query: { orderBy: 'precio:asc', limit: 500 },
  }) as TarifaSTM[];
  return Array.isArray(raw) ? raw : [];
}

/** Escucha en tiempo real las tarifas para mantener el cliente siempre actualizado */
// TODO FASE 4.5: Socket.io firestore:tarifario_stm
export function listenToTarifas(onUpdate: (tarifas: TarifaSTM[]) => void): () => void {
  let active = true;

  const fetch = async () => {
    try {
      const tarifas = await getTarifas();
      if (active) onUpdate(tarifas);
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
}

/** Inserta un array inicial para rellenar (seed) la base de datos si está vacía. Solo admin. */
export async function setSeedTarfias(tarifasSeed: TarifaSTM[]) {
  for (const t of tarifasSeed) {
    await apiClient.put(`/api/db/${COLLECTION_NAME}/` + encodeURIComponent(t.id), {
      nombre: t.nombre,
      precio: t.precio,
      categoria: t.categoria,
    });
  }
}

/** Actualiza el precio de una tarifa */
export async function updatePrecioTarifa(id: string, nuevoPrecio: number) {
  await apiClient.put(`/api/db/${COLLECTION_NAME}/` + encodeURIComponent(id), {
    precio: nuevoPrecio,
  });
}
