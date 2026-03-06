export const NotificationService = {
  // 1. Request Permission
  requestPermission: async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      console.log('This browser does not support desktop notification');
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  },

  // 2. Dispatch Notification
  notify: async (
    title: string,
    options?: NotificationOptions & { isTrafficAlert?: boolean; tag?: string },
  ) => {
    if (Notification.permission !== 'granted') {
      await NotificationService.requestPermission();
    }

    if (Notification.permission === 'granted') {
      // Customize for Traffic Alerts
      interface ExtendedOptions extends NotificationOptions {
        vibrate?: number[];
        requireInteraction?: boolean;
      }

      const finalOptions: ExtendedOptions = {
        icon: '/pwa-192x192.png',
        badge: '/masked-icon.svg',
        vibrate: options?.isTrafficAlert ? [200, 100, 200, 100, 200] : [100], // Long vibration for alerts
        requireInteraction: options?.isTrafficAlert, // Stays until clicked
        tag: options?.tag || 'general',
        ...options,
      };

      // Use Service Worker if available (for better background handling)
      if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification(title, finalOptions);
      } else {
        // Fallback to standar Notification API
        new Notification(title, finalOptions);
      }
    }
  },
};
