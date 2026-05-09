/**
 * dedup_shapes.mjs — Bloque B de BRIDGE-084
 * Deduplicar shapes_cross_operator por (agencyId, linea, sentido),
 * conservando la doc con mayor cantidad de puntos en geometry.
 * Safety guard: abortar si post-limpieza count < 250 o > 400.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'ucot-gestor-cloud';
const COLLECTION = 'shapes_cross_operator';
const SAFETY_MIN = 250;
const SAFETY_MAX = 400;
const BATCH_SIZE = 400;

const app = initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);

async function main() {
  console.log('[dedup_shapes] Leyendo todos los docs de', COLLECTION, '...');
  const snap = await db.collection(COLLECTION).get();
  console.log(`[dedup_shapes] Total docs encontrados: ${snap.size}`);

  // Agrupar por (agencyId, linea, sentido)
  const groups = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    const agencyId = String(d.agencyId ?? d.empresa ?? '0').trim();
    const linea = String(d.linea ?? d.routeShortName ?? '').trim();
    const sentido = String(d.sentido ?? d.direction ?? '').trim().toUpperCase();
    if (!linea) { console.log('[skip] doc sin linea:', doc.id); continue; }
    const key = `${agencyId}|${linea}|${sentido}`;
    if (!groups.has(key)) groups.set(key, []);
    // Calcular tamaño: campo points (array {lat,lon}) o gpxPoints si existe
    const geomSize = Array.isArray(d.points) ? d.points.length
      : Array.isArray(d.gpxPoints) ? d.gpxPoints.length
      : Array.isArray(d.geometry?.coordinates) ? d.geometry.coordinates.length
      : 0;
    groups.get(key).push({ docId: doc.id, geomSize, agencyId, linea, sentido });
  }

  console.log(`[dedup_shapes] Grupos únicos (agencyId|linea|sentido): ${groups.size}`);

  if (groups.size < SAFETY_MIN || groups.size > SAFETY_MAX) {
    console.error(`[ABORT] Grupos únicos = ${groups.size} — fuera del rango [${SAFETY_MIN}, ${SAFETY_MAX}]. Operación cancelada.`);
    process.exit(1);
  }

  // Identificar los docs a eliminar (todos menos el de mayor geomSize por grupo)
  const toDelete = [];
  for (const [key, docs] of groups) {
    if (docs.length <= 1) continue; // sin duplicados
    docs.sort((a, b) => b.geomSize - a.geomSize); // mayor primero
    const [keep, ...dupes] = docs;
    console.log(`[keep] ${keep.docId} (${keep.geomSize} pts) | eliminar ${dupes.length} dupes`);
    for (const d of dupes) toDelete.push(d.docId);
  }

  console.log(`\n[dedup_shapes] Docs a eliminar: ${toDelete.length}`);
  console.log(`[dedup_shapes] Docs que quedan: ${snap.size - toDelete.length}`);

  const postCount = snap.size - toDelete.length;
  if (postCount < SAFETY_MIN || postCount > SAFETY_MAX) {
    console.error(`[ABORT] Post-limpieza count = ${postCount} — fuera del rango [${SAFETY_MIN}, ${SAFETY_MAX}]. Operación cancelada.`);
    process.exit(1);
  }

  if (toDelete.length === 0) {
    console.log('[dedup_shapes] Sin duplicados a eliminar. Operación completada sin cambios.');
    process.exit(0);
  }

  // Eliminar en batches de BATCH_SIZE
  console.log(`\n[dedup_shapes] Eliminando ${toDelete.length} docs en batches de ${BATCH_SIZE}...`);
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const chunk = toDelete.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const docId of chunk) {
      batch.delete(db.collection(COLLECTION).doc(docId));
    }
    await batch.commit();
    deleted += chunk.length;
    console.log(`[dedup_shapes] Eliminados: ${deleted}/${toDelete.length}`);
  }

  // Verificación final
  const finalSnap = await db.collection(COLLECTION).count().get();
  const finalCount = finalSnap.data().count;
  console.log(`\n[dedup_shapes] ✅ Completado. Docs restantes: ${finalCount}`);

  if (finalCount < SAFETY_MIN || finalCount > SAFETY_MAX) {
    console.error(`[WARN] Count final ${finalCount} fuera del rango esperado [${SAFETY_MIN}, ${SAFETY_MAX}].`);
  } else {
    console.log(`[dedup_shapes] ✅ Count dentro del rango de seguridad [${SAFETY_MIN}, ${SAFETY_MAX}].`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
