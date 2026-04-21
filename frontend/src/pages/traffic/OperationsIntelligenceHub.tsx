/**
 * OperationsIntelligenceHub — Centro de Inteligencia Operativa UCOT
 * ─────────────────────────────────────────────────────────────────
 * Módulo unificado que reemplaza los módulos rotos:
 *   - /traffic/intelligence  (Inteligencia Competitiva)
 *   - /traffic/agents        (Agentes Digitales)
 *
 * FUNCIONA SIN BRIDGE SERVER — cascada: LIVE → CACHE → MASTER JSON
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Zap,
  Bot,
  Search,
  RefreshCw,
  Bus,
  AlertTriangle,
  Shield,
  TrendingUp,
  Clock,
  Wifi,
  WifiOff,
  Database,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Activity,
  BarChart3,
  X,
  Timer,
  ChevronDown,
  ChevronUp,
  FileText,
  Radar,
  Eye,
} from 'lucide-react';
import {
  fetchAllLineStatuses,
  fetchAllAgentStatuses,
  fetchGlobalSummary,
  fetchLineSchedule,
  getMasterDataForLine,
  UCOT_LINEAS_REALES,
  type DataSource,
  type LineFleetStatus,
  type AgentStatus,
  type GlobalFleetSummary,
  type LineScheduleResponse,
} from '../../services/operationsIntelligenceService';
import {
  CompetitorIntelligenceEngine,
  type AlertaHoraria,
  type TipoDia,
  type CodiaDia,
} from '../../services/CompetitorIntelligenceEngine';
import {
  generarBriefingDiario,
  type BriefingDiario,
  type AlertaTurno,
  type FranjaCompetencia,
} from '../../services/dailyBriefingService';
import {
  fetchPosicionesSTM,
  generarInformeRival,
  type InformeRival,
  type AnalisisBus,
  type BusSTM,
} from '../../services/rivalTrackerService';
import {
  getVariantsForLine,
  getVariantMaster,
  computeVariantKPIs,
  computeVariantAlerts,
  type VariantKPIs,
  type VariantAlert,
  type Semaforo,
  type BusPositionLite,
} from '../../services/variantIntelligenceService';
import AiCopilotChat from '../../components/AiCopilotChat';
import clsx from 'clsx';

// ─── Tipos de tab ────────────────────────────────────────────────────────────

type Tab = 'intelligence' | 'master' | 'briefing' | 'monitor';
type IntelView = 'operativa' | 'agentes';

// ─── Helpers visuales ────────────────────────────────────────────────────────

function sourceBadge(source: DataSource) {
  if (source === 'LIVE')
    return (
      <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5 uppercase tracking-wider">
        <Wifi className="w-2.5 h-2.5" />
        LIVE · STM
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-[10px] font-black text-slate-400 bg-slate-700/30 border border-slate-600/40 rounded-full px-2 py-0.5 uppercase tracking-wider">
      <Database className="w-2.5 h-2.5" />
      OFFLINE
    </span>
  );
}

function nivelColors(nivel: string) {
  if (nivel === 'ALTA')
    return {
      bg: 'bg-red-500/15',
      border: 'border-red-500/40',
      text: 'text-red-400',
      dot: 'bg-red-500',
    };
  if (nivel === 'MEDIA')
    return {
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/40',
      text: 'text-amber-400',
      dot: 'bg-amber-500',
    };
  if (nivel === 'SIN_DATOS' || nivel === 'SIN_SERVICIO')
    return {
      bg: 'bg-slate-700/30',
      border: 'border-slate-600/40',
      text: 'text-slate-500',
      dot: 'bg-slate-600',
    };
  return {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    dot: 'bg-emerald-500',
  };
}

function posicionColors(p: string) {
  if (p === 'CRITICA') return { text: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' };
  if (p === 'DISPUTADA')
    return { text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' };
  if (p === 'CON_RIVALES')
    return { text: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30' };
  if (p === 'SIN_RIVALES_VISIBLES')
    return { text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
  return { text: 'text-slate-500', bg: 'bg-slate-700/30 border-slate-600/30' };
}

// ─── Base de Datos de Inteligencia Táctica (War Map) ──────────────────────────
const TACTICAL_DATABASE: Record<string, Record<string, { rivales: string[], puntosCarga: string[], estrategia: string }>> = {
  '17': {
    'Punta Carretas': {
      rivales: ['185 (Cutcsa)', '147 (Cutcsa)', '148 (Cutcsa)'],
      puntosCarga: ['Cno. Ramírez y Millán', 'Ciudad Vieja (Aduana)', 'Bvar. Artigas', 'Punta Carretas'],
      estrategia: 'Tramo inicial Casabó → Cno. Ramírez con 185 Cutcsa (solapamiento 75%, freq 12 min); luego Ciudad Vieja → Punta Carretas presionado por 147 (60%, freq 10 min). Disciplina de frecuencia 15 min en pico, límite de adelanto 3 min. Servicio nocturno hasta 23:25 requiere mantener ritmo también fuera de pico.'
    },
    'Terminal Casabó': {
      rivales: ['185 (Cutcsa)', '147 (Cutcsa)'],
      puntosCarga: ['Bvar. Artigas', 'Ciudad Vieja (Aduana)', 'Cno. Ramírez y Millán'],
      estrategia: 'Vuelta bajo presión 147 Cutcsa en Punta Carretas → Ciudad Vieja (freq 10 min) y 185 en Cno. Ramírez. Limpieza de paradas en Bvar. Artigas y Ciudad Vieja (Aduana); no pisar carga al coche UCOT anterior.'
    }
  },
  '79': {
    'Intercambiador Belloni': {
      rivales: ['103 (Cutcsa)', '180 (Cutcsa)', '125 (Cutcsa)'],
      puntosCarga: ['Ciudadela / Plaza Independencia', '18 de Julio y Ejido', 'Av. Italia y Propios', 'Intercambiador Belloni'],
      estrategia: 'CRÍTICO: 103 Cutcsa tiene IDÉNTICO par OD Belloni↔Ciudad Vieja con solapamiento 85% y freq pico 6 min (vs nuestros 25 min). Imposible ganar por frecuencia — estrategia es captación selectiva en cabeceras (Ciudadela carga turistas/centro; Belloni transbordos). Limpieza agresiva en 18 de Julio y Av. Italia y Propios; no perseguir al 103.'
    },
    'Ciudadela (Ciudad Vieja)': {
      rivales: ['103 (Cutcsa)', '125 (Cutcsa)'],
      puntosCarga: ['Av. Italia y Propios', '18 de Julio y Ejido', 'Ciudadela'],
      estrategia: 'Vuelta por mismo corredor con misma presión 103 Cutcsa. Servicio solo diurno (06:00-19:24) — aprovechar demanda de transbordo en Belloni como punto de carga dominante. En sábados/domingos frecuencia baja a 95-100 min, mantener puntualidad estricta.'
    }
  },
  '300': {
    'Plaza Zitarrosa': {
      rivales: ['110 (Cutcsa)', '106 (Cutcsa)', '175 (Cutcsa)'],
      puntosCarga: ['Belloni', 'Intercambiador', '8 de Octubre / Comercio'],
      estrategia: 'Ganar paradas locales (rival a 2-3 min). Límite de adelanto: 5 min para no pisar al compañero. Si el coche de adelante viene atrasado, considerar adelanto para apoyo.'
    },
    'Instrucciones': {
      rivales: ['110 (Cutcsa)', '103 (Cutcsa)', '181 (Cutcsa)'],
      puntosCarga: ['Herrera / 8 de Octubre', 'Intercambiador Belloni'],
      estrategia: 'Vigilar 110 en tramo de 8 de Octubre. Si hay brecha de >3 min con el rival, sugerir posición de bloqueo. Evitar pegarse al coche anterior si este viene cargado.'
    }
  },
  '316': {
    'Pocitos': {
      rivales: ['186 (Cutcsa)', '187 (Cutcsa)', '188 (Cutcsa)'],
      puntosCarga: ['Av. Millán y Garzón', 'Pocitos (Bvar. España)'],
      estrategia: 'Solapamiento 65% con 186 Cutcsa (freq 10 min) en Av. Millán → Garzón → Pocitos. Limpieza agresiva de paradas, margen 2-3 min con el coche UCOT anterior.'
    },
    'Cno Maldonado': {
      rivales: ['186 (Cutcsa)', '188 (Cutcsa)'],
      puntosCarga: ['Cno. Maldonado y Aparicio Saravia', 'Av. Millán y Garzón'],
      estrategia: 'Tramo de captación inicial con baja presión Cutcsa. Prioridad: mantener frecuencia y no adelantar al compañero anterior salvo que traiga retraso >5 min.'
    }
  },
  '306': {
    'Géant': {
      rivales: ['185 (Cutcsa)', 'G (Gómez)'],
      puntosCarga: ['Cno. Ramírez y Millán', 'Ruta 1 (Paso de la Arena)', 'Géant'],
      estrategia: 'Competencia intensiva con 185 Cutcsa (solapamiento 70%, freq 12 min) en Cno. Ramírez → Ruta 1. En tramo Ruta 1 → Géant entra Gómez (freq 20 min). Limpieza agresiva en paradas del corredor compartido, margen 2-3 min con coche UCOT anterior.'
    },
    'Casabó': {
      rivales: ['185 (Cutcsa)'],
      puntosCarga: ['Cno. Ramírez y Millán', 'Paso de la Arena'],
      estrategia: 'Sentido contrario con misma presión Cutcsa 185 en Cno. Ramírez. Mantener 3 min de distancia táctica con compañero UCOT; evitar pisar carga.'
    }
  },
  '328': {
    'Mendoza (Est. Goes)': {
      rivales: ['125 (Cutcsa)', '126 (Cutcsa)', 'D1 (Dinata)'],
      puntosCarga: ['18 de Julio y Ejido', '18 de Julio y Yi', 'Goes y Mendoza'],
      estrategia: 'Corredor 18 de Julio con presión muy alta: 125 Cutcsa (solapamiento 70%, freq 7 min) y 126 (60%, freq 8 min). Limpieza de paradas en 18 de Julio con margen 2 min del coche anterior UCOT. Vigilar D1 Dinata en tramo final Goes→Mendoza.'
    },
    'Punta Carretas': {
      rivales: ['125 (Cutcsa)', '126 (Cutcsa)'],
      puntosCarga: ['18 de Julio y Ejido', '18 de Julio y Yi'],
      estrategia: 'Sentido inverso por 18 de Julio con misma presión Cutcsa. Si hay brecha >3 min con el rival más cercano, oportunidad de captación; no pegarse al compañero UCOT cargado.'
    }
  },
  '329': {
    'Instrucciones (Manga)': {
      rivales: ['181 (Cutcsa)', '182 (Cutcsa)', '183 (Cutcsa)'],
      puntosCarga: ['Av. Italia y Propios', 'Av. Italia y Rivera', 'Instrucciones y Manga'],
      estrategia: 'Av. Italia saturado: 181 Cutcsa solapamiento 75% freq 8 min. Prioridad limpieza de paradas en Av. Italia/Propios y Av. Italia/Rivera, margen 2-3 min con coche UCOT anterior. Tramo final Manga con menor competencia, ritmo normal.'
    },
    'Punta Carretas': {
      rivales: ['181 (Cutcsa)', '182 (Cutcsa)'],
      puntosCarga: ['Av. Italia y Rivera', 'Av. Italia y Propios'],
      estrategia: 'Vuelta por Av. Italia con misma saturación Cutcsa. Mantener frecuencia reglamentaria; adelanto solo si compañero UCOT viene con retraso >5 min.'
    }
  },
  '330': {
    'Ciudad Vieja': {
      rivales: ['148 (Cutcsa)', '185 (Cutcsa)', '147 (Cutcsa)'],
      puntosCarga: ['Cno. Ramírez y Millán', 'Bvar. Batlle y Ordóñez', 'Ciudad Vieja (Aduana)'],
      estrategia: 'Competencia dominante: 148 Cutcsa (solapamiento 80%, freq 8 min) en todo el corredor Cerro → Ciudad Vieja. Limpieza agresiva en Cno. Ramírez y Bvar. Batlle, margen estricto 2 min con coche UCOT anterior. Terminal Aduana: asegurar descenso ordenado.'
    },
    'Cerro (Villa del Cerro)': {
      rivales: ['148 (Cutcsa)', '147 (Cutcsa)'],
      puntosCarga: ['Bvar. Batlle y Ordóñez', 'Cno. Ramírez y Millán'],
      estrategia: 'Sentido vuelta con misma presión 148 Cutcsa. Vigilar brecha con rival y no sobrepasar al compañero UCOT salvo rezago >5 min.'
    }
  },
  '370': {
    'Portones de Carrasco': {
      rivales: ['110 (Cutcsa)', '103 (Cutcsa)', '128 (Cutcsa)', '137 (Cutcsa)'],
      puntosCarga: ['Rambla y Punta Carretas', 'Av. Italia y Propios', 'Portones (Carrasco)'],
      estrategia: 'Corredor crítico: 110 Cutcsa (solapamiento 85%, freq 6 min) y 103 (65%, freq 6 min) en todo Rambla → Av. Italia → Carrasco. Disciplina máxima de frecuencia, límite de adelanto 3 min. Paradas Rambla/Punta Carretas y Av. Italia/Propios son las de mayor carga — no las cede al rival.'
    },
    'Playa del Cerro': {
      rivales: ['110 (Cutcsa)', '103 (Cutcsa)'],
      puntosCarga: ['Av. Italia y Propios', 'Rambla y Punta Carretas'],
      estrategia: 'Vuelta con misma presión 110/103. Recorrido largo (28.7 km) obliga a mantener ritmo reglamentario; no perseguir rivales fuera de tramo UCOT.'
    }
  }
};

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function LineIntelCard({
  line,
  isSelected,
  onClick,
}: {
  line: LineFleetStatus;
  isSelected: boolean;
  onClick: () => void;
}) {
  const colors = nivelColors(line.nivelAlerta);
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left rounded-2xl border p-4 transition-all duration-200
        hover:scale-[1.02] hover:shadow-lg hover:shadow-black/30 cursor-pointer
        ${
          isSelected
            ? 'border-indigo-500/60 bg-indigo-500/10 shadow-md shadow-indigo-500/10'
            : `${colors.border} ${colors.bg}`
        }
      `}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full flex-none ${colors.dot} ${line.nivelAlerta !== 'SIN_SERVICIO' ? 'animate-pulse' : ''}`}
          />
          <span className="text-xl font-extrabold text-white tracking-tight">{line.lineId}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          {line.busesActivos > 0 && (
            <span className="text-[10px] bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded-full">
              {line.busesActivos} bus{line.busesActivos !== 1 ? 'es' : ''}
            </span>
          )}
          <span className={`text-[10px] font-bold uppercase ${colors.text}`}>
            {line.nivelAlerta === 'SIN_SERVICIO' ? 'SIN SERVICIO' : line.nivelAlerta}
          </span>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 truncate mb-3 leading-tight">
        {line.nombreComercial.replace(/^Línea \S+ — /, '')}
      </p>

      {/* Barra de disputa */}
      <div className="space-y-1">
        <div className="h-1.5 rounded-full bg-slate-700/80 overflow-hidden">
          <style>{`#prog-intel-${line.lineId} { width: ${Math.min(line.pctFlotaEnDisputa, 100)}%; }`}</style>
          <div
            id={`prog-intel-${line.lineId}`}
            className={`h-full rounded-full transition-all duration-700 ${
              line.pctFlotaEnDisputa >= 65
                ? 'bg-red-500'
                : line.pctFlotaEnDisputa >= 35
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
            }`}
          />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-600">
            {line.rivalCount} rival{line.rivalCount !== 1 ? 'es' : ''}
          </span>
          <span className={`text-[10px] font-bold ${colors.text}`}>
            {line.pctFlotaEnDisputa}% disputa
          </span>
        </div>
      </div>

      {isSelected && (
        <div className="flex items-center gap-1 mt-2 text-indigo-400 text-[11px] font-medium">
          <ChevronRight className="w-3 h-3" />
          Ver detalle
        </div>
      )}
    </button>
  );
}

