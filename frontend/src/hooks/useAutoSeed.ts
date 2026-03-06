/**
 * useAutoSeed.ts
 * Auto-Habilitación: detecta si la colección 'fleet_vehicles' está vacía en Firestore
 * y automáticamente inyecta los datos maestros (137 coches, 163 servicios, rutas).
 * Se ejecuta una sola vez al cargar la app. Usa sessionStorage para no repetir.
 */
import { useEffect, useRef } from 'react';
import { collection, getDocs, doc, setDoc, query, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { LINE_ARCHETYPES, line300Data, line300ReverseData } from '../data/lineTemplates';

const SEED_SESSION_KEY = 'ucot_auto_seed_done';

export const useAutoSeed = () => {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    if (sessionStorage.getItem(SEED_SESSION_KEY)) return;
    hasRun.current = true;

    (async () => {
      try {
        // Check if fleet_vehicles collection has data
        const snapshot = await getDocs(query(collection(db, 'fleet_vehicles'), limit(1)));
        if (!snapshot.empty) {
          // Data exists, skip seed
          sessionStorage.setItem(SEED_SESSION_KEY, 'exists');
          console.log('[AutoSeed] Flota detectada, saltando seed automático.');
          return;
        }

        console.log('[AutoSeed] ⚡ Colección vacía detectada. Iniciando seed automático...');

        // === SEED 137 VEHICLES ===
        const types = ['CONVENCIONAL', 'PISO_BAJO', 'HIBRIDO', 'ELECTRICO'];
        const vehiclePromises = [];
        for (let i = 1; i <= 137; i++) {
          const typeIdx = i <= 80 ? 0 : i <= 110 ? 1 : i <= 130 ? 2 : 3;
          vehiclePromises.push(
            setDoc(
              doc(db, 'fleet_vehicles', `vehicle_${String(i).padStart(3, '0')}`),
              {
                carNumber: String(i).padStart(3, '0'),
                plate: `UCO ${String(1000 + i)}`,
                type: types[typeIdx],
                brand: typeIdx >= 2 ? 'BYD' : i % 2 === 0 ? 'Mercedes-Benz' : 'Marcopolo',
                model: typeIdx >= 2 ? 'K9' : i % 2 === 0 ? 'OF-1722' : 'Gran Viale',
                year: typeIdx >= 2 ? 2024 : 2015 + (i % 8),
                capacity: typeIdx === 3 ? 80 : typeIdx === 1 ? 90 : 85,
                status: i <= 130 ? 'OPERATIVO' : i <= 135 ? 'EN_TALLER' : 'PARALIZADO',
                features: {
                  airConditioning: typeIdx >= 1,
                  wheelchair: typeIdx >= 1,
                  usb: typeIdx >= 2,
                  wifi: typeIdx >= 3,
                },
                lastInspection: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split('T')[0],
                kmTotal: Math.floor(50000 + Math.random() * 400000),
                createdAt: new Date().toISOString(),
                source: 'auto_seed',
              },
              { merge: true },
            ),
          );
        }
        // Batch in groups of 20 for performance
        for (let batch = 0; batch < vehiclePromises.length; batch += 20) {
          await Promise.all(vehiclePromises.slice(batch, batch + 20));
        }
        console.log('[AutoSeed] ✅ 137 vehículos inyectados.');

        // === SEED SERVICES (163) ===
        const lines = Object.keys(LINE_ARCHETYPES);
        let serviceCounter = 1000;
        const servicePromises = [];
        lines.forEach((lineKey) => {
          const archetype = LINE_ARCHETYPES[lineKey];
          const servicesPerLine =
            lineKey === '300' ? 30 : lineKey === '306' ? 25 : lineKey === '370' ? 25 : 20;
          for (let i = 0; i < servicesPerLine; i++) {
            const startHour = 4 + Math.floor((i * 18) / servicesPerLine);
            const startMin = Math.floor(Math.random() * 60);
            const svcId = `svc_${serviceCounter}`;
            servicePromises.push(
              setDoc(
                doc(db, 'service_definitions', svcId),
                {
                  id: svcId,
                  serviceNumber: String(serviceCounter),
                  line: lineKey,
                  variant: i % 2 === 0 ? 'IDA' : 'VUELTA',
                  startTime: `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`,
                  endTime: `${String(startHour + 1 + Math.floor(archetype.cycleTime / 60)).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`,
                  headers: archetype.headers.map((loc: string, idx: number) => ({
                    id: `h${idx}`,
                    location: loc,
                    isStop: true,
                  })),
                  status: 'ACTIVO',
                  dayType: 'HABIL',
                  season: 'VERANO_2026',
                  createdAt: new Date().toISOString(),
                  source: 'auto_seed',
                },
                { merge: true },
              ),
            );
            serviceCounter++;
          }
        });
        for (let batch = 0; batch < servicePromises.length; batch += 20) {
          await Promise.all(servicePromises.slice(batch, batch + 20));
        }
        console.log('[AutoSeed] ✅ Servicios inyectados.');

        // === SEED REFERENCE CARTONES ===
        await setDoc(
          doc(db, 'cartones_completados', 'ref_300_ida'),
          {
            linea: '300',
            servicio: 'REFERENCIA-IDA',
            paradas: line300Data.headers.map((h) => h.location),
            viajes: line300Data.rows.map((r, i) => ({
              fila: i + 1,
              tiempos: line300Data.headers.map((h) => r.times[h.id] || ''),
            })),
            notasCabecera: ['GENERADO POR AUTO-SEED'],
            notasPie: [],
            sheetName: 'REF_300_IDA',
            createdAt: new Date().toISOString(),
            source: 'auto_seed',
          },
          { merge: true },
        );

        await setDoc(
          doc(db, 'cartones_completados', 'ref_300_vuelta'),
          {
            linea: '300',
            servicio: 'REFERENCIA-VUELTA',
            paradas: line300ReverseData.headers.map((h) => h.location),
            viajes: line300ReverseData.rows.map((r, i) => ({
              fila: i + 1,
              tiempos: line300ReverseData.headers.map((h) => r.times[h.id] || ''),
            })),
            notasCabecera: ['GENERADO POR AUTO-SEED'],
            notasPie: [],
            sheetName: 'REF_300_VUELTA',
            createdAt: new Date().toISOString(),
            source: 'auto_seed',
          },
          { merge: true },
        );
        console.log('[AutoSeed] ✅ Cartones de referencia inyectados.');

        // === SEED NAVIGATION ROUTES ===
        const routePromises = lines.map((lineKey) =>
          setDoc(
            doc(db, 'navigation_routes', `route_${lineKey}`),
            {
              name: lineKey,
              type: 'URBANA',
              company: 'UCOT',
              status: 'ACTIVO',
              createdAt: new Date().toISOString(),
              source: 'auto_seed',
            },
            { merge: true },
          ),
        );
        await Promise.all(routePromises);
        console.log('[AutoSeed] ✅ Rutas de navegación inyectadas.');

        // === VERIFY WRITE ===
        const verifySnap = await getDocs(query(collection(db, 'fleet_vehicles'), limit(3)));
        console.log(
          `[AutoSeed] 🔍 Verificación: ${verifySnap.size} documentos leídos en fleet_vehicles.`,
        );

        sessionStorage.setItem(SEED_SESSION_KEY, 'seeded');
        console.log('[AutoSeed] ✅✅✅ SEED AUTOMÁTICO COMPLETADO.');
      } catch (err) {
        console.error('[AutoSeed] ❌ Error en seed automático:', err);
        // Don't block the app — seed is best-effort
      }
    })();
  }, []);
};
