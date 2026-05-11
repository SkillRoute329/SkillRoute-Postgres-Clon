/**
 * useLiveBusesByLine — Buses live filtrados por línea y operador.
 * ===============================================================
 * Hook compañero del Navegador que carga las posiciones GPS actuales de los
 * buses operando AHORA en una línea específica de un operador específico,
 * combinando 3 fuentes (mismo patrón que ShadowRadar):
 *
 *   1. `viajes_activos`     — chofer logueado (interno, puede estar vacío)
 *   2. `vehicle_events`     — cron autoStatsCollector cada 5 min (relleno)
 *   3. `competidores`       — cron refreshCompetidoresTick cada 10 min,
 *                              entidad-nivel con bus[] embebido (cross-op)
 *
 * Política:
 *   - getDocs (one-shot) en cada tick. NO onSnapshot — el SDK Firestore tiene
 *     el bug conocido de re-emitir permission-denied en listeners aunque
 *     la rule sea correcta (ver historial DIAGNOSTICO_NAVEGADOR_2026_04_25).
 *   - Refresh manual cada `refreshSec` (default 30 s).
 *   - Auth guard: si !user?.uid, retorna vacío y no abre nada.
 *   - Tolerante a fallos: si una fuente falla, las otras siguen.
 *
 * Filtros:
 *   - agencyId obligatorio (10/20/50/70).
 *   - codigoLinea opcional (si se omite devuelve TODOS los de la empresa).
 *
 * Performance:
 *   - Empresa propia (`viajes_activos` + `vehicle_events`) se queryan con
 *     `where('empresa', '==', empresaName)` para reducir datos.
 *   - `competidores/{emp-XX}` se lee con getDoc (un solo doc por empresa).
 *
 * USO:
 *   const { buses, loading, ultimaActualizacion, refrescar } = useLiveBusesByLine({
 *     agencyId: 50,
 *     codigoLinea: '60',
 *     refreshSec: 30,
 *   });
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit as limitDocs,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface BusLive {
  id: string;
  cocheId: string;
  empresa: string;
  agencyId: number;
  codigoLinea: string;
  lat: number;
  lng: number;
  heading?: number | null;
  velocidad?: number | null;
  fuente: 'viajes_activos' | 'vehicle_events' | 'competidores';
  hacieCuantoMin: number;
  updatedAtMs: number;
}

export interface UseLiveBusesByLineOptions {
  agencyId: number;
  codigoLinea?: string;
  /** Cada cuántos segundos refrescar. Default 30. 0 = solo carga inicial. */
  refreshSec?: number;
  /** Descartar buses inactivos hace más de N minutos. Default 15. */
  inactividadMin?: number;
  /** Pausar el hook (ej: cuando el componente está oculto). Default false. */
  pausado?: boolean;
}

export interface UseLiveBusesByLineResult {
  buses: BusLive[];
  loading: boolean;
  error: string | null;
  ultimaActualizacion: Date | null;
  refrescar: () => void;
}

// ─── Mapeo agencyId ↔ nombre de empresa en docs ────────────────────────────────

const AGENCY_NAME: Record<number, string> = {
  10: 'COETC',
  20: 'COME',
  50: 'CUTCSA',
  70: 'UCOT',
};

