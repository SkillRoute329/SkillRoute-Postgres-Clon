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
 * Competencia: corridor_overlap (DRO cross-operador por línea)
 */

import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  fetchVehicleHistory,
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
  Download,
  Filter,
  Search,
  Network,
  X,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { collection, doc as firestoreDoc, getDoc, getDocs, orderBy, limit, query, where } from '../../config/firestoreShim';
import { db } from '../../config/firebase';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { OPERADORES_ID_NOMBRE } from '../../utils/operadores';

/* ─── Constantes ──────────────────────────────────────── */

// FASE 5.16: fuente única utils/operadores.ts.
const AGENCIAS = OPERADORES_ID_NOMBRE;

const AUTO_REFRESH_MS = 120_000;

const COLORES_EMPRESA: Record<string, string> = {
  '70': 'text-blue-400',
  '50': 'text-orange-400',
  '20': 'text-emerald-400',
  '10': 'text-purple-400',
};

/* ─── Tipos ───────────────────────────────────────────── */

type TipoDiagnosis = 'OK' | 'LINEA' | 'COCHE' | 'MIXTO' | 'SIN_DATOS';

interface Diagnosis {
  tipo: TipoDiagnosis;
  mensaje: string;
  cochesProblema: string[];
  accionSugerida: string;
}

interface OverlapDoc {
  key: string;
  agencyA: string;
  empresaA: string;
  lineaA: string;
  agencyB: string;
  empresaB: string;
  lineaB: string;
  pctAInB: number;
  sharedKm: number;
  sameEmpresa: boolean;
}

interface ConductorInfo {
  interno: number;
  nombre: string;
  turno: string | null;
  servicio: number | null;
  pctAdelantado?: number;
  pctAtrasado?: number;
  totalEventos?: number;
}

interface VehicleEventDoc {
  idBus: string;
  empresa: string;
  linea: string;
  sentido: string | null;
  estadoCumplimiento: string;
  desviacionMin: number | null;
  proximaParada: string | null;
  timestampGPS: string;
  velocidad: number;
}

interface BusHistStat {
  idBus: string;
  empresa: string;
  sentido: string | null;
  totalEventos: number;
  pctEnTiempo: number;
  pctAtrasado: number;
  pctAdelantado: number;
  desviacionMedia: number | null;
  ultimaParada: string | null;
  ultimoTimestamp: string;
  ultimaVelocidad: number;
}

interface LineaHistStat {
  linea: string;
  sentido: string | null;
  buses: BusHistStat[];
  totalEventos: number;
  busesActivos: number;
  pctEnTiempo: number;
  pctAtrasado: number;
  pctAdelantado: number;
  diagnosis: Diagnosis;
}

/* ─── Algoritmo de diagnóstico (sobre histórico 7 días) ── */

function diagnosticarLineaHist(buses: BusHistStat[]): Diagnosis {
  // Solo analizar buses con al menos 5 registros — menos es ruido estadístico
  const conDatos = buses.filter((b) => b.totalEventos >= 5);

  if (conDatos.length === 0) {
    return {
      tipo: 'SIN_DATOS',
      mensaje: 'Sin datos GPS suficientes (últimos 7 días)',
      cochesProblema: [],
      accionSugerida: '—',
    };
  }

  // Un bus es "problemático" si más del 30 % de sus pasadas son fuera de horario
  const problematicos = conDatos.filter((b) => b.pctAtrasado + b.pctAdelantado > 30);
  const pct = problematicos.length / conDatos.length;

  if (pct >= 0.7) {
    return {
      tipo: 'LINEA',
      mensaje: `Desvío generalizado — ${problematicos.length} de ${conDatos.length} coches con >30% de pasadas fuera de horario en 7 días`,
      cochesProblema: problematicos.map((b) => b.idBus),
      accionSugerida: 'Patrón estructural de la línea. Verificar tránsito del corredor y revisar cartón con IMM.',
    };
  }
  if (pct >= 0.3) {
    return {
      tipo: 'MIXTO',
      mensaje: `Desvío parcial — ${problematicos.length} de ${conDatos.length} coches con incumplimiento consistente`,
      cochesProblema: problematicos.map((b) => b.idBus),
      accionSugerida: 'Monitorear. Puede ser tráfico en tramo específico o coches puntuales.',
    };
  }
  if (problematicos.length > 0) {
    return {
      tipo: 'COCHE',
      mensaje: `${problematicos.length} coche${problematicos.length > 1 ? 's' : ''} con desvío mayor al resto de la línea`,
      cochesProblema: problematicos.map((b) => b.idBus),
      accionSugerida: 'Revisar con el operario — posible conducción irregular o demora justificada.',
    };
  }

  return {
    tipo: 'OK',
    mensaje: 'Todos los coches dentro del horario en los últimos 7 días',
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
          Desvío generalizado
        </span>
      );
    case 'COCHE':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-500/10 text-orange-400">
          Desvío inusual
        </span>
      );
    case 'MIXTO':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-500/10 text-yellow-400">
          Desvío parcial
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

