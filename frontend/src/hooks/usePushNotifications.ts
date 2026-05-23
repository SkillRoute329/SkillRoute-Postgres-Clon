// TODO FASE 5: firebase/messaging (getToken, onMessage) has no REST equivalent.
// Push notification delivery requires either:
//   a) Capacitor PushNotifications (native — already wired below, no Firebase dep)
//   b) Web Push via Web Push Protocol + VAPID (replace firebase/messaging)
// Until Fase 5, web push is silently disabled; native push continues to work.

import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { apiClient } from '../clients/apiClient';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export const usePushNotifications = () => {
  const { user } = useAuth();
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const nativeListenersRef = useRef<boolean>(false);

  const saveToken = async (token: string) => {
    setFcmToken(token);
    if (user?.uid) {
      await apiClient.put('/api/db/users/' + encodeURIComponent(user.uid), {
        fcmToken: token,
        fcmPlatform: Capacitor.isNativePlatform() ? 'android' : 'web',
        updatedAt: new Date().toISOString(),
      });
    }
  };

  // ── Android / iOS nativo ──────────────────────────────────────────────────
  const setupNative = async () => {
    if (nativeListenersRef.current) return; // evitar registrar listeners dos veces

    try {
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') {
        console.warn('[FCM-Native] Permisos de notificación denegados');
        return;
      }

      await PushNotifications.register();
      nativeListenersRef.current = true;

      // Token recibido tras register()
      await PushNotifications.addListener('registration', (token) => {
        console.log('[FCM-Native] Token:', token.value.slice(0, 20) + '...');
        void saveToken(token.value);
      });

      await PushNotifications.addListener('registrationError', (err) => {
        console.error('[FCM-Native] Error de registro:', err);
      });

      // Notificación recibida con la app en foreground → mostrar toast
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        toast(
          `${notification.title ?? 'Alerta'}\n${notification.body ?? ''}`,
          {
            duration: 8000,
            style: { background: '#1e3a5f', color: '#fff', border: '1px solid #3b82f6' },
            icon: '🚌',
          },
        );
      });

      // Tap en notificación con app en background o cerrada
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = action.notification.data as Record<string, string> | undefined;
        console.log('[FCM-Native] Acción notificación:', data?.tipo ?? 'tap');
        // El DriverAlertOverlay escucha alertas_regulacion vía polling — no necesita acción aquí
      });

    } catch (err) {
      console.error('[FCM-Native] Error configurando push:', err);
    }
  };

  // ── Web / PWA — TODO FASE 5 ───────────────────────────────────────────────
  const setupWeb = async (): Promise<(() => void) | null> => {
    // TODO FASE 5: replace firebase/messaging with Web Push Protocol + VAPID
    // getToken / onMessage removed — web push silently disabled until Fase 5.
    if (!(window as any).__webPushWarnedOnce) {
      (window as any).__webPushWarnedOnce = true;
      console.info('[WebPush] Push web deshabilitado hasta Fase 5 (integración Web Push Protocol).');
    }
    return null;
  };

  // ── Efecto principal ──────────────────────────────────────────────────────
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void setupNative();
      return;
    }

    // Web: cleanup al desmontar
    let webCleanup: (() => void) | null = null;
    setupWeb().then(fn => { webCleanup = fn ?? null; }).catch(console.error);
    return () => { webCleanup?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  return { fcmToken };
};
