/**
 * Convierte R-21.01.2026.xls y Boletín verano 2026 a JSON para seed Firestore.
 * Ejecutar desde functions/ con: node generate_data_jsons.js
 */
const xlsx = require('./node_modules/xlsx');
const fs = require('fs');
const path = require('path');

const DOC_DIR = 'C:\\Users\\jonat\\Desktop\\doc Ucot';
const OUT_DIR = path.join(__dirname, 'src', 'data');

fs.mkdirSync(OUT_DIR, { recursive: true });

// Convierte fracción decimal Excel → "HH:MM"
function excelTimeToHHMM(fraction) {
  if (typeof fraction !== 'number' || isNaN(fraction)) return '';
  const totalMinutes = Math.round(fraction * 24 * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── 1. ROTACIÓN DIARIA R-21.01.2026.xls ───────────────────────────────────
console.log('\n📅 Procesando R-21.01.2026.xls...');

const rotFiles = fs.readdirSync(DOC_DIR).filter(f => f.match(/^R-\d+\.\d+\.\d+\.xls$/i));
console.log('Archivos de rotación encontrados:', rotFiles);

const rotacion = {};

for (const rotFile of rotFiles) {
  // Extract date from filename: R-21.01.2026.xls → 2026-01-21
  const match = rotFile.match(/R-(\d+)\.(\d+)\.(\d+)\.xls/i);
  if (!match) continue;
  const dateStr = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;

  const wb = xlsx.readFile(path.join(DOC_DIR, rotFile));
  const ws = wb.Sheets['Coches y Servicios'] || wb.Sheets[wb.SheetNames[1]] || wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const servicios = [];

  // Header row at index 2, data from row 3
  // Sheet has 4 column groups, but cols 0-9 = coches sorted by coche,
  // cols 11-19 = same data sorted by servicio (duplicates). Use LEFT half only.
  const GROUP_OFFSETS = [0, 5];

  for (const row of rows.slice(3)) {
    for (const offset of GROUP_OFFSETS) {
      const coche = row[offset];
      const servicio = row[offset + 1];
      const hora = row[offset + 2];
      const linea = row[offset + 3];

      if (typeof coche === 'number' && typeof servicio === 'number') {
        servicios.push({
          coche: String(coche),
          servicio: String(servicio),
          horaSalida: excelTimeToHHMM(hora),
          linea: String(linea || ''),
        });
      }
    }
  }

  // Sort by coche number
  servicios.sort((a, b) => parseInt(a.coche) - parseInt(b.coche));

  rotacion[dateStr] = {
    fecha: dateStr,
    archivo: rotFile,
    totalCoches: servicios.length,
    coches: servicios,
  };

  console.log(`  ✅ ${dateStr}: ${servicios.length} coches parseados`);
}

const rotacionOut = path.join(OUT_DIR, 'ucot_rotacion.json');
fs.writeFileSync(rotacionOut, JSON.stringify(rotacion, null, 2));
console.log(`✅ Rotación guardada en ${rotacionOut}`);

// ─── 2. BOLETÍN VERANO 2026 ────────────────────────────────────────────────
console.log('\n📋 Procesando Boletín Hábil verano 2026...');

const boletinFiles = fs.readdirSync(DOC_DIR).filter(f =>
  f.toLowerCase().includes('boletin') && f.toLowerCase().includes('verano')
);
console.log('Archivos boletín verano:', boletinFiles);

if (boletinFiles.length === 0) {
  console.error('❌ No se encontró el archivo del boletín verano');
  process.exit(1);
}

const boletinVerano = {};
const wb2 = xlsx.readFile(path.join(DOC_DIR, boletinFiles[0]));

for (const sheetName of wb2.SheetNames) {
  const ws = wb2.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (rows.length < 2) continue;

  // Row 0: "Matriz Inspección" (title)
  // Row 1: header ["Servicio", "", "stop1", "stop2", ...]
  // Row 2+: [servicioNum, "", time1, time2, ...]

  const headerRow = rows[1] || [];
  // Stop names start at column 2
  const paradas = headerRow.slice(2).filter(s => typeof s === 'string' && s.trim() !== '' && s !== '----');

  const pases = []; // Each element = one pass of a service through the stops

  for (const row of rows.slice(2)) {
    const servicio = row[0];
    if (typeof servicio !== 'number') continue;

    const horarios = {};
    for (let i = 0; i < paradas.length; i++) {
      const val = row[i + 2];
      const parada = paradas[i];
      if (parada && typeof val === 'number' && !isNaN(val)) {
        horarios[parada] = excelTimeToHHMM(val);
      } else if (parada && typeof val === 'string' && val.trim() !== '' && val !== '----') {
        horarios[parada] = val.trim(); // e.g. "Intercambiador", "C.Tab."
      }
    }

    pases.push({
      servicio: String(servicio),
      horarios,
    });
  }

  // Parse line and direction from sheet name (e.g. "300a" → linea:"300", dir:"a")
  const lineMatch = sheetName.match(/^(.+?)([ab])$/i);
  const linea = lineMatch ? lineMatch[1] : sheetName;
  const direccion = lineMatch ? lineMatch[2].toLowerCase() : 'a';

  boletinVerano[sheetName] = {
    linea,
    direccion,
    paradas,
    pases,
    totalPases: pases.length,
  };

  console.log(`  ✅ ${sheetName}: ${paradas.length} paradas, ${pases.length} pases`);
}

const boletinOut = path.join(OUT_DIR, 'ucot_boletin_verano.json');
fs.writeFileSync(boletinOut, JSON.stringify(boletinVerano, null, 2));
console.log(`✅ Boletín verano guardado en ${boletinOut}`);

// ─── 3. Resumen ────────────────────────────────────────────────────────────
console.log('\n📊 Resumen:');
console.log('  Rotaciones:', Object.keys(rotacion).length, 'días');
Object.entries(rotacion).forEach(([d, r]) => console.log(`    ${d}: ${r.totalCoches} coches`));
console.log('  Boletín verano:', Object.keys(boletinVerano).length, 'líneas-dirección');
const totalPases = Object.values(boletinVerano).reduce((s, b) => s + b.totalPases, 0);
console.log('  Total pases de inspección:', totalPases);