// ── Barra Tricolor de Clima de Cumplimiento (OTP) ───────────────────────
function BarraClimaRuta({ enTiempo, adelantado, atrasado }: { enTiempo: number; adelantado: number; atrasado: number }) {
  const total = enTiempo + adelantado + atrasado;
  if (total === 0) return <div className="w-full h-2 bg-slate-800 rounded-full" />;
  return (
    <div className="w-full max-w-[240px]">
      <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden flex border border-slate-700/30 relative group shadow-inner">
        <div className="bg-emerald-500 h-full transition-all hover:brightness-110 cursor-help" style={{ width: `${enTiempo}%` }} title={`En Tiempo: ${enTiempo}%`} />
        <div className="bg-orange-500 h-full transition-all hover:brightness-110 cursor-help" style={{ width: `${adelantado}%` }} title={`Adelantado: ${adelantado}%`} />
        <div className="bg-red-500 h-full transition-all hover:brightness-110 cursor-help" style={{ width: `${atrasado}%` }} title={`Atrasado: ${atrasado}%`} />
      </div>
      <div className="flex justify-between text-[9px] text-slate-500 font-mono font-semibold mt-1 px-0.5 tracking-tight">
        <span className={enTiempo > 0 ? "text-emerald-400" : ""}>{enTiempo}% Ok</span>
        <span className={adelantado > 0 ? "text-orange-400" : ""}>{adelantado}% Adel</span>
        <span className={atrasado > 0 ? "text-red-400" : ""}>{atrasado}% Atr</span>
      </div>
    </div>
  );
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

function formatFechaHora(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-UY', {
      timeZone: 'America/Montevideo',
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function formatHoraUY(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-UY', {
      timeZone: 'America/Montevideo',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

// Hora programada = hora real GPS menos la desviación detectada
function computeHoraPrevista(timestampGPS: string, desviacionMin: number | null): string {
  if (desviacionMin === null) return '—';
  try {
    const scheduled = new Date(new Date(timestampGPS).getTime() - desviacionMin * 60_000);
    return scheduled.toLocaleTimeString('es-UY', {
      timeZone: 'America/Montevideo',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

// Semáforo de diferencia según tolerancia IMM ±4 min
function diferenciaBadge(desv: number | null): React.ReactNode {
  if (desv === null) return <span className="text-slate-500 text-xs">—</span>;
  const abs = Math.abs(desv);
  const signo = desv >= 0 ? '+' : '';
  if (abs <= 4) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
        <CheckCircle className="w-3 h-3" />{signo}{desv.toFixed(0)} min
      </span>
    );
  }
  if (abs <= 8) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-yellow-400">
        <AlertTriangle className="w-3 h-3" />{signo}{desv.toFixed(0)} min
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-red-400">
      <AlertTriangle className="w-3 h-3" />{signo}{desv.toFixed(0)} min
    </span>
  );
}

function badgeTendenciaConductor(info: ConductorInfo): React.ReactNode {
  const { pctAdelantado = 0, pctAtrasado = 0, totalEventos = 0 } = info;
  if (totalEventos < 20) return null;
  if (pctAdelantado > 40) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 font-medium whitespace-nowrap">
        ↑ Tiende adelantar
      </span>
    );
  }
  if (pctAtrasado > 40) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium whitespace-nowrap">
        ↓ Tiende atrasar
      </span>
    );
  }
  return null;
}

/* ─── Sub-componente: Panel historial de coche ─────────── */

interface PanelHistorialProps {
  idBus: string;
  agencyId: string;
  lineaContexto?: string;
  onCerrar: () => void;
}

