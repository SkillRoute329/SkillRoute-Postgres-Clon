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
// ─── GESTIÓN MAESTRA DE PERSONAL ──────────────────────────────────────────────
/** GET /api/listero/personal-maestro */
router.get('/personal-maestro', auth_1.verifyAuth, wrap(async (req, res) => {
    const personal = await listeroService.getPersonalMaestro();
    res.json({ ok: true, personal });
}));
/** PATCH /api/listero/personal-maestro/:id */
router.patch('/personal-maestro/:id', auth_1.verifyAuth, wrap(async (req, res) => {
    await listeroService.updatePersonalMaestro(req.params.id, req.body);
    res.json({ ok: true, mensaje: 'Personal maestro actualizado' });
}));
/** POST /api/listero/rotar-semana */
router.post('/rotar-semana', auth_1.verifyAuth, wrap(async (req, res) => {
    const tipo = req.body.tipo || 'semanal';
    const resultado = await listeroService.rotarSemana(tipo);
    res.json({ ok: true, actualizados: resultado.actualizados });
}));
// ─── FLOTA MAESTRA ────────────────────────────────────────────────────────────
/** GET /api/listero/flota-maestra */
router.get('/flota-maestra', auth_1.verifyAuth, wrap(async (req, res) => {
    const flota = await listeroService.getFlotaMaestra();
    res.json({ ok: true, flota });
}));
/** POST /api/listero/asignar-titular */
router.post('/asignar-titular', auth_1.verifyAuth, wrap(async (req, res) => {
    const { vehiculoId, turno, conductorId, tipoRotacion } = req.body;
    if (!vehiculoId || !turno) {
        res.status(400).json({ ok: false, error: 'Faltan campos obligatorios' });
        return;
    }
    await listeroService.asignarTitularCoche(vehiculoId, turno, conductorId, tipoRotacion || 'semanal');
    res.json({ ok: true, mensaje: 'Titular asignado exitosamente' });
}));
// ─── CONDUCTORES DEL DÍA ────────────────────────────────────────────────────
/** GET /api/listero/conductores?fecha=YYYY-MM-DD */
router.get('/conductores', auth_1.verifyAuth, wrap(async (req, res) => {
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0];
    const conductores = await listeroService.getConductoresDia(fecha);
    res.json({ ok: true, conductores });
}));
/** PATCH /api/listero/conductores/:id — actualización manual de estado o datos */
router.patch('/conductores/:id', auth_1.verifyAuth, wrap(async (req, res) => {
    await listeroService.updateConductor(req.params.id, req.body);
    res.json({ ok: true, mensaje: 'Conductor actualizado' });
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
/** PATCH /api/listero/vehiculos/:id — actualización manual de datos de vehículo */
router.patch('/vehiculos/:id', auth_1.verifyAuth, wrap(async (req, res) => {
    await listeroService.updateVehiculo(req.params.id, req.body);
    res.json({ ok: true, mensaje: 'Vehículo actualizado' });
}));
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
    // Si se pasa ?force=true o body.force, borramos los existentes para regenerar
    if (req.body?.force || req.query?.force) {
        const sqlDb = (await Promise.resolve().then(() => __importStar(require('../config/database')))).default;
        await sqlDb('turnos_dia').where({ fecha }).delete();
    }
    else {
        const existentes = await listeroService.getTurnosByFecha(fecha);
        if (existentes.length > 0) {
            res.json({ ok: true, created: 0, existing: existentes.length, fecha });
            return;
        }
    }
    const sqlDb = (await Promise.resolve().then(() => __importStar(require('../config/database')))).default;
    const rows = await sqlDb('vehiculos');
    if (rows.length === 0) {
        res.json({ ok: true, created: 0, existing: 0, fecha, nota: 'No hay vehículos configurados.' });
        return;
    }
    // Obtener todo el personal para mapear choferes fijos
    const personalRows = await sqlDb('personal').whereNotNull('data_jsonb');
    const choferesPorCoche = new Map();
    for (const p of personalRows) {
        const data = p.data_jsonb || {};
        if (data.tipo_vinculo === 'fijo' && data.coche_fijo_id) {
            if (!choferesPorCoche.has(data.coche_fijo_id)) {
                choferesPorCoche.set(data.coche_fijo_id, { manana: null, tarde: null });
            }
            const cocheMap = choferesPorCoche.get(data.coche_fijo_id);
            const rotacion = data.rotacion_semana_actual || 'mañana';
            const choferData = {
                id: p.id,
                nombre: p.full_name,
                interno: p.internal_number
            };
            if (rotacion === 'mañana')
                cocheMap.manana = choferData;
            else if (rotacion === 'tarde')
                cocheMap.tarde = choferData;
        }
    }
    let created = 0;
    for (const r of rows) {
        const d = r.data_jsonb || {};
        const line = d.linea_habitual || '300';
        const internoStr = d.interno || r.id; // r.id sometimes is UUID
        const choferesFijos = choferesPorCoche.get(r.id) || { manana: null, tarde: null };
        // Crear turno mañana
        try {
            await listeroService.createTurno({
                fecha,
                vehiculoId: r.id,
                vehiculoInterno: internoStr,
                lineaId: line,
                turno: 'mañana',
                horaSalida: '06:00',
                horaLlegadaEstimada: '14:00',
                conductorId: choferesFijos.manana ? choferesFijos.manana.id : null,
                conductorNombre: choferesFijos.manana ? choferesFijos.manana.nombre : null,
                conductorInterno: choferesFijos.manana ? choferesFijos.manana.interno : null,
                servicioId: null,
            });
            created += 1;
        }
        catch (e) {
            logger_1.default.warn('[listero/generar-programacion] turno mañana no creado', { error: String(e) });
        }
        // Crear turno tarde
        try {
            await listeroService.createTurno({
                fecha,
                vehiculoId: r.id,
                vehiculoInterno: internoStr,
                lineaId: line,
                turno: 'tarde',
                horaSalida: '14:00',
                horaLlegadaEstimada: '22:00',
                conductorId: choferesFijos.tarde ? choferesFijos.tarde.id : null,
                conductorNombre: choferesFijos.tarde ? choferesFijos.tarde.nombre : null,
                conductorInterno: choferesFijos.tarde ? choferesFijos.tarde.interno : null,
                servicioId: null,
            });
            created += 1;
        }
        catch (e) {
            logger_1.default.warn('[listero/generar-programacion] turno tarde no creado', { error: String(e) });
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
// ─── SOLICITUDES (PAPELITOS DIGITALES) ────────────────────────────────────────
/** GET /api/listero/solicitudes?fecha=YYYY-MM-DD */
router.get('/solicitudes', auth_1.verifyAuth, wrap(async (req, res) => {
    const user = req.user;
    const fecha = req.query.fecha;
    const solicitudes = await listeroService.getSolicitudes(user?.agencyId ?? '70', fecha);
    res.json({ ok: true, solicitudes });
}));
/** POST /api/listero/solicitudes */
router.post('/solicitudes', auth_1.verifyAuth, wrap(async (req, res) => {
    const user = req.user;
    const data = req.body;
    if (!data.tipoSolicitud || !data.fechaObjetivo) {
        res.status(400).json({ ok: false, error: 'Faltan campos: tipoSolicitud, fechaObjetivo' });
        return;
    }
    const id = await listeroService.createSolicitud({
        agencyId: user?.agencyId ?? '70',
        conductorId: user?.id,
        tipoSolicitud: data.tipoSolicitud,
        fechaObjetivo: data.fechaObjetivo,
        turnoObjetivo: data.turnoObjetivo || null,
        cocheObjetivo: data.cocheObjetivo || null,
        notas: data.notas || null,
    });
    // Notificar al Listero en tiempo real
    (0, socketBus_1.busOperation)('nueva-solicitud', { id, tipoSolicitud: data.tipoSolicitud, conductorId: user?.id, conductorNombre: user?.fullName });
    res.status(201).json({ ok: true, id });
}));
/** PATCH /api/listero/solicitudes/:id/estado */
router.patch('/solicitudes/:id/estado', auth_1.verifyAuth, wrap(async (req, res) => {
    const user = req.user;
    const { estado } = req.body;
    if (!estado) {
        res.status(400).json({ ok: false, error: 'Falta campo: estado' });
        return;
    }
    await listeroService.updateSolicitudEstado(req.params.id, estado, user?.fullName ?? user?.id);
    // Notificar al conductor del cambio de estado
    (0, socketBus_1.busOperation)('solicitud-actualizada', { id: req.params.id, estado });
    res.json({ ok: true });
}));
/** GET /api/listero/solicitudes/emparejamientos?fecha=YYYY-MM-DD */
router.get('/solicitudes/emparejamientos', auth_1.verifyAuth, wrap(async (req, res) => {
    const user = req.user;
    const fecha = req.query.fecha;
    if (!fecha) {
        res.status(400).json({ ok: false, error: 'Falta parámetro: fecha' });
        return;
    }
    const emparejamientos = await listeroService.analizarEmparejamientos(fecha, user?.agencyId ?? '70');
    res.json({ ok: true, emparejamientos });
}));
/** POST /api/listero/correlativos — Motor de reglas 45 minutos */
router.post('/correlativos', auth_1.verifyAuth, wrap(async (req, res) => {
    const { internoA, internoB, fecha } = req.body;
    if (!internoA || !internoB || !fecha) {
        res.status(400).json({ ok: false, error: 'Faltan campos: internoA, internoB, fecha' });
        return;
    }
    const resultado = await listeroService.procesarCorrelativoDirecto(internoA, internoB, fecha);
    // Notificar al listero para actualizar UI
    if (resultado.ok) {
        (0, socketBus_1.busOperation)('correlativo-aprobado', { internoA, internoB, fecha, message: resultado.message });
    }
    res.json(resultado); // Devuelve {ok: boolean, message: string} (puede ser ok=false si hay menos de 45m)
}));
exports.default = router;
