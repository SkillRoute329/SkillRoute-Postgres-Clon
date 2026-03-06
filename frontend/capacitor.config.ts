import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ucot.transforma',
  appName: 'TransForma Gestión',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorCamera: {
      permissions: ['camera', 'read', 'write'],
    },
  },
};

export default config;
