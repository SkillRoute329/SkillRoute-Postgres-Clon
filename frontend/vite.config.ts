import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// BUILD TIMESTAMP: FORCE_REFRESH_1737694665421

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Sistema UCOT TransForma',
        short_name: 'UCOT Ops',
        description: 'Sistema Integral de Operaciones UCOT',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        scope: 'https://transformafacil-20-production.up.railway.app/',
        start_url: 'https://transformafacil-20-production.up.railway.app/?source=pwa',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/universal/static'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'api-static-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 Days
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: true, // Expose to network (0.0.0.0)
    port: 5173,
    strictPort: true, // Prevent switching to 5174 if busy (breaks ngrok)
    allowedHosts: true, // Allow ngrok tunneling
    watch: {
      usePolling: true
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
