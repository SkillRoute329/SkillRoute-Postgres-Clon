/**
 * EconomicProjectionsPage — Centro de Proyecciones Económicas
 *
 * KPIs por línea UCOT:
 *  - Ingresos estimados STM (tarifa × pasajeros estimados × viajes/día)
 *  - Costos operativos (combustible, conductor, mantenimiento)
 *  - Margen bruto por línea
 *  - Break-even: mínimo de pasajeros para cubrir costos
 *  - Forecast ±30 días basado en tendencia histórica de inspecciones
 *
 * Fuentes: ScheduleService (salidas/día) + Firestore inspecciones (carga real)
 * Sin simulaciones de estado — proyecciones basadas en matemática real.
 */

import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { ScheduleService } from '../../services/scheduleService';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Target,
  Zap,
  Download,
  Building2,
} from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/* ─── Constantes Económicas — fuente única en parametros-operativos.ts ────
 * Fix #2 (2026-04-23): antes hardcodeados aquí (tarifa 45) y en backend (56).
 * Ahora ambos leen del mismo módulo. Editable por Super Admin sin rebuild.
 * ────────────────────────────────────────────────────────────────────────── */
import {
  v,
  TARIFA_STM,
  COSTO_COMBUSTIBLE_KM as COMB_PARAM,
  COSTO_CONDUCTOR_DIA as CONDUCTOR_PARAM,
  COSTO_MANTENIMIENTO_KM as MANT_PARAM,
  KM_PROMEDIO_VIAJE as KM_PARAM,
  PASAJEROS_PROMEDIO_VIAJE as PAX_PARAM,
  ELASTICIDAD_FLOTA_DEMANDA as ELASTICIDAD_PARAM,
} from '../../config/parametros-operativos';

const TARIFA_STM_UYU = v(TARIFA_STM);
const COSTO_COMBUSTIBLE_KM = v(COMB_PARAM);
const COSTO_CONDUCTOR_DIA = v(CONDUCTOR_PARAM);
const COSTO_MANTENIMIENTO_KM = v(MANT_PARAM);
const KM_PROMEDIO_VIAJE = v(KM_PARAM);
const PASAJEROS_PROMEDIO_VIAJE = v(PAX_PARAM);
/** Fix #3: factor de elasticidad frecuencia→demanda (Balcombe et al. 2004, TRL593). */
const ELASTICIDAD_FLOTA = v(ELASTICIDAD_PARAM);
const OCUPACION_PICO = 0.85;
const OCUPACION_VALLE = 0.45;
const DIAS_PROYECCION = 30;

/* ─── Líneas UCOT con prefijoş en ScheduleService ─────── */

const LINEAS_UCOT = [
  { id: '370', nombre: 'Línea 370', variante: '370a', corredor: 'Cerro–Centro' },
  { id: '517', nombre: 'Línea 517', variante: '517a', corredor: 'Cerro–Prado' },
  { id: '369', nombre: 'Línea 369', variante: '369a', corredor: 'Cerro–Colón' },
  { id: '300', nombre: 'Línea 300', variante: '300a', corredor: 'Cerro–Ciudad Vieja' },
  { id: '329', nombre: 'Línea 329', variante: '329a', corredor: 'Cerro–Tres Cruces' },
  { id: '17', nombre: 'Línea 17', variante: '17a', corredor: 'Cerro–Punta Carretas' },
];

/* ─── Types ───────────────────────────────────────────── */

interface LineaEconomica {
  id: string;
  nombre: string;
  corredor: string;
  viajesDia: number;
  pasajerosRealesPromedio: number; // del Firestore si hay datos
  ingresosDia: number; // UYU
  costosDia: number; // UYU
  margenDia: number; // UYU
  margenPct: number; // %
  breakEvenPasajeros: number; // por viaje
  tendencia: number; // % cambio últimas 2 semanas vs anteriores
  estado: 'RENTABLE' | 'EN_RIESGO' | 'DEFICITARIA';
  forecastMes: number; // UYU proyectado mes
}

