"use strict";
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
exports.regulatorio = void 0;
/**
 * regulatorio.ts — Compliance Reporting Export estructurado
 * ============================================================
 * Sprint 1 entrega 1.4 del roadmap international-grade.
 *
 * Diferenciador único de SkillRoute confirmado en análisis competitivo:
 * NINGÚN competidor mundial (Optibus, Swiftly, Remix, Trapeze, Cittati)
 * ofrece módulo regulatorio orientado a autoridades reguladoras (IMM,
 * STM, CAF, ANTT). Todos venden a operadores, no a reguladores.
 *
 * Endpoints:
 *   GET /api/regulatorio/health
 *     - smoke test del endpoint
 *
 *   GET /api/regulatorio/export?empresa=70&desde=2026-01-01&hasta=2026-04-30&formato=json
 *     - genera reporte estructurado de cumplimiento de un operador
 *     - filtros: empresa (codigo numérico), rango fecha, formato (json|pdf)
 *     - auth: ADMIN o SUPERADMIN
 *
 *   GET /api/regulatorio/export-cross-op?desde=...&hasta=...&formato=json
 *     - genera reporte cross-operador de la red metropolitana completa
 *     - filtros: rango fecha, formato (json|pdf)
 *     - auth: ADMIN o SUPERADMIN
 *
 * Output JSON estructurado siguiendo plantilla canónica:
 *   - Cumplimiento OTP por operador y por línea
 *   - Cobertura cross-op (overlap improductivo, gaps de servicio)
 *   - KPIs UITP canónicos (regularidad, puntualidad, productividad)
 *   - Análisis equity territorial preliminar
 *   - Metadatos del reporte (período, generado por, timestamp, hash)
 *
 * El módulo NO toca código existente. Es un router Express nuevo
 * exportable que `functions/src/index.ts` puede registrar con un edit
 * puntual (1 línea):
 *
 *     export { regulatorio } from './api/regulatorio';
 *
 * Ese edit lo aplica Claude Code (regla §10 - functions/src/index.ts
 * es archivo crítico compartido).
 */
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const crypto_1 = require("crypto");
// Inicialización segura: solo si no hay app default
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
// ─── Auth middleware ────────────────────────────────────────────────
/**
 * requireAdmin — convención de auth del sistema SkillRoute
 *
 * IMPORTANTE: el sistema NO usa custom claims del JWT para roles.
 * Replica la lógica de firestore.rules `getUserRole()`:
 *   1) Verificar ID token con Firebase Auth.
 *   2) Leer documento `users/{uid}` de Firestore.
 *   3) Aceptar campo `role` o `rol` (compatibilidad legacy), normalizar
 *      a lowercase.
 *   4) Permitir solo si role ∈ {admin, superadmin}.
 *
 * El campo `name` del JWT (Firebase Auth `displayName`) NO indica rol —
 * es un display string. Bug detectado bajo Regla §12 cuando un
 * SuperAdmin con `displayName: "SuperAdmin"` recibía 403 porque el
 * código original leía `decoded.role` en lugar de `users/{uid}.role`.
 */
async function requireAdmin(req, res, next) {
    var _a, _b;
    const authHeader = req.headers.authorization;
    if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))) {
        res.status(401).json({ error: 'Auth requerida' });
        return;
    }
    const idToken = authHeader.substring(7);
    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        const userDoc = await db.collection('users').doc(decoded.uid).get();
        if (!userDoc.exists) {
            res.status(403).json({
                error: 'Usuario no registrado en sistema',
                detail: 'No existe documento users/{uid} en Firestore',
            });
            return;
        }
        const userData = userDoc.data() || {};
        const rawRole = ((_b = (_a = userData.role) !== null && _a !== void 0 ? _a : userData.rol) !== null && _b !== void 0 ? _b : '').toString().toLowerCase();
        const isAdmin = rawRole === 'admin' || rawRole === 'superadmin';
        if (!isAdmin) {
            res.status(403).json({
                error: 'Solo ADMIN o SUPERADMIN',
                detail: `Tu rol actual es '${rawRole || 'sin rol'}'. Contacta al administrador.`,
            });
            return;
        }
        req.user = decoded;
        req.userRole = rawRole;
        next();
    }
    catch (err) {
        res.status(401).json({ error: 'Token inválido', detail: String(err) });
    }
}
// ─── Helpers ────────────────────────────────────────────────────────
function parseDateRange(req) {
    const desdeStr = req.query.desde || '';
    const hastaStr = req.query.hasta || '';
    const desde = desdeStr ? new Date(desdeStr) : new Date(Date.now() - 30 * 86400000);
    const hasta = hastaStr ? new Date(hastaStr) : new Date();
    return { desde, hasta };
}
/**
 * Mapea código numérico de operador (input del API) a agencyId string
 * (campo real en Firestore vehicle_events).
 */