function AgentCard({
  agent,
  isSelected,
  onClick,
}: {
  agent: AgentStatus;
  isSelected?: boolean;
  onClick?: () => void;
}) {
  const posColors = posicionColors(agent.posicionCompetitiva);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-2xl border p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/30 cursor-pointer ${
        isSelected
          ? 'border-indigo-500/60 bg-indigo-500/10 shadow-md shadow-indigo-500/10'
          : agent.status === 'OPERATIVO'
            ? 'border-slate-700/60 bg-slate-800/50'
            : 'border-slate-700/30 bg-slate-800/20'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-2.5 h-2.5 rounded-full flex-none ${
              agent.status === 'OPERATIVO'
                ? 'bg-emerald-500 animate-pulse'
                : agent.status === 'ALERTA'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-slate-600'
            }`}
          />
          <div>
            <span className="text-lg font-extrabold text-white tracking-tight">
              Agente {agent.lineId}
            </span>
            <p className="text-[11px] text-slate-500 leading-tight">
              {agent.nombreComercial.replace(/^Línea \S+ — /, '')}
            </p>
          </div>
        </div>
        <Bot
          className={`w-5 h-5 flex-none ${
            agent.status === 'OPERATIVO' ? 'text-indigo-400' : 'text-slate-600'
          }`}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {/* Posición competitiva */}
        <span
          className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border ${posColors.bg} ${posColors.text}`}
        >
          {agent.posicionCompetitiva}
        </span>
        {/* Frecuencia real operada */}
        {agent.frecuenciaActual != null && (
          <span className="text-[10px] text-sky-300 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full">
            Real {agent.frecuenciaActual} min
          </span>
        )}
        {/* Frecuencia oficial (horarios_oficiales) */}
        {agent.frecuenciaProgramadaMin != null && (
          <span className="text-[10px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
            Prog {agent.frecuenciaProgramadaMin} min
          </span>
        )}
        {/* Brecha */}
        {agent.brechaPct != null && agent.frecuenciaProgramadaMin != null && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              Math.abs(agent.brechaPct) < 20
                ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                : Math.abs(agent.brechaPct) < 50
                  ? 'text-amber-300 bg-amber-500/10 border-amber-500/20'
                  : 'text-red-300 bg-red-500/10 border-red-500/20'
            }`}
          >
            {agent.brechaPct > 0 ? '+' : ''}
            {agent.brechaPct}% brecha
          </span>
        )}
        {/* Rivales */}
        {agent.rivalesDetectados > 0 && (
          <span className="text-[10px] text-slate-400 bg-slate-700/50 border border-slate-600/30 px-2 py-0.5 rounded-full">
            {agent.rivalesDetectados} rival{agent.rivalesDetectados !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1">
        {agent.status === 'OPERATIVO' ? (
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
        ) : (
          <XCircle className="w-3 h-3 text-slate-600" />
        )}
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider ${
            agent.status === 'OPERATIVO'
              ? 'text-emerald-400'
              : agent.status === 'ALERTA'
                ? 'text-amber-400'
                : agent.status === 'FUERA_DE_HORA'
                  ? 'text-slate-500'
                  : 'text-slate-600'
          }`}
        >
          {agent.status === 'FUERA_DE_HORA' ? 'Fuera de Hora' : agent.status.replace('_', ' ')}
        </span>
      </div>
    </button>
  );
}

