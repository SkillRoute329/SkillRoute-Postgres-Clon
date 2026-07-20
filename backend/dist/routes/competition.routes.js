"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const competitionController_1 = require("../controllers/competitionController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
/**
 * Obtiene la matriz de fricción de forma dinámica bajo demanda, usando JOINs
 * relacionales estrictos sobre la red de GTFS con soporte para dirección.
 * GET /api/competition/solapamiento
 */
router.get('/solapamiento', auth_1.requireAuth, competitionController_1.competitionController.getSolapamientoDinamico);
/**
 * Hook de Adelanto Táctico (Webhook).
 * Gatillado externamente por un CRON cuando detecta alteraciones
 * en la matriz de catálogos oficiales IMM. Reanaliza fricción en background.
 * POST /api/competition/webhook-mutacion
 */
router.post('/webhook-mutacion', competitionController_1.competitionController.triggerReanalisisMutacion);
exports.default = router;
