/**
 * PanelRendicionCuentas.tsx — Informe mensual de gestión para socios
 * ====================================================================
 * Panel de rendición de cuentas para socios de cooperativa (conductores
 * y trabajadores dueños). Lenguaje llano, sin jerga técnica, con
 * comparativa mes anterior y secciones de logros y alertas.
 *
 * Colecciones: vehicles, viajes_activos, incidencias, eventos_desvio,
 *              alertas_regulacion
 */

import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db, authReady } from '../../config/firebase';
import {
  Bus,
  CheckCircle,
  AlertTriangle,
  Bell,
  Wrench,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  MapPin,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface MesData {
  cochesActivos: number;
  cochesTotal: number;
  cochesTaller: number;
  viajesRealizados: number;
  incidenciasTotal: number;
  incidenciasCerradas: number;
  desviosTotal: number;
  desviosResueltos: number;
  comunicacionesConductores: number;
}

interface MesOption {
  label: string;
  value: string; // 'YYYY-MM'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMesOptions(): MesOption[] {
  const options: MesOption[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
    options.push({ label: label.charAt(0).toUpperCase() + label.slice(1), value });
  }
  return options;
}

function mesRangos(mesValue: string): { inicio: Timestamp; fin: Timestamp } {
  const [year, month] = mesValue.split('-').map(Number);
  const inicio = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const fin = new Date(year, month, 0, 23, 59, 59, 999);
  return {
    inicio: Timestamp.fromDate(inicio),
    fin: Timestamp.fromDate(fin),
  };
}

function mesPrevio(mesValue: string): string {
  const [year, month] = mesValue.split('-').map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatearMes(mesValue: string): string {
  const [year, month] = mesValue.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  const label = d.toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ─── Fetching ─────────────────────────────────────────────────────────────────

async function fetchDatosMes(mesValue: string): Promise<MesData> {
  await authReady;
  const { inicio, fin } = mesRangos(mesValue);

  // Flota (no depende de mes — es estado actual, pero filtramos por estado)
  const vehiculosSnap = await getDocs(collection(db, 'vehicles'));
  let cochesActivos = 0;
  let cochesTaller = 0;
  const cochesTotal = vehiculosSnap.size;
  vehiculosSnap.forEach((doc) => {
    const estado = doc.data().estado as string | undefined;
    if (estado === 'activo') cochesActivos++;
    if (estado === 'taller') cochesTaller++;
  });

  // Viajes del mes
  const viajesSnap = await getDocs(
    query(
      collection(db, 'viajes_activos'),
      where('timestamp', '>=', inicio),
      where('timestamp', '<=', fin),
    ),
  );
  const viajesRealizados = viajesSnap.size;

  // Incidencias del mes
  const incidenciasSnap = await getDocs(
    query(
      collection(db, 'incidencias'),
      where('timestamp', '>=', inicio),
      where('timestamp', '<=', fin),
    ),
  );
  let incidenciasCerradas = 0;
  incidenciasSnap.forEach((doc) => {
    const estado = doc.data().estado as string | undefined;
    if (estado === 'cerrada' || estado === 'resuelta' || estado === 'closed') {
      incidenciasCerradas++;
    }
  });

  // Desvíos del mes
  const desviosSnap = await getDocs(
    query(
      collection(db, 'eventos_desvio'),
      where('timestamp', '>=', inicio),
      where('timestamp', '<=', fin),
    ),
  );
  let desviosResueltos = 0;
  desviosSnap.forEach((doc) => {
    if (doc.data().resuelto === true) desviosResueltos++;
  });

  // Alertas / comunicaciones del mes
  const alertasSnap = await getDocs(
    query(
      collection(db, 'alertas_regulacion'),
      where('timestamp', '>=', inicio),
      where('timestamp', '<=', fin),
    ),
  );
  const comunicacionesConductores = alertasSnap.size;

  return {
    cochesActivos,
    cochesTotal,
    cochesTaller,
    viajesRealizados,
    incidenciasTotal: incidenciasSnap.size,
    incidenciasCerradas,
    desviosTotal: desviosSnap.size,
    desviosResueltos,
    comunicacionesConductores,
  };
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

interface CardMetricaProps {
  icono: React.ReactNode;
  numero: string;
  descripcion: string;
  colorIcono?: string;
}

function CardMetrica({ icono, numero, descripcion, colorIcono = 'text-blue-400' }: CardMetricaProps) {
  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-8 flex flex-col gap-3">
      <div className={`${colorIcono} w-10 h-10`}>{icono}</div>
      <div className="text-5xl font-black text-white leading-none">{numero}</div>
      <div className="text-sm text-slate-400 mt-2 leading-relaxed">{descripcion}</div>
    </div>
  );
}

interface FilaComparativaProps {
  indicador: string;
  anterior: number | string;
  actual: number | string;
  mejorEsAlto?: boolean; // true = mayor es mejor; false = menor es mejor
}

function FilaComparativa({ indicador, anterior, actual, mejorEsAlto = true }: FilaComparativaProps) {
  const numAnterior = typeof anterior === 'number' ? anterior : parseFloat(String(anterior));
  const numActual = typeof actual === 'number' ? actual : parseFloat(String(actual));
  const diff = numActual - numAnterior;
  const esMejora = mejorEsAlto ? diff > 0 : diff < 0;
  const esIgual = diff === 0;

  return (
    <tr className="border-b border-slate-800/60">
      <td className="py-3 pr-4 text-slate-300 text-sm">{indicador}</td>
      <td className="py-3 px-4 text-slate-400 text-sm text-right tabular-nums">{anterior}</td>
      <td className="py-3 px-4 text-white text-sm font-semibold text-right tabular-nums">{actual}</td>
      <td className="py-3 pl-4 text-sm text-right">
        {esIgual ? (
          <span className="text-slate-500">Sin cambio</span>
        ) : esMejora ? (
          <span className="text-emerald-400 flex items-center justify-end gap-1">
            <TrendingUp size={14} />
            {diff > 0 ? `+${diff}` : diff}
          </span>
        ) : (
          <span className="text-red-400 flex items-center justify-end gap-1">
            <TrendingDown size={14} />
            {diff > 0 ? `+${diff}` : diff}
          </span>
        )}
      </td>
    </tr>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PanelRendicionCuentas() {
  const mesesDisponibles = getMesOptions();
  const [mesSeleccionado, setMesSeleccionado] = useState(mesesDisponibles[0].value);
  const [datos, setDatos] = useState<MesData | null>(null);
  const [datosAnt, setDatosAnt] = useState<MesData | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [glosarioAbierto, setGlosarioAbierto] = useState(false);

  const cargarDatos = useCallback(async (mes: string) => {
    setCargando(true);
    setError(null);
    try {
      const [actual, anterior] = await Promise.all([
        fetchDatosMes(mes),
        fetchDatosMes(mesPrevio(mes)),
      ]);
      setDatos(actual);
      setDatosAnt(anterior);
    } catch (err) {
      console.error('[RendicionCuentas] Error al cargar datos:', err);
      setError('No se pudieron cargar los datos del mes. Verificá tu conexión e intentá de nuevo.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos(mesSeleccionado);
  }, [mesSeleccionado, cargarDatos]);

  // ── Calcular logros y alertas ──
  const logros: string[] = [];
  const alertas: string[] = [];

  if (datos) {
    const pctDesviosResueltos = datos.desviosTotal > 0
      ? (datos.desviosResueltos / datos.desviosTotal) * 100
      : 100;
    const pctFlotaActiva = datos.cochesTotal > 0
      ? (datos.cochesActivos / datos.cochesTotal) * 100
      : 0;
    const pctIncidenciasResueltas = datos.incidenciasTotal > 0
      ? (datos.incidenciasCerradas / datos.incidenciasTotal) * 100
      : 100;
    const pctTaller = datos.cochesTotal > 0
      ? (datos.cochesTaller / datos.cochesTotal) * 100
      : 0;

    // Logros
    if (pctDesviosResueltos >= 80 && datos.desviosTotal > 0) {
      logros.push(
        `Buena respuesta a desvíos: ${datos.desviosResueltos} de cada ${datos.desviosTotal} desvíos registrados fueron atendidos por el equipo de despacho.`,
      );
    }
    if (pctFlotaActiva >= 90 && datos.cochesTotal > 0) {
      logros.push(
        `Flota en buen estado: el ${Math.round(pctFlotaActiva)}% de los coches estuvo disponible para operar durante el mes.`,
      );
    }
    if (pctIncidenciasResueltas >= 70 && datos.incidenciasTotal > 0) {
      logros.push(
        `Gestión de incidencias: la mayoría de los problemas reportados (${datos.incidenciasCerradas} de ${datos.incidenciasTotal}) fueron resueltos durante el mes.`,
      );
    }

    // Alertas
    const desviosSinResolver = datos.desviosTotal - datos.desviosResueltos;
    if (datos.desviosTotal > 0 && pctDesviosResueltos < 80) {
      alertas.push(
        `${desviosSinResolver} desvíos de ruta quedaron sin resolver este mes. Esto puede indicar dificultades en la gestión de la circulación.`,
      );
    }
    if (datos.incidenciasTotal - datos.incidenciasCerradas > 5) {
      alertas.push(
        `Hay ${datos.incidenciasTotal - datos.incidenciasCerradas} incidencias abiertas sin resolver. Se recomienda revisar con el equipo de operaciones.`,
      );
    }
    if (pctTaller > 15 && datos.cochesTotal > 0) {
      alertas.push(
        `El ${Math.round(pctTaller)}% de los coches estuvo en taller este mes. Esto está por encima del promedio recomendado (15%).`,
      );
    }
  }

  const hayDatos = datos !== null && !cargando;
  const sinDatos =
    hayDatos &&
    datos.viajesRealizados === 0 &&
    datos.incidenciasTotal === 0 &&
    datos.desviosTotal === 0 &&
    datos.comunicacionesConductores === 0;

  const fechaActualizacion = new Date().toLocaleDateString('es-UY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="bg-slate-950 min-h-screen p-6 md:p-10">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-blue-700/8 rounded-full blur-[160px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-orange-500/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-5xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <FileText className="text-blue-400" size={28} />
              <h1 className="text-2xl font-bold text-slate-200">
                Informe Mensual de Gestión
              </h1>
            </div>
            <p className="text-sm text-slate-400 ml-[44px]">
              Resumen para socios —{' '}
              <span className="text-slate-300 font-medium">
                {formatearMes(mesSeleccionado)}
              </span>
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            {/* Selector de mes */}
            <select
              value={mesSeleccionado}
              onChange={(e) => setMesSeleccionado(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none text-sm cursor-pointer"
            >
              {mesesDisponibles.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            {/* Badge de actualización */}
            <span className="text-xs text-slate-500 bg-slate-800/50 border border-slate-700/40 rounded-full px-3 py-1">
              Datos actualizados al {fechaActualizacion}
            </span>
          </div>
        </div>

        {/* ── Estado de carga ── */}
        {cargando && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
            <Loader2 className="animate-spin" size={40} />
            <p className="text-sm">Cargando datos del mes…</p>
          </div>
        )}

        {/* ── Error ── */}
        {error && !cargando && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 flex items-start gap-3">
            <AlertTriangle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-red-300 font-semibold text-sm">Error al cargar datos</p>
              <p className="text-red-400/80 text-sm mt-1">{error}</p>
              <button
                onClick={() => cargarDatos(mesSeleccionado)}
                className="mt-3 text-xs text-red-300 underline underline-offset-2 hover:text-red-200"
              >
                Intentar de nuevo
              </button>
            </div>
          </div>
        )}

        {/* ── Sin datos del mes ── */}
        {!cargando && !error && sinDatos && (
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-12 text-center">
            <FileText className="mx-auto text-slate-600 mb-4" size={48} />
            <p className="text-slate-400 text-base">
              No hay datos registrados para {formatearMes(mesSeleccionado)}.
            </p>
            <p className="text-slate-500 text-sm mt-2">
              Es posible que el sistema aún no haya registrado actividad para ese período.
            </p>
          </div>
        )}

        {/* ── Contenido principal ── */}
        {hayDatos && !sinDatos && datos && (
          <>
            {/* ══ SECCIÓN 1: El mes en números ══ */}
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-bold text-slate-200">El mes en números</h2>
                <p className="text-xs text-slate-500 mt-0.5 uppercase tracking-widest">
                  Resumen general — {formatearMes(mesSeleccionado)}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <CardMetrica
                  icono={<Bus size={36} />}
                  colorIcono="text-blue-400"
                  numero={String(datos.cochesActivos)}
                  descripcion={`De un total de ${datos.cochesTotal} coches de la flota, ${datos.cochesActivos} estuvieron activos este mes.`}
                />
                <CardMetrica
                  icono={<CheckCircle size={36} />}
                  colorIcono="text-emerald-400"
                  numero={datos.viajesRealizados.toLocaleString('es-UY')}
                  descripcion={`Se contabilizaron ${datos.viajesRealizados.toLocaleString('es-UY')} viajes activos registrados en el sistema este mes.`}
                />
                <CardMetrica
                  icono={<AlertTriangle size={36} />}
                  colorIcono="text-amber-400"
                  numero={`${datos.incidenciasCerradas}/${datos.incidenciasTotal}`}
                  descripcion={`${datos.incidenciasCerradas} de ${datos.incidenciasTotal} incidencias del mes fueron cerradas y resueltas.`}
                />
                <CardMetrica
                  icono={<MapPin size={36} />}
                  colorIcono="text-orange-400"
                  numero={String(datos.desviosTotal)}
                  descripcion={`Se detectaron ${datos.desviosTotal} desvíos de ruta. ${datos.desviosResueltos} fueron resueltos por los despachadores.`}
                />
                <CardMetrica
                  icono={<Bell size={36} />}
                  colorIcono="text-purple-400"
                  numero={String(datos.comunicacionesConductores)}
                  descripcion={`Los despachadores enviaron ${datos.comunicacionesConductores} notificaciones a conductores durante el mes.`}
                />
                <CardMetrica
                  icono={<Wrench size={36} />}
                  colorIcono="text-slate-400"
                  numero={String(datos.cochesTaller)}
                  descripcion={`${datos.cochesTaller} coches estuvieron en mantenimiento o taller durante este mes.`}
                />
              </div>
            </section>

            {/* ══ SECCIÓN 2: Comparativa mes anterior ══ */}
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-bold text-slate-200">¿Cómo estamos comparado con el mes anterior?</h2>
                <p className="text-xs text-slate-500 mt-0.5 uppercase tracking-widest">
                  {formatearMes(mesPrevio(mesSeleccionado))} → {formatearMes(mesSeleccionado)}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 overflow-x-auto">
                {datosAnt === null ||
                (datosAnt.viajesRealizados === 0 &&
                  datosAnt.incidenciasTotal === 0 &&
                  datosAnt.desviosTotal === 0) ? (
                  <p className="text-slate-500 text-sm text-center py-4">
                    Primer mes de registro — sin datos previos para comparar.
                  </p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left text-xs text-slate-500 uppercase tracking-widest pb-2 pr-4">
                          Indicador
                        </th>
                        <th className="text-right text-xs text-slate-500 uppercase tracking-widest pb-2 px-4">
                          Mes anterior
                        </th>
                        <th className="text-right text-xs text-slate-500 uppercase tracking-widest pb-2 px-4">
                          Este mes
                        </th>
                        <th className="text-right text-xs text-slate-500 uppercase tracking-widest pb-2 pl-4">
                          Cambio
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <FilaComparativa
                        indicador="Coches en operación"
                        anterior={datosAnt.cochesActivos}
                        actual={datos.cochesActivos}
                        mejorEsAlto
                      />
                      <FilaComparativa
                        indicador="Viajes registrados"
                        anterior={datosAnt.viajesRealizados}
                        actual={datos.viajesRealizados}
                        mejorEsAlto
                      />
                      <FilaComparativa
                        indicador="Incidencias resueltas"
                        anterior={datosAnt.incidenciasCerradas}
                        actual={datos.incidenciasCerradas}
                        mejorEsAlto
                      />
                      <FilaComparativa
                        indicador="Desvíos resueltos"
                        anterior={datosAnt.desviosResueltos}
                        actual={datos.desviosResueltos}
                        mejorEsAlto
                      />
                      <FilaComparativa
                        indicador="Comunicaciones enviadas"
                        anterior={datosAnt.comunicacionesConductores}
                        actual={datos.comunicacionesConductores}
                        mejorEsAlto
                      />
                      <FilaComparativa
                        indicador="Coches en taller"
                        anterior={datosAnt.cochesTaller}
                        actual={datos.cochesTaller}
                        mejorEsAlto={false}
                      />
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* ══ SECCIÓN 3: Lo que salió bien ══ */}
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-bold text-slate-200">Lo que salió bien este mes</h2>
              </div>

              <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-6">
                {logros.length === 0 ? (
                  <p className="text-slate-500 text-sm">
                    Aún no hay suficientes datos históricos para generar este resumen.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {logros.slice(0, 3).map((logro, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <CheckCircle
                          className="text-emerald-400 flex-shrink-0 mt-0.5"
                          size={18}
                        />
                        <span className="text-slate-300 text-sm leading-relaxed">{logro}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* ══ SECCIÓN 4: Temas que merecen atención ══ */}
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-bold text-slate-200">Temas que merecen atención</h2>
              </div>

              <div className="bg-amber-950/20 border border-amber-900/30 rounded-xl p-6">
                {alertas.length === 0 ? (
                  <div className="flex items-start gap-3">
                    <CheckCircle className="text-emerald-400 flex-shrink-0 mt-0.5" size={18} />
                    <span className="text-slate-300 text-sm leading-relaxed">
                      No se identificaron temas críticos este mes. La gestión está dentro de parámetros normales.
                    </span>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {alertas.slice(0, 3).map((alerta, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <AlertTriangle
                          className="text-amber-400 flex-shrink-0 mt-0.5"
                          size={18}
                        />
                        <span className="text-slate-300 text-sm leading-relaxed">{alerta}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* ══ SECCIÓN 5: Glosario ══ */}
            <section>
              <button
                onClick={() => setGlosarioAbierto((v) => !v)}
                className="w-full flex items-center justify-between bg-slate-900 border border-slate-700/50 rounded-xl px-6 py-4 text-left hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="text-slate-500" size={18} />
                  <span className="text-slate-300 text-sm font-semibold">
                    Glosario — ¿Qué significa cada término?
                  </span>
                </div>
                {glosarioAbierto ? (
                  <ChevronUp className="text-slate-500" size={18} />
                ) : (
                  <ChevronDown className="text-slate-500" size={18} />
                )}
              </button>

              {glosarioAbierto && (
                <div className="bg-slate-900/60 border border-slate-700/30 border-t-0 rounded-b-xl px-6 py-5">
                  <dl className="space-y-4">
                    {[
                      {
                        term: 'Viaje activo',
                        def: 'Un coche salió a hacer su recorrido y fue registrado por el sistema de control. Cada salida cuenta como un viaje.',
                      },
                      {
                        term: 'Desvío de ruta',
                        def: 'El sistema detectó que un coche se alejó de su recorrido habitual. Puede ser por tráfico, obras o una decisión del conductor.',
                      },
                      {
                        term: 'Incidencia',
                        def: 'Un problema reportado en la operación. Puede ser una avería, un accidente, una queja o cualquier situación que requiere atención.',
                      },
                      {
                        term: 'Despacho',
                        def: 'El sistema y el equipo que controla la salida y el movimiento de los coches. Son quienes resuelven los desvíos y comunican con los conductores.',
                      },
                      {
                        term: 'Notificación a conductores',
                        def: 'Un mensaje enviado por el sistema de despacho a uno o varios conductores. Puede ser una alerta, un cambio de ruta o una instrucción.',
                      },
                      {
                        term: 'Coches en taller',
                        def: 'Coches fuera de servicio por mantenimiento preventivo o reparaciones. Un nivel normal es hasta el 15% de la flota.',
                      },
                    ].map(({ term, def }) => (
                      <div key={term}>
                        <dt className="text-sm font-semibold text-slate-200">{term}</dt>
                        <dd className="text-sm text-slate-400 mt-0.5 leading-relaxed">{def}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </section>

            {/* ══ Botón exportar PDF (próximamente) ══ */}
            <div className="flex justify-end pb-4">
              <button
                disabled
                title="Esta función estará disponible próximamente"
                className="flex items-center gap-2 bg-slate-800 border border-slate-700/50 text-slate-500 rounded-xl px-5 py-2.5 text-sm font-semibold cursor-not-allowed opacity-60"
              >
                <FileText size={16} />
                Exportar PDF (próximamente)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
