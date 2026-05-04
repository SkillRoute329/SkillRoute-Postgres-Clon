/**
 * AuditoriaLineaTimeline.tsx — Vista "Auditoría por Línea" estilo IMM
 * ====================================================================
 *
 * Replica el patrón visual de la consulta del STM (montevideo.gub.uy/app/stm/horarios/):
 *  - Tabs IDA / VUELTA con % de cumplimiento por sentido.
 *  - Tabla de salidas del día: Desde / Salida / Llegada / Destino + pasadas detectadas.
 *  - Click en una fila abre un modal con el TIMELINE de control points y, sobre
 *    cada punto, las pasadas reales detectadas con desviación.
 *
 * Datos: sólo Firestore (auditoriaService.ts). Cero datos simulados.
 *
 * Diferenciador de SkillRoute vs IMM: nosotros mostramos las PASADAS REALES
 * por encima del horario programado — el ingeniero ve, sin que el operador
 * nos haya dado un solo dato interno, dónde se cae el cumplimiento.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronLeft, RefreshCw, Calendar, AlertTriangle, ArrowRight, ArrowLeft,
  CheckCircle, Clock, MapPin, Bus,
} from 'lucide-react';
import {
  fetchAuditoriaLineaSentido, ymdMvd,
  type AuditoriaLineaSentido, type Salida,
} from '../../services/auditoriaService';
import SalidaTimelineModal from '../../components/audit/SalidaTimelineModal';

/* ─── Tipos / props ────────────────────────────────────── */

interface Props {
  agencyId: string;
  linea: string;
  fechaInicial?: string; // YYYY-MM-DD
  onCerrar: () => void;
  operadorNombre: string;
}

/* ─── Helpers ──────────────────────────────────────────── */

function ultimosDias(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(ymdMvd(new Date(Date.now() - i * 24 * 3600_000)));
  return out;
}

