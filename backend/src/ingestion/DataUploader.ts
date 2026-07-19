import sqlDb from '../config/database';
import logger from '../config/logger';
import { ImmBus } from './ImmApiClient';

export class DataUploader {
  /**
   * Mapea el company name a agency_id (ej: UCOT -> 70)
   */
  private mapCompanyToAgencyId(company: string): string {
    const norm = company.toUpperCase();
    if (norm.includes('UCOT')) return '70';
    if (norm.includes('CUTCSA')) return '50';
    if (norm.includes('COME')) return '20';
    if (norm.includes('COETC')) return '10';
    return '99';
  }

  /**
   * Inserción atómica en cartones_completados.
   * Utiliza knex.transaction() para evitar estados parciales.
   */
  public async uploadToCartonesCompletados(buses: ImmBus[], targetCompany: string = 'UCOT'): Promise<number> {
    const targetBuses = buses.filter(b => b.company.toUpperCase().includes(targetCompany.toUpperCase()));
    if (targetBuses.length === 0) {
      logger.info(`[DataUploader] No hay buses de ${targetCompany} para insertar.`);
      return 0;
    }

    const agencyId = this.mapCompanyToAgencyId(targetCompany);
    let insertedOrUpdated = 0;

    // Transacción estricta para cero datos huérfanos
    await sqlDb.transaction(async (trx) => {
      for (const bus of targetBuses) {
        // En la API oficial, cruzamos el vehiculo con la línea/variante en memoria instantáneamente
        const id = `${agencyId}_${bus.busId}_${bus.lineVariantId || 'VAR'}`;
        
        const row = {
          id,
          agency_id: agencyId,
          service_number: String(bus.lineVariantId || bus.line),
          line: bus.line,
          vehiculo_id: String(bus.busId),
          conductor_id: null,
          updated_by: 'imm-api-ingestion',
          data_jsonb: JSON.stringify({
            origin: bus.origin,
            destination: bus.destination,
            subline: bus.subline,
            timestamp: bus.timestamp,
            speed: bus.speed
          }),
        };

        // UPSERT Atómico
        await trx('cartones_completados')
          .insert(row)
          .onConflict('id')
          .merge(['service_number', 'line', 'vehiculo_id', 'data_jsonb', 'updated_by']);
        
        insertedOrUpdated++;
      }
    });

    logger.info(`[DataUploader] Sincronización atómica completa: ${insertedOrUpdated} registros de ${targetCompany}.`);
    return insertedOrUpdated;
  }
}

export const dataUploader = new DataUploader();
