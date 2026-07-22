import { apiClient } from '../../clients/apiClient';
import { getMasterLineas, getMasterServicios, getMasterServicioById } from '../../data/ucotMaster';
import type { Carton } from './types';

const LINEAS = 'lineas';
const SERVICIOS = 'servicios';
const SEASONS_COL = 'carton_seasons';
const SERVICE_DEFINITIONS = 'service_definitions';
const CARTONES = 'cartones';
const CARTONES_COMPLETADOS = 'cartones_completados';

/** ID de Servicio como clave primaria (Arquitectura CEO). Todo nace del JSON Maestro; el backend solo guarda estado dinámico. */

/** Mapea un doc de service_definitions al formato esperado por InspectorDashboard/InspectorCapture (id, linea, headers, rawMatrix, serviceNumber). */
function mapServiceDefToCartonShape(
  docId: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const headers = ((data.headers as string[]) || []).map(
    (h: string | { id?: string; location?: string }, i: number) =>
      typeof h === 'string'
        ? { id: `stop-${i}`, location: h }
        : {
            id: (h as { id?: string }).id || `stop-${i}`,
            location: (h as { location?: string }).location || '',
          },
  );
  const rawMatrix = ((data.rawMatrix as Array<{ checkpoints?: string[] }>) || []).map(
    (r: { checkpoints?: string[] }) => ({
      checkpoints: r.checkpoints || [],
    }),
  );
  const serviceNumber = (data.serviceNumber as string) || docId;
  return {
    id: docId,
    serviceNumber,
    linea: data.lineCode || data.linea || '',
    headers,
    rawMatrix,
  };
}

/** Mapea un doc de colección cartones (esquema UCOT) al formato esperado por AdminCartones/InspectorDashboard. */
function mapCartonDocToShape(docId: string, data: Record<string, any>): Carton {
  const paradas = (data.paradas as Array<{ nombre: string; tiempos?: string[] }>) || [];
  const headers = paradas.map((p, i) => ({
    id: `stop-${i}`,
    location: (p.nombre || '').trim() || `Punto ${i + 1}`,
    isStop: true,
  }));

  // Re-pivot: Column-wise (DB) -> Row-wise (UI)
  const maxRows = Math.max(0, ...paradas.map((p) => p.tiempos?.length || 0));
  const rawMatrix = Array.from({ length: maxRows }, (_, rowIdx) => ({
    checkpoints: paradas.map((p) => (p.tiempos && p.tiempos[rowIdx]) || '--:--'),
  }));

  // Convert rawMatrix to 'rows' [{ id, times: { 'stop-0': 'HH:MM' } }] for DigitalCarton
  const rows = rawMatrix.map((r, rowIdx) => {
    const times: Record<string, string> = {};
    r.checkpoints.forEach((t, colIdx) => {
      times[`stop-${colIdx}`] = t;
    });
    return { id: `r-${rowIdx}`, times };
  });

  const servicioId =
    (data.servicio as string) || (data.serviceNumber as string) || docId.split('_')[0];

  return {
    id: docId,
    serviceNumber: servicioId,
    linea: data.linea || '',
    line: data.linea || '', // For AdminCartones s.line
    title: data.nombre || data.nombreServicio || `Serv ${servicioId}`,
    headers,
    rawMatrix,
    routeData: { headers, rows }, // Full compatibility for DigitalCarton load
    temporada: data.temporada as string,
    tipo_dia: data.tipo_dia as string,
  };
}

