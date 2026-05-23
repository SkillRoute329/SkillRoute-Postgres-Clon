/**
 * SubsidiosMTOP — Estimador de Subsidios del Ministerio de Transporte y Obras Públicas
 * ======================================================================================
 * Calcula el subsidio estimado mensual por empresa/línea basado en:
 *   - Km operados (GTFS timetable × frecuencia × días hábiles)
 *   - Factor de cumplimiento OTP (compliance_alerts)
 *   - Parámetros de tarifa MTOP (hard-coded con posibilidad de override)
 *
 * Los valores son ESTIMADOS. La cifra oficial requiere integración con STM Card.
 */

import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from '../../config/firestoreShim';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  DollarSign,
  Bus,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Info,
  TrendingDown,
} from 'lucide-react';

// ─── Parámetros MTOP ─────────────────────────────────────────────────────────

const TARIFA_KM_URBANO    = 28;   // $UYU/km ruta urbana
const TARIFA_KM_SUBURBANO = 35;   // $UYU/km ruta suburbana
const UMBRAL_OTP          = 80;   // % mínimo para subsidio completo
const FACTOR_REDUCCION    = 0.8;  // factor si OTP < umbral

// Referencia de líneas por empresa cuando no hay datos GTFS
const LINEAS_REFERENCIA: Record<string, { lineas: number; kmVuelta: number; frecDiaria: number }> = {
  '70': { lineas: 15, kmVuelta: 45, frecDiaria: 8  },  // UCOT
  '50': { lineas: 50, kmVuelta: 48, frecDiaria: 10 },  // CUTCSA
  '20': { lineas: 20, kmVuelta: 55, frecDiaria: 7  },  // COME
  '10': { lineas: 10, kmVuelta: 40, frecDiaria: 6  },  // COETC
};

const EMPRESA_LABEL: Record<string, string> = {
  '70': 'UCOT', '50': 'CUTCSA', '20': 'COME', '10': 'COETC',
};

