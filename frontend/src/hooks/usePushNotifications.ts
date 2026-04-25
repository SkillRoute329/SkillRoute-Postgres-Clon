import { useEffect, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { getAppMessaging } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';

export const usePushNotifications = () => {
  const { user } = useAuth();
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupMessaging = async () => {
      try {
        const messaging = await getAppMessaging();
        if (!messaging) return;

        // Obtain permission and get token
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          /**
           * VAPID key del proyecto Firebase. La de abajo es PLACEHOLDER —
           * para activar push web reales hay que reemplazarla con la real
           * desde Firebase Console > Project Settings > Cloud Messaging >
           * Web Push certificates. Idealmente se inyecta via env variable
           * (VITE_FCM_VAPID_KEY) en lugar de hardcodearla.
           *
           * Si la key sigue siendo el placeholder, skipeamos en silencio
           * para no ensuciar la consola con `messaging/token-subscribe-failed`
           * en cada carga.
           */
          const VAPID_KEY = (import.meta.env?.VITE_FCM_VAPID_KEY as string | undefined)
            ?? 'BPr7S4M1fBsc8vL7dZk5Hj8Oexr_e6H_E6vM9-wRWe3eM-rY5aT1aL-_z91vX_Z3x9QpT8nU3O5O-lF9WbP7IOM';
          const VAPID_IS_PLACEHOLDER = VAPID_KEY.startsWith('BPr7S4M1fBsc8vL7dZk5Hj8Oexr_e6H');
          if (VAPID_IS_PLACEHOLDER) {
            // Modo dev sin push real configurado — skip silencioso.
            return;
          }
          const token = await getToken(messaging, { vapidKey: VAPID_KEY });
          
          if (token) {
            setFcmToken(token);
            // Si el usuario está logueado, guardamos su token en Firestore (ej: colección users)
            if (user?.uid) {
              await setDoc(
                doc(db, 'users', user.uid),
                { fcmToken: token, updatedAt: new Date() },
                { merge: true }
              );
            }
          }
        }

        // Listener para mensajes en foreground
        unsubscribe = onMessage(messaging, (payload) => {
          console.log('[FCM] Mensaje recibido:', payload);
          toast.success(
            `${payload.notification?.title || 'Notificación'}\n${payload.notification?.body || ''}`,
            { duration: 6000 }
          );
        });

      } catch (error) {
        const code = (error as { code?: string })?.code ?? '';
        // token-subscribe-failed = config FCM no completa. Es expectable en
        // dev/staging, no debe ensuciar la consola con error rojo.
        if (code === 'messaging/token-subscribe-failed') {
          console.warn('[FCM] Push deshabilitado: VAPID/SW no configurados.');
        } else {
          console.error('[FCM] Error configurando notificaciones:', error);
        }
      }
    };

    setupMessaging();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  return { fcmToken };
};
