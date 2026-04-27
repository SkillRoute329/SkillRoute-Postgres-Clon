import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getToken, onMessage } from 'firebase/messaging';
import { getAppMessaging } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';

export const usePushNotifications = () => {
  const { user } = useAuth();
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const nativeListenersRef = useRef<boolean>(false);

  const saveToken = async (token: string) => {
    setFcmToken(token);
    if (user?.uid) {
      await setDoc(
        doc(db, 'users', user.uid),
        { fcmToken: token, fcmPlatform: Capacitor.isNativePlatform() ? 'android' : 'web', updatedAt: new Date() },
        { merge: true },
      );
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
        // El DriverAlertOverlay escucha alertas_regulacion vía onSnapshot — no necesita acción aquí
      });

    } catch (err) {
      console.error('[FCM-Native] Error configurando push:', err);
    }
  };

  // ── Web / PWA ─────────────────────────────────────────────────────────────
  const setupWeb = async (): Promise<(() => void) | null> => {
    try {
      const messaging = await getAppMessaging();
      if (!messaging) return null;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return null;

      /**
       * VAPID key del proyecto Firebase.
       * La clave es pública y OK para commitear.
       * Inyectada via VITE_FCM_VAPID_KEY en .env.production.
       * El placeholder hace que se omita silenciosamente en dev.
       */
      const VAPID_KEY = (import.meta.env?.VITE_FCM_VAPID_KEY as string | undefined)
        ?? 'BPr7S4M1fBsc8vL7dZk5Hj8Oexr_e6H_E6vM9-wRWe3eM-rY5aT1aL-_z91vX_Z3x9QpT8nU3O5O-lF9WbP7IOM';
      const VAPID_IS_PLACEHOLDER = VAPID_KEY.startsWith('BPr7S4M1fBsc8vL7dZk5Hj8Oexr_e6H');
      if (VAPID_IS_PLACEHOLDER) return null;

      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      if (token) await saveToken(token);

      const unsubscribe = onMessage(messaging, (payload) => {
        toast.success(
          `${payload.notification?.title ?? 'Notificación'}\n${payload.notification?.body ?? ''}`,
          { duration: 6000 },
        );
      });

      return unsubscribe;

    } catch (error) {
      const code = (error as { code?: string })?.code ?? '';
      if (code === 'messaging/token-subscribe-failed') {
        console.warn('[FCM-Web] Push deshabilitado: VAPID/SW no configurados.');
      } else {
        console.error('[FCM-Web] Error configurando notificaciones:', error);
      }
      return null;
    }
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
