import { apiClient } from '../clients/apiClient';
import { seedServicesPhase1 } from '../data/seed_phase_1';
import { getToken } from '../utils/tokenStore';

/** Obtiene el uid del usuario actual desde el JWT almacenado en localStorage. */
function getCurrentUid(): string | null {
  try {
    const token = getToken() ?? '';
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload));
    return decoded.uid ?? decoded.sub ?? null;
  } catch {
    return null;
  }
}

const GENESIS_CONFIG = {
  collections: [
    'system_settings',
    'vehicle_types',
    'incident_types',
    'maintenance_categories',
    // Transport Layer (New)
    'schedule_matrices',
    'service_definitions',
    'daily_shifts',
  ],
  defaults: {
    system_settings: {
      _config: {
        appName: 'SkillRoute 2.0',
        version: '2.0.0',
        maintenanceMode: false,
        initializedAt: new Date().toISOString(),
      },
    },
    vehicle_types: {
      omnibus: { name: 'Ómnibus', active: true },
      micro: { name: 'Micro', active: true },
      camioneta: { name: 'Camioneta', active: true },
    },
    incident_types: {
      mecanica: { name: 'Falla Mecánica', severity: 'HIGH' },
      evasion: { name: 'Evasión de Peaje/Control', severity: 'MEDIUM' },
      accidente: { name: 'Accidente de Tránsito', severity: 'CRITICAL' },
      limpieza: { name: 'Falta de Limpieza', severity: 'LOW' },
    },
    maintenance_categories: {
      motor: { name: 'Motor y Transmisión' },
      frenos: { name: 'Sistema de Frenos' },
      electrico: { name: 'Electricidad e Iluminación' },
      carroceria: { name: 'Carrocería y Chasis' },
    },
  },
};

export const DatabaseBootstrapper = {
  /**
   * GÉNESIS PROTOCOL
   * Ensures all collections exist and types are standardized.
   */
  runGenesis: async () => {
    const logs: string[] = [];
    const log = (m: string) => {
      console.log(`[GENESIS] ${m}`);
      logs.push(m);
    };

    try {
      if (!getCurrentUid()) {
        log('GENESIS ABORTED: User not authenticated. System initialization paused.');
        return { success: false, logs, error: 'Auth Required' };
      }

      log('INITIATING GENESIS PROTOCOL...');

      // 1. MAESTRAS: Create/Verify Collections
      for (const colName of GENESIS_CONFIG.collections) {
        const snapshot = await apiClient.get(`/api/db/${colName}`, { query: { limit: 1 } }) as any[];
        const isEmpty = !Array.isArray(snapshot) || snapshot.length === 0;

        if (isEmpty) {
          log(`Collection '${colName}' is EMPTY. Seeding defaults...`);

          const defaults = (GENESIS_CONFIG.defaults as any)[colName];
          if (defaults) {
            for (const [key, val] of Object.entries(defaults)) {
              await apiClient.put(`/api/db/${colName}/` + encodeURIComponent(key), val as any);
              log(`   + Created default: ${colName}/${key}`);
            }
          } else {
            await apiClient.put(`/api/db/${colName}/_init`, {
              _genesis: true,
              createdAt: new Date().toISOString(),
            });
            log(`   + Created placeholder: ${colName}/_init`);
          }
        } else {
          log(`Collection '${colName}' ONLINE`);
        }
      }

      // 2. INDEX CHECK (simplified — REST backend handles indexing)
      log('VERIFYING BACKEND CONNECTIVITY...');
      const checks = [
        { col: 'incidencias', desc: 'Incidents' },
        { col: 'daily_shifts', desc: 'Traffic Date Sort' },
        { col: 'alertas_trafico', desc: 'Alerts' },
      ];

      for (const check of checks) {
        try {
          await apiClient.get(`/api/db/${check.col}`, { query: { limit: 1 } });
          log(`Index OK: ${check.col}`);
        } catch (e: any) {
          log(`Index Check Warning ${check.col}: ${e.message}`);
        }
      }

      // 3. PHASE 1 SEEDING
      log('RUNNING PHASE 1 SEEDER (Real Summer 2026 Data)...');
      try {
        const seedResult = await seedServicesPhase1();
        log(
          `Phase 1 Seed Complete: ${seedResult.count} services generated based on uploaded 'Sábana'.`,
        );
      } catch (seedErr: any) {
        log(`Phase 1 Seed Warning: ${seedErr.message}`);
      }

      return { success: true, logs };
    } catch (e: any) {
      log(`GENESIS FAILED: ${e.message}`);
      return { success: false, logs, error: e.message };
    }
  },
};
