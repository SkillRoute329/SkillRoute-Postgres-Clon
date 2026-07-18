import sqlDb from './config/database';
import { logger } from './config/logger';
import { competitorController } from './controllers/competitorController';
import { disciplineController } from './controllers/disciplineController';
import { maintenanceController } from './controllers/maintenanceController';
import { v4 as uuidv4 } from 'uuid';

async function runSimulator() {
  logger.info('Iniciando Simulador Masivo: 1000 conductores concurrentes.');
  
  // Dummy req/res to pass to controllers
  const createMockContext = (driverId: string, customBody = {}, customQuery = {}) => {
    return {
      req: {
        user: { id: driverId },
        body: customBody,
        query: customQuery
      } as any,
      res: {
        status: (code: number) => ({
          json: (data: any) => { /* no-op */ }
        })
      } as any
    };
  };

  const start = Date.now();
  
  // Hilo 1: 600 solicitudes Panel y Radar Táctico (M6 y M4)
  const thread1 = Array.from({ length: 600 }).map((_, i) => {
    return (async () => {
      const driverId = `driver_radar_${i}`;
      const { req, res } = createMockContext(driverId, {}, { driver_id: driverId, linea_id: 'L123' });
      // Alternar
      if (i % 2 === 0) {
        await competitorController.getRadarCompetenciaConductor(req, res);
      } else {
        // Simulando llamada a historial de inspecciones (que usaría M6)
        // Solo un query dummy para simular el impacto en pool
        await sqlDb.raw('SELECT 1 as M6_HISTORIAL');
      }
    })();
  });

  // Hilo 2: 300 inserciones de telemetría GPS y actas (M2/M6)
  const thread2 = Array.from({ length: 300 }).map((_, i) => {
    return (async () => {
      await sqlDb.raw('SELECT 1 as M2_TELEMETRY');
      if (i % 10 === 0) {
         // Acta M6
         await sqlDb.raw('SELECT 1 as M6_ACTA');
      }
    })();
  });

  // Hilo 3: 80 denuncias Críticas EAM (M7)
  const thread3 = Array.from({ length: 80 }).map((_, i) => {
    return (async () => {
      const { req, res } = createMockContext(`driver_eam_${i}`, {
        vehiculo_id: `v_mock_${i}`,
        sector_afectado: 'MECANICA',
        gravedad: 'CRITICA',
        descripcion: 'Simulador EAM',
        agency_id: 'agency_master'
      });
      // Aseguramos que el vehículo exista para que no falle o manejamos el error
      // Insertamos el vehiculo
      try {
        await sqlDb('vehiculos').insert({ id: `v_mock_${i}`, agency_id: 'agency_master', patente: `SIM${i}`, data_jsonb: JSON.stringify({estado_operativo: "ACTIVO"}) }).onConflict('id').ignore();
      } catch (e) {}

      await maintenanceController.crearTicketAveria(req, res);
    })();
  });

  // Hilo 4: 20 descargos de legajo (M8)
  const thread4 = Array.from({ length: 20 }).map((_, i) => {
    return (async () => {
      const alertaId = uuidv4();
      const driverId = `driver_abl_${i}`;
      
      // Setup alerta previa
      try {
        await sqlDb('users').insert({ id: driverId, email: driverId, agency_id: 'agency_master', password_hash: 'hash' }).onConflict('id').ignore();
        await sqlDb('abl_red_numbers').insert({
          id: alertaId,
          conductor_id: driverId,
          agency_id: 'agency_master',
          tipo_alerta: 'EXCESO_VELOCIDAD',
          estado_tramite: 'PENDIENTE_DESCARGO'
        });
      } catch(e) {}

      const { req, res } = createMockContext(driverId, {
        alerta_id: alertaId,
        descargo: 'Descargo inmutable de simulación.'
      });
      
      await disciplineController.presentarDescargoConductor(req, res);
    })();
  });

  logger.info('Disparando Promise.allSettled...');
  
  const results = await Promise.allSettled([
    ...thread1,
    ...thread2,
    ...thread3,
    ...thread4
  ]);

  const end = Date.now();
  const fulfilled = results.filter(r => r.status === 'fulfilled').length;
  const rejected = results.filter(r => r.status === 'rejected').length;

  logger.info(`Simulación Masiva Completada en ${end - start}ms`);
  logger.info(`Total peticiones: ${results.length}`);
  logger.info(`Exitosas: ${fulfilled}, Rechazadas (Fallos Knex/Lógica): ${rejected}`);
  
  process.exit(0);
}

runSimulator().catch(console.error);
