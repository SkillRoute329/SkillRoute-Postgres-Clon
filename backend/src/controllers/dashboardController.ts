import { Response } from 'express';
import { AuthRequest } from '../types/index';
import { dashboardService } from '../services/dashboardService';
import { logger } from '../config/logger';

// Controlador de Dashboard Ejecutivo - Semana 8-9

class DashboardController {
  /**
   * GET /api/dashboard/executive
   * Obtiene dashboard ejecutivo completo para un operador
   */
  async getExecutiveDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { operador } = req.params;

      // Validar que el usuario tenga acceso al operador
      if (!req.user) {
        res.status(403).json({
          error: 'No tienes permiso para acceder a este dashboard'
        });
        return;
      }

      const dashboard = await dashboardService.generarDashboardEjecutivo(operador);

      res.json({
        success: true,
        data: dashboard
      });
    } catch (error) {
      logger.error(`Error en getExecutiveDashboard: ${error}`);
      res.status(500).json({
        error: 'Error generando dashboard ejecutivo'
      });
    }
  }

  /**
   * GET /api/dashboard/metricas/:operador
   * Obtiene solo las métricas principales (carga rápida)
   */
  async getMetricas(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { operador } = req.params;

      // Validar acceso
      if (req.user! && req.user?.role !== 'SuperAdmin') {
        res.status(403).json({
          error: 'No tienes permiso para acceder a estas métricas'
        });
        return;
      }

      const dashboard = await dashboardService.generarDashboardEjecutivo(operador);

      res.json({
        success: true,
        data: {
          metricas: dashboard.metricas,
          salud_operacional: dashboard.salud_operacional,
          fecha: dashboard.fecha
        }
      });
    } catch (error) {
      logger.error(`Error en getMetricas: ${error}`);
      res.status(500).json({
        error: 'Error obteniendo métricas'
      });
    }
  }

  /**
   * GET /api/dashboard/lineas/:operador
   * Obtiene estado de todas las líneas
   */
  async getLineas(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { operador } = req.params;

      // Validar acceso
      if (req.user! && req.user?.role !== 'SuperAdmin') {
        res.status(403).json({
          error: 'No tienes permiso para acceder a estas líneas'
        });
        return;
      }

      const dashboard = await dashboardService.generarDashboardEjecutivo(operador);

      res.json({
        success: true,
        data: {
          lineas: dashboard.lineas,
          total: dashboard.lineas.length,
          operativas: dashboard.lineas.filter(l => l.estado === 'operativa').length,
          en_riesgo: dashboard.lineas.filter(l => l.estado === 'riesgo').length,
          marginales: dashboard.lineas.filter(l => l.estado === 'marginal').length,
          criticas: dashboard.lineas.filter(l => l.estado === 'critica').length
        }
      });
    } catch (error) {
      logger.error(`Error en getLineas: ${error}`);
      res.status(500).json({
        error: 'Error obteniendo estado de líneas'
      });
    }
  }

  /**
   * GET /api/dashboard/alertas/:operador
   * Obtiene alertas críticas
   */
  async getAlertas(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { operador } = req.params;

      // Validar acceso
      if (req.user! && req.user?.role !== 'SuperAdmin') {
        res.status(403).json({
          error: 'No tienes permiso para acceder a estas alertas'
        });
        return;
      }

      const dashboard = await dashboardService.generarDashboardEjecutivo(operador);

      res.json({
        success: true,
        data: {
          alertas_criticas: dashboard.alertas_criticas,
          total_alertas: dashboard.alertas_criticas.length,
          alertas_por_linea: dashboard.lineas
            .filter(l => l.alertas && l.alertas.length > 0)
            .map(l => ({
              numeroLinea: l.numeroLinea,
              alertas: l.alertas
            }))
        }
      });
    } catch (error) {
      logger.error(`Error en getAlertas: ${error}`);
      res.status(500).json({
        error: 'Error obteniendo alertas'
      });
    }
  }

  /**
   * GET /api/dashboard/recomendaciones/:operador
   * Obtiene recomendaciones ejecutivas
   */
  async getRecomendaciones(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { operador } = req.params;

      // Validar acceso
      if (req.user! && req.user?.role !== 'SuperAdmin') {
        res.status(403).json({
          error: 'No tienes permiso para acceder a estas recomendaciones'
        });
        return;
      }

      const dashboard = await dashboardService.generarDashboardEjecutivo(operador);

      // Ordenar por urgencia y impacto
      const recomendacionesOrdenadas = dashboard.recomendaciones.sort((a, b) => {
        const urgenciaScore = { alta: 3, media: 2, baja: 1 };
        const scoreA = urgenciaScore[a.urgencia as keyof typeof urgenciaScore] * a.impacto;
        const scoreB = urgenciaScore[b.urgencia as keyof typeof urgenciaScore] * b.impacto;
        return scoreB - scoreA;
      });

      res.json({
        success: true,
        data: {
          recomendaciones: recomendacionesOrdenadas,
          total: recomendacionesOrdenadas.length,
          impacto_total: recomendacionesOrdenadas.reduce((sum, r) => sum + r.impacto, 0)
        }
      });
    } catch (error) {
      logger.error(`Error en getRecomendaciones: ${error}`);
      res.status(500).json({
        error: 'Error obteniendo recomendaciones'
      });
    }
  }

  /**
   * GET /api/dashboard/salud/:operador
   * Obtiene estado de salud operacional
   */
  async getSalud(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { operador } = req.params;

      // Validar acceso
      if (req.user! && req.user?.role !== 'SuperAdmin') {
        res.status(403).json({
          error: 'No tienes permiso para acceder a este estado'
        });
        return;
      }

      const dashboard = await dashboardService.generarDashboardEjecutivo(operador);

      res.json({
        success: true,
        data: dashboard.salud_operacional
      });
    } catch (error) {
      logger.error(`Error en getSalud: ${error}`);
      res.status(500).json({
        error: 'Error obteniendo estado de salud'
      });
    }
  }

  /**
   * GET /api/dashboard/proyecciones/:operador
   * Obtiene proyecciones de ingresos
   */
  async getProyecciones(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { operador } = req.params;

      // Validar acceso
      if (req.user! && req.user?.role !== 'SuperAdmin') {
        res.status(403).json({
          error: 'No tienes permiso para acceder a estas proyecciones'
        });
        return;
      }

      const dashboard = await dashboardService.generarDashboardEjecutivo(operador);

      res.json({
        success: true,
        data: {
          proyecciones: dashboard.proyecciones,
          ingresos_promedio: Math.round(
            dashboard.proyecciones.reduce((sum, p) => sum + p.ingresosProyectados, 0) /
            dashboard.proyecciones.length
          ),
          crecimiento_promedio: (
            dashboard.proyecciones.reduce((sum, p) => sum + p.cambioEsperado, 0) /
            dashboard.proyecciones.length
          ).toFixed(1)
        }
      });
    } catch (error) {
      logger.error(`Error en getProyecciones: ${error}`);
      res.status(500).json({
        error: 'Error obteniendo proyecciones'
      });
    }
  }

  /**
   * GET /api/dashboard/resumen/:operador
   * Obtiene resumen ejecutivo en texto
   */
  async getResumen(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { operador } = req.params;

      // Validar acceso
      if (req.user! && req.user?.role !== 'SuperAdmin') {
        res.status(403).json({
          error: 'No tienes permiso para acceder a este resumen'
        });
        return;
      }

      const dashboard = await dashboardService.generarDashboardEjecutivo(operador);

      res.json({
        success: true,
        data: {
          resumen_ejecutivo: dashboard.resumen_texto,
          fecha_generacion: dashboard.fecha,
          operador: dashboard.operador
        }
      });
    } catch (error) {
      logger.error(`Error en getResumen: ${error}`);
      res.status(500).json({
        error: 'Error obteniendo resumen ejecutivo'
      });
    }
  }
}

export const dashboardController = new DashboardController();
