/**
 * VistaDia — Gantt de planificación diaria
 * ==========================================
 * Muestra el estado de los servicios del día agrupados por LÍNEA + SENTIDO.
 *
 * Arquitectura de datos:
 *  - Fila = (linea, sentido) — IDA y VUELTA son filas SEPARADAS.
 *    Mezclarlas produce comparaciones inválidas de tiempo entre sentidos.
 *  - GTFS timetable: fuente del plan (hora programada por viaje).
 *  - GPS en vivo (busesVivos): marca si hay un bus circulando ahora en esa línea.
 *  - daily_shifts (solo UCOT): asigna conductor + vehículo a la fila.
 *  - vehicle_events: NO se usa para comparaciones de tiempo (causa falsos 400 min).
 *    Solo se usa para saber si la línea tuvo actividad hoy.
 *
 * Estado de cada viaje:
 *  - programado  → el viaje es en el futuro
 *  - en_curso    → hay un bus GPS vivo en esta línea ahora mismo
 *  - no_iniciado → debería haber salido hace >15 min y no hay GPS
 *  - confirmado  → UCOT: conductor asignado por daily_shifts
 *  - tarde/muy_tarde → reservado para cuando tengamos AVL por viaje
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection, query, where, getDocs, orderBy, limit, Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { useEmpresaPropia, EMPRESAS_OPCIONES } from '../../hooks/useEmpresaPropia';
import { useLiveData } from '../../context/LiveDataContext';
import { Calendar, AlertTriangle, Bus, ChevronDown, ArrowRight, ArrowLeft } from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type EstadoServicio = 'programado' | 'confirmado' | 'en_curso' | 'no_iniciado' | 'tarde' | 'muy_tarde';

interface GtfsFila {
  /** ID único: "${agencyId}_${linea}_${directionId}_${serviceType}" */
  id: string;
  linea: string;
  sentido: 'IDA' | 'VUELTA';
  directionId: number;
  serviceType: string;
  /** Viajes: { s: hora inicio "HH:MM", t: minutos desde medianoche por parada } */
  viajes: Array<{ s: string; t: number[] }>;
}

interface ViajeGantt {
  id: string;
  horaGTFS: string;     // "06:30"
  duracionMin: number;
  estado: EstadoServicio;
  vehicleId?: string;
  driverName?: string;
}

interface FilaLinea {
  clave: string;         // "${linea}_${directionId}"
  linea: string;
  directionId: number;
  sentido: 'IDA' | 'VUELTA';
  viajes: ViajeGantt[];
  busesVivos: number;    // buses GPS en esta línea (sin filtrar por sentido — proxy)
  driverName?: string;
  vehicleId?: string;
  tieneActividad: boolean; // hubo algún vehicle_event hoy en esta línea
}

// ─── Constantes Gantt ─────────────────────────────────────────────────────────

const GANTT_START = 4 * 60;
const GANTT_END   = 24 * 60;
const GANTT_RANGE = GANTT_END - GANTT_START;
const PAGE_SIZE   = 40;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hhmmToMin(hhmm: string): number {
  const parts = hhmm.split(':');
  return (parseInt(parts[0] ?? '0', 10) * 60) + parseInt(parts[1] ?? '0', 10);
}

function minutesToPct(hhmm: string): number {
  return Math.max(0, Math.min(100, ((hhmmToMin(hhmm) - GANTT_START) / GANTT_RANGE) * 100));
}

