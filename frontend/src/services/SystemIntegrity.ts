import { db } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * SYSTEM INTEGRITY AGENT
 * This service connects to Firebase on startup to check for critical directives.
 * It allows the Administrator to force-fix all clients remotely without them needing to do anything.
 */

const LOCAL_VERSION_KEY = 'app_integrity_version';
const CURRENT_CLIENT_VERSION = 5; // Increment this in code when shipping breaking changes

export const SystemIntegrity = {
  /**
   * Runs immediately on App Mount / Login.
   * checks Firestore 'system/global' for 'minVersion' and 'forceCleanup'.
   */
  checkAndEnforce: async () => {
    try {
      console.log('🛡️ [SystemIntegrity] Connecting to Cloud Command...');

      // 1. Read Remote Config
      const configRef = doc(db, 'system', 'global_config');
      const snap = await getDoc(configRef);

      // If config doesn't exist, auto-create it (Self-Healing)
      if (!snap.exists()) {
        console.log('⚠️ [SystemIntegrity] No cleanup config found. Initializing...');
        await setDoc(configRef, {
          requiredVersion: 1,
          forceCleanupIteration: 0,
          maintenanceMode: false,
          message: 'System Normal',
        });
        return; // Nothing to enforce yet
      }

      const remote = snap.data();
      const localCleanupVer = parseInt(localStorage.getItem(LOCAL_VERSION_KEY) || '0');

      // 2. CHECK: Maintenance Mode
      if (remote.maintenanceMode) {
        document.body.innerHTML = `
                    <div style="height:100vh;background:#0f172a;color:white;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:sans-serif;">
                        <h1 style="font-size:3rem">🚧</h1>
                        <h2>Mantenimiento en Curso</h2>
                        <p>${remote.message || 'Mejorando el sistema. Volvemos en breve.'}</p>
                    </div>
                `;
        return;
      }

      // 3. CHECK: Critical Cleanup Command (The "Cache Killer" from Cloud)
      if (remote.forceCleanupIteration > localCleanupVer) {
        console.warn(
          `🚨 [SystemIntegrity] Cloud requested Critical Cleanup (v${remote.forceCleanupIteration}). Executing...`,
        );
        await SystemIntegrity.performDeepCleanup(remote.forceCleanupIteration);
      }

      console.log('✅ [SystemIntegrity] System Secure & Synchronized.');
    } catch (e) {
      console.warn('⚠️ [SystemIntegrity] Offline or Auth error. Skipping check.', e);
    }
  },

  /**
   * The Nuclear Option: Wipes everything to ensure fresh code load.
   */
  performDeepCleanup: async (newVersion: number) => {
    // 1. Unregister Service Workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }

    // 2. Clear Caches
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    // 3. Clear Storage (Except vital flags if needed, but here we wipe all)
    localStorage.clear();
    sessionStorage.clear();

    // 4. Mark verify (so we don't loop forever)
    localStorage.setItem(LOCAL_VERSION_KEY, String(newVersion));

    // 5. Hard Reload
    alert('♻️ Actualización Crítica Aplicada. El sistema se reiniciará.');
    window.location.reload();
  },
};
