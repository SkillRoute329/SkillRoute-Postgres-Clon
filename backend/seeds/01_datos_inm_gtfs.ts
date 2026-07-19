import type { Knex } from "knex";
import axios from 'axios';
import AdmZip from 'adm-zip';
import csv from 'csv-parser';
import { Readable } from 'stream';
import logger from '../src/config/logger';

const GTFS_URL = 'https://api.montevideo.gub.uy/api/transportepublico/buses/gtfs/static/latest/google_transit.zip';

export async function seed(knex: Knex): Promise<void> {
  logger.info('[SEED] Iniciando Extractor Dinámico GTFS (IMM)...');
  
  try {
    // 1. Descargar GTFS Oficial
    logger.info(`[SEED] Descargando GTFS desde ${GTFS_URL}...`);
    const response = await axios.get(GTFS_URL, { responseType: 'arraybuffer', timeout: 30000 });
    const zip = new AdmZip(Buffer.from(response.data));
    
    // 2. Limpiar tablas existentes
    logger.info('[SEED] Vaciando tablas GTFS actuales...');
    await knex('gtfs_shapes').del();
    await knex('gtfs_stops').del();
    await knex('gtfs_routes').del();
    await knex('gtfs_agency').del();

    // Función helper para parsear CSV desde ZIP
    const parseCSV = async (filename: string): Promise<any[]> => {
      const entry = zip.getEntry(filename);
      if (!entry) return [];
      const results: any[] = [];
      const bufferStream = new Readable();
      bufferStream.push(entry.getData());
      bufferStream.push(null);
      
      return new Promise((resolve, reject) => {
        bufferStream.pipe(csv())
          .on('data', (data) => results.push(data))
          .on('end', () => resolve(results))
          .on('error', reject);
      });
    };

    // 3. Procesar Agencias
    logger.info('[SEED] Insertando Agencias...');
    const agencies = await parseCSV('agency.txt');
    if (agencies.length > 0) {
      await knex('gtfs_agency').insert(agencies.map(a => ({
        agency_id: a.agency_id,
        agency_name: a.agency_name,
        agency_url: a.agency_url,
        agency_timezone: a.agency_timezone
      })));
    }

    // 4. Procesar Rutas
    logger.info('[SEED] Insertando Rutas...');
    const routes = await parseCSV('routes.txt');
    if (routes.length > 0) {
      // Inserción en lotes (batch) por si son muchas
      const chunkSize = 500;
      for (let i = 0; i < routes.length; i += chunkSize) {
        const chunk = routes.slice(i, i + chunkSize).map(r => ({
          route_id: r.route_id,
          agency_id: r.agency_id,
          route_short_name: r.route_short_name,
          route_long_name: r.route_long_name,
          route_type: parseInt(r.route_type) || 3
        }));
        await knex('gtfs_routes').insert(chunk);
      }
    }

    // 5. Procesar Paradas (con PostGIS)
    logger.info('[SEED] Insertando Paradas y generando geometrías PostGIS...');
    const stops = await parseCSV('stops.txt');
    if (stops.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < stops.length; i += chunkSize) {
        const chunk = stops.slice(i, i + chunkSize);
        
        await knex.transaction(async (trx) => {
          for (const s of chunk) {
            const lon = parseFloat(s.stop_lon);
            const lat = parseFloat(s.stop_lat);
            await trx('gtfs_stops').insert({
              stop_id: s.stop_id,
              stop_name: s.stop_name,
              stop_lat: lat,
              stop_lon: lon,
              geom: knex.raw(`ST_SetSRID(ST_MakePoint(?, ?), 4326)`, [lon, lat])
            });
          }
        });
      }
    }

    logger.info(`[SEED] Exito! Cargadas ${agencies.length} agencias, ${routes.length} rutas y ${stops.length} paradas reales.`);
  } catch (error) {
    logger.error('[SEED] Error crítico poblado DB:', error);
    throw error;
  }
}
