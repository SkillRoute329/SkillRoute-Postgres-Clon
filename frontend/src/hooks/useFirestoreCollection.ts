import { useEffect, useState } from 'react';
import { apiClient } from '../clients/apiClient';

/**
 * useFirestoreCollection - Polling-based collection hook (migrated from Firestore onSnapshot).
 * TODO FASE 4.5: Socket.io for real-time updates per collection.
 * @param collectionName REST collection path (maps to /api/db/<collectionName>)
 * @param constraints Ignored — constraints must now be passed via `queryParams`
 * @param queryParams Optional REST query parameters { where, orderBy, limit }
 */
export const useFirestoreCollection = <T = any>(
  collectionName: string,
  constraints: any[] = [],
  queryParams?: Record<string, string | number>,
) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const fetch = async () => {
      try {
        const raw = await apiClient.get(`/api/db/${collectionName}`, {
          query: { limit: 500, ...queryParams },
        }) as any[];
        if (!active) return;
        const items = (Array.isArray(raw) ? raw : []) as T[];
        setData(items);
        setLoading(false);
        setError(null);
      } catch (err) {
        if (!active) return;
        console.error(`[useFirestoreCollection] Error in ${collectionName}:`, err);
        setError(err);
        setLoading(false);
      }
    };

    fetch();
    // TODO FASE 4.5: Socket.io per-collection real-time
    const interval = setInterval(fetch, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [collectionName]); // queryParams intentionally omitted to match original behavior

  return { data, loading, error };
};
