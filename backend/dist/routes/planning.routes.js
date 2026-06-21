"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const planningService_1 = require("../services/planningService");
const logger_1 = require("../config/logger");
const router = (0, express_1.Router)();
// Todas las rutas requieren autenticación
router.use(auth_1.requireAuth);
/**
 * GET /api/planning/demographics
 * Retorna los barrios oficiales con polígonos y datos del censo
 */
router.get('/demographics', async (req, res) => {
    try {
        res.json({
            success: true,
            count: planningService_1.MONTEVIDEO_BARRIOS.length,
            data: planningService_1.MONTEVIDEO_BARRIOS
        });
    }
    catch (err) {
        logger_1.logger.error(`[Planning Route] Error fetching demographics: ${err.message}`);
        res.status(500).json({ success: false, error: 'Error fetching demographic data' });
    }
});
/**
 * POST /api/planning/equity-analysis
 * Calcula las métricas de equidad territorial Latam
 */
router.post('/equity-analysis', async (req, res) => {
    try {
        const { points, paradas, frecuenciaDiaria } = req.body;
        if (!points || !paradas || typeof frecuenciaDiaria !== 'number') {
            return res.status(400).json({ success: false, error: 'Faltan parámetros points, paradas o frecuenciaDiaria' });
        }
        const analysis = planningService_1.planningService.analyzeEquity(points, paradas, frecuenciaDiaria);
        res.json({ success: true, data: analysis });
    }
    catch (err) {
        logger_1.logger.error(`[Planning Route] Error calculating equity: ${err.message}`);
        res.status(500).json({ success: false, error: 'Error calculating equity metrics' });
    }
});
/**
 * POST /api/planning/financial-impact
 * Calcula los costos, ingresos y ROI neta de la línea simulada
 */
router.post('/financial-impact', async (req, res) => {
    try {
        const { points, paradas, frecuenciaDiaria, costoKmOperativo, tarifaUrbana } = req.body;
        if (!points || !paradas || typeof frecuenciaDiaria !== 'number') {
            return res.status(400).json({ success: false, error: 'Faltan parámetros points, paradas o frecuenciaDiaria' });
        }
        const impact = planningService_1.planningService.calculateFinancialImpact(points, paradas, frecuenciaDiaria, costoKmOperativo, tarifaUrbana);
        res.json({ success: true, data: impact });
    }
    catch (err) {
        logger_1.logger.error(`[Planning Route] Error calculating financial impact: ${err.message}`);
        res.status(500).json({ success: false, error: 'Error simulating financial impact' });
    }
});
/**
 * POST /api/planning/export-gtfs
 * Genera el paquete de archivos CSV para simular GTFS
 */
router.post('/export-gtfs', async (req, res) => {
    try {
        const { lineaCodigo, lineaNombre, points, paradas } = req.body;
        if (!lineaCodigo || !points || !paradas) {
            return res.status(400).json({ success: false, error: 'Faltan parámetros de diseño de red' });
        }
        const agencyId = '70'; // UCOT
        const routeId = `route_${lineaCodigo.toLowerCase()}`;
        const shapeId = `shape_${lineaCodigo.toLowerCase()}`;
        // 1. stops.txt
        let stopsCsv = 'stop_id,stop_name,stop_lat,stop_lon,stop_code\n';
        paradas.forEach((p) => {
            stopsCsv += `"${p.id}","${p.nombre}",${p.lat},${p.lng},"${p.id}"\n`;
        });
        // 2. routes.txt
        let routesCsv = 'route_id,agency_id,route_short_name,route_long_name,route_type\n';
        routesCsv += `"${routeId}","${agencyId}","${lineaCodigo}","${lineaNombre}",3\n`; // 3 = bus
        // 3. shapes.txt
        let shapesCsv = 'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n';
        points.forEach((pt, idx) => {
            shapesCsv += `"${shapeId}",${pt.lat},${pt.lng},${idx + 1}\n`;
        });
        res.json({
            success: true,
            data: {
                stops: stopsCsv,
                routes: routesCsv,
                shapes: shapesCsv,
                metadata: {
                    lineaCodigo,
                    routeId,
                    shapeId
                }
            }
        });
    }
    catch (err) {
        logger_1.logger.error(`[Planning Route] Error exporting GTFS: ${err.message}`);
        res.status(500).json({ success: false, error: 'Error generating GTFS files' });
    }
});
exports.default = router;
