/**
 * GanttRedMetropolitana.tsx — Vista simultánea de los 4 operadores
 * =================================================================
 * Gantt cross-empresa con detección de solapamientos y brechas.
 * Exclusivo SUPERADMIN. Datos: gtfs_timetable (Firestore) + GPS vivo.
 *
 * Operadores: UCOT (70), CUTCSA (50), COME (20), COETC (10)
 */

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { useLiveData } from '../../context/LiveDataContext';
import {
  Shield, Lock, AlertTriangle, TrendingUp, Bus,
  Clock, ChevronDown, ChevronUp, RefreshCw, Layers, X,
} from 'lucide-react';

// ── Constantes ──────────────────────────────────────────────────────────────

const GANTT_RANGE = 1440; // minutos en el día

const EMPRESA_CONFIG: Record<string, {
  label: string; color: string; bg: string; border: string; text: string;
}> = {
  '70': { label: 'UCOT',   color: '#3b82f6', bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400'   },
  '50': { label: 'CUTCSA', color: '#a855f7', bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
  '20': { label: 'COME',   color: '#10b981', bg: 'bg-emerald-500/10',border: 'border-emerald-500/30',text: 'text-emerald-400'},
  '10': { label: 'COETC',  color: '#f97316', bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
};

const EMPRESAS = ['70', '50', '20', '10'] as const;

// ── Tipos ───────────────────────────────────────────────────────────────────

interface TimetableRow {
  agencyId: string;
  linea: string;
  serviceType: string;
  primeraS: string;
  ultimaS: string;
  totalViajes: number;
}

interface Solapamiento {
  linea_a: string; empresa_a: string;
  linea_b: string; empresa_b: string;
  inicio: number; fin: number; // minutos desde 00:00
}

interface Brecha {
  inicio: number; fin: number;
}

interface PanelInfo {
  tipo: 'solapamiento' | 'brecha';
  solapamiento?: Solapamiento;
  brecha?: Brecha;
}

// ── Funciones puras de análisis ──────────────────────────────────────────────

function toMin(hhmm: string): number {
  if (!hhmm || !hhmm.includes(':')) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toXPct(min: number): number {
  return (min / GANTT_RANGE) * 100;
}

function getTodayServiceType(): 'HABIL' | 'SABADO' | 'DOMINGO' {
  const d = new Date().getDay();
  if (d === 0) return 'DOMINGO';
  if (d === 6) return 'SABADO';
  return 'HABIL';
}

function detectarSolapamientos(filas: TimetableRow[]): Solapamiento[] {
  const result: Solapamiento[] = [];
  for (let i = 0; i < filas.length; i++) {
    for (let j = i + 1; j < filas.length; j++) {
      const a = filas[i]; const b = filas[j];
      if (a.agencyId === b.agencyId) continue;
      const aStart = toMin(a.primeraS); const aEnd = toMin(a.ultimaS);
      const bStart = toMin(b.primeraS); const bEnd = toMin(b.ultimaS);
      const inicio = Math.max(aStart, bStart);
      const fin = Math.min(aEnd, bEnd);
      if (fin - inicio >= 30) {
        // Proxy de corredor: mismo número principal en la línea
        const numA = a.linea.replace(/\D/g, '');
        const numB = b.linea.replace(/\D/g, '');
        if (numA && numB && numA === numB) {
          result.push({
            linea_a: a.linea, empresa_a: a.agencyId,
            linea_b: b.linea, empresa_b: b.agencyId,
            inicio, fin,
          });
        }
      }
    }
  }
  return result;
}

function detectarBrechas(filas: TimetableRow[]): Brecha[] {
  const franjas: Brecha[] = [];
  for (let f = 0; f < 48; f++) {
    const fInicio = f * 30;
    const fFin = fInicio + 30;
    const cubierta = filas.some(r => toMin(r.primeraS) <= fInicio && toMin(r.ultimaS) >= fFin);
    if (!cubierta) franjas.push({ inicio: fInicio, fin: fFin });
  }
  // Fusionar brechas consecutivas
  const fusionadas: Brecha[] = [];
  for (const b of franjas) {
    if (fusionadas.length > 0 && fusionadas[fusionadas.length - 1].fin === b.inicio) {
      fusionadas[fusionadas.length - 1].fin = b.fin;
    } else {
      fusionadas.push({ ...b });
    }
  }
  return fusionadas;
}

// ── Subcomponente: ticks de hora ─────────────────────────────────────────────

function TicksHora() {
  return (
    <div className="relative h-5 mb-1" style={{ marginLeft: '7rem' }}>
      {Array.from({ length: 25 }, (_, h) => (
        <span
          key={h}
          className="absolute text-[10px] text-slate-600 -translate-x-1/2"
          style={{ left: `${(h * 60 / GANTT_RANGE) * 100}%` }}
        >
          {String(h).padStart(2, '0')}h
        </span>
      ))}
    </div>
  );
}

// ── Subcomponente: barra de una línea ────────────────────────────────────────

function BarraLinea({ row, color }: { row: TimetableRow; color: string }) {
  const x = toXPct(toMin(row.primeraS));
  const w = toXPct(toMin(row.ultimaS) - toMin(row.primeraS));
  return (
    <div className="relative flex items-center h-5 group">
      <span className="absolute right-full pr-1 text-[10px] text-slate-500 whitespace-nowrap w-28 text-right truncate">
        {row.linea}
      </span>
      <div className="relative w-full h-3 bg-slate-800/60 rounded-sm overflow-hidden">
        <div
          className="absolute h-full rounded-sm opacity-80 group-hover:opacity-100 transition-opacity"
          style={{ left: `${x}%`, width: `${w}%`, backgroundColor: color }}
          title={`${row.linea} · ${row.primeraS}–${row.ultimaS} · ${row.totalViajes} viajes`}
        />
      </div>
    </div>
  );
}

// ── Subcomponente: overlays de análisis ──────────────────────────────────────

function OverlaySolapamientos({
  solapamientos, onSelect,
}: { solapamientos: Solapamiento[]; onSelect: (s: Solapamiento) => void }) {
  return (
    <>
      {solapamientos.map((s, i) => (
        <div
          key={i}
          className="absolute top-0 h-full bg-red-500/20 border-l border-r border-red-500/40 cursor-pointer hover:bg-red-500/30 transition-colors z-10"
          style={{ left: `${toXPct(s.inicio)}%`, width: `${toXPct(s.fin - s.inicio)}%` }}
          title={`Solapamiento: ${EMPRESA_CONFIG[s.empresa_a]?.label} L.${s.linea_a} ↔ ${EMPRESA_CONFIG[s.empresa_b]?.label} L.${s.linea_b} · ${toHHMM(s.inicio)}–${toHHMM(s.fin)}`}
          onClick={() => onSelect(s)}
        />
      ))}
    </>
  );
}

function OverlayBrechas({
  brechas, onClick,
}: { brechas: Brecha[]; onClick: (b: Brecha) => void }) {
  return (
    <>
      {brechas.map((b, i) => (
        <div
          key={i}
          className="absolute top-0 h-full bg-slate-700/40 border-l border-r border-slate-600/30 cursor-pointer hover:bg-slate-600/50 transition-colors z-10"
          style={{ left: `${toXPct(b.inicio)}%`, width: `${toXPct(b.fin - b.inicio)}%` }}
          title={`Brecha de cobertura: ${toHHMM(b.inicio)}–${toHHMM(b.fin)}`}
          onClick={() => onClick(b)}
        />
      ))}
    </>
  );
}

// ── Subcomponente: banda de empresa ──────────────────────────────────────────

function BandaEmpresa({
  agencyId, filas, solapamientos, brechas,
  onSelectSolap, onSelectBrecha,
}: {
  agencyId: string;
  filas: TimetableRow[];
  solapamientos: Solapamiento[];
  brechas: Brecha[];
  onSelectSolap: (s: Solapamiento) => void;
  onSelectBrecha: (b: Brecha) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = EMPRESA_CONFIG[agencyId];
  const solapEmpresa = solapamientos.filter(
    s => s.empresa_a === agencyId || s.empresa_b === agencyId
  );

  return (
    <div className={`border rounded-xl mb-3 overflow-hidden ${cfg.border} ${cfg.bg}`}>
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cfg.color }} />
          <span className={`font-bold text-sm ${cfg.text}`}>{cfg.label}</span>
          <span className="text-xs text-slate-500">{filas.length} líneas</span>
          {solapEmpresa.length > 0 && (
            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
              {solapEmpresa.length} solapamiento{solapEmpresa.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {collapsed
          ? <ChevronDown className="w-4 h-4 text-slate-500" />
          : <ChevronUp className="w-4 h-4 text-slate-500" />}
      </button>

      {!collapsed && (
        <div className="px-4 pb-3">
          <div className="relative" style={{ paddingLeft: '7rem' }}>
            <div className="absolute inset-0 pointer-events-none" style={{ left: '7rem' }}>
              <OverlaySolapamientos solapamientos={solapEmpresa} onSelect={onSelectSolap} />
              <OverlayBrechas brechas={brechas} onClick={onSelectBrecha} />
            </div>
            <div className="space-y-0.5 relative z-20">
              {filas.length === 0
                ? <p className="text-xs text-slate-600 py-2">Sin datos para este tipo de día</p>
                : filas.map(r => (
                    <BarraLinea key={`${r.agencyId}-${r.linea}`} row={r} color={cfg.color} />
                  ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponente: panel lateral de detalle ──────────────────────────────────

function PanelLateral({ info, onClose }: { info: PanelInfo; onClose: () => void }) {
  const cfg_a = info.solapamiento ? EMPRESA_CONFIG[info.solapamiento.empresa_a] : null;
  const cfg_b = info.solapamiento ? EMPRESA_CONFIG[info.solapamiento.empresa_b] : null;

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-slate-900 border-l border-slate-700 z-50 p-6 overflow-y-auto shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <span className="font-bold text-white text-sm">
          {info.tipo === 'solapamiento' ? 'Solapamiento detectado' : 'Brecha de cobertura'}
        </span>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {info.tipo === 'solapamiento' && info.solapamiento && (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 text-xs font-semibold mb-1">Líneas con servicio simultáneo</p>
            <p className="text-white text-sm">
              <span className={cfg_a?.text ?? ''}>{cfg_a?.label} Línea {info.solapamiento.linea_a}</span>
              {' ↔ '}
              <span className={cfg_b?.text ?? ''}>{cfg_b?.label} Línea {info.solapamiento.linea_b}</span>
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Inicio</span>
              <span className="text-white font-mono">{toHHMM(info.solapamiento.inicio)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Fin</span>
              <span className="text-white font-mono">{toHHMM(info.solapamiento.fin)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Duración</span>
              <span className="text-white font-mono">{info.solapamiento.fin - info.solapamiento.inicio} min</span>
            </div>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed">
            Dos operadores distintos brindan cobertura simultánea en este corredor. Evaluar optimización de frecuencias o redistribución de capacidad.
          </p>
        </div>
      )}

      {info.tipo === 'brecha' && info.brecha && (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-slate-700/40 border border-slate-600/30">
            <p className="text-slate-300 text-xs font-semibold mb-1">Sin cobertura en la red</p>
            <p className="text-white text-sm font-mono">
              {toHHMM(info.brecha.inicio)} → {toHHMM(info.brecha.fin)}
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Duración de brecha</span>
              <span className="text-white font-mono">{info.brecha.fin - info.brecha.inicio} min</span>
            </div>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed">
            Ningún operador del sistema metropolitano tiene servicios activos en este período. Franja sin cobertura para el pasajero.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function GanttRedMetropolitana() {
  const { user } = useAuth();
  const { buses, busesLastUpdate } = useLiveData();

  const [filasPorEmpresa, setFilasPorEmpresa] = useState<Record<string, TimetableRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [serviceType, setServiceType] = useState<'HABIL' | 'SABADO' | 'DOMINGO'>(getTodayServiceType());
  const [vistaFusionada, setVistaFusionada] = useState(false);
  const [panelInfo, setPanelInfo] = useState<PanelInfo | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  // Guard de acceso
  if (user?.role?.toLowerCase() !== 'superadmin') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Lock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Acceso restringido a SUPERADMIN</p>
        </div>
      </div>
    );
  }

  // Carga de datos desde gtfs_timetable
  async function cargarDatos() {
    setLoading(true);
    try {
      const promises = EMPRESAS.map(agId =>
        getDocs(query(
          collection(db, 'gtfs_timetable'),
          where('agencyId', '==', agId),
          where('serviceType', '==', serviceType)
        ))
      );
      const results = await Promise.all(promises);
      const mapa: Record<string, TimetableRow[]> = {};
      EMPRESAS.forEach((agId, i) => {
        mapa[agId] = results[i].docs.map(d => {
          const data = d.data();
          return {
            agencyId: agId,
            linea: data.linea ?? d.id,
            serviceType: data.serviceType ?? serviceType,
            primeraS: data.primeraS ?? '00:00',
            ultimaS: data.ultimaS ?? '00:00',
            totalViajes: data.totalViajes ?? 0,
          } as TimetableRow;
        });
      });
      setFilasPorEmpresa(mapa);
      setLastFetch(new Date());
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargarDatos(); }, [serviceType]);

  // Análisis derivado
  const todasFilas = useMemo(() => Object.values(filasPorEmpresa).flat(), [filasPorEmpresa]);
  const solapamientos = useMemo(() => detectarSolapamientos(todasFilas), [todasFilas]);
  const brechas = useMemo(() => detectarBrechas(todasFilas), [todasFilas]);

  const totalServicios = todasFilas.reduce((acc, r) => acc + r.totalViajes, 0);
  const busesActivos = buses.length;
  const secSinActualizar = busesLastUpdate
    ? Math.round((Date.now() - busesLastUpdate.getTime()) / 1000)
    : null;

  const filasFusionadas = useMemo(
    () => [...todasFilas].sort((a, b) => toMin(a.primeraS) - toMin(b.primeraS)),
    [todasFilas]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 relative">
      {/* Ambient glow */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-blue-700/6 rounded-full blur-[160px] pointer-events-none" />

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-slate-200">Red Metropolitana — Vista Simultánea</h1>
              <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <Shield className="w-3 h-3" /> SUPERADMIN
              </span>
            </div>
            <p className="text-sm text-slate-400">4 operadores · Análisis de cobertura y solapamiento</p>
            <p className="text-xs text-slate-600 mt-0.5">
              Vista exclusiva cross-operador · Análisis de red no disponible en ninguna otra plataforma del mercado
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Selector tipo de día */}
            <div className="flex bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
              {(['HABIL', 'SABADO', 'DOMINGO'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setServiceType(t)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    serviceType === t
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t === 'HABIL' ? 'Hábil' : t === 'SABADO' ? 'Sábado' : 'Domingo'}
                </button>
              ))}
            </div>

            {/* Toggle por empresa / fusionado */}
            <button
              onClick={() => setVistaFusionada(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                vistaFusionada
                  ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              {vistaFusionada ? 'Vista fusionada' : 'Por empresa'}
            </button>

            {/* Refresh */}
            <button
              onClick={cargarDatos}
              disabled={loading}
              className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { icon: TrendingUp,   label: 'Servicios en la red',      value: totalServicios.toLocaleString('es-UY'), color: 'text-blue-400'    },
          { icon: AlertTriangle, label: 'Solapamientos detectados', value: solapamientos.length.toString(),       color: 'text-red-400'     },
          { icon: Clock,        label: 'Brechas de cobertura',      value: brechas.length.toString(),             color: 'text-amber-400'   },
          { icon: Bus,          label: 'Buses activos ahora',       value: busesActivos.toString(),               color: 'text-emerald-400' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-slate-500 uppercase tracking-widest">{label}</span>
            </div>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Badge GPS */}
      {secSinActualizar !== null && (
        <div className="flex justify-end mb-3">
          <span className="text-xs text-slate-600 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            GPS actualizado hace {secSinActualizar}s
          </span>
        </div>
      )}

      {/* Leyenda */}
      <div className="flex flex-wrap gap-4 mb-4">
        {EMPRESAS.map(id => {
          const cfg = EMPRESA_CONFIG[id];
          return (
            <div key={id} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: cfg.color }} />
              <span className="text-xs text-slate-400">{cfg.label}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-500/40 border border-red-500/50" />
          <span className="text-xs text-slate-400">Solapamiento</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-slate-700/60 border border-slate-600/40" />
          <span className="text-xs text-slate-400">Brecha de cobertura</span>
        </div>
      </div>

      {/* Gantt */}
      {loading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <RefreshCw className="w-6 h-6 text-slate-600 animate-spin" />
          <span className="text-slate-500 text-sm">Cargando datos de horarios...</span>
        </div>
      ) : (
        <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4">
          <TicksHora />

          {vistaFusionada ? (
            /* Vista fusionada: todas las líneas coloreadas por empresa */
            <div className="relative" style={{ paddingLeft: '7rem' }}>
              <div className="absolute inset-0 pointer-events-none" style={{ left: '7rem' }}>
                <OverlaySolapamientos
                  solapamientos={solapamientos}
                  onSelect={s => setPanelInfo({ tipo: 'solapamiento', solapamiento: s })}
                />
                <OverlayBrechas
                  brechas={brechas}
                  onClick={b => setPanelInfo({ tipo: 'brecha', brecha: b })}
                />
              </div>
              <div className="space-y-0.5 relative z-20">
                {filasFusionadas.length === 0
                  ? <p className="text-sm text-slate-600 py-8 text-center">Sin datos de horarios para este tipo de día</p>
                  : filasFusionadas.map(r => (
                      <BarraLinea
                        key={`${r.agencyId}-${r.linea}`}
                        row={r}
                        color={EMPRESA_CONFIG[r.agencyId]?.color ?? '#64748b'}
                      />
                    ))
                }
              </div>
            </div>
          ) : (
            /* Vista por empresa: 4 bandas colapsables */
            EMPRESAS.map(agId => (
              <BandaEmpresa
                key={agId}
                agencyId={agId}
                filas={filasPorEmpresa[agId] ?? []}
                solapamientos={solapamientos}
                brechas={brechas}
                onSelectSolap={s => setPanelInfo({ tipo: 'solapamiento', solapamiento: s })}
                onSelectBrecha={b => setPanelInfo({ tipo: 'brecha', brecha: b })}
              />
            ))
          )}
        </div>
      )}

      {/* Pie de página con fuente */}
      <p className="text-xs text-slate-700 mt-4 text-right">
        Fuente: gtfs_timetable ·{' '}
        {lastFetch ? `Actualizado ${lastFetch.toLocaleTimeString('es-UY')}` : 'Cargando...'}
      </p>

      {/* Panel lateral de detalle */}
      {panelInfo && (
        <PanelLateral info={panelInfo} onClose={() => setPanelInfo(null)} />
      )}
    </div>
  );
}
