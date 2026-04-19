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
          const token = await getToken(messaging, {
            vapidKey: 'BPr7S4M1fBsc8vL7dZk5Hj8Oexr_e6H_E6vM9-wRWe3eM-rY5aT1aL-_z91vX_Z3x9QpT8nU3O5O-lF9WbP7IOM', // Reemplazar con clave VAPID si es necesario
          });
          
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
        console.error('[FCM] Error configurando notificaciones:', error);
      }
    };

    setupMessaging();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  return { fcmToken };
};
