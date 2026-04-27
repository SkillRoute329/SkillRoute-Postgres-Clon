/**
 * DiagnosticoCumplimiento.tsx
 *
 * Módulo de diagnóstico automático: ¿el incumplimiento de servicio es
 * problema de la línea (diseño/etapas) o del coche/conductor?
 *
 * Algoritmo: si ≥70% de los coches de una línea están fuera de parámetro
 * → problema estructural de línea → acción: IMM/cartón.
 * Si <30% → problema de coche/conductor → acción: RRHH.
 * Entre 30-70% → patrón mixto.
 *
 * Fuente de datos: autoStatsService (fetchComplianceRealtime, fetchVehicleHistory)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  fetchComplianceRealtime,
  fetchVehicleHistory,
  type ComplianceResponse,
  type BusComplianceResult,
  type RouteSummary,
  type VehicleSummary,
} from '../../services/autoStatsService';
import {
  Bus,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  BarChart3,
  Activity,
  Users,
  Zap,
} from 'lucide-react';

/* ─── Constantes ──────────────────────────────────────── */

const AGENCIAS = [
  { id: '70', nombre: 'UCOT' },
  { id: '50', nombre: 'CUTCSA' },
  { id: '20', nombre: 'COME' },
  { id: '10', nombre: 'COETC' },
] as const;

const AUTO_REFRESH_MS = 120_000;

/* ─── Tipos de diagnóstico ────────────────────────────── */

type TipoDiagnosis = 'OK' | 'LINEA' | 'COCHE' | 'MIXTO' | 'SIN_DATOS';

interface Diagnosis {
  tipo: TipoDiagnosis;
  mensaje: string;
  cochesProblema: string[];
  accionSugerida: string;
}

/* ─── Algoritmo de diagnóstico ────────────────────────── */

function diagnosticarLinea(buses: BusComplianceResult[]): Diagnosis {
  const conDatos = buses.filter(
    (b) => b.desviacionMin !== null && b.estadoCumplimiento !== 'FUERA_DE_SERVICIO'
  );

  if (conDatos.length === 0) {
    return {
      tipo: 'SIN_DATOS',
      mensaje: 'Sin datos GPS suficientes',
      cochesProblema: [],
      accionSugerida: '—',
    };
  }

  // Problemático: > +5 min atrasado O < -3 min adelantado
  const problematicos = conDatos.filter(
    (b) => (b.desviacionMin ?? 0) > 5 || (b.desviacionMin ?? 0) < -3
  );
  const pct = problematicos.length / conDatos.length;

  if (pct >= 0.7) {
    return {
      tipo: 'LINEA',
      mensaje: 'Problema estructural — todos los coches afectados',
      cochesProblema: problematicos.map((b) => b.idBus),
      accionSugerida: 'Revisar etapas con IMM / ajustar tiempo de cartón',
    };
  }
  if (pct >= 0.3) {
    return {
      tipo: 'MIXTO',
      mensaje: 'Patrón mixto — línea y conductores específicos',
      cochesProblema: problematicos.map((b) => b.idBus),
      accionSugerida: 'Investigar tramos congestionados y conductores marcados',
    };
  }
  if (problematicos.length > 0) {
    return {
      tipo: 'COCHE',
      mensaje: `Problema de coche/conductor específico (${problematicos.length} de ${conDatos.length})`,
      cochesProblema: problematicos.map((b) => b.idBus),
      accionSugerida: 'Revisar con RRHH — los demás coches de la línea cumplen',
    };
  }

  return {
    tipo: 'OK',
    mensaje: 'Servicio dentro de parámetros normales',
    cochesProblema: [],
    accionSugerida: '—',
  };
}

/* ─── Helpers visuales ────────────────────────────────── */

function badgeDiagnosis(tipo: TipoDiagnosis) {
  switch (tipo) {
    case 'OK':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400">
          Normal
        </span>
      );
    case 'LINEA':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/10 text-red-400">
          Problema de línea
        </span>
      );
    case 'COCHE':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-500/10 text-orange-400">
          Problema de coche
        </span>
      );
    case 'MIXTO':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-500/10 text-yellow-400">
          Mixto
        </span>
      );
    case 'SIN_DATOS':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-700 text-slate-400">
          Sin datos
        </span>
      );
  }
}

