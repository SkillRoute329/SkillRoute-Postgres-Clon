import { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  where,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from '../../config/firestoreShim';
import { db } from '../../config/firebase';
import { authReady } from '../../config/firebase';
import { AlertTriangle, Bell, CheckCircle, Clock, MapPin, Send, X, RefreshCw, Navigation } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { formatHoraSegundosMvd } from '../../utils/formatTimestamp';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface EventoDesvio {
  id: string;
  coche_id: string;
  linea_id: string;
  tipo: 'FUERA_DE_RUTA' | 'FUERA_DE_DESVIO_OFICIAL';
  lat: number;
  lng: number;
  metros_fuera: number;
  timestamp: Timestamp | null;
  notificado: boolean;
  resuelto: boolean;
  desvio_activo_id?: string | null;
}

interface AlertaRegulacion {
  id: string;
  coche_id: string;
  linea_id: string;
  tipo: 'DISPARO_MANUAL' | 'RIVAL_PISANDO_TURNO' | 'PELIGRO_BUNCHING';
  mensaje_chofer: string;
  timestamp: Timestamp | null;
  fcmSent: boolean;
  leido: boolean;
  ack_at?: Timestamp | null;
  ack_response_time_sec?: number | null;
  creado_por?: string;
}

type Tab = 'eventos' | 'notificar' | 'historial';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeDate(ts: any): Date | null {
  if (!ts) return null;
  try {
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts instanceof Date) return ts;
    if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts);
    if (ts && (ts.seconds !== undefined || ts._seconds !== undefined)) {
      const secs = ts.seconds ?? ts._seconds;
      const nanos = ts.nanoseconds ?? ts._nanoseconds ?? 0;
      return new Date(secs * 1000 + nanos / 1_000_000);
    }
    return new Date(ts);
  } catch (e) {
    return null;
  }
}

function tsToStr(ts: any): string {
  return formatHoraSegundosMvd(ts);
}