/* ─── Helpers ─────────────────────────────────────────── */

function fmtUYU(n: number): string {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    maximumFractionDigits: 0,
  }).format(n);
}

function calcularLinea(
  linea: (typeof LINEAS_UCOT)[0],
  inspData: Map<string, { avg: number; tendencia: number }>,
): LineaEconomica {
  // Viajes por día desde ScheduleService
  let viajesDia = 0;
  try {
    const sched = ScheduleService.getSchedule(linea.variante);
    viajesDia = sched?.salidas?.length ?? 0;
  } catch {
    viajesDia = 14; // fallback razonable si no hay horario
  }
  if (viajesDia === 0) viajesDia = 14;

  // Pasajeros reales del Firestore (si existen)
  const insp = inspData.get(linea.id);
  const pasajerosPromedio = insp?.avg ?? PASAJEROS_PROMEDIO_VIAJE;
  const tendencia = insp?.tendencia ?? 0;

  // Ingresos diarios
  const ingresosDia = viajesDia * pasajerosPromedio * TARIFA_STM_UYU;

  // Costos diarios
  const kmDia = viajesDia * KM_PROMEDIO_VIAJE;
  const costosDia =
    kmDia * COSTO_COMBUSTIBLE_KM + COSTO_CONDUCTOR_DIA + kmDia * COSTO_MANTENIMIENTO_KM;

  const margenDia = ingresosDia - costosDia;
  const margenPct = ingresosDia > 0 ? (margenDia / ingresosDia) * 100 : 0;

  // Break-even: cuántos pasajeros por viaje para cubrir costos
  const breakEvenPasajeros =
    viajesDia > 0 ? Math.ceil(costosDia / (viajesDia * TARIFA_STM_UYU)) : 0;

  const estado: LineaEconomica['estado'] =
    margenPct >= 15 ? 'RENTABLE' : margenPct >= 0 ? 'EN_RIESGO' : 'DEFICITARIA';

  return {
    id: linea.id,
    nombre: linea.nombre,
    corredor: linea.corredor,
    viajesDia,
    pasajerosRealesPromedio: Math.round(pasajerosPromedio),
    ingresosDia: Math.round(ingresosDia),
    costosDia: Math.round(costosDia),
    margenDia: Math.round(margenDia),
    margenPct: Math.round(margenPct * 10) / 10,
    breakEvenPasajeros,
    tendencia: Math.round(tendencia * 10) / 10,
    estado,
    forecastMes: Math.round(margenDia * DIAS_PROYECCION),
  };
}

/* ─── Component ───────────────────────────────────────── */

