import axios, { AxiosError } from 'axios';
import { z } from 'zod';
import { getImmToken } from '../services/immEtaService';
import logger from '../config/logger';

export const ImmBusSchema = z.object({
  eType: z.string(),
  company: z.string(),
  timestamp: z.string(),
  busId: z.number().or(z.string()),
  line: z.string(),
  lineVariantId: z.number().or(z.string()),
  location: z.object({
    type: z.string(),
    coordinates: z.array(z.number()),
  }).optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  subline: z.string().optional(),
  speed: z.number().optional(),
});

export type ImmBus = z.infer<typeof ImmBusSchema>;

const API_BASE = 'https://api.montevideo.gub.uy/api/transportepublico/';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class ImmApiClient {
  /**
   * Obtiene datos de la IMM con Exponential Backoff
   */
  public async fetchBusesWithBackoff(retries = 3, delayMs = 1000): Promise<ImmBus[]> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const token = await getImmToken();
        const response = await axios.get(`${API_BASE}buses`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        });

        // Validar esquema (Zod)
        if (!Array.isArray(response.data)) {
          throw new Error('Respuesta de la IMM no es un array');
        }

        // Filtramos y validamos solo lo que cumple el esquema para no caer por 1 mal registro
        const validBuses: ImmBus[] = [];
        for (const raw of response.data) {
          const parsed = ImmBusSchema.safeParse(raw);
          if (parsed.success) {
            validBuses.push(parsed.data);
          }
        }

        logger.info(`[ImmApiClient] Extraídos ${validBuses.length} buses válidos de la IMM (Intento ${attempt})`);
        return validBuses;
      } catch (error) {
        const err = error as AxiosError;
        logger.warn(`[ImmApiClient] Fallo en intento ${attempt}: ${err.message}`);
        if (err.response?.status === 429 || err.response?.status === 503 || err.response?.status === 504) {
          if (attempt < retries) {
            const backoff = delayMs * Math.pow(2, attempt - 1);
            logger.info(`[ImmApiClient] Reintentando en ${backoff}ms...`);
            await wait(backoff);
            continue;
          }
        }
        if (attempt === retries) {
          throw new Error(`Fallo tras ${retries} intentos: ${err.message}`);
        }
      }
    }
    return [];
  }
}

export const immApiClient = new ImmApiClient();