function badgeEstado(estado: BusComplianceResult['estadoCumplimiento']) {
  switch (estado) {
    case 'EN_TIEMPO':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400">
          En tiempo
        </span>
      );
    case 'ATRASADO':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/10 text-red-400">
          Atrasado
        </span>
      );
    case 'ADELANTADO':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-500/10 text-orange-400">
          Adelantado
        </span>
      );
    case 'SIN_HORARIO':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-700 text-slate-400">
          Sin horario
        </span>
      );
    case 'FUERA_DE_SERVICIO':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-800 text-slate-500">
          Fuera de servicio
        </span>
      );
  }
}

function desviacionLabel(desv: number | null): React.ReactNode {
  if (desv === null) return <span className="text-slate-500">—</span>;
  if (desv > 5) {
    return (
      <span className="text-red-400 font-semibold flex items-center gap-1">
        <TrendingDown className="w-3 h-3" />+{desv.toFixed(1)} min
      </span>
    );
  }
  if (desv < -3) {
    return (
      <span className="text-orange-400 font-semibold flex items-center gap-1">
        <TrendingUp className="w-3 h-3" />{desv.toFixed(1)} min
      </span>
    );
  }
  return (
    <span className="text-emerald-400 font-semibold flex items-center gap-1">
      <CheckCircle className="w-3 h-3" />
      {desv >= 0 ? `+${desv.toFixed(1)}` : desv.toFixed(1)} min
    </span>
  );
}

function diagnosisCardColor(tipo: TipoDiagnosis): string {
  switch (tipo) {
    case 'OK':     return 'border-emerald-500/40 bg-emerald-500/5';
    case 'LINEA':  return 'border-red-500/40 bg-red-500/5';
    case 'COCHE':  return 'border-orange-500/40 bg-orange-500/5';
    case 'MIXTO':  return 'border-yellow-500/40 bg-yellow-500/5';
    default:       return 'border-slate-700 bg-slate-800/30';
  }
}

function diagnosisTextColor(tipo: TipoDiagnosis): string {
  switch (tipo) {
    case 'OK':     return 'text-emerald-400';
    case 'LINEA':  return 'text-red-400';
    case 'COCHE':  return 'text-orange-400';
    case 'MIXTO':  return 'text-yellow-400';
    default:       return 'text-slate-400';
  }
}

function tiempoActualizado(timestamp: string): string {
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000);
  if (diff < 1) return 'hace menos de 1 min';
  if (diff === 1) return 'hace 1 min';
  return `hace ${diff} min`;
}

/* ─── Sub-componente: Panel historial de coche ─────────── */

interface PanelHistorialProps {
  idBus: string;
  onCerrar: () => void;
}