export default function EconomicProjectionsPage() {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const [lineas, setLineas] = useState<LineaEconomica[]>([]);
  const [loading, setLoading] = useState(true);
  const [combustibleDelta, setCombustibleDelta] = useState(0); // % ajuste escenario
  const [tarifaDelta, setTarifaDelta] = useState(0); // % ajuste escenario
  const [flotaDelta, setFlotaDelta] = useState(0); // % reducción de viajes diarios
  const [sortBy, setSortBy] = useState<'margen' | 'ingresos' | 'estado'>('margen');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Obtener carga de pasajeros real de Firestore (últimos 30 días)
      const desde = new Date();
      desde.setDate(desde.getDate() - 30);
      const desdeTs = Timestamp.fromDate(desde);

      const hace15 = new Date();
      hace15.setDate(hace15.getDate() - 15);
      const hace15Ts = Timestamp.fromDate(hace15);

      const snap = await getDocs(
        query(
          collection(db, 'inspecciones'),
          where('createdAt', '>=', desdeTs),
          orderBy('createdAt', 'desc'),
          limit(3000),
        ),
      );

      // Agregar por lineaId → pasajeros promedio + tendencia
      const byLinea = new Map<
        string,
        { pasajeros: number[]; recientes: number[]; antiguos: number[] }
      >();

      snap.docs.forEach((d) => {
        const data = d.data();
        const lineaId = String(data.lineaId ?? data.linea ?? '');
        const cargaRaw = data.passengerLoad ?? data.carga ?? data.pasajeros;
        // Convertir carga textual a numérico
        let cargaN = 0;
        if (typeof cargaRaw === 'number') {
          cargaN = cargaRaw;
        } else if (cargaRaw === 'ALTO' || cargaRaw === 'Excelente') {
          cargaN = PASAJEROS_PROMEDIO_VIAJE * OCUPACION_PICO;
        } else if (cargaRaw === 'MEDIO' || cargaRaw === 'Bueno') {
          cargaN = PASAJEROS_PROMEDIO_VIAJE * 0.65;
        } else if (cargaRaw === 'BAJO' || cargaRaw === 'Regular' || cargaRaw === 'Malo') {
          cargaN = PASAJEROS_PROMEDIO_VIAJE * OCUPACION_VALLE;
        } else {
          cargaN = PASAJEROS_PROMEDIO_VIAJE;
        }
        if (cargaN === 0 || !lineaId) return;

        if (!byLinea.has(lineaId))
          byLinea.set(lineaId, { pasajeros: [], recientes: [], antiguos: [] });
        const row = byLinea.get(lineaId)!;
        row.pasajeros.push(cargaN);

        const createdAt = data.createdAt;
        const esReciente =
          createdAt instanceof Timestamp ? createdAt.toMillis() >= hace15Ts.toMillis() : false;
        if (esReciente) row.recientes.push(cargaN);
        else row.antiguos.push(cargaN);
      });

      // Map lineaId → avg + tendencia
      const inspData = new Map<string, { avg: number; tendencia: number }>();
      byLinea.forEach((v, lineaId) => {
        const avg = v.pasajeros.reduce((a, b) => a + b, 0) / v.pasajeros.length;
        const avgRec =
          v.recientes.length > 0
            ? v.recientes.reduce((a, b) => a + b, 0) / v.recientes.length
            : avg;
        const avgAnt =
          v.antiguos.length > 0 ? v.antiguos.reduce((a, b) => a + b, 0) / v.antiguos.length : avg;
        const tendencia = avgAnt > 0 ? ((avgRec - avgAnt) / avgAnt) * 100 : 0;
        inspData.set(lineaId, { avg, tendencia });
      });

      // Calcular economía por línea con ajuste de escenario
      const combustibleFactor = 1 + combustibleDelta / 100;
      const tarifaFactor = 1 + tarifaDelta / 100;
      const flotaFactor = 1 - flotaDelta / 100; // Reducción de viajes/flota

      const resultado = LINEAS_UCOT.map((l) => {
        const base = calcularLinea(l, inspData);
        // Aplicar ajuste de escenario y de flota (ROI Simulator)
        
        // Si reducimos la flota (y los viajes) un X%, los costos bajan linealmente aprox
        const costosAjustados = Math.round(
          base.costosDia * flotaFactor *
            (1 +
              (combustibleFactor - 1) *
                (COSTO_COMBUSTIBLE_KM / (COSTO_COMBUSTIBLE_KM + COSTO_MANTENIMIENTO_KM))),
        );

        // Si reducimos viajes, la demanda se agrupa pero asumiendo una penalización 
        // Para simplificar: Pierde 0.2% de pasajeros por cada 1% de viaje reducido (fricción)
        const penalizacionDemanda = flotaDelta > 0 ? (1 - (flotaDelta * ELASTICIDAD_FLOTA)) : 1;
        const ingresosAjustados = Math.round(base.ingresosDia * penalizacionDemanda * tarifaFactor);
        
        const margenAjustado = ingresosAjustados - costosAjustados;
        const margenPctAjustado =
          ingresosAjustados > 0 ? (margenAjustado / ingresosAjustados) * 100 : 0;
        return {
          ...base,
          costosDia: costosAjustados,
          ingresosDia: ingresosAjustados,
          margenDia: margenAjustado,
          margenPct: Math.round(margenPctAjustado * 10) / 10,
          estado: (margenPctAjustado >= 15
            ? 'RENTABLE'
            : margenPctAjustado >= 0
              ? 'EN_RIESGO'
              : 'DEFICITARIA') as LineaEconomica['estado'],
          forecastMes: Math.round(margenAjustado * DIAS_PROYECCION),
        };
      });

      setLineas(resultado);
    } catch (e) {
      console.error('[EconomicProjections] Error:', e);
    } finally {
      setLoading(false);
    }
  }, [combustibleDelta, tarifaDelta, flotaDelta]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /* ── KPIs globales ── */
  const totalIngresos = lineas.reduce((s, l) => s + l.ingresosDia, 0);
  const totalCostos = lineas.reduce((s, l) => s + l.costosDia, 0);
  const totalMargen = totalIngresos - totalCostos;
  const rentables = lineas.filter((l) => l.estado === 'RENTABLE').length;
  const deficitarias = lineas.filter((l) => l.estado === 'DEFICITARIA').length;

  /* ── Sorted ── */
  const sorted = [...lineas].sort((a, b) => {
    if (sortBy === 'margen') return b.margenDia - a.margenDia;
    if (sortBy === 'ingresos') return b.ingresosDia - a.ingresosDia;
    const order = { RENTABLE: 0, EN_RIESGO: 1, DEFICITARIA: 2 };
    return order[a.estado] - order[b.estado];
  });

  /* ── Export PDF ── */
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Proyecciones Económicas — UCOT', 14, 20);
    doc.setFontSize(9);
    doc.text(
      `Generado: ${new Date().toLocaleDateString('es-UY')} | Tarifa STM: $${TARIFA_STM_UYU} | Ajuste combustible: ${combustibleDelta > 0 ? '+' : ''}${combustibleDelta}%`,
      14,
      28,
    );

    doc.setFontSize(11);
    doc.text(`Ingresos totales/día: ${fmtUYU(totalIngresos)}`, 14, 38);
    doc.text(`Costos totales/día: ${fmtUYU(totalCostos)}`, 14, 44);
    doc.text(
      `Margen operativo/día: ${fmtUYU(totalMargen)} (${totalIngresos > 0 ? ((totalMargen / totalIngresos) * 100).toFixed(1) : 0}%)`,
      14,
      50,
    );

    autoTable(doc, {
      head: [
        [
          'Línea',
          'Corredor',
          'Viajes/día',
          'Pax/viaje',
          'Ingresos/día',
          'Costos/día',
          'Margen',
          'Estado',
        ],
      ],
      body: lineas.map((l) => [
        l.nombre,
        l.corredor,
        String(l.viajesDia),
        String(l.pasajerosRealesPromedio),
        fmtUYU(l.ingresosDia),
        fmtUYU(l.costosDia),
        `${l.margenPct > 0 ? '+' : ''}${l.margenPct}%`,
        l.estado,
      ]),
      startY: 58,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 64, 175] },
    });

    doc.save(`proyecciones_ucot_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  /* ── Estado color ── */
  const estadoStyle = (e: LineaEconomica['estado']) => {
    if (e === 'RENTABLE') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (e === 'EN_RIESGO') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-red-400 bg-red-500/10 border-red-500/20';
  };

  /* ─── RENDER ─────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">
              Proyecciones Económicas
            </h1>
            <p className="text-xs text-slate-500">
              Rentabilidad real por línea · Simulación de escenarios · Forecast {DIAS_PROYECCION}d
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Actualizar proyecciones"
            onClick={() => void fetchData()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-white/5 text-xs text-slate-300 hover:bg-slate-700/60 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={exportPDF}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-600/80 border border-blue-500/30 text-xs text-white hover:bg-blue-600 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Ingresos/día',
            value: fmtUYU(totalIngresos),
            icon: TrendingUp,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10 border-emerald-500/20',
          },
          {
            label: 'Costos/día',
            value: fmtUYU(totalCostos),
            icon: TrendingDown,
            color: 'text-red-400',
            bg: 'bg-red-500/10 border-red-500/20',
          },
          {
            label: 'Margen/día',
            value: fmtUYU(totalMargen),
            icon: BarChart3,
            color: totalMargen >= 0 ? 'text-blue-400' : 'text-red-400',
            bg:
              totalMargen >= 0
                ? 'bg-blue-500/10 border-blue-500/20'
                : 'bg-red-500/10 border-red-500/20',
          },
          {
            label: 'Forecast 30d',
            value: fmtUYU(totalMargen * 30),
            icon: Target,
            color: 'text-purple-400',
            bg: 'bg-purple-500/10 border-purple-500/20',
          },
        ].map((kpi) => (
          <div key={kpi.label} className={`rounded-2xl p-4 border ${kpi.bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              <span className="text-xs text-slate-500">{kpi.label}</span>
            </div>
            <p className={`text-lg font-black ${kpi.color}`}>{loading ? '—' : kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Estado badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-slate-500 font-bold">FLOTA:</span>
        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20">
          {rentables} Rentables
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-bold border border-amber-500/20">
          {lineas.filter((l) => l.estado === 'EN_RIESGO').length} En riesgo
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs font-bold border border-red-500/20">
          {deficitarias} Deficitarias
        </span>
      </div>

      {/* Simulador de Escenarios */}
      <div className="rounded-2xl border border-white/[0.06] bg-slate-900/60 p-5">
        <h2 className="text-sm font-black text-white mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          Simulador de Escenarios
          <span className="text-xs text-slate-500 font-normal ml-1">
            Ajusta parámetros para ver impacto en rentabilidad
          </span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* ROI: Reducción de Flota / Viajes */}
          <div className="p-3 bg-blue-500/5 rounded-xl border border-blue-500/20">
            <div className="flex justify-between mb-2">
              <label htmlFor="slider-flota" className="text-xs font-bold text-slate-300">
                Optimización de Flota (Reducción Viajes)
              </label>
              <span
                className={`text-xs font-black ${flotaDelta > 0 ? 'text-emerald-400' : 'text-slate-400'}`}
              >
                -{flotaDelta}%
              </span>
            </div>
            <input
              id="slider-flota"
              type="range"
              min={0}
              max={30}
              step={5}
              value={flotaDelta}
              onChange={(e) => setFlotaDelta(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>Actual (0%)</span>
              <span>-30%</span>
            </div>
          </div>
          {/* Combustible */}
          <div className="p-3">
            <div className="flex justify-between mb-2">
              <label htmlFor="slider-combustible" className="text-xs font-bold text-slate-300">
                Variación costo combustible
              </label>
              <span
                className={`text-xs font-black ${combustibleDelta > 0 ? 'text-red-400' : combustibleDelta < 0 ? 'text-emerald-400' : 'text-slate-400'}`}
              >
                {combustibleDelta > 0 ? '+' : ''}
                {combustibleDelta}%
              </span>
            </div>
            <input
              id="slider-combustible"
              type="range"
              min={-30}
              max={50}
              step={5}
              value={combustibleDelta}
              onChange={(e) => setCombustibleDelta(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>-30% (bajada)</span>
              <span>+50% (crisis)</span>
            </div>
          </div>
          {/* Tarifa */}
          <div className="p-3">
            <div className="flex justify-between mb-2">
              <label htmlFor="slider-tarifa" className="text-xs font-bold text-slate-300">
                Variación tarifa STM
              </label>
              <span
                className={`text-xs font-black ${tarifaDelta > 0 ? 'text-emerald-400' : tarifaDelta < 0 ? 'text-red-400' : 'text-slate-400'}`}
              >
                {tarifaDelta > 0 ? '+' : ''}
                {tarifaDelta}%
                <span className="text-slate-500 font-normal ml-1">
                  (${Math.round(TARIFA_STM_UYU * (1 + tarifaDelta / 100))})
                </span>
              </span>
            </div>
            <input
              id="slider-tarifa"
              type="range"
              min={-20}
              max={40}
              step={5}
              value={tarifaDelta}
              onChange={(e) => setTarifaDelta(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>-20%</span>
              <span>+40%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla por línea */}
      <div className="rounded-2xl border border-white/[0.06] bg-slate-900/60 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-black text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            Rentabilidad por Línea
          </h2>
          <div className="flex items-center gap-1 bg-slate-800/60 rounded-xl p-1">
            {(
              [
                ['margen', 'Margen'],
                ['ingresos', 'Ingresos'],
                ['estado', 'Estado'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  sortBy === key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500" />
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {sorted.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-12 gap-2 px-5 py-4 hover:bg-white/[0.02] transition-colors items-center"
              >
                {/* Nombre */}
                <div className="col-span-3">
                  <p className="text-sm font-bold text-white">{l.nombre}</p>
                  <p className="text-xs text-slate-500">{l.corredor}</p>
                </div>

                {/* Viajes y pax */}
                <div className="col-span-2 text-center">
                  <p className="text-xs text-slate-400">{l.viajesDia} viajes/día</p>
                  <p className="text-xs text-slate-500">{l.pasajerosRealesPromedio} pax/viaje</p>
                </div>

                {/* Ingresos */}
                <div className="col-span-2 text-right">
                  <p className="text-xs font-mono text-emerald-400">{fmtUYU(l.ingresosDia)}</p>
                  <p className="text-xs text-slate-600">ingresos/día</p>
                </div>

                {/* Costos */}
                <div className="col-span-2 text-right">
                  <p className="text-xs font-mono text-red-400">{fmtUYU(l.costosDia)}</p>
                  <p className="text-xs text-slate-600">costos/día</p>
                </div>

                {/* Margen */}
                <div className="col-span-2 text-right">
                  <p
                    className={`text-sm font-black ${l.margenDia >= 0 ? 'text-blue-400' : 'text-red-400'}`}
                  >
                    {l.margenPct > 0 ? '+' : ''}
                    {l.margenPct}%
                  </p>
                  <p className="text-xs text-slate-500">{fmtUYU(l.forecastMes)}/mes</p>
                </div>

                {/* Estado + tendencia */}
                <div className="col-span-1 flex flex-col items-end gap-1">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${estadoStyle(l.estado)}`}
                  >
                    {l.estado === 'RENTABLE' ? '✅' : l.estado === 'EN_RIESGO' ? '⚠️' : '🔴'}
                  </span>
                  {l.tendencia !== 0 && (
                    <span
                      className={`text-xs flex items-center gap-0.5 ${l.tendencia > 0 ? 'text-emerald-400' : 'text-red-400'}`}
                    >
                      {l.tendencia > 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {Math.abs(l.tendencia)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alerta líneas deficitarias */}
      {deficitarias > 0 && !loading && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-300">
              {deficitarias} línea{deficitarias > 1 ? 's' : ''} en déficit operativo
            </p>
            <p className="text-xs text-red-400/70 mt-1">
              Revisar break-even de pasajeros y evaluar ajuste de frecuencias o renegociación STM.
              Break-even requerido:{' '}
              {lineas
                .filter((l) => l.estado === 'DEFICITARIA')
                .map((l) => `${l.nombre}: ${l.breakEvenPasajeros} pax/viaje`)
                .join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Notas metodológicas */}
      <p className="text-xs text-slate-700 text-center">
        Tarifa STM base: ${TARIFA_STM_UYU} UYU · Costo combustible: ${COSTO_COMBUSTIBLE_KM}/km ·
        Conductor: ${COSTO_CONDUCTOR_DIA}/día · Km/viaje: {KM_PROMEDIO_VIAJE}km estimado
      </p>
    </div>
  );
}
