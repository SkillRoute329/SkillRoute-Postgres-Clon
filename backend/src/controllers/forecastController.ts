import { Response } from 'express';
import { AuthRequest } from '../types/index';
import { forecastService } from '../services/forecastService';
import { logger } from '../config/logger';
import { CambioHorario } from '../types/analytics';

// Controlador de pronósticos e ingresos - Semana 6-7

export const forecastController = {
  /**
   * POST /api/forecast/income/:lineaId
   * Genera pronóstico de ingresos con múltiples escenarios
   */
  async getIncomesForecast(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { lineaId } = req.params;

      if (!lineaId) {
        res.status(400).json({ error: 'lineaId requerido' });
        return;
      }

      const pronostico = await forecastService.pronosticarIngresos(lineaId);

      res.json({
        success: true,
        data: {
          pronostico,
          mejorEscenario: pronostico.escenarios.reduce((max, e) =>
            e.impacto > max.impacto ? e : max
          ),
          peorEscenario: pronostico.escenarios.reduce((min, e) =>
            e.impacto < min.impacto ? e : min
          )
        }
      });
    } catch (error) {
      logger.error(`Error en getIncomesForecast: ${error}`);
      res.status(500).json({ error: 'Error generando pronóstico' });
    }
  },

  /**
   * POST /api/forecast/simulate
   * Simula impacto de cambios de horario
   */
  async simulateScheduleChanges(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { lineaId, cambios } = req.body as {
        lineaId: string;
        cambios: CambioHorario[];
      };

      if (!lineaId || !cambios || cambios.length === 0) {
        res.status(400).json({ error: 'lineaId y cambios requeridos' });
        return;
      }

      const simulacion = await forecastService.simuladorHorarios(lineaId, cambios);

      const mejora = simulacion.resultados.escenarioNuevo.cambioAbsoluto;
      const emojis = mejora > 0 ? '📈' : mejora < 0 ? '📉' : '→';

      res.json({
        success: true,
        data: {
          simulacion,
          resumen: {
            escenarioActual: `${simulacion.resultados.escenarioActual.pasajeros} pasajeros/día = $${simulacion.resultados.escenarioActual.ingresos}/día`,
            escenarioNuevo: `${simulacion.resultados.escenarioNuevo.pasajeros} pasajeros/día = $${simulacion.resultados.escenarioNuevo.ingresos}/día`,
            cambio: `${emojis} ${simulacion.resultados.escenarioNuevo.cambioRelativo > 0 ? '+' : ''}${simulacion.resultados.escenarioNuevo.cambioRelativo}%`,
            impactoMensual: `$${simulacion.resultados.impactoTotal.toLocaleString()}`
          }
        }
      });
    } catch (error) {
      logger.error(`Error en simulateScheduleChanges: ${error}`);
      res.status(500).json({ error: 'Error en simulación' });
    }
  },

  /**
   * GET /api/forecast/demand/:zona
   * Calcula demanda por zona geográfica
   */
  async getDemandByZone(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { zona } = req.params;

      if (!zona) {
        res.status(400).json({ error: 'zona requerida' });
        return;
      }

      const demanda = await forecastService.calcularDemandaPorZona(zona);

      res.json({
        success: true,
        data: demanda
      });
    } catch (error) {
      logger.error(`Error en getDemandByZone: ${error}`);
      res.status(500).json({ error: 'Error calculando demanda' });
    }
  },

  /**
   * GET /api/forecast/peak-hours/:lineaId
   * Identifica horarios de alta demanda
   */
  async getPeakHours(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { lineaId } = req.params;

      if (!lineaId) {
        res.status(400).json({ error: 'lineaId requerido' });
        return;
      }

      const horariosAlta = await forecastService.identificarHorariosAlta(lineaId);

      res.json({
        success: true,
        data: {
          lineaId,
          horariosAlta,
          totalHorariosIdentificados: horariosAlta.length,
          recomendacion: horariosAlta.length > 0
            ? `Aumenta frecuencia en: ${horariosAlta.map(h => h.hora).join(', ')}`
            : 'No se encontraron horarios con demanda significativa'
        }
      });
    } catch (error) {
      logger.error(`Error en getPeakHours: ${error}`);
      res.status(500).json({ error: 'Error identificando horarios pico' });
    }
  },

  /**
   * GET /api/forecast/growth/:lineaId
   * Proyecta crecimiento futuro
   */
  async getGrowthProjection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { lineaId } = req.params;
      const meses = (req.query.meses as string) || '6';

      if (!lineaId) {
        res.status(400).json({ error: 'lineaId requerido' });
        return;
      }

      const proyeccion = await forecastService.proyectarCrecimiento(
        lineaId,
        parseInt(meses)
      );

      const ingresoFinal = proyeccion.proyecciones[proyeccion.proyecciones.length - 1]?.ingresoProyectado || 0;
      const ingresoInicial = proyeccion.proyecciones[0]?.ingresoProyectado || 0;
      const crecimientoTotal = ((ingresoFinal - ingresoInicial) / ingresoInicial) * 100;

      res.json({
        success: true,
        data: {
          proyeccion,
          resumen: {
            tasaMensual: `${proyeccion.tasaCrecimientoMensual.toFixed(2)}% por mes`,
            crecimientoTotal: `${crecimientoTotal.toFixed(1)}% en ${meses} meses`,
            confianza: `${proyeccion.confianza.toFixed(0)}%`,
            tendencia: proyeccion.tasaCrecimientoMensual > 0 ? '📈 Crecimiento' : proyeccion.tasaCrecimientoMensual < 0 ? '📉 Decrecimiento' : '→ Estable'
          }
        }
      });
    } catch (error) {
      logger.error(`Error en getGrowthProjection: ${error}`);
      res.status(500).json({ error: 'Error proyectando crecimiento' });
    }
  },

  /**
   * GET /api/forecast/benchmark/:lineaId
   * Compara con promedio de zona
   */
  async getBenchmark(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { lineaId } = req.params;

      if (!lineaId) {
        res.status(400).json({ error: 'lineaId requerido' });
        return;
      }

      const comparacion = await forecastService.compararUCOTVsPromedio(lineaId);

      res.json({
        success: true,
        data: {
          comparacion,
          analisis: {
            posicion: `Posición: #${comparacion.posicion}`,
            diferencia: `${comparacion.diferenciaVsPromedio > 0 ? '+' : ''}${comparacion.diferenciaVsPromedio.toFixed(1)}% vs promedio`,
            clasificacion: comparacion.clasificacion.toUpperCase(),
            recomendaciones: comparacion.recomendaciones
          }
        }
      });
    } catch (error) {
      logger.error(`Error en getBenchmark: ${error}`);
      res.status(500).json({ error: 'Error obteniendo benchmark' });
    }
  },

  /**
   * GET /api/forecast/passengers-by-hour/:lineaId
   * Estima pasajeros por horario específico
   */
  async getPassengersByHour(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { lineaId } = req.params;
      const { horario } = req.query as { horario?: string };

      if (!lineaId || !horario) {
        res.status(400).json({ error: 'lineaId y horario requeridos' });
        return;
      }

      const pasajeros = await forecastService.estimarPasajerosPorHorario(lineaId, horario);

      res.json({
        success: true,
        data: {
          lineaId,
          horario,
          pasajerosEstimados: pasajeros,
          ingresosEstimados: pasajeros * 56,
          confianza: 'media'
        }
      });
    } catch (error) {
      logger.error(`Error en getPassengersByHour: ${error}`);
      res.status(500).json({ error: 'Error estimando pasajeros' });
    }
  }
};
