import sqlDb from './config/database';
import { logger } from './config/logger';

async function runChaosSimulation() {
  logger.info('INICIANDO SIMULACIÓN DE CAOS CONCURRENTE (MONTEVIDEO)');
  
  // Setup inicial: Asegurarnos que existe un coche 91 y limpiar lotes viejos
  try {
    await sqlDb('lotes_financieros').where({ fecha_desde: '2023-01-01' }).del();
    await sqlDb('lotes_financieros').insert({
      fecha_desde: '2023-01-01',
      fecha_hasta: '2023-01-31',
      estado: 'ABIERTO'
    });
  } catch (err: any) {
    logger.warn(`Error en setup inicial: ${err?.message}`);
  }

  const startTime = Date.now();

  // HILO A: Ráfaga Tardía (Inyección de 100 coords GPS viejas en lote que se va a cerrar)
  const hiloA = async () => {
    try {
      logger.info('Hilo A: Preparando ráfaga de 100 puntos GPS retrasados...');
      const payload = Array.from({ length: 100 }).map((_, i) => ({
        id_bus: 'bus_91',
        agency_id: 'ucot',
        lat: -34.9011,
        lon: -56.1645 + (i * 0.0001),
        geom: sqlDb.raw(`ST_SetSRID(ST_MakePoint(-56.1645, -34.9011), 4326)`),
        timestamp_gps: '2023-01-15T12:00:00Z' // Cae en la fecha del lote
      }));

      // Añadimos un micro-delay para permitir que el Hilo C cierre el lote
      await new Promise(res => setTimeout(res, 50));
      
      logger.info('Hilo A: Disparando inyección masiva...');
      await sqlDb('vehicle_events').insert(payload);
      logger.warn('Hilo A: ¡ALERTA! La inserción pasó, el trigger falló.');
    } catch (error: any) {
      logger.error(`Hilo A Interceptado por Trigger: ${error.message}`);
    }
  };

  // HILO B: Transmisión Crítica 1Hz (Alertas de Pánico coche 91)
  const hiloB = async () => {
    try {
      logger.info('Hilo B: Inyectando ráfaga de alertas de pánico 1Hz...');
      const panicPayload = Array.from({ length: 50 }).map((_, i) => ({
        vehicle_id: 'bus_91',
        type: 'PANIC_BUTTON',
        severity: 'CRITICAL',
        status: 'OPEN',
        latitude: -34.9011,
        longitude: -56.1645
      }));
      // En SkillRoute la tabla es incidentes o incident_reports
      // La definimos en incident_reports
      await sqlDb('incident_reports').insert(panicPayload);
      logger.info('Hilo B: Ráfaga de pánico registrada exitosamente.');
    } catch (error: any) {
      logger.error(`Hilo B Error (Posible falta de tabla incident_reports, ignorando para simulación de estrés db): ${error.message}`);
      // Si la tabla no existe, hacemos un fallback sobre vehicle_events actual (hoy)
      try {
        const fallbackPayload = Array.from({ length: 50 }).map((_, i) => ({
          id_bus: 'bus_91_panic',
          agency_id: 'ucot',
          lat: -34.9011,
          lon: -56.1645,
          geom: sqlDb.raw(`ST_SetSRID(ST_MakePoint(-56.1645, -34.9011), 4326)`),
          timestamp_gps: new Date().toISOString()
        }));
        await sqlDb('vehicle_events').insert(fallbackPayload);
        logger.info('Hilo B: Ráfaga de pánico (fallback) registrada exitosamente.');
      } catch(e: any) {}
    }
  };

  // HILO C: Cierre Financiero Concurrente
  const hiloC = async () => {
    try {
      logger.info('Hilo C: Lanzando cierre financiero de periodo...');
      await sqlDb('lotes_financieros')
        .where('fecha_desde', '2023-01-01')
        .update({ estado: 'CERRADO', aprobado_por: 'Admin_Audit' });
      logger.info('Hilo C: Lote financiero CERRADO exitosamente.');
    } catch (error: any) {
      logger.error(`Hilo C Error: ${error.message}`);
    }
  };

  // HILO D: Benchmark PostGIS en Medio del Caos
  const hiloD = async () => {
    try {
      await new Promise(res => setTimeout(res, 20)); // Esperar a que empiece el caos
      logger.info('Hilo D: Iniciando cálculo espacial PostGIS (UTM 21S)...');
      const startGis = Date.now();
      
      const res = await sqlDb.raw(`
        SELECT id_bus, 
          (ST_Length(ST_Transform(ST_MakeLine(geom ORDER BY timestamp_gps), 32721)) / 1000) AS km_recorridos
        FROM vehicle_events
        WHERE timestamp_gps > '2023-01-01' AND timestamp_gps < '2023-01-02'
        GROUP BY id_bus
        LIMIT 10
      `);
      
      const endGis = Date.now();
      logger.info(`Hilo D: Cómputo PostGIS completado en ${endGis - startGis} ms. Filas: ${res.rows ? res.rows.length : res.length}`);
    } catch (error: any) {
      logger.error(`Hilo D Error: ${error.message}`);
    }
  };

  // Ejecución simultánea
  logger.info('>>> COLISIÓN DE HILOS INICIADA <<<');
  await Promise.allSettled([hiloA(), hiloB(), hiloC(), hiloD()]);
  logger.info('>>> COLISIÓN DE HILOS FINALIZADA <<<');

  const totalTime = Date.now() - startTime;
  logger.info(`Tiempo total de simulación concurrente: ${totalTime} ms`);

  // Limpieza de simulación (Opcional, pero dejaremos el lote para evidencia forense)
  logger.info('Cerrando pool de conexiones de Knex...');
  await sqlDb.destroy();
}

runChaosSimulation();
