/**
 * appVersion.ts — detección y reacción ante nueva versión desplegada.
 *
 * Mecanismo:
 *  1. Al arrancar, la app lee /version.json (no-store) y lo guarda en memoria.
 *  2. Cada 60s vuelve a pedirlo. Si el buildId cambió → fuerza recarga completa
 *     (limpia cache del navegador + SW + reload).
 *  3. Expone getLoadedVersion() para mostrarlo en la UI (badge de diagnóstico).
 *
 * Así nunca más un usuario queda pegado a un bundle viejo silenciosamente.
 */

export interface AppVersion {
  buildId: string;
  commit: string;
  builtAt: string;
}

let loadedVersion: AppVersion | null = null;
let pollTimer: number | null = null;
let reloading = false;

export function getLoadedVersion(): AppVersion | null {
  return loadedVersion;
}

async function fetchRemoteVersion(): Promise<AppVersion | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as AppVersion;
  } catch {
    return null;
  }
}

async function hardReload(): Promise<void> {
  // Deshabilitado — reactivar cambiando la línea de abajo a: window.location.reload();
  if (reloading) return;
  reloading = true;
  console.log('[appVersion] Nueva versión disponible — recarga automática en pausa (modo demo). Recargá manualmente para actualizar.');
}

export async function initAppVersionWatcher(): Promise<void> {
  try {
    localStorage.removeItem('app_version');
  } catch {
    /* ignore */
  }

  const initial = await fetchRemoteVersion();
  if (!initial) return;
  loadedVersion = initial;

  if (pollTimer !== null) window.clearInterval(pollTimer);
  pollTimer = window.setInterval(async () => {
    const current = await fetchRemoteVersion();
    if (!current || !loadedVersion) return;
    if (current.buildId !== loadedVersion.buildId) {
      console.warn(
        `[appVersion] Nueva versión detectada (${loadedVersion.buildId} → ${current.buildId}). Recargando...`,
      );
      await hardReload();
    }
  }, 60_000);

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !loadedVersion) return;
    const current = await fetchRemoteVersion();
    if (current && current.buildId !== loadedVersion.buildId) {
      await hardReload();
    }
  });
}
