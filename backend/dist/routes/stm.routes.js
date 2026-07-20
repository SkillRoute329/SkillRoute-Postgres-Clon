"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stmController_1 = require("../controllers/stmController");
const stmHorariosScraperService_1 = require("../services/stmHorariosScraperService");
const auth_1 = require("../middleware/auth");
const logger_1 = require("../config/logger");
const ucotIntranetService_1 = require("../services/ucotIntranetService");
const crossModuleCorrelationService_1 = require("../services/crossModuleCorrelationService");
const router = (0, express_1.Router)();
/**
 * RUTAS STM - Semana 10-11
 * Integración con datos públicos STM Uruguay y máquinas 5G
 */
// Todas requieren autenticación
router.use(auth_1.requireAuth);
const immRealtimeService_1 = __importDefault(require("../services/immRealtimeService"));
/**
 * GET /api/stm/live-buses
 * SOBERANO: Proxy directo al endpoint real de la IMM.
 * Devuelve GeoJSON de TODOS los buses en vivo cruzando Montevideo.
 */
router.get('/live-buses', async (req, res) => {
    try {
        const data = await immRealtimeService_1.default.fetchBusesLive("-1"); // "-1" = TODAS
        res.json({ success: true, data });
    }
    catch (err) {
        logger_1.logger.error(`[stm/live-buses] Error: ${err?.message}`);
        res.status(502).json({ success: false, error: 'Error recuperando telemetry IMM.' });
    }
});
/**
 * GET /api/stm/lineas
 * Obtiene todas las líneas del STM (datos públicos)
 * Disponible para todos los usuarios autenticados
 */
router.get('/lineas', (req, res) => stmController_1.stmController.getLineas(req, res));
/**
 * GET /api/stm/horarios/:numeroLinea
 * Obtiene horarios vigentes de una línea específica
 */
router.get('/horarios/:numeroLinea', (req, res) => stmController_1.stmController.getHorarios(req, res));
/**
 * POST /api/stm/sincronizar
 * Sincroniza horarios y datos del STM
 * Solo administradores pueden disparar sincronizaciones
 */
router.post('/sincronizar', (0, auth_1.requireRole)('admin'), (req, res) => stmController_1.stmController.sincronizarHorarios(req, res));
/**
 * GET /api/stm/cambios/:numeroLinea
 * Detecta cambios de horarios en una línea
 * Útil para alertas competitivas
 */
router.get('/cambios/:numeroLinea', (req, res) => stmController_1.stmController.detectarCambios(req, res));
/**
 * POST /api/stm/boletaje-5g
 * Registra transacciones de máquinas 5G dispensadoras
 * Sistema de máquinas 5G envía datos aquí
 */
router.post('/boletaje-5g', (0, auth_1.requireRole)('admin', 'system'), (req, res) => stmController_1.stmController.registrarBoletaje5G(req, res));
/**
 * POST /api/stm/ocupacion-realtime
 * Actualiza conteo de pasajeros desde sensores 5G
 * Stream de datos en tiempo real desde buses
 */
router.post('/ocupacion-realtime', (0, auth_1.requireRole)('admin', 'system'), (req, res) => stmController_1.stmController.actualizarOcupacion(req, res));
/**
 * GET /api/stm/bus-en-vivo/:busId
 * Obtiene datos en vivo de un bus
 * GPS, ubicación, pasajeros, etc.
 */
router.get('/bus-en-vivo/:busId', (req, res) => stmController_1.stmController.obtenerBusEnVivo(req, res));
/**
 * GET /api/stm/estadisticas/:busId/:fecha
 * Obtiene estadísticas diarias de un bus
 * Incluye ingresos, pasajeros, cumplimiento, ocupación
 */
router.get('/estadisticas/:busId/:fecha', (req, res) => stmController_1.stmController.obtenerEstadisticas(req, res));
/**
 * GET /api/stm/calidad-datos
 * Calcula la calidad general de datos STM
 * Monitores: % sincronización, máquinas activas, transacciones
 */
router.get('/calidad-datos', (0, auth_1.requireRole)('admin', 'manager'), (req, res) => stmController_1.stmController.obtenerCalidadDatos(req, res));
/**
 * GET /api/stm/scraper/lineas
 * Catálogo en vivo de líneas desde stm/horarios (PrimeFaces JSF).
 * Devuelve los ~140 números de línea reales, no la lista cacheada/local.
 */
