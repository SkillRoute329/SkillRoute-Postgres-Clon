/**
 * backfill_l405.cjs — Limpia los `desviacionMin = 0` falsos de COETC L405 (24h).
 *
 * Contexto: hasta el fix B1 (autoStatsCollector.ts 2026-05-04) la rama fallback
 * de `calcularCumplimiento` (sin snap-to-shape) marcaba EN_TIEMPO con `desv = 0`.
 * Es una tautología matemática: nunca medía nada real. Para L405 quedaron 96
 * eventos consecutivos con `desv = 0` exacto y `EN_TIEMPO`.
 *
 * Este script identifica esos eventos y los reescribe a:
 *   estadoCumplimiento = 'SIN_HORARIO'
 *   desviacionMin      = null
 *
 * Criterio de detección (no tocar eventos legítimos):
 *   - agencyId = '10' (COETC)
 *   - linea = '405'
 *   - timestampGPS >= now - 24h
 *   - estadoCumplimiento = 'EN_TIEMPO'
 *   - desviacionMin === 0
 *   - proximaParada NO matchea el formato de paradas reales del snap-to-shape
 *     (las del snap son nombres de stops GTFS; las del fallback son `destino`
 *     del horario STM, ej "Gral. Flores", "Cardal", etc.)
 *
 * Política conservadora: si tenemos duda, NO tocar. El cron va a ir
 * regenerando eventos limpios cada 15 min.
 *
 * Ejecución (desde la raíz del repo, requiere GOOGLE_APPLICATION_CREDENTIALS):
 *   node scripts/backfill_l405.cjs               (dry run — solo cuenta)
 *   node scripts/backfill_l405.cjs --apply       (aplica cambios)
 *
 * Para extender a más líneas/empresas, editar las constantes EMPRESA / LINEA.
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

const db = admin.firestore();
const COLLECTION = 'vehicle_events';

// Parámetros — ajustar si es necesario
const EMPRESA = '10';
const LINEA = '405';
const HOURS_BACK = 24;
const APPLY = process.argv.includes('--apply');

// Heurística: el snap-to-shape devuelve un nombre de stop GTFS. El fallback
// asigna `destino` del horario STM. Las paradas reales (snap) no se confunden
// con los `desv = 0` que queremos limpiar — esos siempre vienen del fallback.
// Para ser ultra conservadores, NO miramos `proximaParada`: cualquier evento
// con desv = 0 exacto en la rama EN_TIEMPO es por definición de la rama
// fallback (snap-to-shape devuelve desv calculado, casi nunca exactamente 0).

async function main() {
  const cutoffISO = new Date(Date.now() - HOURS_BACK * 3600 * 1000).toISOString();
  console.log(`[backfill_l405] Buscando eventos COETC L${LINEA} con desv=0 desde ${cutoffISO}`);

  let candidatos = 0;
  let actualizados = 0;
  let saltados = 0;
  let lastDoc = null;
  const PAGE_SIZE = 500;

  while (true) {
    let q = db.collection(COLLECTION)
      .where('agencyId', '==', EMPRESA)
      .where('linea', '==', LINEA)
      .where('timestampGPS', '>=', cutoffISO)
      .orderBy('timestampGPS', 'asc')
      .limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    let batch = db.batch();
    let opsInBatch = 0;

    for (const doc of snap.docs) {
      const d = doc.data();
      const isCandidate =
        d.estadoCumplimiento === 'EN_TIEMPO' &&
        d.desviacionMin === 0;

      if (!isCandidate) {
        saltados++;
        continue;
      }
      candidatos++;

      if (APPLY) {
        batch.update(doc.ref, {
          estadoCumplimiento: 'SIN_HORARIO',
          desviacionMin: null,
          backfilledAt: admin.firestore.FieldValue.serverTimestamp(),
          backfillReason: 'desv_0_fallback_tautologia_2026_05_04',
        });
        opsInBatch++;
        // Firestore límite 500 ops/batch
        if (opsInBatch >= 400) {
          await batch.commit();
          actualizados += opsInBatch;
          batch = db.batch();
          opsInBatch = 0;
        }
      }
    }

    if (APPLY && opsInBatch > 0) {
      await batch.commit();
      actualizados += opsInBatch;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  console.log(`[backfill_l405] candidatos detectados: ${candidatos}`);
  console.log(`[backfill_l405] saltados (no matchean criterio): ${saltados}`);
  if (APPLY) {
    console.log(`[backfill_l405] actualizados a SIN_HORARIO/null: ${actualizados}`);
  } else {
    console.log(`[backfill_l405] DRY RUN — pasar --apply para aplicar`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[backfill_l405] ERROR:', err);
    process.exit(1);
  });
