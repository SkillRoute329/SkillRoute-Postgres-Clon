/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const CACHE_BUST = Date.now();

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        process: true,
      },
    }),
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
    host: '127.0.0.1', // 🔓 Expose to Network (Critical for Android Testing)
    port: 5175,
    strictPort: true,
    allowedHosts: true, // Allow 192.168.x.x
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api/auth': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      '/api/health-check': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('--- PROXY ERROR ---');
            console.warn(err);
          });
          proxy.on('proxyReq', (_proxyReq, req, _res) => {
            if (req.method !== 'GET') {
              console.log(`[Proxy] ${req.method} ${req.url}`);
            }
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
              console.log(`[Proxy ERR] ${proxyRes.statusCode} ${req.url}`);
            }
          });
        },
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