function nowPct(): number {
  const n = new Date();
  return Math.max(0, Math.min(100, ((n.getHours() * 60 + n.getMinutes() - GANTT_START) / GANTT_RANGE) * 100));
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function serviceTypeForDate(iso: string): string {
  // Parsear como local, no UTC
  const [y, m, d] = iso.split('-').map(Number);
  const fecha = new Date(y!, m! - 1, d!);
  const day = fecha.getDay();
  if (day === 6) return 'SABADO';
  if (day === 0) return 'DOMINGO';
  return 'HABIL';
}

function calcEstado(
  gtfsMins: number,
  ahoraMins: number,
  esHoy: boolean,
  lineaViva: boolean,  // hay GPS en esta línea ahora
  tuvoActividad: boolean,
  esConfirmado: boolean,
): EstadoServicio {
  if (!esHoy) return 'programado';
  if (esConfirmado && Math.abs(gtfsMins - ahoraMins) <= 90) return 'confirmado';
  if (lineaViva && Math.abs(gtfsMins - ahoraMins) <= 90) return 'en_curso';
  if (gtfsMins > ahoraMins + 15) return 'programado';
  if (gtfsMins < ahoraMins - 15 && !lineaViva) return 'no_iniciado';
  return 'programado';
}

// ─── Colores ──────────────────────────────────────────────────────────────────

const ESTADO_COLOR: Record<EstadoServicio, { bar: string; bg: string; text: string; label: string }> = {
  confirmado:  { bar: '#10b981', bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Confirmado'  },
  en_curso:    { bar: '#3b82f6', bg: 'bg-blue-500/15',    text: 'text-blue-400',    label: 'En curso'    },
  tarde:       { bar: '#f59e0b', bg: 'bg-amber-500/15',   text: 'text-amber-400',   label: 'Tardío'      },
  muy_tarde:   { bar: '#ef4444', bg: 'bg-red-500/15',     text: 'text-red-400',     label: 'Muy tarde'   },
  no_iniciado: { bar: '#b91c1c', bg: 'bg-red-700/15',     text: 'text-red-600',     label: 'Sin iniciar' },
  programado:  { bar: '#475569', bg: 'bg-slate-600/15',   text: 'text-slate-400',   label: 'Programado'  },
};

type FiltroEstado = 'todos' | 'en_curso' | 'no_iniciado' | 'confirmado';

// ─── Componente principal ─────────────────────────────────────────────────────

export default function VistaDia() {
  const { user }                             = useAuth();
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const { buses: busesVivos }                = useLiveData();

  // ADMIN y SUPERADMIN pueden cambiar empresa — no solo SUPERADMIN
  const rol = (user as any)?.role?.toUpperCase() ?? '';
  const puedeVerTodasEmpresas = rol === 'SUPERADMIN' || rol === 'ADMIN';

  const [fecha, setFecha]     = useState(todayISO());
  const [filtro, setFiltro]   = useState<FiltroEstado>('todos');
  const [pagina, setPagina]   = useState(0);
  const [npct, setNpct]       = useState(nowPct());
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState<ViajeGantt & { fila: FilaLinea } | null>(null);

  const [gtfsFilas, setGtfsFilas]         = useState<GtfsFila[]>([]);
  const [shifts, setShifts]               = useState<Map<string, { vehicleId?: string; driverName?: string }>>(new Map());
  const [lineasConActividad, setActividad] = useState<Set<string>>(new Set());

  // Ticker AHORA (cada minuto)
  useEffect(() => {
    const id = setInterval(() => setNpct(nowPct()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Resetear paginación y filtro cuando cambia empresa o fecha
  useEffect(() => { setPagina(0); setFiltro('todos'); }, [empresaPropia, fecha]);

  // ── Carga de datos ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const agencyId  = String(empresaPropia);
    const svcType   = serviceTypeForDate(fecha);

    const run = async () => {
      try {
        // 1. GTFS: una query, trae TODAS las filas (linea + directionId) para este agencyId + serviceType
        const snap = await getDocs(
          query(
            collection(db, 'gtfs_timetable'),
            where('agencyId', '==', agencyId),
            where('serviceType', '==', svcType),
          ),
        );

        const filas: GtfsFila[] = snap.docs.map(d => {
          const data = d.data();
          const dirId: number = data.directionId ?? 0;
          return {
            id:          d.id,
            linea:       data.linea ?? data.routeShortName ?? '',
            sentido:     (data.sentido as 'IDA' | 'VUELTA') ?? (dirId === 0 ? 'IDA' : 'VUELTA'),
            directionId: dirId,
            serviceType: data.serviceType ?? svcType,
            viajes:      Array.isArray(data.viajes) ? data.viajes : [],
          };
        });

        // 2. daily_shifts (solo UCOT — otras empresas no tienen asignaciones internas)
        const shiftsMap = new Map<string, { vehicleId?: string; driverName?: string }>();
        if (empresaPropia === 70) {
          const sSnap = await getDocs(
            query(collection(db, 'daily_shifts'), where('date', '==', fecha)),
          );
          sSnap.docs.forEach(d => {
            const data = d.data();
            const linea: string = data.line ?? data.lineaId ?? '';
            if (linea) {
              shiftsMap.set(linea, {
                vehicleId:  data.vehicleId,
                driverName: data.driverName ?? data.conductorNombre,
              });
            }
          });
        }

        // 3. vehicle_events del día — solo para saber qué líneas tuvieron actividad
        //    NO se usa para comparar tiempos (causa falsos 400 min)
        const startOfDay = new Date(fecha + 'T04:00:00');
        const evSnap = await getDocs(
          query(
            collection(db, 'vehicle_events'),
            where('agencyId', '==', agencyId),
            where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
            orderBy('createdAt', 'asc'),
            limit(500),
          ),
        );
        const actividad = new Set<string>();
        evSnap.docs.forEach(d => {
          const linea: string = d.data().linea ?? '';
          if (linea) actividad.add(linea);
        });

        if (!cancelled) {
          setGtfsFilas(filas);
          setShifts(shiftsMap);
          setActividad(actividad);
        }
      } catch (err) {
        console.error('[VistaDia] error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [empresaPropia, fecha]);

  // ── Cruce de datos → filas del Gantt ────────────────────────────────────────
  const filas = useMemo<FilaLinea[]>(() => {
    const ahora    = new Date();
    const ahoraMins = ahora.getHours() * 60 + ahora.getMinutes();
    const esHoy    = fecha === todayISO();

    // Buses GPS vivos por linea (sin filtrar por sentido — proxy suficiente)
    const busesVivosLinea = new Map<string, number>();
    busesVivos
      .filter(b => Number(b.empresaId) === empresaPropia)
      .forEach(b => { busesVivosLinea.set(b.linea, (busesVivosLinea.get(b.linea) ?? 0) + 1); });

    return gtfsFilas.map(fila => {
      const shift      = shifts.get(fila.linea);
      const esConfirm  = !!shift;
      const vivosEnLinea = busesVivosLinea.get(fila.linea) ?? 0;
      const lineaViva  = vivosEnLinea > 0;
      const tuvoAct    = lineasConActividad.has(fila.linea);

      const viajes: ViajeGantt[] = fila.viajes.map((v, i) => {
        const horaGTFS  = v.s ?? '00:00';
        const gtfsMins  = hhmmToMin(horaGTFS);
        const duracion  = Array.isArray(v.t) && v.t.length >= 2
          ? (v.t[v.t.length - 1]! - v.t[0]!)
          : 30;

        return {
          id:          `${fila.linea}_${fila.directionId}_${i}`,
          horaGTFS,
          duracionMin: Math.max(5, duracion),
          estado:      calcEstado(gtfsMins, ahoraMins, esHoy, lineaViva, tuvoAct, esConfirm),
          vehicleId:   shift?.vehicleId,
          driverName:  shift?.driverName,
        };
      });

      return {
        clave:        `${fila.linea}_${fila.directionId}`,
        linea:        fila.linea,
        directionId:  fila.directionId,
        sentido:      fila.sentido,
        viajes,
        busesVivos:   vivosEnLinea,
        driverName:   shift?.driverName,
        vehicleId:    shift?.vehicleId,
        tieneActividad: tuvoAct,
      };
    }).sort((a, b) =>
      a.linea.localeCompare(b.linea, 'es', { numeric: true }) ||
      a.directionId - b.directionId,
    );
  }, [gtfsFilas, shifts, lineasConActividad, busesVivos, empresaPropia, fecha]);

  // ── Filtrar + paginar ────────────────────────────────────────────────────────
  const filasFiltradas = useMemo(() => {
    if (filtro === 'todos') return filas;
    const matches: Record<FiltroEstado, EstadoServicio[]> = {
      todos:       [],
      en_curso:    ['en_curso', 'confirmado'],
      no_iniciado: ['no_iniciado'],
      confirmado:  ['confirmado'],
    };
    const target = matches[filtro];
    return filas.filter(f => f.viajes.some(v => target.includes(v.estado)));
  }, [filas, filtro]);

  const filasPagina  = filasFiltradas.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE);
  const totalPaginas = Math.ceil(filasFiltradas.length / PAGE_SIZE);

  // KPIs
  const kpis = useMemo(() => {
    const allViajes = filas.flatMap(f => f.viajes);
    return {
      total:      allViajes.length,
      enCurso:    allViajes.filter(v => v.estado === 'en_curso' || v.estado === 'confirmado').length,
      sinIniciar: allViajes.filter(v => v.estado === 'no_iniciado').length,
      lineas:     new Set(filas.map(f => f.linea)).size,
      busesVivos: busesVivos.filter(b => b.empresaId === empresaPropia).length,
    };
  }, [filas, busesVivos, empresaPropia]);

  const ticksHora = Array.from({ length: 21 }, (_, i) => i + 4);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-950 min-h-screen flex flex-col text-white">

      {/* Encabezado */}
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            <span className="text-lg font-bold text-slate-200">Vista del Día</span>
            <span className="text-xs text-slate-500 ml-1">
              Planificado vs. GPS — por línea y sentido
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-400 font-semibold">EN TIEMPO REAL</span>
          </div>
        </div>

        {/* Controles */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={fecha}
            onChange={e => { setFecha(e.target.value); setPagina(0); }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
          />

          {/* Selector empresa — visible para ADMIN + SUPERADMIN */}
          <div className="flex gap-1 flex-wrap">
            {EMPRESAS_OPCIONES
              .filter(e => puedeVerTodasEmpresas || e.codigo === empresaPropia)
              .map(emp => (
                <button
                  key={emp.codigo}
                  onClick={() => { setEmpresaPropia(emp.codigo); setPagina(0); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all"
                  style={
                    empresaPropia === emp.codigo
                      ? { borderColor: emp.color, background: `${emp.color}22`, color: emp.color }
                      : { borderColor: '#334155', color: '#94a3b8' }
                  }
                >
                  {emp.label}
                </button>
              ))}
          </div>

          {/* Tipo de día */}
          <span className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono">
            {serviceTypeForDate(fecha)}
          </span>

          {/* Filtros */}
          <div className="flex gap-1 ml-auto flex-wrap">
            {([
              { key: 'todos',       label: 'Todos'       },
              { key: 'en_curso',    label: 'En curso'    },
              { key: 'no_iniciado', label: 'Sin iniciar' },
              { key: 'confirmado',  label: 'Confirmados' },
            ] as { key: FiltroEstado; label: string }[]).map(f => (
              <button
                key={f.key}
                onClick={() => { setFiltro(f.key); setPagina(0); }}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  filtro === f.key
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI chips */}
        <div className="flex flex-wrap gap-2 text-xs">
          <KPIChip label="Líneas"        value={kpis.lineas}     color="slate"   />
          <KPIChip label="Viajes totales" value={kpis.total}     color="slate"   />
          <KPIChip label="En curso"      value={kpis.enCurso}    color="blue"    />
          <KPIChip label="Sin iniciar"   value={kpis.sinIniciar} color="red"     />
          <KPIChip label="Buses GPS"     value={kpis.busesVivos} color="emerald" />
        </div>
      </div>

      {/* Leyenda */}
      <div className="px-4 py-2 border-b border-slate-800/50 flex flex-wrap gap-4 text-xs">
        {(Object.entries(ESTADO_COLOR) as [EstadoServicio, typeof ESTADO_COLOR[EstadoServicio]][]).map(
          ([key, val]) => (
            <span key={key} className={`flex items-center gap-1.5 ${val.text}`}>
              <span className="w-3 h-2 rounded-sm inline-block" style={{ background: val.bar }} />
              {val.label}
            </span>
          )
        )}
        <span className="text-slate-600 ml-2">
          IDA → / ← VUELTA por fila separada
        </span>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 px-4 py-3 space-y-1 pb-24">

        {loading && (
          <div className="space-y-2 mt-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-11 bg-slate-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {!loading && gtfsFilas.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-400" />
            <p className="text-slate-300 font-semibold">
              Sin datos GTFS para {empresaCfg.label} — {serviceTypeForDate(fecha)}
            </p>
            <p className="text-slate-500 text-sm max-w-sm">
              El importador GTFS genera una fila por línea + sentido (IDA/VUELTA)
              para cada tipo de día (HABIL, SABADO, DOMINGO).
              agencyId: {String(empresaPropia)}
            </p>
          </div>
        )}

        {!loading && gtfsFilas.length > 0 && (
          <>
            {empresaPropia !== 70 && (
              <div className="mb-2 flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-400">
                <Bus className="w-4 h-4 text-slate-500 shrink-0" />
                Solo horario GTFS + GPS IMM. Asignaciones internas (conductor/coche) no disponibles para esta empresa.
              </div>
            )}

            <EjeHoras ticks={ticksHora} nowPct={npct} />

            {filasPagina.map(fila => (
              <FilaGantt
                key={fila.clave}
                fila={fila}
                empresaColor={empresaCfg.color}
                nowPct={npct}
                onSelectViaje={v => setDetalle(detalle?.id === v.id ? null : { ...v, fila })}
                seleccionado={detalle}
              />
            ))}

            {totalPaginas > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <button
                  disabled={pagina === 0}
                  onClick={() => setPagina(p => p - 1)}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-all"
                >
                  ← Anterior
                </button>
                <span className="text-xs text-slate-500">
                  Pág. {pagina + 1} / {totalPaginas} · {filasFiltradas.length} filas (IDA + VUELTA)
                </span>
                <button
                  disabled={pagina >= totalPaginas - 1}
                  onClick={() => setPagina(p => p + 1)}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-all"
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Panel de detalle */}
      {detalle && (
        <PanelDetalle
          viaje={detalle}
          fila={detalle.fila}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function KPIChip({ label, value, color }: { label: string; value: number; color: string }) {
  const c: Record<string, string> = {
    slate:   'bg-slate-700/40 text-slate-300',
    emerald: 'bg-emerald-500/15 text-emerald-400',
    blue:    'bg-blue-500/15 text-blue-400',
    red:     'bg-red-500/15 text-red-400',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full font-semibold ${c[color] ?? c['slate']}`}>
      {label}: <span className="font-black">{value}</span>
    </span>
  );
}

function EjeHoras({ ticks, nowPct: npct }: { ticks: number[]; nowPct: number }) {
  return (
    <div className="relative h-7 mb-1 select-none">
      <svg width="100%" height="28" className="overflow-visible">
        <line x1="0" y1="20" x2="100%" y2="20" stroke="#334155" strokeWidth="1" />
        {ticks.map(h => {
          const pct = (((h * 60) - GANTT_START) / GANTT_RANGE) * 100;
          if (pct < 0 || pct > 100) return null;
          return (
            <g key={h}>
              <line x1={`${pct}%`} y1="14" x2={`${pct}%`} y2="24" stroke="#475569" strokeWidth="1" />
              <text x={`${pct}%`} y="10" textAnchor="middle" fontSize="9" fill="#64748b">
                {`${String(h % 24).padStart(2, '0')}:00`}
              </text>
            </g>
          );
        })}
        {npct >= 0 && npct <= 100 && (
          <line x1={`${npct}%`} y1="0" x2={`${npct}%`} y2="28"
            stroke="#ef4444" strokeWidth="1.5" strokeDasharray="3,2" />
        )}
      </svg>
    </div>
  );
}

interface FilaProps {
  fila: FilaLinea;
  empresaColor: string;
  nowPct: number;
  onSelectViaje: (v: ViajeGantt) => void;
  seleccionado: (ViajeGantt & { fila: FilaLinea }) | null;
}

function FilaGantt({ fila, empresaColor, nowPct: npct, onSelectViaje, seleccionado }: FilaProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<ViajeGantt | null>(null);
  const [tPos, setTPos]   = useState({ x: 0, y: 0 });

  const tieneProblema = fila.viajes.some(v => v.estado === 'no_iniciado');

  const Icon = fila.sentido === 'IDA' ? ArrowRight : ArrowLeft;
  const sentidoColor = fila.sentido === 'IDA' ? 'text-blue-400' : 'text-purple-400';

  const counters = useMemo(() => {
    const c: Record<EstadoServicio, number> = {
      confirmado: 0, en_curso: 0, tarde: 0, muy_tarde: 0, no_iniciado: 0, programado: 0,
    };
    fila.viajes.forEach(v => { c[v.estado] = (c[v.estado] ?? 0) + 1; });
    return c;
  }, [fila.viajes]);

  return (
    <div className={`flex items-stretch rounded-lg border transition-all ${
      tieneProblema
        ? 'border-red-700/30 bg-red-950/10'
        : 'border-slate-800/50 bg-slate-900/30'
    } hover:border-slate-700/60`}>

      {/* Label izquierdo */}
      <div className="w-32 shrink-0 px-3 py-2 flex flex-col justify-center border-r border-slate-800/50">
        <div className="flex items-center gap-1.5">
          {tieneProblema && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
          <span className="text-xs font-bold text-slate-200">L.{fila.linea}</span>
          <Icon className={`w-3 h-3 ${sentidoColor} shrink-0`} />
          <span className={`text-[9px] font-bold ${sentidoColor}`}>{fila.sentido}</span>
        </div>
        {fila.driverName && (
          <span className="text-[9px] text-slate-500 truncate mt-0.5">{fila.driverName}</span>
        )}
        {fila.busesVivos > 0 && (
          <span className="text-[9px] text-emerald-400 font-semibold">
            {fila.busesVivos} bus{fila.busesVivos > 1 ? 'es' : ''} GPS
          </span>
        )}
      </div>

      {/* SVG Gantt */}
      <div className="flex-1 relative py-2 px-1 min-w-0">
        <svg
          ref={svgRef}
          width="100%"
          height="32"
          className="overflow-visible cursor-crosshair"
          onMouseLeave={() => setHover(null)}
        >
          <rect x="0" y="9" width="100%" height="14" rx="2" fill="#1e293b" />

          {npct >= 0 && npct <= 100 && (
            <line x1={`${npct}%`} y1="7" x2={`${npct}%`} y2="25"
              stroke="#ef4444" strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
          )}

          {fila.viajes.map(v => {
            const xPct = minutesToPct(v.horaGTFS);
            const wPct = Math.max(0.5, (v.duracionMin / GANTT_RANGE) * 100);
            const sel  = seleccionado?.id === v.id;
            return (
              <rect
                key={v.id}
                x={`${xPct}%`} y={sel ? '7' : '10'}
                width={`${wPct}%`} height={sel ? '18' : '12'}
                rx="2"
                fill={ESTADO_COLOR[v.estado].bar}
                opacity={sel ? 1 : 0.78}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectViaje(v)}
                onMouseEnter={e => {
                  setHover(v);
                  const r = svgRef.current?.getBoundingClientRect();
                  if (r) setTPos({ x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                onMouseMove={e => {
                  const r = svgRef.current?.getBoundingClientRect();
                  if (r) setTPos({ x: e.clientX - r.left, y: e.clientY - r.top });
                }}
              />
            );
          })}
        </svg>

        {hover && <TooltipViaje viaje={hover} fila={fila} x={tPos.x} y={tPos.y} />}
      </div>

      {/* Contadores */}
      <div className="w-16 shrink-0 flex flex-col justify-center items-end pr-2 gap-0.5">
        {counters.confirmado  > 0 && <MiniChip n={counters.confirmado}  color="emerald" />}
        {counters.en_curso    > 0 && <MiniChip n={counters.en_curso}    color="blue"    />}
        {counters.tarde       > 0 && <MiniChip n={counters.tarde}       color="amber"   />}
        {counters.muy_tarde   > 0 && <MiniChip n={counters.muy_tarde}   color="red"     />}
        {counters.no_iniciado > 0 && <MiniChip n={counters.no_iniciado} color="rose"    />}
      </div>
    </div>
  );
}

function MiniChip({ n, color }: { n: number; color: string }) {
  const c: Record<string, string> = {
    emerald: 'bg-emerald-500/20 text-emerald-400',
    blue:    'bg-blue-500/20 text-blue-400',
    amber:   'bg-amber-500/20 text-amber-400',
    red:     'bg-red-500/20 text-red-400',
    rose:    'bg-rose-700/20 text-rose-500',
  };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${c[color] ?? ''}`}>
      {n}
    </span>
  );
}

function TooltipViaje({ viaje: v, fila, x, y }: {
  viaje: ViajeGantt; fila: FilaLinea; x: number; y: number;
}) {
  const cfg = ESTADO_COLOR[v.estado];
  return (
    <div
      className="absolute z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl px-3 py-2.5 text-xs min-w-[170px] pointer-events-none"
      style={{ left: Math.min(x + 8, 250), top: y + 14 }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: cfg.bar }} />
        <span className={`font-bold ${cfg.text}`}>{cfg.label}</span>
      </div>
      <div className="font-semibold text-slate-200">
        Línea {fila.linea} — {fila.sentido}
      </div>
      <div className="text-slate-400 mt-0.5">Planificado: {v.horaGTFS}</div>
      <div className="text-slate-400">Duración: ~{v.duracionMin} min</div>
      {v.vehicleId  && <div className="text-slate-500 mt-1">Coche: {v.vehicleId}</div>}
      {v.driverName && <div className="text-slate-500">Conductor: {v.driverName}</div>}
      {fila.busesVivos > 0 && (
        <div className="text-emerald-400 mt-1">{fila.busesVivos} bus(es) GPS en esta línea</div>
      )}
    </div>
  );
}

function PanelDetalle({ viaje: v, fila, onClose }: {
  viaje: ViajeGantt; fila: FilaLinea; onClose: () => void;
}) {
  const cfg = ESTADO_COLOR[v.estado];
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/98 backdrop-blur border-t border-slate-700 p-4 shadow-2xl">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Bus className="w-5 h-5 text-blue-400 shrink-0" />
            <span className="text-base font-bold text-slate-200">
              Línea {fila.linea} — {fila.sentido}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
              {cfg.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DetalleItem label="Hora planificada" value={v.horaGTFS} />
          <DetalleItem label="Sentido"           value={fila.sentido} />
          <DetalleItem label="Duración estimada" value={`~${v.duracionMin} min`} />
          <DetalleItem label="Buses GPS ahora"   value={fila.busesVivos > 0 ? `${fila.busesVivos} bus(es)` : 'Sin GPS'} />
          {v.vehicleId  && <DetalleItem label="Coche asignado"  value={v.vehicleId} />}
          {v.driverName && <DetalleItem label="Conductor"       value={v.driverName} />}
          <DetalleItem label="Actividad hoy"     value={fila.tieneActividad ? 'Registrada' : 'Sin registros'} />
          <DetalleItem label="Atraso"
            value="Requiere AVL por viaje"
            note="La comparación individual de tiempos requiere datos AVL vinculados al trip_id."
          />
        </div>
      </div>
    </div>
  );
}

function DetalleItem({ label, value, highlight = false, note }: {
  label: string; value: string; highlight?: boolean; note?: string;
}) {
  return (
    <div className="bg-slate-800/60 rounded-xl px-3 py-2.5">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-sm font-bold ${highlight ? 'text-red-400' : 'text-slate-200'}`}>{value}</div>
      {note && <div className="text-[9px] text-slate-600 mt-1 leading-tight">{note}</div>}
    </div>
  );
}
