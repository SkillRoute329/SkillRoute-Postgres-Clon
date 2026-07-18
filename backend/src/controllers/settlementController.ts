import { Request, Response } from 'express';
import { AuthRequest } from '../types/index';
import { logger } from '../config/logger';
import sqlDb from '../config/database';

export const settlementController = {
  /**
   * GET /api/settlement/jornal/:driver_id
   * Calcula la liquidación del jornal de un conductor sumando horas extras, nocturnidad
   * y el kilometraje preciso obtenido vía PostGIS, dinamizado por tenant_configs (SaaS).
   */
  async calcularLiquidacionJornal(req: AuthRequest, res: Response): Promise<void> {
    try {
      const driverId = req.params.driver_id;
      const { fecha_inicio, fecha_fin } = req.query;

      if (!driverId || !fecha_inicio || !fecha_fin) {
        res.status(400).json({ error: 'Faltan parámetros obligatorios: driver_id, fecha_inicio, fecha_fin.' });
        return;
      }

      // Obtener la configuración del inquilino dinámicamente (SaaS)
      // Idealmente agency_id viene en el token de autenticación (req.user?.agency_id)
      const tenant = await sqlDb('tenant_configs').first();
      
      if (!tenant) {
        res.status(500).json({ error: 'Falta configuración de inquilino (tenant_configs).' });
        return;
      }

      const timezoneStr = tenant.timezone_string;
      const laborRules = typeof tenant.labor_rules_jsonb === 'string' 
        ? JSON.parse(tenant.labor_rules_jsonb) 
        : tenant.labor_rules_jsonb;
        
      const nocturnityStart = laborRules?.nocturnity?.start_hour ?? 22;
      const nocturnityEnd = laborRules?.nocturnity?.end_hour ?? 6;

      // 1. Obtener jornadas trabajadas (roster_assignments)
      const jornadas = await sqlDb('roster_assignments')
        .where('driver_id', driverId)
        .andWhere('estado', 'FINALIZADO')
        .whereNotNull('hora_login_real')
        .whereNotNull('hora_logoff_real')
        .whereBetween('hora_login_real', [fecha_inicio as string, fecha_fin as string]);

      let totalHorasExtras = 0;
      let totalMinutosNocturnos = 0;

      // Helper para extraer la hora determinista en la zona del inquilino
      const getHourInTimezone = (ms: number, timeZone: string): number => {
        return parseInt(new Intl.DateTimeFormat('en-US', {
          timeZone,
          hour: 'numeric',
          hourCycle: 'h23'
        }).format(new Date(ms)), 10);
      };

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

        // Calcular nocturnidad (Parametrizada por tenant)
        let minutosNocturnos = 0;
        let currentTime = realInicio;
        while (currentTime < realFin) {
          const localHour = getHourInTimezone(currentTime, timezoneStr);
          
          if (nocturnityStart > nocturnityEnd) {
            // Ejemplo: 22 a 6 (cruza medianoche)
            if (localHour >= nocturnityStart || localHour < nocturnityEnd) {
              minutosNocturnos += 1;
            }
          } else {
            // Ejemplo: 20 a 23 (no cruza medianoche)
            if (localHour >= nocturnityStart && localHour < nocturnityEnd) {
              minutosNocturnos += 1;
            }
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

      // 2. Cálculo de Kilometraje PostGIS Preciso e Internacionalizado
      const vehiculosManejados = Array.from(new Set(jornadas.map((j: any) => j.coche_id)));
      
      let kilometrajeTotal = 0;
      const kilometrajePorViaje = [];

      if (vehiculosManejados.length > 0) {
        // Ejecutamos SQL crudo inyectando dinámicamente el SRID desde tenant_configs vía JOIN
        const kmQuery = await sqlDb.raw(`
          SELECT v.id_bus, v.trip_id,
            (ST_Length(
              ST_Transform(
                ST_MakeLine(v.geom ORDER BY v.timestamp_gps), 
                t.postgis_srid
              )
            ) / 1000) AS km_recorridos
          FROM vehicle_events v
          JOIN tenant_configs t ON v.agency_id = t.agency_id
          WHERE v.id_bus = ANY(?)
            AND v.timestamp_gps BETWEEN ? AND ?
          GROUP BY v.id_bus, v.trip_id, t.postgis_srid
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
