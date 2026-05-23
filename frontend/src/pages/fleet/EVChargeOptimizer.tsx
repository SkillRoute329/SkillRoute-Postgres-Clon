/**
 * EVChargeOptimizer — Optimizador de Carga Flota Eléctrica
 * =========================================================
 * Gestiona la carga nocturna de los buses Yutong eléctricos de UCOT.
 * Evita picos de demanda eléctrica y maximiza la vida útil de las baterías.
 *
 * DÓNDE COLOCAR: frontend/src/pages/fleet/EVChargeOptimizer.tsx
 * AGREGAR RUTA:  { path: 'ev-charge', element: <EVChargeOptimizer /> }
 */

import { useState, useEffect } from 'react';
import { collection, getDocs, where, query } from '../../config/firestoreShim';
import { db } from '../../config/firebase';
import {
  Zap,
  Battery,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Calendar,
  Settings,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BusElectrico {
  id: string;
  numero: string;
  modelo: string;
  nivelBateriaPct: number;
  ciclosCarga: number;
  ultimaRecarga?: string;
  horasServicioHoy: number;
  proximoTurno?: string; // "06:00" = próximo turno
  enCochera: boolean;
  prioridadCarga: 'alta' | 'media' | 'baja';
}

interface SlotCarga {
  horaInicio: string;
  horaFin: string;
  busId: string;
  busNumero: string;
  nivelInicio: number;
  nivelObjetivo: number;
  kwh: number;
  motivo: string;
}

// ─── Datos demo (reemplazar con Firestore real) ───────────────────────────────

const BUSES_ELECTRICOS_DEMO: BusElectrico[] = [
  {
    id: 'E01',
    numero: '201',
    modelo: 'Yutong E12LF (2020)',
    nivelBateriaPct: 28,
    ciclosCarga: 412,
    horasServicioHoy: 8.5,
    proximoTurno: '05:30',
    enCochera: true,
    prioridadCarga: 'alta',
  },
  {
    id: 'E02',
    numero: '202',
    modelo: 'Yutong E12LF (2020)',
    nivelBateriaPct: 54,
    ciclosCarga: 398,
    horasServicioHoy: 7.0,
    proximoTurno: '06:00',
    enCochera: true,
    prioridadCarga: 'media',
  },
  {
    id: 'E03',
    numero: '203',
    modelo: 'Yutong E12LF (2020)',
    nivelBateriaPct: 71,
    ciclosCarga: 445,
    horasServicioHoy: 6.0,
    proximoTurno: '07:00',
    enCochera: false,
    prioridadCarga: 'baja',
  },
  {
    id: 'E04',
    numero: '204',
    modelo: 'Yutong E12 Pro (2024)',
    nivelBateriaPct: 15,
    ciclosCarga: 87,
    horasServicioHoy: 9.0,
    proximoTurno: '05:00',
    enCochera: true,
    prioridadCarga: 'alta',
  },
  {
    id: 'E05',
    numero: '205',
    modelo: 'Yutong E12 Pro (2024)',
    nivelBateriaPct: 42,
    ciclosCarga: 92,
    horasServicioHoy: 7.5,
    proximoTurno: '06:30',
    enCochera: true,
    prioridadCarga: 'media',
  },
  {
    id: 'E06',
    numero: '206',
    modelo: 'Yutong E12 Pro (2024)',
    nivelBateriaPct: 88,
    ciclosCarga: 65,
    horasServicioHoy: 4.0,
    proximoTurno: '08:00',
    enCochera: true,
    prioridadCarga: 'baja',
  },
];

// ─── Generador de plan de carga ───────────────────────────────────────────────

function generarPlanCarga(buses: BusElectrico[]): SlotCarga[] {
  const KWH_BATERIA = 324; // kWh batería Yutong E12
  const TASA_CARGA_KW = 60; // kW cargador estándar
  const plan: SlotCarga[] = [];

  const busesEnCochera = buses
    .filter((b) => b.enCochera)
    .sort((a, b) => a.nivelBateriaPct - b.nivelBateriaPct); // Cargar primero los más bajos

  let horaActual = 22 * 60; // 22:00 en minutos

  for (const bus of busesEnCochera) {
    if (bus.nivelBateriaPct >= 90) continue; // Ya está cargado

    const objetivo = bus.proximoTurno ? 85 : 95; // 85% si sale pronto, 95% si no
    const kwNecesarios = ((objetivo - bus.nivelBateriaPct) / 100) * KWH_BATERIA;
    const minNecesarios = Math.ceil((kwNecesarios / TASA_CARGA_KW) * 60);

    const inicioHH = Math.floor(horaActual / 60)
      .toString()
      .padStart(2, '0');
    const inicioMM = (horaActual % 60).toString().padStart(2, '0');
    const finMin = horaActual + minNecesarios;
    const finHH = Math.floor((finMin / 60) % 24)
      .toString()
      .padStart(2, '0');
    const finMM = (finMin % 60).toString().padStart(2, '0');

    plan.push({
      horaInicio: `${inicioHH}:${inicioMM}`,
      horaFin: `${finHH}:${finMM}`,
      busId: bus.id,
      busNumero: bus.numero,
      nivelInicio: bus.nivelBateriaPct,
      nivelObjetivo: objetivo,
      kwh: Math.round(kwNecesarios),
      motivo:
        bus.prioridadCarga === 'alta'
          ? 'Nivel crítico'
          : `Turno a las ${bus.proximoTurno ?? 'N/A'}`,
    });

    horaActual = finMin + 15; // 15 min entre cargas
  }

  return plan;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function EVChargeOptimizer() {
  const [buses, setBuses] = useState<BusElectrico[]>(BUSES_ELECTRICOS_DEMO);
  const [plan, setPlan] = useState<SlotCarga[]>([]);
  const [planGenerado, setPlanGenerado] = useState(false);
  const [cargandoDatos, setCargandoDatos] = useState(false);

  // Intentar cargar desde Firestore
  async function cargarDesdeFirestore() {
    setCargandoDatos(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'vehicles'), where('tipo', 'in', ['electrico', 'hibrido'])),
      );
      if (snap.size > 0) {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as BusElectrico[];
        setBuses(data);
      }
    } catch {
      // Usar datos demo si no hay conexión
    }
    setCargandoDatos(false);
  }

  useEffect(() => {
    void cargarDesdeFirestore();
  }, []);

  function handleGenerarPlan() {
    const planNuevo = generarPlanCarga(buses);
    setPlan(planNuevo);
    setPlanGenerado(true);
  }

  const criticos = buses.filter((b) => b.nivelBateriaPct < 25);
  const enCochera = buses.filter((b) => b.enCochera);
  const kwhTotalNoche = plan.reduce((s, p) => s + p.kwh, 0);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center">
              <Zap className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Optimizador de Carga EV</h1>
              <p className="text-sm text-slate-500">
                Flota eléctrica Yutong — {buses.length} unidades · {enCochera.length} en cochera
              </p>
            </div>
          </div>
          <button
            onClick={handleGenerarPlan}
            className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Generar Plan Nocturno
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Alertas críticas */}
        {criticos.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <p className="font-semibold text-red-800">
                {criticos.length} unidad{criticos.length > 1 ? 'es' : ''} con batería crítica
                (&lt;25%)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {criticos.map((b) => (
                <span
                  key={b.id}
                  className="bg-red-100 text-red-800 text-sm font-medium px-3 py-1 rounded-full"
                >
                  🚌 {b.numero} — {b.nivelBateriaPct}%
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Grilla de buses */}
        <div>
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">
            Estado de la Flota Eléctrica
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {buses.map((bus) => {
              const color =
                bus.nivelBateriaPct < 25
                  ? 'bg-red-500'
                  : bus.nivelBateriaPct < 50
                    ? 'bg-amber-500'
                    : bus.nivelBateriaPct < 75
                      ? 'bg-blue-500'
                      : 'bg-green-500';

              return (
                <div key={bus.id} className="bg-white rounded-xl border p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-slate-800">Bus {bus.numero}</p>
                      <p className="text-xs text-slate-500">{bus.modelo}</p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        bus.enCochera
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {bus.enCochera ? '🏠 Cochera' : '🚌 En ruta'}
                    </span>
                  </div>

                  {/* Barra de batería */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span className="flex items-center gap-1">
                        <Battery className="w-3 h-3" /> Batería
                      </span>
                      <span className="font-semibold">{bus.nivelBateriaPct}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all ${color}`}
                        style={{ width: `${bus.nivelBateriaPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Info secundaria */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center bg-slate-50 rounded-lg py-1.5">
                      <p className="font-semibold text-slate-700">{bus.ciclosCarga}</p>
                      <p className="text-slate-400">Ciclos</p>
                    </div>
                    <div className="text-center bg-slate-50 rounded-lg py-1.5">
                      <p className="font-semibold text-slate-700">{bus.horasServicioHoy}h</p>
                      <p className="text-slate-400">Hoy</p>
                    </div>
                    <div className="text-center bg-slate-50 rounded-lg py-1.5">
                      <p className="font-semibold text-slate-700">{bus.proximoTurno ?? '—'}</p>
                      <p className="text-slate-400">Próx.</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Plan de carga nocturna */}
        {planGenerado && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
                Plan de Carga Nocturna
              </h2>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-500">
                  Total: <strong className="text-slate-700">{kwhTotalNoche} kWh</strong>
                </span>
                <span className="text-slate-500">
                  Costo est.:{' '}
                  <strong className="text-slate-700">${(kwhTotalNoche * 4.2).toFixed(0)} UY</strong>
                </span>
              </div>
            </div>

            {plan.length === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-green-800">
                  Toda la flota tiene batería suficiente. No se requiere carga esta noche.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-slate-600 font-semibold">Bus</th>
                      <th className="text-left px-4 py-3 text-slate-600 font-semibold">Horario</th>
                      <th className="text-left px-4 py-3 text-slate-600 font-semibold">Batería</th>
                      <th className="text-left px-4 py-3 text-slate-600 font-semibold">kWh</th>
                      <th className="text-left px-4 py-3 text-slate-600 font-semibold">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {plan.map((slot, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          Bus {slot.busNumero}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {slot.horaInicio} → {slot.horaFin}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-red-600 font-medium">{slot.nivelInicio}%</span>
                          <span className="text-slate-400 mx-1">→</span>
                          <span className="text-green-600 font-medium">{slot.nivelObjetivo}%</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">{slot.kwh}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{slot.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-slate-400 mt-2">
              * Plan basado en cargadores de 60kW. Tarifa nocturna estimada: $4.20/kWh (UTE valle).
              Ajustar según contrato vigente con UTE.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
