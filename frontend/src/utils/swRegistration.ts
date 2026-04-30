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

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      // Chequeo periódico por nueva versión del SW.
      window.setInterval(() => {
        reg.update().catch(() => {});
      }, 60_000);

      // Deshabilitado: el controllerchange forzaba reload en cada deploy.
      // Reactivar para producción normal descomentando el bloque de abajo.
      // let refreshing = false;
      // navigator.serviceWorker.addEventListener('controllerchange', () => {
      //   if (refreshing) return;
      //   refreshing = true;
      //   window.location.reload();
      // });

      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'activated') {
            console.info('[sw] Nueva versión activada.');
          }
        });
      });
    } catch (err) {
      console.warn('[sw] registro falló:', err);
    }
  });
}
