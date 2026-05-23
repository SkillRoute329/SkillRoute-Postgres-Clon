/**
 * DriverAlertOverlay.tsx — Modal de alerta táctica para conductor
 * =================================================================
 * Pieza final del loop operacional FCM (Swiftly/Optibus-style):
 *   1. Cron backend o radar frontend escribe alerta en alertas_regulacion.
 *   2. Cloud Function `onAlertaCreated` envía push FCM al fcm_token del chofer.
 *   3. Service Worker o foreground listener (este componente) recibe la push.
 *   4. Si la alerta es de regulación (no de info), muestra OVERLAY pantalla
 *      completa con mensaje + botón RECIBIDO grande + auto-dismiss 30s.
 *   5. Click RECIBIDO → POST /acknowledgeAlerta → marca ack_at +
 *      ack_response_time_sec + ack_by_coche_id en Firestore.
 *
 * Diseño: pensado para uso en pantalla del chofer mientras maneja. UI con
 * contraste alto, tipografía grande, vibración háptica al abrir, un solo
 * botón de acción primaria. Lo opuesto a un dashboard.
 *
 * Se monta dentro de DashboardLayout → activo en TODAS las páginas del
 * conductor (BusNavigation, DriverNavigation, DriverServiceView).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { onMessage, type MessagePayload } from '../config/firebaseStubsShim';
import { getAppMessaging } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, CheckCircle2, X, Vibrate, AlertTriangle } from 'lucide-react';
import { useNativeDriverAlerts } from '../hooks/useNativeDriverAlerts';
import { on as socketOn } from '../clients/socketClient';

interface PendingAlert {
  alertaId: string;
  tipo: string;
  mensaje: string;
  cocheId: string;
  lineaId: string;
  rivalEmpresa: string;
  rivalLinea: string;
  distanciaMetros: number;
  receivedAt: number;
  // Campos para incidencias
  isIncidencia?: boolean;
  incidenciaId?: string;
  prioridad?: string;
  route?: string;
}

const ACK_ENDPOINT = '/acknowledgeAlerta';
const AUTO_DISMISS_MS = 30 * 1000;
const TIPOS_REGULACION = new Set(['RIVAL_PISANDO_TURNO', 'PELIGRO_BUNCHING', 'DISPARO_MANUAL']);
const TIPOS_INCIDENCIA = new Set(['INCIDENCIA', 'incidencia']);

export const DriverAlertOverlay = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState<PendingAlert | null>(null);
  const [acking, setAcking] = useState(false);
  const [autoDismissIn, setAutoDismissIn] = useState<number>(AUTO_DISMISS_MS / 1000);
  const dismissTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bridge a plugins nativos (Haptics, KeepAwake, StatusBar, LocalNotif)
  // — sólo se activan si la app corre como Capacitor APK; en web es no-op.
  useNativeDriverAlerts(active);

  // ── Suscripción al canal FCM foreground ────────────────────────────────────
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const messaging = await getAppMessaging();
        if (!messaging || cancelled) return;

        unsubscribe = onMessage(messaging, (payload: MessagePayload) => {
          const data = payload.data ?? {};
          const tipo = String(data.tipo ?? '');
          const esRegulacion = TIPOS_REGULACION.has(tipo);
          const esIncidencia = TIPOS_INCIDENCIA.has(tipo);

          if (!esRegulacion && !esIncidencia) {
            // No es alerta táctica ni incidencia — toast normal lo maneja
            return;
          }

          const alerta: PendingAlert = {
            alertaId: String(data.alertaId ?? data.incidenciaId ?? ''),
            tipo,
            mensaje: String(payload.notification?.body ?? data.mensaje_chofer ?? data.descripcion ?? ''),
            cocheId: String(data.coche_id ?? ''),
            lineaId: String(data.linea_id ?? data.lineaCodigo ?? ''),
            rivalEmpresa: String(data.rival_empresa ?? ''),
            rivalLinea: String(data.rival_linea ?? ''),
            distanciaMetros: Number(data.distancia_metros ?? 0),
            receivedAt: Date.now(),
            isIncidencia: esIncidencia,
            incidenciaId: String(data.incidenciaId ?? ''),
            prioridad: String(data.priority ?? data.prioridad ?? 'MEDIA').toUpperCase(),
            route: String(data.route ?? ''),
          };

          setActive(alerta);
          setAutoDismissIn(AUTO_DISMISS_MS / 1000);

          // Vibración háptica cuando llega la alerta — funciona en mobile
          // browsers y en Capacitor sin requerir el plugin oficial Haptics
          // (que no está instalado todavía).
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate([200, 100, 200, 100, 400]);
            } catch {
              /* navegadores que rechazan vibrate sin gesture user — ignorar */
            }
          }
        });
      } catch (err) {
        console.warn('[DriverAlertOverlay] No se pudo suscribir a FCM foreground:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (dismissTimerRef.current) clearInterval(dismissTimerRef.current);
    };
  }, []);

  // FASE 5.36 (2026-05-22): suscripción al bus socket del cascade engine.
  // Cuando el motor genera un evento crítico con línea identificada, el
  // bus emite `bus:driver:linea-critica`. Si el usuario es conductor,
  // levantamos el modal pantalla completa (mismo flujo que FCM).
  useEffect(() => {
    const role = String(user?.role ?? '').toLowerCase();
    const isDriver = role === 'driver' || role === 'chofer' || role === 'user' || role === 'conductor';
    if (!isDriver) return;
    const off = socketOn<{ lineaId: string; agencyId?: string; tipo: string; causa: string; feedId?: number | null }>(
      'bus:driver:linea-critica',
      (data) => {
        const tipo = String(data.tipo ?? 'CASCADA');
        // Solo abrimos modal si NO hay otra alerta activa (no spammeamos al chofer).
        setActive((prev) => {
          if (prev) return prev;
          setAutoDismissIn(AUTO_DISMISS_MS / 1000);
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate([200, 100, 200, 100, 400]); } catch { /* */ }
          }
          return {
            alertaId: data.feedId != null ? `cascade-${data.feedId}` : `cascade-${Date.now()}`,
            tipo,
            mensaje: String(data.causa ?? tipo).slice(0, 200),
            cocheId: '',
            lineaId: String(data.lineaId ?? ''),
            rivalEmpresa: '',
            rivalLinea: '',
            distanciaMetros: 0,
            receivedAt: Date.now(),
          };
        });
      },
    );
    return off;
  }, [user?.role]);

  // ── Countdown de auto-dismiss ──────────────────────────────────────────────
  useEffect(() => {
    if (!active) {
      if (dismissTimerRef.current) {
        clearInterval(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      return;
    }
    dismissTimerRef.current = setInterval(() => {
      setAutoDismissIn((s) => {
        if (s <= 1) {
          setActive(null);
          if (dismissTimerRef.current) clearInterval(dismissTimerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (dismissTimerRef.current) clearInterval(dismissTimerRef.current);
    };
  }, [active]);

  // ── Acknowledge handler ────────────────────────────────────────────────────
  const handleAck = useCallback(async () => {
    if (!active || acking) return;
    setAcking(true);
    try {
      const res = await fetch(ACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertaId: active.alertaId,
          cocheId: active.cocheId || (user as { coche_id?: string } | null)?.coche_id || undefined,
        }),
      });
      if (!res.ok) {
        console.warn('[DriverAlertOverlay] ACK falló:', res.status, await res.text().catch(() => ''));
      }
    } catch (err) {
      console.warn('[DriverAlertOverlay] Network error en ACK:', err);
    } finally {
      setAcking(false);
      setActive(null);
    }
  }, [active, acking, user]);

  if (!active) return null;

  const isCritical = active.tipo === 'RIVAL_PISANDO_TURNO'
    || (active.isIncidencia && (active.prioridad === 'CRITICA' || active.prioridad === 'ALTA'));
  const isAltaPrioridad = active.isIncidencia && active.prioridad === 'ALTA';

  const bgGradient = isCritical && active.prioridad === 'CRITICA'
    ? 'from-red-800 via-red-700 to-red-900'
    : isCritical || isAltaPrioridad
    ? 'from-red-700 via-red-600 to-red-800'
    : 'from-amber-700 via-amber-600 to-amber-800';

  const tituloHeader = active.isIncidencia
    ? active.prioridad === 'CRITICA' ? 'INCIDENCIA CRÍTICA'
      : active.prioridad === 'ALTA' ? 'INCIDENCIA ALTA'
      : 'INCIDENCIA REPORTADA'
    : active.tipo === 'RIVAL_PISANDO_TURNO' ? 'RIVAL TE PISA'
    : active.tipo === 'PELIGRO_BUNCHING' ? 'RIVAL CERCA'
    : 'DISPARO TÁCTICO';

  const subtituloHeader = active.isIncidencia
    ? `Incidencia en Línea ${active.lineaId || '—'}`
    : 'Alerta de Regulación';

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className={`w-full max-w-md bg-gradient-to-br ${bgGradient} rounded-3xl shadow-2xl border-4 border-white/20 p-6 text-white animate-in zoom-in-95 duration-300`}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-2xl animate-pulse">
              {active.isIncidencia
                ? <AlertTriangle className="w-8 h-8" />
                : <ShieldAlert className="w-8 h-8" />
              }
            </div>
            <div>
              <div className="text-[10px] font-black tracking-widest uppercase opacity-80">
                {subtituloHeader}
              </div>
              <div className="text-xl font-black mt-0.5">{tituloHeader}</div>
            </div>
          </div>
          <button
            onClick={() => setActive(null)}
            className="p-2 rounded-full hover:bg-white/20 transition-colors"
            aria-label="Cerrar sin reconocer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensaje principal — tipografía GRANDE para leer manejando */}
        <div className="bg-black/30 rounded-2xl p-5 mb-5">
          <p className="text-2xl font-bold leading-tight">{active.mensaje}</p>
          {!active.isIncidencia && active.distanciaMetros > 0 && (
            <div className="mt-3 flex items-center justify-between text-sm opacity-90 font-mono">
              <span>{active.rivalEmpresa} L{active.rivalLinea}</span>
              <span className="font-black text-xl">{active.distanciaMetros} m</span>
            </div>
          )}
          {active.isIncidencia && active.prioridad && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-sm font-bold">
              <span>Prioridad: {active.prioridad}</span>
            </div>
          )}
        </div>

        {/* CTAs */}
        <div className={`flex gap-3 ${active.isIncidencia ? 'flex-col' : ''}`}>
          {/* Botón VER INCIDENCIA — solo para incidencias */}
          {active.isIncidencia && active.route && (
            <button
              onClick={() => {
                navigate(active.route!);
                setActive(null);
              }}
              className="w-full bg-white/20 hover:bg-white/30 border-2 border-white/40 rounded-2xl py-3 text-lg font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
            >
              <AlertTriangle className="w-5 h-5" />
              VER INCIDENCIA
            </button>
          )}

          {/* Botón RECIBIDO — CTA principal, full-width, gigante */}
          <button
            onClick={handleAck}
            disabled={acking}
            className="w-full bg-white text-slate-900 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-60 rounded-2xl py-5 text-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg transition-all"
          >
            {acking ? (
              <>
                <div className="w-6 h-6 border-3 border-slate-900 border-t-transparent rounded-full animate-spin" />
                ENVIANDO…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-7 h-7" />
                RECIBIDO
              </>
            )}
          </button>
        </div>

        {/* Auto-dismiss countdown */}
        <div className="mt-4 flex items-center justify-center gap-2 text-xs opacity-70">
          <Vibrate className="w-3 h-3 animate-pulse" />
          <span>Se cierra automáticamente en {autoDismissIn}s</span>
        </div>
      </div>
    </div>
  );
};

export default DriverAlertOverlay;
