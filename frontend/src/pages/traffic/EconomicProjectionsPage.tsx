/**
 * EconomicProjectionsPage — Centro de Proyecciones Económicas
 *
 * KPIs por línea — multi-operador (UCOT / CUTCSA / COME / COETC):
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
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from '../../config/firestoreShim';
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
  Globe2,
  ChevronDown,
  Sparkles,
  Info,
} from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { getLineasByAgency } from '../../services/linesService';
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
  calcularCostoTotalEmpleado,
  SALARIO_INSPECTOR_NOMINAL,
} from '../../config/parametros-operativos';
import { subscribeAll, getParametroValor } from '../../services/firestore/parametrosOperativos';

const OCUPACION_PICO = 0.85;
const OCUPACION_VALLE = 0.45;
const DIAS_PROYECCION = 30;

/* ─── Tipo genérico de línea para cálculos económicos ──── */

/* ── Pitch de Mercado STM — datos paramétricos cross-operador ── */
// Inspectores estimados en proporción a flota (UCOT confirmado; resto estimado)
const _COSTO_MES_INSPECTOR = calcularCostoTotalEmpleado(v(SALARIO_INSPECTOR_NOMINAL)).totalMensual;
const _TASA_REEMPLAZO = 0.70; // 70 % del trabajo inspector reemplazable por SkillRoute

const PITCH_OPERADORES = [
  { codigo: 50, nombre: 'CUTCSA', inspectores: 35, licenciaUSD: 0 },  // licenciante
  { codigo: 70, nombre: 'UCOT',   inspectores: 12, licenciaUSD: 990 },
  { codigo: 20, nombre: 'COME',   inspectores: 8,  licenciaUSD: 490 },
  { codigo: 10, nombre: 'COETC',  inspectores: 5,  licenciaUSD: 290 },
].map((op) => ({
  ...op,
  costoActualMes: Math.round(op.inspectores * _COSTO_MES_INSPECTOR),
  ahorroMes: Math.round(op.inspectores * _COSTO_MES_INSPECTOR * _TASA_REEMPLAZO),
}));

const PITCH_CUTCSA_AHORRO_ANUAL = PITCH_OPERADORES.find((o) => o.codigo === 50)!.ahorroMes * 12;
const PITCH_SISTEMA_AHORRO_ANUAL = PITCH_OPERADORES.reduce((s, o) => s + o.ahorroMes, 0) * 12;
const PITCH_LICENCIAS_USD_ANUAL  = PITCH_OPERADORES.filter((o) => o.codigo !== 50).reduce((s, o) => s + o.licenciaUSD, 0) * 12;
const PITCH_TOTAL_INSPECTORES    = PITCH_OPERADORES.reduce((s, o) => s + o.inspectores, 0);

interface LineaBase {
  id: string;
  nombre: string;
  corredor: string;
  variante: string;   // para ScheduleService (solo UCOT tiene horarios; otros usan fallback)
  agencyId?: string;  // '70' | '50' | '20' | '10'
  esDatoReal?: boolean; // tiene datos reales de inspecciones
}

/* ─── Líneas UCOT con horarios reales en ScheduleService ── */
const LINEAS_UCOT: LineaBase[] = [
  { id: '370', nombre: 'Línea 370', variante: '370a', corredor: 'Cerro–Centro', agencyId: '70' },
  { id: '517', nombre: 'Línea 517', variante: '517a', corredor: 'Cerro–Prado', agencyId: '70' },
  { id: '369', nombre: 'Línea 369', variante: '369a', corredor: 'Cerro–Colón', agencyId: '70' },
  { id: '300', nombre: 'Línea 300', variante: '300a', corredor: 'Cerro–Ciudad Vieja', agencyId: '70' },
  { id: '329', nombre: 'Línea 329', variante: '329a', corredor: 'Cerro–Tres Cruces', agencyId: '70' },
  { id: '17', nombre: 'Línea 17', variante: '17a', corredor: 'Cerro–Punta Carretas', agencyId: '70' },
];