function PanelHistorial({ idBus, agencyId, lineaContexto, onCerrar }: PanelHistorialProps) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<VehicleSummary | null>(null);
  const [lineasInfo, setLineasInfo] = useState<Array<{
    linea: string;
    pctEnTiempo: number;
    eventos: number;
  }>>([]);
  const [lineaKPIs, setLineaKPIs] = useState<{
    pctEnTiempo: number;
    pctAtrasado: number;
    pctAdelantado: number;
    desviacionMediaMin: number | null;
    totalEventos: number;
  } | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);

    fetchVehicleHistory(idBus, 7, agencyId)
      .then((resp) => {
        if (cancelado) return;
        setSummary(resp.summary);

        // Normaliza código de línea para comparación (elimina ceros a la izquierda)
        const normLinea = (l: string) => String(l ?? '').trim().replace(/^0+/, '') || '0';

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

        // Si hay contexto de línea, calcular KPIs exclusivos de esa línea
        if (lineaContexto) {
          const filtrados = resp.history.filter(
            ev => normLinea(ev.linea) === normLinea(lineaContexto)
          );
          if (filtrados.length > 0) {
            const total = filtrados.length;
            const enTiempo  = filtrados.filter(ev => ev.estadoCumplimiento === 'EN_TIEMPO').length;
            const atrasado  = filtrados.filter(ev => ev.estadoCumplimiento === 'ATRASADO').length;
            const adelantado = filtrados.filter(ev => ev.estadoCumplimiento === 'ADELANTADO').length;
            const desvs = filtrados
              .map(ev => (ev as { desviacionMin?: number | null }).desviacionMin ?? null)
              .filter((v): v is number => v !== null);
            const desviacionMediaMin = desvs.length > 0
              ? Math.round((desvs.reduce((a, b) => a + b, 0) / desvs.length) * 10) / 10
              : null;
            setLineaKPIs({
              pctEnTiempo:  Math.round((enTiempo  / total) * 100),
              pctAtrasado:  Math.round((atrasado  / total) * 100),
              pctAdelantado: Math.round((adelantado / total) * 100),
              desviacionMediaMin,
              totalEventos: total,
            });
          } else {
            setLineaKPIs({ pctEnTiempo: 0, pctAtrasado: 0, pctAdelantado: 0, desviacionMediaMin: null, totalEventos: 0 });
          }
        }

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
    const kpis = lineaContexto && lineaKPIs ? lineaKPIs : summary;
    if (!kpis) return null;
    const pctEnTiempo      = kpis.pctEnTiempo;
    const desviacionMediaMin = kpis.desviacionMediaMin;
    const base = lineaContexto
      ? `Este coche tiene ${Math.round(pctEnTiempo)}% de cumplimiento en línea ${lineaContexto} en los últimos 7 días (${lineaKPIs?.totalEventos ?? 0} registros).`
      : (() => {
          const nLineas = (summary as VehicleSummary)?.lineasOperadas?.length ?? lineasInfo.length;
          return `Este coche tiene ${Math.round(pctEnTiempo)}% de cumplimiento en los últimos 7 días en ${nLineas} línea${nLineas !== 1 ? 's' : ''}.`;
        })();

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
          {lineaContexto && (
            <span className="text-slate-400 font-normal ml-1">
              en Línea <span className="text-blue-300">{lineaContexto}</span>
            </span>
          )}
          <span className="text-slate-500 font-normal ml-2">(últimos 7 días)</span>
        </h3>
        <button onClick={onCerrar} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
          Cerrar ✕
        </button>
      </div>

      {cargando && (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Cargando historial…
        </div>
      )}
      {error && !cargando && <p className="text-red-400 text-sm">{error}</p>}

      {!cargando && !error && (lineaContexto ? lineaKPIs !== null : summary !== null) && (() => {
        // Cuando hay contexto de línea y sin registros: mostrar estado vacío
        if (lineaContexto && lineaKPIs?.totalEventos === 0) {
          return (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-4 bg-slate-800/30 rounded-lg px-4">
              <Clock className="w-4 h-4 shrink-0" />
              Sin registros de la línea {lineaContexto} en los últimos 7 días para este coche.
            </div>
          );
        }
        const kpis = lineaContexto && lineaKPIs ? lineaKPIs : summary!;
        const desv = kpis.desviacionMediaMin;
        return (
          <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">En tiempo</p>
              <p className="text-2xl font-black text-emerald-400">{Math.round(kpis.pctEnTiempo)}%</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Atrasado</p>
              <p className="text-2xl font-black text-red-400">{Math.round(kpis.pctAtrasado)}%</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Adelantado</p>
              <p className="text-2xl font-black text-orange-400">{Math.round(kpis.pctAdelantado)}%</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Desv. media</p>
              <p className={`text-2xl font-black ${
                desv === null ? 'text-slate-400' :
                desv > 2 ? 'text-red-400' :
                desv < -2 ? 'text-orange-400' : 'text-emerald-400'
              }`}>
                {desv !== null
                  ? `${desv > 0 ? '+' : ''}${desv.toFixed(1)} min`
                  : '—'}
              </p>
            </div>
          </div>

          {lineasInfo.length > 0 && !lineaContexto && (
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

          <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/40">
            {conclusion()}
          </div>
        </>
        );
      })()}
    </div>
  );
}

/* ─── Sub-componente: Panel detalle de línea ───────────── */

interface PanelDetalleLineaProps {
  linea: LineaHistStat;
  agenciaId: string;
  onCerrar: () => void;
}

function PanelDetalleLinea({ linea, agenciaId, onCerrar }: PanelDetalleLineaProps) {
  const [cocheHistorial, setCocheHistorial] = useState<string | null>(null);
  const [competidores, setCompetidores] = useState<OverlapDoc[]>([]);
  const [destinoTexto, setDestinoTexto] = useState<string | null>(null);
  const [conductoresPorCoche, setConductoresPorCoche] = useState<Record<string, ConductorInfo[]>>({});
  const { linea: lineaCodigo, sentido, buses, diagnosis } = linea;

  // Derivar texto de destino desde horarios_stm para mostrar origen→destino real
  useEffect(() => {
    let cancelado = false;
    const CENTRO = /centro|ciudad vieja|mdeo|aduana|tres cruces|palacio|goes|zitarrosa/i;
    getDoc(firestoreDoc(db, 'horarios_stm', lineaCodigo))
      .then(snap => {
        if (!snap.exists() || cancelado) return;
        const data = snap.data();
        const diaKey = Object.keys(data.dias ?? {})[0];
        const variantes: Array<{ origen: string; destino: string }> = data.dias?.[diaKey]?.variantes ?? [];
        if (!variantes.length) return;
        if (sentido === 'VUELTA') {
          const v = variantes.find(v => CENTRO.test(v.destino) || CENTRO.test(v.origen)) ?? variantes[0];
          if (v) setDestinoTexto(`${v.origen} → ${v.destino}`);
        } else {
          const v = variantes.find(v => !CENTRO.test(v.destino) && !CENTRO.test(v.origen)) ?? variantes[1] ?? variantes[0];
          if (v) setDestinoTexto(`${v.origen} → ${v.destino}`);
        }
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [lineaCodigo, sentido]);

  // Cargar datos de competencia cross-operador para esta línea desde corridor_overlap
  useEffect(() => {
    let cancelado = false;
    Promise.all([
      getDocs(query(
        collection(db, 'corridor_overlap'),
        where('lineaA', '==', lineaCodigo),
        where('sameEmpresa', '==', false)
      )),
      getDocs(query(
        collection(db, 'corridor_overlap'),
        where('lineaB', '==', lineaCodigo),
        where('sameEmpresa', '==', false)
      )),
    ])
      .then(([snapA, snapB]) => {
        if (cancelado) return;
        const docs: OverlapDoc[] = [
          ...snapA.docs.map(d => d.data() as OverlapDoc),
          ...snapB.docs.map(d => d.data() as OverlapDoc),
        ];
        const vistos = new Set<string>();
        const unicos = docs.filter(d => {
          if (vistos.has(d.key)) return false;
          vistos.add(d.key);
          return true;
        });
        unicos.sort((a, b) => b.sharedKm - a.sharedKm);
        setCompetidores(unicos);
      })
      .catch(() => {/* corridor_overlap sin datos para esta línea */});
    return () => { cancelado = true; };
  }, [lineaCodigo]);

  // Conductores del día para UCOT — cruza distribuciones_diarias con conductor_stats
  useEffect(() => {
    if (agenciaId !== '70') return; // solo UCOT tiene distribuciones_diarias
    let cancelado = false;
    const fechaHoy = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    const cochesIds = new Set(buses.map((b) => b.idBus));

    getDocs(collection(db, `distribuciones_diarias/${fechaHoy}/registros`))
      .then(async (snap) => {
        if (cancelado) return;
        const porCoche: Record<string, Array<{ interno: number; nombre: string; turno: string | null; servicio: number | null }>> = {};
        for (const d of snap.docs) {
          const data = d.data();
          const coche = String(data.coche);
          if (!cochesIds.has(coche)) continue;
          if (!porCoche[coche]) porCoche[coche] = [];
          porCoche[coche].push({
            interno: Number(data.interno),
            nombre: String(data.nombre ?? ''),
            turno: data.turno ?? null,
            servicio: data.servicio ?? null,
          });
        }
        const internosUnicos = [...new Set(Object.values(porCoche).flat().map((c) => c.interno))];
        const statsMap: Record<number, { pctAdelantado: number; pctAtrasado: number; totalEventos: number }> = {};
        await Promise.all(
          internosUnicos.map(async (interno) => {
            try {
              const s = await getDoc(firestoreDoc(db, 'conductor_stats', `70_${interno}`));
              if (s.exists()) {
                const d = s.data();
                statsMap[interno] = {
                  pctAdelantado: d.pctAdelantado ?? 0,
                  pctAtrasado: d.pctAtrasado ?? 0,
                  totalEventos: d.totalEventos ?? 0,
                };
              }
            } catch { /* sin stats para este conductor */ }
          })
        );
        if (cancelado) return;
        const resultado: Record<string, ConductorInfo[]> = {};
        for (const [coche, conductores] of Object.entries(porCoche)) {
          resultado[coche] = conductores.map((c) => ({
            ...c,
            pctAdelantado: statsMap[c.interno]?.pctAdelantado,
            pctAtrasado: statsMap[c.interno]?.pctAtrasado,
            totalEventos: statsMap[c.interno]?.totalEventos,
          }));
        }
        setConductoresPorCoche(resultado);
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [agenciaId, buses]);

  // Ordenar por % fuera de horario descendente — los más problemáticos arriba
  const busesOrdenados = [...buses].sort(
    (a, b) => (b.pctAtrasado + b.pctAdelantado) - (a.pctAtrasado + a.pctAdelantado)
  );

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 mt-3">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-200">
              Línea <span className="text-blue-400">{lineaCodigo}</span>
            </h3>
            {sentido === 'IDA' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                → IDA
              </span>
            )}
            {sentido === 'VUELTA' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30">
                ← VUELTA
              </span>
            )}
            <span className="text-slate-400 font-normal text-sm">— {linea.busesActivos} coches · {linea.totalEventos} registros 7 días</span>
          </div>
          {destinoTexto && (
            <p className="text-xs text-slate-500 mt-0.5">{destinoTexto}</p>
          )}
        </div>
        <button
          onClick={onCerrar}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors shrink-0 mt-0.5"
        >
          Cerrar ✕
        </button>
      </div>

      {/* Card de diagnóstico */}
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

      {/* Sección competencia cross-operador */}
      {competidores.length > 0 && (
        <div className="mb-5">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Network className="w-3.5 h-3.5 text-orange-400" />
            Competencia en este corredor
            <span className="text-slate-600 normal-case tracking-normal font-normal">
              ({competidores.length} ruta{competidores.length !== 1 ? 's' : ''} rival{competidores.length !== 1 ? 'es' : ''})
            </span>
          </p>
          <div className="grid gap-2">
            {competidores.slice(0, 5).map((c, i) => {
              const esPropioA = c.agencyA === agenciaId;
              const rivalLinea = esPropioA ? c.lineaB : c.lineaA;
              const rivalEmpresa = esPropioA ? c.empresaB : c.empresaA;
              const rivalAgency = esPropioA ? c.agencyB : c.agencyA;
              const droMio = esPropioA ? c.pctAInB : (1 - c.pctAInB);
              const droRival = esPropioA ? (1 - c.pctAInB) : c.pctAInB;
              const colorEmpresa = COLORES_EMPRESA[rivalAgency] ?? 'text-slate-300';
              const nivelRiesgo = droMio > 0.6 ? 'Alto' : droMio > 0.3 ? 'Medio' : 'Bajo';
              const colorRiesgo =
                droMio > 0.6 ? 'text-red-400 bg-red-500/10' :
                droMio > 0.3 ? 'text-yellow-400 bg-yellow-500/10' :
                'text-emerald-400 bg-emerald-500/10';
              return (
                <div key={i} className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/30 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${colorEmpresa}`}>Línea {rivalLinea}</span>
                      <span className="text-xs text-slate-400">{rivalEmpresa}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{c.sharedKm.toFixed(1)} km de corredor compartido</p>
                  </div>
                  <div className="text-center shrink-0">
                    <p className="text-xs text-slate-500 mb-0.5">DRO (mi ruta)</p>
                    <p className="text-sm font-black text-white">{Math.round(droMio * 100)}%</p>
                  </div>
                  <div className="text-center shrink-0">
                    <p className="text-xs text-slate-500 mb-0.5">DRO (rival)</p>
                    <p className="text-sm font-black text-slate-300">{Math.round(droRival * 100)}%</p>
                  </div>
                  <div className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${colorRiesgo}`}>
                    {nivelRiesgo}
                  </div>
                </div>
              );
            })}
          </div>
          {competidores.length > 5 && (
            <p className="text-xs text-slate-500 mt-2">
              +{competidores.length - 5} rutas rivales más — ver Inteligencia de Corredores para detalle completo.
            </p>
          )}
        </div>
      )}

      {/* Nota de fuente de datos */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <Clock className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-xs text-slate-500">Estadísticas basadas en registros GPS de los últimos 7 días · clasificados según horario GTFS</span>
      </div>

      {/* Tabla de coches */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30">
              <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase tracking-widest font-medium">Coche</th>
              <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase tracking-widest font-medium">Conductor</th>
              <th className="text-center py-2 px-3 text-xs text-slate-400 uppercase tracking-widest font-medium">Pasadas</th>
              <th className="text-center py-2 px-3 text-xs text-slate-400 uppercase tracking-widest font-medium">En tiempo</th>
              <th className="text-center py-2 px-3 text-xs text-slate-400 uppercase tracking-widest font-medium">Atrasado</th>
              <th className="text-center py-2 px-3 text-xs text-slate-400 uppercase tracking-widest font-medium">Desvío medio</th>
              <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase tracking-widest font-medium">Última pasada</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {busesOrdenados.map((bus) => {
              const esProblema = diagnosis.cochesProblema.includes(bus.idBus);
              const pctFuera = bus.pctAtrasado + bus.pctAdelantado;
              const rowBg = bus.totalEventos < 5 ? '' :
                pctFuera <= 20 ? 'bg-emerald-500/3' :
                pctFuera <= 40 ? 'bg-yellow-500/5' : 'bg-red-500/5';
              return (
                <tr
                  key={bus.idBus}
                  className={`border-b border-slate-800/50 ${rowBg} ${esProblema ? 'border-l-2 border-l-orange-500/50' : ''}`}
                >
                  <td className="py-2.5 px-3">
                    <span className={`font-bold text-sm ${esProblema ? 'text-orange-300' : 'text-slate-200'}`}>
                      {bus.idBus}
                    </span>
                    <span className="text-xs text-slate-500 ml-1">{bus.empresa}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    {conductoresPorCoche[bus.idBus]?.length > 0 ? (
                      <div className="space-y-1">
                        {conductoresPorCoche[bus.idBus].map((c, i) => (
                          <div key={i} className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-slate-300 font-medium">{c.nombre}</span>
                            {c.turno && (
                              <span className="text-[10px] text-slate-500 bg-slate-800 px-1 rounded">{c.turno}</span>
                            )}
                            {badgeTendenciaConductor(c)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600 italic">
                        {agenciaId === '70' ? 'Sin asignar hoy' : '—'}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`text-sm font-semibold ${bus.totalEventos >= 5 ? 'text-slate-300' : 'text-slate-600'}`}>
                      {bus.totalEventos}
                    </span>
                    {bus.totalEventos < 5 && (
                      <span className="text-[10px] text-slate-600 block">insuf.</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`text-sm font-bold ${bus.pctEnTiempo >= 80 ? 'text-emerald-400' : bus.pctEnTiempo >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {bus.totalEventos >= 5 ? `${bus.pctEnTiempo}%` : '—'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`text-sm font-bold ${bus.pctAtrasado > 30 ? 'text-red-400' : bus.pctAtrasado > 15 ? 'text-yellow-400' : 'text-slate-500'}`}>
                      {bus.totalEventos >= 5 ? `${bus.pctAtrasado}%` : '—'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {bus.totalEventos >= 5 ? desviacionLabel(bus.desviacionMedia) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-400 whitespace-nowrap">
                    <span className="font-mono">{formatFechaHora(bus.ultimoTimestamp)}</span>
                    {bus.ultimaParada && (
                      <span className="text-slate-500 ml-1 hidden xl:inline">· {bus.ultimaParada}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <button
                      onClick={() => setCocheHistorial(cocheHistorial === bus.idBus ? null : bus.idBus)}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap"
                    >
                      {cocheHistorial === bus.idBus ? 'Ocultar' : 'Historial'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {cocheHistorial && (
        <PanelHistorial
          idBus={cocheHistorial}
          agencyId={agenciaId}
          lineaContexto={lineaCodigo}
          onCerrar={() => setCocheHistorial(null)}
        />
      )}
    </div>
  );
}

/* ─── Componente principal ────────────────────────────── */

const normLinea = (l: string) => String(l ?? '').trim().replace(/^0+/, '') || '0';

export default function DiagnosticoCumplimiento() {
  const { empresaPropia } = useEmpresaPropia();
  const agenciaId = String(empresaPropia);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lineasHist, setLineasHist] = useState<LineaHistStat[]>([]);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);
  const [lineaSeleccionada, setLineaSeleccionada] = useState<string | null>(null);
  const [filtroLinea, setFiltroLinea] = useState('');
  const [filtroDiagnosis, setFiltroDiagnosis] = useState<TipoDiagnosis | 'TODOS'>('TODOS');
  const [segundosProxima, setSegundosProxima] = useState(AUTO_REFRESH_MS / 1000);

  /* ─── Fetch histórico desde vehicle_events ───────────── */

  const cargarDatos = useCallback(async (agId: string) => {
    setCargando(true);
    setError(null);
    setLineaSeleccionada(null);

    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const snap = await getDocs(query(
        collection(db, 'vehicle_events'),
        where('agencyId', '==', agId),
        where('timestampGPS', '>=', since),
        orderBy('timestampGPS', 'desc'),
        limit(5000)
      ));

      // Agrupar por linea+sentido → bus
      const mapaLineas: Record<string, Record<string, VehicleEventDoc[]>> = {};
      for (const d of snap.docs) {
        const ev = d.data() as VehicleEventDoc;
        if (ev.estadoCumplimiento === 'FUERA_DE_SERVICIO') continue;
        const lineaNorm = normLinea(ev.linea ?? '');
        if (!lineaNorm || lineaNorm === '0') continue;
        const sentidoKey = ev.sentido ?? 'N';
        const grupKey = `${lineaNorm}__${sentidoKey}`;
        if (!mapaLineas[grupKey]) mapaLineas[grupKey] = {};
        const busKey = ev.idBus;
        if (!mapaLineas[grupKey][busKey]) mapaLineas[grupKey][busKey] = [];
        mapaLineas[grupKey][busKey].push(ev);
      }

      // Construir LineaHistStat por grupo
      const resultado: LineaHistStat[] = Object.entries(mapaLineas).map(([grupKey, busMapa]) => {
        const [lineaCod, sentidoRaw] = grupKey.split('__');
        const sentido = sentidoRaw === 'N' ? null : sentidoRaw as 'IDA' | 'VUELTA';

        const buses: BusHistStat[] = Object.entries(busMapa).map(([idBus, eventos]) => {
          const total = eventos.length;
          const conHorario = eventos.filter(
            e => e.estadoCumplimiento !== 'SIN_HORARIO'
          );
          const base = conHorario.length > 0 ? conHorario.length : total;
          const enTiempo   = conHorario.filter(e => e.estadoCumplimiento === 'EN_TIEMPO').length;
          const atrasado   = conHorario.filter(e => e.estadoCumplimiento === 'ATRASADO').length;
          const adelantado = conHorario.filter(e => e.estadoCumplimiento === 'ADELANTADO').length;
          const desvs = conHorario
            .map(e => e.desviacionMin)
            .filter((v): v is number => v !== null);
          const desviacionMedia = desvs.length > 0
            ? Math.round((desvs.reduce((a, b) => a + b, 0) / desvs.length) * 10) / 10
            : null;
          // Última pasada — eventos ya vienen ordenados por desc, el primero es el más reciente
          const ultimo = eventos[0];
          return {
            idBus,
            empresa: ultimo.empresa ?? '',
            sentido,
            totalEventos: total,
            pctEnTiempo:   base > 0 ? Math.round((enTiempo   / base) * 100) : 0,
            pctAtrasado:   base > 0 ? Math.round((atrasado   / base) * 100) : 0,
            pctAdelantado: base > 0 ? Math.round((adelantado / base) * 100) : 0,
            desviacionMedia,
            ultimaParada: ultimo.proximaParada ?? null,
            ultimoTimestamp: ultimo.timestampGPS,
            ultimaVelocidad: ultimo.velocidad ?? 0,
          };
        });

        const totalEventos = buses.reduce((s, b) => s + b.totalEventos, 0);
        const busesConDatos = buses.filter(b => b.totalEventos >= 5);
        const pctEnTiempo = busesConDatos.length > 0
          ? Math.round(busesConDatos.reduce((s, b) => s + b.pctEnTiempo, 0) / busesConDatos.length)
          : 0;
        const pctAtrasado = busesConDatos.length > 0
          ? Math.round(busesConDatos.reduce((s, b) => s + b.pctAtrasado, 0) / busesConDatos.length)
          : 0;
        const pctAdelantado = busesConDatos.length > 0
          ? Math.round(busesConDatos.reduce((s, b) => s + b.pctAdelantado, 0) / busesConDatos.length)
          : 0;

        return {
          linea: lineaCod,
          sentido,
          buses,
          totalEventos,
          busesActivos: buses.length,
          pctEnTiempo,
          pctAtrasado,
          pctAdelantado,
          diagnosis: diagnosticarLineaHist(buses),
        };
      });

      resultado.sort((a, b) => {
        const nA = parseInt(a.linea, 10) || 0;
        const nB = parseInt(b.linea, 10) || 0;
        if (nA !== nB) return nA - nB;
        const ord = (s: string | null) => s === 'IDA' ? 0 : s === 'VUELTA' ? 1 : 2;
        return ord(a.sentido) - ord(b.sentido);
      });

      setLineasHist(resultado);
      setUltimaActualizacion(new Date().toISOString());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('cargarDatos error:', err);
      setError(`Error Firestore: ${msg}`);
    } finally {
      setCargando(false);
    }
  }, []);

  // Reset de filtros cuando cambia el operador desde el hub
  useEffect(() => {
    setFiltroLinea('');
    setFiltroDiagnosis('TODOS');
    setLineaSeleccionada(null);
  }, [agenciaId]);

  // Carga inicial y auto-refresh cada 2 minutos
  useEffect(() => {
    cargarDatos(agenciaId);
    const intervalo = setInterval(() => cargarDatos(agenciaId), AUTO_REFRESH_MS);
    return () => clearInterval(intervalo);
  }, [agenciaId, cargarDatos]);

  // Contador visual de próxima actualización (tick cada segundo)
  useEffect(() => {
    setSegundosProxima(AUTO_REFRESH_MS / 1000);
    const tick = setInterval(() => {
      setSegundosProxima((s) => (s <= 1 ? AUTO_REFRESH_MS / 1000 : s - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [ultimaActualizacion]);


  /* ─── Derivar datos para la UI ───────────── */

  // Filtros de búsqueda aplicados
  const lineasFiltradas = lineasHist.filter((l) => {
    const matchLinea =
      filtroLinea === '' ||
      l.linea.toString().toLowerCase().includes(filtroLinea.toLowerCase().trim());
    const matchDiag = filtroDiagnosis === 'TODOS' || l.diagnosis.tipo === filtroDiagnosis;
    return matchLinea && matchDiag;
  });

  // KPIs globales
  const totalCoches = [...new Set(lineasHist.flatMap(l => l.buses.map(b => b.idBus)))].length;

  const lineasConBoletín = lineasHist.filter(l => l.pctEnTiempo + l.pctAtrasado + l.pctAdelantado > 0);
  const pctGlobalEnTiempo: number | null =
    lineasConBoletín.length > 0
      ? Math.round(lineasConBoletín.reduce((acc, l) => acc + l.pctEnTiempo, 0) / lineasConBoletín.length)
      : null;

  const lineasConProblema = lineasHist.filter(
    (l) => l.diagnosis.tipo === 'LINEA' || l.diagnosis.tipo === 'COCHE'
  ).length;

  const cochesProblema = [
    ...new Set(lineasHist.flatMap((l) => l.diagnosis.cochesProblema)),
  ].length;

  const hayDatos = lineasHist.length > 0;

  // TOP de Alertas Críticas para Mando Ejecutivo
  const topLineasCriticas = [...lineasHist]
    .filter(l => l.diagnosis.tipo === 'LINEA')
    .sort((a, b) => (b.pctAtrasado + b.pctAdelantado) - (a.pctAtrasado + a.pctAdelantado))
    .slice(0, 3);

  const topCochesDesvio = [...lineasHist]
    .flatMap(l => l.buses.map(b => ({ ...b, lineaCod: l.linea, sentidoCod: l.sentido })))
    .filter(b => b.totalEventos >= 5 && (b.pctAtrasado + b.pctAdelantado > 35))
    .sort((a, b) => (b.pctAtrasado + b.pctAdelantado) - (a.pctAtrasado + a.pctAdelantado))
    .slice(0, 3);

  const empresaNombre = AGENCIAS.find((a) => a.id === agenciaId)?.nombre ?? agenciaId;
  const hayFiltros = filtroLinea !== '' || filtroDiagnosis !== 'TODOS';

  /* ─── Export PDF ─────────────────────────── */

  function exportPDF() {
    const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });
    const fecha = new Date().toLocaleDateString('es-UY', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const hora = new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });

    // Encabezado
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('Diagnóstico de Cumplimiento de Servicio', 14, 13);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Operador: ${empresaNombre}  |  Generado: ${fecha} ${hora}`, 14, 22);

    // Resumen ejecutivo
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen ejecutivo', 14, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const kpis: [string, string][] = [
      ['Coches en servicio:', `${totalCoches}`],
      ['Promedio cumplimiento:', pctGlobalEnTiempo !== null ? `${pctGlobalEnTiempo}%` : '— (sin boletines)'],
      ['Líneas con problema:', `${lineasConProblema} de ${lineasHist.length}`],
      ['Coches problemáticos:', `${cochesProblema}`],
    ];
    kpis.forEach(([label, valor], i) => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(label, 14, 48 + i * 7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(valor, 72, 48 + i * 7);
    });

    // Tabla de líneas
    autoTable(doc, {
      startY: 84,
      head: [['Línea', 'Buses', 'En tiempo', 'Atrasados', 'Adelantados', 'Diagnóstico', 'Acción sugerida']],
      body: lineasHist.map((l) => [
        `Línea ${l.linea}`,
        String(l.busesActivos),
        `${l.pctEnTiempo}%`,
        `${l.pctAtrasado}%`,
        `${l.pctAdelantado}%`,
        l.diagnosis.tipo === 'OK'    ? 'Normal'            :
        l.diagnosis.tipo === 'LINEA' ? 'Problema de línea' :
        l.diagnosis.tipo === 'COCHE' ? 'Problema de coche' :
        l.diagnosis.tipo === 'MIXTO' ? 'Mixto'             : 'Sin datos',
        l.diagnosis.accionSugerida,
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 20 },
        2: { halign: 'center', cellWidth: 18 },
        3: { halign: 'center', cellWidth: 18, textColor: [220, 38, 38] },
        4: { halign: 'center', cellWidth: 20, textColor: [234, 88, 12] },
        5: { cellWidth: 30 },
      },
    });

    // Pie de página
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `SkillRoute — Sistema de Gestión de Transporte Metropolitano | Pág. ${i} de ${pageCount}`,
        14,
        doc.internal.pageSize.height - 8
      );
    }

    doc.save(`diagnostico_${empresaNombre.toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  /* ─── Export CSV (Excel-compatible) ─────── */

  function exportCSV() {
    const fecha = new Date().toLocaleDateString('es-UY', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const hora = new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });

    const encabezado = [
      `Diagnóstico de Cumplimiento de Servicio — ${empresaNombre}`,
      `Generado: ${fecha} ${hora}`,
      `Coches en servicio: ${totalCoches} | Promedio en tiempo: ${pctGlobalEnTiempo !== null ? `${pctGlobalEnTiempo}%` : '— (sin boletines)'} | Líneas con problema: ${lineasConProblema}`,
      '',
      'Línea;Buses activos;% En tiempo;Atrasados;Adelantados;Diagnóstico;Coches problemáticos;Acción sugerida',
    ];

    const filas = lineasHist.map((l) =>
      [
        `Línea ${l.linea}`,
        l.busesActivos,
        `${l.pctEnTiempo}%`,
        `${l.pctAtrasado}%`,
        `${l.pctAdelantado}%`,
        l.diagnosis.tipo === 'OK'    ? 'Normal'            :
        l.diagnosis.tipo === 'LINEA' ? 'Problema de línea' :
        l.diagnosis.tipo === 'COCHE' ? 'Problema de coche' :
        l.diagnosis.tipo === 'MIXTO' ? 'Mixto'             : 'Sin datos',
        l.diagnosis.cochesProblema.join(' / ') || '—',
        l.diagnosis.accionSugerida,
      ].join(';')
    );

    // BOM UTF-8 para que Excel abra con acentos correctamente
    const bom = '﻿';
    const csv = bom + [...encabezado, ...filas].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostico_${empresaNombre.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ─── Render ─────────────────────────────── */

  return (
    <div className="bg-slate-950 min-h-screen p-6">
      <div className="fixed top-0 left-1/3 w-96 h-96 bg-blue-700/8 rounded-full blur-[160px] pointer-events-none" />

      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-200">
              Diagnóstico de Cumplimiento de Servicio
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Estadísticas históricas 7 días · GPS vs horario GTFS — actualización cada 2 minutos
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-2 shrink-0">
            {/* Controles */}
            <div className="flex items-center gap-2">
              {ultimaActualizacion && (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {tiempoActualizado(ultimaActualizacion)}
                </span>
              )}
              {!cargando && (
                <span className="text-xs text-slate-600 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse inline-block" />
                  {segundosProxima}s
                </span>
              )}
              <button
                onClick={exportCSV}
                disabled={cargando || lineasHist.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:text-white hover:bg-emerald-600/30 hover:border-emerald-400 transition-all disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                Excel/CSV
              </button>
              <button
                onClick={exportPDF}
                disabled={cargando || lineasHist.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:text-white hover:bg-blue-600/30 hover:border-blue-400 transition-all disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                PDF
              </button>
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

      {/* ── Error ── */}
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

      {/* ── Carga inicial ── */}
      {cargando && !hayDatos && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-slate-400 text-sm">Cargando historial de cumplimiento…</p>
        </div>
      )}


      {!cargando || hayDatos ? (
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
              {pctGlobalEnTiempo !== null ? (
                <p className={`text-3xl font-black ${
                  pctGlobalEnTiempo >= 80 ? 'text-emerald-400' :
                  pctGlobalEnTiempo >= 60 ? 'text-yellow-400' : 'text-red-400'
                }`}>{pctGlobalEnTiempo}%</p>
              ) : (
                <div>
                  <p className="text-3xl font-black text-slate-600">—</p>
                  <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                    Sin boletines de horario cargados. SkillRoute calcula OTP comparando GPS IMM
                    vs horario programado del operador. Cargar en Admin → Setup → Importar Boletín.
                  </p>
                </div>
              )}
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

          {/* ── Tablero de Alertas Directas (Mando Ejecutivo) ── */}
          {hayDatos && (topLineasCriticas.length > 0 || topCochesDesvio.length > 0) && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
              {/* Panel Izquierdo: Líneas Críticas */}
              {topLineasCriticas.length > 0 && (
                <div className="bg-gradient-to-br from-red-950/25 to-slate-900 border border-red-900/30 rounded-xl p-5 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />
                  <div className="flex items-center gap-2.5 mb-4 border-b border-red-900/20 pb-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-red-200">Foco Crítico de Líneas (Tránsito / IMM)</h3>
                      <p className="text-[11px] text-red-400/70 leading-tight">Falla generalizada en la ruta — requiere revisión de tráfico o cartón IMM</p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {topLineasCriticas.map((l, idx) => (
                      <div key={idx} className="bg-slate-950/30 border border-red-950/40 rounded-lg p-3 flex items-center justify-between gap-4 hover:bg-slate-950/50 transition-colors">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-white text-lg tracking-tight">L.{l.linea}</span>
                            {l.sentido && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                l.sentido === 'IDA' ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' : 'bg-orange-500/10 text-orange-300 border-orange-500/20'
                              }`}>{l.sentido}</span>
                            )}
                          </div>
                          <span className="text-[9px] text-slate-500">{l.busesActivos} coches analizados</span>
                        </div>
                        <div className="flex-1 flex justify-center min-w-[140px]">
                          <BarraClimaRuta enTiempo={l.pctEnTiempo} adelantado={l.pctAdelantado} atrasado={l.pctAtrasado} />
                        </div>
                        <div className="text-right border-l border-slate-800 pl-4 min-w-[95px]">
                          <span className="text-[10px] font-black text-red-400 uppercase tracking-wider block">Revisar IMM</span>
                          <span className="text-[9px] text-slate-400 font-medium">Acción sugerida</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Panel Derecho: Prevención Conducción */}
              {topCochesDesvio.length > 0 && (
                <div className="bg-gradient-to-br from-orange-950/20 to-slate-900 border border-orange-900/30 rounded-xl p-5 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
                  <div className="flex items-center gap-2.5 mb-4 border-b border-orange-900/20 pb-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-orange-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-orange-200">Foco Prevención Conductores (RRHH)</h3>
                      <p className="text-[11px] text-orange-400/70 leading-tight">Incumplimientos severos concentrados en coches puntuales hoy</p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {topCochesDesvio.map((b, idx) => (
                      <div key={idx} className="bg-slate-950/30 border border-orange-950/40 rounded-lg p-3 flex items-center justify-between gap-4 hover:bg-slate-950/50 transition-colors">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-orange-300 text-base tracking-tight">Coche {b.idBus}</span>
                            <span className="text-[9px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">L.{b.lineaCod}</span>
                          </div>
                          <span className="text-[9px] text-slate-500">{b.totalEventos} registros 7d</span>
                        </div>
                        <div className="flex-1 flex justify-center min-w-[140px]">
                          <BarraClimaRuta enTiempo={b.pctEnTiempo} adelantado={b.pctAdelantado} atrasado={b.pctAtrasado} />
                        </div>
                        <div className="text-right border-l border-slate-800 pl-4 min-w-[95px]">
                          <span className="text-[10px] font-black text-orange-400 uppercase tracking-wider block">Charlar Chofer</span>
                          <span className="text-[9px] text-slate-400 font-medium">Acción sugerida</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Filtros de búsqueda ── */}
          {hayDatos && lineasHist.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 mb-4 items-center">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={filtroLinea}
                  onChange={(e) => { setFiltroLinea(e.target.value); setLineaSeleccionada(null); }}
                  placeholder="Buscar línea…"
                  className="w-full pl-9 pr-4 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-500 shrink-0" />
                <select
                  value={filtroDiagnosis}
                  onChange={(e) => { setFiltroDiagnosis(e.target.value as TipoDiagnosis | 'TODOS'); setLineaSeleccionada(null); }}
                  className="px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="TODOS">Todos los diagnósticos</option>
                  <option value="OK">Normal</option>
                  <option value="LINEA">Problema de línea</option>
                  <option value="COCHE">Problema de coche</option>
                  <option value="MIXTO">Mixto</option>
                  <option value="SIN_DATOS">Sin datos</option>
                </select>
              </div>
              {hayFiltros && (
                <button
                  onClick={() => { setFiltroLinea(''); setFiltroDiagnosis('TODOS'); }}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap"
                >
                  <X className="w-3.5 h-3.5" />
                  Limpiar
                </button>
              )}
              <span className="text-xs text-slate-500 ml-auto">
                {hayFiltros
                  ? `${lineasFiltradas.length} de ${lineasHist.length} líneas`
                  : `${lineasHist.length} líneas activas`}
              </span>
            </div>
          )}

          {/* ── Tabla de líneas ── */}
          {hayDatos && lineasFiltradas.length > 0 && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden mb-4">
              <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-bold text-slate-200">Estado por línea · últimos 7 días</h2>
                <Zap className="w-3.5 h-3.5 text-slate-600 ml-auto" />
                <span className="text-xs text-slate-500">Ordenado por número de línea · IDA y VUELTA agrupadas</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-800/50">
                      <th className="text-left py-3 px-5 text-xs text-slate-400 uppercase tracking-widest font-medium">Línea / Sentido</th>
                      <th className="text-center py-3 px-4 text-xs text-slate-400 uppercase tracking-widest font-medium">
                        <span className="flex items-center justify-center gap-1"><Bus className="w-3 h-3" /> Buses</span>
                      </th>
                      <th className="text-left py-3 px-4 text-xs text-slate-400 uppercase tracking-widest font-medium w-[250px]">Clima de Cumplimiento (OTP)</th>
                      <th className="text-left py-3 px-4 text-xs text-slate-400 uppercase tracking-widest font-medium">Diagnóstico</th>
                      <th className="py-3 px-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineasFiltradas.map((item, idx) => {
                      const key = `${item.linea}__${item.sentido ?? 'N'}`;
                      const seleccionada = lineaSeleccionada === key;
                      const nextItem = lineasFiltradas[idx + 1];
                      const prevItem = lineasFiltradas[idx - 1];
                      const esGrupo = nextItem?.linea === item.linea || prevItem?.linea === item.linea;
                      const esInicioGrupo = esGrupo && prevItem?.linea !== item.linea;

                      return (
                        <Fragment key={key}>
                          <tr
                            onClick={() => setLineaSeleccionada(seleccionada ? null : key)}
                            className={`border-b border-slate-800/50 cursor-pointer transition-colors ${
                              seleccionada
                                ? 'bg-blue-900/20 border-l-2 border-l-blue-500'
                                : esGrupo
                                  ? 'hover:bg-slate-800/40 bg-slate-800/10'
                                  : 'hover:bg-slate-800/40'
                            } ${esInicioGrupo ? 'border-t border-t-slate-700/60' : ''}`}
                          >
                            <td className="py-3.5 px-5">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-200">Línea {item.linea}</span>
                                {item.sentido === 'IDA' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                    → IDA
                                  </span>
                                )}
                                {item.sentido === 'VUELTA' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30">
                                    ← VUELTA
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className="text-slate-300 font-semibold">{item.busesActivos}</span>
                            </td>
                            <td className="py-3.5 px-4">
                              <BarraClimaRuta enTiempo={item.pctEnTiempo} adelantado={item.pctAdelantado} atrasado={item.pctAtrasado} />
                            </td>
                            <td className="py-3.5 px-4">{badgeDiagnosis(item.diagnosis.tipo)}</td>
                            <td className="py-3.5 px-3">
                              {seleccionada ? (
                                <ChevronDown className="w-4 h-4 text-blue-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-600" />
                              )}
                            </td>
                          </tr>
                          {seleccionada && (
                            <tr>
                              <td colSpan={7} className="p-0 border-b border-blue-500/20">
                                <PanelDetalleLinea
                                  linea={item}
                                  agenciaId={agenciaId}
                                  onCerrar={() => setLineaSeleccionada(null)}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Estado vacío — filtros sin resultados */}
          {hayDatos && lineasFiltradas.length === 0 && lineasHist.length > 0 && !cargando && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-8 text-center mb-4">
              <Search className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Ninguna línea coincide con los filtros aplicados.</p>
              <button
                onClick={() => { setFiltroLinea(''); setFiltroDiagnosis('TODOS'); }}
                className="mt-3 text-xs text-blue-400 hover:text-blue-300 underline"
              >
                Limpiar filtros
              </button>
            </div>
          )}

          {/* Estado vacío — sin datos */}
          {!cargando && !hayDatos && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-12 text-center">
              <Bus className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400">No hay registros GPS en los últimos 7 días para esta empresa.</p>
              <p className="text-xs text-slate-600 mt-2">Los datos se generan automáticamente cada 15 minutos desde los buses en servicio.</p>
            </div>
          )}

        </>
      ) : null}
    </div>
  );
}
