import { db } from '../config/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';

// DATA SOURCE: "HABIL VERANO ENERO 2026" (From User Images)
// This file will seed the services required for the TrafficControlMatrix.

export const seedServicesPhase1 = async () => {
  console.log('🌱 Seeding Phase 1: Real Summer 2026 Services...');
  const batch = writeBatch(db);

  // Schema: service_definitions
  // Doc ID: Service Number (e.g. "1001", "300")
  // We map the lines visible in the photos.

  const services = [
    // 300 - INSTRUCCIONES / CEMENTERIO
    {
      serviceNumber: '1001',
      lineCode: '300',
      header: 'HABIL VERANO ENERO 2026',
      trips: [
        { tripId: 't1', startTime: '06:38', location: 'Instruc y Bell' },
        { tripId: 't2', startTime: '14:05', location: 'Instruc y Bell' },
        { tripId: 't3', startTime: '07:27', location: 'CEMENTERIO CENTRAL' },
        { tripId: 't4', startTime: '14:15', location: 'Cementerio Central' }, // Inferred from image 1
      ],
    },
    // 300 - SACA COCHE
    {
      serviceNumber: '1005',
      lineCode: '300',
      trips: [
        { tripId: 't1', startTime: '16:20', location: 'SACA COCHE' },
        { tripId: 't2', startTime: '23:45', location: 'INSTRUCCIONES' },
      ],
    },
    // 306 - CASABO / GEANT
    {
      serviceNumber: '1012',
      lineCode: '306',
      trips: [
        { tripId: 't1', startTime: '15:31', location: 'CASABO' }, // Image: "CASABO"
        { tripId: 't2', startTime: '08:21', location: 'Rgo. 00:51' },
        { tripId: 't3', startTime: '22:59', location: 'CASABO' },
      ],
    },
    // 370 - PORTONES / CERRO
    {
      serviceNumber: '1028',
      lineCode: '370',
      trips: [
        { tripId: 't1', startTime: '07:50', location: 'PORTONES' }, // Image shows 370
        { tripId: 't2', startTime: '14:35', location: 'PORTONES' },
      ],
    },
    // 316 - CNO MALDONADO / PUNTA CARRETAS
    {
      serviceNumber: '1058',
      lineCode: '328', // Typo in visual scraping? 1058 is listed as 328 in image.
      // Image: 1058 328 1 04:55 a 12:20 - 07:25 / 2 12:20 a 20:20 - 08:00 Rgo... PUNTA CARRETAS
      trips: [
        { tripId: 't1', startTime: '04:55', location: 'PUNTA CARRETAS' },
        { tripId: 't2', startTime: '12:20', location: 'PUNTA CARRETAS' },
      ],
    },
    // 329 - MELILLA
    {
      serviceNumber: '1048',
      lineCode: '329',
      trips: [
        { tripId: 't1', startTime: '04:10', location: 'MELILLA' },
        { tripId: 't2', startTime: '11:40', location: 'MELILLA' },
      ],
    },
  ];

  services.forEach((svc) => {
    const ref = doc(db, 'service_definitions', svc.serviceNumber);
    batch.set(ref, {
      ...svc,
      rawMatrix: svc.trips, // Simple storage for the matrix
    });
  });

  await batch.commit();
  console.log('✅ Seeded Phase 1 Services.');
  return { success: true, count: services.length };
};
