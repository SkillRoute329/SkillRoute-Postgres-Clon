/**
 * Sincronización UCOT x STM (Sovereign Data Sync V2000)
 */
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const admin = require('firebase-admin');

const PROJECT_ID = 'ucot-gestor-cloud';
const UCOT_LINES = ['300', '306', '316', '317', '328', 'CE1'];
const KEY_PATH = "C:\\Users\\jonat\\Desktop\\PROYECTOS\\TransformaFacil-2.0\\backend_legacy\\serviceAccountKey.json";

console.log('[Sync] UCOT_LINES:', UCOT_LINES);

if (!admin.apps.length) {
  if (fs.existsSync(KEY_PATH)) {
    admin.initializeApp({
      credential: admin.credential.cert(require(KEY_PATH)),
      projectId: PROJECT_ID,
    });
  } else {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
}
const db = admin.firestore();

async function syncCSV(filePath) {
  console.log('[Sync] Iniciando procesamiento de:', filePath);
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineCount = 0;
  let matchCount = 0;
  const variants = {};

  for await (const line of rl) {
    lineCount++;
    if (!line || line.trim() === '') continue;
    if (lineCount === 1) {
      console.log('[Sync] Header:', line);
      continue;
    }

    const parts = line.split(';');
    if (parts.length < 2) continue;

    const rawLinea = parts[1];
    const linea = rawLinea ? rawLinea.trim() : '';

    if (lineCount < 50) {
      // Log some random lines to see format
      if (lineCount % 10 === 0) console.log(`[Debug] L${lineCount}: '${linea}' (Parts: ${parts.length})`);
    }

    if (!UCOT_LINES.includes(linea)) continue;
    
    if (matchCount === 0) {
        console.log('[Sync] First match found on line', lineCount, ':', line);
    }
    matchCount++;

    const sublinea = parts[3];
    const etapa = parts[6];
    const codVar = parts[7];
    const ordinal = parts[8];
    const horaP = parts[9];

    if (!variants[codVar]) {
      variants[codVar] = { linea, sublinea, puntos: [] };
    }
    variants[codVar].puntos.push({
      o: parseInt(ordinal),
      e: etapa ? etapa.trim() : '?',
      h: horaP ? horaP.trim() : '00:00'
    });
  }

  console.log(`[Sync] Leídas ${lineCount} líneas. Encontradas ${matchCount} coincidencias UCOT. Procesando ${Object.keys(variants).length} variantes...`);

  let totalIngested = 0;
  for (const codVar in variants) {
    const data = variants[codVar];
    data.puntos.sort((a, b) => {
      const hA = (a.h || '').padStart(6, '0');
      const hB = (b.h || '').padStart(6, '0');
      if (hA !== hB) return hA.localeCompare(hB);
      return a.o - b.o;
    });

    const trips = [];
    let currentTrip = null;
    for (const p of data.puntos) {
      if (p.o === 1) {
        if (currentTrip) trips.push(currentTrip);
        currentTrip = { startTime: p.h, stops: [] };
      }
      if (currentTrip) currentTrip.stops.push({ e: p.e, h: p.h });
    }
    if (currentTrip) trips.push(currentTrip);

    if (trips.length === 0) continue;

    const payload = {
      codVariante: codVar,
      linea: data.linea,
      descripcion: data.sublinea,
      trips: trips.slice(0, 400),
      lastUpdate: new Date().toISOString()
    };

    try {
      await db.collection('official_schedules').doc(codVar).set(payload, { merge: true });
      totalIngested++;
    } catch(err) {
      console.error('[Error] Writing doc:', err.message);
    }
  }

  console.log(`[Sync] Sincronización completada. ${totalIngested} variantes almacenadas.`);
}

const csvPath = process.argv[2];
syncCSV(csvPath).catch(err => {
  console.error(err);
  process.exit(1);
});
