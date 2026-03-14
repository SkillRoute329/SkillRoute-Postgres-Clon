"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.competitionController = void 0;
const competitionService_1 = require("../services/competitionService");
const logger_1 = require("../config/logger");
// Controlador de competencia - Semana 4
exports.competitionController = {
    /**
     * GET /api/competition/overlap/:lineaId
     * Obtiene análisis de sobreposición para una línea
     */
    async getOverlapAnalysis(req, res) {
        try {
            const { lineaId } = req.params;
            if (!lineaId) {
                res.status(400).json({ error: 'lineaId requerido' });
                return;
            }
            const sobreposiciones = await competitionService_1.competitionService.analizarSobreposicion(lineaId);
            res.json({
                success: true,
                data: {
                    lineaId,
                    sobreposiciones,
                    totalConflictos: sobreposiciones.reduce((sum, s) => sum + s.conflictosHorarios.length, 0),
                    pasajerosEnRiesgoTotal: sobreposiciones.reduce((sum, s) => sum + s.pasajerosEnRiesgo, 0)
                }
            });
        }
        catch (error) {
            logger_1.logger.error(`Error en getOverlapAnalysis: ${error}`);
            res.status(500).json({ error: 'Error analizando sobreposición' });
        }
    },
    /**
     * GET /api/competition/conflicts/:lineaId
     * Obtiene conflictos de horarios para una línea
     */
    async getConflicts(req, res) {
        try {
            const { lineaId } = req.params;
            if (!lineaId) {
                res.status(400).json({ error: 'lineaId requerido' });
                return;
            }
            const analisis = await competitionService_1.competitionService.analizarCompetitividad(lineaId);
            res.json({
                success: true,
                data: {
                    lineaId,
                    numeroLinea: analisis.numeroLinea,
                    conflictosActivos: analisis.conflictosActivos.sort((a, b) => b.prioridad.localeCompare(a.prioridad)),
                    conflictoPorPrioridad: {
                        critica: analisis.conflictosActivos.filter(c => c.prioridad === 'critica').length,
                        alta: analisis.conflictosActivos.filter(c => c.prioridad === 'alta').length,
                        media: analisis.conflictosActivos.filter(c => c.prioridad === 'media').length,
                        baja: analisis.conflictosActivos.filter(c => c.prioridad === 'baja').length
                    }
                }
            });
        }
        catch (error) {
            logger_1.logger.error(`Error en getConflicts: ${error}`);
            res.status(500).json({ error: 'Error obteniendo conflictos' });
        }
    },
    /**
     * POST /api/competition/ingress
     * Ingresa horarios de competencia manualmente
     */
    async ingressCompetitorData(req, res) {
        try {
            const competidorData = req.body;
            if (!competidorData.nombre || !competidorData.lineas) {
                res.status(400).json({ error: 'Datos de competidor incompletos' });
                return;
            }
            await competitionService_1.competitionService.ingresarCompetidor(competidorData);
            res.json({
                success: true,
                message: `Competidor ${competidorData.nombre} ingresado exitosamente`,
                data: competidorData
            });
        }
        catch (error) {
            logger_1.logger.error(`Error en ingressCompetitorData: ${error}`);
            res.status(500).json({ error: 'Error ingresando datos de competencia' });
        }
    },
    /**
     * GET /api/competition/analysis/:lineaId
     * Análisis completo de competitividad para una línea
     */
    async getCompetitivityAnalysis(req, res) {
        try {
            const { lineaId } = req.params;
            if (!lineaId) {
                res.status(400).json({ error: 'lineaId requerido' });
                return;
            }
            const analisis = await competitionService_1.competitionService.analizarCompetitividad(lineaId);
            res.json({
                success: true,
                data: analisis
            });
        }
        catch (error) {
            logger_1.logger.error(`Error en getCompetitivityAnalysis: ${error}`);
            res.status(500).json({ error: 'Error analizando competitividad' });
        }
    },
    /**
     * GET /api/competition/report
     * Reporte completo de competencia
     */
    async getCompetitionReport(req, res) {
        try {
            const operador = req.query.operador || 'UCOT';
            const dias = req.query.dias || '30';
            const fechaFin = new Date();
            const fechaInicio = new Date();
            fechaInicio.setDate(fechaInicio.getDate() - parseInt(dias));
            const reporte = await competitionService_1.competitionService.generarReporteCompetencia(operador, fechaInicio, fechaFin);
            res.json({
                success: true,
                data: reporte
            });
        }
        catch (error) {
            logger_1.logger.error(`Error en getCompetitionReport: ${error}`);
            res.status(500).json({ error: 'Error generando reporte' });
        }
    },
    /**
     * GET /api/competition/threats
     * Obtiene amenazas principales (líneas más en riesgo)
     */
    async getMainThreats(req, res) {
        try {
            const operador = req.query.operador || 'UCOT';
            const reporte = await competitionService_1.competitionService.generarReporteCompetencia(operador, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), new Date());
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
        }
        catch (error) {
            logger_1.logger.error(`Error en getMainThreats: ${error}`);
            res.status(500).json({ error: 'Error obteniendo amenazas' });
        }
    },
    /**
     * GET /api/competition/recommendations/:lineaId
     * Obtiene recomendaciones para una línea específica
     */
    async getRecommendations(req, res) {
        try {
            const { lineaId } = req.params;
            if (!lineaId) {
                res.status(400).json({ error: 'lineaId requerido' });
                return;
            }
            const analisis = await competitionService_1.competitionService.analizarCompetitividad(lineaId);
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
        }
        catch (error) {
            logger_1.logger.error(`Error en getRecommendations: ${error}`);
            res.status(500).json({ error: 'Error obteniendo recomendaciones' });
        }
    }
};