function fmtFechaCorta(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00-03:00`);
  return d.toLocaleDateString('es-UY', { weekday: 'short', day: '2-digit', month: 'short' });
}

function colorPct(p: number | null): string {
  if (p === null) return 'text-slate-500';
  if (p >= 80) return 'text-emerald-400';
  if (p >= 60) return 'text-yellow-400';
  return 'text-red-400';
}

/* ─── Componente principal ────────────────────────────── */

export default function AuditoriaLineaTimeline({
  agencyId, linea, fechaInicial, onCerrar, operadorNombre,
}: Props) {
  const dias7 = useMemo(() => ultimosDias(7), []);
  const [fecha, setFecha] = useState<string>(fechaInicial ?? dias7[0]);
  const [tab, setTab] = useState<'IDA' | 'VUELTA'>('IDA');
  const [ida, setIda] = useState<AuditoriaLineaSentido | null>(null);
  const [vuelta, setVuelta] = useState<AuditoriaLineaSentido | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salidaModal, setSalidaModal] = useState<Salida | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null); setSalidaModal(null);
    try {
      const [a, b] = await Promise.all([
        fetchAuditoriaLineaSentido(agencyId, linea, 0, fecha),
        fetchAuditoriaLineaSentido(agencyId, linea, 1, fecha),
      ]);
      setIda(a); setVuelta(b);
      if (!a && !b) {
        setError(`Sin horario GTFS para Línea ${linea} en ${operadorNombre}. La línea puede no existir en este operador o el feed no fue importado.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [agencyId, linea, fecha, operadorNombre]);

  useEffect(() => { cargar(); }, [cargar]);

  const datosTab = tab === 'IDA' ? ida : vuelta;

  return (
    <div className="bg-slate-950 min-h-screen text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950/95 sticky top-0 z-30 px-6 py-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <button
              onClick={onCerrar}
              className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white px-2 py-1 rounded border border-slate-700 hover:border-slate-500 transition-all"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Volver al listado
            </button>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                Auditoría · Línea <span className="text-blue-400">{linea}</span>
                <span className="text-slate-500 text-sm font-normal">· {operadorNombre} · {fmtFechaCorta(fecha)}</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Horario oficial GTFS · pasadas GPS reales superpuestas — fuente: feeds públicos IMM/STM
              </p>
            </div>
          </div>
          <button
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[10px] text-slate-500 uppercase tracking-widest mr-1">Día</span>
          {dias7.map(d => (
            <button key={d} onClick={() => setFecha(d)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-all ${
                d === fecha
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {fmtFechaCorta(d)}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs IDA / VUELTA */}
      <div className="px-6 pt-5">
        <div className="flex border-b border-slate-700">
          {(['IDA', 'VUELTA'] as const).map(t => {
            const dat = t === 'IDA' ? ida : vuelta;
            const pct = dat ? dat.pctEnTiempoSentido : null;
            const sal = dat?.salidas.length ?? 0;
            const tot = dat?.totalPasadasSentido ?? 0;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative px-6 py-3 text-sm font-bold flex items-center gap-2 ${
                  tab === t ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t === 'IDA' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                {t}
                {dat && (
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    ({sal} salidas · <span className={`font-bold ${colorPct(pct)}`}>{pct ?? 0}%</span> en tiempo · {tot} pasadas)
                  </span>
                )}
                {!dat && !cargando && <span className="ml-2 text-xs text-slate-600">(sin horario)</span>}
                {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {cargando && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Cargando auditoría {tab.toLowerCase()} de Línea {linea}…
          </div>
        )}

        {/* Error */}
        {error && !cargando && (
          <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-300 text-sm font-semibold">{error}</p>
            </div>
          </div>
        )}

        {/* Sin datos */}
        {!cargando && !error && !datosTab && (
          <div className="mt-6 bg-slate-900/40 border border-slate-700/40 rounded-xl px-6 py-12 text-center">
            <Bus className="w-10 h-10 mx-auto mb-3 text-slate-700" />
            <p className="text-sm text-slate-400 font-semibold">
              Sin horario GTFS para Línea {linea} ({tab}) en {operadorNombre}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Esta línea puede no operar en este sentido, o el feed GTFS oficial no contiene este recorrido.
            </p>
          </div>
        )}

        {/* Tabla de salidas */}
        {!cargando && !error && datosTab && (
          <div className="mt-4 mb-8">
            {/* KPIs sentido */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <KpiCard label="Salidas programadas" valor={datosTab.salidas.length.toString()} sub={`hoy (${fmtFechaCorta(fecha)})`} />
              <KpiCard label="Puntos de control" valor={datosTab.controlPointsCount.toString()} sub={`${datosTab.stopsCount} paradas totales`} />
              <KpiCard
                label={`% en tiempo (${tab})`}
                valor={`${datosTab.pctEnTiempoSentido}%`}
                sub={`${datosTab.totalPasadasSentido} pasadas detectadas`}
                color={colorPct(datosTab.pctEnTiempoSentido)}
              />
              <KpiCard
                label="Sin asociar"
                valor={datosTab.pasadasHuerfanas.length.toString()}
                sub="pasadas fuera de ventana"
                color={datosTab.pasadasHuerfanas.length > 0 ? 'text-yellow-400' : 'text-slate-400'}
              />
            </div>

            <SalidasTabla salidas={datosTab.salidas} onAbrir={setSalidaModal} />
          </div>
        )}
      </div>

      {/* Modal de detalle */}
      {salidaModal && datosTab && (
        <SalidaTimelineModal
          salida={salidaModal}
          linea={linea}
          sentido={tab}
          operadorNombre={operadorNombre}
          onCerrar={() => setSalidaModal(null)}
        />
      )}
    </div>
  );
}

/* ─── Sub: card KPI ──────────────────────────────────── */

function KpiCard({ label, valor, sub, color = 'text-slate-100' }: {
  label: string; valor: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{valor}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ─── Sub: tabla de salidas estilo IMM ───────────────── */

function SalidasTabla({ salidas, onAbrir }: {
  salidas: Salida[];
  onAbrir: (s: Salida) => void;
}) {
  if (salidas.length === 0) {
    return (
      <div className="bg-slate-900/40 border border-slate-700/40 rounded-xl px-6 py-12 text-center">
        <Clock className="w-10 h-10 mx-auto mb-3 text-slate-700" />
        <p className="text-sm text-slate-400 font-semibold">Sin salidas programadas</p>
        <p className="text-xs text-slate-500 mt-1">El horario GTFS no tiene viajes para este día.</p>
      </div>
    );
  }
  return (
    <div className="bg-slate-900/40 border border-slate-700/40 rounded-xl overflow-hidden">
      <div className="overflow-x-auto max-h-[68vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-900 border-b border-slate-700/60">
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Desde</th>
              <th className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Salida</th>
              <th className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Llegada</th>
              <th className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Destino</th>
              <th className="text-center px-3 py-3 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Coches</th>
              <th className="text-center px-3 py-3 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Pasadas</th>
              <th className="text-center px-3 py-3 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">% En tiempo</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {salidas.map((s, i) => {
              const conPasadas = s.totalPasadas > 0;
              return (
                <tr
                  key={`${s.horaSalida}_${i}`}
                  className={`border-b border-slate-800/50 transition-colors ${
                    conPasadas ? 'bg-slate-800/20 hover:bg-slate-800/40' : 'hover:bg-slate-800/30'
                  }`}
                >
                  <td className="px-4 py-2.5 text-[12px] text-slate-300">{s.origenNombre}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-slate-100 font-bold">{s.horaSalida}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-slate-300">{s.horaLlegada}</td>
                  <td className="px-3 py-2.5 text-[12px] text-slate-300">{s.destinoNombre}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-slate-300">
                    {s.cochesDetectados.length > 0
                      ? <span className="font-bold text-blue-300">{s.cochesDetectados.length}</span>
                      : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-slate-300">
                    {s.totalPasadas > 0 ? s.totalPasadas : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {conPasadas
                      ? <span className={`text-xs font-bold ${colorPct(s.pctEnTiempo)}`}>{s.pctEnTiempo}%</span>
                      : <span className="text-slate-600 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => onAbrir(s)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:text-white hover:bg-blue-600/30 transition-all flex items-center gap-1"
                      title="Ver timeline de control points y pasadas detectadas"
                    >
                      <MapPin className="w-3 h-3" />
                      Ver
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 bg-slate-900/60 border-t border-slate-700/40 flex items-center gap-2">
        <CheckCircle className="w-3.5 h-3.5 text-slate-500" />
        <p className="text-[11px] text-slate-500">
          Salidas resaltadas = tienen pasadas GPS detectadas en el día.
          Click en "Ver" abre el timeline de control points con la desviación de cada coche.
        </p>
      </div>
    </div>
  );
}