function minutosAtras(ts: any): string {
  const d = safeDate(ts);
  if (!d || isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return 'ahora';
  if (mins === 1) return 'hace 1 min';
  if (mins < 60) return `hace ${mins} min`;
  return `hace ${Math.round(mins / 60)}h`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

const GestionDesviosPage = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('eventos');
  const [eventos, setEventos] = useState<EventoDesvio[]>([]);
  const [alertas, setAlertas] = useState<AlertaRegulacion[]>([]);
  const [loadingEventos, setLoadingEventos] = useState(true);
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);

  // Form state
  const [cocheId, setCocheId] = useState('');
  const [lineaId, setLineaId] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [tipoAlerta, setTipoAlerta] = useState<'DISPARO_MANUAL'>('DISPARO_MANUAL');

  const sentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Listener: eventos_desvio (últimas 2h, no resueltos) ────────────────────
  useEffect(() => {
    let unsub: (() => void) | null = null;
    const cutoff = Timestamp.fromMillis(Date.now() - 2 * 60 * 60 * 1_000);

    const setup = async () => {
      await authReady;
      setLoadingEventos(true);
      const q = query(
        collection(db, 'eventos_desvio'),
        where('resuelto', '==', false),
        orderBy('timestamp', 'desc'),
        limit(50),
      );
      unsub = onSnapshot(
        q,
        snap => {
          setEventos(snap.docs
            .map(d => ({ id: d.id, ...(d.data() as Omit<EventoDesvio, 'id'>) }))
            .filter(e => {
              const d = safeDate(e.timestamp);
              return !d || isNaN(d.getTime()) || d.getTime() > cutoff.toMillis();
            })
          );
          setLoadingEventos(false);
        },
        err => {
          console.error('[GestionDesvios] eventos_desvio error:', err);
          setLoadingEventos(false);
        },
      );
    };

    void setup();
    return () => { unsub?.(); };
  }, []);

  // ── Listener: alertas_regulacion (últimas 24h) ─────────────────────────────
  useEffect(() => {
    let unsub: (() => void) | null = null;
    const setup = async () => {
      await authReady;
      const q = query(
        collection(db, 'alertas_regulacion'),
        orderBy('timestamp', 'desc'),
        limit(30),
      );
      unsub = onSnapshot(
        q,
        snap => setAlertas(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AlertaRegulacion, 'id'>) }))),
        err => console.error('[GestionDesvios] alertas error:', err),
      );
    };
    void setup();
    return () => { unsub?.(); };
  }, []);

  // ── Marcar evento como resuelto ────────────────────────────────────────────
  const resolverEvento = async (eventoId: string) => {
    await updateDoc(doc(db, 'eventos_desvio', eventoId), { resuelto: true });
  };

  // ── Pre-llenar form desde un evento ───────────────────────────────────────
  const notificarDesdeEvento = (ev: EventoDesvio) => {
    setCocheId(ev.coche_id);
    setLineaId(ev.linea_id);
    setMensaje(`Coche ${ev.coche_id}: se detectó desvío de ${ev.metros_fuera}m de la ruta. Por favor, reincorporarse al trazado de la línea ${ev.linea_id}.`);
    setTab('notificar');
  };

  // ── Enviar notificación al conductor ──────────────────────────────────────
  const enviarNotificacion = async () => {
    if (!cocheId.trim() || !mensaje.trim()) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'alertas_regulacion'), {
        coche_id: cocheId.trim(),
        linea_id: lineaId.trim() || 'DESCONOCIDA',
        tipo: tipoAlerta,
        mensaje_chofer: mensaje.trim(),
        timestamp: serverTimestamp(),
        fcmSent: false,
        leido: false,
        creado_por: user?.email ?? 'despacho',
        origen: 'despacho_manual',
      });
      setSentOk(true);
      setCocheId('');
      setLineaId('');
      setMensaje('');
      if (sentTimeoutRef.current) clearTimeout(sentTimeoutRef.current);
      sentTimeoutRef.current = setTimeout(() => setSentOk(false), 3000);
    } catch (err) {
      console.error('[GestionDesvios] enviar alerta error:', err);
      alert('Error al enviar la notificación. Verificar permisos.');
    } finally {
      setSending(false);
    }
  };

  // ── KPIs de cabecera ───────────────────────────────────────────────────────
  const eventosAbiertos = eventos.filter(e => !e.resuelto).length;
  const notificadosHoy = alertas.filter(a => {
    const d = safeDate(a.timestamp);
    if (!d || isNaN(d.getTime())) return false;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return d >= hoy;
  }).length;
  const ackRate = alertas.length > 0
    ? Math.round((alertas.filter(a => a.leido).length / alertas.length) * 100)
    : 0;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in-up">

      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-slate-200 tracking-tight flex items-center gap-2">
          <Navigation className="w-6 h-6 text-amber-400" />
          Centro de Desvíos — Despacho
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Monitoreo en tiempo real · notificaciones push a conductores · gestión de trazados alternativos
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`bg-slate-900 border ${eventosAbiertos > 0 ? 'border-red-500/40' : 'border-slate-700/50'} rounded-xl p-4`}>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Desvíos activos</p>
          <p className={`text-3xl font-black ${eventosAbiertos > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {eventosAbiertos}
          </p>
          <p className="text-xs text-slate-500 mt-1">sin resolver (últ. 2h)</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Notificaciones hoy</p>
          <p className="text-3xl font-black text-blue-400">{notificadosHoy}</p>
          <p className="text-xs text-slate-500 mt-1">alertas enviadas al conductor</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Confirmación de recibo</p>
          <p className="text-3xl font-black text-emerald-400">{ackRate}%</p>
          <p className="text-xs text-slate-500 mt-1">tasa de acuse de recibo de alertas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-700/50 rounded-xl p-1 w-fit">
        {([
          { key: 'eventos', label: 'Eventos detectados', badge: eventosAbiertos },
          { key: 'notificar', label: 'Notificar conductor', badge: 0 },
          { key: 'historial', label: 'Historial', badge: 0 },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              tab === t.key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Eventos detectados ── */}
      {tab === 'eventos' && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-widest">Desvíos sin resolver (últ. 2h)</h2>
            </div>
            {loadingEventos && <RefreshCw className="w-4 h-4 text-slate-500 animate-spin" />}
          </div>

          {eventos.length === 0 && !loadingEventos ? (
            <div className="p-12 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-500/40 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Sin desvíos activos detectados en las últimas 2 horas</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-800/60">
                  <tr>
                    <th className="text-left text-slate-500 px-4 py-2.5 font-medium">Coche</th>
                    <th className="text-left text-slate-500 px-4 py-2.5 font-medium">Línea</th>
                    <th className="text-left text-slate-500 px-4 py-2.5 font-medium">Tipo</th>
                    <th className="text-right text-slate-500 px-4 py-2.5 font-medium">Metros fuera</th>
                    <th className="text-center text-slate-500 px-4 py-2.5 font-medium">Hora</th>
                    <th className="text-center text-slate-500 px-4 py-2.5 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {eventos.map(ev => (
                    <tr key={ev.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-200">{ev.coche_id}</td>
                      <td className="px-4 py-3">
                        <span className="bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded text-[10px] font-bold">{ev.linea_id}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          ev.tipo === 'FUERA_DE_RUTA'
                            ? 'bg-red-900/40 text-red-300 border-red-500/30'
                            : 'bg-amber-900/40 text-amber-300 border-amber-500/30'
                        }`}>
                          {ev.tipo === 'FUERA_DE_RUTA' ? 'Fuera de ruta' : 'Fuera de desvío oficial'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <span className={ev.metros_fuera > 100 ? 'text-red-400' : ev.metros_fuera > 50 ? 'text-amber-400' : 'text-slate-300'}>
                          {ev.metros_fuera} m
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-400">
                        <div>{tsToStr(ev.timestamp)}</div>
                        <div className="text-slate-600 text-[10px]">{minutosAtras(ev.timestamp)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => notificarDesdeEvento(ev)}
                            title="Notificar al conductor"
                            className="flex items-center gap-1 px-2 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 rounded-lg text-[10px] font-medium transition-colors"
                          >
                            <Bell className="w-3 h-3" />
                            Notificar
                          </button>
                          <button
                            onClick={() => void resolverEvento(ev.id)}
                            title="Marcar como resuelto"
                            className="flex items-center gap-1 px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 rounded-lg text-[10px] font-medium transition-colors"
                          >
                            <CheckCircle className="w-3 h-3" />
                            Resolver
                          </button>
                          <a
                            href={`https://maps.google.com/?q=${ev.lat},${ev.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver en mapa"
                            className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            <MapPin className="w-3 h-3" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Notificar conductor ── */}
      {tab === 'notificar' && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 max-w-xl">
          <div className="flex items-center gap-2 mb-5">
            <Send className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-widest">Enviar alerta al conductor</h2>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-widest block mb-1.5">Coche ID *</label>
                <input
                  type="text"
                  placeholder="ej: 1234"
                  value={cocheId}
                  onChange={e => setCocheId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-widest block mb-1.5">Línea</label>
                <input
                  type="text"
                  placeholder="ej: 300"
                  value={lineaId}
                  onChange={e => setLineaId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500 uppercase tracking-widest block mb-1.5">Mensaje al conductor *</label>
              <textarea
                rows={4}
                placeholder="Instrucción específica para el conductor..."
                value={mensaje}
                onChange={e => setMensaje(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none resize-none"
              />
              <p className="text-xs text-slate-600 mt-1">Este mensaje se mostrará en pantalla completa en el dispositivo del conductor.</p>
            </div>

            <div className="flex gap-3 items-center pt-2">
              <button
                onClick={() => void enviarNotificacion()}
                disabled={sending || !cocheId.trim() || !mensaje.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Enviando…' : 'Enviar notificación'}
              </button>
              {sentOk && (
                <div className="flex items-center gap-1.5 text-emerald-400 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  Enviada — FCM en proceso
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <p className="text-xs text-slate-500 leading-relaxed">
              <strong className="text-slate-400">Flujo de entrega:</strong> La alerta se guarda en Firestore → Cloud Function detecta el nuevo documento → busca el token FCM del conductor en <code>viajes_activos</code> → envía push notification → el dispositivo muestra un overlay de pantalla completa con su mensaje.
            </p>
          </div>
        </div>
      )}

      {/* ── Tab: Historial ── */}
      {tab === 'historial' && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-widest">Últimas 30 alertas enviadas</h2>
          </div>
          {alertas.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">Sin alertas en el registro reciente</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-800/60">
                  <tr>
                    <th className="text-left text-slate-500 px-4 py-2.5 font-medium">Coche</th>
                    <th className="text-left text-slate-500 px-4 py-2.5 font-medium">Línea</th>
                    <th className="text-left text-slate-500 px-4 py-2.5 font-medium">Tipo</th>
                    <th className="text-left text-slate-500 px-4 py-2.5 font-medium">Mensaje</th>
                    <th className="text-center text-slate-500 px-4 py-2.5 font-medium">Hora</th>
                    <th className="text-center text-slate-500 px-4 py-2.5 font-medium">FCM</th>
                    <th className="text-center text-slate-500 px-4 py-2.5 font-medium">ACK</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {alertas.map(a => (
                    <tr key={a.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-200">{a.coche_id}</td>
                      <td className="px-4 py-2.5">
                        <span className="bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-bold">{a.linea_id}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          a.tipo === 'DISPARO_MANUAL'
                            ? 'bg-blue-900/40 text-blue-300 border-blue-500/30'
                            : a.tipo === 'RIVAL_PISANDO_TURNO'
                            ? 'bg-red-900/40 text-red-300 border-red-500/30'
                            : 'bg-amber-900/40 text-amber-300 border-amber-500/30'
                        }`}>
                          {a.tipo === 'DISPARO_MANUAL' ? 'Manual' : a.tipo === 'RIVAL_PISANDO_TURNO' ? 'Rival' : 'Bunching'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 max-w-[200px] truncate" title={a.mensaje_chofer}>
                        {a.mensaje_chofer}
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-400">
                        <div>{tsToStr(a.timestamp)}</div>
                        <div className="text-slate-600 text-[10px]">{minutosAtras(a.timestamp)}</div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {a.fcmSent
                          ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mx-auto" title="FCM enviado" />
                          : <Clock className="w-3.5 h-3.5 text-slate-600 mx-auto" title="Pendiente" />}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {a.leido
                          ? (
                            <div className="flex flex-col items-center">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" title="Confirmado por conductor" />
                              {a.ack_response_time_sec != null && (
                                <span className="text-[9px] text-slate-500">{a.ack_response_time_sec}s</span>
                              )}
                            </div>
                          )
                          : <X className="w-3.5 h-3.5 text-slate-600 mx-auto" title="Sin confirmar" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GestionDesviosPage;
