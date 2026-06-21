"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAgencies = listAgencies;
exports.getComplianceRealtime = getComplianceRealtime;
exports.getEndpointHealthHandler = getEndpointHealthHandler;
exports.getAgencyRoutes = getAgencyRoutes;
exports.getActiveTrips = getActiveTrips;
exports.getVehicleHistoryHandler = getVehicleHistoryHandler;
exports.getHistorySummaryHandler = getHistorySummaryHandler;
exports.getActiveSnapshot = getActiveSnapshot;
const scheduleComplianceEngine_1 = require("../services/scheduleComplianceEngine");
const vehicleHistoryService_1 = require("../services/vehicleHistoryService");
const logger_1 = require("../config/logger");
/** GET /api/autostats/agencies — lista empresas disponibles en GTFS */
async function listAgencies(req, res) {
    try {
        const agencies = (0, scheduleComplianceEngine_1.getAvailableAgencies)();
        res.json({ ok: true, agencies });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
}
/** GET /api/autostats/compliance/:agencyId — análisis en tiempo real, con fallback a Firestore */
async function getComplianceRealtime(req, res) {
    const { agencyId } = req.params;
    try {
        const results = await (0, scheduleComplianceEngine_1.analyzeComplianceForAgency)(agencyId);
        const summary = (0, scheduleComplianceEngine_1.summarizeByRoute)(results);
        (0, vehicleHistoryService_1.saveComplianceSnapshot)(results).catch(err => logger_1.logger.warn('[AutoStats] Error guardando snapshot:', err));
        res.json({
            ok: true,
            agencyId,
            timestamp: new Date().toISOString(),
            totalBuses: results.length,
            summary,
            buses: results,
            gpsSource: 'live',
        });
    }
    catch (err) {
        // GPS caído: devolver último snapshot conocido desde Firestore
        logger_1.logger.warn('[AutoStats] GPS fallido, usando historial Firestore:', err?.message);
        try {
            const { buses, dataTimestamp, hoursBack } = await (0, vehicleHistoryService_1.getLastKnownBusesSnapshot)(agencyId, 24);
            const summary = buses.reduce((acc, b) => {
                if (!acc[b.linea])
                    acc[b.linea] = { linea: b.linea, busesActivos: 0, enTiempo: 0, atrasados: 0, adelantados: 0, sinHorario: 0, pctCumplimiento: 0 };
                acc[b.linea].busesActivos++;
                if (b.estadoCumplimiento === 'EN_TIEMPO')
                    acc[b.linea].enTiempo++;
                else if (b.estadoCumplimiento === 'ATRASADO')
                    acc[b.linea].atrasados++;
                else if (b.estadoCumplimiento === 'ADELANTADO')
                    acc[b.linea].adelantados++;
                else
                    acc[b.linea].sinHorario++;
                return acc;
            }, {});
            Object.values(summary).forEach((s) => {
                const total = s.enTiempo + s.atrasados + s.adelantados;
                s.pctCumplimiento = total > 0 ? Math.round((s.enTiempo / total) * 100) : 0;
            });
            res.json({
                ok: true,
                agencyId,
                timestamp: new Date().toISOString(),
                totalBuses: buses.length,
                summary,
                buses,
                gpsSource: 'historical',
                dataTimestamp,
                hoursBack,
                gpsError: err?.message,
            });
        }
        catch (fbErr) {
            res.status(503).json({ ok: false, error: 'GPS y Firestore no disponibles', detail: fbErr?.message });
        }
    }
}
/** GET /api/autostats/health — estado del endpoint GPS STM */
async function getEndpointHealthHandler(_req, res) {
    try {
        const health = await (0, vehicleHistoryService_1.getEndpointHealth)();
        res.json({ ok: true, health });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
}
/** GET /api/autostats/routes/:agencyId — horario GTFS por empresa */
async function getAgencyRoutes(req, res) {
    const { agencyId } = req.params;
    try {
        const routes = (0, scheduleComplianceEngine_1.getRoutesForAgency)(agencyId);
        if (!routes)
            return res.status(404).json({ ok: false, error: 'Agency no encontrada' });
        // Devolver solo metadatos (sin los trips completos para no saturar)
        const meta = Object.entries(routes).map(([routeShort, r]) => ({
            route: routeShort,
            longName: r.route_long_name,
            totalHabiles: r.habiles.length,
            totalSabados: r.sabados.length,
            totalDomingos: r.domingos.length,
        }));
        res.json({ ok: true, agencyId, routes: meta });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
}
/** GET /api/autostats/routes/:agencyId/:routeShort/active — viajes activos ahora */
async function getActiveTrips(req, res) {
    const { agencyId, routeShort } = req.params;
    try {
        const trips = (0, scheduleComplianceEngine_1.getActiveTripsNow)(agencyId, routeShort);
        res.json({ ok: true, agencyId, route: routeShort, activeTrips: trips });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
}
/**
 * GET /api/autostats/vehicle/:idBus?days=7&agency_id=70
 *
 * FASE 5.14 (2026-05-13): agency_id pasa a ser obligatorio en la práctica para
 * evitar que el historial mezcle eventos de operadores con el mismo codigoBus
 * (ej. UCOT 46 y CUTCSA 46). Si el cliente no lo manda, el servicio infiere
 * del prefijo de id_bus cuando viene como `${agency}_${codigo}`.
 */
async function getVehicleHistoryHandler(req, res) {
    const { idBus } = req.params;
    const days = parseInt(req.query.days) || 7;
    const agencyId = req.query.agency_id || undefined;
    try {
        const [history, summary] = await Promise.all([
            (0, vehicleHistoryService_1.getVehicleHistory)(idBus, days, agencyId),
            (0, vehicleHistoryService_1.getVehicleSummary)(idBus, days, agencyId),
        ]);
        res.json({ ok: true, idBus, days, agencyId: agencyId ?? null, summary, history });
    }
    catch (err) {
        logger_1.logger.error('[AutoStats] vehicle history error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
}
/** GET /api/autostats/history/:agencyId?days=7 — resumen histórico por línea, siempre disponible */
async function getHistorySummaryHandler(req, res) {
    const { agencyId } = req.params;
    const days = Math.min(parseInt(req.query.days) || 7, 30);
    try {
        const lines = await (0, vehicleHistoryService_1.getLineSummaryHistory)(agencyId, days);
        res.json({ ok: true, agencyId, days, lines });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
}
/** GET /api/autostats/active/:agencyId — buses activos últimos 3 min (desde Firestore) */
async function getActiveSnapshot(req, res) {
    const { agencyId } = req.params;
    try {
        const buses = await (0, vehicleHistoryService_1.getActiveBusesSnapshot)(agencyId);
        res.json({ ok: true, agencyId, buses });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
}
