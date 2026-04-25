/**
 * monitoring.ts — Capa de observabilidad de errores
 * ====================================================
 * Wrapper minimalista alrededor de Sentry con activación condicional.
 * Si `VITE_SENTRY_DSN` está configurada en `.env.production`, se inicializa
 * Sentry dinámicamente y los errores se envían al servicio. Si no, todo
 * cae a `console.*` y el resto de la app funciona idéntico.
 *
 * Setup en producción:
 *   1. cd frontend && npm install --save @sentry/browser
 *   2. Crear proyecto en https://sentry.io → copiar DSN
 *   3. Agregar a frontend/.env.local:
 *        VITE_SENTRY_DSN=https://...@o000000.ingest.sentry.io/000000
 *        VITE_APP_VERSION=$(git rev-parse --short HEAD)
 *   4. Rebuild: npm run build && firebase deploy --only hosting
 *
 * Uso:
 *   import { captureException, captureMessage, setUser, breadcrumb } from './services/monitoring';
 *   captureException(err, { tag: 'shadowRadar.fetch', extra: { agencyId } });
 *   captureMessage('Listero opened cartón sin inspecciones', 'warning');
 *
 * El wrapper es seguro de invocar antes del init: cualquier llamada
 * pre-init queda buffereada (hasta 50 eventos) y se flushea cuando Sentry
 * carga.
 */

type SeverityLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

interface CaptureContext {
  tag?: string;
  extra?: Record<string, unknown>;
  user?: { id?: string; email?: string; role?: string };
  level?: SeverityLevel;
}

interface BufferedEvent {
  type: 'exception' | 'message' | 'breadcrumb';
  timestamp: number;
  payload: unknown;
}

const eventBuffer: BufferedEvent[] = [];
const MAX_BUFFER = 50;

let sentryInstance: typeof import('@sentry/browser') | null = null;
let initPromise: Promise<void> | null = null;
let initialized = false;
let initFailed = false;

const dsn: string | undefined = (import.meta as ImportMeta).env?.VITE_SENTRY_DSN;
const appVersion: string =
  ((import.meta as ImportMeta).env?.VITE_APP_VERSION as string | undefined) ?? 'dev';
const environment: string =
  ((import.meta as ImportMeta).env?.MODE as string | undefined) ?? 'development';

/**
 * Inicializa Sentry de forma lazy (sólo si hay DSN configurado).
 * Se invoca automáticamente en el primer captureException si no se llamó
 * antes desde main.tsx.
 */
export async function initMonitoring(): Promise<void> {
  if (!dsn || initFailed || initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Import dinámico — el bundle no se carga si Sentry no está disponible
      const Sentry = (await import(
        /* @vite-ignore */ '@sentry/browser'
      ).catch(() => null)) as typeof import('@sentry/browser') | null;

      if (!Sentry) {
        console.warn(
          '[monitoring] @sentry/browser no instalado. Saltando init. ' +
          'Para activar: cd frontend && npm install --save @sentry/browser',
        );
        initFailed = true;
        return;
      }

      Sentry.init({
        dsn,
        environment,
        release: `skillroute@${appVersion}`,
        // Sample rate adaptable: en prod 1.0 errores, 0.1 transacciones (perf).
        // No medir en dev/staging.
        sampleRate: environment === 'production' ? 1.0 : 0.0,
        tracesSampleRate: environment === 'production' ? 0.1 : 0.0,
        // Filtros de ruido conocido
        beforeSend(event) {
          const msg = event.exception?.values?.[0]?.value ?? '';
          // Errores de network del SW + chunks, no son del usuario
          if (msg.includes('Loading chunk') || msg.includes('ChunkLoadError')) return null;
          // ResizeObserver loops no críticos
          if (msg.includes('ResizeObserver')) return null;
          return event;
        },
      });

      sentryInstance = Sentry;
      initialized = true;

      // Flush buffer pre-init
      for (const ev of eventBuffer) {
        try {
          if (ev.type === 'exception') {
            Sentry.captureException(ev.payload);
          } else if (ev.type === 'message') {
            const p = ev.payload as { msg: string; level: SeverityLevel };
            Sentry.captureMessage(p.msg, p.level);
          } else if (ev.type === 'breadcrumb') {
            Sentry.addBreadcrumb(ev.payload as Parameters<typeof Sentry.addBreadcrumb>[0]);
          }
        } catch {
          // ignorar fallos al flushear el buffer
        }
      }
      eventBuffer.length = 0;
    } catch (err) {
      console.error('[monitoring] Sentry init falló:', err);
      initFailed = true;
    }
  })();

  return initPromise;
}

