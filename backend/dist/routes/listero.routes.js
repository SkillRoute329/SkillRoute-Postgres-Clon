"use strict";
/**
 * Rutas del Módulo Listero — /api/listero
 *
 * Gestión de programación diaria, ausencias, reservas y cascada operativa.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const listeroService = __importStar(require("../services/listeroService"));
const cascadeEngine = __importStar(require("../services/cascadeEngineService"));
const logger_1 = __importDefault(require("../config/logger"));
const consequenceController_1 = require("../controllers/consequenceController");
const socketBus_1 = require("../services/socketBus");
const router = (0, express_1.Router)();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
// ─── TURNOS ──────────────────────────────────────────────────────────────────
/** GET /api/listero/turnos?fecha=YYYY-MM-DD */
router.get('/turnos', auth_1.verifyAuth, wrap(async (req, res) => {
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0];
    const turnos = await listeroService.getTurnosByFecha(fecha);
    res.json({ ok: true, turnos });
}));
/** POST /api/listero/turnos — crear nuevo turno */
router.post('/turnos', auth_1.verifyAuth, wrap(async (req, res) => {
    const turno = req.body;
    if (!turno.fecha || !turno.vehiculoId || !turno.lineaId || !turno.horaSalida) {
        res.status(400).json({ ok: false, error: 'Faltan campos: fecha, vehiculoId, lineaId, horaSalida' });
        return;
    }
    const id = await listeroService.createTurno(turno);
    res.status(201).json({ ok: true, id });
}));
/** PATCH /api/listero/turnos/:id — actualizar turno */
router.patch('/turnos/:id', auth_1.verifyAuth, wrap(async (req, res) => {
    await listeroService.updateTurno(req.params.id, req.body);
    res.json({ ok: true });
}));
/** DELETE /api/listero/turnos/:id */
router.delete('/turnos/:id', auth_1.verifyAuth, wrap(async (req, res) => {
    await listeroService.deleteTurno(req.params.id);
    res.json({ ok: true });
}));
// ─── CONDUCTORES ──────────────────────────────────────────────────────────────
/** GET /api/listero/conductores?fecha=YYYY-MM-DD */
router.get('/conductores', auth_1.verifyAuth, wrap(async (req, res) => {
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0];
    const conductores = await listeroService.getConductoresDia(fecha);
    res.json({ ok: true, conductores });
}));
/** POST /api/listero/ausencia — registrar ausencia y disparar cascada */
router.post('/ausencia', auth_1.verifyAuth, wrap(async (req, res) => {
    const { conductorId, conductorNombre, fecha, motivo } = req.body;
    if (!conductorId || !fecha || !motivo) {
        res.status(400).json({ ok: false, error: 'Faltan campos: conductorId, fecha, motivo' });
        return;
    }
    const user = req.user;
    const registradoPor = user?.fullName ?? user?.id ?? 'sistema';
    // Disparar cascada completa (async, no bloqueante para la respuesta)
    cascadeEngine
        .procesarAusenciaConductor(conductorId, conductorNombre ?? conductorId, fecha, motivo, registradoPor)
        .catch((err) => logger_1.default.error('[LISTERO_ROUTE] Error en cascada ausencia', { err: String(err) }));
    // FASE 5.30 (2026-05-21): trigger automático del motor de consecuencias
    // y emit al bus para que las pantallas conectadas vean el efecto en vivo.
    // No bloqueante: si el motor falla, la ausencia ya quedó registrada.
    (0, consequenceController_1.computeConsequencesForEvent)({
        tipo: 'CONDUCTOR_AUSENTE',
        conductorId,
        conductorNombre: conductorNombre ?? conductorId,
        codigoAusencia: String(motivo).toLowerCase().includes('injust') ? 'ausencia_injustificada' : motivo,
        duracionHoras: 8,
        kmEsperados: 120,
    }).catch((err) => logger_1.default.error('[LISTERO_ROUTE] consequencePreview error', { err: String(err) }));
    (0, socketBus_1.busOperation)('ausencia', { conductorId, conductorNombre, fecha, motivo, registradoPor });
    res.json({ ok: true, mensaje: 'Ausencia registrada. Cascada de alertas iniciada.' });
}));
/** POST /api/listero/reserva — asignar conductor de reserva a un turno */
router.post('/reserva', auth_1.verifyAuth, wrap(async (req, res) => {
    const { turnoId, conductorReservaId, conductorReservaNombre } = req.body;
    if (!turnoId || !conductorReservaId) {
        res.status(400).json({ ok: false, error: 'Faltan campos: turnoId, conductorReservaId' });
        return;
    }
    const user = req.user;
    const asignadoPor = user?.fullName ?? user?.id ?? 'sistema';
    await listeroService.asignarReserva(turnoId, conductorReservaId, conductorReservaNombre ?? '', asignadoPor);
    (0, socketBus_1.busOperation)('reserva-asignada', { turnoId, conductorReservaId, conductorReservaNombre, asignadoPor });
    res.json({ ok: true, mensaje: 'Reserva asignada correctamente.' });
}));
// ─── VEHÍCULOS ────────────────────────────────────────────────────────────────
/** GET /api/listero/vehiculos-reserva?fecha=YYYY-MM-DD */
router.get('/vehiculos-reserva', auth_1.verifyAuth, wrap(async (req, res) => {
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0];
    const vehiculos = await listeroService.buscarVehiculosReserva(fecha);
    res.json({ ok: true, vehiculos });
}));
/** POST /api/listero/vehiculo-taller — marcar vehículo en taller y disparar cascada */
router.post('/vehiculo-taller', auth_1.verifyAuth, wrap(async (req, res) => {
    const { vehiculoId, vehiculoInterno, motivo, fecha } = req.body;
    if (!vehiculoId || !motivo) {
        res.status(400).json({ ok: false, error: 'Faltan campos: vehiculoId, motivo' });
        return;
    }
    const user = req.user;
    const registradoPor = user?.fullName ?? user?.id ?? 'sistema';
    const fechaHoy = fecha ?? new Date().toISOString().split('T')[0];
    cascadeEngine
        .procesarVehiculoEnTaller(vehiculoId, vehiculoInterno ?? vehiculoId, motivo, registradoPor, fechaHoy)
        .catch((err) => logger_1.default.error('[LISTERO_ROUTE] Error en cascada taller', { err: String(err) }));
    // FASE 5.30 (2026-05-21): motor de consecuencias + bus.
    (0, consequenceController_1.computeConsequencesForEvent)({
        tipo: 'VEHICULO_FUERA_DE_SERVICIO',
        cocheId: vehiculoId,
        cocheNumero: vehiculoInterno ?? vehiculoId,
        motivoVehiculo: motivo,
        horasEstimadas: 4,
        kmPerdidos: 60,
    }).catch((err) => logger_1.default.error('[LISTERO_ROUTE] consequencePreview error', { err: String(err) }));
    (0, socketBus_1.busOperation)('vehiculo-taller', { vehiculoId, vehiculoInterno, motivo, fecha: fechaHoy, registradoPor });
    res.json({ ok: true, mensaje: 'Vehículo marcado en taller. Cascada de alertas iniciada.' });
}));
// ─── GENERAR PROGRAMACIÓN DEL DÍA ────────────────────────────────────────────
/**
 * POST /api/listero/generar-programacion
 *   body: { fecha: 'YYYY-MM-DD' }
 *
 * FASE 5.28 (2026-05-19): genera los turnos del día desde la última
 * rotación capturada por el watcher en `cartones_historial`. Devuelve
 * `{ ok, created, existing }`. Si ya hay turnos para esa fecha, no
 * duplica.
 */
