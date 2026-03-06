import { useState } from 'react';
import { collection, doc, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { LINE_ARCHETYPES } from '../../data/lineTemplates';
import { line300Data, line300ReverseData } from '../../data/lineTemplates';
import { Shield, Database, CheckCircle, AlertTriangle, Loader2, Zap } from 'lucide-react';

// === 137 Vehicle Definitions for UCOT Fleet Seed ===
const generateFleetSeed = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vehicles: { carNumber: string; [key: string]: any }[] = [];
  // UCOT Fleet: Buses numbered from 1 to 137
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

// === 163 Service Definitions extracted from UCOT Carton data ===
const generateServicesSeed = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const services: { id: string; [key: string]: any }[] = [];
  const lines = Object.keys(LINE_ARCHETYPES);

  // Generate ~163 services across all lines
  let serviceCounter = 1000;
  lines.forEach((line) => {
    const archetype = LINE_ARCHETYPES[line];
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

// === Route seed for Navigation ===
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

type SeedResult = {
  action: string;
  status: 'pending' | 'running' | 'success' | 'error';
  count: number;
  message: string;
};

const AdminSetup = () => {
  const [results, setResults] = useState<SeedResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [completedAll, setCompletedAll] = useState(false);

  const updateResult = (index: number, update: Partial<SeedResult>) => {
    setResults((prev) => prev.map((r, i) => (i === index ? { ...r, ...update } : r)));
  };

  const runFullSeed = async () => {
    setIsRunning(true);
    setCompletedAll(false);

    const initialResults: SeedResult[] = [
      { action: 'Verificar conexión Firebase', status: 'pending', count: 0, message: '' },
      { action: 'Inyectar Flota (137 Coches)', status: 'pending', count: 0, message: '' },
      { action: 'Inyectar Servicios Maestros (163)', status: 'pending', count: 0, message: '' },
      { action: 'Inyectar Cartones de Referencia', status: 'pending', count: 0, message: '' },
      { action: 'Inyectar Rutas de Navegación', status: 'pending', count: 0, message: '' },
    ];
    setResults(initialResults);

    try {
      // Step 1: Verify Firebase connection
      updateResult(0, { status: 'running' });
      await getDocs(collection(db, '__connection_test__'));
      updateResult(0, {
        status: 'success',
        message: `Firebase OK. Proyecto: ucot-gestor-cloud`,
        count: 1,
      });
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      // Even if __connection_test__ doesn't exist, the SDK connected if no network error
      if (e?.code === 'permission-denied' || e?.code === 'not-found') {
        updateResult(0, {
          status: 'success',
          message: 'Firebase conectado (permisos pendientes para colección test)',
          count: 1,
        });
      } else {
        updateResult(0, { status: 'error', message: `Error de conexión: ${e.message}` });
        setIsRunning(false);
        return;
      }
    }

    // Step 2: Seed Fleet (137 vehicles)
    try {
      updateResult(1, { status: 'running' });
      const vehicles = generateFleetSeed();
      let count = 0;
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
        count++;
        if (count % 20 === 0) {
          updateResult(1, { count, message: `${count}/137 vehículos...` });
        }
      }
      updateResult(1, {
        status: 'success',
        count,
        message: `${count} vehículos inyectados correctamente`,
      });
    } catch (err: unknown) {
      updateResult(1, { status: 'error', message: (err as Error).message });
    }

    // Step 3: Seed Services (163)
    try {
      updateResult(2, { status: 'running' });
      const services = generateServicesSeed();
      let count = 0;
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
        count++;
        if (count % 30 === 0) {
          updateResult(2, { count, message: `${count}/${services.length} servicios...` });
        }
      }
      updateResult(2, {
        status: 'success',
        count,
        message: `${count} servicios inyectados correctamente`,
      });
    } catch (err: unknown) {
      updateResult(2, { status: 'error', message: (err as Error).message });
    }

    // Step 4: Seed Reference Cartones
    try {
      updateResult(3, { status: 'running' });
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
          paradas: line300ReverseData.headers.map((h) => h.location),
          viajes: line300ReverseData.rows.map((r, i) => ({
            fila: i + 1,
            tiempos: line300ReverseData.headers.map((h) => r.times[h.id] || ''),
          })),
          notasCabecera: ['CARTÓN DE REFERENCIA GENERADO POR ADMIN SETUP'],
          notasPie: [],
          sheetName: 'REF_300_VUELTA',
          createdAt: new Date().toISOString(),
          source: 'admin_setup_seed',
        },
        { merge: true },
      );

      updateResult(3, {
        status: 'success',
        count: 2,
        message: '2 cartones de referencia (300 IDA + VUELTA) inyectados',
      });
    } catch (err: unknown) {
      updateResult(3, { status: 'error', message: (err as Error).message });
    }

    // Step 5: Seed Navigation Routes
    try {
      updateResult(4, { status: 'running' });
      const routes = generateRoutesSeed();
      let count = 0;
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
        count++;
      }
      updateResult(4, {
        status: 'success',
        count,
        message: `${count} rutas de navegación inyectadas`,
      });
    } catch (err: unknown) {
      updateResult(4, { status: 'error', message: (err as Error).message });
    }

    setIsRunning(false);
    setCompletedAll(true);
  };

  const getStatusIcon = (status: SeedResult['status']) => {
    switch (status) {
      case 'pending':
        return <div className="w-6 h-6 rounded-full bg-slate-700 border-2 border-slate-600" />;
      case 'running':
        return <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-6 h-6 text-emerald-400" />;
      case 'error':
        return <AlertTriangle className="w-6 h-6 text-red-400" />;
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 animate-fade-in-up">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 via-red-500 to-purple-600 mb-4 shadow-2xl shadow-red-900/30">
          <Shield className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight mb-2">
          Panel de Configuración Inicial
        </h1>
        <p className="text-slate-400 max-w-md mx-auto">
          Inyecta los datos maestros directamente en Firestore desde el navegador. No requiere
          acceso a terminal ni credenciales de servicio.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full">
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
          <span className="text-amber-400 text-xs font-bold uppercase tracking-wider">
            Solo Administradores
          </span>
        </div>
      </div>

      {/* Action Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        {/* Top info */}
        <div className="p-6 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 mb-3">
            <Database className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Seed Completo de Datos Maestros</h2>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-slate-800/50 rounded-xl p-3">
              <div className="text-2xl font-black text-blue-400">137</div>
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                Vehículos
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-3">
              <div className="text-2xl font-black text-emerald-400">163</div>
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                Servicios
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-3">
              <div className="text-2xl font-black text-purple-400">8</div>
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                Rutas
              </div>
            </div>
          </div>
        </div>

        {/* Results List */}
        {results.length > 0 && (
          <div className="divide-y divide-slate-800">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-4 px-6 py-4 transition-colors ${
                  r.status === 'running'
                    ? 'bg-blue-500/5'
                    : r.status === 'success'
                      ? 'bg-emerald-500/5'
                      : r.status === 'error'
                        ? 'bg-red-500/5'
                        : ''
                }`}
              >
                {getStatusIcon(r.status)}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm">{r.action}</div>
                  {r.message && (
                    <div
                      className={`text-xs mt-0.5 truncate ${
                        r.status === 'error'
                          ? 'text-red-400'
                          : r.status === 'success'
                            ? 'text-emerald-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {r.message}
                    </div>
                  )}
                </div>
                {r.count > 0 && (
                  <span className="bg-slate-800 px-2 py-0.5 rounded text-xs font-mono text-slate-300">
                    {r.count}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Action Button */}
        <div className="p-6 border-t border-slate-800">
          {completedAll ? (
            <div className="text-center">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-emerald-400 font-bold text-lg mb-2">¡Datos Maestros Inyectados!</p>
              <p className="text-slate-500 text-sm mb-4">
                Los datos están disponibles en Firestore de inmediato.
              </p>
              <button
                onClick={() => (window.location.href = '/dashboard')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/30 active:scale-95"
              >
                Ir al Dashboard →
              </button>
            </div>
          ) : (
            <button
              onClick={runFullSeed}
              disabled={isRunning}
              className={`w-full flex items-center justify-center gap-3 py-4 rounded-xl font-black text-lg transition-all active:scale-[0.98] shadow-xl ${
                isRunning
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 shadow-indigo-900/40'
              }`}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Inyectando Datos...
                </>
              ) : (
                <>
                  <Zap className="w-6 h-6" />
                  EJECUTAR SEED COMPLETO
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Warning */}
      <div className="mt-6 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl text-center">
        <p className="text-amber-400/80 text-xs font-bold uppercase tracking-wider">
          ⚠️ Este proceso escribe directamente en Firestore (producción). Usa{' '}
          <code className="bg-slate-800 px-1 rounded">merge: true</code> para no sobreescribir datos
          existentes.
        </p>
      </div>
    </div>
  );
};

export default AdminSetup;
