import { Response } from 'express';
import { AuthRequest } from '../types/index';
import { competitionService } from '../services/competitionService';
import {
  ingestCompetitorsFromSTM,
  enrichCompetidorWithSchedules,
} from '../services/competitorsIngestionService';
import { TipoDia } from '../services/stmHorariosScraperService';
import { logger } from '../config/logger';
import { Competidor } from '../types/competition';

// Controlador de competencia - Semana 4

export const competitionController = {
  /**
   * GET /api/competition/overlap/:lineaId
   * Obtiene análisis de sobreposición para una línea
   */
  async getOverlapAnalysis(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { lineaId } = req.params;

      if (!lineaId) {
        res.status(400).json({ error: 'lineaId requerido' });
        return;
      }

      const sobreposiciones = await competitionService.analizarSobreposicion(lineaId);

      res.json({
        success: true,
        data: {
          lineaId,
          sobreposiciones,
          totalConflictos: sobreposiciones.reduce(
            (sum, s) => sum + s.conflictosHorarios.length,
            0
          ),
          pasajerosEnRiesgoTotal: sobreposiciones.reduce(
            (sum, s) => sum + s.pasajerosEnRiesgo,
            0
          )
        }
      });
    } catch (error) {
      logger.error(`Error en getOverlapAnalysis: ${error}`);
      res.status(500).json({ error: 'Error analizando sobreposición' });
    }
  },

  /**
   * GET /api/competition/conflicts/:lineaId
   * Obtiene conflictos de horarios para una línea
   */
  async getConflicts(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { lineaId } = req.params;

      if (!lineaId) {
        res.status(400).json({ error: 'lineaId requerido' });
        return;
      }

      const analisis = await competitionService.analizarCompetitividad(lineaId);

      res.json({
        success: true,
        data: {
          lineaId,
          numeroLinea: analisis.numeroLinea,
          conflictosActivos: analisis.conflictosActivos.sort(
            (a, b) => b.prioridad.localeCompare(a.prioridad)
          ),
          conflictoPorPrioridad: {
            critica: analisis.conflictosActivos.filter(c => c.prioridad === 'critica').length,
            alta: analisis.conflictosActivos.filter(c => c.prioridad === 'alta').length,
            media: analisis.conflictosActivos.filter(c => c.prioridad === 'media').length,
            baja: analisis.conflictosActivos.filter(c => c.prioridad === 'baja').length
          }
        }
      });
    } catch (error) {
      logger.error(`Error en getConflicts: ${error}`);
      res.status(500).json({ error: 'Error obteniendo conflictos' });
    }
  },

  /**
   * POST /api/competition/ingress
   * Ingresa horarios de competencia manualmente
   */
  async ingressCompetitorData(req: AuthRequest, res: Response): Promise<void> {
    try {
      const competidorData = req.body as Competidor;

      if (!competidorData.nombre || !competidorData.lineas) {
        res.status(400).json({ error: 'Datos de competidor incompletos' });
        return;
      }

      await competitionService.ingresarCompetidor(competidorData);

      res.json({
        success: true,
        message: `Competidor ${competidorData.nombre} ingresado exitosamente`,
        data: competidorData
      });
    } catch (error) {
      logger.error(`Error en ingressCompetitorData: ${error}`);
      res.status(500).json({ error: 'Error ingresando datos de competencia' });
    }
  },

  /**
   * GET /api/competition/analysis/:lineaId
   * Análisis completo de competitividad para una línea
   */
  async getCompetitivityAnalysis(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { lineaId } = req.params;

      if (!lineaId) {
        res.status(400).json({ error: 'lineaId requerido' });
        return;
      }

      const analisis = await competitionService.analizarCompetitividad(lineaId);

      res.json({
        success: true,
        data: analisis
      });
    } catch (error) {
      logger.error(`Error en getCompetitivityAnalysis: ${error}`);
      res.status(500).json({ error: 'Error analizando competitividad' });
    }
  },

  /**
   * GET /api/competition/report
   * Reporte completo de competencia
   */
  async getCompetitionReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const operador = (req.query.operador as string) || 'UCOT';
      const dias = (req.query.dias as string) || '30';

      const fechaFin = new Date();
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - parseInt(dias));

      const reporte = await competitionService.generarReporteCompetencia(
        operador,
        fechaInicio,
        fechaFin
      );

      res.json({
        success: true,
        data: reporte
      });
    } catch (error) {
      logger.error(`Error en getCompetitionReport: ${error}`);
      res.status(500).json({ error: 'Error generando reporte' });
    }
  },

  /**
   * GET /api/competition/threats
   * Obtiene amenazas principales (líneas más en riesgo)
   */
  async getMainThreats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const operador = (req.query.operador as string) || 'UCOT';

      const reporte = await competitionService.generarReporteCompetencia(
        operador,
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        new Date()
      );

      const amenazas = reporte.sobreposicionesTop
        .filter(s => s.nivelesRiesgo === 'critico' || s.nivelesRiesgo === 'alto')
        .map(s => ({
          lineaUCOT: s.numeroLineaUCOT,
          competidor: s.competidor,
          sobreposicion: s.porcentajeSobreposicion,
          pasajerosEnRiesgo: s.pasajerosEnRiesgo,
          riesgo: s.nivelesRiesgo,
          conflictosActivos: s.conflictosHorarios.length
        }));

      res.json({
        success: true,
        data: {
          totalAmenazas: amenazas.length,
          amenazas: amenazas.slice(0, 5)
        }
      });
    } catch (error) {
      logger.error(`Error en getMainThreats: ${error}`);
      res.status(500).json({ error: 'Error obteniendo amenazas' });
    }
  },

  /**
   * GET /api/competition/recommendations/:lineaId
   * Obtiene recomendaciones para una línea específica
   */
  async getRecommendations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { lineaId } = req.params;

      if (!lineaId) {
        res.status(400).json({ error: 'lineaId requerido' });
        return;
      }

      const analisis = await competitionService.analizarCompetitividad(lineaId);

      res.json({
        success: true,
        data: {
          lineaId,
          numeroLinea: analisis.numeroLinea,
          recomendacionesUrgentes: analisis.recomendaciones.filter(r => r.riesgo === 'alto'),
          recomendacionesGenerales: analisis.recomendaciones,
          totalRecomendaciones: analisis.recomendaciones.length
        }
      });
    } catch (error) {
      logger.error(`Error en getRecommendations: ${error}`);
      res.status(500).json({ error: 'Error obteniendo recomendaciones' });
    }
  },

  /**
   * POST /api/competition/sync-from-stm
   * Toma snapshot GPS en vivo del endpoint público IMM y materializa
   * la colección `competidores` con datos reales de COETC, COME, CUTCSA.
   * Solo admin.
   */
  async syncFromSTM(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await ingestCompetitorsFromSTM();
      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error(`Error en syncFromSTM: ${error?.message || error}`);
      res.status(502).json({
        success: false,
        error: 'No se pudo sincronizar desde STM',
        detail: error?.message || String(error),
      });
    }
  },

  /**
   * POST /api/competition/enrich-horarios/:competidorId
   * Enriquece las líneas de un competidor con horarios reales scrapeados
   * de stm/horarios. Body opcional:
   *   { tiposDia?: TipoDia[], pauseMs?: number, maxLineas?: number }
   * Solo admin (operación pesada — varios minutos por competidor grande).
   */
  async enrichCompetidorHorarios(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { competidorId } = req.params;
      if (!competidorId) {
        res.status(400).json({ success: false, error: 'competidorId requerido' });
        return;
      }

      const body = (req.body ?? {}) as {
        tiposDia?: TipoDia[];
        pauseMs?: number;
        maxLineas?: number;
      };

      const validDias: TipoDia[] = ['Ahora', 'Hábiles', 'Sábados', 'Domingos'];
      const tiposDia = body.tiposDia?.filter((t) => validDias.includes(t));

      const result = await enrichCompetidorWithSchedules(competidorId, {
        ...(tiposDia && tiposDia.length > 0 ? { tiposDia } : {}),
        ...(body.pauseMs !== undefined ? { pauseMs: body.pauseMs } : {}),
        ...(body.maxLineas !== undefined ? { maxLineas: body.maxLineas } : {}),
      });
      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error(
        `Error en enrichCompetidorHorarios: ${error?.message || error}`
      );
      res.status(502).json({
        success: false,
        error: 'No se pudo enriquecer competidor con horarios',
        detail: error?.message || String(error),
      });
    }
  },
};
