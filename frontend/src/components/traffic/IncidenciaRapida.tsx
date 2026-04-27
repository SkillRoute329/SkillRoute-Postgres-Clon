/**
 * IncidenciaRapida — Panel de reporte rápido de incidencias viales.
 *
 * Diseñado para uso one-tap mientras se conduce:
 * - Botones gigantes (mínimo 64px × 64px)
 * - Feedback inmediato (confirmación visual)
 * - Captura automática de GPS y metadata
 * - Sin línea seleccionada: reporta como incidencia geográfica independiente.
 * - Con línea pero punto fuera del recorrido: misma cosa, no la asocia mal.
 * - Permite "Marcar en mapa" (callback al padre que cierra el modal y
 *   activa picking).
 */

import { useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, Clock, MapPin, AlertTriangle } from 'lucide-react';
import {
  reportarIncidencia,
  getIncidencias,
  marcarResuelta,
  tiempoRelativo,
  puntoSobreRecorrido,
  INCIDENCIA_META,
  type TipoIncidencia,
  type IncidenciaReportada,
} from '../../services/incidenciasService';

interface IncidenciaRapidaProps {
  lineaCodigo?: string;
  lineaNombre?: string;
  conductorUid?: string;
  posicionActual?: { lat: number; lng: number } | null;
  /** Punto que el conductor seleccionó tocando el mapa. Pisa al GPS. */
  puntoMarcadoEnMapa?: { lat: number; lng: number } | null;
  /** Recorrido de la línea seleccionada (para validar coincidencia geográfica). */
  recorridoLinea?: Array<{ lat: number; lng: number }>;
  /** Callback al padre: cerrar este modal y entrar en modo "tap en mapa". */
  onSolicitarMarcarMapa?: () => void;
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
  puntoMarcadoEnMapa,
  recorridoLinea,
  onSolicitarMarcarMapa,
  onClose,
}: IncidenciaRapidaProps) {
  const [confirmado, setConfirmado] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('botones');
  const [historial, setHistorial] = useState<IncidenciaReportada[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reportando, setReportando] = useState<TipoIncidencia | null>(null);

  // Cargar historial inicial
  useEffect(() => {
    getIncidencias({ soloAbiertas: false, limite: 20 })
      .then(setHistorial)
      .catch((e) => setError(`No se pudo cargar el historial: ${e?.message ?? e}`));
  }, []);

  /** Coordenada efectiva: punto marcado en mapa pisa al GPS. */
  const puntoEfectivo = puntoMarcadoEnMapa ?? posicionActual ?? null;

  /** ¿La incidencia debe asociarse a la línea (geografía coincide)? */
  const sobreRecorrido = puntoSobreRecorrido(puntoEfectivo, recorridoLinea, 60);
  const asociarALinea = !!lineaCodigo && (sobreRecorrido || !puntoEfectivo);

  const handleReportar = useCallback(
    async (tipo: TipoIncidencia) => {
      if (reportando) return;
      setError(null);
      setReportando(tipo);
      try {
        const inc = await reportarIncidencia(tipo, {
          lat: puntoEfectivo?.lat,
          lng: puntoEfectivo?.lng,
          lineaCodigo: asociarALinea ? lineaCodigo : undefined,
          lineaNombre: asociarALinea ? lineaNombre : undefined,
          conductorUid,
        });

        setConfirmado(inc.id);
        const nuevoHistorial = await getIncidencias({ soloAbiertas: false, limite: 20 });
        setHistorial(nuevoHistorial);

        setTimeout(() => {
          setConfirmado(null);
        }, 2500);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Mensaje legible para el conductor.
        if (/permission|denied|insufficient/i.test(msg)) {
          setError(
            'No tiene permisos para reportar incidencias. Contacte al despacho para habilitar su rol.',
          );
        } else if (/network|offline/i.test(msg)) {
          setError('Sin conexión. La incidencia no pudo enviarse — vuelva a intentar.');
        } else {
          setError(`No se pudo reportar: ${msg}`);
        }
      } finally {
        setReportando(null);
      }
    },
    [puntoEfectivo, asociarALinea, lineaCodigo, lineaNombre, conductorUid, reportando],
  );

  const handleResolver = useCallback(async (id: string) => {
    try {
      await marcarResuelta(id);
      const nuevoHistorial = await getIncidencias({ soloAbiertas: false, limite: 20 });
      setHistorial(nuevoHistorial);
    } catch (e) {
      setError(`No se pudo cerrar: ${e instanceof Error ? e.message : e}`);
    }
  }, []);

  const meta = confirmado
    ? INCIDENCIA_META[historial.find((i) => i.id === confirmado)?.tipo ?? 'otro']
    : null;

  // Texto del subtítulo del header según contexto.
  let subtitulo: string;
  let subtituloColor = 'text-slate-400';
  if (puntoMarcadoEnMapa) {
    if (lineaCodigo && sobreRecorrido) {
      subtitulo = `Línea ${lineaCodigo} · ✓ Sobre recorrido`;
      subtituloColor = 'text-emerald-400';
    } else if (lineaCodigo) {
      subtitulo = `Línea ${lineaCodigo} · ⚠ Punto fuera del recorrido — se reportará como incidencia general`;
      subtituloColor = 'text-amber-400';
    } else {
      subtitulo = 'Sin línea — incidencia general en el punto marcado';
    }
  } else if (lineaCodigo) {
    subtitulo = lineaNombre ?? `Línea ${lineaCodigo}`;
  } else {
    subtitulo = 'Sin línea — incidencia general (GPS automático)';
    subtituloColor = 'text-slate-300';
  }

  const gpsText = puntoEfectivo
    ? `${puntoMarcadoEnMapa ? '📍 Punto seleccionado' : 'GPS'}: ${puntoEfectivo.lat.toFixed(5)}, ${puntoEfectivo.lng.toFixed(5)}`
    : 'Sin GPS activo — se reportará sin ubicación';

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 rounded-t-3xl border border-slate-700 shadow-2xl overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-700">
          <div className="min-w-0">
            <h2 className="text-white font-bold text-lg leading-tight">Reportar situación</h2>
            <p className={`text-xs truncate mt-0.5 ${subtituloColor}`}>{subtitulo}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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

        {/* ── Banner punto marcado en mapa ── */}
        {puntoMarcadoEnMapa && vista === 'botones' && (
          <div className="mx-4 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-900/40 border border-blue-700/60">
            <MapPin className="w-5 h-5 text-blue-400 shrink-0" />
            <p className="text-blue-200 text-sm flex-1">
              Reportando en este punto del mapa
              <span className="block text-blue-300/70 text-xs font-mono mt-0.5">
                {puntoMarcadoEnMapa.lat.toFixed(5)}, {puntoMarcadoEnMapa.lng.toFixed(5)}
              </span>
            </p>
          </div>
        )}

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

        {/* ── Error ── */}
        {error && (
          <div className="mx-4 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-900/40 border border-red-700/60">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-red-200 text-sm flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-300 hover:text-white text-xs px-2 py-1 rounded-lg bg-red-800/50"
            >
              OK
            </button>
          </div>
        )}

        {/* ── Vista: Botones de incidencia ── */}
        {vista === 'botones' && (
          <div className="p-4 space-y-3 pb-safe">
            {/* Tipos primarios — botones grandes */}
            <div className="grid grid-cols-2 gap-3">
              {TIPOS_PRIMARIOS.map((tipo) => {
                const m = INCIDENCIA_META[tipo];
                const isLoading = reportando === tipo;
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => handleReportar(tipo)}
                    disabled={!!reportando}
                    className="inc-btn-primary flex flex-col items-center justify-center gap-2 min-h-[80px] rounded-2xl border-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-wait active:scale-95 transition-all touch-manipulation select-none"
                    data-color={m.color}
                  >
                    <span className="text-3xl leading-none">{isLoading ? '⏳' : m.emoji}</span>
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
                const isLoading = reportando === tipo;
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => handleReportar(tipo)}
                    disabled={!!reportando}
                    className="flex flex-col items-center justify-center gap-1.5 min-h-[60px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-wait active:scale-95 transition-all touch-manipulation select-none px-1"
                  >
                    <span className="text-xl leading-none">{isLoading ? '⏳' : m.emoji}</span>
                    <span className="text-slate-300 text-[9px] font-medium text-center leading-tight">
                      {m.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Acciones secundarias */}
            <div className="flex items-center justify-between gap-2 pt-2">
              {onSolicitarMarcarMapa && (
                <button
                  type="button"
                  onClick={onSolicitarMarcarMapa}
                  className="flex-1 flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-400 text-white text-sm font-medium touch-manipulation"
                >
                  <MapPin className="w-4 h-4" />
                  {puntoMarcadoEnMapa ? 'Cambiar punto' : 'Marcar en mapa'}
                </button>
              )}
              <p className="flex-1 text-center text-slate-500 text-xs">
                {puntoEfectivo ? 'Ubicación adjunta' : 'Sin ubicación'}
              </p>
            </div>
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
                          {inc.lineaCodigo ? (
                            <span className="text-slate-500 text-xs">· L{inc.lineaCodigo}</span>
                          ) : (
                            <span className="text-amber-500/80 text-xs">· general</span>
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
