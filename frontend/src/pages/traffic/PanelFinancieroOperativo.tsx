import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db, authReady } from '../../config/firebase';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  AlertTriangle,
  Settings,
  ChevronDown,
  ChevronUp,
  Bus,
  Activity,
} from 'lucide-react';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface Parametros {
  costoPorKmDiesel: number;
  costoPorKmElectrico: number;
  salarioConductorMensual: number;
  cantidadConductores: number;
  ingresoPorKm: number;
  tipoCambioUSD: number;
  kmExtraPromedioPorDesvio: number;
}

interface VehiculoData {
  numero?: string;
  linea?: string;
  tipo_combustible?: 'diesel' | 'electrico';
  ultimo_kilometraje?: number;
}

interface DesvioData {
  linea_id?: string;
  tipo?: string;
  metros_fuera?: number;
  timestamp?: Timestamp;
  resuelto?: boolean;
}

interface IncidenciaData {
  titulo?: string;
  estado?: string;
  prioridad?: string;
  coche_id?: string;
  linea_id?: string;
  timestamp?: Timestamp;
  costo_estimado?: number;
}

interface LineaResumen {
  linea_id: string;
  desvios: number;
  incidencias: number;
  impactoEstimado: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'skillroute_params_financieros';

const PARAMETROS_DEFAULT: Parametros = {
  costoPorKmDiesel: 28,
  costoPorKmElectrico: 12,
  salarioConductorMensual: 48000,
  cantidadConductores: 120,
  ingresoPorKm: 35,
  tipoCambioUSD: 43,
  kmExtraPromedioPorDesvio: 3,
};

function cargarParametros(): Parametros {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...PARAMETROS_DEFAULT, ...JSON.parse(raw) };
  } catch {
    // ignorar error de parse
  }
  return PARAMETROS_DEFAULT;
}

function guardarParametros(p: Parametros) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function formatUYU(n: number): string {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    maximumFractionDigits: 0,
  }).format(n);
}

