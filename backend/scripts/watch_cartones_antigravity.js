/**
 * watch_cartones_antigravity.js (FASE 5.11 — 2026-05-13)
 *
 * Watcher persistente que monitorea la carpeta donde Antigravity deposita
 * cartones JSON y los carga automáticamente a Postgres vía /api/cartones/bulk.
 *
 * Es idempotente: el backend hace UPSERT, así que reprocesar el mismo
 * archivo no duplica datos. Track de archivos procesados (por mtime) para
 * eficiencia, pero la verdad última es la DB.
 *
 * Ciclo:
 *   1. cada 30s lista archivos en ucot_downloads/
 *   2. filtra los que tienen mtime > último ciclo exitoso
 *   3. parsea y manda batch a /api/cartones/bulk
 *   4. logea resultado
 *
 * Diseñado para correr como proceso PM2 (auto-restart, logs centralizados).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const DOWNLOADS_DIR = 'c:/Users/Usuario/Desktop/SkillRoute clon/ucot_downloads';
const POLL_INTERVAL_MS = 30_000; // cada 30s
const USER = '329';
const PASS = 'Skill329';

let lastCheckMs = 0;     // mtime de última procesación
let token = null;
let tokenIssuedAt = 0;
const TOKEN_TTL_MS = 7 * 60 * 60 * 1000; // 7h (el token expira a las 8h)

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function httpRequest(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, body: text }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function login() {
  const payload = JSON.stringify({ internalNumber: USER, password: PASS });
  const res = await httpRequest({
    hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  }, payload);
  if (res.status !== 200 || !res.body?.data?.token) {
    throw new Error(`Login fallo: ${JSON.stringify(res.body)}`);
  }
  token = res.body.data.token;
  tokenIssuedAt = Date.now();
  console.log(`[${ts()}] Login OK`);
}

async function ensureToken() {
  if (!token || (Date.now() - tokenIssuedAt) > TOKEN_TTL_MS) {
    await login();
  }
}

function parseCarton(raw) {
  const horarios = raw.horarios ?? [];
  let linea = null;
  let paradas = [];
  const viajes = [];
  const notas = [];
  for (const row of horarios) {
    if (!Array.isArray(row) || row.length === 0) continue;
    if (linea === null && row.length === 2 && /^\d+$/.test(String(row[0])) && /^\d+$/.test(String(row[1]))) {
      linea = String(row[0]);
      continue;
    }
    if (paradas.length === 0 && row.length >= 6) {
      const hhmm = /^\d{1,2}:\d{2}$/;
      const noHora = row.filter((c) => typeof c === 'string' && !hhmm.test(c) && !/^\d+$/.test(c)).length;
      if (noHora >= row.length * 0.7) {
        paradas = row.map((s) => String(s));
        continue;
      }
    }
    const hhmm = /^\d{1,2}:\d{2}$/;
    const horas = row.filter((c) => typeof c === 'string' && hhmm.test(c));
    if (horas.length >= 3) { viajes.push(row); continue; }
    if (row.length === 1 || row.length === 2) notas.push(row.join(' '));
  }
  return { linea, paradas, viajes, notas };
}

function fileToCartonRow(filePath, mtimeMs) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return { error: `parse fail: ${e.message}` };
  }
  if (!raw.coche || !raw.servicio) {
    return { error: 'falta coche o servicio' };
  }
  const parsed = parseCarton(raw);
  return {
    row: {
      id: `ucot_${raw.coche}_${raw.servicio}`,
      agency_id: '70',
      service_number: raw.servicio,
      line: parsed.linea ?? '?',
      vehiculo_id: raw.coche,
      conductor_id: null,
      updated_by: 'antigravity-watcher',
      data_jsonb: {
        ...raw,
        parsed: {
          linea: parsed.linea,
          paradas: parsed.paradas,
          viajes_count: parsed.viajes.length,
          viajes: parsed.viajes,
          notas: parsed.notas,
        },
        _watcher: {
          file_mtime_ms: mtimeMs,
          loaded_at: new Date().toISOString(),
        },
      },
    },
  };
}

async function bulkUpsert(cartones) {
  await ensureToken();
  const payload = JSON.stringify({ cartones });
  const res = await httpRequest({
    hostname: 'localhost', port: 3001, path: '/api/cartones/bulk', method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization': `Bearer ${token}`,
    },
  }, payload);
  if (res.status === 401 || res.status === 403) {
    // Token expirado — re-login y retry
    await login();
    return bulkUpsert(cartones);
  }
  return res.body;
}

async function pollOnce() {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    return; // carpeta aún no creada
  }
  const files = fs.readdirSync(DOWNLOADS_DIR)
    .filter((f) => f.startsWith('carton_') && f.endsWith('.json'));
  if (files.length === 0) return;

  const nuevos = [];
  let maxMtime = lastCheckMs;
  for (const f of files) {
    const fp = path.join(DOWNLOADS_DIR, f);
    const stat = fs.statSync(fp);
    const mtimeMs = stat.mtimeMs;
    if (mtimeMs > lastCheckMs) {
      nuevos.push({ file: f, fp, mtimeMs });
      if (mtimeMs > maxMtime) maxMtime = mtimeMs;
    }
  }

  if (nuevos.length === 0) return;

  console.log(`[${ts()}] Detectados ${nuevos.length} cartones nuevos/modificados`);

  const rows = [];
  const errores = [];
  for (const n of nuevos) {
    const r = fileToCartonRow(n.fp, n.mtimeMs);
    if (r.error) {
      errores.push({ file: n.file, error: r.error });
      continue;
    }
    rows.push(r.row);
  }

  if (rows.length === 0) {
    console.log(`[${ts()}] Ningún cartón válido en el lote (${errores.length} errores)`);
    return;
  }

  try {
    const result = await bulkUpsert(rows);
    console.log(`[${ts()}] Bulk upsert OK: inserted=${result.inserted ?? 0} updated=${result.updated ?? 0} errores=${result.errores ?? 0}`);
    // Solo avanzar el cursor si la carga fue exitosa
    lastCheckMs = maxMtime;
  } catch (e) {
    console.error(`[${ts()}] Bulk upsert FAIL: ${e.message}`);
    // No avanzar cursor — reintenta en próximo ciclo
  }

  if (errores.length > 0) {
    console.log(`[${ts()}] Errores de parseo (${errores.length}):`, errores.slice(0, 5));
  }
}

async function main() {
  console.log(`[${ts()}] Watcher iniciado. Monitoreando ${DOWNLOADS_DIR} cada ${POLL_INTERVAL_MS / 1000}s`);
  try { await login(); } catch (e) {
    console.error(`[${ts()}] Login inicial fallo: ${e.message}. Reintentaré en próximo ciclo.`);
  }
  // Primera pasada inmediata
  await pollOnce().catch((e) => console.error(`[${ts()}] pollOnce error:`, e.message));
  setInterval(() => {
    pollOnce().catch((e) => console.error(`[${ts()}] pollOnce error:`, e.message));
  }, POLL_INTERVAL_MS);
}

main();
