/**
 * DesvioPanel — Panel de gestión de desvíos de una línea.
 *
 * Muestra TODOS los desvíos configurados para la línea (activos o no, vigentes o programados).
 * Cada desvío indica su estado en tiempo real:
 *   🟢 EN VIGOR AHORA  — está actuando en este momento
 *   🟡 PROGRAMADO      — está activo pero aún no es su horario/día
 *   ⚫ DESACTIVADO     — fue desactivado manualmente
 *
 * Permite: activar/desactivar, editar y eliminar cada desvío.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  MapPin,
  Clock,
  Calendar,
  RefreshCw,
  Infinity as InfinityIcon,
  Route,
  AlertCircle,
} from 'lucide-react';
import {
  listenDesviosPorLinea,
  eliminarDesvio,
  toggleDesvio,
  formatSchedule,
  esDesvioVigenteAhora,
  type DesvioGuardado,
} from '../../services/desviosService';

interface DesvioPanelProps {
  lineaCodigo: string;
  lineaNombre: string;
  onOpenEditor: (desvio?: DesvioGuardado) => void;
  /** Callback que se dispara cuando se agrega, edita, elimina o togglea un desvío. */
  onDesviosChange?: () => void;
}

const TIPO_ICONS = {
  puntual: Calendar,
  semanal: RefreshCw,
  indefinido: InfinityIcon,
} as const;

const TIPO_LABELS = {
  puntual: 'Puntual',
  semanal: 'Semanal',
  indefinido: 'Permanente',
} as const;

const TIPO_COLORS = {
  puntual: 'text-blue-400 bg-blue-900/30 border-blue-800/40',
  semanal: 'text-orange-400 bg-orange-900/30 border-orange-800/40',
  indefinido: 'text-red-400 bg-red-900/30 border-red-800/40',
} as const;

/** Calcula el estado visual de un desvío en este momento */
function getEstado(d: DesvioGuardado): 'vigente' | 'programado' | 'desactivado' {
  if (!d.activo) return 'desactivado';
  if (esDesvioVigenteAhora(d)) return 'vigente';
  return 'programado';
}

const ESTADO_BADGE: Record<
  'vigente' | 'programado' | 'desactivado',
  { label: string; className: string; dot: string }
> = {
  vigente: {
    label: 'EN VIGOR AHORA',
    className: 'text-green-300 bg-green-900/40 border border-green-700/50',
    dot: 'bg-green-400 animate-pulse',
  },
  programado: {
    label: 'PROGRAMADO',
    className: 'text-yellow-300 bg-yellow-900/30 border border-yellow-700/40',
    dot: 'bg-yellow-400',
  },
  desactivado: {
    label: 'DESACTIVADO',
    className: 'text-slate-500 bg-slate-800 border border-slate-700',
    dot: 'bg-slate-600',
  },
};

