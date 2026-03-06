import { useState, useEffect } from 'react';

// Debug tool to force update UI
const triggerUpdateSimulation = () => {
  localStorage.setItem('app_version', '0.0.0-OLD');
  window.location.reload();
};
// Attach to window for easier debugging
(window as any).triggerUpdate = triggerUpdateSimulation;

export const useVersionCheck = () => {
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        // Agregar timestamp para evitar caché del navegador (especialmente en Brave/Safari)
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;

        const data = await res.json();
        const serverVersion = data.version;
        const localVersion = localStorage.getItem('app_version');

        // Si es la primera vez (no hay localVersion), guardamos y no hacemos nada
        if (!localVersion) {
          localStorage.setItem('app_version', serverVersion);
          return;
        }

        // Si las versiones difieren, forzamos actualización
        if (serverVersion !== localVersion) {
          console.log(`🚀 New Version Detected: ${serverVersion} (Local: ${localVersion})`);

          // 🎮 SIMULATION BYPASS: In Sim mode, just show UI but don't wipe data aggressively
          const isSim = sessionStorage.getItem('TRANSFORMA_SIMULATION_MODE') === 'true';

          setIsUpdating(true);

          // 1. Limpiar Service Workers antiguos
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
              await registration.unregister();
            }
          }

          // 2. Limpiar Caché de la Aplicación
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
          }

          // 3. Actualizar Referencia
          localStorage.setItem('app_version', serverVersion);

          // 4. Recargar Página (dar tiempo a la animación de VersionGuard)
          setTimeout(() => {
            window.location.reload();
          }, 3500);
        }
      } catch (error) {
        console.error('Version check failed:', error);
      }
    };

    // Chequear al inicio y cada 60 segundos
    checkVersion();
    const interval = setInterval(checkVersion, 60000);
    return () => clearInterval(interval);
  }, []);

  return { isUpdating };
};