function mesesAtras(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function etiquetaMes(d: Date): string {
  return d.toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
}

function semaforo(impacto: number): 'verde' | 'amarillo' | 'rojo' {
  if (impacto < 5000) return 'verde';
  if (impacto < 20000) return 'amarillo';
  return 'rojo';
}

function colorSemaforo(s: 'verde' | 'amarillo' | 'rojo'): string {
  if (s === 'verde') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (s === 'amarillo') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
}

function diasAbierta(ts?: Timestamp): number {
  if (!ts) return 0;
  const ms = Date.now() - ts.toDate().getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function PanelFinancieroOperativo() {
  // Mes seleccionado (índice 0 = mes actual, 1 = mes anterior, etc.)
  const [offsetMes, setOffsetMes] = useState(0);

  const [params, setParams] = useState<Parametros>(cargarParametros);
  const [panelParamsAbierto, setPanelParamsAbierto] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Datos de Firestore
  const [vehiculos, setVehiculos] = useState<VehiculoData[]>([]);
  const [desvios, setDesvios] = useState<DesvioData[]>([]);
  const [incidencias, setIncidencias] = useState<IncidenciaData[]>([]);
  const [viajesActivos, setViajesActivos] = useState<Set<string>>(new Set());

  // Fecha de inicio del mes seleccionado
  const fechaInicio = mesesAtras(offsetMes);
  const fechaFin = (() => {
    const d = new Date(fechaInicio);
    d.setMonth(d.getMonth() + 1);
    return d;
  })();

  const opcionesMes = Array.from({ length: 7 }, (_, i) => ({
    offset: i,
    label: etiquetaMes(mesesAtras(i)),
  }));

  // ── Carga de datos ─────────────────────────────────────────────────────────

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      await authReady;

      const tsInicio = Timestamp.fromDate(fechaInicio);
      const tsFin = Timestamp.fromDate(fechaFin);

      // Vehículos (sin filtro de fecha — son datos de flota actuales)
      const snapVehiculos = await getDocs(collection(db, 'vehicles'));
      const vehiculosData: VehiculoData[] = snapVehiculos.docs.map(
        (d) => d.data() as VehiculoData,
      );

      // Desvíos del mes
      const qDesvios = query(
        collection(db, 'eventos_desvio'),
        where('timestamp', '>=', tsInicio),
        where('timestamp', '<', tsFin),
      );
      const snapDesvios = await getDocs(qDesvios);
      const desviosData: DesvioData[] = snapDesvios.docs.map(
        (d) => d.data() as DesvioData,
      );

      // Incidencias del mes (todas, para KPI de costo)
      const qIncidencias = query(
        collection(db, 'incidencias'),
        where('timestamp', '>=', tsInicio),
        where('timestamp', '<', tsFin),
        orderBy('timestamp', 'desc'),
        limit(200),
      );
      const snapIncidencias = await getDocs(qIncidencias);
      const incidenciasData: IncidenciaData[] = snapIncidencias.docs.map(
        (d) => d.data() as IncidenciaData,
      );

      // Viajes activos del mes — líneas únicas
      const qViajes = query(
        collection(db, 'viajes_activos'),
        where('timestamp', '>=', tsInicio),
        where('timestamp', '<', tsFin),
      );
      const snapViajes = await getDocs(qViajes);
      const lineasConViajes = new Set<string>();
      snapViajes.docs.forEach((d) => {
        const data = d.data();
        if (data.linea_id) lineasConViajes.add(String(data.linea_id));
      });

      setVehiculos(vehiculosData);
      setDesvios(desviosData);
      setIncidencias(incidenciasData);
      setViajesActivos(lineasConViajes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error al cargar datos: ${msg}`);
    } finally {
      setCargando(false);
    }
  }, [fechaInicio.getTime()]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Persistir parámetros
  useEffect(() => {
    guardarParametros(params);
  }, [params]);

  // ── Cálculos financieros ───────────────────────────────────────────────────

  const vehiculosDiesel = vehiculos.filter(
    (v) => !v.tipo_combustible || v.tipo_combustible === 'diesel',
  );
  const vehiculosElectricos = vehiculos.filter(
    (v) => v.tipo_combustible === 'electrico',
  );

  const kmDiesel = vehiculosDiesel.reduce(
    (acc, v) => acc + (v.ultimo_kilometraje ?? 0),
    0,
  );
  const kmElectrico = vehiculosElectricos.reduce(
    (acc, v) => acc + (v.ultimo_kilometraje ?? 0),
    0,
  );
  const kmTotales = kmDiesel + kmElectrico;

  const ingresosTotales = kmTotales * params.ingresoPorKm;
  const costoLaboral = params.cantidadConductores * params.salarioConductorMensual;
  const costoCombustible =
    kmDiesel * params.costoPorKmDiesel + kmElectrico * params.costoPorKmElectrico;
  const costoIncidencias = incidencias.reduce(
    (acc, i) => acc + (i.costo_estimado ?? 0),
    0,
  );
  const costoTotal = costoLaboral + costoCombustible + costoIncidencias;
  const resultadoEstimado = ingresosTotales - costoTotal;

  // ── Desglose de costos para barras CSS ────────────────────────────────────

  const pctLaboral = costoTotal > 0 ? (costoLaboral / costoTotal) * 100 : 0;
  const pctCombustible =
    costoTotal > 0 ? (costoCombustible / costoTotal) * 100 : 0;
  const pctIncidencias =
    costoTotal > 0 ? (costoIncidencias / costoTotal) * 100 : 0;

  // ── Top 10 líneas por eventos ──────────────────────────────────────────────

  const mapLineas = new Map<string, { desvios: number; incidencias: number }>();

  desvios.forEach((d) => {
    const id = d.linea_id ?? 'SIN_LINEA';
    const prev = mapLineas.get(id) ?? { desvios: 0, incidencias: 0 };
    mapLineas.set(id, { ...prev, desvios: prev.desvios + 1 });
  });

  incidencias.forEach((i) => {
    const id = i.linea_id ?? 'SIN_LINEA';
    const prev = mapLineas.get(id) ?? { desvios: 0, incidencias: 0 };
    mapLineas.set(id, { ...prev, incidencias: prev.incidencias + 1 });
  });

  const top10Lineas: LineaResumen[] = Array.from(mapLineas.entries())
    .map(([linea_id, v]) => ({
      linea_id,
      desvios: v.desvios,
      incidencias: v.incidencias,
      impactoEstimado:
        v.desvios * params.kmExtraPromedioPorDesvio * params.costoPorKmDiesel,
    }))
    .sort((a, b) => b.desvios + b.incidencias - (a.desvios + a.incidencias))
    .slice(0, 10);

  // ── Incidencias abiertas ───────────────────────────────────────────────────

  const incidenciasAbiertas = incidencias
    .filter((i) => i.estado !== 'cerrada' && i.estado !== 'cerrado')
    .sort((a, b) => {
      const prioOrder: Record<string, number> = {
        critica: 0,
        alta: 1,
        media: 2,
        baja: 3,
      };
      const pA = prioOrder[a.prioridad?.toLowerCase() ?? 'baja'] ?? 3;
      const pB = prioOrder[b.prioridad?.toLowerCase() ?? 'baja'] ?? 3;
      if (pA !== pB) return pA - pB;
      const tA = a.timestamp?.toMillis() ?? 0;
      const tB = b.timestamp?.toMillis() ?? 0;
      return tB - tA;
    })
    .slice(0, 15);

  // ─── UI ────────────────────────────────────────────────────────────────────

  function handleParamChange(key: keyof Parametros, value: string) {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      setParams((prev) => ({ ...prev, [key]: num }));
    }
  }

  function badgePrioridad(p?: string) {
    const label = p ?? 'baja';
    const map: Record<string, string> = {
      critica: 'bg-red-500/20 text-red-400 border border-red-500/30',
      alta: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
      media: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
      baja: 'bg-slate-700/50 text-slate-400 border border-slate-600/30',
    };
    const cls = map[label.toLowerCase()] ?? map['baja'];
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${cls}`}>
        {label}
      </span>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-slate-950 min-h-screen p-6 space-y-6">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-700/8 rounded-full blur-[160px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-orange-700/8 rounded-full blur-[160px]" />
      </div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-blue-600/20 rounded-lg border border-blue-500/30">
              <DollarSign className="w-5 h-5 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-200">
              Panel Financiero Operativo
            </h1>
          </div>
          <p className="text-sm text-slate-400 ml-11">
            Conexión entre métricas financieras y realidad operativa
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Badge estimaciones */}
          <span className="text-xs px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
            Estimaciones basadas en parámetros configurables
          </span>

          {/* Selector de mes */}
          <select
            value={offsetMes}
            onChange={(e) => setOffsetMes(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
          >
            {opcionesMes.map((o) => (
              <option key={o.offset} value={o.offset}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Botón recargar */}
          <button
            onClick={cargarDatos}
            disabled={cargando}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 text-sm transition-colors disabled:opacity-50"
          >
            {cargando ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Error global */}
      {error && (
        <div className="relative z-10 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* ── Sección 1 — Parámetros configurables ──────────────────────────── */}
      <div className="relative z-10 bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <button
          onClick={() => setPanelParamsAbierto((v) => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-300">
              Parámetros configurables
            </span>
            <span className="text-xs text-slate-500">
              (ajustá estos valores para calcular tus estimaciones)
            </span>
          </div>
          {panelParamsAbierto ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {panelParamsAbierto && (
          <div className="p-4 pt-0 border-t border-slate-700/50 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {(
              [
                {
                  key: 'costoPorKmDiesel',
                  label: 'Costo/km diésel (UYU)',
                  min: 1,
                },
                {
                  key: 'costoPorKmElectrico',
                  label: 'Costo/km eléctrico (UYU)',
                  min: 1,
                },
                {
                  key: 'salarioConductorMensual',
                  label: 'Salario mensual conductor (UYU)',
                  min: 1,
                },
                {
                  key: 'cantidadConductores',
                  label: 'Conductores activos',
                  min: 1,
                },
                {
                  key: 'ingresoPorKm',
                  label: 'Ingreso estimado/km (UYU)',
                  min: 1,
                },
                {
                  key: 'tipoCambioUSD',
                  label: 'Tipo de cambio USD/UYU',
                  min: 1,
                },
                {
                  key: 'kmExtraPromedioPorDesvio',
                  label: 'Km extra por desvío (estimado)',
                  min: 0,
                },
              ] as { key: keyof Parametros; label: string; min: number }[]
            ).map(({ key, label, min }) => (
              <div key={key}>
                <label className="text-xs text-slate-500 uppercase tracking-widest block mb-1">
                  {label}
                </label>
                <input
                  type="number"
                  min={min}
                  value={params[key]}
                  onChange={(e) => handleParamChange(key, e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            ))}

            <div className="col-span-full flex justify-end">
              <button
                onClick={() => setParams(PARAMETROS_DEFAULT)}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors underline"
              >
                Restablecer valores por defecto
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Sección 2 — KPI Cards ──────────────────────────────────────────── */}
      {cargando ? (
        <div className="relative z-10 flex items-center justify-center h-40">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Cargando datos...</p>
          </div>
        </div>
      ) : (
        <>
          <div className="relative z-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Ingresos estimados */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-500 uppercase tracking-widest">
                  Ingresos estimados
                </span>
              </div>
              <p className="text-3xl font-black text-emerald-400">
                {formatUYU(ingresosTotales)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {kmTotales.toLocaleString('es-UY')} km × {formatUYU(params.ingresoPorKm)}/km
              </p>
            </div>

            {/* Costo operativo */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <span className="text-xs text-slate-500 uppercase tracking-widest">
                  Costo operativo
                </span>
              </div>
              <p className="text-3xl font-black text-red-400">
                {formatUYU(costoTotal)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Laboral + combustible + incidencias
              </p>
            </div>

            {/* Resultado estimado */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-slate-500 uppercase tracking-widest">
                  Resultado estimado
                </span>
              </div>
              <p
                className={`text-3xl font-black ${
                  resultadoEstimado >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {formatUYU(resultadoEstimado)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Ingresos − costos totales
              </p>
            </div>

            {/* Costo por incidencias */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-500 uppercase tracking-widest">
                  Costo incidencias
                </span>
              </div>
              <p className="text-3xl font-black text-white">
                {formatUYU(costoIncidencias)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {incidencias.filter((i) => i.costo_estimado).length} con costo
                registrado
              </p>
            </div>

            {/* Líneas operando */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Bus className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-slate-500 uppercase tracking-widest">
                  Líneas operando
                </span>
              </div>
              <p className="text-3xl font-black text-white">
                {viajesActivos.size}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Con viajes registrados este mes
              </p>
            </div>
          </div>

          {/* ── Sección 3 — Desglose de costos ─────────────────────────────── */}
          <div className="relative z-10 bg-slate-900 border border-slate-700/50 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest">
                Desglose de costos
              </h2>
            </div>

            <div className="space-y-4">
              {/* Laboral */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm text-slate-300">Costo laboral</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">
                      {formatUYU(costoLaboral)}
                    </span>
                    <span className="text-xs text-slate-500 w-10 text-right">
                      {pctLaboral.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-blue-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, pctLaboral)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {params.cantidadConductores} conductores × {formatUYU(params.salarioConductorMensual)}/mes
                </p>
              </div>

              {/* Combustible */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm text-slate-300">Costo combustible</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">
                      {formatUYU(costoCombustible)}
                    </span>
                    <span className="text-xs text-slate-500 w-10 text-right">
                      {pctCombustible.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-orange-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, pctCombustible)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Diésel: {kmDiesel.toLocaleString('es-UY')} km · Eléctrico:{' '}
                  {kmElectrico.toLocaleString('es-UY')} km
                </p>
              </div>

              {/* Incidencias */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm text-slate-300">Costo por incidencias</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">
                      {formatUYU(costoIncidencias)}
                    </span>
                    <span className="text-xs text-slate-500 w-10 text-right">
                      {pctIncidencias.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-red-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, pctIncidencias)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Basado en campo <code className="text-slate-600">costo_estimado</code> de incidencias registradas
                </p>
              </div>
            </div>

            {costoTotal === 0 && (
              <p className="text-slate-500 text-sm mt-4 text-center">
                Sin datos de kilómetros registrados para el período seleccionado.
                Ajustá los parámetros o verificá la colección <code>vehicles</code>.
              </p>
            )}
          </div>

          {/* ── Sección 4 — Top 10 líneas por eventos ──────────────────────── */}
          <div className="relative z-10 bg-slate-900 border border-slate-700/50 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest">
                Líneas con más eventos operativos
              </h2>
            </div>
            <p className="text-xs text-slate-500 mb-5 ml-6">
              Contexto operativo: esto explica por qué ciertas líneas tienen
              costos más altos.
            </p>

            {top10Lineas.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">
                Sin eventos de desvío ni incidencias registrados en este período.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left py-2 px-3 text-xs text-slate-500 uppercase tracking-widest font-medium">
                        Línea
                      </th>
                      <th className="text-right py-2 px-3 text-xs text-slate-500 uppercase tracking-widest font-medium">
                        Desvíos
                      </th>
                      <th className="text-right py-2 px-3 text-xs text-slate-500 uppercase tracking-widest font-medium">
                        Incidencias
                      </th>
                      <th className="text-right py-2 px-3 text-xs text-slate-500 uppercase tracking-widest font-medium">
                        Impacto estimado
                      </th>
                      <th className="text-center py-2 px-3 text-xs text-slate-500 uppercase tracking-widest font-medium">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {top10Lineas.map((linea) => {
                      const s = semaforo(linea.impactoEstimado);
                      return (
                        <tr
                          key={linea.linea_id}
                          className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <Bus className="w-3.5 h-3.5 text-slate-500" />
                              <span className="text-slate-200 font-medium">
                                Línea {linea.linea_id}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span
                              className={`font-semibold ${
                                linea.desvios > 10
                                  ? 'text-red-400'
                                  : linea.desvios > 5
                                  ? 'text-amber-400'
                                  : 'text-slate-300'
                              }`}
                            >
                              {linea.desvios}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span
                              className={`font-semibold ${
                                linea.incidencias > 5
                                  ? 'text-red-400'
                                  : linea.incidencias > 2
                                  ? 'text-amber-400'
                                  : 'text-slate-300'
                              }`}
                            >
                              {linea.incidencias}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right text-slate-200">
                            {formatUYU(linea.impactoEstimado)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium border ${colorSemaforo(
                                s,
                              )}`}
                            >
                              {s === 'verde'
                                ? 'Normal'
                                : s === 'amarillo'
                                ? 'Atención'
                                : 'Crítico'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-slate-600 mt-4 italic">
              Impacto estimado = desvíos × {params.kmExtraPromedioPorDesvio} km extra × {formatUYU(params.costoPorKmDiesel)}/km (costo diésel). Ajustable en parámetros.
            </p>
          </div>

          {/* ── Sección 5 — Incidencias abiertas ───────────────────────────── */}
          <div className="relative z-10 bg-slate-900 border border-slate-700/50 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest">
                Incidencias abiertas del mes
              </h2>
            </div>
            <p className="text-xs text-amber-400/70 mb-5 ml-6">
              Estas incidencias representan costos operativos no contabilizados aún.
            </p>

            {incidenciasAbiertas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-slate-400 text-sm">
                  Sin incidencias abiertas en este período.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {incidenciasAbiertas.map((inc, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-start justify-between gap-3 bg-slate-800/40 border border-slate-700/30 rounded-lg p-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {badgePrioridad(inc.prioridad)}
                        <span className="text-slate-200 font-medium text-sm truncate">
                          {inc.titulo ?? 'Sin título'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        {inc.linea_id && (
                          <span className="flex items-center gap-1">
                            <Bus className="w-3 h-3" />
                            Línea {inc.linea_id}
                          </span>
                        )}
                        {inc.coche_id && (
                          <span>Coche {inc.coche_id}</span>
                        )}
                        <span>
                          Abierta hace {diasAbierta(inc.timestamp)} días
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      {inc.costo_estimado != null && inc.costo_estimado > 0 ? (
                        <span className="text-sm font-semibold text-red-400">
                          {formatUYU(inc.costo_estimado)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600 italic">
                          Sin costo registrado
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {incidenciasAbiertas.length > 0 && (
              <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <p className="text-xs text-amber-400/80">
                  Total de incidencias abiertas en este período:{' '}
                  <strong className="text-amber-400">{incidenciasAbiertas.length}</strong>.
                  Para registrar costos en una incidencia, editarla desde el módulo
                  Centro de Mando de Incidencias.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