export const CartonService = {
  /**
   * Líneas desde JSON Maestro (fuente de verdad). Fallback al backend si el maestro no tiene datos.
   */
  getLineIdsFromMaster(): string[] {
    const lineas = getMasterLineas();
    if (lineas.length > 0)
      return lineas
        .map((l) => l.id)
        .filter(Boolean)
        .sort();
    return [];
  },

  /**
   * Devuelve los IDs de líneas disponibles.
   * Origen: 1) JSON Maestro, 2) service_definitions, 3) cartones, 4) lineas.
   */
  async getLineIds(): Promise<string[]> {
    const seen = new Set<string>();

    // 1. Cargar desde el Maestro (Base inamovible)
    const fromMaster = this.getLineIdsFromMaster();
    fromMaster.forEach((id) => seen.add(id));

    // 2. Cargar desde el backend (Extensiones dinámicas)
    /* Desactivado para evitar mezclar líneas de otros operadores en la BD unificada.
    try {
      const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${SERVICE_DEFINITIONS}`, { query: { limit: 5000 } });
      (Array.isArray(res.data) ? res.data : []).forEach((d) => {
        const lineCode = (d.lineCode as string) || (d.linea as string);
        if (lineCode) {
          const str = String(lineCode).trim();
          if (!(str.length > 5 && !isNaN(Number(str)))) seen.add(str);
        }
      });
    } catch { }

    try {
      const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${CARTONES}`, { query: { limit: 5000 } });
      (Array.isArray(res.data) ? res.data : []).forEach((d) => {
        const linea = (d.lineCode as string) || (d.linea as string);
        if (linea) {
          const str = String(linea).trim();
          if (!(str.length > 5 && !isNaN(Number(str)))) seen.add(str);
        }
      });
    } catch { }

    try {
      const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${LINEAS}`, { query: { limit: 5000 } });
      (Array.isArray(res.data) ? res.data : []).forEach((d) => {
        const linea = (d.nombre as string) || (d.linea as string) || (d.lineCode as string);
        if (linea) {
          const clean = String(linea).replace('Linea ', '').trim();
          if (!(clean.length > 5 && !isNaN(Number(clean)))) seen.add(clean);
        }
      });
    } catch { }
    */

    return Array.from(seen).filter(Boolean).sort();
  },

  /**
   * Servicios desde JSON Maestro por línea. Clave primaria = servicioId.
   */
  getServiciosFromMaster(
    lineaId?: string,
  ): Array<{ id: string; linea: string; serviceNumber: string }> {
    const list = getMasterServicios(lineaId);
    return list.map((s) => ({
      id: s.servicioId,
      linea: s.linea,
      serviceNumber: s.serviceNumber ?? s.servicioId,
    }));
  },

  getServicioMasterById(servicioId: string) {
    return getMasterServicioById(servicioId);
  },

  async getAll(seasonOrLine?: string, dayType?: string): Promise<any[]> {
    // 0. No filter: return all from master (fastest path)
    if (!seasonOrLine && !dayType) {
      const all = getMasterServicios();
      if (all.length > 0) {
        return all.map((s) => ({
          id: s.servicioId,
          linea: s.linea,
          serviceNumber: s.serviceNumber ?? s.servicioId,
          headers: (s.puntosControl ?? []).map((p, i) => ({ id: `stop-${i}`, location: p })),
          rawMatrix: (s.horarios ?? []).map((h) => ({ checkpoints: h.filas ?? [] })),
        }));
      }
    }
    // 1. Specific Line Filter (e.g. "300")
    if (seasonOrLine && !/^(VERANO|INVIERNO)/.test(seasonOrLine)) {
      const lineId = seasonOrLine;
      const mergedMap = new Map<string, any>();

      // 1a. Base desde el Maestro
      const fromMaster = getMasterServicios(lineId);
      fromMaster.forEach((s: any) => {
        mergedMap.set(s.servicioId, {
          id: s.servicioId,
          linea: s.linea,
          serviceNumber: s.serviceNumber ?? s.servicioId,
          headers: s.headers?.length
            ? s.headers
            : (s.puntosControl ?? []).map((p: string, i: number) => ({
                id: `stop-${i}`,
                location: p,
              })),
          rawMatrix: s.rawMatrix?.length
            ? s.rawMatrix
            : (s.horarios ?? []).map((h: any) => ({ checkpoints: h.filas ?? [] })),
          instruccionesEspeciales: s.instruccionesEspeciales,
          source: 'master',
        });
      });

      // 1b. Extender/Sobrescribir desde el backend
      /* Desactivado para evitar servicios de otros operadores
      try {
        const whereStr = dayType
          ? `linea:${lineId},tipo_dia:${dayType}`
          : `linea:${lineId}`;
        const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${CARTONES}`, {
          query: { where: whereStr, limit: 5000 },
        });
        (Array.isArray(res.data) ? res.data : []).forEach((d) => {
          const data = mapCartonDocToShape((d.id as string) ?? '', d);
          mergedMap.set(data.id, { ...mergedMap.get(data.id), ...data, source: 'backend' });
        });
      } catch { }

      if (mergedMap.size > 0) {
        return Array.from(mergedMap.values());
      }

      // Fallback: lineas/{lineId}/servicios (subcollection → tabla lineas_servicios)
      // TODO: confirmar tabla subcollection
      try {
        const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${LINEAS}_${SERVICIOS}`, {
          query: { where: `linea:${lineId}`, limit: 5000 },
        });
        return (Array.isArray(res.data) ? res.data : []).map((s) => ({ ...s, linea: lineId }));
      } catch { return []; }
      */

      return Array.from(mergedMap.values());
    }

    // 2. Global Seasonal/DayType Filter
    try {
      const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${CARTONES}`, {
        query: { where: `temporada:${seasonOrLine}`, limit: 5000 },
      });
      let list = (Array.isArray(res.data) ? res.data : []).map((d) =>
        mapCartonDocToShape((d.id as string) ?? '', d),
      ) as any[];

      if (dayType) {
        list = list.filter((c: Carton) => c.tipo_dia === dayType);
      }
      if (list.length > 0) return list;
    } catch (err) {
      console.error('[CartonService] Filter error:', err);
    }

    // 3. Absolute Fallback: All Cartones or Legacy Definitions
    try {
      const allRes = await apiClient.get<Record<string, unknown>[]>(`/api/db/${CARTONES}`, { query: { limit: 200 } });
      if (Array.isArray(allRes.data) && allRes.data.length > 0) {
        return allRes.data.map((d) => mapCartonDocToShape((d.id as string) ?? '', d));
      }

      const defsRes = await apiClient.get<Record<string, unknown>[]>(`/api/db/${SERVICE_DEFINITIONS}`, { query: { limit: 5000 } });
      if (Array.isArray(defsRes.data) && defsRes.data.length > 0) {
        return defsRes.data.map((d) => mapServiceDefToCartonShape((d.id as string) ?? '', d));
      }
    } catch (err) {
      console.error('[CartonService] Fallback error:', err);
    }

    return [];
  },

  async save(payload: Record<string, unknown>) {
    const lineId = String(payload.linea ?? payload.line ?? '300');
    const serviceId = String(payload.id ?? payload.serviceId ?? 'default');
    // Subcollection lineas/{lineId}/servicios → tabla lineas_servicios
    // TODO: confirmar tabla subcollection
    const id = `${lineId}_${serviceId}`;
    await apiClient.put(`/api/db/${LINEAS}_${SERVICIOS}/${encodeURIComponent(id)}`, payload);
  },

  async swapVehicle(serviceId: string, vehicleId: string) {
    const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${LINEAS}`, { query: { limit: 5000 } });
    const lineas = Array.isArray(res.data) ? res.data : [];
    for (const lineDoc of lineas) {
      const lineId = lineDoc.id as string;
      const id = `${lineId}_${serviceId}`;
      try {
        const snap = await apiClient.get<Record<string, unknown>>(`/api/db/${LINEAS}_${SERVICIOS}/${encodeURIComponent(id)}`);
        if (snap.data) {
          await apiClient.put(`/api/db/${LINEAS}_${SERVICIOS}/${encodeURIComponent(id)}`, { vehicleId });
          return;
        }
      } catch { /* not found, continue */ }
    }
  },

  async getSuggestions(_seasonId: number): Promise<any[]> {
    return [];
  },

  /** Cartones físicos (1 pestaña = 1 doc): grilla 2D desde cartones_completados. */
  async getCartonesFisicos(): Promise<any[]> {
    try {
      const res = await apiClient.get<Record<string, unknown>[]>(`/api/db/${CARTONES_COMPLETADOS}`, { query: { limit: 5000 } });
      return Array.isArray(res.data)
        ? res.data.map((d) => ({ ...d, source: 'fisico' }))
        : [];
    } catch {
      return [];
    }
  },

  async getCartonFisicoById(id: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await apiClient.get<Record<string, unknown>>(`/api/db/${CARTONES_COMPLETADOS}/${encodeURIComponent(id)}`);
      return res.data ? { ...res.data, source: 'fisico' } : null;
    } catch { return null; }
  },

  /** Actualiza los tiempos de un cartón (edición in-place). */
  async updateCartonParadas(
    cartonDocId: string,
    paradas: Array<{ nombre: string; tiempos?: string[] }>,
    lineId?: string,
  ): Promise<void> {
    await apiClient.put(`/api/db/${CARTONES}/${encodeURIComponent(cartonDocId)}`, {
      paradas,
      ...(lineId ? { linea: lineId } : {}),
    });

    // Sync service_definitions if it exists
    try {
      const defRes = await apiClient.get<Record<string, unknown>>(`/api/db/${SERVICE_DEFINITIONS}/${encodeURIComponent(cartonDocId)}`);
      if (defRes.data) {
        const headers = paradas.map((p, i) => ({
          id: (p.nombre || '').trim() || `stop-${i}`,
          location: (p.nombre || '').trim() || `Punto ${i + 1}`,
        }));
        const maxLen = Math.max(0, ...paradas.map((p) => p.tiempos?.length ?? 0));
        const rawMatrix = Array.from({ length: maxLen }, (_, rowIdx) => ({
          checkpoints: paradas.map((p) => p.tiempos?.[rowIdx] ?? '--:--'),
        }));
        await apiClient.put(`/api/db/${SERVICE_DEFINITIONS}/${encodeURIComponent(cartonDocId)}`, { headers, rawMatrix });
      }
    } catch { /* service_definitions doc not found, skip */ }
  },
};
