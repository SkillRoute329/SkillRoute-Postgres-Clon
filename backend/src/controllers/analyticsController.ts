import { Request, Response } from 'express';
import { analyticsService } from '../services/analyticsService';
import { logger } from '../config/logger';

// Controlador de análisis - Semana 5

export const analyticsController = {
  /**
   * GET /api/analytics/cartoon/:cartoonId/viability
   * Valida viabilidad de un cartón
   */
  async getCartoonViability(req: Request, res: Response): Promise<void> {
    try {
      const { cartoonId } = req.params;

      if (!cartoonId) {
        res.status(400).json({ error: 'cartoonId requerido' });
        return;
      }

      const viabilidad = await analyticsService.validarCartoon(cartoonId);

      res.json({
        success: true,
        data: viabilidad
      });
    } catch (error) {
      logger.error(`Error en getCartoonViability: ${error}`);
      res.status(500).json({ error: 'Error validando cartón' });
    }
  },

  /**
   * GET /api/analytics/cartoons/marginal
   * Obtiene cartones marginales o no viables
   */
  async getMarginalCartoons(req: Request, res: Response): Promise<void> {
    try {
      const operador = (req.query.operador as string) || 'UCOT';

      const cartonesMarginales = await analyticsService.detectarCartonesMarginales(operador);

      res.json({
        success: true,
        data: {
          operador,
          totalCartonesMarginales: cartonesMarginales.length,
          cartonesMarginales,
          perdidaPotencial: cartonesMarginales.reduce(
            (sum, c) => sum + Math.abs(c.margenEstimadoMes),
            0
          )
        }
      });
    } catch (error) {
      logger.error(`Error en getMarginalCartoons: ${error}`);
      res.status(500).json({ error: 'Error obteniendo cartones marginales' });
    }
  },

  /**
   * GET /api/analytics/line/:lineaId/history
   * Obtiene histórico y datos de una línea
   */
  async getLineHistory(req: Request, res: Response): Promise<void> {
    try {
      const { lineaId } = req.params;
      const dias = (req.query.dias as string) || '30';

      if (!lineaId) {
        res.status(400).json({ error: 'lineaId requerido' });
        return;
      }

      const datosLinea = await analyticsService.obtenerDatosLinea(lineaId, parseInt(dias));

      res.json({
        success: true,
        data: datosLinea
      });
    } catch (error) {
      logger.error(`Error en getLineHistory: ${error}`);
      res.status(500).json({ error: 'Error obteniendo histórico de línea' });
    }
  },

  /**
   * GET /api/analytics/lines/at-risk
   * Obtiene líneas en riesgo
   */
  async getLinesAtRisk(req: Request, res: Response): Promise<void> {
    try {
      const operador = (req.query.operador as string) || 'UCOT';

      const lineasEnRiesgo = await analyticsService.identificarLineasEnRiesgo(operador);

      res.json({
        success: true,
        data: {
          operador,
          totalLineasEnRiesgo: lineasEnRiesgo.length,
          lineasEnRiesgo,
          ingresoBleEdoTotal: lineasEnRiesgo.reduce((sum, l) => sum + l.ingresoEnRiesgo, 0)
        }
      });
    } catch (error) {
      logger.error(`Error en getLinesAtRisk: ${error}`);
      res.status(500).json({ error: 'Error obteniendo líneas en riesgo' });
    }
  },

  /**
   * GET /api/analytics/summary
   * Resumen ejecutivo de analytics
   */
  async getSummary(req: Request, res: Response): Promise<void> {
    try {
      const operador = (req.query.operador as string) || 'UCOT';

      const cartonesMarginales = await analyticsService.detectarCartonesMarginales(operador);
      const lineasEnRiesgo = await analyticsService.identificarLineasEnRiesgo(operador);

      const resumen = {
        operador,
        metricas: {
          cartonesMarginalesTotal: cartonesMarginales.length,
          lineasEnRiesgoTotal: lineasEnRiesgo.length,
          perdidaPotencialCartones: cartonesMarginales.reduce(
            (sum, c) => sum + Math.abs(c.margenEstimadoMes),
            0
          ),
          ingresoEnRiesgo: lineasEnRiesgo.reduce((sum, l) => sum + l.ingresoEnRiesgo, 0)
        },
        alertas: {
          criticas: cartonesMarginales.filter(c => c.nivelViabilidad === 'no-viable').length,
          altas: cartonesMarginales.filter(c => c.nivelViabilidad === 'marginal').length + lineasEnRiesgo.length
        },
        recomendacionesUrgentes: [
          ...cartonesMarginales
            .filter(c => c.nivelViabilidad === 'no-viable')
            .slice(0, 3)
            .map(c => ({
              tipo: 'cartoon-no-viable',
              mensaje: `Línea ${c.numeroLinea}: cartón no viable (pérdida $${Math.abs(c.margenEstimadoMes)}/mes)`
            })),
          ...lineasEnRiesgo.slice(0, 3).map(l => ({
            tipo: 'linea-en-riesgo',
            mensaje: `Línea ${l.numeroLinea}: caída ${l.caida.toFixed(1)}% vs mes anterior`
          }))
        ]
      };

      res.json({
        success: true,
        data: resumen
      });
    } catch (error) {
      logger.error(`Error en getSummary: ${error}`);
      res.status(500).json({ error: 'Error generando resumen' });
    }
  }
};
