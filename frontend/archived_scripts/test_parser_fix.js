// Simulates the FIXED parseCartonSheet logic against the real file
const XLSX = require('xlsx');

const filePath = "C:\\Users\\jonat\\Desktop\\cartones_test.xls";
const wb = XLSX.readFile(filePath);

const METADATA_KEYWORDS = /L[ÍI]NEA|U\.?C\.?O\.?T|SERVICIO|TURNO|BOLETI|HORARIO|HABILES|SABADO|FESTIVO|VERANO|INVIERNO/i;

function isValidTime(val) {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'number') return val >= 0 && val < 2.0;
  if (typeof val === 'string') return /^\d{1,2}:\d{2}/.test(val);
  return false;
}

function formatTime(val) {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'number') {
    if (val < 0 || val >= 2.0 || isNaN(val)) return '';
    const totalSeconds = Math.round(val * 86400);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
  }
  const str = String(val).trim();
  if (!str || !str.includes(':')) return '';
  const parts = str.split(':');
  const h = Math.abs(Number(parts[0]));
  const m = Math.abs(Number(parts[1]));
  if (isNaN(h) || isNaN(m)) return '';
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function parseCartonSheet(sheet, sheetName) {
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (data.length < 5) return null;

  let lineCode = 'UNKNOWN';
  let serviceNumber = sheetName.replace(/\D/g, '');

  // Scan top 15 rows for metadata
  for (let r = 0; r < Math.min(data.length, 15); r++) {
    const row = data[r];
    if (!row) continue;
    const rowStr = row.join(' ').toUpperCase();

    const lineMatch = rowStr.match(/(?:L[ÍI]NEA)\s+([A-Z0-9\-]{2,})/i);
    if (lineMatch) lineCode = lineMatch[1].trim().toUpperCase();
    if (lineCode === 'UNKNOWN' || lineCode === 'U') {
      for (const cell of row) {
        const val = String(cell).trim();
        if (/^\d{3}[A-Z]?$/.test(val)) lineCode = val;
      }
    }

    const svcMatch = rowStr.match(/(?:SERVICIO|TURNO|SCIO)\s*(?:N[º°\.]?)?\s*(\d{3,4})/i);
    if (svcMatch) serviceNumber = svcMatch[1];
  }

  // Find header row (stop names) with METADATA skip
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(data.length, 25); r++) {
    const row = data[r];
    if (!row || row.length < 2) continue;
    const rowStr = row.join(' ').toUpperCase();
    if (METADATA_KEYWORDS.test(rowStr)) continue; // SKIP metadata rows
    let potentialStops = 0;
    let timeCount = 0;
    for (const cell of row) {
      const val = String(cell).trim();
      if (!val) continue;
      if (isValidTime(cell)) timeCount++;
      else if (val.length >= 2 && /[a-zA-Z]/.test(val) && !/^\d{1,2}:\d{2}$/.test(val))
        potentialStops++;
    }
    if (potentialStops >= 3 && timeCount <= potentialStops) {
      headerRowIdx = r;
      break;
    }
  }
  if (headerRowIdx === -1) return null;

  const headerRow = data[headerRowIdx];
  const stops = headerRow.map((c, i) => {
    const s = String(c).trim();
    return s.length > 0 && /[a-zA-Z]/.test(s) ? s : `Punto ${i + 1}`;
  });

  // Scan time data
  const fullSchedule = [];
  let earliest = '23:59', latest = '';
  let maxCols = stops.length;

  for (let r = headerRowIdx + 1; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;
    const rowStr = row.join(' ');
    const hasAnyTimeCell = row.some(cell => isValidTime(cell));
    if (!hasAnyTimeCell && rowStr.length > 30 && /[a-zA-Z]{5,}/.test(rowStr)) {
      const upper = rowStr.toUpperCase();
      if (upper.includes('TOTAL DE HORAS') || upper.includes('EN CASO DE') ||
          upper.includes('OBLIGACI') || upper.includes('TURNO DE') ||
          upper.includes('EXPENDEDORA')) break;
      continue;
    }
    if (row.length > maxCols) maxCols = row.length;
    const checkpoints = [];
    let validTimeCount = 0;
    for (let c = 0; c < maxCols; c++) {
      const cell = row[c];
      const hhmm = formatTime(cell);
      if (hhmm) validTimeCount++;
      checkpoints.push(hhmm || '--:--');
    }
    if (validTimeCount < 1) continue;
    const startTime = checkpoints.find(x => x && x !== '--:--') || '';
    if (!startTime) continue;
    while (checkpoints.length < maxCols) checkpoints.push('--:--');
    fullSchedule.push({ id: `trip-${r}`, startTime, checkpoints });
    if (startTime > '03:00' && startTime < earliest) earliest = startTime;
    if (startTime > latest || (startTime < '03:00' && latest > '20:00')) latest = startTime;
  }

  if (fullSchedule.length === 0) return null;
  return { lineCode, serviceNumber, stops: stops.length, trips: fullSchedule.length, earliest, latest };
}

// Test 5 sheets
let success = 0, fail = 0;
const samples = wb.SheetNames.slice(0, 10);
samples.forEach(name => {
  const sheet = wb.Sheets[name];
  if (!/^\d/.test(name)) return;
  const result = parseCartonSheet(sheet, name);
  if (result) {
    success++;
    console.log(`✅ ${name}: Line=${result.lineCode}, Svc=${result.serviceNumber}, Stops=${result.stops}, Trips=${result.trips}, ${result.earliest}-${result.latest}`);
  } else {
    fail++;
    console.log(`❌ ${name}: FAILED TO PARSE`);
  }
});

// Now test ALL sheets
let totalSuccess = 0, totalFail = 0;
wb.SheetNames.forEach(name => {
  if (!/^\d/.test(name)) return;
  const sheet = wb.Sheets[name];
  const result = parseCartonSheet(sheet, name);
  if (result) totalSuccess++;
  else totalFail++;
});

console.log(`\n📊 TOTAL: ${totalSuccess} SUCCESS / ${totalFail} FAILED out of ${wb.SheetNames.length} sheets`);
