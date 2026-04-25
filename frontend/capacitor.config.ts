import { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config — SkillRoute Driver App
 * ============================================
 * Configuración optimizada para uso como app del conductor en bus:
 *  - Wake lock cuando llega alerta crítica
 *  - Vibración háptica vía Haptics plugin
 *  - Push notifications nativas FCM con channel de alta prioridad
 *  - Splash screen con branding SkillRoute
 *  - Background mode para mantener conexión GPS aunque la pantalla
 *    esté apagada (hidden behind keep-awake)
 */
const config: CapacitorConfig = {
  appId: 'com.ucot.transforma',
  appName: 'SkillRoute',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // En producción NO setear url externa — la app sirve los assets locales
    // del webDir. Esto permite operar offline si el GPS sigue activo.
  },
  android: {
    // Permite el navegador WebView remoto para debugging
    allowMixedContent: false,
    // Las teclas de back físicas hacen pop history en lugar de cerrar la app
    captureInput: true,
    // Tema oscuro consistente con la UI
    backgroundColor: '#0f172a',
  },
  plugins: {
    CapacitorCamera: {
      permissions: ['camera', 'read', 'write'],
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      // Canal por defecto para notifs no-críticas
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      iconColor: '#3b82f6',
      sound: 'beep.wav',
    },
    // KeepAwake plugin no-config-needed; se usa via API en el código
    // Haptics no-config-needed; se invoca via Haptics.vibrate() / impact()
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a',
      overlaysWebView: false,
    },
  },
};

export default config;
