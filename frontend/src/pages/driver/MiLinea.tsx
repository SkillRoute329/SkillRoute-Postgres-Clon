/**
 * MiLinea — Dashboard simplificado para el conductor con la información
 * en vivo de SU línea activa hoy (FASE 5.36, 2026-05-22).
 *
 * Detecta el turno activo del usuario (GET /api/mi-turno), muestra:
 *   - Datos del turno (línea, coche, hora salida)
 *   - Inteligencia en vivo de la línea (/api/inteligencia/:linea)
 *   - Últimos eventos del motor relacionados con la línea (/api/cascade/feed)
 *
 * Pensado para usar en una pantalla del chofer mientras maneja: contraste
 * alto, tipografía grande, refresh cada 30s + suscripción al bus de
 * propagación para reaccionar al instante.
 */

import { useEffect, useState, useCallback } from 'react';
import { Bus, AlertTriangle, MapPin, Clock, RefreshCw, Activity, Network, TrendingDown } from 'lucide-react';
import { apiClient } from '../../clients/apiClient';
import { on as socketOn } from '../../clients/socketClient';
import { useAuth } from '../../context/AuthContext';

interface MiTurno {
  id: string;
  fecha: string;
  linea_id: string;
  vehiculo_id?: string | null;
  vehiculo_interno?: string | null;
  hora_salida?: string | null;
  hora_llegada_estimada?: string | null;
  estado?: string | null;
  agency_id?: string | null;
  conductor_nombre?: string | null;
  conductor_interno?: string | null;
  firma_conductor?: boolean;
  hora_firma?: string | null;
}

interface InteligenciaLinea {
  ok: boolean;
  linea: string;
  ventana?: string;
  buses?: { total: number; propios: number; competidores: number; porOperador: Record<string, number> };
  desempeno?: { velocidadMedia: number | null; enRiesgo: number; porcentajeEnRiesgo: number };
}

interface FeedEvent {
  id: number;
  ts: string;
  tipo: string;
  evento: Record<string, unknown>;
  totalEfectos: number;
  severidad: 'info' | 'advertencia' | 'critico';
  resumen?: { impactoNomina?: number; impactoSubsidio?: number };
}

const SEV_COLOR: Record<string, string> = {
  info: 'bg-slate-700/30 text-slate-300 border-slate-600',
  advertencia: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  critico: 'bg-red-500/15 text-red-300 border-red-500/50 animate-pulse',
};

const TIPO_LABEL: Record<string, string> = {
  CONDUCTOR_AUSENTE: 'Conductor ausente',
  VEHICULO_FUERA_DE_SERVICIO: 'Vehículo fuera de servicio',
  RETRASO_OPERATIVO: 'Retraso operativo',
  VIAJE_CANCELADO: 'Viaje cancelado',
};

