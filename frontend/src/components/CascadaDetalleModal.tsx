/**
 * CascadaDetalleModal — Detalle de un evento del motor con efectos por
 * dominio y acción "Ir al módulo" (FASE 5.33, 2026-05-22).
 *
 * Se abre al hacer click en un item del PropagacionLiveWidget. Fetcha el
 * evento por id desde el feed con ?efectos=1 para traer la propagación
 * completa.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight, AlertTriangle, DollarSign, Users, Bus, FileText, TrendingDown, Network } from 'lucide-react';
import { apiClient } from '../clients/apiClient';

type Severidad = 'info' | 'advertencia' | 'critico';
type Dominio = 'RRHH' | 'NOMINA' | 'OPERACIONES' | 'OTP' | 'SUBSIDIO' | 'FINANZAS' | 'DISCIPLINA';

interface Efecto {
  dominio: Dominio;
  severidad: Severidad;
  titulo: string;
  descripcion: string;
  delta?: number;
  unidad?: string;
  entidadAfectadaId: string;
  entidadAfectadaTipo: string;
  requiereAccion: boolean;
  accionSugerida?: string;
}

interface FeedEventDetalle {
  id: number;
  ts: string;
  tipo: string;
  evento: Record<string, unknown>;
  totalEfectos: number;
  efectos?: Efecto[];
  resumen: {
    impactoNomina?: number;
    impactoSubsidio?: number;
    deltaOTP?: number;
    severidadGlobal?: Severidad;
  };
}

const DOMINIO_META: Record<Dominio, { label: string; icon: typeof Users; color: string }> = {
  RRHH: { label: 'RRHH', icon: Users, color: 'text-blue-300 border-blue-500/30 bg-blue-500/10' },
  NOMINA: { label: 'Nómina', icon: DollarSign, color: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  OPERACIONES: { label: 'Operaciones', icon: Bus, color: 'text-purple-300 border-purple-500/30 bg-purple-500/10' },
  OTP: { label: 'OTP', icon: TrendingDown, color: 'text-orange-300 border-orange-500/30 bg-orange-500/10' },
  SUBSIDIO: { label: 'Subsidio STM', icon: FileText, color: 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10' },
  FINANZAS: { label: 'Finanzas', icon: DollarSign, color: 'text-teal-300 border-teal-500/30 bg-teal-500/10' },
  DISCIPLINA: { label: 'Disciplina', icon: AlertTriangle, color: 'text-red-300 border-red-500/30 bg-red-500/10' },
};

// Mapeo de tipo de evento → ruta del módulo donde gestionar la acción correspondiente.
const TIPO_TO_RUTA: Record<string, { ruta: string; etiqueta: string }> = {
  CONDUCTOR_AUSENTE: { ruta: '/dashboard/traffic/listero', etiqueta: 'Ir al Listero' },
  VEHICULO_FUERA_DE_SERVICIO: { ruta: '/dashboard/fleet', etiqueta: 'Ir a Gestión de Flota' },
  RETRASO_OPERATIVO: { ruta: '/dashboard/traffic/diagnostico-cumplimiento', etiqueta: 'Ir a Cumplimiento' },
  VIAJE_CANCELADO: { ruta: '/dashboard/traffic/listero', etiqueta: 'Ir al Listero' },
};

interface Props {
  eventoId: number | null;
  onClose: () => void;
}

export default function CascadaDetalleModal({ eventoId, onClose }: Props) {
  const navigate = useNavigate();
  const [data, setData] = useState<FeedEventDetalle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (eventoId == null) return;
    setLoading(true);
    setError(null);
    setData(null);
    (async () => {
      try {
        // Trae el evento con efectos completos. El backend devuelve TODOS los eventos
        // recientes; filtramos por id en cliente (más simple que un endpoint /:id).
        const res = await apiClient.get<{ events?: FeedEventDetalle[] }>(
          '/api/cascade/feed',
          { query: { limit: 200, efectos: '1' } },
        );
        const events = (res as unknown as { events?: FeedEventDetalle[] }).events ?? res.data?.events ?? [];
        const found = events.find((e) => e.id === eventoId);
        if (!found) {
          setError('Evento no encontrado en el feed reciente.');
        } else {
          setData(found);
        }
      } catch (e) {
        setError('No se pudo cargar el detalle: ' + String(e).slice(0, 120));
      } finally {
        setLoading(false);
      }
    })();
  }, [eventoId]);

  if (eventoId == null) return null;

  const efectos = data?.efectos ?? [];
  const tipo = data?.tipo ?? '';
  const ruta = TIPO_TO_RUTA[tipo];
  const linea = String((data?.evento?.lineaId as string) ?? (data?.evento?.linea as string) ?? '');
  const coche = String((data?.evento?.cocheId as string) ?? (data?.evento?.cocheNumero as string) ?? '');
  const fuente = String((data?.evento?.fuente as string) ?? 'manual');
  const causa = String(
    (data?.evento?.causa as string) ?? (data?.evento?.causaViaje as string) ?? (data?.evento?.motivoVehiculo as string) ?? '',
  );

  // Agrupa efectos por dominio
  const porDominio: Record<string, Efecto[]> = {};
  for (const e of efectos) {
    if (!porDominio[e.dominio]) porDominio[e.dominio] = [];
    porDominio[e.dominio].push(e);
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[2000] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-purple-500/40 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl shadow-purple-900/30"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-start justify-between bg-gradient-to-r from-purple-950/40 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <Network className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {tipo ? tipo.replace(/_/g, ' ') : 'Cargando…'}
              </h2>
              <p className="text-xs text-slate-400">
                {linea && <span>Línea <b className="text-purple-300">L{linea}</b> · </span>}
                {coche && <span>Coche {coche} · </span>}
                <span className="text-slate-500">{fuente.replace('cascadeAutoTriggerScheduler:', 'auto:').replace('cascadeAutoTriggerScheduler', 'auto')}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          {loading && <div className="text-center text-slate-500 py-8">Cargando detalle…</div>}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {data && (
            <>
              {/* Resumen */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase">Efectos</div>
                  <div className="text-xl font-bold text-purple-300">{data.totalEfectos}</div>
                </div>
                <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
                  <div className="text-[10px] text-emerald-400/80 uppercase">Nómina UYU</div>
                  <div className="text-xl font-bold text-emerald-300 font-mono">
                    {(data.resumen?.impactoNomina ?? 0).toLocaleString('es-UY', { signDisplay: 'auto' })}
                  </div>
                </div>
                <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
                  <div className="text-[10px] text-yellow-400/80 uppercase">Subsidio UYU</div>
                  <div className="text-xl font-bold text-yellow-300 font-mono">
                    {(data.resumen?.impactoSubsidio ?? 0).toLocaleString('es-UY', { signDisplay: 'auto' })}
                  </div>
                </div>
                <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
                  <div className="text-[10px] text-orange-400/80 uppercase">Δ OTP</div>
                  <div className="text-xl font-bold text-orange-300 font-mono">
                    {(data.resumen?.deltaOTP ?? 0)}
                  </div>
                </div>
              </div>

              {causa && (
                <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3 text-sm text-slate-300">
                  <div className="text-[10px] uppercase text-slate-500 mb-1">Causa</div>
                  {causa}
                </div>
              )}

              {/* Efectos por dominio */}
              <div className="space-y-3">
                <h3 className="text-xs uppercase tracking-wide text-slate-400 font-bold">
                  Propagación cross-dominio ({efectos.length})
                </h3>
                {Object.keys(porDominio).length === 0 ? (
                  <div className="text-xs text-slate-500 italic">
                    Sin detalle de efectos persistido para este evento.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(Object.keys(porDominio) as Dominio[]).map((d) => {
                      const meta = DOMINIO_META[d] ?? DOMINIO_META.OPERACIONES;
                      const Icon = meta.icon;
                      const items = porDominio[d];
                      return (
                        <div key={d} className={`rounded-lg border ${meta.color} p-3`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Icon className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase">{meta.label}</span>
                            <span className="text-[10px] text-slate-500 ml-auto">{items.length}</span>
                          </div>
                          <ul className="space-y-1.5">
                            {items.map((e, i) => (
                              <li key={i} className="text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <div className="font-bold">{e.titulo}</div>
                                    <div className="text-slate-400 text-[11px]">{e.descripcion}</div>
                                    {e.requiereAccion && e.accionSugerida && (
                                      <div className="mt-1 text-[10px] text-amber-300 italic">
                                        → {e.accionSugerida}
                                      </div>
                                    )}
                                  </div>
                                  {e.delta != null && (
                                    <span className="font-mono text-[11px] whitespace-nowrap">
                                      {e.delta > 0 ? '+' : ''}{e.delta.toLocaleString('es-UY')}
                                      {e.unidad ? ' ' + e.unidad : ''}
                                    </span>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer con acción */}
        <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="text-[10px] text-slate-500 font-mono">
            ID #{eventoId} · {data?.ts ? new Date(data.ts).toLocaleString('es-UY', { hour12: false }) : '—'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700"
            >
              Cerrar
            </button>
            {ruta && (
              <button
                onClick={() => {
                  navigate(ruta.ruta);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold border border-purple-500"
              >
                {ruta.etiqueta}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
