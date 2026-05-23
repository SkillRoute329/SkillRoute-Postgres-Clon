/**
 * useLiveBusesByLine — Buses live filtrados por línea y operador.
 * ===============================================================
 * Hook que carga las posiciones GPS actuales de los buses operando AHORA
 * en una línea específica de un operador específico, combinando 3 fuentes:
 *
 *   1. `viajes_activos`  — chofer logueado (interno)
 *   2. `vehicle_events`  — cron autoStatsCollector cada 5 min
 *   3. `competidores`    — entidad-nivel con bus[] embebido (cross-op)
 *   4. `/api/stm/live-buses` — Proxy Directo IMM local
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../clients/apiClient';
import { useAuth } from '../context/AuthContext';
import { authHeader } from '../utils/tokenStore';

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
  if (typeof updatedAt === 'string') {
    const ms = new Date(updatedAt).getTime();
    return isNaN(ms) ? 0 : ms;
  }
  const ts = updatedAt as { toMillis?: () => number; seconds?: number };
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

/** Acepta (lat, lng) sueltos o GeoPoint o {latitude/longitude}. */
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
  const tokenRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRetryCountRef = useRef(0);

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
      const raw = await apiClient.get('/api/db/viajes_activos', {
        query: { where: `empresa:${empresaName}`, limit: 500 },
      }) as any[];
      (Array.isArray(raw) ? raw : []).forEach((data: any) => {
        const updatedAtMs = toMillis(data.updatedAt);
        if (updatedAtMs && updatedAtMs < cutoff) return;
        if (!matchLinea(data.codigoLinea ?? data.linea, codigoLinea)) return;
        const pos = extractLatLng(data.posicion) ?? (
          typeof data.lat === 'number' && typeof data.lng === 'number'
            ? { lat: data.lat, lng: data.lng }
            : null
        );
        if (!pos) return;

        const id = `va-${data.id}`;
        if (seenIds.has(id)) return;
        seenIds.add(id);
        lista.push({
          id,
          cocheId: String(data.cocheId ?? data.id),
          empresa: empresaName,
          agencyId,
          codigoLinea: String(data.codigoLinea ?? data.linea ?? '—'),
          lat: pos.lat,
          lng: pos.lng,
          heading: typeof data.heading === 'number' ? data.heading : null,
          velocidad: typeof data.velocidad === 'number' ? data.velocidad : null,
          fuente: 'viajes_activos',
          updatedAtMs,
          hacieCuantoMin: updatedAtMs ? Math.floor((ahora - updatedAtMs) / 60000) : 0,
        });
      });
    } catch {
      // No-op: si esta fuente falla, las otras siguen.
    }

    // ── 2) vehicle_events: cron autoStatsCollector ───────────────────────────
    try {
      const raw = await apiClient.get('/api/db/vehicle_events', {
        query: { where: `agencyId:${String(agencyId)}`, limit: 500 },
      }) as any[];
      (Array.isArray(raw) ? raw : []).forEach((data: any) => {
        const updatedAtMs = toMillis(data.timestamp ?? data.updatedAt);
        if (updatedAtMs && updatedAtMs < cutoff) return;
        if (!matchLinea(data.linea ?? data.codigoLinea, codigoLinea)) return;
        const pos = extractLatLng(data.posicion ?? data.geometry) ?? (
          typeof data.lat === 'number' && typeof data.lng === 'number'
            ? { lat: data.lat, lng: data.lng }
            : null
        );
        if (!pos) return;

        const id = `ve-${data.cocheId ?? data.id}`;
        if (seenIds.has(id)) return;
        seenIds.add(id);
        lista.push({
          id,
          cocheId: String(data.cocheId ?? data.id),
          empresa: empresaName,
          agencyId,
          codigoLinea: String(data.linea ?? data.codigoLinea ?? '—'),
          lat: pos.lat,
          lng: pos.lng,
          heading: typeof data.heading === 'number' ? data.heading : null,
          velocidad: typeof data.velocidad === 'number' ? data.velocidad : null,
          fuente: 'vehicle_events',
          updatedAtMs,
          hacieCuantoMin: updatedAtMs ? Math.floor((ahora - updatedAtMs) / 60000) : 0,
        });
      });
    } catch {
      // No-op
    }

    // ── 3) competidores/{emp-XX}: cron refreshCompetidoresTick ───────────────
    if (competidorDocId) {
      try {
        const data = await apiClient.get('/api/db/competidores/' + encodeURIComponent(competidorDocId)) as any;
        if (data) {
          const busArr = (data.buses ?? data.vehiculos ?? []) as Array<Record<string, unknown>>;
          const fuenteMs = toMillis(data.actualizadoEn ?? data.updatedAt);
          busArr.forEach((b, idx) => {
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
      } catch {
        // No-op
      }
    }

    // ── 4) SOBERANIA: Proxy Directo IMM local ─────────────────────────────────
    // FASE 5.38 (2026-05-22): guard contra race condition — si todavía no
    // hay token en localStorage, evitamos el 401 silencioso. Cuando el
    // siguiente tick reactive el token, la llamada saldrá OK.
    // FASE 5.39 (2026-05-23): si el token aún no está, programamos un
    // micro-reintento (1s, hasta 3 intentos) en vez de esperar al refresh
    // periódico de 30s. Cubre el bug de fleet-monitor que mostraba 401
    // crítico en primera carga porque el AuthContext sigue rehidratando.
    try {
      const hdr = authHeader();
      if (!hdr.Authorization) {
        if (tokenRetryCountRef.current < 3) {
          tokenRetryCountRef.current += 1;
          if (tokenRetryRef.current) clearTimeout(tokenRetryRef.current);
          tokenRetryRef.current = setTimeout(() => {
            if (!cancelRef.current) void cargar();
          }, 1000);
        }
      } else {
        tokenRetryCountRef.current = 0;
      const res = await fetch('/api/stm/live-buses', {
        headers: { ...hdr }
      });
      const outerJson = await res.json();
      if (outerJson.success && outerJson.data?.features) {
        outerJson.data.features.forEach((feat: any) => {
          const p = feat.properties;
          if (!p || !p.codigoEmpresa || !p.linea) return;

          const numericAgency = Number(p.codigoEmpresa);
          if (agencyId !== -1 && numericAgency !== agencyId) return;
          if (!matchLinea(p.linea, codigoLinea)) return;

          const coords = feat.geometry?.coordinates;
          if (!coords || coords.length < 2) return;

          const id = `imm-${p.codigoBus}`;
          if (seenIds.has(id)) return;
          seenIds.add(id);

          lista.push({
            id,
            cocheId: String(p.codigoBus),
            empresa: AGENCY_NAME[numericAgency] || `EMP_${numericAgency}`,
            agencyId: numericAgency,
            codigoLinea: String(p.linea),
            lat: coords[1],
            lng: coords[0],
            heading: null,
            velocidad: typeof p.velocidad === 'number' ? p.velocidad : null,
            fuente: 'competidores',
            updatedAtMs: ahora,
            hacieCuantoMin: 0,
          });
        });
      }
      } // close: token guard else
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
      if (tokenRetryRef.current) {
        clearTimeout(tokenRetryRef.current);
        tokenRetryRef.current = null;
      }
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
