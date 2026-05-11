/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import https from 'node:https';
import path from 'node:path';

// FASE 4 (2026-05-11): aliases que redirigen `firebase/*` al shim del clon.
// Esto evita tocar 148 archivos del frontend que importan firebase directo —
// detrás del alias, todas las operaciones van al backend Postgres del clon
// vía `/api/db/*` y JWT propio.
//
// Cuando un archivo se migra real (FASE 4.4+) y deja de importar 'firebase/*',
// deja de pasar por estos aliases. Cuando el último archivo migra, eliminamos
// los aliases y los archivos shim — el código queda sin Firebase real.
const FIREBASE_SHIM_ALIASES = {
  'firebase/firestore': path.resolve(__dirname, 'src/config/firestoreShim.ts'),
  'firebase/firestore/lite': path.resolve(__dirname, 'src/config/firestoreShim.ts'),
  'firebase/auth': path.resolve(__dirname, 'src/config/firebaseAuthShim.ts'),
  'firebase/app': path.resolve(__dirname, 'src/config/firebaseStubsShim.ts'),
  'firebase/storage': path.resolve(__dirname, 'src/config/firebaseStubsShim.ts'),
  'firebase/messaging': path.resolve(__dirname, 'src/config/firebaseStubsShim.ts'),
  'firebase/analytics': path.resolve(__dirname, 'src/config/firebaseStubsShim.ts'),
};

const CACHE_BUST = Date.now();

