import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import readline from 'readline';
import sqlDb from '../src/config/database';

async function audit() {
  console.log('--- INICIANDO AUDITORIA DE INTEGRIDAD DE DATOS (LINEA 17) ---');
  
  // 1. Consultar BD PostgreSQL
  const dbResult = await sqlDb.raw(`
    SELECT SUM(passenger_count) as total
    FROM gtfs.stm_passenger_trends
    WHERE route_id = '17' AND month = '2026-05'
  `);
  const dbTotal = dbResult.rows[0].total;
  console.log(`[BD Interna] Total Pasajeros Linea 17 (Mayo 2026): ${dbTotal}`);

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
  console.log('[IMM Original] Sumando boletos de la Linea 17 directamente del archivo bruto...');
  
  let rawTotal = 0;
  let isHeader = true;
  let lineIdx = -1, cantIdx = -1;
  
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (isHeader) {
      const headers = line.split(',');
      lineIdx = headers.indexOf('dsc_linea');
      cantIdx = headers.indexOf('cantidad_pasajeros');
      isHeader = false;
      continue;
    }
    const cols = line.split(',');
    if (cols[lineIdx]?.trim() === '17') {
       rawTotal += parseInt(cols[cantIdx]?.trim() || '0', 10);
    }
  }

  console.log(`[IMM Original] Total Pasajeros Linea 17 (Mayo 2026): ${rawTotal}`);
  
  if (Number(dbTotal) === rawTotal) {
      console.log('✅ AUDITORIA SUPERADA: Los datos coinciden EXACTAMENTE al 100%.');
  } else {
      console.log(`❌ DISCREPANCIA DETECTADA: BD=${dbTotal} vs CSV=${rawTotal}`);
      console.log(`Diferencia: ${rawTotal - Number(dbTotal)} boletos no mapeados.`);
  }

  fs.unlinkSync(csvPath);
  fs.unlinkSync(zipDest);
  process.exit(0);
}

audit();
