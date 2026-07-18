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
import { Bus, AlertTriangle, MapPin, Clock, RefreshCw, Activity, Network, TrendingDown, Wrench, ShieldAlert, Navigation } from 'lucide-react';
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
  
  // Módulo 8: Disciplina EAM
  const [misAlertas, setMisAlertas] = useState<any[]>([]);
  const [alertaSeleccionada, setAlertaSeleccionada] = useState<any>(null);
  const [descargoForm, setDescargoForm] = useState('');

  // Módulo 9: Desvíos Proactivos
  const [hasDetour, setHasDetour] = useState<boolean>(false);
  const [detourMensaje, setDetourMensaje] = useState<string | null>(null);
  
  // Módulo 7: Taller EAM
  const [bloqueoMecanico, setBloqueoMecanico] = useState<{ bloqueado: boolean, mensaje: string | null }>({ bloqueado: false, mensaje: null });
  const [showReportarAveria, setShowReportarAveria] = useState(false);
  const [averiaForm, setAveriaForm] = useState({ sector: 'MECANICA', gravedad: 'LEVE', desc: '' });
  // Módulo 10 (Ésc.2): Escudo de Jornal por Incidencia Espacial
  const [escudoJornal, setEscudoJornal] = useState<{
    activado: boolean;
    desvio: string | null;
  } | null>(null);

  const cargarTurno = useCallback(async () => {
    try {
      const res = await apiClient.get<{ turno: MiTurno | null; nota?: string; has_detour?: boolean; detour_mensaje?: string }>('/api/mi-turno');
      const data = (res as unknown as { turno?: MiTurno | null; nota?: string; has_detour?: boolean; detour_mensaje?: string });
      setTurno(data?.turno ?? res.data?.turno ?? null);
      setNota((data?.nota ?? res.data?.nota) ?? null);
      setHasDetour((data?.has_detour ?? res.data?.has_detour) ?? false);
      setDetourMensaje((data?.detour_mensaje ?? res.data?.detour_mensaje) ?? null);
      
      // Módulo 8: Cargar Alertas Disciplinarias
      try {
        const alRes = await apiClient.get<{ alertas: any[] }>('/api/disciplina/mis-alertas');
        const alData = (alRes as unknown as { alertas?: any[] });
        setMisAlertas(alData?.alertas ?? alRes.data?.alertas ?? []);
      } catch (err) {
        console.warn('No se pudo validar alertas disciplinarias');
      }

      // Chequear bloqueo de taller
      try {
        const estRes = await apiClient.get<{ bloqueado: boolean; mensaje: string }>('/api/conductor/estado-coche');
        const estData = (estRes as unknown as { bloqueado?: boolean; mensaje?: string });
        setBloqueoMecanico({
          bloqueado: estData?.bloqueado ?? (estRes.data?.bloqueado) ?? false,
          mensaje: estData?.mensaje ?? (estRes.data?.mensaje) ?? null
        });
      } catch (err) {
        console.warn('No se pudo validar estado de taller');
      }
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

  const handleReportarAveriaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turno?.vehiculo_id) return;
    try {
      // Módulo 10: capturar posición GPS del conductor para evaluación PostGIS
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        // Si no hay GPS disponible, continuar sin coordenadas (flujo normal sin ST_DWithin)
        console.warn('[MiLinea] GPS no disponible, reporte sin evaluación espacial.');
      }

      const payload: Record<string, unknown> = {
        vehiculo_id: turno.vehiculo_id,
        sector_afectado: averiaForm.sector,
        gravedad: averiaForm.gravedad,
        descripcion: averiaForm.desc,
        ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
      };

      const res = await apiClient.post<{
        success: boolean;
        escudo_jornal_activado?: boolean;
        desvio_detectado?: { desvio_id: string; nombre: string } | null;
        message?: string;
      }>('/api/mantenimiento/ticket', payload);

      const data = (res as unknown as typeof res.data) ?? res.data;

      if (data?.escudo_jornal_activado) {
        // Escudo activado: mostrar banner de tranquilidad al trabajador
        setEscudoJornal({
          activado: true,
          desvio: data?.desvio_detectado?.nombre ?? null,
        });
      } else {
        alert(data?.message ?? 'Avería reportada. Si es CRÍTICA, el coche quedará inmovilizado.');
      }
      setShowReportarAveria(false);
      void refrescar();
    } catch (err) {
      alert('Error enviando avería.');
    }
  };

  const handleDescargoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertaSeleccionada) return;
    try {
      await apiClient.post('/api/disciplina/descargo', {
        alerta_id: alertaSeleccionada.id,
        descargo: descargoForm
      });
      alert('Descargo presentado inmutablemente.');
      setAlertaSeleccionada(null);
      setDescargoForm('');
      void refrescar();
    } catch (err) {
      alert('Error enviando descargo.');
    }
  };

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
      {/* Módulo 7: Bloqueo Mecánico Definitivo */}
      {bloqueoMecanico.bloqueado && (
        <div className="bg-red-500 text-white p-4 rounded-xl flex items-center justify-between shadow-xl animate-pulse font-bold border-2 border-red-700">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 flex-shrink-0" />
            <span className="text-xl uppercase tracking-wider">{bloqueoMecanico.mensaje}</span>
          </div>
          <button className="bg-white/20 px-4 py-2 rounded pointer-events-none opacity-50">VIAJE INMOVILIZADO</button>
        </div>
      )}

      {/* Módulo 10 (Ésc.2): Banner de Escudo de Jornal por Incidencia Espacial */}
      {escudoJornal?.activado && (
        <div className="bg-gradient-to-r from-emerald-900/80 to-blue-900/60 border-2 border-emerald-500/70 rounded-xl p-5 shadow-xl shadow-emerald-950/40">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-emerald-300 font-bold text-base mb-1">
                ✅ Incidencia Registrada — Jornal Protegido
              </p>
              <p className="text-emerald-200/90 text-sm leading-relaxed">
                Tu jornal base de <strong>7:30 hs</strong> se encuentra totalmente protegido bajo el convenio de desvíos.
                {escudoJornal.desvio && (
                  <span className="block mt-1 text-emerald-300/80 text-xs">
                    Desvío oficial confirmado: <strong>{escudoJornal.desvio}</strong>
                  </span>
                )}
              </p>
              <p className="text-xs text-emerald-500/70 mt-2">
                El despachador fue notificado automáticamente. Permanecé en el vehículo hasta la llegada del auxilio mecánico.
              </p>
            </div>
            <button
              onClick={() => setEscudoJornal(null)}
              className="text-emerald-500/60 hover:text-emerald-300 transition-colors shrink-0"
              aria-label="Cerrar notificación"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {showReportarAveria && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleReportarAveriaSubmit} className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2"><Wrench className="w-5 h-5"/> Reportar Avería EAM</h2>
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">Sector Afectado</label>
              <select className="w-full bg-slate-800 border border-slate-700 p-2 rounded text-white"
                value={averiaForm.sector} onChange={e => setAveriaForm({...averiaForm, sector: e.target.value})}>
                <option value="MECANICA">MECÁNICA</option>
                <option value="ELECTRICIDAD">ELECTRICIDAD</option>
                <option value="GOMERIA">GOMERÍA</option>
                <option value="CARROCERIA">CARROCERÍA</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">Gravedad (CRÍTICA inmoviliza el coche)</label>
              <select className="w-full bg-slate-800 border border-slate-700 p-2 rounded text-white font-bold"
                value={averiaForm.gravedad} onChange={e => setAveriaForm({...averiaForm, gravedad: e.target.value})}>
                <option value="LEVE">LEVE (Permite Circular)</option>
                <option value="CRITICA" className="text-red-400">CRÍTICA (Desafecta Listería)</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">Descripción</label>
              <textarea required className="w-full bg-slate-800 border border-slate-700 p-2 rounded text-white h-24"
                placeholder="Falla de frenos, humo en motor..."
                value={averiaForm.desc} onChange={e => setAveriaForm({...averiaForm, desc: e.target.value})} />
            </div>
            
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowReportarAveria(false)} className="px-4 py-2 rounded text-slate-300">Cancelar</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 rounded text-white font-bold hover:bg-blue-500">Enviar Denuncia</button>
            </div>
          </form>
        </div>
      )}

      {alertaSeleccionada && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleDescargoSubmit} className="bg-slate-900 border border-red-900/50 rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-400"/> Derecho a Descargo
            </h2>
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-200">
              Usted presenta descargo oficial para el acta: <b className="text-white">{alertaSeleccionada.tipo_alerta}</b>
            </div>
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">Justificación (Quedará inmutable)</label>
              <textarea required className="w-full bg-slate-800 border border-slate-700 p-2 rounded text-white h-32"
                placeholder="Escriba su justificación..."
                value={descargoForm} onChange={e => setDescargoForm(e.target.value)} />
            </div>
            
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => { setAlertaSeleccionada(null); setDescargoForm(''); }} className="px-4 py-2 rounded text-slate-300">Cancelar</button>
              <button type="submit" className="px-4 py-2 bg-red-600 rounded text-white font-bold hover:bg-red-500">Sellar Descargo</button>
            </div>
          </form>
        </div>
      )}

      {/* Módulo 8: Alertas Activas */}
      {misAlertas.length > 0 && (
        <div className="bg-slate-900 border border-red-900/40 rounded-xl p-5 mb-6">
          <h3 className="text-red-400 font-bold flex items-center gap-2 mb-3">
            <ShieldAlert className="w-5 h-5" /> Alertas Disciplinarias de Calle
          </h3>
          <div className="space-y-2">
            {misAlertas.map(a => (
              <div key={a.id} className="flex justify-between items-center bg-slate-800 p-3 rounded">
                <div>
                  <div className="text-white font-bold">{a.tipo_alerta}</div>
                  <div className="text-xs text-slate-400">Estado: {a.estado_tramite}</div>
                </div>
                {a.estado_tramite === 'PENDIENTE_DESCARGO' && (
                  <button onClick={() => setAlertaSeleccionada(a)} className="text-xs bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded font-bold text-white">
                    Presentar Descargo
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Módulo 9: Banner de Desvío Proactivo IMM */}
      {hasDetour && (
        <div className="bg-gradient-to-r from-orange-600 to-orange-800 border-2 border-orange-400 rounded-xl p-5 mb-6 shadow-xl shadow-orange-900/50 animate-pulse">
          <h3 className="text-white font-bold flex items-center gap-2 mb-2 text-lg">
            <Navigation className="w-6 h-6 text-orange-200" />
            ¡ALERTA DE FAENA! DESVÍO DE TRÁNSITO
          </h3>
          <p className="text-orange-100 font-medium">{detourMensaje}</p>
          <p className="text-sm text-orange-200 mt-2">Siga la traza alternativa dibujada en su radar M2. Evite la zona bacheada/feria.</p>
        </div>
      )}

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
          <div className="flex gap-2">
            <button
              onClick={() => setShowReportarAveria(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600/80 hover:bg-orange-500 text-white text-sm font-bold border border-orange-500/50"
            >
              <Wrench className="w-4 h-4" />
              Reportar Avería
            </button>
            <button
              onClick={() => { void refrescar(); if (turno.linea_id) void cargarLinea(turno.linea_id, turno.agency_id ?? undefined); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold border border-slate-700"
            >
              <RefreshCw className="w-4 h-4" />
              Refrescar
            </button>
          </div>
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