// ── STM Relay Middleware Plugin ─────────────────────────────────────
// This MUST be a configureServer plugin so it runs BEFORE Vite's
// SPA fallback middleware (connect-history-api-fallback).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stmRelayPlugin(): any {
  return {
    name: 'stm-relay',
    enforce: 'pre' as const,
    configureServer(server: any) {
      console.log('[STM Relay] Plugin registered ✓');
      // Register middleware without path — manual URL matching
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/proxy-stm')) {
          return next();
        }
        // Collect incoming body
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const body = chunks.length > 0 ? Buffer.concat(chunks).toString() : '{}';
          console.log(`[STM Relay] → POST /buses/rest/stm-online  body=${body.substring(0, 120)}`);

          const postData = Buffer.from(body, 'utf8');
          const options: https.RequestOptions = {
            hostname: 'www.montevideo.gub.uy',
            port: 443,
            path: '/buses/rest/stm-online',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': postData.length,
              'Origin': 'https://www.montevideo.gub.uy',
              'Referer': 'https://www.montevideo.gub.uy/buses/',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
          };

          const proxyReq = https.request(options, (proxyRes) => {
            console.log(`[STM Relay] ← ${proxyRes.statusCode}`);
            res.writeHead(proxyRes.statusCode || 502, {
              'Content-Type': proxyRes.headers['content-type'] || 'application/json',
              'Access-Control-Allow-Origin': '*',
            });
            proxyRes.pipe(res);
          });

          proxyReq.on('error', (err: Error) => {
            console.error('[STM Relay] ✗', err.message);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          });

          proxyReq.write(postData);
          proxyReq.end();
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    stmRelayPlugin(),
    react(),
    nodePolyfills({
      globals: {
        process: true,
      },
    }),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      devOptions: { enabled: false },
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
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6 MiB — incluye data-shapes-all (~5.4 MB)
      },
    }),
  ],
  resolve: {
    alias: FIREBASE_SHIM_ALIASES,
  },
  optimizeDeps: {
    include: ['recharts'],
    // Excluir paquetes firebase: el alias arriba los redirige al shim, no
    // queremos que Vite pre-bundle el SDK real.
    exclude: ['firebase', 'firebase/firestore', 'firebase/auth', 'firebase/storage', 'firebase/app', 'firebase/messaging', 'firebase/analytics'],
  },
  server: {
    host: '127.0.0.1',
    port: 3005,
    strictPort: true,
    allowedHosts: true,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api/gtfs': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
      '/api/auth': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      '/api/health-check': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
      '/historicOtp': {
        target: 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net',
        changeOrigin: true,
        secure: true,
      },
      '/historicBunching': {
        target: 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net',
        changeOrigin: true,
        secure: true,
      },
      '/proxy-horarios': {
        target: 'https://www.montevideo.gub.uy',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy-horarios/, ''),
        headers: {
          'Origin': 'https://www.montevideo.gub.uy',
          'Referer': 'https://www.montevideo.gub.uy/app/stm/horarios/'
        }
      },
      '/api/inteligencia': {
        // Route agent intelligence calls directly to the Cloud Function
        target: 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/intelligenceApi',
        changeOrigin: true,
        secure: true,
      },
      '/api/positions': {
        // Route positions endpoints to the Cloud Function
        target: 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/intelligenceApi',
        changeOrigin: true,
        secure: true,
      },
      '/api/ucot': {
        // Route fleet intelligence endpoints to the Cloud Function
        target: 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/intelligenceApi',
        changeOrigin: true,
        secure: true,
      },
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('--- PROXY ERROR ---');
            console.warn(err);
          });
          proxy.on('proxyReq', (_proxyReq, req) => {
            if (req.method !== 'GET') {
              console.log(`[Proxy] ${req.method} ${req.url}`);
            }
          });
          proxy.on('proxyRes', (proxyRes, req) => {
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
    // Strip all console.* calls from production builds
    minify: 'esbuild',
    esbuildOptions: {
      drop: ['console', 'debugger'],
    },
    rollupOptions: {
      // No externalizamos los paquetes Capacitor: son JS puro que detectan
      // el entorno (web vs nativo) y hacen fallback gracioso. Si los marcamos
      // como external, Rollup deja `import "@capacitor/core"` literal en el
      // bundle web y el browser no resuelve bare specifiers — React no monta
      // y la app entera muere. El externalize solo aplica a plugins
      // Java/Swift en una APK Capacitor; el JS siempre va dentro del bundle.
      // (Bug detectado 2026-04-25 — toda la app caía con "Problemas de Carga".)
      output: {
        entryFileNames: `assets/[name]-[hash]-${CACHE_BUST}.js`,
        chunkFileNames: `assets/[name]-[hash]-${CACHE_BUST}.js`,
        assetFileNames: `assets/[name]-[hash]-${CACHE_BUST}.[ext]`,
        manualChunks(id: string) {
          const nid = id.replace(/\\/g, '/');

          if (nid.includes('node_modules/recharts') || nid.includes('node_modules/victory-vendor')) {
            return 'vendor-recharts';
          }
          if (nid.includes('node_modules/leaflet') || nid.includes('node_modules/react-leaflet')) {
            return 'vendor-leaflet';
          }
          if (nid.includes('node_modules/xlsx')) {
            return 'vendor-xlsx';
          }
          if (nid.includes('node_modules/jspdf') || nid.includes('node_modules/html2canvas')) {
            return 'vendor-pdf';
          }
          if (nid.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (nid.includes('node_modules/firebase')) {
            if (nid.includes('firestore')) return 'vendor-firebase-firestore';
            if (nid.includes('storage')) return 'vendor-firebase-storage';
            return 'vendor-firebase-core';
          }

          if (
            nid.includes('ucotLinesService') ||
            nid.includes('routesGeoData') ||
            nid.includes('CompetitorIntelligenceEngine')
          ) {
            return 'data-routes';
          }
          if (
            nid.includes('ucotMaster') ||
            nid.includes('ucot_master_intelligence_2026') ||
            nid.includes('ucot_master_2026')
          ) {
            return 'data-ucot-master';
          }
          if (nid.includes('shapesAllOperators')) {
            return 'data-shapes-all';
          }
          // Forzar chunk propio para evitar TDZ de Rollup cuando se bundlea
          // con EconomicProjectionsPage (lazy). Sin este pin el inicializador
          // de `v()` queda después de su primer uso y tira ReferenceError.
          if (nid.includes('config/parametros-operativos')) {
            return 'config-parametros';
          }
        },
      },
    },
  },
});
