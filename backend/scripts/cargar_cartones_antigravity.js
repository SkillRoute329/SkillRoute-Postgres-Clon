/**
 * cargar_cartones_antigravity.js (FASE 5.10 — 2026-05-13)
 *
 * Toma los cartones JSON que descargó Antigravity en
 * c:/Users/Usuario/Desktop/SkillRoute clon/ucot_downloads/ y los carga a
 * cartones_completados via /api/cartones/bulk.
 *
 * Idempotente: si un cartón ya existe, hace UPDATE. Si el coche está activo
 * hoy, se asocia (vehiculo_id) para que la triangulación trabaje.
 *
 * Uso:
 *   cd backend && node scripts/cargar_cartones_antigravity.js
 *
 * Re-correr cada vez que Antigravity baje nuevos cartones.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const DOWNLOADS_DIR = 'c:/Users/Usuario/Desktop/SkillRoute clon/ucot_downloads';
const API_BASE = 'http://localhost:3001';
const USER = '329';
const PASS = 'Skill329';

function post(urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, body: text }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Parsea el JSON crudo de Antigravity y extrae línea, paradas, viajes.
 * El formato no es estructurado al 100%; aplicamos heurísticas:
 *   - Línea: primer item del array horarios[1] que sea numérico (típicamente 3-4 chars)
 *   - Paradas: el array con MÁS items consecutivos que parezcan nombres
 *   - Viajes: arrays con la mayoría de items en formato HH:MM
 */
function parseCarton(raw) {
  const horarios = raw.horarios ?? [];
  let linea = null;
  let paradas = [];
  const viajes = [];
  const notas = [];

  for (const row of horarios) {
    if (!Array.isArray(row) || row.length === 0) continue;

    // Heurística 1: detectar fila de línea/servicio (array corto con dígitos)
    if (linea === null && row.length === 2 && /^\d+$/.test(String(row[0])) && /^\d+$/.test(String(row[1]))) {
      linea = String(row[0]);
      continue;
    }

    // Heurística 2: detectar paradas (array largo con mayoría de strings no-HH:MM)
    if (paradas.length === 0 && row.length >= 6) {
      const hhmm = /^\d{1,2}:\d{2}$/;
      const noHora = row.filter((c) => typeof c === 'string' && !hhmm.test(c) && !/^\d+$/.test(c)).length;
      if (noHora >= row.length * 0.7) {
        paradas = row.map((s) => String(s));
        continue;
      }
    }

    // Heurística 3: detectar viajes (array con mayoría HH:MM)
    const hhmm = /^\d{1,2}:\d{2}$/;
    const horas = row.filter((c) => typeof c === 'string' && hhmm.test(c));
    if (horas.length >= 3) {
      viajes.push(row);
      continue;
    }

    // Resto: notas
    if (row.length === 1 || row.length === 2) notas.push(row.join(' '));
  }

  return { linea, paradas, viajes, notas };
}

async function main() {
  console.log('=== Cargador de cartones Antigravity → Postgres ===');
  console.log('Source:', DOWNLOADS_DIR);

  // 1. Login
  console.log('\n1) Login...');
  const loginRes = await post('/api/auth/login', { internalNumber: USER, password: PASS });
  const token = loginRes.body?.data?.token;
  if (!token) {
    console.error('Login fallido:', loginRes);
    process.exit(1);
  }
  console.log('  Token OK (', token.slice(0, 20), '...)');

  // 2. Leer archivos
  console.log('\n2) Leyendo archivos JSON...');
  const files = fs.readdirSync(DOWNLOADS_DIR).filter((f) => f.startsWith('carton_') && f.endsWith('.json'));
  console.log(`  ${files.length} archivos encontrados`);

  const cartones = [];
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(DOWNLOADS_DIR, f)).toString('utf-8'));
    const parsed = parseCarton(raw);
    const id = `ucot_${raw.coche}_${raw.servicio}`;
    cartones.push({
      id,
      agency_id: '70',
      service_number: raw.servicio,
      line: parsed.linea ?? '?',
      vehiculo_id: raw.coche,
      conductor_id: null,
      updated_by: 'antigravity-scraper',
      data_jsonb: {
        ...raw,
        parsed: {
          linea: parsed.linea,
          paradas: parsed.paradas,
          viajes_count: parsed.viajes.length,
          viajes: parsed.viajes,
          notas: parsed.notas,
        },
      },
    });
    console.log(`  ${f}: coche=${raw.coche} servicio=${raw.servicio} línea=${parsed.linea} paradas=${parsed.paradas.length} viajes=${parsed.viajes.length}`);
  }

  // 3. Bulk upsert
  console.log('\n3) Bulk upsert via /api/cartones/bulk...');
  const bulkRes = await post('/api/cartones/bulk', { cartones }, { Authorization: `Bearer ${token}` });
  console.log('  Resultado:', JSON.stringify(bulkRes.body, null, 2));

  // 4. Verificación count
  console.log('\n4) Verificando count...');
  const countRes = await new Promise((resolve, reject) => {
    http.get({
      hostname: 'localhost', port: 3001, path: '/api/cartones/count?agency_id=70',
      headers: { Authorization: `Bearer ${token}` },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
    }).on('error', reject);
  });
  console.log('  Cartones en DB:', JSON.stringify(countRes, null, 2));

  console.log('\n✅ DONE');
}

main().catch((e) => { console.error('FAIL:', e); process.exit(1); });
