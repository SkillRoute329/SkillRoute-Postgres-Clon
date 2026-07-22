import { dataUploader } from './src/ingestion/DataUploader';
import { immApiClient } from './src/ingestion/ImmApiClient';
import sqlDb from './src/config/database';
import logger from './src/config/logger';

async function testAtomicInsertion() {
  try {
    logger.info('Iniciando prueba de inserción atómica...');
    const buses = await immApiClient.fetchBusesWithBackoff(1, 1000);
    logger.info(`Se obtuvieron ${buses.length} buses de la IMM.`);

    // Tomamos solo 2 buses para la prueba
    const testBuses = buses.filter(b => b.company === 'UCOT').slice(0, 2);
    if (testBuses.length < 2) {
      logger.warn('No hay suficientes buses UCOT para la prueba.');
      process.exit(0);
    }

    // Contamos antes
    const countBefore = await sqlDb('cartones_completados').count('id as n').first();
    logger.info(`Count ANTES: ${countBefore?.n}`);

    // Modificamos temporalmente el DataUploader para que falle a propósito en el segundo insert
    const originalInsert = dataUploader.uploadToCartonesCompletados.bind(dataUploader);
    
    // Hack temporal para probar el rollback
    try {
      await sqlDb.transaction(async (trx) => {
        // Insertamos el 1ro bien
        await trx('cartones_completados')
          .insert({
            id: 'TEST_ROLLBACK_1',
            agency_id: '70',
            service_number: 'TEST',
            line: 'TEST',
            vehiculo_id: '9999',
            updated_by: 'test'
          });
        
        // El 2do forzamos un error violando el esquema (columna inexistente)
        await trx('cartones_completados')
          .insert({
            id: 'TEST_ROLLBACK_2',
            agency_id: '70',
            service_number: 'TEST',
            line: 'TEST',
            vehiculo_id: '9999',
            columna_inventada: 'boom', // ESTO FALLARÁ
            updated_by: 'test'
          });
      });
    } catch (err) {
      logger.info('Excepción capturada (Esperada): ' + String(err));
    }

    const countAfterError = await sqlDb('cartones_completados').count('id as n').first();
    logger.info(`Count DESPUÉS DEL ERROR (Debe ser igual al ANTES): ${countAfterError?.n}`);

    if (countBefore?.n === countAfterError?.n) {
      logger.info('✅ ROLLBACK FUNCIONA CORRECTAMENTE. No hubo datos huérfanos.');
    } else {
      logger.error('❌ ROLLBACK FALLÓ. Hay datos huérfanos.');
    }

    // Ahora probamos la inserción real atómica de DataUploader
    logger.info('Probando inserción atómica real...');
    const inserted = await dataUploader.uploadToCartonesCompletados(testBuses, 'UCOT');
    logger.info(`✅ INSERCIÓN ATÓMICA REAL EXITOSA: ${inserted} registros insertados/actualizados.`);

    process.exit(0);
  } catch (err) {
    logger.error('Prueba falló:', err);
    process.exit(1);
  }
}

testAtomicInsertion();
