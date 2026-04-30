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

        // Si las versiones difieren, notificar pero NO recargar (modo demo activo)
        if (serverVersion !== localVersion) {
          console.log(`[version] Nueva versión disponible: ${serverVersion} — recarga automática en pausa. Recargá manualmente para actualizar.`);
          localStorage.setItem('app_version', serverVersion);
          // Reactivar para producción normal: window.location.reload();
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