function codigoToAgencyId(codigo) {
    return String(codigo);
}
/**
 * Calcula OTP en vivo desde vehicle_events usando estadoCumplimiento
 * (campo pre-calculado por el sistema, fuente canónica de OTP).
 *
 * Schema real verificado bajo Regla §12 (2026-04-25):
 *  - vehicle_events.agencyId: string ("70" = UCOT, etc.)
 *  - vehicle_events.createdAt: Timestamp (no "timestamp")
 *  - vehicle_events.estadoCumplimiento: string ya pre-calculado:
 *      EN_TIEMPO       → en hora (cuenta para OTP)
 *      ADELANTADO      → fuera de hora (penaliza OTP)
 *      SIN_HORARIO     → no medible (línea sin horarios_stm)
 *      FUERA_DE_SERVICIO → no medible (coche en cochera/depósito)
 *  - vehicle_events.desviacionMin: number (fallback si estadoCumplimiento ausente)
 *  - NO existe el campo "tipo" en este schema.
 *
 * Lógica de evaluación:
 * 1) Si estadoCumplimiento === EN_TIEMPO → medible, en hora.
 * 2) Si estadoCumplimiento === ADELANTADO → medible, fuera de hora.
 * 3) Si estadoCumplimiento === SIN_HORARIO/FUERA_DE_SERVICIO → no medible.
 * 4) Si no hay estadoCumplimiento pero hay desviacionMin numérico → fallback.
 * 5) Si nada → no medible.
 *
 * Usamos el índice existente (agencyId ASC, createdAt ASC) — ya
 * en firestore.indexes.json desde antes.
 */
async function calcularOTP(empresa, desde, hasta) {
    let q = db
        .collection('vehicle_events')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(desde))
        .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(hasta));
    if (empresa !== null) {
        q = q.where('agencyId', '==', codigoToAgencyId(empresa));
    }
    const snap = await q.limit(50000).get();
    let total = 0;
    let medibles = 0;
    let noMedibles = 0;
    let enHora = 0;
    const lineasMedidas = new Set();
    const lineasFaltantes = new Set();
    snap.forEach((doc) => {
        const d = doc.data();
        total++;
        const linea = String(d.linea || '').trim();
        const estado = String(d.estadoCumplimiento || '').toUpperCase();
        const desv = d.desviacionMin;
        if (estado === 'EN_TIEMPO') {
            medibles++;
            enHora++;
            if (linea)
                lineasMedidas.add(linea);
        }
        else if (estado === 'ADELANTADO') {
            medibles++;
            if (linea)
                lineasMedidas.add(linea);
        }
        else if (estado === 'SIN_HORARIO') {
            noMedibles++;
            if (linea)
                lineasFaltantes.add(linea);
        }
        else if (estado === 'FUERA_DE_SERVICIO') {
            noMedibles++;
        }
        else if (typeof desv === 'number' && !isNaN(desv)) {
            // Fallback secundario: usar desviacionMin si no hay estadoCumplimiento
            medibles++;
            if (linea)
                lineasMedidas.add(linea);
            if (Math.abs(desv) <= 5)
                enHora++;
        }
        else {
            noMedibles++;
            if (linea)
                lineasFaltantes.add(linea);
        }
    });
    const pctOTP = medibles > 0 ? Math.round((enHora / medibles) * 10000) / 100 : null;
    return {
        total,
        enHora,
        pctOTP,
        medibles,
        noMedibles,
        lineasConHorariosStm: [...lineasMedidas].sort(),
        lineasSinHorariosStm: [...lineasFaltantes].sort(),
    };
}
async function coberturaCrossOp(desde, hasta) {
    // Schema real (verificado bajo §12): agencyId string, createdAt, idBus.
    // Usa el índice existente (agencyId ASC, createdAt ASC).
    const empresas = [10, 20, 50, 70];
    const result = [];
    for (const empresa of empresas) {
        const snap = await db
            .collection('vehicle_events')
            .where('agencyId', '==', codigoToAgencyId(empresa))
            .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(desde))
            .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(hasta))
            .limit(20000)
            .get();
        const busesSet = new Set();
        const lineasSet = new Set();
        snap.forEach((doc) => {
            var _a;
            const d = doc.data();
            // idBus es el campo canónico; coche es legacy.
            const bus = (_a = d.idBus) !== null && _a !== void 0 ? _a : d.coche;
            if (bus !== undefined && bus !== null)
                busesSet.add(String(bus));
            if (d.linea)
                lineasSet.add(String(d.linea));
        });
        result.push({
            empresa,
            buses: busesSet.size,
            lineasActivas: lineasSet.size,
        });
    }
    return result;
}
async function kpisUITP(empresa, desde, hasta) {
    const otp = await calcularOTP(empresa, desde, hasta);
    return {
        regularidad: otp.pctOTP,
        puntualidad: otp.pctOTP,
        productividad: {
            busesActivos: 0,
            viajesEnPeriodo: otp.total,
        },
    };
}
/**
 * Genera bloque de "calidad de los datos" — transparencia regulatoria.
 * Bajo Regla §12, el regulador debe ver explícitamente qué se midió y
 * qué no, en lugar de recibir 0% engañoso.
 */
