import { AuthRequest } from '../types/index';
import { Request, Response } from 'express';
import { stmService } from '../services/stmService';
import { logger } from '../config/logger';

/**
 * Controlador STM - Semana 10-11
 * Endpoints para integración con datos públicos STM y máquinas 5G
 */

class STMController {
  /**
   * GET /api/stm/lineas
   * Obtiene todas las líneas del STM (datos públicos)
   */
  async getLineas(req: AuthRequest, res: Response): Promise<void> {
    try {
      const lineas = await stmService.obtenerLineasSTM();

      res.json({
        success: true,
        data: {
          total: lineas.length,
          lineas
        }
      });
    } catch (error) {
      logger.error(`Error obteniendo líneas STM: ${error}`);
      res.status(500).json({
        error: 'Error obteniendo líneas del STM'
      });
    }
  }

  /**
   * GET /api/stm/horarios/:numeroLinea
   * Obtiene horarios vigentes de una línea específica
   */
  async getHorarios(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { numeroLinea } = req.params;

      const horarios = await stmService.obtenerHorariosLinea(parseInt(numeroLinea));

      res.json({
        success: true,
        data: horarios
      });
    } catch (error) {
      logger.error(`Error obteniendo horarios: ${error}`);
      res.status(500).json({
        error: 'Error obteniendo horarios del STM'
      });
    }
  }

  /**
   * POST /api/stm/sincronizar
   * Sincroniza horarios y datos del STM (admin only)
   */
  async sincronizarHorarios(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Validar que sea admin
      if (req.user?.role !== 'Admin' && req.user?.role !== 'SuperAdmin') {
        res.status(403).json({
          error: 'Solo administradores pueden sincronizar datos STM'
        });
        return;
      }

      const resultado = await stmService.sincronizarHorarios();

      res.json({
        success: true,
        data: {
          id: resultado.id,
          estado: resultado.estado,
          registros_procesados: resultado.registros_procesados,
          registros_con_error: resultado.registros_con_error,
          cambios_detectados: resultado.cambios_detectados,
          fecha_inicio: resultado.fecha_inicio,
          fecha_fin: resultado.fecha_fin
        }
      });
    } catch (error) {
      logger.error(`Error sincronizando horarios: ${error}`);
      res.status(500).json({
        error: 'Error durante la sincronización'
      });
    }
  }

  /**
   * GET /api/stm/cambios/:numeroLinea
   * Detecta cambios de horarios en una línea
   */
  async detectarCambios(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { numeroLinea } = req.params;

      const cambios = await stmService.detectarCambiosHorarios(parseInt(numeroLinea));

      res.json({
        success: true,
        data: {
          linea_numero: numeroLinea,
          cambios_detectados: cambios.length,
          cambios,
          requiere_accion: cambios.some(c => c.severidad === 'alta' || c.severidad === 'media')
        }
      });
    } catch (error) {
      logger.error(`Error detectando cambios: ${error}`);
      res.status(500).json({
        error: 'Error detectando cambios de horarios'
      });
    }
  }

  /**
   * POST /api/stm/boletaje-5g
   * Registra transacciones de máquinas 5G
   */
  async registrarBoletaje5G(req: AuthRequest, res: Response): Promise<void> {
    try {
      const datos = req.body;

      // Validar campos requeridos
      if (!datos.maquina_id || !datos.bus_id || !datos.operador || !datos.linea_numero) {
        res.status(400).json({
          error: 'Campos requeridos: maquina_id, bus_id, operador, linea_numero'
        });
        return;
      }

      await stmService.registrarBoletaje5G(datos);

      res.json({
        success: true,
        message: 'Boletaje registrado exitosamente'
      });
    } catch (error) {
      logger.error(`Error registrando boletaje 5G: ${error}`);
      res.status(500).json({
        error: 'Error registrando boletaje'
      });
    }
  }

  /**
   * POST /api/stm/ocupacion-realtime
   * Actualiza conteo de pasajeros desde sensores 5G
   */
  async actualizarOcupacion(req: AuthRequest, res: Response): Promise<void> {
    try {
      const datos = req.body;

      if (!datos.bus_id || !datos.maquina_id || typeof datos.ocupacion_porcentaje !== 'number') {
        res.status(400).json({
          error: 'Campos requeridos: bus_id, maquina_id, ocupacion_porcentaje'
        });
        return;
      }

      await stmService.actualizarConteoPassajeros(datos);

      res.json({
        success: true,
        message: 'Ocupación actualizada'
      });
    } catch (error) {
      logger.error(`Error actualizando ocupación: ${error}`);
      res.status(500).json({
        error: 'Error actualizando ocupación'
      });
    }
  }

  /**
   * GET /api/stm/bus-en-vivo/:busId
   * Obtiene datos en vivo de un bus
   */
  async obtenerBusEnVivo(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { busId } = req.params;

      const datos = await stmService.obtenerDatosEnVivoBus(busId);

      if (!datos) {
        res.status(404).json({
          error: 'Bus no encontrado o sin datos en vivo'
        });
        return;
      }

      res.json({
        success: true,
        data: datos
      });
    } catch (error) {
      logger.error(`Error obteniendo datos en vivo: ${error}`);
      res.status(500).json({
        error: 'Error obteniendo datos en vivo'
      });
    }
  }

  /**
   * GET /api/stm/estadisticas/:busId/:fecha
   * Obtiene estadísticas diarias de un bus
   */
  async obtenerEstadisticas(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { busId, fecha } = req.params;

      const stats = await stmService.obtenerEstadisticasDiasBus(busId, new Date(fecha));

      if (!stats) {
        res.status(404).json({
          error: 'Estadísticas no encontradas para este bus en esa fecha'
        });
        return;
      }

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error(`Error obteniendo estadísticas: ${error}`);
      res.status(500).json({
        error: 'Error obteniendo estadísticas'
      });
    }
  }

  /**
   * GET /api/stm/calidad-datos
   * Calcula la calidad general de datos STM
   */
  async obtenerCalidadDatos(req: AuthRequest, res: Response): Promise<void> {
    try {
      const calidad = await stmService.calcularCalidadDatos();

      res.json({
        success: true,
        data: {
          fecha_reporte: calidad.fecha_reporte,
          calidad_general: calidad.calidad_general,
          porcentaje_sincronizacion: calidad.porcentaje_sincronizacion.toFixed(2),
          maquinas_activas: calidad.maquinas_activas,
          maquinas_sincronizadas: calidad.maquinas_sincronizadas,
          transacciones_diarias: calidad.transacciones_diarias,
          disponibilidad_api_porcentaje: calidad.disponibilidad_api_porcentaje,
          latencia_promedio_ms: calidad.latencia_promedio_ms
        }
      });
    } catch (error) {
      logger.error(`Error calculando calidad: ${error}`);
      res.status(500).json({
        error: 'Error calculando calidad de datos'
      });
    }
  }
}

export const stmController = new STMController();
