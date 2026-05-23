/**
 * firestoreSubscribe — Helper de suscripciones con bus + fallback (FASE 5.31, 2026-05-21)
 *
 * Reemplaza el patrón legacy `setInterval(fetch, 10000)` por una
 * suscripción al bus socket del backend con polling de respaldo más
 * espaciado (60s). Cuando el backend emite `bus:db:<collection>:any`,
 * el cliente refetcha inmediatamente — UI inmediata, sin tormenta de
 * requests.
 *
 *   subscribeViaBus('shifts', () => ShiftService.getAll(), cb);
 *
 * Devuelve función de cleanup para llamar en `useEffect` return.
 */

import { on as socketOn } from './socketClient';

const FALLBACK_INTERVAL_MS = 60_000;

export function subscribeViaBus<T>(
  collection: string,
  fetchFn: () => Promise<T>,
  callback: (data: T) => void,
  opts: { fallbackMs?: number; alsoListen?: string[] } = {},
): () => void {
  let cancelled = false;

  const fire = async () => {
    if (cancelled) return;
    try {
      const data = await fetchFn();
      if (!cancelled) callback(data);
    } catch {
      /* silent — la próxima emisión del bus reintentará */
    }
  };

  // Carga inicial
  void fire();

  // Suscripción al bus específico de la colección + alias adicionales
  const events = [`bus:db:${collection}:any`, ...(opts.alsoListen ?? [])];
  const unsubs = events.map((ev) => socketOn(ev, () => { void fire(); }));

  // Fallback de polling más espaciado por si el socket se cae
  const interval = setInterval(() => { void fire(); }, opts.fallbackMs ?? FALLBACK_INTERVAL_MS);

  return () => {
    cancelled = true;
    clearInterval(interval);
    unsubs.forEach((u) => u());
  };
}