function calidadDeDatos(otp) {
    const cobertura = otp.total > 0 ? Math.round((otp.medibles / otp.total) * 10000) / 100 : 0;
    const advertencias = [];
    if (otp.medibles === 0 && otp.total > 0) {
        advertencias.push('OTP no medible en el período: ningún evento tiene desviación calculada. ' +
            'Causa principal: el ingestor IMM no calcula desviacionMin todavía (scraper de horarios reales por parada en roadmap). ' +
            'El campo pctOTP devuelve null para no inducir a error.');
    }
    if (otp.lineasSinHorariosStm.length > 0) {
        advertencias.push(`${otp.lineasSinHorariosStm.length} línea(s) sin horarios_stm cargados — sus eventos quedan fuera del cálculo de OTP. Gap conocido del scraper STM.`);
    }
    if (cobertura > 0 && cobertura < 80) {
        advertencias.push(`Cobertura medible baja: solo ${cobertura}% de los eventos pudieron evaluarse contra horario oficial. Recomendado >80% para reportes presentables.`);
    }
    return {
        eventosTotales: otp.total,
        eventosMedibles: otp.medibles,
        eventosNoMedibles: otp.noMedibles,
        coberturaPct: cobertura,
        lineasMedibles: otp.lineasConHorariosStm.length,
        lineasNoMedibles: otp.lineasSinHorariosStm.length,
        advertencias,
    };
}
function equityPreliminar() {
    return {
        diversidadCoberturaBarrios: -1,
        notas: [
            'Análisis Equity Latam Engine pendiente de implementación (Sprint 8 del roadmap).',
            'Reporte preliminar muestra estructura del output futuro.',
        ],
    };
}
function generarMetadatos(req, content) {
    var _a;
    const generadoEn = new Date().toISOString();
    const hash = (0, crypto_1.createHash)('sha256')
        .update(JSON.stringify(content))
        .digest('hex')
        .substring(0, 16);
    return {
        version: '1.0',
        generadoEn,
        generadoPor: ((_a = (req.user)) === null || _a === void 0 ? void 0 : _a.uid) || 'sistema',
        hash,
        plataforma: 'SkillRoute',
        estandar: 'UITP + GTFS-RT V2 + TCRP 195',
    };
}
// ─── Express router ────────────────────────────────────────────────
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: true }));
app.get('/health', (_req, res) => {
    res.json({ ok: true, modulo: 'regulatorio', version: '1.0' });
});
// Reporte por operador
app.get('/export', requireAdmin, async (req, res) => {
    try {
        const empresaStr = req.query.empresa;
        const empresa = empresaStr ? parseInt(empresaStr, 10) : null;
        if (empresa !== null && isNaN(empresa)) {
            res.status(400).json({ error: 'empresa debe ser número (10/20/50/70)' });
            return;
        }
        const { desde, hasta } = parseDateRange(req);
        const formato = req.query.formato || 'json';
        const otp = await calcularOTP(empresa, desde, hasta);
        const kpis = await kpisUITP(empresa, desde, hasta);
        const equity = equityPreliminar();
        const calidad = calidadDeDatos(otp);
        const content = {
            reporte: {
                operador: empresa
                    ? { codigo: empresa, nombre: empresaName(empresa) }
                    : null,
                periodo: {
                    desde: desde.toISOString(),
                    hasta: hasta.toISOString(),
                },
            },
            otp,
            kpisUITP: kpis,
            equityPreliminar: equity,
            calidadDeDatos: calidad,
        };
        const meta = generarMetadatos(req, content);
        if (formato === 'pdf') {
            res.status(501).json({
                error: 'Formato PDF pendiente — endpoint genera por ahora JSON estructurado',
                json: Object.assign(Object.assign({}, content), { metadatos: meta }),
            });
            return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="skillroute-regulatorio-${empresa || 'all'}-${desde.toISOString().slice(0, 10)}.json"`);
        res.json(Object.assign(Object.assign({}, content), { metadatos: meta }));
    }
    catch (err) {
        console.error('[regulatorio.export]', err);
        res.status(500).json({ error: 'Error generando reporte', detail: String(err) });
    }
});
// Reporte cross-operador (red metropolitana completa)
app.get('/export-cross-op', requireAdmin, async (req, res) => {
    try {
        const { desde, hasta } = parseDateRange(req);
        const formato = req.query.formato || 'json';
        const cobertura = await coberturaCrossOp(desde, hasta);
        const otp = await calcularOTP(null, desde, hasta);
        const kpisRed = await kpisUITP(null, desde, hasta);
        const calidadRed = calidadDeDatos(otp);
        const otpPorOperador = {};
        const calidadPorOperador = {};
        for (const empresa of [10, 20, 50, 70]) {
            const otpEmp = await calcularOTP(empresa, desde, hasta);
            otpPorOperador[empresa] = otpEmp;
            calidadPorOperador[empresa] = calidadDeDatos(otpEmp);
        }
        const content = {
            reporte: {
                tipo: 'cross-operator',
                sistema: 'Metropolitano Montevideo',
                periodo: {
                    desde: desde.toISOString(),
                    hasta: hasta.toISOString(),
                },
            },
            cobertura,
            otpRed: otp,
            otpPorOperador,
            kpisUITP: kpisRed,
            calidadDeDatos: {
                red: calidadRed,
                porOperador: calidadPorOperador,
            },
            diferenciadoresUnicos: {
                nota: 'Este reporte cross-operador es producible solo por SkillRoute. Optibus, Swiftly, Remix, Trapeze son single-tenant y no pueden generar inteligencia cruzada entre operadores.',
                operadoresIncluidos: [10, 20, 50, 70].map((e) => ({
                    codigo: e,
                    nombre: empresaName(e),
                })),
            },
        };
        const meta = generarMetadatos(req, content);
        if (formato === 'pdf') {
            res.status(501).json({
                error: 'Formato PDF pendiente — endpoint genera por ahora JSON estructurado',
                json: Object.assign(Object.assign({}, content), { metadatos: meta }),
            });
            return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="skillroute-regulatorio-cross-op-${desde.toISOString().slice(0, 10)}.json"`);
        res.json(Object.assign(Object.assign({}, content), { metadatos: meta }));
    }
    catch (err) {
        console.error('[regulatorio.export-cross-op]', err);
        res.status(500).json({ error: 'Error generando reporte', detail: String(err) });
    }
});
function empresaName(codigo) {
    switch (codigo) {
        case 10:
            return 'COETC';
        case 20:
            return 'COME';
        case 50:
            return 'CUTCSA';
        case 70:
            return 'UCOT';
        default:
            return `Empresa ${codigo}`;
    }
}
// ─── Cloud Function export ─────────────────────────────────────────
exports.regulatorio = functions
    .region('us-central1')
    .runWith({ timeoutSeconds: 60, memory: '512MB' })
    .https.onRequest(app);
