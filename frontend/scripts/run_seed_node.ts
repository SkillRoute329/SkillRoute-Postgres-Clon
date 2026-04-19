import { collection, doc, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../src/config/firebase';
import { LINE_ARCHETYPES, line300Data, line300ReverseData } from '../src/data/lineTemplates';

const generateFleetSeed = () => {
  const vehicles: { carNumber: string; [key: string]: any }[] = [];
  const types = ['CONVENCIONAL', 'PISO_BAJO', 'HIBRIDO', 'ELECTRICO'];
  for (let i = 1; i <= 137; i++) {
    const typeIdx = i <= 80 ? 0 : i <= 110 ? 1 : i <= 130 ? 2 : 3;
    vehicles.push({
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
    });
  }
  return vehicles;
};

const generateServicesSeed = () => {
  const services: { id: string; [key: string]: any }[] = [];
  const lines = Object.keys(LINE_ARCHETYPES);
  let serviceCounter = 1000;
  lines.forEach((line) => {
    const archetype = LINE_ARCHETYPES[line as keyof typeof LINE_ARCHETYPES];
    const servicesPerLine = line === '300' ? 30 : line === '306' ? 25 : line === '370' ? 25 : 20;

    for (let i = 0; i < servicesPerLine; i++) {
      const startHour = 4 + Math.floor((i * 18) / servicesPerLine);
      const startMin = Math.floor(Math.random() * 60);
      services.push({
        id: `svc_${serviceCounter}`,
        serviceNumber: String(serviceCounter),
        line: line,
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
      });
      serviceCounter++;
    }
  });
  return services;
};

const generateRoutesSeed = () => {
  const routes: Record<string, string>[] = [];
  const lines = Object.keys(LINE_ARCHETYPES);
  lines.forEach((line) => {
    routes.push({
      name: line,
      type: 'URBANA',
      company: 'UCOT',
      status: 'ACTIVO',
    });
  });
  return routes;
};

async function runSeed() {
  console.log('--- STARTING ADMIN SETUP SEED IN NODEJS ---');

  try {
    console.log('[1/4] Verificando conexion Firestore...');
    await getDocs(collection(db, '__connection_test__'));
  } catch (err: any) {
    if (err?.code !== 'permission-denied' && err?.code !== 'not-found') {
      console.error('Error on verify:', err);
    }
  }

  console.log('[2/4] Injecting Fleet (137 Vehiculos)...');
  const vehicles = generateFleetSeed();
  for (const v of vehicles) {
    await setDoc(
      doc(db, 'fleet_vehicles', `vehicle_${v.carNumber}`),
      {
        ...v,
        createdAt: new Date().toISOString(),
        source: 'admin_setup_seed',
      },
      { merge: true },
    );
  }

  console.log('[3/4] Injecting Services (163)...');
  const services = generateServicesSeed();
  for (const s of services) {
    await setDoc(
      doc(db, 'service_definitions', s.id),
      {
        ...s,
        createdAt: new Date().toISOString(),
        source: 'admin_setup_seed',
      },
      { merge: true },
    );
  }

  console.log('[4/4] Injecting Cartones and Routes...');
  await setDoc(
    doc(db, 'cartones_completados', 'ref_300_ida'),
    {
      linea: '300',
      servicio: 'REFERENCIA-IDA',
      paradas: line300Data.headers.map((h: any) => h.location),
      viajes: line300Data.rows.map((r: any, i: number) => ({
        fila: i + 1,
        tiempos: line300Data.headers.map((h: any) => r.times[h.id] || ''),
      })),
      notasCabecera: ['CARTÓN DE REFERENCIA GENERADO POR ADMIN SETUP'],
      notasPie: [],
      sheetName: 'REF_300_IDA',
      createdAt: new Date().toISOString(),
      source: 'admin_setup_seed',
    },
    { merge: true },
  );

  await setDoc(
    doc(db, 'cartones_completados', 'ref_300_vuelta'),
    {
      linea: '300',
      servicio: 'REFERENCIA-VUELTA',
      paradas: line300ReverseData.headers.map((h: any) => h.location),
      viajes: line300ReverseData.rows.map((r: any, i: number) => ({
        fila: i + 1,
        tiempos: line300ReverseData.headers.map((h: any) => r.times[h.id] || ''),
      })),
      notasCabecera: ['CARTÓN DE REFERENCIA GENERADO POR ADMIN SETUP'],
      notasPie: [],
      sheetName: 'REF_300_VUELTA',
      createdAt: new Date().toISOString(),
      source: 'admin_setup_seed',
    },
    { merge: true },
  );

  const routes = generateRoutesSeed();
  for (const r of routes) {
    await setDoc(
      doc(db, 'navigation_routes', `route_${r.name}`),
      {
        ...r,
        createdAt: new Date().toISOString(),
        source: 'admin_setup_seed',
      },
      { merge: true },
    );
  }

  console.log('✅ SEED COMPLETED!');
  process.exit(0);
}

runSeed().catch(console.error);
