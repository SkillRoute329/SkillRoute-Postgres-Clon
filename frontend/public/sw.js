/*
 * SERVICE WORKER AUTO-DESTRUCTIVO (FASE 5.26 — 2026-05-19)
 *
 * Problema que resuelve, de forma AUTOMÁTICA (sin incógnito ni limpiar a
 * mano): un service worker viejo quedó controlando el navegador y servía el
 * bundle anterior (con un reload sin tope) → la página se recargaba
 * infinitamente. Editar el código fuente no alcanzaba porque el SW viejo
 * interceptaba y entregaba lo cacheado.
 *
 * Cómo se cura solo: el navegador, en CADA navegación (incluida cada
 * recarga del propio loop), chequea si /sw.js cambió. Al ser este archivo
 * byte-distinto, dispara una actualización del SW. Este SW, al activarse:
 *   1. Borra TODAS las cachés.
 *   2. Se desregistra (registration.unregister()).
 *   3. Navega (recarga) cada ventana controlada UNA vez. Esa recarga ya
 *      NO está controlada por ningún SW (se desregistró), así que toma el
 *      código fresco de red y NO se repite → loop cortado.
 * Mientras siga activo (sólo hasta esa recarga), el handler de fetch va
 * SIEMPRE a red: nunca entrega el bundle viejo cacheado.
 *
 * Nada vuelve a registrar un SW (swRegistration sólo purga; en dev no hay
 * PWA). Por lo tanto esto ejecuta una sola vez y deja el navegador limpio.
 */

self.addEventListener('install', () => {
  // Tomar control de inmediato, sin esperar a que se cierren pestañas.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1. Borrar todas las cachés (incluido cualquier precache viejo).
      try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      } catch (e) {
        /* noop */
      }
      // 2. Desregistrar este SW: la próxima navegación NO estará controlada.
      try {
        await self.registration.unregister();
      } catch (e) {
        /* noop */
      }
      // 3. Forzar UNA recarga de cada ventana. Tras el unregister, esa
      //    carga ya es sin SW → código fresco → no vuelve a recargar.
      try {
        const clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        for (const client of clients) {
          if ('navigate' in client) {
            client.navigate(client.url).catch(() => {});
          }
        }
      } catch (e) {
        /* noop */
      }
    })(),
  );
});

// Mientras este SW siga activo (sólo hasta que las ventanas recarguen),
// nunca servir desde caché: SIEMPRE red, para no entregar el bundle viejo.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(
      () => new Response('', { status: 504, statusText: 'sw-self-destruct' }),
    ),
  );
});
