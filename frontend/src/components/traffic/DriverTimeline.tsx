/**
 * Vista comprensible para el chofer: línea vertical, punto actual, próximo hito, alerta de desvío (-X MIN).
 * Sin tablas técnicas. Fuente de hora: sistema; sin GPS simulado.
 */
import { useMemo } from 'react';
import { MapPin, Clock } from 'lucide-react';
import {
  computeTimelineState,
  parseHoraTimeline,
  type PuntoHito,
} from '../../utils/driverTimelineUtils';

export type { PuntoHito } from '../../utils/driverTimelineUtils';

export interface DriverTimelineProps {
  puntos: PuntoHito[];
  /** Hora actual del sistema "HH:mm" */
  horaActual: string;
  /** Minutos de atraso en punto de control (inspección/registro real). Si no hay señal, no inventar. */
  atrasoMinutos?: number;
  /** Etiqueta opcional del servicio (ej. "329h - 1129") */
  servicioLabel?: string;
}

export function DriverTimeline({
  puntos,
  horaActual,
  atrasoMinutos,
  servicioLabel,
}: DriverTimelineProps) {
  const { indiceActual, proximo, minutosAtraso } = useMemo(
    () => computeTimelineState(puntos, horaActual, atrasoMinutos),
    [puntos, horaActual, atrasoMinutos],
  );

  if (puntos.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-800/80 border border-slate-700 p-6 text-center text-slate-400">
        <p>Sin puntos de control para este servicio.</p>
        <p className="text-sm mt-1">Ubicación desconocida – Verificar en Punto de Control.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-800/90 border-2 border-slate-600 overflow-hidden shadow-lg">
      {servicioLabel && (
        <div className="px-4 py-3 border-b border-slate-700 text-slate-300 text-base font-semibold">
          {servicioLabel}
        </div>
      )}

      {/* Próximo hito en grande – legible al sol */}
      {proximo && (
        <div className="px-4 py-5 bg-slate-900/60 border-b border-slate-700">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">
            Próximo
          </div>
          <div className="text-2xl md:text-3xl font-black text-white flex items-center gap-3 flex-wrap leading-tight">
            <MapPin className="w-8 h-8 text-emerald-400 shrink-0" aria-hidden />
            <span className="uppercase">{proximo.nombre}</span>
            <span className="text-emerald-400 font-mono text-xl">– {proximo.hora}</span>
          </div>
        </div>
      )}

      {/* Alerta de desvío: -X MIN en rojo, alta visibilidad */}
      {minutosAtraso > 0 && (
        <div className="px-4 py-4 bg-red-950/60 border-b-2 border-red-600 flex items-center gap-3">
          <Clock className="w-6 h-6 text-red-300 shrink-0" aria-hidden />
          <span className="text-red-200 font-black text-lg">-{minutosAtraso} MIN</span>
          <span className="text-red-200/90 text-base">(verificar en Punto de Control)</span>
        </div>
      )}

      {/* Línea vertical + puntos – texto grande para guantes/sol */}
      <div className="p-4 pl-6 relative">
        <div className="absolute left-4 top-4 bottom-4 w-1 bg-slate-600 rounded-full" aria-hidden />
        <div className="relative flex flex-col gap-0">
          {puntos.map((p, i) => {
            const esActual = i === indiceActual;
            const esPasado = i < indiceActual;
            const esFuturo = i > indiceActual;
            const horaNum = parseHoraTimeline(p.hora);
            const nowNum = parseHoraTimeline(horaActual);
            const atrasoEnEste = indiceActual === i && nowNum > horaNum ? nowNum - horaNum : 0;

            return (
              <div key={`${p.nombre}-${p.hora}`} className="flex gap-4 items-start -ml-2 py-1">
                <div
                  className={`shrink-0 w-6 h-6 rounded-full border-2 z-10 ${
                    esActual
                      ? 'bg-emerald-500 border-emerald-300 ring-4 ring-emerald-500/40'
                      : esPasado
                        ? 'bg-slate-600 border-slate-500'
                        : 'bg-slate-700 border-slate-600'
                  }`}
                  aria-hidden
                />
                <div className={`pb-4 ${esFuturo ? 'opacity-80' : ''}`}>
                  <div className="font-bold text-white uppercase tracking-wide text-lg">
                    {p.nombre}
                  </div>
                  <div className="text-slate-300 text-base font-mono">{p.hora}</div>
                  {esActual && atrasoEnEste > 0 && (
                    <div className="text-red-400 text-base font-black mt-1">
                      -{atrasoEnEste} MIN
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-slate-700 text-slate-400 text-sm font-medium">
        Hora del sistema: <span className="text-white font-mono">{horaActual}</span>. Sin señal GPS:
        verificar en Punto de Control.
      </div>
    </div>
  );
}

export default DriverTimeline;
