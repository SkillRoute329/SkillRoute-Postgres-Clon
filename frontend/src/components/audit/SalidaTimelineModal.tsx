/**
 * SalidaTimelineModal.tsx — Modal estilo IMM con timeline de control points
 * ==========================================================================
 *
 * Replica el modal de detalle del STM (montevideo.gub.uy/app/stm/horarios/) y
 * AGREGA por encima las pasadas GPS reales detectadas en cada control point.
 *
 * Visual:
 *   ●─── 04:30  Portonesterminal   (origen)
 *   │           ▼ Coche 22  04:31 (+1)  ✓
 *   │           ▼ Coche 78  04:29 (-1)  ✓
 *   ●─── 04:40  Malvin
 *   │           ▼ Coche 22  04:43 (+3)  ✓
 *   ●─── 04:46  Av Rivera/S López
 *   │           ─ sin pasada
 *   ...
 *   ●─── 05:47  Hospital Saint Bois (destino)
 */

import { useEffect, useMemo } from 'react';
import { X, MapPin, Bus, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import type { Salida, ControlPointConPasadas, PasadaGPS } from '../../services/auditoriaService';
import { minToHora } from '../../services/auditoriaService';

interface Props {
  salida: Salida;
  linea: string;
  sentido: 'IDA' | 'VUELTA';
  operadorNombre: string;
  onCerrar: () => void;
}

const TOL = 4; // tolerancia ±min EN_TIEMPO

function colorDesv(desv: number): string {
  const a = Math.abs(desv);
  if (a <= TOL) return 'text-emerald-400';
  if (desv > 0) return a > 8 ? 'text-red-400' : 'text-yellow-400';
  return a > 5 ? 'text-orange-400' : 'text-yellow-400';
}

function bgDesv(desv: number): string {
  const a = Math.abs(desv);
  if (a <= TOL) return 'bg-emerald-500/10 border-emerald-500/30';
  if (desv > 0) return a > 8 ? 'bg-red-500/15 border-red-500/40' : 'bg-yellow-500/10 border-yellow-500/30';
  return a > 5 ? 'bg-orange-500/15 border-orange-500/40' : 'bg-yellow-500/10 border-yellow-500/30';
}

function icoDesv(desv: number) {
  const a = Math.abs(desv);
  if (a <= TOL) return <CheckCircle className="w-3 h-3" />;
  return <AlertTriangle className="w-3 h-3" />;
}

function fmtSignedMin(d: number): string {
  if (d === 0) return '±0 min';
  return `${d > 0 ? '+' : ''}${d} min`;
}

export default function SalidaTimelineModal({
  salida, linea, sentido, operadorNombre, onCerrar,
}: Props) {
  // ESC cierra
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCerrar]);

  const cps = salida.controlPoints;
  // Resumen por coche detectado
  const porCoche: Record<string, { pasadas: number; enT: number; sumDesv: number; sumDesvN: number }> = {};
  for (const cp of cps) {
    for (const p of cp.pasadas) {
      const cs = porCoche[p.idBus] ?? { pasadas: 0, enT: 0, sumDesv: 0, sumDesvN: 0 };
      cs.pasadas += 1;
      if (Math.abs(p.desv) <= TOL) cs.enT += 1;
      cs.sumDesv += p.desv; cs.sumDesvN += 1;
      porCoche[p.idBus] = cs;
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <div>
            <h3 className="text-base font-bold text-slate-100">
              Línea <span className="text-blue-400">{linea}</span> · {sentido}
              <span className="text-slate-500 font-normal text-sm ml-2">
                Salida {salida.horaSalida} · Llegada {salida.horaLlegada}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {operadorNombre} · {salida.origenNombre} → {salida.destinoNombre}
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-all"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen del viaje */}
        <div className="px-5 py-3 bg-slate-800/30 border-b border-slate-700/60 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2 text-xs">
            <MapPin className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400">Puntos de control:</span>
            <span className="font-bold text-slate-200">{cps.length}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Bus className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400">Coches detectados:</span>
            <span className="font-bold text-slate-200">{salida.cochesDetectados.length}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400">Pasadas GPS:</span>
            <span className="font-bold text-slate-200">{salida.totalPasadas}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Cumplimiento:</span>
            <span className={`font-bold ${
              salida.pctEnTiempo >= 80 ? 'text-emerald-400' :
              salida.pctEnTiempo >= 60 ? 'text-yellow-400' :
              salida.pctEnTiempo > 0 ? 'text-red-400' : 'text-slate-500'
            }`}>{salida.totalPasadas > 0 ? `${salida.pctEnTiempo}%` : '— sin pasadas'}</span>
          </div>
        </div>

        {/* Coches detectados (resumen) */}
        {salida.cochesDetectados.length > 0 && (
          <div className="px-5 py-2.5 border-b border-slate-700/60 bg-slate-900/60">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">Coches que participaron</p>
            <div className="flex flex-wrap gap-2">
              {salida.cochesDetectados.map(idBus => {
                const cs = porCoche[idBus] ?? { pasadas: 0, enT: 0, sumDesv: 0, sumDesvN: 0 };
                const pct = cs.pasadas > 0 ? Math.round((cs.enT / cs.pasadas) * 100) : 0;
                const desvProm = cs.sumDesvN > 0 ? Math.round((cs.sumDesv / cs.sumDesvN) * 10) / 10 : 0;
                return (
                  <div key={idBus} className="px-2.5 py-1.5 rounded-lg border border-slate-700/60 bg-slate-800/50 text-xs">
                    <span className="text-blue-300 font-bold">Coche {idBus}</span>
                    <span className="text-slate-500 mx-1.5">·</span>
                    <span className="text-slate-300">{cs.pasadas} pasadas</span>
                    <span className="text-slate-500 mx-1.5">·</span>
                    <span className={pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'}>
                      {pct}% en tiempo
                    </span>
                    {cs.sumDesvN > 0 && (
                      <>
                        <span className="text-slate-500 mx-1.5">·</span>
                        <span className={colorDesv(desvProm)}>prom. {fmtSignedMin(desvProm)}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timeline de control points */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-gradient-to-b from-emerald-500/60 via-slate-600 to-orange-500/60" aria-hidden />
            <ul className="space-y-3">
              {cps.map((cp, idx) => (
                <ControlPointRow key={`${cp.stopId}_${idx}`} cp={cp} esOrigen={idx === 0} esDestino={idx === cps.length - 1} />
              ))}
            </ul>
          </div>
        </div>

        {/* Footer leyenda */}
        <div className="px-5 py-3 border-t border-slate-700/60 bg-slate-900/60 flex flex-wrap items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/40" />
            <span className="text-slate-400">±{TOL} min · EN TIEMPO</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-yellow-500/20 border border-yellow-500/30" />
            <span className="text-slate-400">5–8 min</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/40" />
            <span className="text-slate-400">&gt;8 min atrasado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-orange-500/20 border border-orange-500/40" />
            <span className="text-slate-400">&gt;5 min adelantado</span>
          </div>
          <div className="ml-auto text-slate-500">
            Datos: GTFS oficial IMM + GPS feed STM. Cero datos internos del operador.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub: fila de un control point ───────────────────── */

function ControlPointRow({ cp, esOrigen, esDestino }: {
  cp: ControlPointConPasadas;
  esOrigen: boolean;
  esDestino: boolean;
}) {
  // Depurar pings duplicados para el mismo bus en este control point en ventana de 2.5 minutos
  const pasadasFiltradas = useMemo(() => {
    const unicas: PasadaGPS[] = [];
    const ultimasPorBus: Record<string, PasadaGPS> = {};
    
    // Ordenamos pasadas cronológicamente
    const ordenadas = [...cp.pasadas].sort((a, b) => a.tReal - b.tReal);
    
    for (const p of ordenadas) {
      const ult = ultimasPorBus[p.idBus];
      if (ult && Math.abs(p.tReal - ult.tReal) <= 2.5) {
        // Conservamos el que tenga mayor desviación absoluta para reflejar el retraso pico
        if (Math.abs(p.desv) > Math.abs(ult.desv)) {
          const idx = unicas.findIndex(x => x === ult);
          if (idx !== -1) unicas[idx] = p;
          ultimasPorBus[p.idBus] = p;
        }
        continue;
      }
      unicas.push(p);
      ultimasPorBus[p.idBus] = p;
    }
    return unicas;
  }, [cp.pasadas]);

  const dotClass = esOrigen
    ? 'bg-emerald-500 ring-emerald-500/30'
    : esDestino
      ? 'bg-orange-500 ring-orange-500/30'
      : pasadasFiltradas.length > 0
        ? 'bg-blue-500 ring-blue-500/30'
        : 'bg-slate-700 ring-slate-700/30';

  return (
    <li className="flex items-start gap-3">
      <div className={`relative z-10 mt-1 w-4 h-4 rounded-full ring-4 ${dotClass} shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono text-sm text-slate-200 font-bold">{minToHora(cp.tProgramado)}</span>
          <span className="text-sm text-slate-300 truncate">
            {cp.nombre}
          </span>
          {esOrigen && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase tracking-wide">Origen</span>}
          {esDestino && <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/30 uppercase tracking-wide">Destino</span>}
          {pasadasFiltradas.length > 0 && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
              cp.pctEnTiempo >= 80 ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
              cp.pctEnTiempo >= 60 ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30' :
              'bg-red-500/10 text-red-300 border-red-500/30'
            }`}>
              {cp.pctEnTiempo}% en tiempo · {pasadasFiltradas.length} {pasadasFiltradas.length === 1 ? 'pasada' : 'pasadas'}
            </span>
          )}
        </div>
        {/* Pasadas */}
        {pasadasFiltradas.length === 0 ? (
          <p className="text-[10px] text-slate-600 italic mt-0.5">
            Sin pasada GPS detectada en ventana ±12 min
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {pasadasFiltradas.map((p, i) => <PasadaRow key={i} p={p} />)}
          </ul>
        )}
      </div>
    </li>
  );
}

function PasadaRow({ p }: { p: PasadaGPS }) {
  return (
    <li className={`text-[11px] px-2 py-1 rounded border ${bgDesv(p.desv)} flex items-center gap-2`}>
      <Bus className="w-3 h-3 text-blue-300 shrink-0" />
      <span className="font-bold text-blue-200 min-w-[55px]">Coche {p.idBus}</span>
      <span className="font-mono text-slate-200 min-w-[44px]">{minToHora(p.tReal)}</span>
      <span className={`flex items-center gap-1 font-bold ${colorDesv(p.desv)}`}>
        {icoDesv(p.desv)}
        {fmtSignedMin(p.desv)}
      </span>
      <span className="text-[9px] text-slate-500 ml-auto truncate hidden sm:inline">
        {p.estado === 'EN_TIEMPO' ? 'EN TIEMPO' :
         p.estado === 'ATRASADO' ? 'ATRASADO' :
         p.estado === 'ADELANTADO' ? 'ADELANTADO' :
         p.estado === 'SIN_HORARIO' ? 's/horario' : p.estado}
      </span>
    </li>
  );
}
