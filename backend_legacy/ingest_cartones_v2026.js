const admin = require('firebase-admin');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const EXCEL_PATH = path.join(
  __dirname,
  '..',
  'CARTONES Hábil verano 2026 desde 26.12.2025 (1).xls',
);

// Helpers
function excelTimeToHHMM(val) {
  if (typeof val === 'number') {
    const totalSeconds = Math.round(val * 24 * 3600);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  if (typeof val === 'string') {
    const match = val.match(/(\d{1,2})[\.:](\d{2})/);
    if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  return null;
}

async function ingest() {
  console.log('🚀 Iniciando INGESTA OFICIAL DE CARTONES...');

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetNames = workbook.SheetNames;

  let batch = db.batch();
  let count = 0;

  // Metadata constants for this specific file
  const TEMPORADA = 'VERANO_2026';
  const TIPO_DIA = 'HABIL';
  const VIGENCIA_DESDE = '2025-12-26';

  for (const rawSheetName of sheetNames) {
    const sheetName = rawSheetName.trim();
    // Accept 1001, 1019N, DM1, etc.
    if (!/^[A-Z0-9]+$/i.test(sheetName)) continue;

    const sheet = workbook.Sheets[rawSheetName];
    // Use raw: true to get numeric values for times
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });

    if (data.length < 5) continue;

    // Line detection: find a row that contains a known line code or "DM1", "CE1", etc.
    let lineCode = '';
    for (let r = 0; r < 4; r++) {
      if (!data[r]) continue;
      for (let c = 0; c < 10; c++) {
        const val = String(data[r][c]).trim();
        if (/^(300|306|316|317|328|CE1|DM1|L\d+)$/i.test(val)) {
          lineCode = val;
          break;
        }
      }
      if (lineCode) break;
    }
    if (!lineCode) lineCode = '300'; // Backup

    // Headers (Stops) are usually in R2
    const headerRow = data[2];
    if (!headerRow || headerRow.length < 2) continue;

    const stopIndices = [];
    const paradasData = [];

    headerRow.forEach((cell, idx) => {
      const s = String(cell).trim();
      if (
        s &&
        s.length >= 3 &&
        !/^(ESPERAS|TURNO|TOTAL|TIEMPO|LÍNEA|SCIO|OBSER|ES OBLIGACION|LARGADOR)/.test(
          s.toUpperCase(),
        )
      ) {
        stopIndices.push(idx);
        paradasData.push({ nombre: s, tiempos: [] });
      }
    });

    if (stopIndices.length < 2) continue;

    let rowCount = 0;
    for (let r = 3; r < data.length; r++) {
      const row = data[r];
      if (!row || row.length === 0) continue;

      // Skip rows with long text (instructional)
      if (String(row[0] || '').length > 50) continue;

      let hasTimeInThisRow = false;
      const rowTiempos = [];

      stopIndices.forEach((colIdx) => {
        const timeStr = excelTimeToHHMM(row[colIdx]);
        if (timeStr) {
          rowTiempos.push(timeStr);
          hasTimeInThisRow = true;
        } else {
          rowTiempos.push('--:--');
        }
      });

      if (hasTimeInThisRow) {
        rowTiempos.forEach((t, i) => paradasData[i].tiempos.push(t));
        rowCount++;
      }
    }

    if (rowCount > 0) {
      // Unique ID including Line, Service, Season and DayType
      const docId = `${lineCode}_${sheetName}_${TEMPORADA}_${TIPO_DIA}`.replace(/\s+/g, '');

      const docData = {
        servicio: sheetName,
        linea: lineCode,
        nombre: `Línea ${lineCode} - Serv ${sheetName}`,
        temporada: TEMPORADA,
        tipo_dia: TIPO_DIA,
        vigencia_desde: VIGENCIA_DESDE,
        paradas: paradasData,
        num_vueltas: rowCount,
        creadoEn: admin.firestore.FieldValue.serverTimestamp(),
        tags: [TEMPORADA, TIPO_DIA, lineCode],
      };

      const ref = db.collection('cartones').doc(docId);
      batch.set(ref, docData);
      count++;

      if (count % 100 === 0) {
        await batch.commit();
        console.log(`✅ ${count} cartones procesados...`);
        batch = db.batch();
      }
    }
  }

  if (count % 100 !== 0) {
    await batch.commit();
  }

  console.log(`✨ EXITO: Se ingesaron ${count} servicios oficiales.`);
  process.exit(0);
}

ingest().catch((e) => {
  console.error(e);
  process.exit(1);
});
