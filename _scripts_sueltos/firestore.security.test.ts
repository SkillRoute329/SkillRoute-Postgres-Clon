/**
 * Firestore Security Tests
 * Testing RBAC implementation for P0-1: Firestore Security hardening
 *
 * Tests verify:
 * - 6 collections no longer have "allow true"
 * - Role-based access control working correctly
 * - Anonymous/unauthenticated users cannot access
 * - Each role has appropriate read/write permissions
 *
 * @date 2026-04-09
 * @author Claude (Agentes)
 * @severity P0-1
 */

import { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as firebase from '@firebase/rules-unit-testing';

describe('Firestore Security Rules - RBAC Implementation', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await firebase.initializeTestEnvironment({
      projectId: 'gestionucot-test',
      firestore: {
        rules: require('fs').readFileSync('firestore.rules', 'utf8'),
        host: 'localhost',
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  // Helper to get authenticated Firestore instance
  function getAuthDb(uid: string, role: string) {
    return testEnv.authenticatedContext(uid, {
      uid,
      email: `${uid}@ucot.uy`,
      role,
    }).firestore();
  }

  // Helper to get unauthenticated Firestore instance
  function getUnauthDb() {
    return testEnv.unauthenticatedContext().firestore();
  }

  describe('Collection: alertas_regulacion', () => {
    const collectionPath = 'alertas_regulacion';
    const docPath = 'test_alert_001';

    test('❌ Anonymous CANNOT read alertas_regulacion', async () => {
      const unauth = getUnauthDb();
      await firebase.assertFails(
        unauth.collection(collectionPath).doc(docPath).get()
      );
    });

    test('❌ Anonymous CANNOT write to alertas_regulacion', async () => {
      const unauth = getUnauthDb();
      await firebase.assertFails(
        unauth.collection(collectionPath).doc(docPath).set({ alert: 'test' })
      );
    });

    test('✅ Admin CAN read alertas_regulacion', async () => {
      const admin = getAuthDb('admin-user-001', 'admin');
      await firebase.assertSucceeds(
        admin.collection(collectionPath).doc(docPath).get()
      );
    });

    test('✅ Admin CAN write to alertas_regulacion', async () => {
      const admin = getAuthDb('admin-user-001', 'admin');
      await firebase.assertSucceeds(
        admin.collection(collectionPath).doc(docPath).set({
          timestamp: new Date(),
          type: 'motor_regulation',
          severity: 'high',
        })
      );
    });

    test('✅ Inspector CAN read alertas_regulacion', async () => {
      const inspector = getAuthDb('inspector-001', 'inspector');
      await firebase.assertSucceeds(
        inspector.collection(collectionPath).doc(docPath).get()
      );
    });

    test('✅ Inspector CAN write to alertas_regulacion', async () => {
      const inspector = getAuthDb('inspector-001', 'inspector');
      await firebase.assertSucceeds(
        inspector.collection(collectionPath).doc(docPath).set({
          timestamp: new Date(),
          inspector_id: 'inspector-001',
        })
      );
    });

    test('✅ Medical/Doctor CAN read alertas_regulacion', async () => {
      const medical = getAuthDb('medico-001', 'medico');
      await firebase.assertSucceeds(
        medical.collection(collectionPath).doc(docPath).get()
      );
    });

    test('❌ Medical/Doctor CANNOT write to alertas_regulacion', async () => {
      const medical = getAuthDb('medico-001', 'medico');
      await firebase.assertFails(
        medical.collection(collectionPath).doc(docPath).set({
          timestamp: new Date(),
        })
      );
    });

    test('✅ Traffic Manager CAN read alertas_regulacion', async () => {
      const tm = getAuthDb('traffic-mgr-001', 'traffic_manager');
      await firebase.assertSucceeds(
        tm.collection(collectionPath).doc(docPath).get()
      );
    });

    test('❌ Traffic Manager CANNOT write to alertas_regulacion', async () => {
      const tm = getAuthDb('traffic-mgr-001', 'traffic_manager');
      await firebase.assertFails(
        tm.collection(collectionPath).doc(docPath).set({
          timestamp: new Date(),
        })
      );
    });
  });

  describe('Collection: scrapping_logs', () => {
    const collectionPath = 'scrapping_logs';
    const docPath = 'stm_sync_001';

    test('❌ Anonymous CANNOT read scrapping_logs', async () => {
      const unauth = getUnauthDb();
      await firebase.assertFails(
        unauth.collection(collectionPath).doc(docPath).get()
      );
    });

    test('❌ Anonymous CANNOT write to scrapping_logs', async () => {
      const unauth = getUnauthDb();
      await firebase.assertFails(
        unauth.collection(collectionPath).doc(docPath).set({
          status: 'success',
        })
      );
    });

    test('✅ Only Admin CAN read scrapping_logs', async () => {
      const admin = getAuthDb('admin-001', 'admin');
      await firebase.assertSucceeds(
        admin.collection(collectionPath).doc(docPath).get()
      );
    });

    test('✅ Only Admin CAN write to scrapping_logs', async () => {
      const admin = getAuthDb('admin-001', 'admin');
      await firebase.assertSucceeds(
        admin.collection(collectionPath).doc(docPath).set({
          timestamp: new Date(),
          status: 'completed',
          records_processed: 1250,
        })
      );
    });

    test('❌ Analyst CANNOT read scrapping_logs', async () => {
      const analyst = getAuthDb('analyst-001', 'analyst');
      await firebase.assertFails(
        analyst.collection(collectionPath).doc(docPath).get()
      );
    });

    test('❌ Driver CANNOT read scrapping_logs', async () => {
      const driver = getAuthDb('driver-001', 'driver');
      await firebase.assertFails(
        driver.collection(collectionPath).doc(docPath).get()
      );
    });
  });

  describe('Collection: system', () => {
    const collectionPath = 'system';
    const docPath = 'config';

    test('❌ Anonymous CANNOT read system config', async () => {
      const unauth = getUnauthDb();
      await firebase.assertFails(
        unauth.collection(collectionPath).doc(docPath).get()
      );
    });

    test('❌ Anonymous CANNOT write to system config', async () => {
      const unauth = getUnauthDb();
      await firebase.assertFails(
        unauth.collection(collectionPath).doc(docPath).set({
          setting: 'value',
        })
      );
    });

    test('✅ Admin CAN read system config', async () => {
      const admin = getAuthDb('admin-001', 'admin');
      await firebase.assertSucceeds(
        admin.collection(collectionPath).doc(docPath).get()
      );
    });

    test('✅ Admin CAN write to system config', async () => {
      const admin = getAuthDb('admin-001', 'admin');
      await firebase.assertSucceeds(
        admin.collection(collectionPath).doc(docPath).set({
          api_sync_interval: 300,
          max_concurrent_jobs: 10,
          alert_threshold: 0.85,
        })
      );
    });

    test('❌ CEO CANNOT write to system config', async () => {
      const ceo = getAuthDb('ceo-001', 'ceo');
      await firebase.assertFails(
        ceo.collection(collectionPath).doc(docPath).set({
          setting: 'value',
        })
      );
    });
  });

  describe('Collection: alertas_trafico', () => {
    const collectionPath = 'alertas_trafico';
    const docPath = 'traffic_alert_001';

    test('❌ Anonymous CANNOT read alertas_trafico', async () => {
      const unauth = getUnauthDb();
      await firebase.assertFails(
        unauth.collection(collectionPath).doc(docPath).get()
      );
    });

    test('❌ Anonymous CANNOT write to alertas_trafico', async () => {
      const unauth = getUnauthDb();
      await firebase.assertFails(
        unauth.collection(collectionPath).doc(docPath).set({
          message: 'congestion',
        })
      );
    });

    test('✅ Authenticated user CAN read alertas_trafico', async () => {
      const driver = getAuthDb('driver-001', 'driver');
      await firebase.assertSucceeds(
        driver.collection(collectionPath).doc(docPath).get()
      );
    });

    test('❌ Driver CANNOT write to alertas_trafico', async () => {
      const driver = getAuthDb('driver-001', 'driver');
      await firebase.assertFails(
        driver.collection(collectionPath).doc(docPath).set({
          message: 'congestion detected',
        })
      );
    });

    test('✅ Traffic Manager CAN write to alertas_trafico', async () => {
      const tm = getAuthDb('traffic-mgr-001', 'traffic_manager');
      await firebase.assertSucceeds(
        tm.collection(collectionPath).doc(docPath).set({
          timestamp: new Date(),
          location: 'Av 18 de Julio',
          severity: 'medium',
          description: 'Roadwork on main avenue',
        })
      );
    });

    test('✅ Admin CAN write to alertas_trafico', async () => {
      const admin = getAuthDb('admin-001', 'admin');
      await firebase.assertSucceeds(
        admin.collection(collectionPath).doc(docPath).set({
          timestamp: new Date(),
          location: 'Centro',
          severity: 'high',
        })
      );
    });

    test('❌ Analyst CANNOT write to alertas_trafico', async () => {
      const analyst = getAuthDb('analyst-001', 'analyst');
      await firebase.assertFails(
        analyst.collection(collectionPath).doc(docPath).set({
          message: 'test',
        })
      );
    });
  });

  describe('Collection: viajes_activos', () => {
    const collectionPath = 'viajes_activos';
    const docPath = 'trip_12345';

    test('❌ Anonymous CANNOT read viajes_activos', async () => {
      const unauth = getUnauthDb();
      await firebase.assertFails(
        unauth.collection(collectionPath).doc(docPath).get()
      );
    });

    test('❌ Anonymous CANNOT write to viajes_activos', async () => {
      const unauth = getUnauthDb();
      await firebase.assertFails(
        unauth.collection(collectionPath).doc(docPath).set({
          status: 'active',
        })
      );
    });

    test('✅ Authenticated user CAN read viajes_activos', async () => {
      const driver = getAuthDb('driver-001', 'driver');
      await firebase.assertSucceeds(
        driver.collection(collectionPath).doc(docPath).get()
      );
    });

    test('✅ Driver CAN write their own trips', async () => {
      const driver = getAuthDb('driver-001', 'driver');
      await firebase.assertSucceeds(
        driver.collection(collectionPath).doc(docPath).set({
          driver_id: 'driver-001',
          timestamp: new Date(),
          latitude: -34.9011,
          longitude: -56.1645,
          status: 'in_transit',
        })
      );
    });

    test('✅ Admin CAN write any trip', async () => {
      const admin = getAuthDb('admin-001', 'admin');
      await firebase.assertSucceeds(
        admin.collection(collectionPath).doc(docPath).set({
          driver_id: 'driver-002',
          timestamp: new Date(),
          latitude: -34.9011,
          longitude: -56.1645,
          status: 'completed',
        })
      );
    });

    test('❌ Analyst CANNOT write to viajes_activos', async () => {
      const analyst = getAuthDb('analyst-001', 'analyst');
      await firebase.assertFails(
        analyst.collection(collectionPath).doc(docPath).set({
          status: 'active',
        })
      );
    });
  });

  describe('Collection: competencia_monitoreo', () => {
    const collectionPath = 'competencia_monitoreo';
    const docPath = 'competitor_ping_001';

    test('❌ Anonymous CANNOT read competencia_monitoreo', async () => {
      const unauth = getUnauthDb();
      await firebase.assertFails(
        unauth.collection(collectionPath).doc(docPath).get()
      );
    });

    test('❌ Anonymous CANNOT write to competencia_monitoreo', async () => {
      const unauth = getUnauthDb();
      await firebase.assertFails(
        unauth.collection(collectionPath).doc(docPath).set({
          competitor: 'STM',
        })
      );
    });

    test('✅ Analyst CAN read competencia_monitoreo', async () => {
      const analyst = getAuthDb('analyst-001', 'analyst');
      await firebase.assertSucceeds(
        analyst.collection(collectionPath).doc(docPath).get()
      );
    });

    test('❌ Analyst CANNOT write to competencia_monitoreo', async () => {
      const analyst = getAuthDb('analyst-001', 'analyst');
      await firebase.assertFails(
        analyst.collection(collectionPath).doc(docPath).set({
          competitor: 'STM',
        })
      );
    });

    test('✅ CEO CAN read competencia_monitoreo', async () => {
      const ceo = getAuthDb('ceo-001', 'ceo');
      await firebase.assertSucceeds(
        ceo.collection(collectionPath).doc(docPath).get()
      );
    });

    test('❌ CEO CANNOT write to competencia_monitoreo', async () => {
      const ceo = getAuthDb('ceo-001', 'ceo');
      await firebase.assertFails(
        ceo.collection(collectionPath).doc(docPath).set({
          competitor: 'STM',
        })
      );
    });

    test('✅ Admin CAN read competencia_monitoreo', async () => {
      const admin = getAuthDb('admin-001', 'admin');
      await firebase.assertSucceeds(
        admin.collection(collectionPath).doc(docPath).get()
      );
    });

    test('✅ Admin CAN write to competencia_monitoreo', async () => {
      const admin = getAuthDb('admin-001', 'admin');
      await firebase.assertSucceeds(
        admin.collection(collectionPath).doc(docPath).set({
          timestamp: new Date(),
          competitor: 'STM',
          linea: 300,
          status: 'active',
          vehicle_count: 15,
        })
      );
    });

    test('❌ Driver CANNOT read competencia_monitoreo', async () => {
      const driver = getAuthDb('driver-001', 'driver');
      await firebase.assertFails(
        driver.collection(collectionPath).doc(docPath).get()
      );
    });
  });

  describe('Collection: shadow_tracker (Partially restrictive read)', () => {
    const collectionPath = 'shadow_tracker';
    const docPath = 'shadow_001';

    test('❌ Anonymous CANNOT read shadow_tracker', async () => {
      const unauth = getUnauthDb();
      await firebase.assertFails(
        unauth.collection(collectionPath).doc(docPath).get()
      );
    });

    test('✅ Authenticated user CAN read shadow_tracker', async () => {
      const driver = getAuthDb('driver-001', 'driver');
      await firebase.assertSucceeds(
        driver.collection(collectionPath).doc(docPath).get()
      );
    });

    test('✅ Driver CAN write their own shadow_tracker data', async () => {
      const driver = getAuthDb('driver-001', 'driver');
      await firebase.assertSucceeds(
        driver.collection(collectionPath).doc(docPath).set({
          driver_id: 'driver-001',
          timestamp: new Date(),
          latitude: -34.9011,
          longitude: -56.1645,
        })
      );
    });

    test('✅ Admin CAN write any shadow_tracker data', async () => {
      const admin = getAuthDb('admin-001', 'admin');
      await firebase.assertSucceeds(
        admin.collection(collectionPath).doc(docPath).set({
          driver_id: 'driver-002',
          timestamp: new Date(),
          latitude: -34.9011,
          longitude: -56.1645,
        })
      );
    });
  });

  describe('Collection: cartones_de_servicio (Partially restrictive read)', () => {
    const collectionPath = 'cartones_de_servicio';
    const docPath = 'carton_2026_04_09';

    test('❌ Anonymous CANNOT read cartones_de_servicio', async () => {
      const unauth = getUnauthDb();
      await firebase.assertFails(
        unauth.collection(collectionPath).doc(docPath).get()
      );
    });

    test('✅ Authenticated user CAN read cartones_de_servicio', async () => {
      const driver = getAuthDb('driver-001', 'driver');
      await firebase.assertSucceeds(
        driver.collection(collectionPath).doc(docPath).get()
      );
    });

    test('❌ Driver CANNOT write to cartones_de_servicio', async () => {
      const driver = getAuthDb('driver-001', 'driver');
      await firebase.assertFails(
        driver.collection(collectionPath).doc(docPath).set({
          schedule: 'test',
        })
      );
    });

    test('✅ Traffic Manager CAN write to cartones_de_servicio', async () => {
      const tm = getAuthDb('traffic-mgr-001', 'traffic_manager');
      await firebase.assertSucceeds(
        tm.collection(collectionPath).doc(docPath).set({
          date: new Date(),
          linea: 300,
          cartons: [{ driver: 'driver-001', hours: '6am-2pm' }],
        })
      );
    });

    test('✅ Admin CAN write to cartones_de_servicio', async () => {
      const admin = getAuthDb('admin-001', 'admin');
      await firebase.assertSucceeds(
        admin.collection(collectionPath).doc(docPath).set({
          date: new Date(),
          linea: 306,
          cartons: [{ driver: 'driver-002', hours: '2pm-10pm' }],
        })
      );
    });
  });

  describe('Default Rules', () => {
    test('✅ Authenticated user CAN read any doc without explicit rule', async () => {
      const driver = getAuthDb('driver-001', 'driver');
      // This should succeed due to default read rule
      await firebase.assertSucceeds(
        driver.collection('arbitrary_collection').doc('test').get()
      );
    });

    test('❌ Authenticated user CANNOT write to docs without explicit rule', async () => {
      const driver = getAuthDb('driver-001', 'driver');
      // This should fail due to default write: false
      await firebase.assertFails(
        driver.collection('arbitrary_collection').doc('test').set({
          data: 'test',
        })
      );
    });
  });
});
