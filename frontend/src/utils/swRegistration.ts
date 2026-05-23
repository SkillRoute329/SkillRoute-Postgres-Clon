/**
 * swRegistration.ts — registración controlada del Service Worker.
 *
 * - Registra /sw.js al cargar la página.
 * - Pide reg.update() cada 60s mientras la pestaña está abierta.
 * - Cuando el SW activo cambia (un nuevo SW tomó control vía skipWaiting),
 *   recarga UNA vez para que el navegador pida los chunks nuevos.
 *
 * Complementa a appVersion.ts: el SW resuelve el ciclo PWA, version.json
 * resuelve el caso "navegador tiene el bundle viejo aunque el SW esté bien".
 */

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  // FASE 5.26: esta purga recargaba la página cada vez que detectaba un SW.
  // Como unregister() es asíncrono, en la carga siguiente el SW seguía
  // apareciendo → recargaba otra vez → BUCLE INFINITO ("la página se
  // actualiza constantemente"). En DEV no hay PWA (devOptions.enabled:false)
  // así que se omite del todo; en PROD se recarga UNA sola vez por sesión
  // (guard en sessionStorage), nunca en bucle.
  const isDev =
    (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      let hadSw = false;
      for (const reg of registrations) {
        await reg.unregister();
        hadSw = true;
        console.warn('[sw] Purgado service worker antiguo detectado.');
      }

      if ('caches' in window) {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
          console.warn(`[sw] Eliminada caché persistente: ${key}`);
        }
      }

      let yaRecargo = false;
      try {
        yaRecargo = sessionStorage.getItem('sw_purge_reloaded') === '1';
      } catch {
        yaRecargo = true; // sin sessionStorage: NO recargar (evita loop)
      }
      // En DEV nunca se recarga (eso causaba el bucle). El SW viejo igual
      // quedó desregistrado y las cachés borradas arriba → navegador sano
      // sin loop. En PROD sí se recarga, pero UNA sola vez por sesión.
      if (hadSw && !isDev && !yaRecargo) {
        try {
          sessionStorage.setItem('sw_purge_reloaded', '1');
        } catch {
          /* noop */
        }
        console.warn('[sw] Recargando UNA vez tras purgar service worker.');
        window.location.reload();
      }
    } catch (err) {
      console.warn('[sw] purga falló:', err);
    }
  });
}
