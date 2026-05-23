/**
 * ecosystem.config.cjs — PM2 process manager para SkillRoute (FASE 5.8)
 *
 * Mantiene los 3 servicios del clon (backend, frontend, bridge) corriendo
 * 24/7 con auto-restart en caso de crash. Sobrevive logout, reinicio de
 * Windows y crashes individuales.
 *
 * Uso:
 *   pm2 start ecosystem.config.cjs        # arranca los 3 servicios
 *   pm2 status                            # ver estado
 *   pm2 logs                              # ver logs en vivo
 *   pm2 restart skillroute-backend        # reiniciar uno solo
 *   pm2 stop all                          # detener todo
 *   pm2 save                              # persistir lista de procesos
 *   pm2-startup install                   # arranque automático con Windows
 */

const REPO = 'c:/SkillRoute_Master/repo';
const LOGS = 'c:/SkillRoute_Master/logs';

module.exports = {
  apps: [
    {
      name: 'skillroute-backend',
      cwd: `${REPO}/backend`,
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'watch src/index.ts',
      interpreter: 'node',
      autorestart: true,
      watch: false, // tsx ya watchea
      max_restarts: 100,
      min_uptime: '20s',
      restart_delay: 5000,
      max_memory_restart: '2G',
      env: { NODE_ENV: 'development' },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: `${LOGS}/backend-out.log`,
      error_file: `${LOGS}/backend-err.log`,
      time: true,
    },
    {
      // FASE 5.13 (2026-05-13): apuntar a backend/src/bridge-server.ts en lugar
      // de src/services/intelligence/bridge-server.js (versión limitada que NO
      // tenía /api/positions, /api/ucot/*, etc.). El de backend/src/ es el
      // bridge completo con todas las rutas que el frontend consume.
      name: 'skillroute-bridge',
      cwd: `${REPO}/backend`,
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'src/bridge-server.ts',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 100,
      min_uptime: '20s',
      restart_delay: 5000,
      max_memory_restart: '1G',
      env: { NODE_ENV: 'development', BRIDGE_PORT: '3099' },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: `${LOGS}/bridge-out.log`,
      error_file: `${LOGS}/bridge-err.log`,
      time: true,
    },
    {
      name: 'skillroute-frontend',
      cwd: `${REPO}/frontend`,
      script: 'node_modules/vite/bin/vite.js',
      args: '--host 127.0.0.1 --port 3006',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 100,
      min_uptime: '20s',
      restart_delay: 5000,
      max_memory_restart: '2G',
      env: { NODE_ENV: 'development' },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: `${LOGS}/frontend-out.log`,
      error_file: `${LOGS}/frontend-err.log`,
      time: true,
    },
    {
      // FASE 5.11 (2026-05-13): watcher de cartones de Antigravity. Cada 30s
      // detecta JSONs nuevos en ucot_downloads/ y hace bulk-upsert al backend.
      name: 'skillroute-cartones-watcher',
      cwd: `${REPO}/backend`,
      script: 'scripts/watch_cartones_antigravity.js',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 100,
      min_uptime: '20s',
      restart_delay: 10000,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'development' },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: `${LOGS}/cartones-watcher-out.log`,
      error_file: `${LOGS}/cartones-watcher-err.log`,
      time: true,
    },
    {
      // FASE 5.12 (2026-05-13): backup automático Postgres cada 6h.
      // Mantiene los últimos 7 días en c:/SkillRoute_Master/backups/.
      name: 'skillroute-backup',
      cwd: `${REPO}/backend`,
      script: 'scripts/backup_postgres.js',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 100,
      min_uptime: '30s',
      restart_delay: 30000,
      max_memory_restart: '200M',
      env: { NODE_ENV: 'development' },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: `${LOGS}/backup-out.log`,
      error_file: `${LOGS}/backup-err.log`,
      time: true,
    },
  ],
};
