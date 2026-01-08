import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