function bufferEvent(ev: BufferedEvent): void {
  if (eventBuffer.length >= MAX_BUFFER) eventBuffer.shift();
  eventBuffer.push(ev);
}

/**
 * Captura una excepción con contexto opcional.
 * Si Sentry no está disponible, log a console.error.
 */
export function captureException(error: unknown, context?: CaptureContext): void {
  // Siempre log a consola — útil en dev y como fallback
  if (context?.level === 'warning') {
    console.warn('[monitoring]', context?.tag ?? '(no tag)', error, context?.extra);
  } else {
    console.error('[monitoring]', context?.tag ?? '(no tag)', error, context?.extra);
  }

  if (!dsn) return; // monitoring desactivado en dev sin DSN
  if (!initialized) {
    void initMonitoring(); // disparar init lazy
    bufferEvent({ type: 'exception', timestamp: Date.now(), payload: error });
    return;
  }
  if (!sentryInstance) return;
  try {
    sentryInstance.withScope((scope) => {
      if (context?.tag) scope.setTag('component', context.tag);
      if (context?.user) scope.setUser(context.user);
      if (context?.extra) {
        Object.entries(context.extra).forEach(([k, v]) => scope.setExtra(k, v));
      }
      if (context?.level) scope.setLevel(context.level);
      sentryInstance!.captureException(error);
    });
  } catch (e) {
    console.error('[monitoring] Error reportando a Sentry:', e);
  }
}

/**
 * Captura un mensaje (no una excepción) con nivel de severidad.
 * Útil para eventos de negocio: "Listero abrió cartón con 0 inspecciones".
 */
export function captureMessage(msg: string, level: SeverityLevel = 'info'): void {
  console[level === 'fatal' || level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log'](
    '[monitoring]', msg,
  );
  if (!dsn) return;
  if (!initialized) {
    void initMonitoring();
    bufferEvent({ type: 'message', timestamp: Date.now(), payload: { msg, level } });
    return;
  }
  if (!sentryInstance) return;
  try {
    sentryInstance.captureMessage(msg, level);
  } catch (e) {
    console.error('[monitoring] Error captureMessage:', e);
  }
}

/**
 * Asocia un usuario a la sesión Sentry (para identificar errores por
 * usuario en el dashboard). Llamar desde AuthContext post-login.
 */
export function setUser(user: { id?: string; email?: string; role?: string } | null): void {
  if (!dsn || !sentryInstance) return;
  try {
    if (user) sentryInstance.setUser({ id: user.id, email: user.email, username: user.role });
    else sentryInstance.setUser(null);
  } catch {
    /* ignore */
  }
}

/**
 * Agrega un breadcrumb (evento contextual) que se incluye en el próximo
 * error capturado. Útil para reproducir flujos: "click → fetch → render".
 */
export function breadcrumb(
  message: string,
  category: string = 'custom',
  data?: Record<string, unknown>,
): void {
  if (!dsn) return;
  if (!initialized) {
    void initMonitoring();
    bufferEvent({
      type: 'breadcrumb',
      timestamp: Date.now(),
      payload: { message, category, data, level: 'info' },
    });
    return;
  }
  if (!sentryInstance) return;
  try {
    sentryInstance.addBreadcrumb({ message, category, data, level: 'info' });
  } catch {
    /* ignore */
  }
}

/** Estado del monitoring para el SystemHealthPanel. */
export function monitoringStatus(): {
  enabled: boolean;
  initialized: boolean;
  bufferedEvents: number;
} {
  return {
    enabled: !!dsn,
    initialized,
    bufferedEvents: eventBuffer.length,
  };
}