router.get('/scraper/lineas', (0, auth_1.requireRole)('admin', 'manager'), async (_req, res) => {
    try {
        const catalogo = await (0, stmHorariosScraperService_1.fetchLineCatalog)();
        res.json({
            success: true,
            total: catalogo.length,
            lineas: catalogo.map((l) => l.numero),
        });
    }
    catch (err) {
        logger_1.logger.error(`[stm/scraper/lineas] ${err?.message}`);
        res.status(502).json({ success: false, error: err?.message ?? String(err) });
    }
});
/**
 * GET /api/stm/scraper/horarios/:linea
 * Scrape en vivo del horario REAL de una línea específica.
 * Query: ?tipoDia=Ahora|Hábiles|Sábados|Domingos (default: Hábiles)
 *
 * Ejemplo: GET /api/stm/scraper/horarios/300?tipoDia=Hábiles
 *   → 12 variantes (pares O→D), 223 salidas total para la 300.
 */
router.get('/scraper/horarios/:linea', (0, auth_1.requireRole)('admin', 'manager'), async (req, res) => {
    try {
        const linea = req.params.linea;
        if (!linea) {
            res.status(400).json({ success: false, error: 'Falta parámetro :linea' });
            return;
        }
        const tipoDiaQ = req.query.tipoDia ?? 'Hábiles';
        const valid = ['Ahora', 'Hábiles', 'Sábados', 'Domingos'];
        if (!valid.includes(tipoDiaQ)) {
            res.status(400).json({
                success: false,
                error: `tipoDia inválido. Valores permitidos: ${valid.join(', ')}`,
            });
            return;
        }
        const data = await (0, stmHorariosScraperService_1.fetchLineSchedule)(linea, tipoDiaQ);
        res.json({ success: true, data });
    }
    catch (err) {
        logger_1.logger.error(`[stm/scraper/horarios] ${err?.message}`);
        res.status(502).json({ success: false, error: err?.message ?? String(err) });
    }
});
/**
 * GET /api/stm/ucot/active-schedules
 * Retorna el mapeo dinámico Coche -> Servicio/Cartón del día leyéndolo de los JSON descargados.
 */
router.get('/ucot/active-schedules', async (_req, res) => {
    try {
        const mapping = ucotIntranetService_1.ucotIntranetService.getActiveSchedules();
        const status = ucotIntranetService_1.ucotIntranetService.getSyncStatus();
        res.json({ success: true, mapping, status });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err?.message || 'Error recuperando cartones activos.' });
    }
});
/**
 * POST /api/stm/ucot/sync-cartones
 * Ejecuta el sincronizador de la API IMM en background (ahora síncrono).
 */
router.post('/ucot/sync-cartones', async (_req, res) => {
    try {
        const triggerResult = await ucotIntranetService_1.ucotIntranetService.syncWithImmApi();
        res.json(triggerResult);
    }
    catch (err) {
        res.status(500).json({ success: false, error: err?.message || 'Error ejecutando motor de descarga.' });
    }
});
/**
 * GET /api/stm/correlation/operational-financial/:linea
 * Cruce Crítico Inter-Módulos: Ventas (Validaciones) + Demoras GPS + Competidores.
 * Calcula fuga económica y genera sugerencias estratégicas reales para ganar terreno.
 */
router.get('/correlation/operational-financial/:linea', async (req, res) => {
    try {
        const { linea } = req.params;
        const agencyId = req.query.agencyId || '70'; // default UCOT
        const sentido = (req.query.sentido?.toUpperCase() === 'VUELTA') ? 'VUELTA' : 'IDA';
        const days = parseInt(req.query.days || '14', 10);
        if (!linea) {
            res.status(400).json({ success: false, error: 'Falta parámetro linea.' });
            return;
        }
        const analysis = await crossModuleCorrelationService_1.crossModuleCorrelationService.analyzeOperationalFinancialCorrelation(linea, agencyId, sentido, days);
        res.json({ success: true, data: analysis });
    }
    catch (err) {
        logger_1.logger.error(`[stm/correlation] Error crítico: ${err?.message}`);
        res.status(500).json({ success: false, error: 'Error procesando correlación operativa financiera.' });
    }
});
exports.default = router;
