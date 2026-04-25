/**
 * useNativeDriverAlerts.ts — Bridge entre DriverAlertOverlay y plugins nativos
 * =============================================================================
 * Cuando la app corre como APK Capacitor (no web), aprovechamos plugins
 * nativos para mejorar la experiencia del conductor:
 *
 *   - Haptics: vibración táctil real (más fuerte que navigator.vibrate web)
 *   - LocalNotifications: notif en bandeja del sistema (sobrevive si la app
 *     está minimizada o cerrada)
 *   - KeepAwake: mantiene la pantalla encendida mientras hay alerta activa
 *   - StatusBar: tinta roja cuando alerta crítica
 *
 * Detecta automáticamente si Capacitor.isNativePlatform() — en web sigue
 * con `navigator.vibrate()` y la lógica del overlay queda intacta.
 *
 * Uso desde DriverAlertOverlay.tsx:
 *   useNativeDriverAlerts(activeAlert, isCritical);
 */

import { useEffect, useRef } from 'react';

interface AlertData {
  alertaId: string;
  tipo: string;
  mensaje: string;
}

let _capacitorAvailable: boolean | null = null;

/**
 * Detecta si estamos en una build Capacitor con plugins nativos disponibles.
 * Cacheado para evitar repetir el check.
 */
async function detectCapacitor(): Promise<boolean> {
  if (_capacitorAvailable !== null) return _capacitorAvailable;
  try {
    // Import dinámico para no romper si Capacitor no está
    const Cap = (await import(/* @vite-ignore */ '@capacitor/core').catch(() => null)) as
      | typeof import('@capacitor/core')
      | null;
    _capacitorAvailable = !!(Cap && Cap.Capacitor && Cap.Capacitor.isNativePlatform());
  } catch {
    _capacitorAvailable = false;
  }
  return _capacitorAvailable;
}

/** Vibración táctica vía Haptics nativo (más potente que navigator.vibrate). */
async function nativeVibrate(critical: boolean): Promise<void> {
  if (!(await detectCapacitor())) return;
  try {
    const Haptics = (await import(/* @vite-ignore */ '@capacitor/haptics').catch(() => null)) as
      | typeof import('@capacitor/haptics')
      | null;
    if (!Haptics) return;
    if (critical) {
      // Patrón: tres impactos heavy con espaciado
      await Haptics.Haptics.impact({ style: Haptics.ImpactStyle.Heavy });
      setTimeout(() => Haptics.Haptics.impact({ style: Haptics.ImpactStyle.Heavy }), 200);
      setTimeout(() => Haptics.Haptics.impact({ style: Haptics.ImpactStyle.Heavy }), 500);
    } else {
      await Haptics.Haptics.impact({ style: Haptics.ImpactStyle.Medium });
    }
  } catch (err) {
    // No bloquear nunca por fallo de plugin
    console.warn('[useNativeDriverAlerts] Haptics fail:', err);
  }
}

/** Mantiene la pantalla encendida mientras la alerta está visible. */
async function keepScreenAwake(active: boolean): Promise<void> {
  if (!(await detectCapacitor())) return;
  try {
    const KA = (await import(/* @vite-ignore */ '@capacitor-community/keep-awake').catch(() => null)) as
      | { KeepAwake: { keepAwake: () => Promise<void>; allowSleep: () => Promise<void> } }
      | null;
    if (!KA) return;
    if (active) await KA.KeepAwake.keepAwake();
    else await KA.KeepAwake.allowSleep();
  } catch (err) {
    console.warn('[useNativeDriverAlerts] KeepAwake fail:', err);
  }
}

/** Tinta status bar rojo si la alerta es crítica. */
async function setStatusBarTint(critical: boolean): Promise<void> {
  if (!(await detectCapacitor())) return;
  try {
    const SB = (await import(/* @vite-ignore */ '@capacitor/status-bar').catch(() => null)) as
      | typeof import('@capacitor/status-bar')
      | null;
    if (!SB) return;
    await SB.StatusBar.setBackgroundColor({
      color: critical ? '#dc2626' : '#0f172a',
    });
    await SB.StatusBar.setStyle({
      style: SB.Style.Dark,
    });
  } catch (err) {
    console.warn('[useNativeDriverAlerts] StatusBar fail:', err);
  }
}

/** Notificación local que sobrevive minimización. */
async function fireLocalNotif(alert: AlertData): Promise<void> {
  if (!(await detectCapacitor())) return;
  try {
    const LN = (await import(/* @vite-ignore */ '@capacitor/local-notifications').catch(() => null)) as
      | typeof import('@capacitor/local-notifications')
      | null;
    if (!LN) return;
    await LN.LocalNotifications.schedule({
      notifications: [{
        id: Date.now() & 0xffff,
        title: alert.tipo === 'RIVAL_PISANDO_TURNO' ? '⚠ Rival pisando turno' : '⚠ Alerta táctica',
        body: alert.mensaje,
        sound: 'beep.wav',
        smallIcon: 'ic_stat_icon_config_sample',
        ongoing: false,
        autoCancel: true,
        attachments: undefined,
      }],
    });
  } catch (err) {
    console.warn('[useNativeDriverAlerts] LocalNotif fail:', err);
  }
}

/**
 * Hook que activa todas las features nativas mientras hay una alerta visible.
 * Pasar null cuando no hay alerta para liberar wake-lock y resetear status bar.
 */
export function useNativeDriverAlerts(alert: AlertData | null): void {
  const lastAlertId = useRef<string | null>(null);

  useEffect(() => {
    if (!alert) {
      void keepScreenAwake(false);
      void setStatusBarTint(false);
      lastAlertId.current = null;
      return;
    }
    // Sólo disparar efectos al ENTRAR a una nueva alerta
    if (lastAlertId.current === alert.alertaId) return;
    lastAlertId.current = alert.alertaId;

    const isCritical = alert.tipo === 'RIVAL_PISANDO_TURNO';
    void nativeVibrate(isCritical);
    void keepScreenAwake(true);
    void setStatusBarTint(isCritical);
    void fireLocalNotif(alert);
  }, [alert]);
}