const OPERADORES_TODOS = [70, 50, 20, 10] as const;

/* ─── Types ───────────────────────────────────────────── */

interface LineaEconomica {
  id: string;
  nombre: string;
  corredor: string;
  viajesDia: number;
  pasajerosRealesPromedio: number; // del Firestore si hay datos
  ingresosDia: number; // UYU bruto
  ingresosDiaNeto: number; // UYU neto deducido el IVA
  costosDia: number; // UYU
  margenDia: number; // UYU
  margenPct: number; // %
  breakEvenPasajeros: number; // por viaje
  tendencia: number; // % cambio últimas 2 semanas vs anteriores
  estado: 'RENTABLE' | 'EN_RIESGO' | 'DEFICITARIA';
  forecastMes: number; // UYU proyectado mes
  agencyId?: string;
  esDatoReal: boolean;
}

interface ParametrosCalculo {
  tarifa: number;
  combustible: number;
  conductor: number;
  mantenimiento: number;
  kmViaje: number;
  paxDefault: number;
  elasticidad: number;
  iva: number;
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
  linea: LineaBase,
  inspData: Map<string, { avg: number; tendencia: number }>,
  p: ParametrosCalculo,
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
  const pasajerosPromedio = insp?.avg ?? p.paxDefault;
  const tendencia = insp?.tendencia ?? 0;

  // Ingresos diarios
  const ingresosDiaBruto = viajesDia * pasajerosPromedio * p.tarifa;
  const ingresosDiaNeto = ingresosDiaBruto * (1 - p.iva);

  // Costos diarios
  const kmDia = viajesDia * p.kmViaje;
  const costosDia =
    kmDia * p.combustible + p.conductor + kmDia * p.mantenimiento;

  const margenDia = ingresosDiaNeto - costosDia;
  const margenPct = ingresosDiaNeto > 0 ? (margenDia / ingresosDiaNeto) * 100 : 0;

  // Break-even: cuántos pasajeros por viaje para cubrir costos
  const breakEvenPasajeros =
    viajesDia > 0 ? Math.ceil(costosDia / (viajesDia * p.tarifa)) : 0;

  const estado: LineaEconomica['estado'] =
    margenPct >= 15 ? 'RENTABLE' : margenPct >= 0 ? 'EN_RIESGO' : 'DEFICITARIA';

  return {
    id: linea.id,
    nombre: linea.nombre,
    corredor: linea.corredor,
    viajesDia,
    pasajerosRealesPromedio: Math.round(pasajerosPromedio),
    ingresosDia: Math.round(ingresosDiaBruto),
    ingresosDiaNeto: Math.round(ingresosDiaNeto),
    costosDia: Math.round(costosDia),
    margenDia: Math.round(margenDia),
    margenPct: Math.round(margenPct * 10) / 10,
    breakEvenPasajeros,
    tendencia: Math.round(tendencia * 10) / 10,
    estado,
    forecastMes: Math.round(margenDia * DIAS_PROYECCION),
    agencyId: linea.agencyId,
    esDatoReal: Boolean(insp),
  };
}

/* ─── Component ───────────────────────────────────────── */

