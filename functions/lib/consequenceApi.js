"use strict";
/**
 * /consequencePreview — Motor de Consecuencias (HTTP endpoint)
 * =============================================================
 * Dado un evento operativo, simula la cascada completa de efectos
 * sin escribir datos reales. Es un "¿qué pasa si...?" en tiempo real.
 *
 * POST /consequencePreview
 * Body: { evento: EventoOperativo, contexto?: Partial<ContextoConsecuencia> }
 * Response: ResultadoPropagacion
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.consequencePreview = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const consequenceEngine_1 = require("./consequenceEngine");
const index_1 = require("./rules/index");
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
exports.consequencePreview = (0, https_1.onRequest)({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 }, async (req, res) => {
    var _a;
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ ok: false, error: 'Solo POST' });
        return;
    }
    try {
        const { evento, contexto: contextoOverride } = req.body;
        if (!(evento === null || evento === void 0 ? void 0 : evento.tipo) || !(evento === null || evento === void 0 ? void 0 : evento.empresaId)) {
            res.status(400).json({ ok: false, error: 'evento.tipo y evento.empresaId son requeridos' });
            return;
        }
        const reglas = (0, index_1.obtenerReglasEmpresa)(evento.empresaId);
        if (!reglas) {
            res.status(422).json({
                ok: false,
                error: `Empresa ${evento.empresaId} no tiene reglas configuradas aún.`,
                empresasDisponibles: ['70'],
            });
            return;
        }
        // Construir contexto real desde Firestore (o usar override para testing)
        const contexto = await construirContexto(evento, contextoOverride);
        const resultado = (0, consequenceEngine_1.propagarEvento)(evento, reglas, contexto);
        res.status(200).json(Object.assign({ ok: true }, resultado));
    }
    catch (err) {
        console.error('[consequencePreview] error:', err);
        res.status(500).json({ ok: false, error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : 'Error interno' });
    }
});
// ── Construye el contexto consultando Firestore ───────────────────────────────
async function construirContexto(evento, override = {}) {
    var _a, _b, _c, _d;
    const db = (0, firestore_1.getFirestore)();
    const empresaId = evento.empresaId;
    // Contexto base (con defaults seguros)
    let contexto = Object.assign({ ausenciasUltimos30Dias: 0, reservasDisponibles: [], viajesAfectados: 3, otpActualLinea: 90, busesEnLinea: 10, pasajerosPromedio: 35 }, override);
    try {
        // Si el evento involucra un conductor, buscar sus ausencias recientes
        const conductorId = evento.conductorId;
        if (conductorId && !override.ausenciasUltimos30Dias) {
            const hace30Dias = new Date();
            hace30Dias.setDate(hace30Dias.getDate() - 30);
            const snap = await db
                .collection('licencias_personal')
                .where('employeeId', '==', conductorId)
                .where('empresaId', '==', empresaId)
                .where('startDate', '>=', hace30Dias.toISOString().slice(0, 10))
                .get();
            contexto.ausenciasUltimos30Dias = snap.size;
        }
        // Buscar conductores de reserva disponibles (estado libre)
        if (!override.reservasDisponibles) {
            const fecha = (_a = evento.fecha) !== null && _a !== void 0 ? _a : new Date().toISOString().slice(0, 10);
            const snap = await db
                .collection('daily_shifts')
                .where('empresaId', '==', empresaId)
                .where('date', '==', fecha)
                .where('estado', '==', 'reserva_disponible')
                .limit(5)
                .get();
            contexto.reservasDisponibles = snap.docs.map((d) => {
                var _a;
                return ({
                    id: d.id,
                    nombre: (_a = d.data().conductorNombre) !== null && _a !== void 0 ? _a : 'Conductor de reserva',
                });
            });
        }
        // OTP actual de la línea
        const lineaId = evento.lineaId;
        if (lineaId && !override.otpActualLinea) {
            const otpSnap = await db
                .collection('otp_daily')
                .where('lineaId', '==', lineaId)
                .where('empresaId', '==', empresaId)
                .orderBy('fecha', 'desc')
                .limit(1)
                .get();
            if (!otpSnap.empty) {
                contexto.otpActualLinea = (_b = otpSnap.docs[0].data().otp) !== null && _b !== void 0 ? _b : 90;
            }
        }
        // Viajes afectados: contar servicios del turno
        const turnoId = evento.turnoId;
        if (turnoId && !override.viajesAfectados) {
            const turnoDoc = await db.collection('daily_shifts').doc(turnoId).get();
            if (turnoDoc.exists) {
                const data = turnoDoc.data();
                contexto.viajesAfectados = (_c = data === null || data === void 0 ? void 0 : data.tripCount) !== null && _c !== void 0 ? _c : 3;
                contexto.busesEnLinea = (_d = data === null || data === void 0 ? void 0 : data.busesEnLinea) !== null && _d !== void 0 ? _d : 10;
            }
        }
    }
    catch (_e) {
        // Si Firestore falla, usar los defaults — no bloquear la simulación
    }
    return contexto;
}