router.post('/generar-programacion', auth_1.verifyAuth, wrap(async (req, res) => {
    const fecha = String(req.body?.fecha ?? new Date().toISOString().slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        res.status(400).json({ ok: false, error: 'Formato esperado: fecha=YYYY-MM-DD' });
        return;
    }
    const existentes = await listeroService.getTurnosByFecha(fecha);
    if (existentes.length > 0) {
        res.json({ ok: true, created: 0, existing: existentes.length, fecha });
        return;
    }
    // Leer rotación del día desde cartones_historial.
    const sqlDb = (await Promise.resolve().then(() => __importStar(require('../config/database')))).default;
    const rows = await sqlDb('cartones_historial')
        .select('vehiculo_id', 'service_number', 'line')
        .where('fecha', fecha);
    if (rows.length === 0) {
        res.json({ ok: true, created: 0, existing: 0, fecha, nota: 'No hay rotación capturada para esa fecha.' });
        return;
    }
    let created = 0;
    for (const r of rows) {
        try {
            // conductor_id es FK a personal(id); si no hay asignación aún,
            // dejamos null (FK lo permite). El listero asigna después.
            await listeroService.createTurno({
                fecha,
                vehiculoId: r.vehiculo_id,
                vehiculoInterno: r.vehiculo_id,
                lineaId: r.line ?? '',
                horaSalida: '00:00',
                horaLlegadaEstimada: '00:00',
                conductorId: null,
                conductorNombre: null,
                conductorInterno: null,
                servicioId: r.service_number ?? null,
            });
            created += 1;
        }
        catch (e) {
            logger_1.default.warn('[listero/generar-programacion] turno no creado', { error: String(e) });
        }
    }
    res.json({ ok: true, created, existing: 0, fecha });
}));
// ─── FIRMA DIGITAL DEL CARTÓN ─────────────────────────────────────────────────
/** POST /api/listero/firma — conductor firma su cartón del día */
router.post('/firma', auth_1.verifyAuth, wrap(async (req, res) => {
    const { turnoId, horaFirma } = req.body;
    const user = req.user;
    if (!turnoId) {
        res.status(400).json({ ok: false, error: 'Falta turnoId' });
        return;
    }
    const hora = horaFirma ?? new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
    await listeroService.registrarFirma(turnoId, user.id, hora);
    res.json({ ok: true, horaFirma: hora });
}));
// ─── ALERTAS ──────────────────────────────────────────────────────────────────
/** GET /api/listero/alertas?fecha=YYYY-MM-DD&historial=true */
router.get('/alertas', auth_1.verifyAuth, wrap(async (req, res) => {
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0];
    const historial = req.query.historial === 'true';
    const alertas = historial
        ? await cascadeEngine.getHistorialAlertas(fecha)
        : await cascadeEngine.getAlertasActivas(fecha);
    res.json({ ok: true, alertas });
}));
/** PATCH /api/listero/alertas/:id/atender */
router.patch('/alertas/:id/atender', auth_1.verifyAuth, wrap(async (req, res) => {
    const user = req.user;
    await cascadeEngine.atenderAlerta(req.params.id, user?.fullName ?? user?.id ?? 'desconocido');
    res.json({ ok: true });
}));
// ─── RESUMEN DIARIO ───────────────────────────────────────────────────────────
/** GET /api/listero/resumen?fecha=YYYY-MM-DD */
router.get('/resumen', auth_1.verifyAuth, wrap(async (req, res) => {
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0];
    const resumen = await listeroService.getResumenDiario(fecha);
    res.json({ ok: true, resumen });
}));
exports.default = router;
