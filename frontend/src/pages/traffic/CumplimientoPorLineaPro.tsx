/**
 * CumplimientoPorLineaPro.tsx — vista profesional "Por Línea"
 * ============================================================
 *
 * Reemplazo de la pestaña "Por Línea" del hub de Cumplimiento.
 *
 * UX (lo que faltaba):
 *   1. Selector de día (últimos 7) + sentido IDA/VUELTA.
 *   2. Lista de líneas del operador con % cumplimiento agregado del día.
 *   3. Al seleccionar una línea, abre la MATRIZ DE PUNTOS DE CONTROL:
 *        Filas (sticky): cada parada/punto de control detectada en los GPS
 *                        de esa línea+sentido+día.
 *        Columnas (sticky): cada coche que operó ese día + cuántas vueltas hizo.
 *        Celdas: lista de hora real (UY) + desviación (color-coded ±min).
 *   4. Footer del día: total pases, % en tiempo, peor parada, mejor coche.
 *
 * Datos: SOLO `vehicle_events` (Firestore). Cero datos simulados, cero
 *        hardcode. Si una línea no tiene eventos, se muestra "Sin datos".
 */

import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import {
  collection, getDocs, limit, orderBy, query, where,
} from 'firebase/firestore';
import {
  RefreshCw, ChevronLeft, AlertTriangle, CheckCircle, Clock,
  MapPin, Bus, Search, Calendar, ArrowRight, ArrowLeft, TrendingDown,
  TrendingUp, BarChart3, Activity,
} from 'lucide-react';
import { db, authReady } from '../../config/firebase';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';

// Vista "Auditoría estilo IMM" (timeline de control points + pasadas reales).
// Lazy para no cargarla hasta que el usuario haga click en "Auditoría".
const AuditoriaLineaTimeline = lazy(() => import('./AuditoriaLineaTimeline'));

/* ─── Constantes ───────────────────────────────────────── */

const AGENCIAS: Record<string, string> = {
  '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};
const TZ = 'America/Montevideo';
const TOL_EN_TIEMPO_MIN = 4;

/* ─── Tipos ────────────────────────────────────────────── */

type Estado = 'EN_TIEMPO' | 'ADELANTADO' | 'ATRASADO' | 'SIN_HORARIO' | 'FUERA_DE_SERVICIO';
type Sentido = 'IDA' | 'VUELTA' | 'TODOS';

interface VehicleEvent {
  idBus: string;
  empresa: string;
  linea: string;
  sentido: 'IDA' | 'VUELTA' | null;
  estadoCumplimiento: Estado;
  desviacionMin: number | null;
  proximaParada: string | null;
  timestampGPS: string;
  velocidad?: number;
}

interface LineaResumen {
  linea: string;
  sentido: 'IDA' | 'VUELTA' | null;
  totalEventos: number;
  cochesActivos: number;
  pctEnTiempo: number;
  pctAtrasado: number;
  pctAdelantado: number;
  pctSinHorario: number;
}

interface PaseEnParada {
  ts: string;
  desv: number | null;
  estado: Estado;
}

interface CocheEnLinea {
  idBus: string;
  totalEventos: number;
  paradasUnicas: number;
  pctEnTiempo: number;
  desviacionMedia: number | null;
  primerEvento: string;
  ultimoEvento: string;
}

interface MatrizLinea {
  paradas: Array<{ nombre: string; primeraHora: number }>; // primeraHora = avg minutos UYT para ordenar por recorrido
  coches: CocheEnLinea[];
  pasesPorParadaCoche: Map<string, PaseEnParada[]>; // key = `${parada}__${idBus}`
  totalEventos: number;
  pctEnTiempoLinea: number;
  peorParada: { nombre: string; pctAtrasado: number } | null;
}

/* ─── Helpers de fecha (zona MVD) ─────────────────────── */

function ymdMvd(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3600_000);
  return local.toISOString().slice(0, 10);
}
function startOfDayMvd(ymd: string): Date {
  // ymd es 'YYYY-MM-DD' interpretado como inicio de día UY (UTC-3)
  return new Date(`${ymd}T00:00:00-03:00`);
}
function endOfDayMvd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999-03:00`);
}
function fmtHoraUY(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-UY', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}
function fmtFechaCorta(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00-03:00`);
  return d.toLocaleDateString('es-UY', { weekday: 'short', day: '2-digit', month: 'short' });
}
function minutosUYT(iso: string): number {
  const d = new Date(iso);
  const local = new Date(d.getTime() - 3 * 3600_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}
function normLineaCode(l: string): string {
  return String(l ?? '').trim().replace(/^0+/, '') || '0';
}
function ultimosDias(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() - i * 24 * 3600_000);
    out.push(ymdMvd(d));
  }
  return out;
}

