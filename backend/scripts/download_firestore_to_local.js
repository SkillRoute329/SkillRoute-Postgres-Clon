#!/usr/bin/env node
/**
 * download_firestore_to_local.js
 *
 * FASE 2.7 — Descarga colecciones de Firestore (proyecto ORIGINAL CLOUD)
 * a archivos JSON locales en este equipo del CLON SOBERANO.
 *
 * REGLA -6: este script READS el original cloud, NO escribe nada en él. Solo
 * vuelca a disco local. Ningún side-effect en el proyecto Firebase.
 *
 * Uso:
 *   node download_firestore_to_local.js \
 *       --key C:\SkillRoute_Master\agent\secrets\firebase-admin-key.json \
 *       --out C:\SkillRoute_Master\data_imports\firestore_export\2026-05-10
 *
 * El JSON de la Service Account Key se descarga manualmente desde la consola
 * Firebase del proyecto original:
 *   1. https://console.firebase.google.com → ucot-gestor-cloud
 *   2. Configuración del proyecto → Cuentas de servicio
 *   3. "Generar nueva clave privada" → guardar el JSON
 *
 * Salida:
 *   <out>/<collection>/<docId>.json  ← un archivo por documento
 *   <out>/_manifest.json             ← lista de colecciones + conteos
 *
 * Este formato lo lee directamente import_firestore_to_postgres.js (FASE 2.7.4).
 */

const fs   = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// ─── CLI args ───────────────────────────────────────────────────────────────
function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const keyPath  = arg('--key');
const outDir   = arg('--out');
const onlyArg  = arg('--only');                         // CSV opcional
const maxArg   = arg('--max-per-collection');           // tope opcional por colección
const maxPerCol = maxArg ? parseInt(maxArg, 10) : null; // null = sin tope

if (!keyPath || !outDir) {
  console.error('Uso: node download_firestore_to_local.js --key <service-account.json> --out <directorio> [--only col1,col2] [--max-per-collection N]');
  process.exit(2);
}
if (!fs.existsSync(keyPath)) {
  console.error(`[FATAL] No existe Service Account: ${keyPath}`);
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

// ─── Init Admin SDK ─────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});
const db = admin.firestore();

console.log('═══ FASE 2.7 — Descarga Firestore ORIGINAL → JSONs locales ═══');
console.log(`Proyecto: ${serviceAccount.project_id}`);
console.log(`Output:   ${outDir}`);
console.log('');

// ─── Colecciones objetivo ───────────────────────────────────────────────────
// Si el usuario pasa --only, usamos esa lista. Si no, usamos las 8 que mapea
// import_firestore_to_postgres.js + algunas extras útiles que detectamos en
// el original (boletines, ai_orders, audit_log, bus_last_pos, alertas_*).
const DEFAULT_COLLECTIONS = [
  // Núcleo operacional (mapeadas en el importador)
  'vehicles',
  'users',
  'personal',
  'turnos_dia',
  'cartones_completados',
  'cartones',                     // colección histórica vieja, por si tiene datos útiles
  'alertas_operativas',
  'vehicle_events',
  'inspecciones',
  // Extras que vimos en el dashboard del original (no mapeadas hoy, pero
  // las descargamos para preservarlas; el importador las skipea con warning).
  'boletines',
  'bulletins',
  'boletin_verano_2026',
  'ai_orders',
  'alertas_log',
  'alertas_regulacion',
  'alertas_trafico',
  'audit_log',
  'auto_stats_diarios',
  'bus_delays',
  'bus_last_pos',
];

const collectionsToFetch = onlyArg
  ? onlyArg.split(',').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_COLLECTIONS;

// ─── Helper: serializar Firestore Timestamp / GeoPoint / DocumentRef ────────
function serializeFirestoreValue(v) {
  if (v === null || v === undefined) return v;
  if (v instanceof admin.firestore.Timestamp) {
    return { __type: 'Timestamp', value: v.toDate().toISOString() };
  }
  if (v instanceof admin.firestore.GeoPoint) {
    return { __type: 'GeoPoint', latitude: v.latitude, longitude: v.longitude };
  }
  if (v && typeof v === 'object' && v._path) {
    // DocumentReference
    return { __type: 'DocumentReference', path: v.path };
  }
  if (Array.isArray(v)) return v.map(serializeFirestoreValue);
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = serializeFirestoreValue(v[k]);
    return out;
  }
  return v;
}

// ─── Descarga ───────────────────────────────────────────────────────────────
(async () => {
  const manifest = {
    project_id: serviceAccount.project_id,
    timestamp: new Date().toISOString(),
    collections: {},
  };
  const startedAt = Date.now();

  for (const colName of collectionsToFetch) {
    const colDir = path.join(outDir, colName);
    fs.mkdirSync(colDir, { recursive: true });

    const colStart = Date.now();
    process.stdout.write(`[${colName}] descargando${maxPerCol ? ` (max ${maxPerCol})` : ''}...`);
    let count = 0;
    let errors = 0;
    let lastDoc = null;
    let truncated = false;
    const PAGE = 500;

    try {
      while (true) {
        let q = db.collection(colName).orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
        if (lastDoc) q = q.startAfter(lastDoc);
        const snap = await q.get();
        if (snap.empty) break;
        for (const doc of snap.docs) {
          if (maxPerCol && count >= maxPerCol) {
            truncated = true;
            break;
          }
          try {
            const data = serializeFirestoreValue(doc.data());
            const safeId = doc.id.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
            fs.writeFileSync(path.join(colDir, `${safeId}.json`), JSON.stringify(data, null, 2), 'utf8');
            count++;
          } catch (e) {
            errors++;
            if (errors <= 3) console.error(`\n  [ERR doc ${doc.id}] ${e.message}`);
          }
        }
        if (truncated) break;
        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.size < PAGE) break;
        // Feedback cada 500 docs con conteo running, no solo punto.
        process.stdout.write(`.${count}`);
      }
      const ms = Date.now() - colStart;
      const flag = truncated ? ' [TRUNCADO]' : '';
      console.log(` ${count} docs (${errors} errores) ${ms}ms${flag}`);
      manifest.collections[colName] = { count, errors, truncated, elapsed_ms: ms };
    } catch (e) {
      console.log(` FAIL: ${e.message}`);
      manifest.collections[colName] = { count, errors: errors + 1, fatal: e.message };
    }
  }

  fs.writeFileSync(path.join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('');
  console.log(`✓ Descarga completa en ${elapsed}s`);
  console.log(`  Manifest: ${path.join(outDir, '_manifest.json')}`);
  console.log('');
  console.log('Resumen por colección:');
  for (const [col, info] of Object.entries(manifest.collections)) {
    const fatal = info.fatal ? ` (FATAL: ${info.fatal})` : '';
    console.log(`  ${col.padEnd(28)}  ${String(info.count).padStart(6)} docs  ${info.errors} errores${fatal}`);
  }
  process.exit(0);
})().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