export default function DesvioPanel({
  lineaCodigo,
  lineaNombre,
  onOpenEditor,
  onDesviosChange,
}: DesvioPanelProps) {
  const { user } = useAuth();
  const [desvios, setDesvios] = useState<DesvioGuardado[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Escuchar desvíos en tiempo real. Guard de auth igual que RoadAlertsWidget.
  useEffect(() => {
    if (!lineaCodigo || !user?.uid) return;
    const unsub = listenDesviosPorLinea(lineaCodigo, (nuevos) => {
      setDesvios(nuevos);
      onDesviosChange?.();
    });
    return () => unsub();
  }, [lineaCodigo, onDesviosChange, user?.uid]);

  // Tick cada 60s para re-evaluar "vigente ahora" sin recarga de datos
  // Simplemente forzamos un re-render cambiando un estado contador (o recreando array)
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((v) => v + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async (id: string, activo: boolean) => {
    try {
      await toggleDesvio(id, !activo);
    } catch (error) {
      console.error('Error al cambiar estado del desvío:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmDelete === id) {
      try {
        await eliminarDesvio(id);
        setConfirmDelete(null);
      } catch (error) {
        console.error('Error al eliminar desvío:', error);
      }
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const vigentes = desvios.filter((d) => getEstado(d) === 'vigente');
  const programados = desvios.filter((d) => getEstado(d) === 'programado');
  const desactivados = desvios.filter((d) => getEstado(d) === 'desactivado');

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
      {/* ── Encabezado ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm">Desvíos configurados</h3>
          <p className="text-slate-400 text-xs mt-0.5 truncate">{lineaNombre}</p>
        </div>
        <button
          type="button"
          onClick={() => onOpenEditor()}
          className="flex items-center gap-1.5 min-h-[36px] px-3 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-400 text-white text-xs font-bold touch-manipulation ml-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nuevo
        </button>
      </div>

      {/* ── Resumen de estado actual ── */}
      {desvios.length > 0 && (
        <div className="grid grid-cols-3 divide-x divide-slate-700 border-b border-slate-700 bg-slate-800/50">
          <div className="flex flex-col items-center py-2.5 px-2">
            <span className="text-xl font-bold text-green-400">{vigentes.length}</span>
            <span className="text-[9px] text-slate-400 text-center leading-tight mt-0.5">
              En vigor
              <br />
              ahora
            </span>
          </div>
          <div className="flex flex-col items-center py-2.5 px-2">
            <span className="text-xl font-bold text-yellow-400">{programados.length}</span>
            <span className="text-[9px] text-slate-400 text-center leading-tight mt-0.5">
              Progra-
              <br />
              mados
            </span>
          </div>
          <div className="flex flex-col items-center py-2.5 px-2">
            <span className="text-xl font-bold text-slate-400">{desactivados.length}</span>
            <span className="text-[9px] text-slate-400 text-center leading-tight mt-0.5">
              Desacti-
              <br />
              vados
            </span>
          </div>
        </div>
      )}

      {/* ── Sin desvíos ── */}
      {desvios.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <MapPin className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 text-sm font-medium">Sin desvíos configurados</p>
          <p className="text-slate-600 text-xs mt-1.5 leading-relaxed">
            Esta línea no tiene desvíos registrados.
            <br />
            Presioná &quot;Nuevo&quot; para agregar el primero.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-700/60">
          {desvios.map((d) => {
            const TipoIcon = TIPO_ICONS[d.tipo];
            const isConfirming = confirmDelete === d.id;
            const estado = getEstado(d);
            const badge = ESTADO_BADGE[estado];

            return (
              <li
                key={d.id}
                className={`p-3 transition-colors ${estado === 'desactivado' ? 'opacity-60' : ''}`}
              >
                {/* Primera fila: badge de estado + acciones */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  {/* Badge estado en tiempo real */}
                  <div
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold ${badge.className}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badge.dot}`} />
                    {badge.label}
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggle(d.id, d.activo)}
                      className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg hover:bg-slate-700 touch-manipulation"
                      title={d.activo ? 'Desactivar desvío' : 'Activar desvío'}
                    >
                      {d.activo ? (
                        <ToggleRight className="w-5 h-5 text-green-400" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-slate-500" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenEditor(d)}
                      className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white touch-manipulation"
                      title="Editar desvío"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(d.id)}
                      className={`min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg touch-manipulation transition-colors ${
                        isConfirming
                          ? 'bg-red-700 text-white'
                          : 'hover:bg-slate-700 text-slate-500 hover:text-red-400'
                      }`}
                      title={isConfirming ? '¿Confirmar eliminación?' : 'Eliminar desvío'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Segunda fila: info del desvío */}
                <div className="flex items-start gap-2.5">
                  <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 border ${TIPO_COLORS[d.tipo]}`}>
                    <TipoIcon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-sm font-semibold truncate">{d.nombre}</span>
                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md border ${TIPO_COLORS[d.tipo]}`}
                      >
                        {TIPO_LABELS[d.tipo]}
                      </span>
                    </div>

                    {/* Horario */}
                    <div className="flex items-center gap-1.5 mt-1 text-slate-400 text-xs">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span className="truncate">{formatSchedule(d)}</span>
                    </div>

                    {/* Descripción */}
                    {d.descripcion && (
                      <p className="text-slate-500 text-xs mt-0.5 truncate">{d.descripcion}</p>
                    )}

                    {/* Trazado */}
                    <div className="flex items-center gap-1.5 mt-1 text-slate-600 text-[10px]">
                      <Route className="w-3 h-3 shrink-0" />
                      <span>{d.rutaAlternativa.length} puntos en el trazado alternativo</span>
                    </div>

                    {/* Aviso si es semanal y hoy no es el día */}
                    {d.tipo === 'semanal' && d.activo && estado === 'programado' && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-yellow-600 text-[10px]">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>
                          Activo los{' '}
                          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
                            .filter((_, i) => d.diasSemana?.includes(i))
                            .join(', ')}
                          {d.horaInicioSemanal && ` de ${d.horaInicioSemanal}`}
                          {d.horaFinSemanal && ` a ${d.horaFinSemanal}`}
                        </span>
                      </div>
                    )}

                    {/* Aviso si es puntual y no es hoy */}
                    {d.tipo === 'puntual' && d.activo && estado === 'programado' && d.fecha && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-yellow-600 text-[10px]">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>
                          Entra en vigor el {d.fecha.split('-').reverse().join('/')}
                          {d.horaInicio && ` a las ${d.horaInicio}`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Confirmar eliminación */}
                {isConfirming && (
                  <div className="mt-2 px-2 py-1.5 rounded-lg bg-red-900/30 border border-red-800/50 text-xs text-red-300 text-center">
                    ¿Eliminar este desvío? Tocá el ícono rojo de nuevo para confirmar.
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
