export const CacheBuster = {
  nukeSystem: async () => {
    console.warn('☢️ INICIANDO PROTOCOLO DE PURGA...');

    try {
      // 1. Clear Local & Session Storage
      localStorage.clear();
      sessionStorage.clear();
      console.log('✅ Storage Limpio');

      // 2. Clear IndexedDB
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name) {
          window.indexedDB.deleteDatabase(db.name);
          console.log(`✅ IndexedDB Borrada: ${db.name}`);
        }
      }

      // 3. Unregister Service Workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          console.log('✅ Service Worker Desregistrado');
        }
      }

      // 4. Clear Cache API
      if ('caches' in window) {
        const names = await caches.keys();
        for (const name of names) {
          await caches.delete(name);
          console.log(`✅ Cache Borrada: ${name}`);
        }
      }
    } catch (e) {
      console.error('⚠️ Error parcial durante la purga:', e);
    } finally {
      console.log('🔄 Recargando Sistema...');
      // Force reload from server, ignoring cache
      window.location.reload();
    }
  },
};