export default function EconomicProjectionsPage() {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const [lineas, setLineas] = useState<LineaEconomica[]>([]);
  const [loading, setLoading] = useState(true);
  const [modoTodos, setModoTodos] = useState(false);
  const [combustibleDelta, setCombustibleDelta] = useState(0); // % ajuste escenario
  const [tarifaDelta, setTarifaDelta] = useState(0); // % ajuste escenario
  const [flotaDelta, setFlotaDelta] = useState(0); // % reducción de viajes diarios
  const [sortBy, setSortBy] = useState<'margen' | 'ingresos' | 'estado'>('margen');
  const [showPitch, setShowPitch] = useState(false);
  const [fallbackUcotUsed, setFallbackUcotUsed] = useState(false);

  const [params, setParams] = useState<ParametrosCalculo>({
    tarifa: 45,
    combustible: 12,
    conductor: 1800,
    mantenimiento: 3,
    kmViaje: 18,
    paxDefault: 28,
    elasticidad: 0.002,
    iva: 0,
  });

  useEffect(() => {
    const unsub = subscribeAll(() => {
      setParams({
        tarifa: getParametroValor<number>('TARIFA_STM') ?? 45,
        combustible: getParametroValor<number>('COSTO_COMBUSTIBLE_KM') ?? 12,
        conductor: getParametroValor<number>('COSTO_CONDUCTOR_DIA') ?? 1800,
        mantenimiento: getParametroValor<number>('COSTO_MANTENIMIENTO_KM') ?? 3,
        kmViaje: getParametroValor<number>('KM_PROMEDIO_VIAJE') ?? 18,
        paxDefault: getParametroValor<number>('PASAJEROS_PROMEDIO_VIAJE') ?? 28,
        elasticidad: getParametroValor<number>('ELASTICIDAD_FLOTA_DEMANDA') ?? 0.002,
        iva: getParametroValor<number>('IVA_TRANSPORTE') ?? 0,
      });
    });
    return unsub;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // ── 1. Cargar líneas del/los operador/es seleccionados ──────────────
      const agencyIds = modoTodos ? [...OPERADORES_TODOS] : [empresaPropia];

      let usedFallback = false;
      const lineasPorOperador = await Promise.all(
        agencyIds.map(async (aid) => {
          if (aid === 70) {
            try {
              const res = await getLineasByAgency(70);
              if (!res || res.length === 0) {
                throw new Error("No dynamic lines returned for UCOT");
              }
              return res.map<LineaBase>((l) => {
                const variantLower = l.codigo.toLowerCase();
                const variantSuffix = variantLower.endsWith('a') || variantLower.endsWith('b')
                  ? variantLower
                  : `${variantLower}a`;
                return {
                  id: l.codigo,
                  nombre: l.nombre.includes('·') ? l.nombre : `Línea ${l.codigo}`,
                  corredor: l.origen && l.destino ? `${l.origen}–${l.destino}` : 'UCOT',
                  variante: variantSuffix,
                  agencyId: '70',
                };
              });
            } catch (err) {
              console.warn('[EconomicProjections] Error fetching dynamic UCOT lines. Using fallback.', err);
              usedFallback = true;
              return LINEAS_UCOT;
            }
          }
          const res = await getLineasByAgency(aid);
          return res.map<LineaBase>((l) => ({
            id: l.codigo,
            nombre: l.nombre,
            corredor: l.origen && l.destino ? `${l.origen}–${l.destino}` : (l.empresa ?? String(aid)),
            variante: l.codigo, // ScheduleService no tiene datos → fallback 14 viajes/día
            agencyId: String(aid),
          }));
        }),
      );
      setFallbackUcotUsed(usedFallback);
      const todasLineas = lineasPorOperador.flat();

      // ── 2. Inspecciones de pasajeros — solo UCOT tiene datos reales ─────
      const inspData = new Map<string, { avg: number; tendencia: number }>();
      if (agencyIds.includes(70)) {
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
            cargaN = params.paxDefault * OCUPACION_PICO;
          } else if (cargaRaw === 'MEDIO' || cargaRaw === 'Bueno') {
            cargaN = params.paxDefault * 0.65;
          } else if (cargaRaw === 'BAJO' || cargaRaw === 'Regular' || cargaRaw === 'Malo') {
            cargaN = params.paxDefault * OCUPACION_VALLE;
          } else {
            cargaN = params.paxDefault;
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
        byLinea.forEach((v, lineaId) => {
          const avg = v.pasajeros.length > 0 ? v.pasajeros.reduce((a, b) => a + b, 0) / v.pasajeros.length : 0;
          const avgRec =
            v.recientes.length > 0
              ? v.recientes.reduce((a, b) => a + b, 0) / v.recientes.length
              : avg;
          const avgAnt =
            v.antiguos.length > 0 ? v.antiguos.reduce((a, b) => a + b, 0) / v.antiguos.length : avg;
          const tendencia = avgAnt > 0 ? ((avgRec - avgAnt) / avgAnt) * 100 : 0;
          inspData.set(lineaId, { avg, tendencia });
        });
      } // fin bloque inspecciones UCOT

      // ── 3. Calcular economía por línea con ajuste de escenario ───────────
      const combustibleFactor = 1 + combustibleDelta / 100;
      const tarifaFactor = 1 + tarifaDelta / 100;
      const flotaFactor = 1 - flotaDelta / 100; // Reducción de viajes/flota

      const resultado = todasLineas.map((l) => {
        const base = calcularLinea(l, inspData, params);
        // Aplicar ajuste de escenario y de flota (ROI Simulator)
        
        // Si reducimos la flota (y los viajes) un X%, los costos bajan linealmente aprox
        const costosAjustados = Math.round(
          base.costosDia * flotaFactor *
            (1 +
              (combustibleFactor - 1) *
                (params.combustible / (params.combustible + params.mantenimiento))),
        );

        // Si reducimos viajes, la demanda se agrupa pero asumiendo una penalización 
        // Para simplificar: Pierde 0.2% de pasajeros por cada 1% de viaje reducido (fricción)
        const penalizacionDemanda = flotaDelta > 0 ? (1 - (flotaDelta * params.elasticidad)) : 1;
        const ingresosBrutosAjustados = Math.round(base.ingresosDia * penalizacionDemanda * tarifaFactor);
        const ingresosNetosAjustados = Math.round(ingresosBrutosAjustados * (1 - params.iva));
        
        const margenAjustado = ingresosNetosAjustados - costosAjustados;
        const margenPctAjustado =
          ingresosNetosAjustados > 0 ? (margenAjustado / ingresosNetosAjustados) * 100 : 0;
        return {
          ...base,
          costosDia: costosAjustados,
          ingresosDia: ingresosBrutosAjustados,
          ingresosDiaNeto: ingresosNetosAjustados,
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
  }, [empresaPropia, modoTodos, combustibleDelta, tarifaDelta, flotaDelta, params]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Re-fetch when operator changes
  useEffect(() => {
    void fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaPropia, modoTodos]);

  /* ── KPIs globales ── */
  const totalIngresos = lineas.reduce((s, l) => s + l.ingresosDia, 0);
  const totalIngresosNeto = lineas.reduce((s, l) => s + l.ingresosDiaNeto, 0);
  const totalCostos = lineas.reduce((s, l) => s + l.costosDia, 0);
  const totalMargen = totalIngresosNeto - totalCostos;
  const rentables = lineas.filter((l) => l.estado === 'RENTABLE').length;
  const deficitarias = lineas.filter((l) => l.estado === 'DEFICITARIA').length;

  /* ── Sorted ── */
  const sorted = [...lineas].sort((a, b) => {
    if (sortBy === 'margen') return b.margenDia - a.margenDia;
    if (sortBy === 'ingresos') return b.ingresosDiaNeto - a.ingresosDiaNeto;
    const order = { RENTABLE: 0, EN_RIESGO: 1, DEFICITARIA: 2 };
    return order[a.estado] - order[b.estado];
  });

  /* ── Export PDF ── */
  const exportPDF = () => {
    try {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Proyecciones Económicas — ${modoTodos ? 'Sistema Metropolitano' : empresaCfg.label}`, 14, 20);
    doc.setFontSize(9);
    doc.text(
      `Generado: ${new Date().toLocaleDateString('es-UY')} | Tarifa STM: $${params.tarifa} | Ajuste combustible: ${combustibleDelta > 0 ? '+' : ''}${combustibleDelta}% | IVA: ${params.iva * 100}%`,
      14,
      28,
    );

    doc.setFontSize(11);
    doc.text(`Ingresos brutos totales/día: ${fmtUYU(totalIngresos)}`, 14, 38);
    doc.text(`Ingresos netos (deducido IVA)/día: ${fmtUYU(totalIngresosNeto)}`, 14, 44);
    doc.text(`Costos totales/día: ${fmtUYU(totalCostos)}`, 14, 50);
    doc.text(
      `Margen operativo/día: ${fmtUYU(totalMargen)} (${totalIngresosNeto > 0 ? ((totalMargen / totalIngresosNeto) * 100).toFixed(1) : 0}%)`,
      14,
      56,
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

    doc.save(`proyecciones_${modoTodos ? 'todos' : empresaCfg.label.toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('[exportPDF] Error generando PDF:', err);
    }
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
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              Proyecciones Económicas{modoTodos ? ` — Sistema Metropolitano` : ` — ${empresaCfg.label}`}
              {fallbackUcotUsed && (
                <span className="text-[10px] font-black text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/20 animate-pulse">
                  ⚠️ Muestra parcial (Fallback)
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500">
              Rentabilidad real por línea · Simulación de escenarios · Forecast {DIAS_PROYECCION}d
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Selector de operador */}
          <div className="flex items-center bg-slate-800 rounded-xl p-0.5 text-xs font-bold">
            <button
              onClick={() => { setModoTodos(true); }}
              className={`px-2.5 py-1.5 rounded-lg transition-all ${modoTodos ? 'bg-gradient-to-r from-blue-600 to-orange-500 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Building2 className="w-3 h-3 inline mr-1" />
              Todos
            </button>
            {[
              { codigo: 70, label: 'UCOT', color: 'bg-yellow-500' },
              { codigo: 50, label: 'CUTCSA', color: 'bg-blue-500' },
              { codigo: 20, label: 'COME', color: 'bg-green-500' },
              { codigo: 10, label: 'COETC', color: 'bg-red-500' },
            ].map((op) => (
              <button
                key={op.codigo}
                onClick={() => { setModoTodos(false); setEmpresaPropia(op.codigo); }}
                className={`px-2.5 py-1.5 rounded-lg transition-all ${!modoTodos && empresaPropia === op.codigo ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {op.label}
              </button>
            ))}
          </div>
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

      {/* Banner metodología — datos públicos como diferenciador honesto */}
      <div className="flex gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 leading-relaxed">
          <span className="font-semibold text-blue-300">Análisis sobre datos públicos del IMM/STM.</span>{' '}
          Proyecciones macro calculadas con tarifa STM 2026 (UYU {params.tarifa}/pasajero),
          promedio de viajes/día por línea y costo operativo estimado sobre parámetros públicos
          (BCU combustible, planilla MTOP). Para análisis preciso por línea individual, SkillRoute
          integra con sistema de boletera del operador y planilla de costos reales —{' '}
          <span className="text-blue-300">disponible al firmar acuerdo de datos.</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Ingresos/día (Neto)',
            value: fmtUYU(totalIngresosNeto),
            subtext: params.iva > 0 ? `${fmtUYU(totalIngresos)} Bruto (IVA ${params.iva * 100}%)` : undefined,
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
            {kpi.subtext && !loading && (
              <p className="text-[10px] text-slate-400 font-medium mt-0.5 opacity-90">{kpi.subtext}</p>
            )}
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
          <div className="flex-1">
            <h2 className="text-sm font-black text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              Rentabilidad por Línea
            </h2>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <Info className="w-3 h-3 text-slate-600" />
              Estimación con parámetros STM/BCU públicos — mismos parámetros para todas las líneas.
              Para análisis individualizado por línea: integrar boletera del operador.
            </p>
          </div>
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
                  <p className="text-xs font-mono text-emerald-400">
                    {fmtUYU(l.ingresosDiaNeto)}{' '}
                    <span className="text-[10px] text-slate-500 font-bold">neto</span>
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {params.iva > 0 ? `(${fmtUYU(l.ingresosDia)} bruto)` : 'ingresos/día'}
                  </p>
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

      {/* Pitch de Mercado STM — solo en modo Sistema Metropolitano */}
      {modoTodos && !loading && (
        <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-b from-blue-950/40 to-slate-900/60 overflow-hidden">
          <button
            onClick={() => setShowPitch((p) => !p)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500/30 to-orange-500/30 rounded-xl">
                <Globe2 className="w-5 h-5 text-blue-400" />
              </div>
              <div className="text-left">
                <h2 className="text-sm font-black text-white">Valor para el Sistema Metropolitano</h2>
                <p className="text-xs text-slate-400">
                  Si CUTCSA licencia SkillRoute a las otras 3 empresas — impacto estimado
                </p>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform ${showPitch ? 'rotate-180' : ''}`}
            />
          </button>

          {showPitch && (
            <div className="px-5 pb-6 space-y-5 border-t border-white/5">
              {/* KPI cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
                {[
                  {
                    label: 'Ahorro CUTCSA (propio)',
                    value: fmtUYU(PITCH_CUTCSA_AHORRO_ANUAL),
                    sub: 'reducción costo inspectores/año',
                    color: 'text-blue-400',
                    bg: 'bg-blue-500/10 border-blue-500/20',
                  },
                  {
                    label: 'Ahorro sistema (4 operadores)',
                    value: fmtUYU(PITCH_SISTEMA_AHORRO_ANUAL),
                    sub: 'ahorro laboral total/año',
                    color: 'text-emerald-400',
                    bg: 'bg-emerald-500/10 border-emerald-500/20',
                  },
                  {
                    label: 'Ingresos licencias CUTCSA',
                    value: `USD ${PITCH_LICENCIAS_USD_ANUAL.toLocaleString('es-UY')}`,
                    sub: 'como distribuidor del sistema/año',
                    color: 'text-orange-400',
                    bg: 'bg-orange-500/10 border-orange-500/20',
                  },
                ].map((c) => (
                  <div key={c.label} className={`rounded-xl p-4 border ${c.bg}`}>
                    <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                    <p className={`text-xl font-black ${c.color}`}>{c.value}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{c.sub}</p>
                  </div>
                ))}
              </div>

              {/* Tabla desglose por empresa */}
              <div className="rounded-xl border border-white/5 overflow-hidden">
                <div className="bg-slate-800/50 px-4 py-2.5 border-b border-white/5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Desglose por empresa
                  </p>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {PITCH_OPERADORES.map((op) => (
                    <div
                      key={op.codigo}
                      className="grid grid-cols-4 px-4 py-3 text-xs items-center hover:bg-white/[0.02]"
                    >
                      <div>
                        <span className="font-bold text-white">{op.nombre}</span>
                        <p className="text-slate-500">~{op.inspectores} inspectores est.</p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-400">{fmtUYU(op.costoActualMes)}</p>
                        <p className="text-slate-600">costo actual/mes</p>
                      </div>
                      <div className="text-right text-emerald-400">
                        <p>{fmtUYU(op.ahorroMes)}</p>
                        <p className="text-slate-600">ahorro c/SkillRoute</p>
                      </div>
                      <div className="text-right">
                        {op.codigo === 50 ? (
                          <span className="text-blue-400 font-bold">Licenciante</span>
                        ) : (
                          <span className="text-orange-400 font-bold">USD {op.licenciaUSD}/mes</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Argumento de cierre */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-blue-900/20 to-orange-900/10 border border-blue-500/20">
                <Sparkles className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-white">El argumento para la reunión</p>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    CUTCSA no compra un software — adquiere la capacidad de ser el integrador
                    tecnológico del sistema metropolitano. El ahorro en sus propias operaciones
                    justifica la inversión. Distribuir SkillRoute a UCOT, COME y COETC genera
                    ingresos adicionales. Y la inteligencia cross-operador que producen los datos
                    combinados de las 4 empresas{' '}
                    <span className="text-blue-400 font-bold">
                      ningún operador individual puede replicar por su cuenta
                    </span>.
                  </p>
                  <p className="text-xs text-slate-600 mt-2">
                    * Basado en {PITCH_TOTAL_INSPECTORES} inspectores estimados (proporción flota
                    STM 2026) y costo real calculado según BPS / FONASA / BSE / Leyes 12.840 y
                    16.101.
                  </p>
                </div>
              </div>
            </div>
          )}
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
