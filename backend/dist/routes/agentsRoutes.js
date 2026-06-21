"use strict";
/**
 * agentsRoutes.ts
 * Rutas REST para gestión de agentes y generación de alertas
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
/**
 * Middleware: obtener orquestador maestro desde app.locals
 */
const getMasterOrchestrator = (req, res, next) => {
    req.orchestrator = req.app.locals?.masterOrchestrator;
    if (!req.orchestrator) {
        return res.status(500).json({ error: 'MasterOrchestrator no inicializado' });
    }
    next();
};
// Aplicar middleware a todas las rutas
router.use(getMasterOrchestrator);
/**
 * GET /api/agents/status
 * Estado general de todos los ecosistemas
 */
router.get('/status', (req, res) => {
    const ecosystems = req.orchestrator?.getAllEcosystems();
    res.json({
        timestamp: new Date().toISOString(),
        total_lines: ecosystems?.length || 0,
        ecosystems: ecosystems || []
    });
});
/**
 * GET /api/agents/line/:lineId/status
 * Estado de un ecosistema específico
 */
router.get('/line/:lineId/status', (req, res) => {
    const lineId = parseInt(req.params.lineId);
    const ecosystem = req.orchestrator?.getLineEcosystem(lineId);
    if (!ecosystem) {
        return res.status(404).json({ error: `Línea ${lineId} no encontrada` });
    }
    res.json({
        lineId: lineId,
        lineNombre: ecosystem.lineNombre,
        status: ecosystem.status,
        totalAgents: ecosystem.totalAgents,
        agents: {
            orchestrator: ecosystem.orchestrator.id,
            ownAnalyzers: ecosystem.ownAgents.map((a) => ({
                id: a.id,
                destination: a.destinationNombre,
                sentido: a.sentido
            })),
            competitorMonitors: ecosystem.competitorAgents.map((a) => ({
                id: a.id,
                competitor: a.competitorNombre,
                empresa: a.competitorEmpresa
            }))
        }
    });
});
/**
 * POST /api/agents/line/:lineId/alert
 * Generar alerta para una línea
 * Body: { tipo, recorrido, sentido, tiempo_minutos?, mensaje, acciones }
 */
router.post('/line/:lineId/alert', async (req, res) => {
    try {
        const lineId = parseInt(req.params.lineId);
        const alertData = req.body;
        // Validar campo requerido
        if (!alertData.tipo || !alertData.recorrido || !alertData.sentido) {
            return res.status(400).json({
                error: 'Campos requeridos: tipo, recorrido, sentido'
            });
        }
        const alert = await req.orchestrator?.requestAlert(lineId, alertData);
        if (alert?.error) {
            return res.status(404).json(alert);
        }
        res.json(alert);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * POST /api/agents/line/:lineId/alert/analysis
 * Alerta desde análisis de línea propia
 * Body: { destinationId, tiempo_desviacion, frecuencia_real, frecuencia_teorica, ... }
 */
router.post('/line/:lineId/alert/analysis', async (req, res) => {
    try {
        const lineId = parseInt(req.params.lineId);
        const analysisData = req.body;
        const alert = await req.orchestrator?.alertFromOwnAnalysis(lineId, analysisData);
        if (alert?.error) {
            return res.status(404).json(alert);
        }
        res.json(alert);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * POST /api/agents/line/:lineId/alert/competitor
 * Alerta desde detección de competidor
 * Body: { competitorId, tipo_evento, recorrido, sentido, tiempo_ventaja?, unidades_detectadas?, ... }
 */
router.post('/line/:lineId/alert/competitor', async (req, res) => {
    try {
        const lineId = parseInt(req.params.lineId);
        const competitorData = req.body;
        if (!competitorData.competitorId) {
            return res.status(400).json({
                error: 'Campo requerido: competitorId'
            });
        }
        const alert = await req.orchestrator?.alertFromCompetitor(lineId, competitorData);
        if (alert?.error) {
            return res.status(404).json(alert);
        }
        res.json(alert);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/agents/alerts/history
 * Historial de alertas con filtros opcionales
 * Query params: ?lineId=300&tipo=ALERTA_RETRASO&sentido=ida&horaInicio=2026-04-06T10:00:00Z
 */
router.get('/alerts/history', (req, res) => {
    const filters = {};
    if (req.query.lineId)
        filters.lineId = parseInt(req.query.lineId);
    if (req.query.tipo)
        filters.tipo = req.query.tipo;
    if (req.query.sentido)
        filters.sentido = req.query.sentido;
    if (req.query.horaInicio)
        filters.horaInicio = req.query.horaInicio;
    const history = req.orchestrator?.getAlertHistory(filters);
    res.json({
        total: history?.length || 0,
        alerts: history || []
    });
});
/**
 * GET /api/agents/alerts/statistics
 * Estadísticas de alertas por línea y tipo
 */
router.get('/alerts/statistics', (req, res) => {
    const stats = req.orchestrator?.getAlertStatistics();
    res.json({
        timestamp: new Date().toISOString(),
        statistics: stats || {}
    });
});
/**
 * DELETE /api/agents/alerts/history (debug only)
 * Limpia historial de alertas
 */
router.delete('/alerts/history', (req, res) => {
    req.orchestrator?.clearAlertHistory();
    res.json({ success: true, message: 'Historial de alertas limpiado' });
});
/**
 * GET /api/agents/line/:lineId/orchestrator
 * Detalles completos del orquestador de una línea
 */
router.get('/line/:lineId/orchestrator', (req, res) => {
    const lineId = parseInt(req.params.lineId);
    const ecosystem = req.orchestrator?.getLineEcosystem(lineId);
    if (!ecosystem) {
        return res.status(404).json({ error: `Línea ${lineId} no encontrada` });
    }
    res.json({
        orchestrator: ecosystem.orchestrator,
        linkedAgents: (ecosystem.ownAgents?.length || 0) + (ecosystem.competitorAgents?.length || 0)
    });
});
/**
 * GET /api/agents/line/:lineId/analyzers
 * Lista de analizadores de línea propia
 */
router.get('/line/:lineId/analyzers', (req, res) => {
    const lineId = parseInt(req.params.lineId);
    const ecosystem = req.orchestrator?.getLineEcosystem(lineId);
    if (!ecosystem) {
        return res.status(404).json({ error: `Línea ${lineId} no encontrada` });
    }
    res.json({
        lineId: lineId,
        totalAnalyzers: ecosystem.ownAgents?.length || 0,
        analyzers: ecosystem.ownAgents || []
    });
});
/**
 * GET /api/agents/line/:lineId/competitors
 * Lista de monitores de competencia
 */
router.get('/line/:lineId/competitors', (req, res) => {
    const lineId = parseInt(req.params.lineId);
    const ecosystem = req.orchestrator?.getLineEcosystem(lineId);
    if (!ecosystem) {
        return res.status(404).json({ error: `Línea ${lineId} no encontrada` });
    }
    res.json({
        lineId: lineId,
        totalMonitors: ecosystem.competitorAgents?.length || 0,
        monitors: ecosystem.competitorAgents || []
    });
});
exports.default = router;