function PanelHistorial({ idBus, onCerrar }: PanelHistorialProps) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<VehicleSummary | null>(null);
  const [lineasInfo, setLineasInfo] = useState<Array<{
    linea: string;
    pctEnTiempo: number;
    eventos: number;
  }>>([]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);

    fetchVehicleHistory(idBus, 7)
      .then((resp) => {
        if (cancelado) return;
        setSummary(resp.summary);

        // Agrupar historial por línea para % de cumplimiento
        const mapaLineas: Record<string, { total: number; enTiempo: number }> = {};
        for (const ev of resp.history) {
          if (!mapaLineas[ev.linea]) mapaLineas[ev.linea] = { total: 0, enTiempo: 0 };
          mapaLineas[ev.linea].total++;
          if (ev.estadoCumplimiento === 'EN_TIEMPO') mapaLineas[ev.linea].enTiempo++;
        }
        const lineas = Object.entries(mapaLineas).map(([linea, d]) => ({
          linea,
          pctEnTiempo: d.total > 0 ? Math.round((d.enTiempo / d.total) * 100) : 0,
          eventos: d.total,
        }));
        lineas.sort((a, b) => b.eventos - a.eventos);
        setLineasInfo(lineas);
        setCargando(false);
      })
      .catch(() => {
        if (!cancelado) {
          setError('No se pudo cargar el historial del coche.');
          setCargando(false);
        }
      });

    return () => { cancelado = true; };
  }, [idBus]);

  const conclusion = () => {
    if (!summary) return null;
    const { pctEnTiempo, desviacionMediaMin, lineasOperadas } = summary;
    const nLineas = lineasOperadas?.length ?? lineasInfo.length;
    const base = `Este coche tiene ${Math.round(pctEnTiempo)}% de cumplimiento en los últimos 7 días en ${nLineas} línea${nLineas !== 1 ? 's' : ''}.`;

    if (desviacionMediaMin !== null && desviacionMediaMin > 5) {
      return (
        <>
          <p className="text-slate-300 text-sm">{base}</p>
          <p className="text-red-400 text-sm font-semibold mt-1 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            Patrón de atraso crónico — revisar con RRHH
          </p>
        </>
      );
    }
    if (desviacionMediaMin !== null && desviacionMediaMin < -3) {
      return (
        <>
          <p className="text-slate-300 text-sm">{base}</p>
          <p className="text-orange-400 text-sm font-semibold mt-1 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            Patrón de adelanto crónico — posible incumplimiento de etapas
          </p>
        </>
      );
    }
    return <p className="text-slate-300 text-sm">{base}</p>;
  };

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 mt-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-200">
          Historial — Coche <span className="text-blue-400">{idBus}</span>
          <span className="text-slate-500 font-normal ml-2">(últimos 7 días)</span>
        </h3>
        <button
          onClick={onCerrar}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Cerrar ✕
        </button>
      </div>

      {cargando && (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Cargando historial…
        </div>
      )}

      {error && !cargando && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {!cargando && !error && summary && (
        <>
          {/* Cards resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">En tiempo</p>
              <p className="text-2xl font-black text-emerald-400">{Math.round(summary.pctEnTiempo)}%</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Atrasado</p>
              <p className="text-2xl font-black text-red-400">{Math.round(summary.pctAtrasado)}%</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Adelantado</p>
              <p className="text-2xl font-black text-orange-400">{Math.round(summary.pctAdelantado)}%</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Desv. media</p>
              <p className={`text-2xl font-black ${
                summary.desviacionMediaMin === null ? 'text-slate-400' :
                summary.desviacionMediaMin > 2 ? 'text-red-400' :
                summary.desviacionMediaMin < -2 ? 'text-orange-400' : 'text-emerald-400'
              }`}>
                {summary.desviacionMediaMin !== null
                  ? `${summary.desviacionMediaMin > 0 ? '+' : ''}${summary.desviacionMediaMin.toFixed(1)} min`
                  : '—'}
              </p>
            </div>
          </div>

          {/* Líneas operadas */}
          {lineasInfo.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Líneas operadas</p>
              <div className="space-y-1.5">
                {lineasInfo.map((l) => (
                  <div key={l.linea} className="flex items-center gap-3">
                    <span className="text-sm text-slate-300 w-16 shrink-0">Línea {l.linea}</span>
                    <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all"
                        style={{ width: `${l.pctEnTiempo}%` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold w-10 text-right ${
                      l.pctEnTiempo >= 80 ? 'text-emerald-400' :
                      l.pctEnTiempo >= 60 ? 'text-yellow-400' : 'text-red-400'
                    }`}>{l.pctEnTiempo}%</span>
                    <span className="text-xs text-slate-500 w-20 text-right">{l.eventos} registros</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conclusión automática */}
          <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/40">
            {conclusion()}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Sub-componente: Panel detalle de línea ───────────── */

interface LineaConDiagnosis {
  summary: RouteSummary;
  buses: BusComplianceResult[];
  diagnosis: Diagnosis;
}

interface PanelDetalleLineaProps {
  linea: LineaConDiagnosis;
  onCerrar: () => void;
}

function PanelDetalleLinea({ linea, onCerrar }: PanelDetalleLineaProps) {
  const [cocheHistorial, setCocheHistorial] = useState<string | null>(null);
  const { summary, buses, diagnosis } = linea;

  // Ordenar por desviación (más atrasados primero, luego adelantados, luego en tiempo)
  const busesOrdenados = [...buses].sort((a, b) => {
    const da = a.desviacionMin ?? 0;
    const db2 = b.desviacionMin ?? 0;
    return db2 - da;
  });

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 mt-3">
      {/* Header del detalle */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-200">
            Línea <span className="text-blue-400">{summary.linea}</span>
            <span className="text-slate-400 font-normal ml-2">— {summary.busesActivos} coches operando</span>
          </h3>
        </div>
        <button
          onClick={onCerrar}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors shrink-0 mt-0.5"
        >
          Cerrar ✕
        </button>
      </div>

      {/* Card de diagnóstico destacado */}
      <div className={`border rounded-xl p-4 mb-5 ${diagnosisCardColor(diagnosis.tipo)}`}>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${diagnosisTextColor(diagnosis.tipo)}`}>
            {diagnosis.tipo === 'OK' ? (
              <CheckCircle className="w-5 h-5" />
            ) : diagnosis.tipo === 'SIN_DATOS' ? (
              <Clock className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${diagnosisTextColor(diagnosis.tipo)}`}>
              {diagnosis.mensaje}
            </p>
            {diagnosis.accionSugerida !== '—' && (
              <p className="text-xs text-slate-400 mt-1">
                <span className="font-semibold text-slate-300">Acción sugerida:</span>{' '}
                {diagnosis.accionSugerida}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tabla de coches */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase tracking-widest font-medium">
                Coche
              </th>
              <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase tracking-widest font-medium">
                Empresa
              </th>
              <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase tracking-widest font-medium">
                Estado
              </th>
              <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase tracking-widest font-medium">
                Desviación
              </th>
              <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase tracking-widest font-medium">
                Velocidad
              </th>
              <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase tracking-widest font-medium">
                Próx. parada
              </th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {busesOrdenados.map((bus) => {
              const esProblema = diagnosis.cochesProblema.includes(bus.idBus);
              return (
                <tr
                  key={bus.idBus}
                  className={`border-b border-slate-800/50 ${
                    esProblema
                      ? diagnosis.tipo === 'COCHE' || diagnosis.tipo === 'MIXTO'
                        ? 'bg-orange-500/5'
                        : 'bg-red-500/5'
                      : ''
                  }`}
                >
                  <td className="py-2.5 px-3">
                    <span className={`font-semibold ${esProblema ? 'text-orange-300' : 'text-slate-200'}`}>
                      {bus.idBus}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 text-xs">{bus.empresa}</td>
                  <td className="py-2.5 px-3">{badgeEstado(bus.estadoCumplimiento)}</td>
                  <td className="py-2.5 px-3">{desviacionLabel(bus.desviacionMin)}</td>
                  <td className="py-2.5 px-3 text-slate-400 text-xs">
                    {bus.velocidad > 0 ? `${Math.round(bus.velocidad)} km/h` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 text-xs">
                    {bus.proximaParadaControl?.name ?? '—'}
                    {bus.distanciaParadaKm !== null && (
                      <span className="text-slate-600 ml-1">
                        ({bus.distanciaParadaKm.toFixed(1)} km)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <button
                      onClick={() => setCocheHistorial(cocheHistorial === bus.idBus ? null : bus.idBus)}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap"
                    >
                      {cocheHistorial === bus.idBus ? 'Ocultar' : 'Ver historial'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Panel historial del coche seleccionado */}
      {cocheHistorial && (
        <PanelHistorial
          idBus={cocheHistorial}
          onCerrar={() => setCocheHistorial(null)}
        />
      )}
    </div>
  );
}

/* ─── Componente principal ────────────────────────────── */

export default function DiagnosticoCumplimiento() {
  const [agenciaId, setAgenciaId] = useState<string>('70');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<ComplianceResponse | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);
  const [lineaSeleccionada, setLineaSeleccionada] = useState<string | null>(null);

  /* ─── Fetch de datos ─────────────────────── */

  const cargarDatos = useCallback(async (agId: string) => {
    setCargando(true);
    setError(null);
    setLineaSeleccionada(null);

    try {
      const resp = await fetchComplianceRealtime(agId);
      setDatos(resp);
      setUltimaActualizacion(new Date().toISOString());
    } catch {
      setError('Los datos en tiempo real no están disponibles. Verificar conexión con el backend.');
    } finally {
      setCargando(false);
    }
  }, []);

  // Carga inicial y auto-refresh
  useEffect(() => {
    cargarDatos(agenciaId);
    const intervalo = setInterval(() => cargarDatos(agenciaId), AUTO_REFRESH_MS);
    return () => clearInterval(intervalo);
  }, [agenciaId, cargarDatos]);

  /* ─── Derivar datos para la UI ───────────── */

  const lineasConDiagnosis: LineaConDiagnosis[] = datos
    ? Object.values(datos.summary).map((summary) => {
        const buses = datos.buses.filter((b) => b.linea === summary.linea);
        const diagnosis = diagnosticarLinea(buses);
        return { summary, buses, diagnosis };
      })
    : [];

  // Ordenar por pctCumplimiento ascendente (las más problemáticas primero)
  lineasConDiagnosis.sort((a, b) => a.summary.pctCumplimiento - b.summary.pctCumplimiento);

  // KPI globales
  const totalCoches = datos?.totalBuses ?? 0;

  const pctGlobalEnTiempo =
    lineasConDiagnosis.length > 0
      ? Math.round(
          lineasConDiagnosis.reduce((acc, l) => acc + l.summary.pctCumplimiento, 0) /
            lineasConDiagnosis.length
        )
      : 0;

  const lineasConProblema = lineasConDiagnosis.filter(
    (l) => l.diagnosis.tipo === 'LINEA' || l.diagnosis.tipo === 'COCHE'
  ).length;

  const cochesProblema = [
    ...new Set(lineasConDiagnosis.flatMap((l) => l.diagnosis.cochesProblema)),
  ].length;

  const lineaDetalle = datos
    ? lineasConDiagnosis.find((l) => l.summary.linea === lineaSeleccionada) ?? null
    : null;

  /* ─── Render ─────────────────────────────── */

  return (
    <div className="bg-slate-950 min-h-screen p-6">
      {/* Ambient glow */}
      <div className="fixed top-0 left-1/3 w-96 h-96 bg-blue-700/8 rounded-full blur-[160px] pointer-events-none" />

      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-200">
              Diagnóstico de Cumplimiento de Servicio
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Análisis automático: ¿problema de línea o de conductor?
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-2 shrink-0">
            {/* Tabs de empresa */}
            <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1 border border-slate-700/50">
              {AGENCIAS.map((ag) => (
                <button
                  key={ag.id}
                  onClick={() => setAgenciaId(ag.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    agenciaId === ag.id
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {ag.nombre}
                </button>
              ))}
            </div>

            {/* Badge actualización + botón */}
            <div className="flex items-center gap-2">
              {ultimaActualizacion && (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Actualizado {tiempoActualizado(ultimaActualizacion)}
                </span>
              )}
              <button
                onClick={() => cargarDatos(agenciaId)}
                disabled={cargando}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Estado de error ── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-300 text-sm">{error}</p>
            <button
              onClick={() => cargarDatos(agenciaId)}
              className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
            >
              Intentar de nuevo
            </button>
          </div>
        </div>
      )}

      {/* ── Estado de carga inicial ── */}
      {cargando && !datos && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-slate-400 text-sm">Cargando datos de cumplimiento…</p>
        </div>
      )}

      {!cargando || datos ? (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <Bus className="w-4 h-4 text-blue-400" />
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-widest">Coches en servicio</p>
              </div>
              <p className="text-3xl font-black text-white">{totalCoches}</p>
            </div>

            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-widest">En tiempo</p>
              </div>
              <p className={`text-3xl font-black ${
                pctGlobalEnTiempo >= 80 ? 'text-emerald-400' :
                pctGlobalEnTiempo >= 60 ? 'text-yellow-400' : 'text-red-400'
              }`}>{pctGlobalEnTiempo}%</p>
            </div>

            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-red-400" />
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-widest">Líneas con problema</p>
              </div>
              <p className={`text-3xl font-black ${lineasConProblema > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                {lineasConProblema}
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center">
                  <Users className="w-4 h-4 text-orange-400" />
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-widest">Coches problemáticos</p>
              </div>
              <p className={`text-3xl font-black ${cochesProblema > 0 ? 'text-orange-400' : 'text-slate-400'}`}>
                {cochesProblema}
              </p>
            </div>
          </div>

          {/* ── Panel 1: Tabla de líneas ── */}
          {datos && lineasConDiagnosis.length > 0 && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden mb-4">
              <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-bold text-slate-200">Estado por línea</h2>
                <span className="text-xs text-slate-500 ml-1">
                  — {lineasConDiagnosis.length} líneas activas
                </span>
                <Zap className="w-3.5 h-3.5 text-yellow-400 ml-auto" />
                <span className="text-xs text-slate-500">Ordenado por prioridad de atención</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-800/50">
                      <th className="text-left py-3 px-5 text-xs text-slate-400 uppercase tracking-widest font-medium">
                        Línea
                      </th>
                      <th className="text-center py-3 px-4 text-xs text-slate-400 uppercase tracking-widest font-medium">
                        <span className="flex items-center justify-center gap-1">
                          <Bus className="w-3 h-3" /> Buses
                        </span>
                      </th>
                      <th className="text-left py-3 px-4 text-xs text-slate-400 uppercase tracking-widest font-medium">
                        En tiempo
                      </th>
                      <th className="text-center py-3 px-4 text-xs text-slate-400 uppercase tracking-widest font-medium">
                        Atrasados
                      </th>
                      <th className="text-center py-3 px-4 text-xs text-slate-400 uppercase tracking-widest font-medium">
                        Adelantados
                      </th>
                      <th className="text-left py-3 px-4 text-xs text-slate-400 uppercase tracking-widest font-medium">
                        Diagnóstico
                      </th>
                      <th className="py-3 px-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineasConDiagnosis.map((item) => {
                      const { summary, diagnosis } = item;
                      const seleccionada = lineaSeleccionada === summary.linea;

                      return (
                        <tr
                          key={summary.linea}
                          onClick={() =>
                            setLineaSeleccionada(seleccionada ? null : summary.linea)
                          }
                          className={`border-b border-slate-800/50 cursor-pointer transition-colors ${
                            seleccionada
                              ? 'bg-blue-900/20 border-l-2 border-l-blue-500'
                              : 'hover:bg-slate-800/40'
                          }`}
                        >
                          {/* Línea */}
                          <td className="py-3.5 px-5">
                            <span className="font-semibold text-slate-200">
                              Línea {summary.linea}
                            </span>
                          </td>

                          {/* Buses activos */}
                          <td className="py-3.5 px-4 text-center">
                            <span className="text-slate-300 font-semibold">
                              {summary.busesActivos}
                            </span>
                          </td>

                          {/* Barra en tiempo */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-slate-800 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full transition-all ${
                                    summary.pctCumplimiento >= 80
                                      ? 'bg-emerald-500'
                                      : summary.pctCumplimiento >= 60
                                      ? 'bg-yellow-500'
                                      : 'bg-red-500'
                                  }`}
                                  style={{ width: `${summary.pctCumplimiento}%` }}
                                />
                              </div>
                              <span
                                className={`text-xs font-semibold ${
                                  summary.pctCumplimiento >= 80
                                    ? 'text-emerald-400'
                                    : summary.pctCumplimiento >= 60
                                    ? 'text-yellow-400'
                                    : 'text-red-400'
                                }`}
                              >
                                {Math.round(summary.pctCumplimiento)}%
                              </span>
                            </div>
                          </td>

                          {/* Atrasados */}
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`text-sm font-semibold ${
                                summary.atrasados > 0 ? 'text-red-400' : 'text-slate-500'
                              }`}
                            >
                              {summary.atrasados}
                            </span>
                          </td>

                          {/* Adelantados */}
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`text-sm font-semibold ${
                                summary.adelantados > 0 ? 'text-orange-400' : 'text-slate-500'
                              }`}
                            >
                              {summary.adelantados}
                            </span>
                          </td>

                          {/* Badge diagnóstico */}
                          <td className="py-3.5 px-4">{badgeDiagnosis(diagnosis.tipo)}</td>

                          {/* Flecha */}
                          <td className="py-3.5 px-3">
                            {seleccionada ? (
                              <ChevronDown className="w-4 h-4 text-blue-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-600" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Estado vacío */}
          {datos && lineasConDiagnosis.length === 0 && !cargando && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-12 text-center">
              <Bus className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400">No hay líneas activas en este momento para la empresa seleccionada.</p>
            </div>
          )}

          {/* ── Panel 2: Detalle de línea seleccionada ── */}
          {lineaDetalle && (
            <PanelDetalleLinea
              linea={lineaDetalle}
              onCerrar={() => setLineaSeleccionada(null)}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