/* ─── Helpers visuales ────────────────────────────────── */

function badgeDesv(desv: number | null): React.ReactNode {
  if (desv === null) {
    return <span className="text-slate-600 text-[10px]">—</span>;
  }
  const abs = Math.abs(desv);
  const signo = desv > 0 ? '+' : desv < 0 ? '' : '±';
  if (abs <= TOL_EN_TIEMPO_MIN) {
    return <span className="text-emerald-400 text-[10px] font-bold">{signo}{desv} min</span>;
  }
  if (desv > 0) {
    return <span className="text-red-400 text-[10px] font-bold">{signo}{desv} min</span>;
  }
  return <span className="text-orange-400 text-[10px] font-bold">{signo}{desv} min</span>;
}

function colorCelda(desv: number | null): string {
  if (desv === null) return 'bg-slate-800/40';
  const abs = Math.abs(desv);
  if (abs <= TOL_EN_TIEMPO_MIN) return 'bg-emerald-500/10 border-emerald-500/30';
  if (desv > 0) return abs > 8 ? 'bg-red-500/15 border-red-500/40' : 'bg-yellow-500/10 border-yellow-500/30';
  return abs > 5 ? 'bg-orange-500/15 border-orange-500/40' : 'bg-yellow-500/10 border-yellow-500/30';
}

/* ─── Componente principal ────────────────────────────── */

