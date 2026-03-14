"use strict";
/**
 * Rutas de Analytics - Semana 5
 * Validador de viabilidad de cartones y análisis de datos
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
// Placeholder routes - Las funcionalidades están en competitionService y dashboardService
router.get('/health', (req, res) => {
    res.json({ status: 'analytics service ok' });
});
exports.default = router;
