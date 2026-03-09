import { collection, getDocs, doc, setDoc, getDoc, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getMasterLineas, getMasterServicios, getMasterServicioById } from '../../data/ucotMaster';
import type { Carton } from './types';

const LINEAS = 'lineas';
const SERVICIOS = 'servicios';
const SEASONS_COL = 'carton_seasons';
const SERVICE_DEFINITIONS = 'service_definitions';
const CARTONES = 'cartones';
const CARTONES_COMPLETADOS = 'cartones_completados';

/** ID de Servicio como clave primaria (Arquitectura CEO). Todo nace del JSON Maestro; Firestore solo guarda estado dinÃ¡mico. */

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

/** Mapea un doc de colecciÃ³n cartones (esquema UCOT) al formato esperado por AdminCartones/InspectorDashboard. */
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
   * LÃ­neas desde JSON Maestro (fuente de verdad). Fallback a Firestore si el maestro no tiene datos.
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
   * Devuelve los IDs de lÃ­neas disponibles.
   * Origen: 1) JSON Maestro, 2) service_definitions, 3) cartones, 4) lineas.
   */
  async getLineIds(): Promise<string[]> {
    const seen = new Set<string>();

    // 1. Cargar desde el Maestro (Base inamovible)
    const fromMaster = this.getLineIdsFromMaster();
    fromMaster.forEach((id) => seen.add(id));

    // 2. Cargar desde Firestore (Extensiones dinámicas)
    try {
      const defsSnap = await getDocs(collection(db, SERVICE_DEFINITIONS));
      defsSnap.docs.forEach((d) => {
        const lineCode = (d.data().lineCode as string) || (d.data().linea as string);
        if (lineCode) seen.add(String(lineCode).trim());
      });
    } catch {
      /* ignore */
    }

    try {
      const cartonesSnap = await getDocs(collection(db, CARTONES));
      cartonesSnap.docs.forEach((d) => {
        const linea = d.data().linea as string;
        if (linea) seen.add(String(linea).trim());
      });
    } catch {
      /* ignore */
    }

    try {
      const lineasSnap = await getDocs(collection(db, LINEAS));
      lineasSnap.docs.forEach((d) => seen.add(d.id));
    } catch {
      /* ignore */
    }

    return Array.from(seen).filter(Boolean).sort();
  },

  /**
   * Servicios desde JSON Maestro por lÃ­nea. Clave primaria = servicioId.
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

      // 1b. Extender/Sobrescribir desde Firestore
      try {
        let q = query(collection(db, CARTONES), where('linea', '==', lineId));
        if (dayType) q = query(q, where('tipo_dia', '==', dayType));
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const data = mapCartonDocToShape(d.id, d.data());
          mergedMap.set(data.id, { ...mergedMap.get(data.id), ...data, source: 'firestore' });
        });
      } catch {
        /* ignore */
      }

      if (mergedMap.size > 0) {
        return Array.from(mergedMap.values());
      }

      const servRef = collection(db, LINEAS, lineId, SERVICIOS);
      const servSnap = await getDocs(servRef);
      return servSnap.docs.map((s) => ({ id: s.id, linea: lineId, ...s.data() }));
    }

    // 2. Global Seasonal/DayType Filter (Memory Filter to avoid Composite Index dependency)
    try {
      const q = query(collection(db, CARTONES), where('temporada', '==', seasonOrLine));
      const snap = await getDocs(q);
      let list = snap.docs.map((d) => mapCartonDocToShape(d.id, d.data())) as any[];

      if (dayType) {
        list = list.filter((c: Carton) => c.tipo_dia === dayType);
      }
      if (list.length > 0) return list;
    } catch (err) {
      console.error('[CartonService] Filter error:', err);
    }

    // 3. Absolute Fallback: All Cartones or Legacy Definitions
    try {
      const allSnap = await getDocs(collection(db, CARTONES));
      if (!allSnap.empty) {
        const all = allSnap.docs.map((d) => mapCartonDocToShape(d.id, d.data()));
        return all.slice(0, 200); // Limit total
      }

      const defsSnap = await getDocs(collection(db, SERVICE_DEFINITIONS));
      if (!defsSnap.empty)
        return defsSnap.docs.map((d) => mapServiceDefToCartonShape(d.id, d.data()));
    } catch (err) {
      console.error('[CartonService] Fallback error:', err);
    }

    return [];
  },

  async save(payload: Record<string, unknown>) {
    const lineId = String(payload.linea ?? payload.line ?? '300');
    const serviceId = String(payload.id ?? payload.serviceId ?? 'default');
    const ref = doc(db, LINEAS, lineId, SERVICIOS, serviceId);
    await setDoc(ref, payload, { merge: true });
  },

  async swapVehicle(serviceId: string, vehicleId: string) {
    const lineasSnap = await getDocs(collection(db, LINEAS));
    for (const lineDoc of lineasSnap.docs) {
      const ref = doc(db, LINEAS, lineDoc.id, SERVICIOS, serviceId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await setDoc(ref, { vehicleId }, { merge: true });
        return;
      }
    }
  },

  async getSuggestions(_seasonId: number): Promise<any[]> {
    return [];
  },

  /** Cartones fÃ­sicos (1 pestaÃ±a = 1 doc): grilla 2D desde cartones_completados. */
  async getCartonesFisicos(): Promise<any[]> {
    try {
      const snap = await getDocs(collection(db, CARTONES_COMPLETADOS));
      return snap.docs.map((d) => ({ id: d.id, ...d.data(), source: 'fisico' }));
    } catch {
      return [];
    }
  },

  async getCartonFisicoById(id: string): Promise<Record<string, unknown> | null> {
    const snap = await getDoc(doc(db, CARTONES_COMPLETADOS, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data(), source: 'fisico' };
  },

  /** Actualiza los tiempos de un cartÃ³n (ediciÃ³n in-place). Escribe en cartones y, si existe, en service_definitions para que la recarga muestre los datos. */
  async updateCartonParadas(
    cartonDocId: string,
    paradas: Array<{ nombre: string; tiempos?: string[] }>,
    lineId?: string,
  ): Promise<void> {
    const cartonesRef = doc(db, CARTONES, cartonDocId);
    await setDoc(cartonesRef, { paradas, ...(lineId ? { linea: lineId } : {}) }, { merge: true });

    const defRef = doc(db, SERVICE_DEFINITIONS, cartonDocId);
    const defSnap = await getDoc(defRef);
    if (defSnap.exists()) {
      const headers = paradas.map((p, i) => ({
        id: (p.nombre || '').trim() || `stop-${i}`,
        location: (p.nombre || '').trim() || `Punto ${i + 1}`,
      }));
      const maxLen = Math.max(0, ...paradas.map((p) => p.tiempos?.length ?? 0));
      const rawMatrix = Array.from({ length: maxLen }, (_, rowIdx) => ({
        checkpoints: paradas.map((p) => p.tiempos?.[rowIdx] ?? '--:--'),
      }));
      await setDoc(defRef, { headers, rawMatrix }, { merge: true });
    }
  },
};