// ─── Panel de Alertas Horarias ─────────────────────────────────────────────

function HorarioAlertsPanel({ alertas }: { alertas: AlertaHoraria[] }) {
  const [mostrarPasadas, setMostrarPasadas] = useState(false);
  const [expandirProximas, setExpandirProximas] = useState(false);

  // Hora actual del sistema en minutos desde medianoche
  const ahora = new Date();
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
  const horaTexto = ahora.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });

  if (alertas.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-none" />
        <span className="text-[11px] text-emerald-300">
          Sin colisiones horarias detectadas. Horario óptimo.
        </span>
      </div>
    );
  }

  // Clasificar alertas por contexto temporal
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  const categorizar = (a: AlertaHoraria): 'AHORA' | 'PROXIMA' | 'PASADA' => {
    const ini = toMin(a.horaInicio);
    const fin = toMin(a.horaFin);
    if (ahoraMin >= ini && ahoraMin < fin) return 'AHORA';
    if (ini > ahoraMin) return 'PROXIMA';
    return 'PASADA';
  };

  // Dentro de cada grupo, ordenar: CRITICA → ALTA → MEDIA → BAJA, luego por hora
  const prioridad = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
  const ordenar = (arr: AlertaHoraria[]) =>
    [...arr].sort((a, b) => {
      const pd = prioridad[a.nivelColision] - prioridad[b.nivelColision];
      if (pd !== 0) return pd;
      return toMin(a.horaInicio) - toMin(b.horaInicio);
    });

  const alertasAhora = ordenar(alertas.filter((a) => categorizar(a) === 'AHORA'));
  const alertasProximas = ordenar(alertas.filter((a) => categorizar(a) === 'PROXIMA'));
  const alertasPasadas = ordenar(alertas.filter((a) => categorizar(a) === 'PASADA'));

  const colisionStyle = (nivel: AlertaHoraria['nivelColision']) =>
    ({
      CRITICA: {
        row: 'bg-red-900/20 border-red-500/25',
        badge: 'bg-red-500/20 text-red-300 border-red-500/30',
        dot: 'bg-red-500',
        minText: 'text-red-400',
      },
      ALTA: {
        row: 'bg-orange-900/15 border-orange-500/25',
        badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
        dot: 'bg-orange-500',
        minText: 'text-orange-400',
      },
      MEDIA: {
        row: 'bg-amber-900/15 border-amber-500/25',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        dot: 'bg-amber-400',
        minText: 'text-amber-400',
      },
      BAJA: {
        row: 'bg-emerald-900/10 border-emerald-500/20',
        badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
        dot: 'bg-emerald-500',
        minText: 'text-emerald-400',
      },
    })[nivel];

  const AlertaCard = ({
    alerta,
    destacada = false,
  }: {
    alerta: AlertaHoraria;
    destacada?: boolean;
  }) => {
    const c = colisionStyle(alerta.nivelColision);
    return (
      <div
        className={`rounded-xl border p-3 ${c.row} ${destacada ? 'ring-1 ring-amber-400/40 shadow-lg shadow-amber-500/10' : ''}`}
      >
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`w-2 h-2 rounded-full flex-none ${c.dot} ${destacada ? 'animate-pulse' : ''}`}
          />
          <span className="text-[11px] font-bold text-slate-200 flex-1">
            {alerta.franja}
            <span className="text-slate-500 font-normal ml-1">
              ({alerta.horaInicio}–{alerta.horaFin})
            </span>
          </span>
          <span className={`text-[10px] font-black border rounded-full px-2 py-0.5 ${c.badge}`}>
            {alerta.rivalEmpresa} L.{alerta.rivalLineId}
          </span>
        </div>

        <div className="flex items-stretch gap-2 mb-2">
          <div className="flex-1 bg-slate-800/60 rounded-lg px-2.5 py-1.5">
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">UCOT</div>
            <div className="text-sm font-black text-sky-400">
              c/{alerta.frecUCOTMin}
              <span className="text-[10px] font-normal text-slate-500">min</span>
            </div>
          </div>
          <div className="flex items-center text-slate-600 text-xs">vs</div>
          <div className="flex-1 bg-slate-800/60 rounded-lg px-2.5 py-1.5">
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">
              {alerta.rivalEmpresa}
            </div>
            <div
              className={`text-sm font-black ${alerta.desventajaFrecMin >= 3 ? 'text-red-400' : 'text-amber-400'}`}
            >
              c/{alerta.frecRivalMin}
              <span className="text-[10px] font-normal text-slate-500">min</span>
            </div>
          </div>
          {alerta.minutosAdelantar > 0 && (
            <div className="flex-none bg-indigo-500/20 border border-indigo-500/30 rounded-lg px-2.5 py-1.5 text-center">
              <div className="text-[9px] text-indigo-400 uppercase tracking-wider mb-0.5">
                Adelantar
              </div>
              <div className={`text-sm font-black ${c.minText}`}>
                -{alerta.minutosAdelantar}
                <span className="text-[10px] font-normal text-slate-500">min</span>
              </div>
            </div>
          )}
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed">{alerta.tactica}</p>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* ── AHORA ─────────────────────────────────────────────── */}
      {alertasAhora.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] font-black text-amber-400 uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
              Ahora · {horaTexto}
            </span>
            <div className="flex-1 h-px bg-amber-500/20" />
          </div>
          {alertasAhora.map((a, i) => (
            <AlertaCard key={i} alerta={a} destacada />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-slate-800/40 border border-slate-700/30 rounded-xl px-3 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
          <span className="text-[11px] text-slate-400">
            Sin colisiones en la franja actual ({horaTexto}) ✓
          </span>
        </div>
      )}

      {/* ── PRÓXIMAS ──────────────────────────────────────────── */}
      {alertasProximas.length > 0 && (
        <div className="space-y-2">
          <button
            title={
              expandirProximas
                ? 'Colapsar próximas franjas'
                : `Ver ${alertasProximas.length} alerta${alertasProximas.length > 1 ? 's' : ''} próxima${alertasProximas.length > 1 ? 's' : ''}`
            }
            onClick={() => setExpandirProximas(!expandirProximas)}
            className="w-full flex items-center gap-2 text-left group"
          >
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-300 transition-colors">
              Próximas · {alertasProximas.length}
            </span>
            <div className="flex-1 h-px bg-slate-700/40" />
            {expandirProximas ? (
              <ChevronUp className="w-3 h-3 text-slate-500" />
            ) : (
              <ChevronDown className="w-3 h-3 text-slate-500" />
            )}
          </button>
          {expandirProximas && alertasProximas.map((a, i) => <AlertaCard key={i} alerta={a} />)}
        </div>
      )}

      {/* ── PASADAS (ocultas por defecto) ─────────────────────── */}
      {alertasPasadas.length > 0 && (
        <div>
          <button
            title={
              mostrarPasadas
                ? 'Ocultar franjas pasadas'
                : `Ver ${alertasPasadas.length} franja${alertasPasadas.length > 1 ? 's' : ''} pasada${alertasPasadas.length > 1 ? 's' : ''}`
            }
            onClick={() => setMostrarPasadas(!mostrarPasadas)}
            className="flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
          >
            {mostrarPasadas ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            {mostrarPasadas
              ? 'Ocultar'
              : `${alertasPasadas.length} franja${alertasPasadas.length > 1 ? 's' : ''} pasada${alertasPasadas.length > 1 ? 's' : ''}`}
          </button>
          {mostrarPasadas && (
            <div className="mt-2 space-y-2 opacity-50">
              {alertasPasadas.map((a, i) => (
                <AlertaCard key={i} alerta={a} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes KPI por variante ────────────────────────────────────────

function semaforoColor(s: Semaforo): { bg: string; border: string; text: string; dot: string; label: string } {
  switch (s) {
    case 'VERDE':
      return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', dot: 'bg-emerald-500', label: 'OK' };
    case 'AMARILLO':
      return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', dot: 'bg-amber-500', label: 'ATENCIÓN' };
    case 'ROJO':
      return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-300', dot: 'bg-red-500', label: 'CRÍTICO' };
    case 'GRIS':
    default:
      return { bg: 'bg-slate-800/40', border: 'border-slate-700/30', text: 'text-slate-400', dot: 'bg-slate-500', label: 'SIN SERVICIO' };
  }
}

function VariantKPIsCard({ kpis }: { kpis: VariantKPIs }) {
  const sem = semaforoColor(kpis.semaforo);
  return (
    <div className={`rounded-xl border p-3 ${sem.bg} ${sem.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${sem.dot} ${kpis.semaforo !== 'GRIS' ? 'animate-pulse' : ''}`} />
          <span className={`text-xs font-black uppercase tracking-wider ${sem.text}`}>{sem.label}</span>
        </div>
        {kpis.sri !== null && (
          <span className="text-[10px] text-slate-400">
            SRI <strong className="text-white">{kpis.sri}</strong>/100
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-900/40 border border-slate-700/30 p-2">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider">Próxima salida</p>
          <p className="text-sm font-black text-white mt-0.5">
            {kpis.proximaSalida ?? '—'}
            {kpis.minutosParaProxima !== null && (
              <span className="text-[10px] text-emerald-400 ml-1">en {kpis.minutosParaProxima}m</span>
            )}
          </p>
        </div>
        <div className="rounded-lg bg-slate-900/40 border border-slate-700/30 p-2">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider">Frec. teórica</p>
          <p className="text-sm font-black text-sky-300 mt-0.5">
            {kpis.frecuenciaTeoricaMin > 0 ? `${kpis.frecuenciaTeoricaMin}m` : '—'}
          </p>
        </div>
        <div className="rounded-lg bg-slate-900/40 border border-slate-700/30 p-2">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider">OTP aprox.</p>
          <p className="text-sm font-black text-white mt-0.5">
            {kpis.otpAprox !== null ? `${kpis.otpAprox}%` : '—'}
          </p>
          <p className="text-[9px] text-slate-500">{kpis.busesEnCorridor}/{kpis.salidasUltimaHora}·1h</p>
        </div>
        <div className="rounded-lg bg-slate-900/40 border border-slate-700/30 p-2">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider">Presión rival</p>
          <p className="text-sm font-black text-red-300 mt-0.5">
            {kpis.rivalPresionHeadwayMin > 0 ? `${kpis.rivalPresionHeadwayMin}m` : '—'}
          </p>
          <p className="text-[9px] text-slate-500">headway rival</p>
        </div>
      </div>
    </div>
  );
}

function AlertFeedCard({ alerts }: { alerts: VariantAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/30 bg-slate-800/40 p-3 text-[11px] text-slate-500">
        <Timer className="w-3 h-3 inline mr-1 text-slate-600" />
        Sin eventos previstos en los próximos 15 min.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {alerts.map((a) => {
        const color =
          a.severidad === 'CRITICO'
            ? { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-300' }
            : a.severidad === 'AVISO'
              ? { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300' }
              : { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-300' };
        return (
          <div key={a.id} className={`rounded-lg border p-2 ${color.bg} ${color.border}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold ${color.text}`}>{a.titulo}</span>
              {a.etaMin !== undefined && (
                <span className="text-[9px] text-slate-400 bg-slate-900/40 border border-slate-700/30 rounded-full px-1.5 py-0.5">
                  {a.etaMin}m
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">{a.detalle}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Panel detalle de línea (Intelligence tab) ───────────────────────────────

function DetailPanel({
  lineId,
  line,
  agent,
  onClose,
  selectedVariantKey,
  setSelectedVariantKey,
  busPositionsForLine,
  informesRivales,
}: {
  lineId: string;
  line: LineFleetStatus | undefined;
  agent: AgentStatus | undefined;
  onClose: () => void;
  selectedVariantKey: string | null;
  setSelectedVariantKey: (k: string | null) => void;
  busPositionsForLine: BusPositionLite[];
  informesRivales: InformeRival[];
}) {
  const [schedule, setSchedule] = useState<LineScheduleResponse | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [tipoDia, setTipoDia] = useState<'Hábiles' | 'Sábados' | 'Domingos'>('Hábiles');

  // Variantes reales scrapeadas del STM (fuente de verdad)
  const variantesReales = useMemo(() => getVariantsForLine(lineId), [lineId]);

  useEffect(() => {
    let cancel = false;
    setScheduleLoading(true);
    fetchLineSchedule(lineId).then((s) => {
      if (cancel) return;
      setSchedule(s);
      if (s?.tipoDiaHoy) setTipoDia(s.tipoDiaHoy);
      // Auto-seleccionar variante principal (primera en orden de volumen)
      if (variantesReales.length > 0) {
        setSelectedVariantKey(variantesReales[0].key);
      }
      setScheduleLoading(false);
    });
    return () => {
      cancel = true;
    };
  }, [lineId]);

  // KPIs + alerts para la variante seleccionada
  const kpis = useMemo(() => {
    if (!selectedVariantKey) return null;
    return computeVariantKPIs({ lineId, variantKey: selectedVariantKey, busPositions: busPositionsForLine });
  }, [lineId, selectedVariantKey, busPositionsForLine]);

  const alerts = useMemo(() => {
    if (!selectedVariantKey) return [];
    return computeVariantAlerts({ lineId, variantKey: selectedVariantKey, busPositions: busPositionsForLine });
  }, [lineId, selectedVariantKey, busPositionsForLine]);

  // Semáforo por variante (para pintar cada botón del selector)
  const semaforosPorVariante = useMemo(() => {
    const map = new Map<string, Semaforo>();
    for (const v of variantesReales) {
      const k = computeVariantKPIs({ lineId, variantKey: v.key, busPositions: busPositionsForLine });
      map.set(v.key, k.semaforo);
    }
    return map;
  }, [lineId, variantesReales, busPositionsForLine]);

  const varianteSel = variantesReales.find((v) => v.key === selectedVariantKey) ?? null;

  const colors = nivelColors(line?.nivelAlerta ?? 'SIN_SERVICIO');
  const posColors = posicionColors(agent?.posicionCompetitiva ?? 'SIN_SERVICIO');
  const categoria = line?.categoria ?? agent?.categoria ?? 'urbana';
  const nombre = line?.nombreComercial ?? agent?.nombreComercial ?? `Línea ${lineId}`;
  const brecha = agent?.brechaPct ?? null;
  const brechaColor =
    brecha === null
      ? 'text-slate-500'
      : Math.abs(brecha) < 15
        ? 'text-emerald-400'
        : Math.abs(brecha) < 35
          ? 'text-amber-400'
          : 'text-red-400';

  const hhmmAhora = schedule?.horaMontevideo ?? new Date().toTimeString().slice(0, 5);

  // Salidas reales (master JSON scrapeado) de la variante seleccionada para el tipoDia activo
  const salidasVariante = useMemo(() => {
    if (!varianteSel) return [] as string[];
    const master = getVariantMaster(lineId, varianteSel.key);
    return master?.horarios[tipoDia]?.salidas ?? [];
  }, [varianteSel, lineId, tipoDia]);

  const proximasSalidas = useMemo(
    () => salidasVariante.filter((s) => s >= hhmmAhora).slice(0, 12),
    [salidasVariante, hhmmAhora]
  );

  return (
    <div className="w-[450px] flex-none border-l border-slate-800/60 flex flex-col overflow-hidden bg-slate-900/60 transition-all duration-300">
      <div className="flex-none px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-white text-base">Línea {lineId}</h2>
          <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[300px]" title={nombre}>
            {nombre}
          </p>
          <p className="text-[9px] text-slate-600 mt-0.5 uppercase tracking-wider">
            {categoria} · ciclo {agent?.cicloMin ?? schedule?.cicloMin ?? '—'}min
          </p>
        </div>
        <button
          title="Cerrar detalle"
          aria-label="Cerrar detalle"
          onClick={onClose}
          className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {/* Nivel alerta + posición competitiva */}
        <div className={`rounded-xl border p-4 ${colors.bg} ${colors.border}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Nivel amenaza</span>
            <span className={`text-sm font-black uppercase ${colors.text}`}>
              {(line?.nivelAlerta ?? 'SIN_SERVICIO').replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Posición</span>
            <span className={`text-[11px] font-black uppercase ${posColors.text}`}>
              {agent?.posicionCompetitiva ?? 'SIN SERVICIO'}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              Flota en disputa
            </span>
            <span className="text-[11px] font-bold text-white">
              {line?.pctFlotaEnDisputa ?? 0}%
            </span>
          </div>
        </div>

        {/* KPIs operativos reales (GPS + horario oficial) */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/30 p-3">
            <p className="text-[9px] text-slate-500 uppercase tracking-wider">Buses activos</p>
            <p className="text-lg font-black text-white mt-0.5">{line?.busesActivos ?? 0}</p>
          </div>
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/30 p-3">
            <p className="text-[9px] text-slate-500 uppercase tracking-wider">Bunching</p>
            <p className="text-lg font-black text-white mt-0.5">{agent?.bunchingPares ?? 0}</p>
            <p className="text-[9px] text-slate-500">pares &lt;0.8km</p>
          </div>
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/30 p-3">
            <p className="text-[9px] text-slate-500 uppercase tracking-wider">Frecuencia real</p>
            <p className="text-lg font-black text-sky-400 mt-0.5">
              {agent?.frecuenciaActual != null ? `${agent.frecuenciaActual}min` : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/30 p-3">
            <p className="text-[9px] text-slate-500 uppercase tracking-wider">Frec. programada</p>
            <p className="text-lg font-black text-indigo-400 mt-0.5">
              {agent?.frecuenciaProgramadaMin != null
                ? `${agent.frecuenciaProgramadaMin}min`
                : '—'}
            </p>
            {brecha !== null && (
              <p className={`text-[10px] font-bold mt-0.5 ${brechaColor}`}>
                {brecha > 0 ? '+' : ''}
                {brecha}% brecha
              </p>
            )}
          </div>
        </div>

        {/* Empresas rivales detectadas (GPS) */}
        {line && line.empresasDetectadas.length > 0 && (
          <div>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Rivales detectados ({line.empresasDetectadas.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {line.empresasDetectadas.map((emp) => (
                <span
                  key={emp}
                  className="text-[10px] font-bold uppercase px-2 py-1 rounded-lg bg-red-500/10 text-red-300 border border-red-500/20"
                >
                  {emp}
                </span>
              ))}
            </div>
            <p className="text-[9px] text-slate-500 mt-1.5">
              Medido por GPS en vivo &lt;0.5km de buses UCOT de esta línea.
            </p>
          </div>
        )}

        {/* GPS Rivales — informes del Monitor (si hay para líneas que compiten con esta) */}
        {(() => {
          const rivalLines = line?.empresasDetectadas.length
            ? informesRivales.filter((inf) =>
                line.empresasDetectadas.some((e) =>
                  inf.empresa.toLowerCase().includes(e.toLowerCase().split(' ')[0]),
                ),
              )
            : informesRivales;
          if (rivalLines.length === 0) return null;
          return (
            <div>
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                <Radar className="w-3 h-3" />
                GPS Rivales en red ({rivalLines.length} monitoreado{rivalLines.length !== 1 ? 's' : ''})
              </h3>
              <div className="space-y-1.5">
                {rivalLines.map((inf) => {
                  const amenazaClr =
                    inf.nivelAmenaza === 'ALTO'
                      ? 'text-red-400 border-red-500/30 bg-red-500/10'
                      : inf.nivelAmenaza === 'MEDIO'
                        ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                        : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
                  return (
                    <div
                      key={inf.lineId}
                      className="flex items-center justify-between bg-slate-800/40 border border-slate-700/30 rounded-xl px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-extrabold text-white">
                          L{inf.lineId}
                        </span>
                        <span className="text-[10px] text-slate-500 truncate">{inf.empresa}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-none">
                        <span className="text-[9px] text-slate-500">
                          {inf.resumen.infracciones > 0 && (
                            <span className="text-red-400 font-bold mr-1">
                              {inf.resumen.infracciones} infracc.
                            </span>
                          )}
                          {inf.buses.length} bus{inf.buses.length !== 1 ? 'es' : ''}
                        </span>
                        <span
                          className={`text-[9px] font-black border rounded-full px-1.5 py-0.5 ${amenazaClr}`}
                        >
                          {inf.nivelAmenaza}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Selector tipoDia para horario oficial */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Horario oficial STM
            </h3>
            {schedule?.tieneHorariosOficiales && schedule.tipoDiaHoy && (
              <span className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                HOY · {schedule.tipoDiaHoy} · {schedule.horaMontevideo}
              </span>
            )}
          </div>
          <div className="bg-slate-800/50 p-1 rounded-xl flex items-center gap-1 mb-2">
            {(['Hábiles', 'Sábados', 'Domingos'] as const).map((td) => (
              <button
                key={td}
                onClick={() => setTipoDia(td)}
                className={`flex-1 text-[10px] py-1.5 rounded-lg font-bold transition-all ${
                  tipoDia === td
                    ? 'bg-indigo-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                {td}
              </button>
            ))}
          </div>

          {scheduleLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-3">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Cargando horarios oficiales...
            </div>
          )}

          {!scheduleLoading && !schedule?.tieneHorariosOficiales && (
            <div className="text-[11px] text-slate-500 bg-slate-800/40 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-3 h-3 inline mr-1 text-amber-500" />
              Sin horario oficial scrapeado aún para esta línea.
              <p className="text-[9px] text-slate-600 mt-1">
                El scraper STM corre todos los días a las 04:00. Algunas líneas metropolitanas
                UCOT usan IDs diferentes en el catálogo STM y quedan pendientes.
              </p>
            </div>
          )}

          {!scheduleLoading && variantesReales.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-4">
                Sentido / Variante (Origen → Destino)
              </h4>
              {variantesReales.map((v) => {
                const isSel = v.key === selectedVariantKey;
                const sem = semaforosPorVariante.get(v.key) ?? 'GRIS';
                const semClr = semaforoColor(sem);
                return (
                  <button
                    key={v.key}
                    onClick={() => setSelectedVariantKey(v.key)}
                    className={`w-full text-left rounded-xl border p-3 transition-all ${
                      isSel
                        ? 'bg-indigo-500/10 border-indigo-500/50 shadow-md shadow-indigo-500/10'
                        : 'bg-slate-800/40 border-slate-700/30 hover:border-slate-500/50 hover:bg-slate-700/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-none ${semClr.dot} ${sem !== 'GRIS' ? 'animate-pulse' : ''}`} />
                        <span
                          className={`text-[11px] font-bold truncate ${isSel ? 'text-indigo-300' : 'text-slate-200'}`}
                          title={`${v.origen} → ${v.destino}`}
                        >
                          {v.origen} → {v.destino}
                        </span>
                      </div>
                      {v.principal && (
                        <span className="text-[9px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-1.5 py-0.5 flex-none">
                          PRINCIPAL
                        </span>
                      )}
                    </div>
                    <div className={`flex items-center gap-3 mt-1.5 text-[10px] ${isSel ? 'text-indigo-200/80' : 'text-slate-400'}`}>
                      <span className="ml-auto">
                        <strong className={isSel ? 'text-indigo-100' : 'text-white'}>{v.totalSalidasHabiles}</strong> salidas hábiles
                      </span>
                    </div>
                  </button>
                );
              })}

              {/* KPIs de la variante seleccionada */}
              {kpis && varianteSel && (
                <div className="mt-4 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    KPIs · {varianteSel.origen} → {varianteSel.destino}
                  </h4>
                  <VariantKPIsCard kpis={kpis} />
                </div>
              )}

              {/* Alert feed próximos 15 min */}
              {varianteSel && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                    <Radar className="w-3 h-3" />
                    Próximos 15 min
                  </h4>
                  <AlertFeedCard alerts={alerts} />
                </div>
              )}

              {/* Estrategia táctica por variante */}
              {varianteSel && (
                <div className="mt-4 rounded-xl bg-slate-800/40 border border-slate-700/30 p-3">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Rivales en esta variante
                  </h4>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {varianteSel.rivales.length > 0 ? (
                      varianteSel.rivales.map((r) => (
                        <span key={r} className="text-[10px] font-bold uppercase px-2 py-1 rounded-lg bg-red-500/10 text-red-300 border border-red-500/20">
                          {r}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-500">Sin rivales verificados.</span>
                    )}
                  </div>
                  {varianteSel.puntosCarga.length > 0 && (
                    <>
                      <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-2 mb-1">
                        Puntos de carga clave
                      </h5>
                      <ul className="text-[10px] text-slate-300 space-y-0.5 list-disc list-inside">
                        {varianteSel.puntosCarga.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <p className="text-[10px] text-slate-300 mt-3 leading-relaxed">
                    <strong className="text-indigo-300">Estrategia:</strong> {varianteSel.estrategia}
                  </p>
                </div>
              )}

              {/* Salidas completas variante seleccionada */}
              {varianteSel && proximasSalidas.length > 0 ? (
                <div className="mt-3 bg-slate-800/40 border border-slate-700/30 p-3 rounded-xl max-h-[300px] overflow-y-auto custom-scrollbar">
                  <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1 sticky top-0 bg-slate-800/90 pb-1 z-10 border-b border-slate-700">
                    <Timer className="w-3 h-3 text-emerald-400" />
                    Próximas salidas {tipoDia} · {varianteSel.destino} ({proximasSalidas.length})
                  </h4>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {proximasSalidas.map((s, i) => (
                      <span
                        key={`${s}-${i}`}
                        className="text-[10px] font-mono border rounded-md px-1.5 py-0.5 text-emerald-300 bg-emerald-900/20 border-emerald-500/30 font-bold"
                        title={`Salida programada: ${s}`}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ) : varianteSel ? (
                <div className="mt-3 bg-slate-800/40 border border-slate-700/30 p-3 rounded-xl text-[10px] text-slate-500">
                  <Timer className="w-3 h-3 inline mr-1 text-slate-600" />
                  No hay más salidas programadas para este sentido hoy ({tipoDia}).
                </div>
              ) : null}

              <p className="text-[9px] text-slate-600 mt-2">
                Fuente: stm.horarios.jsf (scrape) · Total salidas hábiles variante: {varianteSel?.totalSalidasHabiles ?? 0}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── Componente principal ────────────────────────────────────────────────────

export default function OperationsIntelligenceHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  // Compat: la tab 'agents' fue fusionada en 'intelligence' con toggle de vista.
  const initialTab: Tab =
    rawTab === 'agents' || rawTab == null
      ? 'intelligence'
      : (rawTab as Tab);
  const initialView: IntelView = rawTab === 'agents' ? 'agentes' : 'operativa';

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [intelView, setIntelView] = useState<IntelView>(initialView);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [copilotOpen, setCopilotOpen] = useState(false);

  // Intelligence tab state
  const [lines, setLines] = useState<LineFleetStatus[]>([]);
  const [lineSource, setLineSource] = useState<DataSource>('OFFLINE');
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [selectedVariantKey, setSelectedVariantKey] = useState<string | null>(null);
  const [ucotBusPositions, setUcotBusPositions] = useState<BusSTM[]>([]);

  // Derivamos el contexto táctico para el Copiloto desde variantIntelligenceService
  const tacticalContext = useMemo(() => {
    if (!selectedLine) return undefined;
    const variantes = getVariantsForLine(selectedLine);
    if (variantes.length === 0) {
      // Fallback: línea sin variantes scrapeadas aún
      const lineData = TACTICAL_DATABASE[selectedLine];
      if (lineData) {
        const destinos = Object.keys(lineData);
        const destino = destinos[0];
        return { linea: selectedLine, destino, ...lineData[destino] };
      }
      return {
        linea: selectedLine,
        destino: 'General',
        rivales: ['Competencia local STM'],
        puntosCarga: ['Puntos de control'],
        estrategia: 'Mantener frecuencia y vigilar bunching.',
      };
    }
    const sel = variantes.find((v) => v.key === selectedVariantKey) ?? variantes[0];
    return {
      linea: selectedLine,
      destino: `${sel.origen} → ${sel.destino}`,
      rivales: sel.rivales,
      puntosCarga: sel.puntosCarga,
      estrategia: sel.estrategia,
    };
  }, [selectedLine, selectedVariantKey]);

  // Agents tab state
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [agentSource, setAgentSource] = useState<DataSource>('OFFLINE');

  // Global summary
  const [summary, setSummary] = useState<GlobalFleetSummary | null>(null);

  // Briefing tab state
  const [briefing, setBriefing] = useState<BriefingDiario | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  // Monitor GPS tab state
  const [informesRivales, setInformesRivales] = useState<InformeRival[]>([]);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorTs, setMonitorTs] = useState<Date | null>(null);

  const loadingRef = useRef(false);

  const loadData = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);

    try {
      const [linesResult, agentsResult, summaryResult] = await Promise.all([
        fetchAllLineStatuses(),
        fetchAllAgentStatuses(),
        fetchGlobalSummary(),
      ]);

      setLines(linesResult.lines);
      setLineSource(linesResult.source);
      setAgents(agentsResult.agents);
      setAgentSource(agentsResult.source);
      setSummary(summaryResult);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('[OperationsHub] Error cargando datos:', err);
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, []);

  const loadBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const data = await generarBriefingDiario();
      setBriefing(data);
    } catch (err) {
      console.error('[Hub] Error generando briefing:', err);
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  const loadMonitorGPS = useCallback(async () => {
    setMonitorLoading(true);
    try {
      const RIVALES = [
        { lineId: '103', empresa: 'RAINCOOP' },
        { lineId: '109', empresa: 'RAINCOOP' },
        { lineId: 'D1', empresa: 'DINATRA' },
      ];
      const buses = await fetchPosicionesSTM();
      // Persistimos las posiciones UCOT para los KPIs del DetailPanel
      const ucotLineIds = new Set<string>(UCOT_LINEAS_REALES);
      setUcotBusPositions(buses.filter((b) => ucotLineIds.has(b.linea)));
      const informes = await Promise.all(
        RIVALES.map((r) => generarInformeRival(r.lineId, r.empresa, buses)),
      );
      setInformesRivales(informes);
      setMonitorTs(new Date());
    } catch (err) {
      console.error('[Hub] Error cargando monitor GPS:', err);
    } finally {
      setMonitorLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Auto-refresh cada 90 segundos
    const interval = setInterval(loadData, 90_000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Cargar briefing y monitor al montar
  useEffect(() => {
    loadBriefing();
    loadMonitorGPS();
    const monitorInterval = setInterval(loadMonitorGPS, 60_000);
    return () => clearInterval(monitorInterval);
  }, [loadBriefing, loadMonitorGPS]);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  const currentSource =
    activeTab === 'intelligence' && intelView === 'agentes' ? agentSource : lineSource;

  // ─── KPI bar ────────────────────────────────────────────────────────────

  const KPIBar = () => {
    if (activeTab === 'briefing' && briefing) {
      const franjasCriticas = briefing.franjasCompetencia.filter(
        (f) => f.nivelConflicto === 'ALTO',
      ).length;
      const alertasCrit = briefing.alertas.filter((a) => a.prioridad !== 'INFO').length;
      return (
        <div className="flex items-center gap-6 overflow-x-auto">
          <div className="flex items-center gap-2 flex-none">
            <Bus className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs text-slate-400">
              <span className="text-white font-bold">
                {briefing.estadoServicio.totalSalidasHoy}
              </span>{' '}
              salidas hoy
            </span>
          </div>
          <div className="flex items-center gap-2 flex-none">
            <Radar className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs text-slate-400">
              <span className="text-amber-400 font-bold">{franjasCriticas}</span> franjas críticas
            </span>
          </div>
          <div className="flex items-center gap-2 flex-none">
            <Shield className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs text-slate-400">
              <span className="text-red-400 font-bold">
                {briefing.dossierResumen.infraccionesHoy}
              </span>{' '}
              infracc. hoy
            </span>
          </div>
          {alertasCrit > 0 && (
            <div className="flex items-center gap-2 flex-none">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs text-red-400 font-bold">
                {alertasCrit} alerta{alertasCrit !== 1 ? 's' : ''} activa
                {alertasCrit !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-1 text-[10px] text-slate-600 flex-none">
            <Clock className="w-3 h-3" />
            {lastRefresh.toLocaleTimeString('es-UY')}
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-6 overflow-x-auto">
        <div className="flex items-center gap-2 flex-none">
          <Bus className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs text-slate-400">
            <span className="text-white font-bold">{summary?.totalLineas ?? 21}</span> líneas
          </span>
        </div>
        {summary && summary.totalBusesActivos > 0 && (
          <div className="flex items-center gap-2 flex-none">
            <Activity className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs text-slate-400">
              <span className="text-white font-bold">{summary.totalBusesActivos}</span> buses
              activos
            </span>
          </div>
        )}
        {summary && (
          <div className="flex items-center gap-1.5 flex-none">
            <span className="text-xs text-red-400 font-bold">
              {summary.lineasConAlertaAlta}🔴
            </span>
            <span className="text-xs text-slate-600">·</span>
            <span className="text-xs text-amber-400 font-bold">
              {summary.lineasConAlertaMedia}🟡
            </span>
            <span className="text-xs text-slate-600">·</span>
            <span className="text-xs text-emerald-400 font-bold">{summary.lineasOk}🟢</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1 text-[10px] text-slate-600 flex-none">
          <Clock className="w-3 h-3" />
          {lastRefresh.toLocaleTimeString('es-UY')}
        </div>
      </div>
    );
  };

  // ─── Tab: Intelligence ──────────────────────────────────────────────────

  function IntelligenceTab() {
    if (isLoading) {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 p-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-2xl bg-slate-800/40 border border-slate-700/30 animate-pulse"
            />
          ))}
        </div>
      );
    }

    if (lines.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <WifiOff className="w-12 h-12 text-slate-600 mb-4" />
          <p className="text-slate-400 text-sm">Sin datos disponibles.</p>
        </div>
      );
    }

    const operativos = agents.filter((a) => a.status === 'OPERATIVO').length;
    const criticos = agents.filter((a) => a.posicionCompetitiva === 'CRITICA').length;

    return (
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Grid */}
        <div
          className={`flex-1 overflow-y-auto p-4 custom-scrollbar transition-all ${selectedLine ? 'max-w-[calc(100%-380px)]' : ''}`}
        >
          {/* Toggle de vista: Operativa / Agentes */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1 bg-slate-900/60 rounded-xl p-1 border border-slate-800/40">
              {(
                [
                  { id: 'operativa', label: 'Operativa', icon: Search },
                  { id: 'agentes', label: 'Agentes', icon: Bot },
                ] as { id: IntelView; label: string; icon: React.ElementType }[]
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setIntelView(id)}
                  className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[11px] font-bold transition-all ${
                    intelView === id
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>
            {intelView === 'agentes' && (
              <div className="flex items-center gap-3 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-slate-400">
                    <span className="font-bold text-emerald-400">{operativos}</span> operativos
                  </span>
                </div>
                {criticos > 0 && (
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-slate-400">
                      <span className="font-bold text-red-400">{criticos}</span> críticos
                    </span>
                  </div>
                )}
                <span className="text-slate-600">{agents.length} agentes</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {intelView === 'operativa'
              ? lines.map((line) => (
                  <LineIntelCard
                    key={line.lineId}
                    line={line}
                    isSelected={selectedLine === line.lineId}
                    onClick={() =>
                      setSelectedLine(selectedLine === line.lineId ? null : line.lineId)
                    }
                  />
                ))
              : agents.map((agent) => (
                  <AgentCard
                    key={agent.lineId}
                    agent={agent}
                    isSelected={selectedLine === agent.lineId}
                    onClick={() =>
                      setSelectedLine(selectedLine === agent.lineId ? null : agent.lineId)
                    }
                  />
                ))}
          </div>
        </div>

        {/* Detail panel */}
        {selectedLine && (
          <DetailPanel
            lineId={selectedLine}
            line={lines.find((l) => l.lineId === selectedLine)}
            agent={agents.find((a) => a.lineId === selectedLine)}
            onClose={() => setSelectedLine(null)}
            selectedVariantKey={selectedVariantKey}
            setSelectedVariantKey={setSelectedVariantKey}
            busPositionsForLine={ucotBusPositions
              .filter((b) => b.linea === selectedLine)
              .map((b) => ({
                lineId: b.linea,
                lat: b.lat,
                lng: b.lng,
                velocidadKmh: b.velocidad,
                rumboGrados: b.direccion,
                timestamp: b.timestampGPS?.getTime?.(),
              }))}
            informesRivales={informesRivales}
          />
        )}
      </div>
    );
  }

  // ─── Tab: Briefing ──────────────────────────────────────────────────────

  function BriefingTab() {
    if (briefingLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-xs">Generando briefing de turno…</p>
        </div>
      );
    }
    if (!briefing) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <FileText className="w-12 h-12 text-slate-700" />
          <p className="text-slate-500 text-sm">Sin briefing disponible.</p>
          <button
            onClick={loadBriefing}
            className="text-xs text-indigo-400 hover:text-indigo-300 underline"
          >
            Generar ahora
          </button>
        </div>
      );
    }

    const priorityStyle = (p: AlertaTurno['prioridad']) =>
      ({
        CRITICA: 'bg-red-900/25 border-red-500/40 text-red-400',
        ALTA: 'bg-orange-900/20 border-orange-500/35 text-orange-400',
        MEDIA: 'bg-amber-900/15 border-amber-500/30 text-amber-400',
        INFO: 'bg-slate-800/40 border-slate-700/40 text-slate-400',
      })[p];

    const conflictoStyle = (n: FranjaCompetencia['nivelConflicto']) =>
      ({
        ALTO: 'text-red-400 bg-red-500/10 border-red-500/30',
        MEDIO: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
        BAJO: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      })[n];

    const alertasCriticas = briefing.alertas.filter((a) => a.prioridad !== 'INFO');

    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
        {/* Header del briefing */}
        <div className="bg-gradient-to-r from-indigo-900/40 to-slate-800/40 border border-indigo-500/20 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-extrabold text-white">Briefing de Turno</span>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {briefing.turno}
              </span>
            </div>
            <button
              onClick={loadBriefing}
              title="Regenerar briefing"
              className="text-slate-600 hover:text-slate-300 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Generado el {briefing.generadoEn.toLocaleString('es-UY')}
          </p>

          {/* Estado de fuente */}
          <div className="flex items-center gap-2 mt-3">
            {briefing.estadoServicio.fotoDiaDisponible ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-none" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-red-400 flex-none" />
            )}
            <span className="text-[11px] text-slate-400">
              Foto del Día:{' '}
              <span className="font-bold text-slate-200">
                {briefing.estadoServicio.fuenteDatos}
              </span>
              {briefing.estadoServicio.lineasActivas.length > 0 && (
                <>
                  {' '}
                  · Líneas UCOT activas:{' '}
                  <span className="text-sky-300">
                    {briefing.estadoServicio.lineasActivas.join(', ')}
                  </span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Alertas de turno */}
        {alertasCriticas.length > 0 && (
          <div>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Alertas activas ({alertasCriticas.length})
            </h3>
            <div className="space-y-2">
              {briefing.alertas.map((alerta, i) => (
                <div key={i} className={`rounded-xl border p-3 ${priorityStyle(alerta.prioridad)}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/20">
                      {alerta.prioridad}
                    </span>
                    <span className="text-xs font-bold text-slate-200 flex-1">{alerta.titulo}</span>
                    <span className="text-[9px] text-slate-600">{alerta.tipo}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{alerta.descripcion}</p>
                  {alerta.accionRecomendada && (
                    <p className="text-[10px] text-indigo-300 mt-1.5 flex items-start gap-1">
                      <ChevronRight className="w-3 h-3 flex-none mt-0.5" />
                      {alerta.accionRecomendada}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Franjas de competencia */}
        {briefing.franjasCompetencia.length > 0 && (
          <div>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Radar className="w-3 h-3" />
              Franjas de competencia ({briefing.franjasCompetencia.length})
            </h3>
            <div className="space-y-1.5">
              {briefing.franjasCompetencia.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/30 rounded-xl px-3 py-2.5"
                >
                  <Clock className="w-3 h-3 text-slate-500 flex-none" />
                  <span className="text-xs font-mono text-slate-300 w-20 flex-none">
                    {f.horaInicio}–{f.horaFin}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-500 truncate">{f.descripcion}</p>
                  </div>
                  <span
                    className={`text-[10px] font-black border rounded-full px-2 py-0.5 flex-none ${conflictoStyle(f.nivelConflicto)}`}
                  >
                    {f.nivelConflicto}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resumen dossier */}
        <div>
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Dossier Regulatorio
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                label: 'Infracciones ayer',
                value: briefing.dossierResumen.infraccionesAyer,
                color: 'text-amber-400',
              },
              {
                label: 'Infracciones hoy',
                value: briefing.dossierResumen.infraccionesHoy,
                color: 'text-red-400',
              },
              {
                label: 'Infracc. graves (total)',
                value: briefing.dossierResumen.infraccionesGravesTotal,
                color: 'text-red-500',
              },
              {
                label: 'Empresa a vigilar',
                value: briefing.dossierResumen.empresaConMasInfracciones ?? 'N/D',
                color: 'text-orange-400',
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="bg-slate-800/40 border border-slate-700/30 rounded-xl px-3 py-2.5"
              >
                <p className={`text-sm font-extrabold ${color}`}>{value}</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Tab: Monitor GPS ──────────────────────────────────────────────────────

  function MonitorGPSTab() {
    const amenazaStyle = (n: InformeRival['nivelAmenaza']) =>
      ({
        ALTO: {
          bg: 'bg-red-900/25 border-red-500/40',
          text: 'text-red-400',
          dot: 'bg-red-500 animate-pulse',
        },
        MEDIO: {
          bg: 'bg-amber-900/20 border-amber-500/35',
          text: 'text-amber-400',
          dot: 'bg-amber-500 animate-pulse',
        },
        BAJO: {
          bg: 'bg-slate-800/40 border-slate-700/30',
          text: 'text-emerald-400',
          dot: 'bg-emerald-500',
        },
        INCIERTO: {
          bg: 'bg-slate-800/30 border-slate-700/20',
          text: 'text-slate-500',
          dot: 'bg-slate-600',
        },
      })[n];

    const estadoEmoji = (e: AnalisisBus['estado']) =>
      ({
        NORMAL: '✅',
        SOSPECHOSO: '⚠️',
        INFRACCION: '🚨',
        INFRACCION_GRAVE: '⛔',
        INCIERTO: '❓',
        RETRASO: '⏳',
      })[e];

    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radar className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-extrabold text-white">Monitor GPS — Buses Rivales</span>
          </div>
          <div className="flex items-center gap-2">
            {monitorTs && (
              <span className="text-[10px] text-slate-600 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {monitorTs.toLocaleTimeString('es-UY')}
              </span>
            )}
            <button
              onClick={loadMonitorGPS}
              disabled={monitorLoading}
              title="Actualizar monitor GPS"
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 px-2.5 py-1 rounded-xl text-[11px] font-medium transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${monitorLoading ? 'animate-spin' : ''}`} />
              {monitorLoading ? 'Escaneando…' : 'Actualizar'}
            </button>
          </div>
        </div>

        {/* Regla de Oro */}
        <div className="flex items-start gap-2 bg-sky-900/20 border border-sky-500/20 rounded-xl px-3 py-2.5">
          <Shield className="w-3.5 h-3.5 text-sky-400 flex-none mt-0.5" />
          <p className="text-[11px] text-sky-300 leading-relaxed">
            <strong>Regla de Oro:</strong> Solo se acusa trampa con GPS confirmado. Bus sin señal =
            estado INCIERTO (máquina 2G). Nunca acusación falsa.
          </p>
        </div>

        {monitorLoading && informesRivales.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-xs">Rastreando posiciones STM…</p>
          </div>
        )}

        {!monitorLoading && informesRivales.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <WifiOff className="w-10 h-10 text-slate-700" />
            <p className="text-slate-500 text-sm">Sin datos GPS disponibles.</p>
            <p className="text-slate-600 text-xs">
              El bridge en localhost:3099 puede estar offline.
              <br />
              Los datos se actualizan automáticamente cuando esté disponible.
            </p>
          </div>
        )}

        {/* Tarjetas por línea rival */}
        {informesRivales.map((informe) => {
          const s = amenazaStyle(informe.nivelAmenaza);
          return (
            <div key={informe.lineId} className={`rounded-2xl border p-4 space-y-3 ${s.bg}`}>
              {/* Cabecera */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full flex-none ${s.dot}`} />
                  <div>
                    <span className="text-base font-extrabold text-white">
                      Línea {informe.lineId}
                    </span>
                    <span className="text-slate-500 text-xs ml-2">{informe.empresa}</span>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-black uppercase tracking-wide border rounded-full px-2.5 py-0.5 ${s.bg} ${s.text}`}
                >
                  {informe.nivelAmenaza}
                </span>
              </div>

              {/* Contadores */}
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { label: 'Normal', value: informe.resumen.normales, color: 'text-emerald-400' },
                  {
                    label: 'Sospech.',
                    value: informe.resumen.sospechosos,
                    color: 'text-amber-400',
                  },
                  { label: 'Infracc.', value: informe.resumen.infracciones, color: 'text-red-400' },
                  { label: 'Incierto', value: informe.resumen.inciertos, color: 'text-slate-500' },
                  { label: 'Retraso', value: informe.resumen.retrasos, color: 'text-sky-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-900/50 rounded-lg p-1.5 text-center">
                    <p className={`text-sm font-extrabold ${color}`}>{value}</p>
                    <p className="text-[8px] text-slate-600 uppercase tracking-wider">{label}</p>
                  </div>
                ))}
              </div>

              {/* Buses individuales */}
              {informe.buses.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[9px] text-slate-600 uppercase tracking-wider flex items-center gap-1">
                    <Eye className="w-2.5 h-2.5" />
                    {informe.buses.length} bus{informe.buses.length !== 1 ? 'es' : ''} detectado
                    {informe.buses.length !== 1 ? 's' : ''}
                  </p>
                  {informe.buses.map((analisis, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 bg-slate-900/50 rounded-xl px-3 py-2"
                    >
                      <span className="text-base flex-none">{estadoEmoji(analisis.estado)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-slate-300 leading-snug">
                          {analisis.descripcion}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] text-slate-600">
                            Bus #{analisis.bus.idBus}
                          </span>
                          {analisis.deltaMinutos !== null && (
                            <span
                              className={`text-[9px] font-bold ${
                                analisis.deltaMinutos > 5
                                  ? 'text-red-400'
                                  : analisis.deltaMinutos > 2
                                    ? 'text-amber-400'
                                    : 'text-slate-500'
                              }`}
                            >
                              {analisis.deltaMinutos > 0 ? '+' : ''}
                              {analisis.deltaMinutos} min
                            </span>
                          )}
                          <span className="text-[9px] text-slate-700">
                            conf. {analisis.confianza}%
                          </span>
                        </div>
                      </div>
                      {analisis.registrarEnDossier && (
                        <span className="flex-none text-[8px] font-black text-red-400 bg-red-500/10 border border-red-500/30 rounded px-1.5 py-0.5 uppercase">
                          Dossier
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-600 text-center py-2">
                  Sin buses detectados en red STM para esta línea.
                </p>
              )}

              <p className="text-[9px] text-slate-700">
                Actualizado: {informe.ultimaActualizacion.toLocaleTimeString('es-UY')}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  // ─── Tab: Master ────────────────────────────────────────────────────────

  function MasterTab() {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        <p className="text-xs text-slate-500 mb-4 flex items-center gap-2">
          <Database className="w-3.5 h-3.5" />
          Fuente de verdad:{' '}
          <code className="text-sky-400 text-[11px]">ucot_master_intelligence_2026.json</code>·{' '}
          {UCOT_LINEAS_REALES.length} líneas verificadas
        </p>

        <div className="grid grid-cols-1 gap-2">
          {UCOT_LINEAS_REALES.map((lineId) => {
            const { linea, servicios, config } = getMasterDataForLine(lineId);
            return (
              <div
                key={lineId}
                className="flex items-center gap-4 bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3"
              >
                <span className="text-sm font-extrabold text-white w-10 flex-none">{lineId}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-300 truncate">
                    {config?.terminalA ?? '?'} → {config?.terminalB ?? '?'}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {servicios.length} servicio{servicios.length !== 1 ? 's' : ''} ·{' '}
                    {linea?.nombre ?? `Línea ${lineId}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-none">
                  {config ? (
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      Config ✓
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-600 bg-slate-700/30 border border-slate-600/20 px-2 py-0.5 rounded-full">
                      Basic
                    </span>
                  )}
                  {config && (
                    <span className="text-[10px] text-slate-500">
                      {config.rivalesVerificados.length} rivales
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden rounded-xl">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-none px-6 py-4 border-b border-slate-800/60 space-y-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              Centro de Inteligencia UCOT
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              29 líneas UCOT · Telemetría STM en tiempo real
            </p>
          </div>
          <div className="flex items-center gap-2 flex-none">
            {sourceBadge(currentSource)}
            <button
              onClick={loadData}
              disabled={isLoading}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 px-3 py-1.5 rounded-xl text-xs font-medium transition-all disabled:opacity-50 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        {/* KPI Bar */}
        <KPIBar />

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900/60 rounded-xl p-1 border border-slate-800/40 overflow-x-auto">
          {(
            [
              { id: 'intelligence', label: 'Inteligencia', icon: Search },
              { id: 'briefing', label: 'Briefing', icon: FileText },
              { id: 'monitor', label: 'Monitor GPS', icon: Radar },
              { id: 'master', label: 'Maestro', icon: BarChart3 },
            ] as { id: Tab; label: string; icon: React.ElementType }[]
          ).map(({ id, label, icon: Icon }) => {
            const alertCount =
              id === 'briefing'
                ? (briefing?.alertas.filter((a) => a.prioridad !== 'INFO').length ?? 0)
                : 0;
            return (
              <button
                key={id}
                onClick={() => switchTab(id)}
                className={`flex-none flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  activeTab === id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {alertCount > 0 && (
                  <span
                    className={`text-[9px] font-black rounded-full px-1.5 py-0.5 min-w-[16px] text-center leading-none ${
                      activeTab === id
                        ? 'bg-white/20 text-white'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Contenido por tab ──────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === 'intelligence' && <IntelligenceTab />}
        {activeTab === 'briefing' && <BriefingTab />}
        {activeTab === 'monitor' && <MonitorGPSTab />}
        {activeTab === 'master' && <MasterTab />}
      </div>

      {/* ── Copiloto Táctico (floating, visible en todos los tabs) ─────────── */}
      <button
        onClick={() => setCopilotOpen((v) => !v)}
        className={clsx(
          'fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all',
          copilotOpen
            ? 'bg-slate-700 text-white hover:bg-slate-600'
            : 'bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-105',
        )}
        aria-label={copilotOpen ? 'Cerrar copiloto' : 'Abrir copiloto táctico'}
        title="Copiloto Táctico UCOT"
      >
        <Bot className="w-5 h-5" />
        <span className="text-sm font-semibold hidden sm:inline">
          {copilotOpen ? 'Cerrar' : 'Copiloto'}
        </span>
      </button>

      {copilotOpen && (
        <div className="fixed bottom-24 right-6 z-40 w-[calc(100vw-3rem)] sm:w-[420px] h-[600px] max-h-[calc(100vh-8rem)] shadow-2xl">
          <AiCopilotChat 
            className="h-full" 
            initialContext={tacticalContext}
          />
        </div>
      )}
    </div>
  );
}

