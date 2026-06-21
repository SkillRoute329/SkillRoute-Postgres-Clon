"use strict";
/**
 * whatsappController — /api/whatsapp/{status,restart} (FASE 5.28, 2026-05-19)
 *
 * Antes 404 (AdminWhatsApp, AdminWhatsAppSettings). No tenemos servicio
 * WhatsApp activo todavía (whatsapp-web.js no está corriendo en este
 * stack). Para no romper la UI ni mentir, los endpoints declaran honestamente
 * que el servicio NO está conectado, e incluyen `nota` explicando la razón.
 *
 * Cuando se integre un servicio WhatsApp real, esta capa puede consultar a
 * un microservicio (típicamente :3199) y devolver el estado real + QR.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWhatsappStatus = getWhatsappStatus;
exports.postWhatsappRestart = postWhatsappRestart;
const logger_1 = __importDefault(require("../config/logger"));
const SERVICIO_DISPONIBLE = false;
const restartLog = [];
function getWhatsappStatus(_req, res) {
    if (SERVICIO_DISPONIBLE) {
        // Aquí iría la consulta al microservicio real.
        res.json({ status: 'DISCONNECTED', qrCode: null });
        return;
    }
    res.json({
        status: 'DISCONNECTED',
        qrCode: null,
        nota: 'Servicio WhatsApp no integrado en este stack. Activar microservicio para conectar.',
        restarts: restartLog.slice(-5),
    });
}
function postWhatsappRestart(req, res) {
    const clean = Boolean(req.body?.clean);
    restartLog.push({
        ts: new Date().toISOString(),
        clean,
        by: req.user?.id ?? null,
    });
    logger_1.default.info('[whatsapp] restart solicitado', { clean });
    res.json({
        ok: true,
        status: 'INITIALIZING',
        nota: 'Solicitud de reinicio registrada. Servicio WhatsApp aún no integrado en este stack.',
    });
}
