import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 🚨 CÓDIGO DE LIMPIEZA DE EMERGENCIA (CACHE BUSTER V4)
// Fuerza la eliminación de Service Workers antiguos para asegurar la carga de la versión nueva.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (registrations) {
    for (let registration of registrations) {
      console.log('🚨 UNREGISTERING SW:', registration);
      registration.unregister();
    }
  });

  // Forzar recarga si es la primera vez que limpiamos
  if (!localStorage.getItem('force_reload_v6')) {
    localStorage.setItem('force_reload_v6', 'true');
    // Clear other caches
    if ('caches' in window) {
      caches.keys().then((names) => {
        for (let name of names) caches.delete(name);
      });
    }
    console.log("🧨 CACHE NUKE ACTIVATED - RELOADING");
    window.location.reload();
  }
}

createRoot(document.getElementById('root')!).render(
  <App />
)
