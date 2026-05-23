/**
 * backup_postgres.js (FASE 5.12 — 2026-05-13)
 *
 * Servicio PM2 que hace pg_dump comprimido de skillroute_master cada 6 horas
 * y mantiene los últimos 7 días de backups. Sobrevive crashes y reinicios.
 *
 * Backups en: c:/SkillRoute_Master/backups/
 * Naming: skillroute_master_YYYY-MM-DD_HH-mm.dump.gz
 *
 * Restauración: gunzip + pg_restore -d skillroute_master <file>
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PG_DUMP = '"C:/Program Files/PostgreSQL/15/bin/pg_dump.exe"';
const PG_PASS = 'I0SAv9zhoQDUfTPc7L+KmkAw';
const DB = 'skillroute_master';
const BACKUP_DIR = 'c:/SkillRoute_Master/backups';
const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas
const RETENTION_DAYS = 7;
// FASE 5.22 (2026-05-17): retención por CANTIDAD además de por tiempo. Con
// la DB creciendo (~2 GB/dump cada 6 h) la retención sólo por días llenó
// el disco (19 dumps = 23 GB). Se conservan los N más recientes — suficiente
// para recuperación, con tope de espacio acotado y predecible.
const MAX_BACKUPS = 4;

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`[${ts()}] Directorio de backup creado: ${BACKUP_DIR}`);
  }
}

function backupOnce() {
  ensureDir();
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace(/\..+/, '').replace('T', '_');
  const filename = `skillroute_master_${stamp}.dump`;
  const outPath = path.join(BACKUP_DIR, filename);

  console.log(`[${ts()}] Iniciando backup: ${filename}`);

  // pg_dump con formato custom (-Fc) — más rápido restaurar selectivo
  // -Z 9 = compresión nivel 9 (gzip-like en formato custom)
  const cmd = `${PG_DUMP} -h localhost -U postgres -d ${DB} -Fc -Z 9 -f "${outPath}"`;

  const child = spawn(cmd, {
    shell: true,
    env: { ...process.env, PGPASSWORD: PG_PASS },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  child.on('close', (code) => {
    if (code === 0 && fs.existsSync(outPath)) {
      const sizeBytes = fs.statSync(outPath).size;
      const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
      console.log(`[${ts()}] Backup OK: ${filename} (${sizeMb} MB)`);
      pruneOldBackups();
    } else {
      console.error(`[${ts()}] Backup FAIL (exit ${code}): ${stderr.slice(0, 500)}`);
      // Limpiar archivo parcial si quedó
      if (fs.existsSync(outPath)) {
        try { fs.unlinkSync(outPath); } catch {}
      }
    }
  });

  child.on('error', (e) => {
    console.error(`[${ts()}] Backup spawn error: ${e.message}`);
  });
}

function pruneOldBackups() {
  const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('skillroute_master_') && f.endsWith('.dump'))
    .map((f) => {
      const fp = path.join(BACKUP_DIR, f);
      return { f, fp, mtimeMs: fs.statSync(fp).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs); // más nuevo primero

  let removed = 0;
  files.forEach((item, idx) => {
    // Se borra si: supera el tope por cantidad O es más viejo que la
    // retención por tiempo. Siempre se conservan los MAX_BACKUPS recientes.
    const tooMany = idx >= MAX_BACKUPS;
    const tooOld = item.mtimeMs < cutoffMs;
    if (tooMany || tooOld) {
      try {
        fs.unlinkSync(item.fp);
        removed++;
      } catch (e) {
        console.warn(`[${ts()}] No se pudo borrar viejo: ${item.f}`);
      }
    }
  });
  if (removed > 0) {
    console.log(
      `[${ts()}] Limpieza: ${removed} backups eliminados ` +
        `(retención: máx ${MAX_BACKUPS} más recientes y ≤${RETENTION_DAYS} días)`,
    );
  }
}

console.log(`[${ts()}] Servicio de backup iniciado. Intervalo: ${INTERVAL_MS / 1000 / 60} min. Retención: ${RETENTION_DAYS} días.`);
backupOnce(); // primer backup inmediato al arrancar
setInterval(backupOnce, INTERVAL_MS);
