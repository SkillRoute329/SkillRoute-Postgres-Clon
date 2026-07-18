import { Request, Response } from 'express';
import { AuthRequest } from '../types/index';
import { logger } from '../config/logger';
import sqlDb from '../config/database';

export const settlementController = {
  /**
   * GET /api/settlement/jornal/:driver_id
   * Calcula la liquidación del jornal de un conductor sumando horas extras, nocturnidad
   * y el kilometraje preciso obtenido vía PostGIS.
   */
  async calcularLiquidacionJornal(req: AuthRequest, res: Response): Promise<void> {
    try {
      const driverId = req.params.driver_id;
      const { fecha_inicio, fecha_fin } = req.query;

      if (!driverId || !fecha_inicio || !fecha_fin) {
        res.status(400).json({ error: 'Faltan parámetros obligatorios: driver_id, fecha_inicio, fecha_fin.' });
        return;
      }

      // 1. Obtener jornadas trabajadas (roster_assignments)
      const jornadas = await sqlDb('roster_assignments')
        .where('driver_id', driverId)
        .andWhere('estado', 'FINALIZADO')
        .whereNotNull('hora_login_real')
        .whereNotNull('hora_logoff_real')
        .whereBetween('hora_login_real', [fecha_inicio as string, fecha_fin as string]);

      let totalHorasExtras = 0;
      let totalMinutosNocturnos = 0;

      const resultadosJornadas = jornadas.map((jornada: any) => {
        const programadoInicio = new Date(jornada.hora_inicio).getTime();
        const programadoFin = new Date(jornada.hora_fin).getTime();
        const realInicio = new Date(jornada.hora_login_real).getTime();
        const realFin = new Date(jornada.hora_logoff_real).getTime();

        const horasProgramadas = (programadoFin - programadoInicio) / (1000 * 60 * 60);
        const horasReales = (realFin - realInicio) / (1000 * 60 * 60);

        let horasExtras = 0;
        if (horasReales > horasProgramadas) {
          horasExtras = horasReales - horasProgramadas;
        }

        totalHorasExtras += horasExtras;

        // Calcular nocturnidad (22:00 a 06:00)
        let minutosNocturnos = 0;
        let currentTime = realInicio;
        while (currentTime < realFin) {
          const currentDate = new Date(currentTime);
          const hour = currentDate.getHours();
          if (hour >= 22 || hour < 6) {
            minutosNocturnos += 1;
          }
          // Avanzar 1 minuto
          currentTime += 60000;
        }

        totalMinutosNocturnos += minutosNocturnos;

        return {
          coche_id: jornada.coche_id,
          linea_id: jornada.linea_id,
          fecha: jornada.hora_login_real,
          horas_reales: horasReales,
          horas_extras: horasExtras,
          minutos_nocturnos: minutosNocturnos
        };
      });

      // 2. Cálculo de Kilometraje PostGIS Preciso
      // Extraemos los IDs de coches que manejó el conductor
      const vehiculosManejados = Array.from(new Set(jornadas.map((j: any) => j.coche_id)));
      
      let kilometrajeTotal = 0;
      const kilometrajePorViaje = [];

      if (vehiculosManejados.length > 0) {
        // Ejecutamos SQL crudo utilizando ST_Length y ST_Transform sobre la proyección UTM 21S (32721)
        const kmQuery = await sqlDb.raw(`
          SELECT id_bus, trip_id,
            (ST_Length(ST_Transform(ST_MakeLine(geom ORDER BY timestamp_gps), 32721)) / 1000) AS km_recorridos
          FROM vehicle_events
          WHERE id_bus = ANY(?)
            AND timestamp_gps BETWEEN ? AND ?
          GROUP BY id_bus, trip_id
        `, [vehiculosManejados, fecha_inicio, fecha_fin]);

        for (const row of kmQuery.rows || kmQuery) {
          const km = parseFloat(row.km_recorridos) || 0;
          kilometrajeTotal += km;
          kilometrajePorViaje.push({
            coche_id: row.id_bus,
            trip_id: row.trip_id,
            km_recorridos: km
          });
        }
      }

      res.json({
        success: true,
        data: {
          driver_id: driverId,
          periodo: { inicio: fecha_inicio, fin: fecha_fin },
          resumen_horario: {
            jornadas_procesadas: jornadas.length,
            total_horas_extras: totalHorasExtras,
            total_horas_nocturnidad: totalMinutosNocturnos / 60,
          },
          resumen_kilometraje: {
            km_totales: kilometrajeTotal,
            detalle_viajes: kilometrajePorViaje
          },
          detalle_jornadas: resultadosJornadas
        }
      });
    } catch (error: any) {
      logger.error(`Error en calcularLiquidacionJornal: ${error?.message || error}`);
      res.status(500).json({ error: 'Error interno en el motor de liquidación.' });
    }
  }
};
