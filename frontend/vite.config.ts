/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const CACHE_BUST = Date.now();

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      // ⚡ PWA Enabled for Offline Support
      selfDestroying: false,
      manifest: {
        name: 'TransForma Facil 2.0',
        short_name: 'UCOT v2.1',
        theme_color: '#0f172a',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  server: {
    host: '0.0.0.0', // 🔓 Expose to Network (Critical for Android Testing)
    port: 5173,
    strictPort: true,
    allowedHosts: true, // Allow 192.168.x.x
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/api', // ☁️ Production Backend
        // target: 'http://127.0.0.1:5001/ucot-gestor-cloud/us-central1/api', // 🔧 Local Emulator
        // target: 'http://192.168.1.4:3000', // 💀 Legacy Local Backend
        changeOrigin: true,
        secure: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.*', 'src/**/*.spec.*', 'src/main.tsx'],
    },
    setupFiles: ['src/test/setup.ts'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'esnext',
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash]-${CACHE_BUST}.js`,
        chunkFileNames: `assets/[name]-[hash]-${CACHE_BUST}.js`,
        assetFileNames: `assets/[name]-[hash]-${CACHE_BUST}.[ext]`,
      },
    },
  },
});