export default function CumplimientoPorLineaPro() {
  const { empresaPropia } = useEmpresaPropia();
  const agencyId = String(empresaPropia);
  const dias7 = useMemo(() => ultimosDias(7), []);

  const [diaSeleccionado, setDiaSeleccionado] = useState<string>(dias7[0]);
  const [sentido, setSentido] = useState<Sentido>('TODOS');
  const [filtroLinea, setFiltroLinea] = useState('');
  const [lineaSeleccionada, setLineaSeleccionada] = useState<string | null>(null);
  // 'AMBOS' incluye eventos con sentido null (detector de bearing no concluyente)
  const [sentidoMatriz, setSentidoMatriz] = useState<'IDA' | 'VUELTA' | 'AMBOS'>('AMBOS');
  // Si está set, abre la vista Auditoría estilo IMM en pantalla completa.
  const [auditoriaLinea, setAuditoriaLinea] = useState<string | null>(null);

  const [eventos, setEventos] = useState<VehicleEvent[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<string | null>(null);

  /* ── Carga: vehicle_events del operador para el día seleccionado ─ */

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      // Espera explícita a que el SDK de auth resuelva en cold start
      // (evita "permission-denied" con persistentMultipleTabManager).
      await authReady;
      const since = startOfDayMvd(diaSeleccionado).toISOString();
      const until = endOfDayMvd(diaSeleccionado).toISOString();
      // Importante: orderBy DESC para usar el índice existente
      // (agencyId ASC + timestampGPS DESC). Re-ordenamos en memoria si hace falta.
      const snap = await getDocs(query(
        collection(db, 'vehicle_events'),
        where('agencyId', '==', agencyId),
        where('timestampGPS', '>=', since),
        where('timestampGPS', '<=', until),
        orderBy('timestampGPS', 'desc'),
        limit(8000),
      ));
      const evs: VehicleEvent[] = [];
      for (const d of snap.docs) {
        const ev = d.data() as VehicleEvent;
        if (ev.estadoCumplimiento === 'FUERA_DE_SERVICIO') continue;
        const ln = normLineaCode(ev.linea ?? '');
        if (!ln || ln === '0') continue;
        evs.push({ ...ev, linea: ln });
      }
      setEventos(evs);
      setActualizado(new Date().toISOString());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setEventos([]);
    } finally {
      setCargando(false);
    }
  }, [agencyId, diaSeleccionado]);

  useEffect(() => { cargar(); }, [cargar]);

  // Reset filtro de línea al cambiar operador
  useEffect(() => {
    setLineaSeleccionada(null);
    setFiltroLinea('');
  }, [agencyId]);

  /* ── Resúmenes por línea+sentido para el día ───────── */

  const resumenLineas: LineaResumen[] = useMemo(() => {
    const grupos: Record<string, VehicleEvent[]> = {};
    for (const ev of eventos) {
      if (sentido !== 'TODOS' && ev.sentido !== sentido) continue;
      const k = `${ev.linea}__${ev.sentido ?? 'N'}`;
      (grupos[k] ||= []).push(ev);
    }
    const lista: LineaResumen[] = [];
    for (const [k, evs] of Object.entries(grupos)) {
      const [linea, sRaw] = k.split('__');
      const sent = sRaw === 'IDA' || sRaw === 'VUELTA' ? sRaw : null;
      const conHorario = evs.filter(e => e.estadoCumplimiento !== 'SIN_HORARIO');
      const base = conHorario.length || evs.length;
      const enT = conHorario.filter(e => e.estadoCumplimiento === 'EN_TIEMPO').length;
      const atr = conHorario.filter(e => e.estadoCumplimiento === 'ATRASADO').length;
      const adl = conHorario.filter(e => e.estadoCumplimiento === 'ADELANTADO').length;
      const sin = evs.length - conHorario.length;
      const coches = new Set(evs.map(e => e.idBus));
      lista.push({
        linea, sentido: sent,
        totalEventos: evs.length,
        cochesActivos: coches.size,
        pctEnTiempo:   base > 0 ? Math.round((enT / base) * 100) : 0,
        pctAtrasado:   base > 0 ? Math.round((atr / base) * 100) : 0,
        pctAdelantado: base > 0 ? Math.round((adl / base) * 100) : 0,
        pctSinHorario: evs.length > 0 ? Math.round((sin / evs.length) * 100) : 0,
      });
    }
    lista.sort((a, b) => {
      const na = parseInt(a.linea, 10) || 0;
      const nb = parseInt(b.linea, 10) || 0;
      if (na !== nb) return na - nb;
      const ord = (s: 'IDA' | 'VUELTA' | null) => s === 'IDA' ? 0 : s === 'VUELTA' ? 1 : 2;
      return ord(a.sentido) - ord(b.sentido);
    });
    return lista;
  }, [eventos, sentido]);

  const lineasFiltradas = useMemo(() => {
    if (!filtroLinea.trim()) return resumenLineas;
    const q = filtroLinea.trim().toLowerCase();
    return resumenLineas.filter(l => l.linea.toLowerCase().includes(q));
  }, [resumenLineas, filtroLinea]);

  /* ── Matriz para la línea seleccionada ─────────────── */

  const matriz: MatrizLinea | null = useMemo(() => {
    if (!lineaSeleccionada) return null;
    const evs = eventos.filter(e => {
      if (e.linea !== lineaSeleccionada) return false;
      if (sentidoMatriz === 'AMBOS') return true;
      // En modos IDA/VUELTA estricto incluímos también null (detector no concluyente)
      // para no perder pasadas — el sentido real es responsabilidad del backend.
      return e.sentido === sentidoMatriz || e.sentido === null;
    });
    if (evs.length === 0) return null;

    // Agrupar pases por (parada, idBus)
    const pases = new Map<string, PaseEnParada[]>();
    const horaAcum: Record<string, { sum: number; n: number }> = {};
    const cocheStats: Record<string, {
      total: number; conHorario: number; enT: number; sumDesv: number; sumDesvN: number;
      paradasUnicas: Set<string>; primerTs: string; ultimoTs: string;
    }> = {};

    for (const ev of evs) {
      const parada = (ev.proximaParada ?? '').trim() || 'Sin parada identificada';
      const k = `${parada}__${ev.idBus}`;
      const arr = pases.get(k) ?? [];
      arr.push({ ts: ev.timestampGPS, desv: ev.desviacionMin, estado: ev.estadoCumplimiento });
      pases.set(k, arr);

      // Acumular hora promedio para ordenar paradas por recorrido
      const acum = horaAcum[parada] ?? { sum: 0, n: 0 };
      acum.sum += minutosUYT(ev.timestampGPS);
      acum.n += 1;
      horaAcum[parada] = acum;

      // Stats por coche
      const cs = cocheStats[ev.idBus] ?? {
        total: 0, conHorario: 0, enT: 0, sumDesv: 0, sumDesvN: 0,
        paradasUnicas: new Set<string>(), primerTs: ev.timestampGPS, ultimoTs: ev.timestampGPS,
      };
      cs.total += 1;
      cs.paradasUnicas.add(parada);
      if (ev.timestampGPS < cs.primerTs) cs.primerTs = ev.timestampGPS;
      if (ev.timestampGPS > cs.ultimoTs) cs.ultimoTs = ev.timestampGPS;
      if (ev.estadoCumplimiento !== 'SIN_HORARIO') {
        cs.conHorario += 1;
        if (ev.estadoCumplimiento === 'EN_TIEMPO') cs.enT += 1;
      }
      if (ev.desviacionMin !== null && ev.desviacionMin !== undefined) {
        cs.sumDesv += ev.desviacionMin;
        cs.sumDesvN += 1;
      }
      cocheStats[ev.idBus] = cs;
    }

    const paradas = Object.entries(horaAcum)
      .map(([nombre, { sum, n }]) => ({ nombre, primeraHora: n > 0 ? sum / n : 0 }))
      .sort((a, b) => a.primeraHora - b.primeraHora);

    const coches: CocheEnLinea[] = Object.entries(cocheStats).map(([idBus, cs]) => ({
      idBus,
      totalEventos: cs.total,
      paradasUnicas: cs.paradasUnicas.size,
      pctEnTiempo: cs.conHorario > 0 ? Math.round((cs.enT / cs.conHorario) * 100) : 0,
      desviacionMedia: cs.sumDesvN > 0 ? Math.round((cs.sumDesv / cs.sumDesvN) * 10) / 10 : null,
      primerEvento: cs.primerTs,
      ultimoEvento: cs.ultimoTs,
    }));
    coches.sort((a, b) => a.primerEvento.localeCompare(b.primerEvento));

    // KPIs línea
    const conH = evs.filter(e => e.estadoCumplimiento !== 'SIN_HORARIO');
    const baseK = conH.length || evs.length;
    const enTLinea = conH.filter(e => e.estadoCumplimiento === 'EN_TIEMPO').length;
    const pctLinea = baseK > 0 ? Math.round((enTLinea / baseK) * 100) : 0;

    // Peor parada
    let peor: { nombre: string; pctAtrasado: number } | null = null;
    for (const p of paradas) {
      const eventosParada = evs.filter(e => (e.proximaParada ?? '').trim() === p.nombre);
      const conH = eventosParada.filter(e => e.estadoCumplimiento !== 'SIN_HORARIO');
      if (conH.length === 0) continue;
      const atr = conH.filter(e => e.estadoCumplimiento === 'ATRASADO').length;
      const pctA = Math.round((atr / conH.length) * 100);
      if (!peor || pctA > peor.pctAtrasado) peor = { nombre: p.nombre, pctAtrasado: pctA };
    }

    return {
      paradas, coches, pasesPorParadaCoche: pases,
      totalEventos: evs.length, pctEnTiempoLinea: pctLinea, peorParada: peor,
    };
  }, [eventos, lineaSeleccionada, sentidoMatriz]);

  /* ── KPIs globales del día ─────────────────────────── */

  const kpisDia = useMemo(() => {
    const totalEv = eventos.length;
    const totalCoches = new Set(eventos.map(e => e.idBus)).size;
    const totalLineas = new Set(eventos.map(e => e.linea)).size;
    const conH = eventos.filter(e => e.estadoCumplimiento !== 'SIN_HORARIO');
    const enT = conH.filter(e => e.estadoCumplimiento === 'EN_TIEMPO').length;
    const pctEnTiempo = conH.length > 0 ? Math.round((enT / conH.length) * 100) : null;
    return { totalEv, totalCoches, totalLineas, pctEnTiempo, conHorarioPct: totalEv > 0 ? Math.round((conH.length / totalEv) * 100) : 0 };
  }, [eventos]);

  /* ── Render ────────────────────────────────────────── */

  const operador = AGENCIAS[agencyId] ?? agencyId;

  // Modo auditoría a pantalla completa — toma sobre toda la página.
  if (auditoriaLinea) {
    return (
      <Suspense fallback={
        <div className="bg-slate-950 min-h-screen flex items-center justify-center text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando auditoría…
        </div>
      }>
        <AuditoriaLineaTimeline
          agencyId={agencyId}
          linea={auditoriaLinea}
          fechaInicial={diaSeleccionado}
          operadorNombre={operador}
          onCerrar={() => setAuditoriaLinea(null)}
        />
      </Suspense>
    );
  }

  return (
    <div className="bg-slate-950 min-h-screen p-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-400" />
            Cumplimiento por Línea
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Operador <span className="text-blue-400 font-semibold">{operador}</span>
            {' · '}
            {fmtFechaCorta(diaSeleccionado)}
            {' · '}
            <span className="text-slate-500">Datos GPS reales · {kpisDia.totalEv.toLocaleString()} eventos</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {actualizado && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {fmtHoraUY(actualizado)}
            </span>
          )}
          <button
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Day picker */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Calendar className="w-4 h-4 text-slate-500" />
        <span className="text-xs text-slate-500 uppercase tracking-widest mr-1">Día</span>
        {dias7.map(d => (
          <button
            key={d}
            onClick={() => { setDiaSeleccionado(d); setLineaSeleccionada(null); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-all ${
              d === diaSeleccionado
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {fmtFechaCorta(d)}
          </button>
        ))}
      </div>

      {/* KPIs día */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Coches activos" valor={kpisDia.totalCoches.toString()} sub={`${kpisDia.totalLineas} líneas`} />
        <KpiCard label="Eventos GPS" valor={kpisDia.totalEv.toLocaleString()} sub={`${kpisDia.conHorarioPct}% con horario`} />
        <KpiCard
          label="% En tiempo (día)"
          valor={kpisDia.pctEnTiempo === null ? '—' : `${kpisDia.pctEnTiempo}%`}
          sub={kpisDia.pctEnTiempo === null ? 'Sin boletines disponibles' : 'tolerancia ±4 min IMM'}
          color={kpisDia.pctEnTiempo === null ? 'text-slate-500' :
                 kpisDia.pctEnTiempo >= 80 ? 'text-emerald-400' :
                 kpisDia.pctEnTiempo >= 60 ? 'text-yellow-400' : 'text-red-400'}
        />
        <KpiCard
          label="Sentido"
          valor={sentido === 'TODOS' ? 'Ambos' : sentido}
          sub={`${lineasFiltradas.length} líneas listadas`}
          interactive
        >
          <div className="flex gap-1 mt-1">
            {(['TODOS', 'IDA', 'VUELTA'] as const).map(s => (
              <button key={s} onClick={() => setSentido(s)}
                className={`text-[10px] px-2 py-0.5 rounded border ${sentido === s
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
              >{s}</button>
            ))}
          </div>
        </KpiCard>
      </div>

      {/* Loading / Error */}
      {cargando && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Cargando eventos GPS de {fmtFechaCorta(diaSeleccionado)}…
        </div>
      )}
      {error && !cargando && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-300 text-sm font-semibold">No se pudieron cargar los eventos GPS</p>
            <p className="text-red-300/80 text-xs mt-1">{error}</p>
          </div>
        </div>
      )}

      {!cargando && !error && (
        <>
          {!lineaSeleccionada ? (
            <ListaLineas
              lineas={lineasFiltradas}
              filtro={filtroLinea}
              onFiltro={setFiltroLinea}
              onSeleccionar={(l, s) => {
                setLineaSeleccionada(l);
                // Si la fila clickeada tiene sentido detectado, lo usamos; sino 'AMBOS'
                // para ver todas las pasadas (caso típico cuando el detector aún no se calibró).
                setSentidoMatriz(s ?? 'AMBOS');
              }}
              onAuditoria={(l) => setAuditoriaLinea(l)}
              vacio={resumenLineas.length === 0}
            />
          ) : (
            <MatrizPuntosControl
              linea={lineaSeleccionada}
              sentidoMatriz={sentidoMatriz}
              setSentidoMatriz={setSentidoMatriz}
              matriz={matriz}
              dia={diaSeleccionado}
              onVolver={() => setLineaSeleccionada(null)}
              operador={operador}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ─── Sub-componente: card KPI ────────────────────────── */

function KpiCard({ label, valor, sub, color = 'text-slate-100', interactive, children }: {
  label: string; valor: string; sub?: string; color?: string; interactive?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className={`bg-slate-900/60 border border-slate-700/40 rounded-xl p-3 ${interactive ? 'pb-2.5' : ''}`}>
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{valor}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
      {children}
    </div>
  );
}

/* ─── Sub-componente: lista de líneas ─────────────────── */

function ListaLineas({ lineas, filtro, onFiltro, onSeleccionar, onAuditoria, vacio }: {
  lineas: LineaResumen[];
  filtro: string;
  onFiltro: (s: string) => void;
  onSeleccionar: (linea: string, sentido: 'IDA' | 'VUELTA' | null) => void;
  onAuditoria?: (linea: string) => void;
  vacio: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={filtro}
            onChange={e => onFiltro(e.target.value)}
            placeholder="Buscar línea (ej: 300, 183, 21)…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {vacio && (
        <div className="text-center py-12 text-slate-500">
          <MapPin className="w-10 h-10 mx-auto mb-3 text-slate-700" />
          <p className="text-sm font-medium text-slate-400">Sin eventos GPS en este día</p>
          <p className="text-xs mt-1">El operador puede no haber operado o el feed IMM puede estar caído.</p>
        </div>
      )}

      {!vacio && lineas.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <p className="text-sm">Ninguna línea coincide con "{filtro}".</p>
        </div>
      )}

      {lineas.length > 0 && (
        <div className="overflow-x-auto bg-slate-900/40 border border-slate-700/40 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/40">
                <th className="text-left py-2.5 px-4 text-xs uppercase tracking-widest text-slate-400">Línea</th>
                <th className="text-left py-2.5 px-3 text-xs uppercase tracking-widest text-slate-400">Sent.</th>
                <th className="text-center py-2.5 px-3 text-xs uppercase tracking-widest text-slate-400">Coches</th>
                <th className="text-center py-2.5 px-3 text-xs uppercase tracking-widest text-slate-400">Eventos</th>
                <th className="text-center py-2.5 px-3 text-xs uppercase tracking-widest text-slate-400">% En tiempo</th>
                <th className="text-center py-2.5 px-3 text-xs uppercase tracking-widest text-slate-400">% Atras.</th>
                <th className="text-center py-2.5 px-3 text-xs uppercase tracking-widest text-slate-400">% Adel.</th>
                <th className="text-center py-2.5 px-3 text-xs uppercase tracking-widest text-slate-400">Sin Hor.</th>
                <th className="py-2.5 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={`${l.linea}__${l.sentido}`} className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-4 font-bold text-blue-400">L{l.linea}</td>
                  <td className="py-2.5 px-3">
                    {l.sentido === 'IDA' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">→ IDA</span>}
                    {l.sentido === 'VUELTA' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/30">← VUELTA</span>}
                    {!l.sentido && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-400 border border-slate-600/40" title="Detector de sentido sin certeza (pocos puntos GPS recientes)">s/d</span>}
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-200">{l.cochesActivos}</td>
                  <td className="py-2.5 px-3 text-center text-slate-300">{l.totalEventos}</td>
                  <td className={`py-2.5 px-3 text-center font-bold ${
                    l.pctEnTiempo >= 80 ? 'text-emerald-400' :
                    l.pctEnTiempo >= 60 ? 'text-yellow-400' :
                    l.pctEnTiempo > 0 ? 'text-red-400' : 'text-slate-600'
                  }`}>
                    {l.pctEnTiempo > 0 || l.pctAtrasado > 0 || l.pctAdelantado > 0 ? `${l.pctEnTiempo}%` : '—'}
                  </td>
                  <td className={`py-2.5 px-3 text-center ${l.pctAtrasado > 30 ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
                    {l.pctAtrasado > 0 ? `${l.pctAtrasado}%` : '—'}
                  </td>
                  <td className={`py-2.5 px-3 text-center ${l.pctAdelantado > 30 ? 'text-orange-400 font-bold' : 'text-slate-400'}`}>
                    {l.pctAdelantado > 0 ? `${l.pctAdelantado}%` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-500 text-xs">
                    {l.pctSinHorario}%
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={() => onAuditoria?.(l.linea)}
                        className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:text-white hover:bg-emerald-600/30 transition-all flex items-center gap-1"
                        title="Auditoría estilo IMM: salidas + timeline de control points + pasadas reales"
                      >
                        <Activity className="w-3 h-3" />
                        Auditoría
                      </button>
                      <button
                        onClick={() => onSeleccionar(l.linea, l.sentido)}
                        className="text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:text-white hover:bg-blue-600/30 transition-all"
                        title="Matriz puntos de control × coches"
                      >
                        Matriz
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-componente: matriz puntos de control × coches ─ */

function MatrizPuntosControl({ linea, sentidoMatriz, setSentidoMatriz, matriz, dia, onVolver, operador }: {
  linea: string;
  sentidoMatriz: 'IDA' | 'VUELTA' | 'AMBOS';
  setSentidoMatriz: (s: 'IDA' | 'VUELTA' | 'AMBOS') => void;
  matriz: MatrizLinea | null;
  dia: string;
  onVolver: () => void;
  operador: string;
}) {
  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onVolver}
            className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white px-2 py-1 rounded border border-slate-700 hover:border-slate-500 transition-all"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Volver al listado
          </button>
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              Línea <span className="text-blue-400">{linea}</span>
              <span className="text-slate-500 text-sm font-normal">· {operador} · {fmtFechaCorta(dia)}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Matriz de puntos de control × coches que operaron este día y sentido
            </p>
          </div>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          <button
            onClick={() => setSentidoMatriz('AMBOS')}
            className={`px-3 py-1.5 text-xs font-semibold ${sentidoMatriz === 'AMBOS' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
            title="Incluye pasadas sin sentido detectado"
          >
            AMBOS
          </button>
          <button
            onClick={() => setSentidoMatriz('IDA')}
            className={`px-3 py-1.5 text-xs font-semibold ${sentidoMatriz === 'IDA' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
          >
            <ArrowRight className="w-3 h-3 inline mr-1" /> IDA
          </button>
          <button
            onClick={() => setSentidoMatriz('VUELTA')}
            className={`px-3 py-1.5 text-xs font-semibold ${sentidoMatriz === 'VUELTA' ? 'bg-orange-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
          >
            <ArrowLeft className="w-3 h-3 inline mr-1" /> VUELTA
          </button>
        </div>
      </div>

      {!matriz && (
        <div className="bg-slate-900/40 border border-slate-700/40 rounded-xl px-6 py-12 text-center">
          <Bus className="w-10 h-10 mx-auto mb-3 text-slate-700" />
          <p className="text-sm text-slate-400 font-semibold">
            No hay eventos GPS para Línea {linea} ({sentidoMatriz}) en {fmtFechaCorta(dia)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Probá cambiar de día o de sentido. Si la línea no operó (ej. domingo o paro), no habrá pasadas registradas.
          </p>
        </div>
      )}

      {matriz && (
        <>
          {/* KPIs línea */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <KpiCard label="Puntos de control" valor={matriz.paradas.length.toString()} sub="detectados desde GPS" />
            <KpiCard label="Coches que operaron" valor={matriz.coches.length.toString()} sub={`${matriz.totalEventos} pases totales`} />
            <KpiCard
              label="% En tiempo (línea)"
              valor={`${matriz.pctEnTiempoLinea}%`}
              sub="tolerancia ±4 min"
              color={matriz.pctEnTiempoLinea >= 80 ? 'text-emerald-400' : matriz.pctEnTiempoLinea >= 60 ? 'text-yellow-400' : 'text-red-400'}
            />
            <KpiCard
              label="Peor punto"
              valor={matriz.peorParada ? `${matriz.peorParada.pctAtrasado}%` : '—'}
              sub={matriz.peorParada ? truncar(matriz.peorParada.nombre, 28) : 'Sin atrasos detectados'}
              color={matriz.peorParada && matriz.peorParada.pctAtrasado > 40 ? 'text-red-400' : 'text-yellow-400'}
            />
          </div>

          {/* Matriz */}
          <div className="bg-slate-900/40 border border-slate-700/40 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-800/40 border-b border-slate-700/40 flex items-center justify-between">
              <p className="text-xs text-slate-300 font-semibold flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-blue-400" />
                {matriz.paradas.length} puntos de control × {matriz.coches.length} coches
              </p>
              <p className="text-[10px] text-slate-500">
                Cada celda lista las pasadas de ese coche por ese punto: hora UY + desviación
              </p>
            </div>

            <div className="overflow-x-auto max-h-[70vh]">
              <table className="text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-900 z-20">
                  <tr>
                    <th className="text-left px-3 py-2 border-b border-r border-slate-700/60 bg-slate-900 sticky left-0 z-30 min-w-[200px]">
                      <span className="text-[10px] uppercase tracking-widest text-slate-400">Punto de control</span>
                    </th>
                    {matriz.coches.map(c => (
                      <th key={c.idBus} className="px-2 py-2 border-b border-r border-slate-700/60 bg-slate-900 min-w-[110px]">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[11px] font-bold text-blue-300">Coche {c.idBus}</span>
                          <span className="text-[9px] text-slate-500">
                            {c.totalEventos} pasadas
                          </span>
                          <span className={`text-[10px] font-bold ${
                            c.pctEnTiempo >= 80 ? 'text-emerald-400' :
                            c.pctEnTiempo >= 60 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {c.pctEnTiempo}% en tiempo
                          </span>
                          {c.desviacionMedia !== null && (
                            <span className={`text-[9px] ${
                              Math.abs(c.desviacionMedia) <= 2 ? 'text-emerald-500' :
                              c.desviacionMedia > 0 ? 'text-red-400' : 'text-orange-400'
                            }`}>
                              {c.desviacionMedia > 0 ? '+' : ''}{c.desviacionMedia} min prom.
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matriz.paradas.map((p, idx) => {
                    const horaApr = formatMinUYT(p.primeraHora);
                    return (
                      <tr key={p.nombre} className={idx % 2 === 0 ? 'bg-slate-900/20' : ''}>
                        <td className="px-3 py-2 border-b border-r border-slate-800/60 sticky left-0 bg-slate-900 z-10 align-top">
                          <div className="flex items-start gap-2 max-w-[260px]">
                            <span className="text-slate-500 text-[10px] font-mono mt-0.5">{idx + 1}.</span>
                            <div>
                              <p className="text-slate-200 font-semibold text-[11px] leading-tight">
                                {p.nombre}
                              </p>
                              <p className="text-[9px] text-slate-500">
                                primera pasada ~{horaApr}
                              </p>
                            </div>
                          </div>
                        </td>
                        {matriz.coches.map(c => {
                          const pases = matriz.pasesPorParadaCoche.get(`${p.nombre}__${c.idBus}`) ?? [];
                          if (pases.length === 0) {
                            return (
                              <td key={c.idBus} className="px-2 py-2 border-b border-r border-slate-800/40 text-slate-700 text-center align-top">
                                <span className="text-[10px]">—</span>
                              </td>
                            );
                          }
                          const ordenadas = [...pases].sort((a, b) => a.ts.localeCompare(b.ts));
                          return (
                            <td key={c.idBus} className="px-1.5 py-1.5 border-b border-r border-slate-800/40 align-top">
                              <div className="flex flex-col gap-1">
                                {ordenadas.map((pa, i) => (
                                  <div
                                    key={i}
                                    className={`rounded border px-1.5 py-1 flex flex-col items-center gap-0 ${colorCelda(pa.desv)}`}
                                  >
                                    <span className="text-[10px] text-slate-200 font-mono leading-tight">
                                      {fmtHoraUY(pa.ts)}
                                    </span>
                                    <span className="leading-tight">{badgeDesv(pa.desv)}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Leyenda */}
          <div className="mt-3 flex flex-wrap items-center gap-4 px-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/40" />
              <span className="text-xs text-slate-400">En tiempo (±{TOL_EN_TIEMPO_MIN} min)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-yellow-500/20 border border-yellow-500/30" />
              <span className="text-xs text-slate-400">Desv. moderada (5-8 min)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/40" />
              <span className="text-xs text-slate-400">Atraso grave (&gt;8 min)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-orange-500/20 border border-orange-500/40" />
              <span className="text-xs text-slate-400">Adelanto grave (&gt;5 min)</span>
            </div>
            <div className="ml-auto text-[10px] text-slate-500 flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-red-400" />
              + min = atrasado
              <span className="mx-1.5">·</span>
              <TrendingUp className="w-3 h-3 text-orange-400" />
              − min = adelantado
            </div>
          </div>

          {/* Nota metodológica */}
          <div className="mt-4 bg-slate-900/30 border border-slate-700/30 rounded-xl px-4 py-3 flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-500 leading-relaxed">
              <span className="text-slate-400 font-semibold">Fuente:</span> colección
              <code className="mx-1 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">vehicle_events</code>
              (Firestore) — cada GPS recibido del feed IMM/STM se compara contra el horario
              programado para la parada más cercana. Las paradas se ordenan por hora promedio
              de pasada para reflejar el sentido del recorrido. Tolerancia ±{TOL_EN_TIEMPO_MIN} min
              = EN TIEMPO (estándar IMM Uruguay).
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Helpers menores ─────────────────────────────────── */

function truncar(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
function formatMinUYT(min: number): string {
  if (!isFinite(min) || min < 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
