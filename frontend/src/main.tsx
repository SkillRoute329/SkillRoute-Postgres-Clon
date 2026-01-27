import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 🚨 CÓDIGO DE LIMPIEZA DE EMERGENCIA (CACHE BUSTER V4)
// Fuerza la eliminación de Service Workers antiguos para asegurar la carga de la versión nueva.
// 🚨 CÓDIGO DE LIMPIEZA DE EMERGENCIA (CACHE BUSTER V5 - FINAL)
// Fuerza la eliminación de Service Workers antiguos y limpia almacenamiento UNA SOLA VEZ.
const SAFE_KEY = 'v1_stable_flag';

try {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      for (let registration of registrations) {
        // Unregister silently
        registration.unregister().catch(() => { });
      }
    });

    const isFirebase = window.location.hostname.includes('firebase') || window.location.hostname.includes('web.app');
    const hasCleaned = sessionStorage.getItem(SAFE_KEY);

    if (isFirebase && !hasCleaned) {
      console.log('🧹 [System] Performing One-Time Startup Cleanup...');

      // 1. Wipe
      localStorage.clear();
      sessionStorage.clear();

      // 2. Set Flag (Re-set after clear)
      sessionStorage.setItem(SAFE_KEY, 'true');

      // 3. Clear Caches
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (let name of names) caches.delete(name);
        });
      }

      // 4. Reload (Only once per tab session)
      console.log('🔄 [System] Reloading to apply clean state...');
      window.location.reload();
    } else {
      console.log('✅ [System] Startup Stable. Storage Verified.');
    }
  }
} catch (e) {
  console.warn('⚠️ [System] Auto-Cleanup Skipped due to error:', e);
}

createRoot(document.getElementById('root')!).render(
  <App />
)
