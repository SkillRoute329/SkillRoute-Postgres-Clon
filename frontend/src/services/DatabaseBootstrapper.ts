import {
  collection,
  getDocs,
  doc,
  setDoc,
  query,
  orderBy,
  limit,
  addDoc,
  getDoc,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { seedServicesPhase1 } from '../data/seed_phase_1';

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
        appName: 'TransformaFacil 2.0',
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
      if (!auth.currentUser) {
        log('⛔ GENESIS ABORTED: User not authenticated. System initialization paused.');
        return { success: false, logs, error: 'Auth Required' };
      }

      log('🚀 INITIATING GENESIS PROTOCOL...');

      // 1. MAESTRAS: Create/Verify Collections
      for (const colName of GENESIS_CONFIG.collections) {
        const colRef = collection(db, colName);
        const snapshot = await getDocs(query(colRef, limit(1)));

        if (snapshot.empty) {
          log(`⚠️ Collection '${colName}' is EMPTY. Seeding defaults...`);

          // Check if we have defaults
          const defaults = (GENESIS_CONFIG.defaults as any)[colName];
          if (defaults) {
            for (const [key, val] of Object.entries(defaults)) {
              // If key starts with _, use it as ID, else auto-ID?
              // Actually defaults uses keys as IDs here for simplicity
              await setDoc(doc(db, colName, key), val as any);
              log(`   + Created default: ${colName}/${key}`);
            }
          } else {
            // Create a placeholder config doc to "wake up" the collection
            await setDoc(doc(db, colName, '_init'), {
              _genesis: true,
              createdAt: new Date().toISOString(),
            });
            log(`   + Created placeholder: ${colName}/_init`);
          }
        } else {
          log(`✅ Collection '${colName}' ONLINE (${snapshot.size}+ docs)`);
        }
      }

      // 2. INDEX CHECK (The "Trap")
      // We verify problematic queries to trigger the Link generation in Console
      log('🔍 VERIFYING INDEXES...');

      const checks = [
        { col: 'incidencias', orderBy: 'timestamp', desc: 'Incidents Time Sort' },
        { col: 'daily_shifts', orderBy: 'date', desc: 'Traffic Date Sort' },
        { col: 'alertas_trafico', orderBy: 'creado_en', desc: 'Alerts Sort' },
      ];

      for (const check of checks) {
        try {
          const q = query(collection(db, check.col), orderBy(check.orderBy, 'desc'), limit(1));
          await getDocs(q);
          log(`✅ Index OK: ${check.col} (${check.orderBy})`);
        } catch (e: any) {
          if (e.message.includes('requires an index')) {
            log(`❌ MISSING INDEX: ${check.col}`);
            log(`👉 CLICK TO FIX: ${e.message.match(/https:\/\/\S+/)?.[0] || 'See Console'}`);
          } else {
            log(`⚠️ Index Check Warning ${check.col}: ${e.message}`);
          }
        }
      }

      // 3. PHASE 1 SEEDING (Real Data from User Images)
      log('🌱 RUNNING PHASE 1 SEEDER (Real Summer 2026 Data)...');
      try {
        const seedResult = await seedServicesPhase1();
        log(
          `✅ Phase 1 Seed Complete: ${seedResult.count} services generated based on uploaded 'Sábana'.`,
        );
      } catch (seedErr: any) {
        log(`⚠️ Phase 1 Seed Warning: ${seedErr.message}`);
      }

      return { success: true, logs };
    } catch (e: any) {
      log(`🔥 GENESIS FAILED: ${e.message}`);
      return { success: false, logs, error: e.message };
    }
  },
};