const COMPETIDORES_DOC_ID: Record<number, string> = {
  10: 'emp-10',
  20: 'emp-20',
  50: 'emp-50',
  70: 'emp-70',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMillis(updatedAt: unknown): number {
  if (!updatedAt) return 0;
  if (typeof updatedAt === 'number') return updatedAt;
  const ts = updatedAt as { toMillis?: () => number; seconds?: number };
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

/** Acepta (lat, lng) sueltos o GeoPoint Firestore o {latitude/longitude}. */
function extractLatLng(
  raw: unknown,
): { lat: number; lng: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lat = (r.latitude ?? r.lat) as number | undefined;
  const lng = (r.longitude ?? r.lng ?? r.lon) as number | undefined;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function matchLinea(busLinea: unknown, target?: string): boolean {
  if (!target) return true;
  const a = String(busLinea ?? '')
    .replace(/[ab]$/i, '')
    .trim()
    .toLowerCase();
  const b = String(target)
    .replace(/[ab]$/i, '')
    .trim()
    .toLowerCase();
  return a === b && a !== '';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLiveBusesByLine(
  opts: UseLiveBusesByLineOptions,
): UseLiveBusesByLineResult {
  const { agencyId, codigoLinea, refreshSec = 30, inactividadMin = 15, pausado = false } = opts;
  const { user } = useAuth();

  const [buses, setBuses] = useState<BusLive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  const cancelRef = useRef(false);

  const cargar = useCallback(async () => {
    if (!user?.uid) return;
    if (pausado) return;
    if (!agencyId) return;

    cancelRef.current = false;
    setLoading(true);
    setError(null);

    const empresaName = AGENCY_NAME[agencyId] ?? `EMP_${agencyId}`;
    const competidorDocId = COMPETIDORES_DOC_ID[agencyId];
    const ahora = Date.now();
    const cutoff = ahora - inactividadMin * 60 * 1000;
    const seenIds = new Set<string>();
    const lista: BusLive[] = [];

    // ── 1) viajes_activos: chofer logueado ───────────────────────────────────
    try {
      const q = query(
        collection(db, 'viajes_activos'),
        where('empresa', '==', empresaName),
        limitDocs(500),
      );
      const snap = await getDocs(q);
      snap.docs.forEach((d: DocumentData) => {
        const data = d.data() as Record<string, unknown>;
        const updatedAtMs = toMillis(data.updatedAt);
        if (updatedAtMs && updatedAtMs < cutoff) return;
        if (!matchLinea(data.codigoLinea ?? data.linea, codigoLinea)) return;
        const pos = extractLatLng(data.posicion);
        if (!pos) return;

        const id = `va-${d.id}`;
        if (seenIds.has(id)) return;
        seenIds.add(id);
        lista.push({
          id,
          cocheId: String(data.cocheId ?? d.id),
          empresa: empresaName,
          agencyId,
          codigoLinea: String(data.codigoLinea ?? data.linea ?? '—'),
          lat: pos.lat,
          lng: pos.lng,
          heading: typeof data.heading === 'number' ? (data.heading as number) : null,
          velocidad: typeof data.velocidad === 'number' ? (data.velocidad as number) : null,
          fuente: 'viajes_activos',
          updatedAtMs,
          hacieCuantoMin: updatedAtMs ? Math.floor((ahora - updatedAtMs) / 60000) : 0,
        });
      });
    } catch (err) {
      // No-op: si esta fuente falla, las otras siguen.
    }

    // ── 2) vehicle_events: cron autoStatsCollector ───────────────────────────
    try {
      const q = query(
        collection(db, 'vehicle_events'),
        where('agencyId', '==', String(agencyId)),
        limitDocs(500),
      );
      const snap = await getDocs(q);
      snap.docs.forEach((d: DocumentData) => {
        const data = d.data() as Record<string, unknown>;
        const updatedAtMs = toMillis(data.timestamp ?? data.updatedAt);
        if (updatedAtMs && updatedAtMs < cutoff) return;
        if (!matchLinea(data.linea ?? data.codigoLinea, codigoLinea)) return;
        const pos = extractLatLng(data.posicion ?? data.geometry);
        if (!pos) return;

        const id = `ve-${data.cocheId ?? d.id}`;
        if (seenIds.has(id)) return;
        seenIds.add(id);
        lista.push({
          id,
          cocheId: String(data.cocheId ?? d.id),
          empresa: empresaName,
          agencyId,
          codigoLinea: String(data.linea ?? data.codigoLinea ?? '—'),
          lat: pos.lat,
          lng: pos.lng,
          heading: typeof data.heading === 'number' ? (data.heading as number) : null,
          velocidad: typeof data.velocidad === 'number' ? (data.velocidad as number) : null,
          fuente: 'vehicle_events',
          updatedAtMs,
          hacieCuantoMin: updatedAtMs ? Math.floor((ahora - updatedAtMs) / 60000) : 0,
        });
      });
    } catch (err) {
      // No-op
    }

    // ── 3) competidores/{emp-XX}: cron refreshCompetidoresTick ───────────────
    if (competidorDocId) {
      try {
        const ref = doc(db, 'competidores', competidorDocId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          const buses = (data.buses ?? data.vehiculos ?? []) as Array<Record<string, unknown>>;
          const fuenteMs = toMillis(data.actualizadoEn ?? data.updatedAt);
          buses.forEach((b, idx) => {
            if (!matchLinea(b.linea ?? b.codigoLinea, codigoLinea)) return;
            const pos = extractLatLng({ lat: b.lat, lng: b.lng });
            if (!pos) return;

            const id = `comp-${b.cocheId ?? b.id ?? idx}`;
            if (seenIds.has(id)) return;
            seenIds.add(id);
            lista.push({
              id,
              cocheId: String(b.cocheId ?? b.id ?? idx),
              empresa: empresaName,
              agencyId,
              codigoLinea: String(b.linea ?? b.codigoLinea ?? '—'),
              lat: pos.lat,
              lng: pos.lng,
              heading: typeof b.heading === 'number' ? (b.heading as number) : null,
              velocidad: typeof b.velocidad === 'number' ? (b.velocidad as number) : null,
              fuente: 'competidores',
              updatedAtMs: fuenteMs,
              hacieCuantoMin: fuenteMs ? Math.floor((ahora - fuenteMs) / 60000) : 0,
            });
          });
        }
      } catch (err) {
        // No-op
      }
    }

    // ── 4) SOBERANIA: Proxy Directo IMM local 🚀 ─────────────────────────────
    try {
      const token = localStorage.getItem('tf_token');
      const res = await fetch('/api/stm/live-buses', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const outerJson = await res.json();
      if (outerJson.success && outerJson.data?.features) {
        outerJson.data.features.forEach((feat: any) => {
          const p = feat.properties;
          if (!p || !p.codigoEmpresa || !p.linea) return;
          
          // Filtros
          const numericAgency = Number(p.codigoEmpresa);
          if (agencyId !== -1 && numericAgency !== agencyId) return;
          if (!matchLinea(p.linea, codigoLinea)) return;
          
          const coords = feat.geometry?.coordinates;
          if (!coords || coords.length < 2) return;

          const id = `imm-${p.codigoBus}`;
          // Evitar duplicados
          if (seenIds.has(id)) return;
          seenIds.add(id);

          lista.push({
            id,
            cocheId: String(p.codigoBus),
            empresa: AGENCY_NAME[numericAgency] || `EMP_${numericAgency}`,
            agencyId: numericAgency,
            codigoLinea: String(p.linea),
            lat: coords[1], // Latitud
            lng: coords[0], // Longitud
            heading: null,
            velocidad: typeof p.velocidad === 'number' ? p.velocidad : null,
            fuente: 'competidores', // Usar fuente 'competidores' para mostrar en mapa
            updatedAtMs: ahora,
            hacieCuantoMin: 0,
          });
        });
      }
    } catch (err) {
      console.warn('[useLiveBusesByLine] Error recuperando telemetry local IMM', err);
    }

    if (cancelRef.current) return;
    setBuses(lista);
    setUltimaActualizacion(new Date());
    setLoading(false);
  }, [agencyId, codigoLinea, inactividadMin, pausado, user?.uid]);

  useEffect(() => {
    cargar();
    if (refreshSec <= 0 || pausado) return;
    const id = setInterval(cargar, refreshSec * 1000);
    return () => {
      cancelRef.current = true;
      clearInterval(id);
    };
  }, [cargar, refreshSec, pausado]);

  return {
    buses,
    loading,
    error,
    ultimaActualizacion,
    refrescar: cargar,
  };
}
