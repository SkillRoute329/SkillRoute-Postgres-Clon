import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import readline from 'readline';
import sqlDb from '../src/config/database';

const DATASETS = [
  {
    month: '2026-05',
    url: 'https://ckan-data.montevideo.gub.uy/dataset/1205fc5c-b1b5-4478-b43e-c7411949ff15/resource/4a0cb185-9c12-417f-8f2c-a54caf572e94/download/viajes_stm_052026.zip'
  },
  {
    month: '2026-06',
    url: 'https://ckan-data.montevideo.gub.uy/dataset/1205fc5c-b1b5-4478-b43e-c7411949ff15/resource/91ef2067-8ee1-4364-a2fa-dec4b0ef9b8a/download/viajes_stm_062026.zip'
  }
];

const TEMP_DIR = path.join(__dirname, '../../temp_stm_data');

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[ETL] Descargando ${url}...`);
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${res.statusCode})`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function processDataset(dataset: { month: string, url: string }, stopMap: Map<string, number>) {
  const zipFile = path.join(TEMP_DIR, `stm_${dataset.month}.zip`);
  
  await downloadFile(dataset.url, zipFile);
  
  console.log(`[ETL] Extrayendo ${zipFile}...`);
  try {
    execSync(`tar -xf "${zipFile}" -C "${TEMP_DIR}"`);
  } catch (err) {
    console.warn(`[ETL] Warning: falló descompresión nativa.`);
  }

  const files = fs.readdirSync(TEMP_DIR);
  const csvFile = files.find(f => f.endsWith('.csv'));
  
  if (!csvFile) {
    throw new Error(`No se encontró el archivo CSV extraído para el mes ${dataset.month}`);
  }

  const csvPath = path.join(TEMP_DIR, csvFile);
  console.log(`[ETL] Procesando CSV con Streams... (Cruzando Stop_ID con GTFS Geométrico)`);

  // (línea_sentido) -> total_pax
  const passengerCounts = new Map<string, number>();

  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let isHeader = true;
  let headers: string[] = [];
  let dscLineaIdx = -1;
  let stopIdx = -1;
  let cantIdx = -1;
  let linesProcessed = 0;
  let unmatchedStops = 0;

  for await (const line of rl) {
    if (isHeader) {
      headers = line.split(',');
      dscLineaIdx = headers.indexOf('dsc_linea');
      stopIdx = headers.indexOf('codigo_parada_origen');
      cantIdx = headers.indexOf('cantidad_pasajeros');
      if (dscLineaIdx === -1 || cantIdx === -1 || stopIdx === -1) {
         throw new Error('Formato de CSV inválido: faltan columnas esperadas');
      }
      isHeader = false;
      continue;
    }

    const columns = line.split(',');
    if (columns.length <= dscLineaIdx) continue;

    const dscLinea = columns[dscLineaIdx]?.trim();
    const stopId = columns[stopIdx]?.trim();
    const cantStr = columns[cantIdx]?.trim();

    if (dscLinea && cantStr && stopId) {
      const cant = parseInt(cantStr, 10);
      if (!isNaN(cant)) {
        // Cruce de Alta Precisión GTFS: Parada + Línea -> Sentido
        const mapKey = `${dscLinea}_${stopId}`;
        let direction = stopMap.get(mapKey);
        
        if (direction === undefined) {
            unmatchedStops++;
            direction = 0; // Default fallback for anomalies
        }

        const compositeKey = `${dscLinea}_${direction}`;
        const currentCount = passengerCounts.get(compositeKey) || 0;
        passengerCounts.set(compositeKey, currentCount + cant);
      }
    }
    
    linesProcessed++;
    if (linesProcessed % 1000000 === 0) {
      console.log(`[ETL] ${linesProcessed / 1000000} Millones de viajes procesados a nivel geográfico...`);
    }
  }

  console.log(`[ETL] Terminado mes ${dataset.month}. Líneas/Sentidos únicos: ${passengerCounts.size}. Viajes no mapeables al 100%: ${(unmatchedStops/linesProcessed * 100).toFixed(2)}%`);
  console.log(`[ETL] Inyectando datos cruzados en PostgreSQL...`);

  const rowsToInsert = [];
  for (const [key, count] of passengerCounts.entries()) {
    const [route_id, dir_str] = key.split('_');
    rowsToInsert.push({
      route_id,
      direction_id: parseInt(dir_str, 10),
      month: dataset.month,
      passenger_count: count
    });
  }

  const chunkSize = 1000;
  for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
    const chunk = rowsToInsert.slice(i, i + chunkSize);
    await sqlDb('gtfs.stm_passenger_trends')
      .insert(chunk)
      .onConflict(['route_id', 'direction_id', 'month'])
      .merge();
  }

  console.log(`[ETL] ¡Base de Datos poblada para ${dataset.month}!`);
  fs.unlinkSync(csvPath);
  fs.unlinkSync(zipFile);
}

async function run() {
  console.log('--- Iniciando Pipeline Profesional de Integración AFC -> GTFS ---');
  
  // 1. Construir el Mapa Espacial en Memoria
  console.log('[ETL] Construyendo Diccionario Geospacial GTFS (Línea+Parada -> Sentido)...');
  const stopMap = new Map<string, number>();
  
  const rows = await sqlDb.raw(`
    SELECT r.route_short_name, st.stop_id, t.direction_id
    FROM gtfs.routes r
    JOIN gtfs.trips t ON r.route_id = t.route_id
    JOIN gtfs.stop_times st ON t.trip_id = st.trip_id
    GROUP BY r.route_short_name, st.stop_id, t.direction_id
  `);
  
  for (const row of rows.rows) {
      // If a stop serves both directions, the Map will keep the last one.
      // This is acceptable as very few stops are bi-directional, and it still vastly outperforms total division.
      const key = `${row.route_short_name}_${row.stop_id}`;
      stopMap.set(key, row.direction_id);
  }
  console.log(`[ETL] Diccionario listo. ${stopMap.size} nodos cargados.`);

  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  try {
    for (const dataset of DATASETS) {
      await processDataset(dataset, stopMap);
    }
    console.log('--- PIPELINE ETL 100% AUDITABLE FINALIZADO ---');
  } catch (error) {
    console.error('Error Crítico en Pipeline:', error);
  } finally {
    process.exit(0);
  }
}

run();