export default function MiLinea() {
  const { user } = useAuth();
  const [turno, setTurno] = useState<MiTurno | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [intel, setIntel] = useState<InteligenciaLinea | null>(null);
  const [eventos, setEventos] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const cargarTurno = useCallback(async () => {
    try {
      const res = await apiClient.get<{ turno: MiTurno | null; nota?: string }>('/api/mi-turno');
      const data = (res as unknown as { turno?: MiTurno | null; nota?: string });
      setTurno(data?.turno ?? res.data?.turno ?? null);
      setNota((data?.nota ?? res.data?.nota) ?? null);
    } catch {
      setTurno(null);
      setNota('Error consultando turno del día.');
    }
  }, []);

  const cargarLinea = useCallback(async (linea: string, agency?: string) => {
    if (!linea) return;
    try {
      const [intelRes, feedRes] = await Promise.all([
        apiClient.get<InteligenciaLinea>(`/api/inteligencia/${encodeURIComponent(linea)}`),
        apiClient.get<{ events?: FeedEvent[] }>('/api/cascade/feed', {
          query: { limit: 50, agency_id: agency ?? '' },
        }),
      ]);
      const intelData = (intelRes as unknown as InteligenciaLinea);
      setIntel(intelData?.ok ? intelData : (intelRes.data ?? null));
      const events = (feedRes as unknown as { events?: FeedEvent[] }).events ?? feedRes.data?.events ?? [];
      // Filtrar a eventos de esta línea
      const propios = (events || []).filter((e) => {
        const l = String((e.evento.lineaId as string) ?? (e.evento.linea as string) ?? '');
        return l === linea;
      }).slice(0, 8);
      setEventos(propios);
      setLastUpdate(new Date());
    } catch (e) {
      console.error('[MiLinea] cargarLinea', e);
    }
  }, []);

  const refrescar = useCallback(async () => {
    setLoading(true);
    await cargarTurno();
    setLoading(false);
  }, [cargarTurno]);

  // Carga inicial
  useEffect(() => { void refrescar(); }, [refrescar]);

  // Cuando hay turno, cargar datos de la línea + refresh cada 30s
  useEffect(() => {
    if (!turno?.linea_id) return;
    void cargarLinea(turno.linea_id, turno.agency_id ?? undefined);
    const id = setInterval(() => { void cargarLinea(turno.linea_id, turno.agency_id ?? undefined); }, 30_000);
    return () => clearInterval(id);
  }, [turno?.linea_id, turno?.agency_id, cargarLinea]);

  // Bus: refetch al instante cuando llega evento de la línea propia.
  useEffect(() => {
    if (!turno?.linea_id) return;
    const off = socketOn<{ lineaId?: string; evento?: { lineaId?: string } }>('bus:cascade:summary', (data) => {
      const l = data?.evento?.lineaId ?? data?.lineaId;
      if (l && String(l) === turno.linea_id) {
        void cargarLinea(turno.linea_id, turno.agency_id ?? undefined);
      }
    });
    return off;
  }, [turno?.linea_id, turno?.agency_id, cargarLinea]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading && !turno) {
    return (
      <div className="text-center py-16 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
        Cargando tu turno…
      </div>
    );
  }

  if (!turno) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <div className="inline-flex p-4 rounded-2xl bg-slate-800 border border-slate-700 mb-4">
          <Bus className="w-12 h-12 text-slate-500" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Sin turno asignado hoy</h1>
        <p className="text-slate-400">
          {nota ?? 'No encontramos un turno activo para tu usuario en la fecha de hoy.'}
        </p>
        <p className="text-xs text-slate-500 mt-4">
          Si esto es un error, contactá al Listero para que verifique la asignación.
        </p>
        <button
          onClick={() => void refrescar()}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold border border-slate-700"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
      </div>
    );
  }

  const enRiesgo = intel?.desempeno?.enRiesgo ?? 0;
  const totalBuses = intel?.buses?.total ?? 0;
  const pctRiesgo = totalBuses > 0 ? Math.round(((enRiesgo / totalBuses) * 100)) : 0;

  return (
    <div className="space-y-6 animate-fade-in-up max-w-4xl">
      {/* Cabecera: turno */}
      <div className="bg-gradient-to-br from-blue-900 to-slate-900 border-2 border-blue-500/30 rounded-2xl p-6 shadow-2xl shadow-blue-900/30">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/20 border border-blue-500/40">
              <Bus className="w-10 h-10 text-blue-300" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-blue-300 font-bold">
                Mi turno · {turno.fecha}
              </div>
              <h1 className="text-4xl font-black text-white mt-1">
                Línea {turno.linea_id || '—'}
              </h1>
              <div className="text-sm text-blue-200/80 mt-1">
                {(turno.conductor_nombre || user?.fullName) ?? 'Conductor'} · Coche{' '}
                <span className="font-bold text-white">{turno.vehiculo_interno || turno.vehiculo_id || '—'}</span>
                {turno.hora_salida && (
                  <> · Salida <span className="font-bold text-white">{turno.hora_salida}</span></>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => { void refrescar(); if (turno.linea_id) void cargarLinea(turno.linea_id, turno.agency_id ?? undefined); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold border border-slate-700"
          >
            <RefreshCw className="w-4 h-4" />
            Refrescar
          </button>
        </div>
      </div>

      {/* KPIs en vivo de la línea */}
      <div>
        <h2 className="text-xs uppercase tracking-wide text-slate-500 font-bold mb-3 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" />
          Mi línea ahora · {intel?.ventana ?? 'últimos 60min'}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] uppercase text-slate-500">Buses en línea</div>
            <div className="text-3xl font-bold text-white">{totalBuses}</div>
            {intel?.buses && (
              <div className="text-[10px] text-slate-500 mt-1">
                Propios <b className="text-emerald-400">{intel.buses.propios}</b> · Rivales <b className="text-amber-400">{intel.buses.competidores}</b>
              </div>
            )}
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] uppercase text-slate-500">Velocidad media</div>
            <div className="text-3xl font-bold text-blue-300 font-mono">
              {intel?.desempeno?.velocidadMedia != null ? intel.desempeno.velocidadMedia.toFixed(1) : '—'}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">km/h</div>
          </div>
          <div className={`bg-slate-900 border rounded-xl p-4 ${pctRiesgo >= 30 ? 'border-red-500/40' : 'border-slate-800'}`}>
            <div className="text-[10px] uppercase text-slate-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              En riesgo
            </div>
            <div className={`text-3xl font-bold font-mono ${pctRiesgo >= 30 ? 'text-red-300' : 'text-white'}`}>
              {enRiesgo}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">{pctRiesgo}% del total</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] uppercase text-slate-500 flex items-center gap-1">
              <Network className="w-3 h-3" />
              Eventos motor
            </div>
            <div className="text-3xl font-bold text-purple-300">{eventos.length}</div>
            <div className="text-[10px] text-slate-500 mt-1">en últimos eventos</div>
          </div>
        </div>
      </div>

      {/* Lista de eventos del motor en MI línea */}
      <div>
        <h2 className="text-xs uppercase tracking-wide text-slate-500 font-bold mb-3 flex items-center gap-2">
          <TrendingDown className="w-3.5 h-3.5" />
          Eventos recientes en línea {turno.linea_id}
        </h2>
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {eventos.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              Sin eventos del motor en tu línea recientemente. Operación normal.
            </div>
          ) : (
            <ul className="divide-y divide-slate-800/70">
              {eventos.map((e) => {
                const causa = String(
                  (e.evento.causa as string) ?? (e.evento.causaViaje as string) ?? (e.evento.motivoVehiculo as string) ?? '',
                );
                return (
                  <li key={e.id} className={`p-3 border-l-4 ${SEV_COLOR[e.severidad] ?? SEV_COLOR.info}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold">{TIPO_LABEL[e.tipo] ?? e.tipo}</div>
                        {causa && <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{causa}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-slate-500 font-mono">
                          {new Date(e.ts).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-[10px] text-purple-300 mt-0.5">
                          {e.totalEfectos} efectos
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="text-[10px] text-slate-500 text-right">
        <Clock className="w-3 h-3 inline mr-1" />
        Última actualización: {lastUpdate.toLocaleTimeString('es-UY')} · Refresh cada 30s + bus en vivo
      </div>
    </div>
  );
}
