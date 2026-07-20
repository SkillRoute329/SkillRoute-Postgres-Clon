import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import readline from 'readline';
import sqlDb from '../src/config/database';

async function audit() {
  console.log('--- AUDITORIA FORENSE: LINEA 106 ---');
  
  // 1. Consultar BD PostgreSQL
  const dbResult = await sqlDb.raw(`
    SELECT SUM(passenger_count) as total
    FROM gtfs.stm_passenger_trends
    WHERE route_id = '106' AND month = '2026-05'
  `);
  const dbTotal = dbResult.rows[0].total || 0;
  console.log(`[BD Interna] Total Pasajeros Linea 106 (Mayo 2026): ${dbTotal}`);

  // 2. Descargar y sumar directamente del CSV original de la IMM
  const url = 'https://ckan-data.montevideo.gub.uy/dataset/1205fc5c-b1b5-4478-b43e-c7411949ff15/resource/4a0cb185-9c12-417f-8f2c-a54caf572e94/download/viajes_stm_052026.zip';
  const zipDest = path.join(__dirname, 'audit_mayo.zip');
  
  console.log('[IMM Original] Descargando CSV oficial de Mayo 2026 para validación...');
  await new Promise<void>((resolve, reject) => {
    https.get(url, (res) => {
      const file = fs.createWriteStream(zipDest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });
  });

  console.log('[IMM Original] Extrayendo...');
  execSync(`tar -xf "${zipDest}" -C "${__dirname}"`);
  
  const files = fs.readdirSync(__dirname);
  const csvFile = files.find(f => f.endsWith('.csv') && f.includes('052026'));
  if (!csvFile) throw new Error('No CSV');
  
  const csvPath = path.join(__dirname, csvFile);
  console.log('[IMM Original] Analizando boletos de Linea 106 (con y sin paradas registradas)...');
  
  let rawTotal = 0;
  let rawTotalWithStop = 0;
  let isHeader = true;
  let lineIdx = -1, cantIdx = -1, stopIdx = -1;
  
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (isHeader) {
      const headers = line.split(',');
      lineIdx = headers.indexOf('dsc_linea');
      cantIdx = headers.indexOf('cantidad_pasajeros');
      stopIdx = headers.indexOf('codigo_parada_origen');
      isHeader = false;
      continue;
    }
    const cols = line.split(',');
    const dsc = cols[lineIdx]?.trim();
    if (dsc === '106') {
       const cant = parseInt(cols[cantIdx]?.trim() || '0', 10);
       const stop = cols[stopIdx]?.trim();
       rawTotal += cant;
       if (stop && stop !== '0' && stop !== '') {
           rawTotalWithStop += cant;
       }
    }
  }

  console.log(`[IMM Original] TOTAL BRUTO VENDIDO Línea 106: ${rawTotal}`);
  console.log(`[IMM Original] TOTAL VENDIDO Línea 106 (CON PARADA GPS VÁLIDA): ${rawTotalWithStop}`);
  
  fs.unlinkSync(csvPath);
  fs.unlinkSync(zipDest);
  process.exit(0);
}

audit();