const EMPRESA_COLOR: Record<string, string> = {
  '70': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  '50': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  '20': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  '10': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FilaLinea {
  linea: string;
  agencyId: string;
  kmMes: number;
  otpPct: number;
  factorCumplimiento: number;
  subsidioEstimado: number;
  tipoRuta: 'urbana' | 'suburbana';
  estado: 'al_dia' | 'reducido' | 'sin_datos';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtPeso = (n: number) =>
  `$${Math.round(n).toLocaleString('es-UY')}`;

const fmtKm = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k km` : `${Math.round(n)} km`;

function diasHabilesEnMes(anio: number, mes: number): number {
  // mes: 0-indexed (como Date)
  const inicio = new Date(anio, mes, 1);
  const fin    = new Date(anio, mes + 1, 0);
  let habiles  = 0;
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) habiles++;
  }
  return habiles;
}

function generarMesesOpciones(): { value: string; label: string }[] {
  const opciones: { value: string; label: string }[] = [];
  const hoy = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
    opciones.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opciones;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SubsidiosMTOP() {
  const { user } = useAuth();
  const isSuperAdmin = (user?.role ?? '').toUpperCase() === 'SUPERADMIN';

  const mesesOpciones = useMemo(generarMesesOpciones, []);
  const [periodoSel, setPeriodoSel] = useState(mesesOpciones[0].value);
  const [filas, setFilas]           = useState<FilaLinea[]>([]);
  const [cargando, setCargando]     = useState(true);
  const [fuenteDatos, setFuenteDatos] = useState<'gtfs' | 'referencia'>('referencia');
  const [metodologiaAbierta, setMetodologiaAbierta] = useState(false);
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('todas');

  // ─── Carga de datos ────────────────────────────────────────────────────────

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      try {
        const [anioStr, mesStr] = periodoSel.split('-');
        const anio  = parseInt(anioStr, 10);
        const mes   = parseInt(mesStr, 10) - 1;  // 0-indexed
        const diasH = diasHabilesEnMes(anio, mes);

        // 1. Intentar cargar desde gtfs_timetable
        const gtfsSnap = await getDocs(
          query(collection(db, 'gtfs_timetable'))
        );

        // 2. Cargar alertas OTP de compliance_alerts
        const alertasSnap = await getDocs(
          query(collection(db, 'compliance_alerts'), where('dismissed', '==', false))
        );

        // Mapear OTP por línea: { linea → pctEnTiempo }
        const otpMap: Record<string, number> = {};
        alertasSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.linea && typeof data.pctEnTiempo === 'number') {
            otpMap[String(data.linea)] = data.pctEnTiempo;
          }
        });

        let filasCalculadas: FilaLinea[] = [];

        if (!gtfsSnap.empty) {
          // ── Datos reales desde GTFS ──────────────────────────────────────
          setFuenteDatos('gtfs');

          // Agrupar por agencyId + línea
          const porLinea: Record<string, { agencyId: string; kmTotal: number }> = {};
          gtfsSnap.docs.forEach((d) => {
            const data = d.data();
            const key  = `${data.agencyId ?? '70'}::${data.linea ?? data.route_short_name ?? 'N/D'}`;
            if (!porLinea[key]) {
              porLinea[key] = { agencyId: String(data.agencyId ?? '70'), kmTotal: 0 };
            }
            // Intentar extraer km del documento
            const km = data.kmTotal ?? data.km_total ?? data.distancia_km ?? data.shape_dist_traveled ?? 0;
            porLinea[key].kmTotal = Math.max(porLinea[key].kmTotal, Number(km));
          });

          filasCalculadas = Object.entries(porLinea).map(([key, val]) => {
            const linea          = key.split('::')[1];
            const kmVuelta       = val.kmTotal > 0 ? val.kmTotal : 45;
            const kmMes          = kmVuelta * 8 * diasH;   // 8 vueltas/día por defecto si no hay frecuencia
            const otpPct         = otpMap[linea] ?? 85;
            const factor         = otpPct >= UMBRAL_OTP ? 1.0 : FACTOR_REDUCCION;
            const tipoRuta       = kmVuelta > 50 ? 'suburbana' : 'urbana';
            const tarifaKm       = tipoRuta === 'suburbana' ? TARIFA_KM_SUBURBANO : TARIFA_KM_URBANO;
            const subsidio       = kmMes * tarifaKm * factor;
            const estado: FilaLinea['estado'] =
              otpMap[linea] == null ? 'sin_datos' : factor < 1 ? 'reducido' : 'al_dia';

            return {
              linea,
              agencyId:           val.agencyId,
              kmMes,
              otpPct,
              factorCumplimiento: factor,
              subsidioEstimado:   subsidio,
              tipoRuta,
              estado,
            };
          });
        } else {
          // ── Datos de referencia (sin GTFS) ───────────────────────────────
          setFuenteDatos('referencia');

          const empresas = isSuperAdmin
            ? Object.keys(LINEAS_REFERENCIA)
            : [user?.agencyId ?? '70'];

          filasCalculadas = empresas.flatMap((agencyId) => {
            const ref = LINEAS_REFERENCIA[agencyId] ?? LINEAS_REFERENCIA['70'];
            return Array.from({ length: ref.lineas }, (_, i) => {
              const linea          = `${String(i + 1).padStart(3, '0')}`;
              const kmMes          = ref.kmVuelta * ref.frecDiaria * diasH;
              const otpPct         = otpMap[linea] ?? 85;
              const factor         = otpPct >= UMBRAL_OTP ? 1.0 : FACTOR_REDUCCION;
              const tipoRuta       = ref.kmVuelta > 50 ? 'suburbana' : 'urbana';
              const tarifaKm       = tipoRuta === 'suburbana' ? TARIFA_KM_SUBURBANO : TARIFA_KM_URBANO;
              const subsidio       = kmMes * tarifaKm * factor;
              const estado: FilaLinea['estado'] =
                otpMap[linea] == null ? 'sin_datos' : factor < 1 ? 'reducido' : 'al_dia';

              return {
                linea,
                agencyId,
                kmMes,
                otpPct,
                factorCumplimiento: factor,
                subsidioEstimado:   subsidio,
                tipoRuta,
                estado,
              };
            });
          });
        }

        setFilas(filasCalculadas);
      } catch (err) {
        console.error('[SubsidiosMTOP] Error cargando datos:', err);
        setFilas([]);
      } finally {
        setCargando(false);
      }
    }

    cargar();
  }, [periodoSel, isSuperAdmin, user?.agencyId]);

  // ─── Métricas derivadas ────────────────────────────────────────────────────

  const empresasFiltro = useMemo(
    () => (isSuperAdmin ? ['todas', ...Object.keys(LINEAS_REFERENCIA)] : [user?.agencyId ?? '70']),
    [isSuperAdmin, user?.agencyId]
  );

  const filasFiltradas = useMemo(() => {
    if (filtroEmpresa === 'todas') return filas;
    return filas.filter((f) => f.agencyId === filtroEmpresa);
  }, [filas, filtroEmpresa]);

  const totalKm         = useMemo(() => filasFiltradas.reduce((s, f) => s + f.kmMes, 0), [filasFiltradas]);
  const totalSubsidio   = useMemo(() => filasFiltradas.reduce((s, f) => s + f.subsidioEstimado, 0), [filasFiltradas]);
  const lineasReducidas = useMemo(() => filasFiltradas.filter((f) => f.estado === 'reducido').length, [filasFiltradas]);

  const agenciaPropia    = user?.agencyId ?? '70';
  const subsidioPropio   = useMemo(
    () => filas.filter((f) => f.agencyId === agenciaPropia).reduce((s, f) => s + f.subsidioEstimado, 0),
    [filas, agenciaPropia]
  );

  // ─── Exportar CSV ─────────────────────────────────────────────────────────

  function exportarCSV() {
    const cabecera = 'Línea,Empresa,Tipo Ruta,Km/Mes,OTP %,Factor Subsidio,Subsidio Estimado (UYU)\n';
    const filas_csv = filasFiltradas
      .map((f) =>
        [
          f.linea,
          EMPRESA_LABEL[f.agencyId] ?? f.agencyId,
          f.tipoRuta === 'suburbana' ? 'Suburbana' : 'Urbana',
          Math.round(f.kmMes),
          f.otpPct.toFixed(1),
          f.factorCumplimiento.toFixed(2),
          Math.round(f.subsidioEstimado),
        ].join(',')
      )
      .join('\n');

    const blob = new Blob([cabecera + filas_csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `subsidios_mtop_${periodoSel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-200 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-blue-400" />
            Subsidios MTOP
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Estimación mensual de subsidios del Ministerio de Transporte y Obras Públicas
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Selector de período */}
          <select
            value={periodoSel}
            onChange={(e) => setPeriodoSel(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
          >
            {mesesOpciones.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Badge fuente de datos */}
          {!cargando && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
              fuenteDatos === 'gtfs'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            }`}>
              {fuenteDatos === 'gtfs' ? 'Datos GTFS' : 'Datos Estimados'}
            </span>
          )}

          {/* Botón exportar */}
          <button
            onClick={exportarCSV}
            disabled={cargando || filasFiltradas.length === 0}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all"
          >
            <Download className="w-4 h-4" />
            Exportar Declaración
          </button>
        </div>
      </div>

      {/* ── Filtro empresa (solo SUPERADMIN) ───────────────────────────────── */}
      {isSuperAdmin && (
        <div className="flex gap-2 flex-wrap">
          {empresasFiltro.map((emp) => (
            <button
              key={emp}
              onClick={() => setFiltroEmpresa(emp)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                filtroEmpresa === emp
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {emp === 'todas' ? 'Todas las empresas' : EMPRESA_LABEL[emp] ?? emp}
            </button>
          ))}
        </div>
      )}

      {/* ── KPIs ────────────────────────────────────────────────────────────── */}
      {cargando ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="text-slate-400 text-sm">Calculando subsidios…</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1 — Total km */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Bus className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500 uppercase tracking-widest">Km Operados</span>
              </div>
              <p className="text-3xl font-black text-white">{fmtKm(totalKm)}</p>
              <p className="text-xs text-slate-400 mt-1">km estimados este mes</p>
            </div>

            {/* KPI 2 — Subsidio total */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500 uppercase tracking-widest">Subsidio Total</span>
              </div>
              <p className="text-3xl font-black text-white">{fmtPeso(totalSubsidio)}</p>
              <p className="text-xs text-slate-400 mt-1">UYU estimados este mes</p>
            </div>

            {/* KPI 3 — Líneas con cumplimiento reducido */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className={`w-4 h-4 ${lineasReducidas > 0 ? 'text-amber-400' : 'text-slate-400'}`} />
                <span className="text-xs text-slate-500 uppercase tracking-widest">Con Reducción</span>
              </div>
              <p className={`text-3xl font-black ${lineasReducidas > 0 ? 'text-amber-400' : 'text-white'}`}>
                {lineasReducidas}
              </p>
              <p className="text-xs text-slate-400 mt-1">líneas con OTP &lt; {UMBRAL_OTP}%</p>
            </div>

            {/* KPI 4 — Subsidio empresa propia */}
            <div className="bg-slate-900 border border-blue-500/20 rounded-xl p-5 ring-1 ring-blue-500/20">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-slate-500 uppercase tracking-widest">
                  {EMPRESA_LABEL[agenciaPropia] ?? agenciaPropia}
                </span>
              </div>
              <p className="text-3xl font-black text-blue-300">{fmtPeso(subsidioPropio)}</p>
              <p className="text-xs text-slate-400 mt-1">subsidio empresa propia</p>
            </div>
          </div>

          {/* ── Tabla por línea ──────────────────────────────────────────────── */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Detalle por Línea</h3>
              <span className="text-xs text-slate-500">{filasFiltradas.length} líneas</span>
            </div>

            {filasFiltradas.length === 0 ? (
              <div className="py-12 text-center">
                <Info className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Sin datos para el período seleccionado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                      <th className="text-left px-5 py-3">Línea</th>
                      {(isSuperAdmin || filtroEmpresa === 'todas') && (
                        <th className="text-left px-5 py-3">Empresa</th>
                      )}
                      <th className="text-left px-5 py-3">Tipo</th>
                      <th className="text-right px-5 py-3">Km / Mes</th>
                      <th className="text-right px-5 py-3">OTP %</th>
                      <th className="text-right px-5 py-3">Factor</th>
                      <th className="text-right px-5 py-3">Subsidio Est.</th>
                      <th className="text-center px-5 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filasFiltradas.map((f) => (
                      <tr
                        key={`${f.agencyId}-${f.linea}`}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-5 py-3 font-mono text-slate-300 font-semibold">
                          {f.linea}
                        </td>

                        {(isSuperAdmin || filtroEmpresa === 'todas') && (
                          <td className="px-5 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${EMPRESA_COLOR[f.agencyId] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                              {EMPRESA_LABEL[f.agencyId] ?? f.agencyId}
                            </span>
                          </td>
                        )}

                        <td className="px-5 py-3 text-slate-400 capitalize">
                          {f.tipoRuta}
                        </td>

                        <td className="px-5 py-3 text-right text-slate-300">
                          {Math.round(f.kmMes).toLocaleString('es-UY')}
                        </td>

                        <td className="px-5 py-3 text-right">
                          <span className={`font-mono ${f.otpPct >= UMBRAL_OTP ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {f.otpPct.toFixed(1)}%
                          </span>
                        </td>

                        <td className="px-5 py-3 text-right">
                          <span className={`font-mono text-xs px-2 py-0.5 rounded-full border ${
                            f.factorCumplimiento >= 1
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                          }`}>
                            {f.factorCumplimiento.toFixed(2)}
                          </span>
                        </td>

                        <td className="px-5 py-3 text-right font-semibold text-white">
                          {fmtPeso(f.subsidioEstimado)}
                        </td>

                        <td className="px-5 py-3 text-center">
                          {f.estado === 'al_dia' && (
                            <span className="flex items-center justify-center gap-1 text-xs text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Al día
                            </span>
                          )}
                          {f.estado === 'reducido' && (
                            <span className="flex items-center justify-center gap-1 text-xs text-amber-400">
                              <AlertTriangle className="w-3.5 h-3.5" /> Reducido
                            </span>
                          )}
                          {f.estado === 'sin_datos' && (
                            <span className="flex items-center justify-center gap-1 text-xs text-slate-500">
                              <Info className="w-3.5 h-3.5" /> Sin datos OTP
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Panel Metodología (expandible) ───────────────────────────────── */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
            <button
              onClick={() => setMetodologiaAbierta((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
            >
              <span className="flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-400" />
                Metodología de Cálculo
              </span>
              {metodologiaAbierta
                ? <ChevronUp className="w-4 h-4 text-slate-400" />
                : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {metodologiaAbierta && (
              <div className="px-5 pb-5 text-sm text-slate-400 space-y-4 border-t border-slate-800">
                <div className="pt-4 space-y-3">
                  <p className="text-slate-300 font-semibold">Cómo se calculan los kilómetros:</p>
                  <p>
                    Se usa la información GTFS del timetable (<code className="text-blue-300 bg-slate-800 px-1 rounded">gtfs_timetable</code>)
                    para obtener la distancia por vuelta de cada línea. Cuando no hay datos GTFS disponibles,
                    se aplican valores de referencia por empresa basados en el promedio histórico del sistema
                    (45–55 km/vuelta, 6–10 vueltas/día).
                  </p>
                  <p>
                    Los kilómetros mensuales se calculan como: <code className="text-blue-300 bg-slate-800 px-1 rounded">km_vuelta × frecuencia_diaria × días_hábiles_del_mes</code>.
                    Para {periodoSel.split('-')[1]}/{periodoSel.split('-')[0]}, los días hábiles son{' '}
                    <strong className="text-slate-200">
                      {diasHabilesEnMes(parseInt(periodoSel.split('-')[0], 10), parseInt(periodoSel.split('-')[1], 10) - 1)}
                    </strong>.
                  </p>

                  <p className="text-slate-300 font-semibold">Factor de cumplimiento OTP:</p>
                  <p>
                    Si el porcentaje de viajes en tiempo (OTP) de una línea es inferior al{' '}
                    <strong className="text-slate-200">{UMBRAL_OTP}%</strong>, el subsidio se reduce en un{' '}
                    <strong className="text-amber-300">{Math.round((1 - FACTOR_REDUCCION) * 100)}%</strong>{' '}
                    (factor {FACTOR_REDUCCION}). El OTP se obtiene de la colección{' '}
                    <code className="text-blue-300 bg-slate-800 px-1 rounded">compliance_alerts</code>.
                    Cuando no hay alerta activa, se aplica un OTP por defecto del 85%.
                  </p>

                  <p className="text-slate-300 font-semibold">Tarifas por tipo de ruta:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Ruta urbana (≤50 km/vuelta): <strong className="text-slate-200">${TARIFA_KM_URBANO} UYU/km</strong></li>
                    <li>Ruta suburbana (&gt;50 km/vuelta): <strong className="text-slate-200">${TARIFA_KM_SUBURBANO} UYU/km</strong></li>
                  </ul>

                  <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <p className="text-amber-300 text-xs font-semibold mb-1">Aviso importante</p>
                    <p className="text-xs">
                      Los valores mostrados son <strong>estimados</strong> con fines de planificación y seguimiento interno.
                      Los montos oficiales de subsidio MTOP requieren integración con el sistema STM Card
                      (validaciones de pasajeros) y la declaración jurada ante el Ministerio.
                      Este módulo no reemplaza la declaración oficial.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
