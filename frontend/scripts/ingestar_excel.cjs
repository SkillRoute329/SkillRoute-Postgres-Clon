/**
 * Ingesta Excel UCOT: 1 PESTAÑA = 1 CARTÓN FÍSICO = 1 DOCUMENTO en Firestore.
 * Estructura matricial real: paradas (columnas), viajes (filas de horarios), notas cabecera/pie.
 * Uso: node scripts/ingestar_excel.cjs "C:\ruta\CARTONES Hábil.xls"
 * Requiere: FIRESTORE_EMULATOR_HOST o GOOGLE_APPLICATION_CREDENTIALS.
 */
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'ucot-gestor-cloud';

function getKeyPath() {
  const cwd = process.cwd();
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(cwd, 'serviceAccountKey.json'),
    path.join(cwd, 'firebase-emulator-key.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

let db;
if (process.env.FIRESTORE_EMULATOR_HOST) {
  const admin = require('firebase-admin');
  const keyPath = path.join(process.cwd(), 'firebase-emulator-key.json');
  if (!admin.apps.length) {
    if (fs.existsSync(keyPath)) {
      admin.initializeApp({
        credential: admin.credential.cert(require(keyPath)),
        projectId: PROJECT_ID,
      });
    } else {
      admin.initializeApp({ projectId: PROJECT_ID });
    }
  }
  db = admin.firestore();
} else {
  const admin = require('firebase-admin');
  const keyPath = getKeyPath();
  if (!admin.apps.length && keyPath) {
    admin.initializeApp({
      credential: admin.credential.cert(require(keyPath)),
      projectId: PROJECT_ID,
    });
  } else if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
  db = admin.firestore();
}

function sheetToRows(sheet) {
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
  if (!range) return [];
  const rows = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[ref];
      row.push(cell && cell.v != null ? String(cell.v).trim() : '');
    }
    rows.push(row);
  }
  return rows.filter((row) => row.some((cell) => cell !== ''));
}

function findHeaderRow(rows) {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r] || [];
    const text = row.join(' ').toLowerCase();
    if (
      text.includes('parada') ||
      text.includes('llegada') ||
      text.includes('salida') ||
      /^\d{1,2}[:.]\d{2}/.test(row.find((x) => x) || '')
    )
      return r;
  }
  return 0;
}

function parseTime(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[:\s.](\d{2})$/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return s || null;
}

function normalizarLinea(s) {
  if (!s) return '';
  const t = String(s).trim().replace(/\s+/g, '');
  const m = t.match(/^(\d{3})[a-zA-Z]?$/) || t.match(/^L-?(\d+)$/i) || t.match(/^CE-?(\d+)$/i);
  if (m) return /^L/i.test(t) ? 'L' + m[1] : /^CE/i.test(t) ? 'CE' + m[1] : m[1];
  return t.slice(0, 10);
}

async function ingestCartonesHabil(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.warn('[Ingesta] Archivo no encontrado:', filePath);
    return 0;
  }
  const wb = XLSX.readFile(filePath, { cellDates: false });
  let count = 0;
  for (const sheetName of wb.SheetNames || []) {
    if (/^sheet\s*\d*$/i.test(sheetName.trim()) || sheetName.trim().toLowerCase() === 'hoja1')
      continue;
    const sheet = wb.Sheets[sheetName];
    const rows = sheetToRows(sheet);
    if (rows.length === 0) continue;

    const headerIdx = findHeaderRow(rows);
    const paradas = (rows[headerIdx] || []).map(
      (h, i) => (h && String(h).trim()) || `Col ${i + 1}`,
    );
    const notasCabecera = rows
      .slice(0, headerIdx)
      .map((row) => (row || []).filter(Boolean).join(' | '))
      .filter(Boolean);
    const dataRows = rows.slice(headerIdx + 1);
    const viajes = [];
    let notasPieStart = dataRows.length;
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] || [];
      const tiempos = row.map((c) => parseTime(c) || c || '—');
      const timeLike = tiempos.filter((t) => /^\d{1,2}:\d{2}$/.test(String(t))).length;
      if (timeLike < 2 && row.some((c) => String(c).length > 20))
        notasPieStart = Math.min(notasPieStart, i);
      viajes.push({ fila: i + 1, tiempos });
    }
    const viajesClean = viajes.slice(0, notasPieStart);
    const notasPie = viajes
      .slice(notasPieStart)
      .map((r) => r.tiempos.filter(Boolean).join(' '))
      .filter(Boolean);

    let linea =
      normalizarLinea(sheetName) ||
      (notasCabecera[0] || '').match(/línea\s*[:\s]*(\d{3}|L\d+)/i)?.[1] ||
      '';
    if (!linea) linea = normalizarLinea(String(sheetName).slice(0, 10));
    const servicio =
      String(sheetName)
        .replace(/^\d{3}[a-zA-Z]?/i, '')
        .trim() || '1';
    const id = `cf_${linea}_${servicio.replace(/\s+/g, '_')}`.slice(0, 64);

    const payload = {
      id,
      linea,
      servicio,
      paradas,
      viajes: viajesClean,
      notasCabecera,
      notasPie,
      sheetName,
      ingestedAt: new Date().toISOString(),
    };
    await db.collection('cartones_completados').doc(id).set(payload, { merge: true });
    count++;
    console.log(
      '[Ingesta] Cartón:',
      id,
      '| Paradas:',
      paradas.length,
      '| Viajes:',
      viajesClean.length,
    );
  }
  console.log('[Ingesta] Total cartones físicos:', count);
  return count;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log('Uso: node scripts/ingestar_excel.cjs <ruta_cartones_habil.xls>');
    process.exit(1);
  }
  await ingestCartonesHabil(filePath);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
