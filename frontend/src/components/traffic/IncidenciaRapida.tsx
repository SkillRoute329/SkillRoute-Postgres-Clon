/**
 * IncidenciaRapida — Panel de reporte rápido de incidencias viales.
 *
 * Diseñado para uso one-tap mientras se conduce:
 * - Botones gigantes (mínimo 64px × 64px)
 * - Feedback inmediato (confirmación visual)
 * - Captura automática de GPS y metadata
 */

import { useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, Clock } from 'lucide-react';
import {
  reportarIncidencia,
  getIncidencias,
  marcarResuelta,
  tiempoRelativo,
  INCIDENCIA_META,
  type TipoIncidencia,
  type IncidenciaReportada,
} from '../../services/incidenciasService';

interface IncidenciaRapidaProps {
  lineaCodigo?: string;
  lineaNombre?: string;
  conductorUid?: string;
  posicionActual?: { lat: number; lng: number } | null;
  onClose: () => void;
}

type Vista = 'botones' | 'historial';

const TIPOS_PRIMARIOS: TipoIncidencia[] = [
  'corte_calle',
  'accidente',
  'semaforo_roto',
  'parada_bloqueada',
];

const TIPOS_SECUNDARIOS: TipoIncidencia[] = ['congestion', 'obra_vial', 'objeto_via', 'otro'];

export default function IncidenciaRapida({
  lineaCodigo,
  lineaNombre,
  conductorUid,
  posicionActual,
  onClose,
}: IncidenciaRapidaProps) {
  const [confirmado, setConfirmado] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('botones');
  const [historial, setHistorial] = useState<IncidenciaReportada[]>([]);

  // Cargar historial inicial
  useEffect(() => {
    getIncidencias({ soloAbiertas: false, limite: 20 }).then(setHistorial);
  }, []);

  const handleReportar = useCallback(
    async (tipo: TipoIncidencia) => {
      const inc = await reportarIncidencia(tipo, {
        lat: posicionActual?.lat,
        lng: posicionActual?.lng,
        lineaCodigo,
        lineaNombre,
        conductorUid,
      });

      setConfirmado(inc.id);
      const nuevoHistorial = await getIncidencias({ soloAbiertas: false, limite: 20 });
      setHistorial(nuevoHistorial);

      setTimeout(() => {
        setConfirmado(null);
      }, 2500);
    },
    [posicionActual, lineaCodigo, lineaNombre, conductorUid],
  );

  const handleResolver = useCallback(async (id: string) => {
    await marcarResuelta(id);
    const nuevoHistorial = await getIncidencias({ soloAbiertas: false, limite: 20 });
    setHistorial(nuevoHistorial);
  }, []);

  const meta = confirmado
    ? INCIDENCIA_META[historial.find((i) => i.id === confirmado)?.tipo ?? 'otro']
    : null;

  const gpsText = posicionActual
    ? `GPS: ${posicionActual.lat.toFixed(5)}, ${posicionActual.lng.toFixed(5)}`
    : 'Sin GPS activo';

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 rounded-t-3xl border border-slate-700 shadow-2xl overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-700">
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">Reportar situación</h2>
            {lineaNombre && <p className="text-slate-400 text-xs truncate mt-0.5">{lineaNombre}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVista(vista === 'botones' ? 'historial' : 'botones')}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium touch-manipulation"
            >
              {vista === 'botones' ? 'Historial' : 'Reportar'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-700 text-slate-400 touch-manipulation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Feedback de confirmación ── */}
        {confirmado && meta && (
          <div className="mx-4 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-green-900/40 border border-green-700/60">
            <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
            <div>
              <p className="text-green-300 font-semibold text-sm">
                {meta.emoji} {meta.label} reportado
              </p>
              <p className="text-green-400/70 text-xs">{gpsText}</p>
            </div>
          </div>
        )}

        {/* ── Vista: Botones de incidencia ── */}
        {vista === 'botones' && (
          <div className="p-4 space-y-3 pb-safe">
            {/* Tipos primarios — botones grandes */}
            <div className="grid grid-cols-2 gap-3">
              {TIPOS_PRIMARIOS.map((tipo) => {
                const m = INCIDENCIA_META[tipo];
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => handleReportar(tipo)}
                    className="inc-btn-primary flex flex-col items-center justify-center gap-2 min-h-[80px] rounded-2xl border-2 bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all touch-manipulation select-none"
                    data-color={m.color}
                  >
                    <span className="text-3xl leading-none">{m.emoji}</span>
                    <span className="text-white text-xs font-semibold text-center leading-tight px-1">
                      {m.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Tipos secundarios — botones compactos */}
            <div className="grid grid-cols-4 gap-2">
              {TIPOS_SECUNDARIOS.map((tipo) => {
                const m = INCIDENCIA_META[tipo];
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => handleReportar(tipo)}
                    className="flex flex-col items-center justify-center gap-1.5 min-h-[60px] rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all touch-manipulation select-none px-1"
                  >
                    <span className="text-xl leading-none">{m.emoji}</span>
                    <span className="text-slate-300 text-[9px] font-medium text-center leading-tight">
                      {m.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-center text-slate-500 text-xs pb-2">
              La ubicación GPS se adjunta automáticamente
            </p>
          </div>
        )}

        {/* ── Vista: Historial de incidencias ── */}
        {vista === 'historial' && (
          <div className="max-h-[55vh] overflow-y-auto pb-safe">
            {historial.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-slate-500 text-sm">Sin incidencias reportadas</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {historial.map((inc) => {
                  const m = INCIDENCIA_META[inc.tipo];
                  return (
                    <li
                      key={inc.id}
                      className={`flex items-center gap-3 px-4 py-3 ${inc.resuelta ? 'opacity-50' : ''}`}
                    >
                      <span className="text-2xl shrink-0">{m.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium">{m.label}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="text-slate-400 text-xs">
                            {tiempoRelativo(inc.timestamp)}
                          </span>
                          {inc.lineaCodigo && (
                            <span className="text-slate-500 text-xs">· L{inc.lineaCodigo}</span>
                          )}
                        </div>
                        {inc.lat && (
                          <p className="text-slate-600 text-[10px] mt-0.5 font-mono">
                            {inc.lat.toFixed(4)}, {inc.lng?.toFixed(4)}
                          </p>
                        )}
                      </div>
                      {!inc.resuelta && (
                        <button
                          type="button"
                          onClick={() => handleResolver(inc.id)}
                          className="shrink-0 min-h-[32px] px-3 py-1 rounded-lg bg-slate-700 hover:bg-green-700 text-slate-300 hover:text-white text-xs font-medium touch-manipulation transition-colors"
                        >
                          Cerrar
                        </button>
                      )}
                      {inc.resuelta && <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
