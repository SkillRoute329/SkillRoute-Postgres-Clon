/**
 * AnalisisEtapas — OTP por parada a lo largo del recorrido
 *
 * Muestra una línea de tiempo de paradas coloreadas por nivel de demora.
 * Datos desde la colección `etapa_stats` generada cada 30 min por etapaStatsTick.
 * Permite detectar qué tramos del recorrido concentran los atrasos para solicitar
 * ajuste de horarios ante el STM.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  MapPin, TrendingDown, Clock, ChevronRight, ChevronLeft,
  AlertTriangle, CheckCircle, BarChart2, Navigation,
} from 'lucide-react';
import {
  fetchEtapaLineas,
  fetchEtapaStats,
  type EtapaStatsDoc,
  type ParadaStat,
} from '../../services/etapaStatsService';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';

const AGENCIAS = [
  { id: '70', nombre: 'UCOT'   },
  { id: '50', nombre: 'CUTCSA' },
  { id: '20', nombre: 'COME'   },
  { id: '10', nombre: 'COETC'  },
] as const;

// ──────────────────── helpers visuales ────────────────────────────────────────

function nivelDemora(pctAtrasado: number, desviacionMin: number): 'ok' | 'leve' | 'moderado' | 'critico' {
  if (pctAtrasado <= 10 && desviacionMin <= 3) return 'ok';
  if (pctAtrasado <= 30 || desviacionMin <= 8) return 'leve';
  if (pctAtrasado <= 55 || desviacionMin <= 18) return 'moderado';
  return 'critico';
}

const NIVEL_STYLE = {
  ok:       { circle: 'bg-emerald-500', text: 'text-emerald-400', label: 'En tiempo' },
  leve:     { circle: 'bg-yellow-400',  text: 'text-yellow-400',  label: 'Leve'      },
  moderado: { circle: 'bg-orange-400',  text: 'text-orange-400',  label: 'Moderado'  },
  critico:  { circle: 'bg-red-500',     text: 'text-red-400',     label: 'Crítico'   },
};

// ──────────────────── sub-componentes ─────────────────────────────────────────

function StopDot({
  parada, selected, onClick,
}: { parada: ParadaStat; selected: boolean; onClick: () => void }) {
  const nivel  = nivelDemora(parada.pctAtrasado, parada.desviacionMediaMin);
  const styles = NIVEL_STYLE[nivel];
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 group cursor-pointer focus:outline-none"
    >
      <div className={`
        w-4 h-4 rounded-full transition-all duration-200 ring-2
        ${styles.circle}
        ${selected ? 'ring-white scale-150' : 'ring-transparent group-hover:ring-slate-400 group-hover:scale-125'}
      `} />
      <span className="text-[9px] text-slate-500 max-w-[52px] text-center leading-tight truncate group-hover:text-slate-300 transition-colors">
        {parada.nombre.split(/\s+/).slice(0, 2).join(' ')}
      </span>
    </button>
  );
}

function StopDetail({ parada, onClose }: { parada: ParadaStat; onClose: () => void }) {
  const nivel  = nivelDemora(parada.pctAtrasado, parada.desviacionMediaMin);
  const styles = NIVEL_STYLE[nivel];
  const horas  = Object.entries(parada.byHour)
    .map(([h, s]) => ({ h: parseInt(h), ...s }))
    .sort((a, b) => a.h - b.h);

  return (
    <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-4 mt-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-sm font-bold text-slate-100">{parada.nombre}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${styles.text} bg-slate-800`}>
              {styles.label}
            </span>
          </div>
          <p className="text-xs text-slate-500 ml-6">{parada.total} observaciones registradas</p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xs shrink-0">✕</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">En Tiempo</p>
          <p className="text-xl font-black text-emerald-400">{parada.pctEnTiempo}%</p>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Atrasado</p>
          <p className={`text-xl font-black ${styles.text}`}>{parada.pctAtrasado}%</p>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Desv. media</p>
          <p className={`text-xl font-black ${styles.text}`}>
            {parada.desviacionMediaMin > 0 ? `+${parada.desviacionMediaMin}` : parada.desviacionMediaMin} min
          </p>
        </div>
      </div>

      {/* Perfil horario */}
      {horas.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Perfil por hora</p>
          <div className="flex items-end gap-1 h-16">
            {horas.map(({ h, pctAtrasado, desviacionMedia }) => (
              <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${Math.max(4, Math.min(60, pctAtrasado))}px`,
                    background: pctAtrasado > 55 ? '#ef4444' : pctAtrasado > 30 ? '#fb923c' : pctAtrasado > 10 ? '#facc15' : '#34d399',
                  }}
                  title={`${h}:00 — ${pctAtrasado}% tarde, ${desviacionMedia} min avg`}
                />
                <span className="text-[8px] text-slate-600">{h}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 mt-1">Altura = % de buses atrasados en esa hora</p>
        </div>
      )}
    </div>
  );
}

// ──────────────────── página principal ────────────────────────────────────────

export default function AnalisisEtapas() {
  const { empresaPropia, setEmpresaPropia } = useEmpresaPropia();
  const [agencyId, setAgencyId] = useState<string>(() => String(empresaPropia));

  const [lineas, setLineas]             = useState<string[]>([]);
  const [lineaSeleccionada, setLinea]   = useState<string>('');
  const [sentido, setSentido]           = useState<0 | 1>(0);
  const [stats, setStats]               = useState<EtapaStatsDoc | null>(null);
  const [loadingLineas, setLoadingLineas] = useState(true);
  const [loadingStats, setLoadingStats]   = useState(false);
  const [paradaActiva, setParadaActiva]   = useState<ParadaStat | null>(null);
  const [error, setError]               = useState<string | null>(null);

  // Cargar lista de líneas disponibles — resetea línea y stats al cambiar empresa
  useEffect(() => {
    setLinea('');
    setStats(null);
    setParadaActiva(null);
    setLoadingLineas(true);
    fetchEtapaLineas(agencyId)
      .then(ls => { setLineas(ls); if (ls.length) setLinea(ls[0]); })
      .catch(() => setError('No se pudieron cargar las líneas.'))
      .finally(() => setLoadingLineas(false));
  }, [agencyId]);

  // Cargar estadísticas cuando cambia línea o sentido
  useEffect(() => {
    if (!lineaSeleccionada) return;
    setLoadingStats(true);
    setParadaActiva(null);
    setError(null);
    fetchEtapaStats(agencyId, lineaSeleccionada, sentido)
      .then(s => {
        setStats(s);
        if (!s) setError(`Sin datos para L${lineaSeleccionada} ${sentido === 0 ? 'IDA' : 'VUELTA'}. La función acumula datos cada 30 min.`);
      })
      .catch(() => setError('Error al cargar los datos de etapas.'))
      .finally(() => setLoadingStats(false));
  }, [agencyId, lineaSeleccionada, sentido]);

  const peorParada = useMemo(() => {
    if (!stats?.paradas.length) return null;
    return stats.paradas.reduce((worst, p) => p.pctAtrasado > worst.pctAtrasado ? p : worst, stats.paradas[0]);
  }, [stats]);

  const avgDemora = useMemo(() => {
    if (!stats?.paradas.length) return 0;
    const atrasadas = stats.paradas.filter(p => p.atrasados > 0);
    if (!atrasadas.length) return 0;
    return Math.round(atrasadas.reduce((s, p) => s + p.desviacionMediaMin, 0) / atrasadas.length);
  }, [stats]);

  return (
    <div className="min-h-screen bg-slate-950 text-white px-4 py-6 md:px-8">
      {/* Glow */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/3 w-96 h-96 bg-blue-700/5 rounded-full blur-[160px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-orange-700/4 rounded-full blur-[160px]" />
      </div>

      {/* Encabezado */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Navigation className="w-5 h-5 text-blue-400" />
          <h1 className="text-2xl font-bold text-slate-200">Análisis por Etapa</h1>
        </div>
        <p className="text-sm text-slate-400">
          OTP parada a parada — detecta dónde se acumula el atraso en cada recorrido
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Selector de empresa */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/50 rounded-xl px-3 py-2">
          <span className="text-xs text-slate-500">Empresa</span>
          <select
            value={agencyId}
            onChange={e => { setAgencyId(e.target.value); setEmpresaPropia(Number(e.target.value)); }}
            className="bg-transparent text-slate-200 text-sm font-semibold focus:outline-none"
          >
            {AGENCIAS.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>

        {/* Selector de línea */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/50 rounded-xl px-3 py-2">
          <span className="text-xs text-slate-500">Línea</span>
          {loadingLineas
            ? <span className="text-xs text-slate-400 animate-pulse">cargando…</span>
            : lineas.length === 0
              ? <span className="text-xs text-slate-500 italic">Sin datos aún — acumula c/30 min</span>
              : (
              <select
                value={lineaSeleccionada}
                onChange={e => setLinea(e.target.value)}
                className="bg-transparent text-slate-200 text-sm font-semibold focus:outline-none"
              >
                {lineas.map(l => <option key={l} value={l}>L{l}</option>)}
              </select>
            )}
        </div>

        <div className="flex rounded-xl overflow-hidden border border-slate-700/50">
          <button
            onClick={() => setSentido(0)}
            className={`px-4 py-2 text-xs font-semibold transition-colors ${sentido === 0 ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
          >
            <ChevronRight className="w-3.5 h-3.5 inline mr-1" />IDA
          </button>
          <button
            onClick={() => setSentido(1)}
            className={`px-4 py-2 text-xs font-semibold transition-colors ${sentido === 1 ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
          >
            <ChevronLeft className="w-3.5 h-3.5 inline mr-1" />VUELTA
          </button>
        </div>

        {stats?.updatedAt && (
          <span className="text-xs text-slate-600 flex items-center gap-1 ml-auto">
            <Clock className="w-3 h-3" />
            Actualizado {stats.updatedAt.toLocaleString('es-UY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Paradas en ruta</p>
            <p className="text-3xl font-black text-blue-400">{stats.paradas.length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Observaciones</p>
            <p className="text-3xl font-black text-slate-200">{stats.totalEventos.toLocaleString()}</p>
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Demora media</p>
            <p className={`text-3xl font-black ${avgDemora > 10 ? 'text-red-400' : avgDemora > 4 ? 'text-yellow-400' : 'text-emerald-400'}`}>
              {avgDemora > 0 ? `+${avgDemora}` : avgDemora} min
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Parada crítica</p>
            <p className="text-sm font-bold text-red-400 leading-tight mt-1">
              {peorParada ? peorParada.nombre.split(/\s+/).slice(0, 3).join(' ') : '—'}
            </p>
            {peorParada && (
              <p className="text-xs text-slate-500">{peorParada.pctAtrasado}% tarde</p>
            )}
          </div>
        </div>
      )}

      {/* Línea de tiempo de paradas */}
      {loadingStats && (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <span className="text-sm animate-pulse">Cargando datos de etapas…</span>
        </div>
      )}

      {!loadingStats && error && (
        <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-700/40 rounded-xl px-4 py-3 text-slate-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 text-yellow-500" />
          {error}
        </div>
      )}

      {!loadingStats && !error && stats && stats.paradas.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-300">
                Recorrido L{lineaSeleccionada} — {sentido === 0 ? 'IDA' : 'VUELTA'}
              </span>
            </div>
            {/* Leyenda */}
            <div className="hidden md:flex items-center gap-3">
              {(Object.keys(NIVEL_STYLE) as Array<keyof typeof NIVEL_STYLE>).map(n => (
                <div key={n} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded-full ${NIVEL_STYLE[n].circle}`} />
                  <span className="text-xs text-slate-500">{NIVEL_STYLE[n].label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Scroll horizontal de paradas */}
          <div className="overflow-x-auto pb-2">
            <div className="flex items-start gap-0 min-w-max">
              {stats.paradas.map((p, i) => (
                <div key={p.stopId || i} className="flex items-start">
                  <StopDot
                    parada={p}
                    selected={paradaActiva?.paradaIdx === p.paradaIdx}
                    onClick={() => setParadaActiva(paradaActiva?.paradaIdx === p.paradaIdx ? null : p)}
                  />
                  {i < stats.paradas.length - 1 && (
                    <div className="h-px w-8 bg-slate-700 mt-2 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Panel de detalle de la parada seleccionada */}
          {paradaActiva && (
            <StopDetail parada={paradaActiva} onClose={() => setParadaActiva(null)} />
          )}

          {!paradaActiva && (
            <p className="text-xs text-slate-600 mt-3 text-center">
              Toca una parada para ver el detalle horario
            </p>
          )}
        </div>
      )}

      {!loadingStats && !error && stats && stats.paradas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <CheckCircle className="w-14 h-14 text-emerald-500/60" />
          <p className="text-slate-200 font-semibold">Sin datos de etapas aún</p>
          <p className="text-slate-500 text-sm max-w-xs">
            La función acumula datos cada 30 minutos. Volvé a revisar en el próximo ciclo.
          </p>
        </div>
      )}

      {/* Nota metodológica */}
      <div className="mt-6 bg-slate-900/40 border border-slate-700/30 rounded-xl px-4 py-3">
        <div className="flex items-start gap-2">
          <TrendingDown className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="text-slate-400 font-semibold">Metodología:</span> Cada posición GPS se asigna a la parada GTFS más cercana (≤400m)
            del recorrido. La desviación se calcula comparando la hora real con el horario programado para esa parada.
            Tolerancia ±4 min = EN TIEMPO. Fuentes: IMM STM GPS + GTFS oficial IMM.
          </p>
        </div>
      </div>
    </div>
  );
}
