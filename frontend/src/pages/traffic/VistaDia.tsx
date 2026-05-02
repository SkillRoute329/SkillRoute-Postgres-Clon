/**
 * VistaDia — Gantt de planificación diaria
 * =========================================
 * Cruza gtfs_timetable + daily_shifts + vehicle_events + GPS en vivo
 * para mostrar el estado de cada servicio del día como barras Gantt SVG.
 * Multi-empresa: UCOT con daily_shifts, resto solo GTFS + GPS IMM.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { useEmpresaPropia, EMPRESAS_OPCIONES } from '../../hooks/useEmpresaPropia';
import { useLiveData } from '../../context/LiveDataContext';
import {
  Calendar,
  AlertTriangle,
  Bus,
  ChevronDown,
} from 'lucide-react';

// ─── Tipos internos ───────────────────────────────────────────────────────────

type EstadoServicio =
  | 'programado'
  | 'confirmado'
  | 'tarde'
  | 'muy_tarde'
  | 'no_iniciado'
  | 'en_curso';

interface ServicioPlanificado {
  id: string;
  linea: string;
  horaInicioGTFS: string;
  duracionMin: number;
  vehicleId?: string;
  driverName?: string;
  horaRealGPS?: string;
  minutosAtraso?: number;
  estado: EstadoServicio;
  fuente: 'gtfs' | 'shift' | 'gps';
}

interface GtfsTimetable {
  agencyId: string;
  linea: string;
  serviceType: string;
  viajes: Array<{ s: string; t: number[] }>;
}

interface DailyShift {
  vehicleId?: string;
  driverName?: string;
  line: string;
  start: string;
  end: string;
  status: string;
}

// ─── Constantes Gantt ─────────────────────────────────────────────────────────

const GANTT_START = 4 * 60;   // 04:00 en minutos desde medianoche
const GANTT_END   = 24 * 60;  // 24:00
const GANTT_RANGE = GANTT_END - GANTT_START; // 1200 min

function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return ((h ?? 0) * 60) + (m ?? 0);
}

function minutesToPct(hhmm: string): number {
  const total = hhmmToMin(hhmm);
  return Math.max(0, Math.min(100, ((total - GANTT_START) / GANTT_RANGE) * 100));
}

function nowPct(): number {
  const now = new Date();
  const total = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, Math.min(100, ((total - GANTT_START) / GANTT_RANGE) * 100));
}

function serviceTypeForDate(d: Date): string {
  const day = d.getDay();
  if (day === 6) return 'SABADO';
  if (day === 0) return 'DOMINGO';
  return 'HABIL';
}

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Colores de estado ────────────────────────────────────────────────────────

const ESTADO_COLOR: Record<EstadoServicio, { bar: string; bg: string; text: string; label: string }> = {
  confirmado:  { bar: '#10b981', bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Confirmado'  },
  tarde:       { bar: '#f59e0b', bg: 'bg-amber-500/15',   text: 'text-amber-400',   label: 'Tardío'      },
  muy_tarde:   { bar: '#ef4444', bg: 'bg-red-500/15',     text: 'text-red-400',     label: 'Muy tarde'   },
  no_iniciado: { bar: '#b91c1c', bg: 'bg-red-700/15',     text: 'text-red-600',     label: 'No iniciado' },
  en_curso:    { bar: '#3b82f6', bg: 'bg-blue-500/15',    text: 'text-blue-400',    label: 'En curso'    },
  programado:  { bar: '#475569', bg: 'bg-slate-600/15',   text: 'text-slate-400',   label: 'Programado'  },
};

type FiltroEstado = 'todos' | 'confirmado' | 'tarde' | 'no_iniciado';

const PAGE_SIZE = 30;

// ─── Helpers puros ────────────────────────────────────────────────────────────

function calcularEstado(
  horaGTFSmins: number,
  ahoraMins: number,
  esHoy: boolean,
  tieneGPS: boolean,
  gpsMins: number | undefined,
  lineasVivas: Set<string>,
  linea: string,
): { estado: EstadoServicio; minutosAtraso?: number } {
  if (!esHoy) return { estado: 'programado' };

  if (gpsMins !== undefined) {
    const diff = gpsMins - horaGTFSmins;
    if (Math.abs(diff) <= 5) return { estado: 'confirmado', minutosAtraso: diff };
    if (diff <= 15)          return { estado: 'tarde',      minutosAtraso: diff };
    return                        { estado: 'muy_tarde',   minutosAtraso: diff };
  }
  if (lineasVivas.has(linea) && horaGTFSmins > ahoraMins) {
    return { estado: 'en_curso' };
  }
  if (horaGTFSmins < ahoraMins - 10 && !tieneGPS) {
    return { estado: 'no_iniciado' };
  }
  return { estado: 'programado' };
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function VistaDia() {
  const { user } = useAuth();
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const { buses: busesVivos } = useLiveData();

  const isSuperAdmin = (user as any)?.role === 'SUPERADMIN';

  // Estado UI
  const [fecha, setFecha]       = useState<string>(todayLocal());
  const [filtro, setFiltro]     = useState<FiltroEstado>('todos');
  const [detalle, setDetalle]   = useState<ServicioPlanificado | null>(null);
  const [pagina, setPagina]     = useState(0);
  const [loading, setLoading]   = useState(true);
  const [npct, setNpct]         = useState(nowPct());

  // Datos crudos
  const [gtfsData, setGtfsData]           = useState<GtfsTimetable[]>([]);
  const [shifts, setShifts]               = useState<DailyShift[]>([]);
  const [primerosEventos, setPrimeros]    = useState<Map<string, string>>(new Map());

  // Actualizar línea AHORA cada minuto
  useEffect(() => {
    const id = setInterval(() => setNpct(nowPct()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Resetear paginación al cambiar empresa o fecha
  useEffect(() => { setPagina(0); }, [empresaPropia, fecha]);

  // Carga de datos
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const agencyId  = String(empresaPropia);
    const fechaDate = new Date(fecha + 'T12:00:00');
    const svcType   = serviceTypeForDate(fechaDate);

    const run = async () => {
      try {
        // 1. gtfs_timetable
        const gtfsSnap = await getDocs(
          query(
            collection(db, 'gtfs_timetable'),
            where('agencyId', '==', agencyId),
            where('serviceType', '==', svcType),
          ),
        );
        const rows: GtfsTimetable[] = gtfsSnap.docs.map((d) => {
          const data = d.data();
          return {
            agencyId:    data.agencyId ?? agencyId,
            linea:       data.linea ?? data.routeShortName ?? '',
            serviceType: data.serviceType ?? svcType,
            viajes:      Array.isArray(data.viajes) ? data.viajes : [],
          };
        });

        // 2. daily_shifts — solo UCOT
        let shiftsRows: DailyShift[] = [];
        if (empresaPropia === 70) {
          const shiftsSnap = await getDocs(
            query(collection(db, 'daily_shifts'), where('date', '==', fecha)),
          );
          shiftsRows = shiftsSnap.docs.map((d) => d.data() as DailyShift);
        }

        // 3. vehicle_events del día (primeros por línea)
        const startOfDay = new Date(fecha + 'T04:00:00');
        const eventsSnap = await getDocs(
          query(
            collection(db, 'vehicle_events'),
            where('agencyId', '==', agencyId),
            where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
            orderBy('createdAt', 'asc'),
            limit(500),
          ),
        );
        const mapaEventos = new Map<string, string>();
        eventsSnap.docs.forEach((d) => {
          const ev = d.data();
          const linea: string = ev.linea ?? '';
          if (linea && !mapaEventos.has(linea)) {
            const ts: Date = ev.createdAt?.toDate?.() ?? new Date();
            const hh = String(ts.getHours()).padStart(2, '0');
            const mm = String(ts.getMinutes()).padStart(2, '0');
            mapaEventos.set(linea, `${hh}:${mm}`);
          }
        });

        if (!cancelled) {
          setGtfsData(rows);
          setShifts(shiftsRows);
          setPrimeros(mapaEventos);
        }
      } catch (err) {
        console.error('[VistaDia] error cargando datos:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [empresaPropia, fecha]);

  // Cruce de datos → servicios planificados
  const servicios = useMemo<ServicioPlanificado[]>(() => {
    const ahora      = new Date();
    const ahoraMins  = ahora.getHours() * 60 + ahora.getMinutes();
    const esHoy      = fecha === todayLocal();
    const lineasVivas = new Set(
      busesVivos.filter((b) => b.empresaId === empresaPropia).map((b) => b.linea),
    );

    const rows: ServicioPlanificado[] = [];

    gtfsData.forEach((timetable) => {
      const linea      = timetable.linea;
      const shiftLinea = shifts.find((s) => s.line === linea);
      const horaGPS    = primerosEventos.get(linea);

      (timetable.viajes ?? []).forEach((viaje, idx) => {
        const horaGTFS  = viaje.s ?? '00:00';
        const gtfsMins  = hhmmToMin(horaGTFS);
        const gpsMins   = horaGPS !== undefined ? hhmmToMin(horaGPS) : undefined;
        const tieneGPS  = horaGPS !== undefined || lineasVivas.has(linea);

        const duracion = Array.isArray(viaje.t) && viaje.t.length >= 2
          ? viaje.t[viaje.t.length - 1]! - viaje.t[0]!
          : 30;

        const { estado, minutosAtraso } = calcularEstado(
          gtfsMins, ahoraMins, esHoy, tieneGPS, gpsMins, lineasVivas, linea,
        );

        rows.push({
          id:            `${linea}-${idx}`,
          linea,
          horaInicioGTFS: horaGTFS,
          duracionMin:   typeof duracion === 'number' && duracion > 0 ? duracion : 30,
          vehicleId:     shiftLinea?.vehicleId,
          driverName:    shiftLinea?.driverName,
          horaRealGPS:   horaGPS,
          minutosAtraso,
          estado,
          fuente:        shiftLinea ? 'shift' : horaGPS ? 'gps' : 'gtfs',
        });
      });
    });

    rows.sort((a, b) =>
      a.linea.localeCompare(b.linea, 'es') ||
      hhmmToMin(a.horaInicioGTFS) - hhmmToMin(b.horaInicioGTFS),
    );
    return rows;
  }, [gtfsData, shifts, primerosEventos, busesVivos, empresaPropia, fecha]);

  // Agrupar por línea
  const porLinea = useMemo(() => {
    const map = new Map<string, ServicioPlanificado[]>();
    servicios.forEach((s) => {
      const arr = map.get(s.linea) ?? [];
      arr.push(s);
      map.set(s.linea, arr);
    });
    return map;
  }, [servicios]);

  // Filtrar + paginar
  const lineasFiltradas = useMemo(() => {
    const estadosMatch: Record<FiltroEstado, EstadoServicio[]> = {
      todos:       [],
      confirmado:  ['confirmado', 'en_curso'],
      tarde:       ['tarde', 'muy_tarde'],
      no_iniciado: ['no_iniciado'],
    };
    let lineas = Array.from(porLinea.keys());
    if (filtro !== 'todos') {
      const match = estadosMatch[filtro];
      lineas = lineas.filter((l) =>
        (porLinea.get(l) ?? []).some((s) => match.includes(s.estado)),
      );
    }
    return lineas;
  }, [porLinea, filtro]);

  const lineasPagina  = lineasFiltradas.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE);
  const totalPaginas  = Math.ceil(lineasFiltradas.length / PAGE_SIZE);

  // KPIs
  const kpis = useMemo(() => ({
    total:     servicios.length,
    confirmados: servicios.filter((s) => s.estado === 'confirmado' || s.estado === 'en_curso').length,
    tardios:   servicios.filter((s) => s.estado === 'tarde' || s.estado === 'muy_tarde').length,
    sinIniciar: servicios.filter((s) => s.estado === 'no_iniciado').length,
  }), [servicios]);

  // Ticks de hora 04:00 → 24:00
  const ticksHora = Array.from({ length: 21 }, (_, i) => i + 4);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="bg-slate-950 min-h-screen flex flex-col text-white">

      {/* ── Encabezado / Filtros ── */}
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-3 space-y-3">
        {/* Fila título */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            <span className="text-lg font-bold text-slate-200">Vista del Día</span>
            <span className="text-xs text-slate-500 ml-1 hidden sm:block">Planificación vs. GPS real</span>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-400 font-semibold">DATOS EN TIEMPO REAL</span>
          </div>
        </div>

        {/* Fila controles */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
          />

          {/* Selector empresa */}
          <div className="flex gap-1">
            {EMPRESAS_OPCIONES
              .filter((e) => isSuperAdmin || e.codigo === empresaPropia)
              .map((emp) => (
                <button
                  key={emp.codigo}
                  onClick={() => setEmpresaPropia(emp.codigo)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    empresaPropia === emp.codigo
                      ? 'text-white'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                  style={empresaPropia === emp.codigo
                    ? { borderColor: emp.color, background: `${emp.color}22`, color: emp.color }
                    : {}
                  }
                >
                  {emp.label}
                </button>
              ))}
          </div>

          {/* Pills de filtro */}
          <div className="flex gap-1 ml-auto">
            {(
              [
                { key: 'todos',       label: 'Todas'       },
                { key: 'confirmado',  label: 'Confirmadas' },
                { key: 'tarde',       label: 'Tardías'     },
                { key: 'no_iniciado', label: 'Sin iniciar' },
              ] as { key: FiltroEstado; label: string }[]
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
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
          <KPIChip label="Total"       value={kpis.total}      color="slate"   />
          <KPIChip label="Confirmados" value={kpis.confirmados} color="emerald" />
          <KPIChip label="Tardíos"     value={kpis.tardios}    color="amber"   />
          <KPIChip label="Sin iniciar" value={kpis.sinIniciar} color="red"     />
        </div>
      </div>

      {/* ── Leyenda ── */}
      <div className="px-4 py-2 border-b border-slate-800/50 flex flex-wrap gap-4 text-xs">
        {(Object.entries(ESTADO_COLOR) as [EstadoServicio, typeof ESTADO_COLOR[EstadoServicio]][]).map(
          ([key, val]) => (
            <span key={key} className={`flex items-center gap-1.5 ${val.text}`}>
              <span className="w-3 h-2 rounded-sm inline-block" style={{ background: val.bar }} />
              {val.label}
            </span>
          ),
        )}
      </div>

      {/* ── Cuerpo ── */}
      <div className="flex-1 px-4 py-3 space-y-1 pb-24">

        {/* Skeleton */}
        {loading && (
          <div className="space-y-2 mt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {/* Estado vacío GTFS */}
        {!loading && gtfsData.length === 0 && (
          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-400" />
            <p className="text-slate-300 font-semibold">
              Sin datos GTFS para {empresaCfg.label}
            </p>
            <p className="text-slate-500 text-sm max-w-sm">
              El importador GTFS se ejecuta los lunes. Verificá que el
              agencyId&nbsp;{empresaCfg.agencyId} tenga datos cargados.
            </p>
          </div>
        )}

        {/* Gantt */}
        {!loading && gtfsData.length > 0 && (
          <>
            {empresaPropia !== 70 && (
              <div className="mb-3 flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-400">
                <Bus className="w-4 h-4 text-slate-500 shrink-0" />
                Solo planificado — sin asignaciones internas. GPS de IMM aplicado donde disponible.
              </div>
            )}

            <EjeHoras ticks={ticksHora} nowPct={npct} />

            {lineasPagina.map((linea) => (
              <FilaGantt
                key={linea}
                linea={linea}
                servicios={porLinea.get(linea) ?? []}
                empresaCfg={empresaCfg}
                nowPct={npct}
                onSelect={(s) => setDetalle(detalle?.id === s.id ? null : s)}
                seleccionado={detalle}
              />
            ))}

            {totalPaginas > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <button
                  disabled={pagina === 0}
                  onClick={() => setPagina((p) => p - 1)}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-all"
                >
                  ← Anterior
                </button>
                <span className="text-xs text-slate-500">
                  Pág. {pagina + 1} / {totalPaginas} · {lineasFiltradas.length} líneas
                </span>
                <button
                  disabled={pagina >= totalPaginas - 1}
                  onClick={() => setPagina((p) => p + 1)}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-all"
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Panel de detalle ── */}
      {detalle && (
        <PanelDetalle
          servicio={detalle}
          onClose={() => setDetalle(null)}
          esUCOT={empresaPropia === 70}
        />
      )}
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function KPIChip({ label, value, color }: { label: string; value: number; color: string }) {
  const clrMap: Record<string, string> = {
    slate:   'bg-slate-700/40 text-slate-300',
    emerald: 'bg-emerald-500/15 text-emerald-400',
    amber:   'bg-amber-500/15 text-amber-400',
    red:     'bg-red-500/15 text-red-400',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full font-semibold ${clrMap[color] ?? clrMap['slate']}`}>
      {label}: <span className="font-black">{value}</span>
    </span>
  );
}

function EjeHoras({ ticks, nowPct: npct }: { ticks: number[]; nowPct: number }) {
  return (
    <div className="relative h-7 mb-1 select-none">
      <svg width="100%" height="28" className="overflow-visible">
        <line x1="0" y1="20" x2="100%" y2="20" stroke="#334155" strokeWidth="1" />
        {ticks.map((h) => {
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
          <line
            x1={`${npct}%`} y1="0" x2={`${npct}%`} y2="28"
            stroke="#ef4444" strokeWidth="1.5" strokeDasharray="3,2"
          />
        )}
      </svg>
    </div>
  );
}

interface FilaProps {
  linea: string;
  servicios: ServicioPlanificado[];
  empresaCfg: { codigo: number; label: string; agencyId: string; color: string };
  nowPct: number;
  onSelect: (s: ServicioPlanificado) => void;
  seleccionado: ServicioPlanificado | null;
}

function FilaGantt({ linea, servicios, empresaCfg, nowPct: npct, onSelect, seleccionado }: FilaProps) {
  const [hover, setHover]         = useState<ServicioPlanificado | null>(null);
  const [tooltipPos, setTPos]     = useState({ x: 0, y: 0 });
  const svgRef                    = useRef<SVGSVGElement>(null);

  const contadores = useMemo(() => {
    const c: Record<EstadoServicio, number> = {
      confirmado: 0, tarde: 0, muy_tarde: 0,
      no_iniciado: 0, en_curso: 0, programado: 0,
    };
    servicios.forEach((s) => { c[s.estado] = (c[s.estado] ?? 0) + 1; });
    return c;
  }, [servicios]);

  const tieneProblema = contadores.no_iniciado > 0 || contadores.muy_tarde > 0;

  return (
    <div className={`flex items-stretch gap-0 rounded-lg border transition-all ${
      tieneProblema
        ? 'border-red-700/30 bg-red-950/10'
        : 'border-slate-800/50 bg-slate-900/30'
    } hover:border-slate-700/60`}>

      {/* Label izquierdo */}
      <div className="w-28 shrink-0 px-3 py-2 flex flex-col justify-center border-r border-slate-800/50">
        <div className="flex items-center gap-1">
          {tieneProblema && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
          <span className="text-xs font-bold text-slate-200 truncate">Línea {linea}</span>
        </div>
        <span className="text-[10px] font-semibold mt-0.5" style={{ color: empresaCfg.color }}>
          {empresaCfg.label}
        </span>
        <span className="text-[10px] text-slate-500">{servicios.length} svc</span>
      </div>

      {/* SVG Gantt */}
      <div className="flex-1 relative py-2 px-1">
        <svg
          ref={svgRef}
          width="100%"
          height="36"
          className="overflow-visible cursor-crosshair"
          onMouseLeave={() => setHover(null)}
        >
          {/* Carril de fondo */}
          <rect x="0" y="10" width="100%" height="16" rx="2" fill="#1e293b" />

          {/* Línea AHORA */}
          {npct >= 0 && npct <= 100 && (
            <line
              x1={`${npct}%`} y1="8" x2={`${npct}%`} y2="28"
              stroke="#ef4444" strokeWidth="1" strokeDasharray="2,2" opacity="0.5"
            />
          )}

          {/* Barras de servicio */}
          {servicios.map((svc) => {
            const xPct    = minutesToPct(svc.horaInicioGTFS);
            const wPct    = Math.max(0.4, (svc.duracionMin / GANTT_RANGE) * 100);
            const selected = seleccionado?.id === svc.id;
            return (
              <rect
                key={svc.id}
                x={`${xPct}%`}
                y={selected ? '8' : '11'}
                width={`${wPct}%`}
                height={selected ? '20' : '14'}
                rx="3"
                fill={ESTADO_COLOR[svc.estado].bar}
                opacity={selected ? 1 : 0.8}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(svc)}
                onMouseEnter={(e) => {
                  setHover(svc);
                  const rect = svgRef.current?.getBoundingClientRect();
                  if (rect) setTPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onMouseMove={(e) => {
                  const rect = svgRef.current?.getBoundingClientRect();
                  if (rect) setTPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
              />
            );
          })}
        </svg>

        {hover && (
          <TooltipGantt servicio={hover} x={tooltipPos.x} y={tooltipPos.y} />
        )}
      </div>

      {/* Contador resumen */}
      <div className="w-20 shrink-0 flex flex-col justify-center items-end pr-3 gap-0.5">
        {contadores.confirmado  > 0 && <MiniChip n={contadores.confirmado}  color="emerald" />}
        {contadores.en_curso    > 0 && <MiniChip n={contadores.en_curso}    color="blue"    />}
        {contadores.tarde       > 0 && <MiniChip n={contadores.tarde}       color="amber"   />}
        {contadores.muy_tarde   > 0 && <MiniChip n={contadores.muy_tarde}   color="red"     />}
        {contadores.no_iniciado > 0 && <MiniChip n={contadores.no_iniciado} color="rose"    />}
      </div>
    </div>
  );
}

function MiniChip({ n, color }: { n: number; color: string }) {
  const clrMap: Record<string, string> = {
    emerald: 'bg-emerald-500/20 text-emerald-400',
    blue:    'bg-blue-500/20 text-blue-400',
    amber:   'bg-amber-500/20 text-amber-400',
    red:     'bg-red-500/20 text-red-400',
    rose:    'bg-rose-700/20 text-rose-500',
  };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${clrMap[color] ?? ''}`}>
      {n}
    </span>
  );
}

function TooltipGantt({
  servicio: s,
  x,
  y,
}: {
  servicio: ServicioPlanificado;
  x: number;
  y: number;
}) {
  const cfg = ESTADO_COLOR[s.estado];
  return (
    <div
      className="absolute z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl px-3 py-2.5 text-xs min-w-[160px] pointer-events-none"
      style={{ left: Math.min(x + 8, 260), top: y + 14 }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: cfg.bar }} />
        <span className={`font-bold ${cfg.text}`}>{cfg.label}</span>
      </div>
      <div className="text-slate-300 font-semibold">Línea {s.linea}</div>
      <div className="text-slate-400 mt-0.5">Planificado: {s.horaInicioGTFS}</div>
      {s.horaRealGPS && (
        <div className="text-slate-400">GPS real: {s.horaRealGPS}</div>
      )}
      {s.minutosAtraso !== undefined && (
        <div className={cfg.text}>
          {s.minutosAtraso > 0
            ? `+${s.minutosAtraso} min de atraso`
            : `${Math.abs(s.minutosAtraso)} min adelantado`}
        </div>
      )}
      {s.vehicleId  && <div className="text-slate-500 mt-1">Vehículo: {s.vehicleId}</div>}
      {s.driverName && <div className="text-slate-500">Conductor: {s.driverName}</div>}
    </div>
  );
}

function PanelDetalle({
  servicio: s,
  onClose,
  esUCOT,
}: {
  servicio: ServicioPlanificado;
  onClose: () => void;
  esUCOT: boolean;
}) {
  const cfg = ESTADO_COLOR[s.estado];
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/98 backdrop-blur border-t border-slate-700 p-4 shadow-2xl">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Bus className="w-5 h-5 text-blue-400 shrink-0" />
            <span className="text-base font-bold text-slate-200">
              Línea {s.linea} — Detalle
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
          <DetalleItem label="Hora planificada" value={s.horaInicioGTFS} />
          <DetalleItem label="Hora real GPS"    value={s.horaRealGPS ?? '—'} />
          <DetalleItem
            label="Atraso"
            value={
              s.minutosAtraso !== undefined
                ? s.minutosAtraso > 0
                  ? `+${s.minutosAtraso} min`
                  : `${Math.abs(s.minutosAtraso)} min adelanto`
                : '—'
            }
            highlight={s.minutosAtraso !== undefined && s.minutosAtraso > 5}
          />
          <DetalleItem
            label="Fuente de datos"
            value={
              s.fuente === 'shift' ? 'Cartón UCOT' :
              s.fuente === 'gps'   ? 'GPS IMM'     : 'GTFS'
            }
          />
          {esUCOT && s.vehicleId  && <DetalleItem label="Vehículo"  value={s.vehicleId} />}
          {esUCOT && s.driverName && <DetalleItem label="Conductor" value={s.driverName} />}
          {!esUCOT && (
            <DetalleItem label="Datos internos" value="No disponibles (empresa externa)" />
          )}
        </div>
      </div>
    </div>
  );
}

function DetalleItem({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-slate-800/60 rounded-xl px-3 py-2.5">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-sm font-bold ${highlight ? 'text-red-400' : 'text-slate-200'}`}>
        {value}
      </div>
    </div>
  );
}
