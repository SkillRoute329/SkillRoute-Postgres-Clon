// Hook de datos de cumplimiento — abstrae fetching y caché
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §7.1

import { useState, useEffect, useCallback, useRef } from 'react';
import { RegulatoryData, Granularidad } from '../types/compliance';
import { fetchRegulatoryData } from '../services/complianceService';
import { useAuth } from '../context/AuthContext';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

interface CacheEntry {
  data: RegulatoryData;
  ts: number;
}

const cache = new Map<string, CacheEntry>();

interface Params {
  agencyId: string | 'all';
  from: Date;
  to: Date;
  granularity: Granularidad;
  enabled?: boolean;
}

interface Result {
  data: RegulatoryData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useComplianceData(p: Params): Result {
  const { token } = useAuth();
  const [data, setData] = useState<RegulatoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cacheKey = `${p.agencyId}:${p.from.toISOString().slice(0, 10)}:${p.to.toISOString().slice(0, 10)}:${p.granularity}`;

  const load = useCallback(async (force = false) => {
    if (!token || p.enabled === false) return;

    // Checar caché
    const hit = cache.get(cacheKey);
    if (!force && hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      setData(hit.data);
      return;
    }

    abortRef.current?.abort();
    setLoading(true);
    setError(null);

    try {
      const result = await fetchRegulatoryData(
        token,
        p.agencyId,
        p.from,
        p.to,
        p.granularity,
      );
      cache.set(cacheKey, { data: result, ts: Date.now() });
      setData(result);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError(err?.message ?? 'Error al cargar datos de cumplimiento');
      }
    } finally {
      setLoading(false);
    }
  }, [token, cacheKey, p.enabled]);

  useEffect(() => {
    load();
    return () => { abortRef.current?.abort(); };
  }, [load]);

  return { data, loading, error, refresh: () => load(true) };
}
