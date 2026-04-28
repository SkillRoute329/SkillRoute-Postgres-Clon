"use strict";
/**
 * incidenciaDispatcher.ts — Notificaciones FCM al crear incidencias
 * =================================================================
 * Trigger Firestore: incidencias/{incidenciaId}.onCreate
 *
 * Al crear una incidencia, envía push:
 *   - A supervisores y despachantes (role: TRAFFIC | ADMIN) — siempre
 *   - A conductores activos en la línea afectada — solo si priority es
 *     'ALTA' o 'CRITICA' (evita spam por incidencias menores)
 *
 * Usa sendMulticast para enviar a múltiples tokens en una sola llamada.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.onIncidenciaCreated = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const messaging = admin.messaging();
const SUPERVISOR_ROLES = ['traffic', 'admin', 'superadmin', 'inspector'];
/** Obtiene tokens FCM de supervisores y despachantes activos */
async function getSupervisorTokens() {
    const snap = await db.collection('users')
        .where('fcmToken', '!=', null)
        .get();
    const tokens = [];
    snap.docs.forEach((doc) => {
        var _a, _b;
        const data = doc.data();
        const role = ((_b = (_a = data.role) !== null && _a !== void 0 ? _a : data.rol) !== null && _b !== void 0 ? _b : '').toString().toLowerCase();
        if (SUPERVISOR_ROLES.includes(role) && data.fcmToken) {
            tokens.push(data.fcmToken);
        }
    });
    return tokens;
}
/** Obtiene tokens FCM de conductores activos en una línea */
async function getConductorTokensForLine(lineaCodigo) {
    var _a, _b;
    if (!lineaCodigo)
        return [];
    // 1. Buscar viajes activos en esa línea
    const viajesSnap = await db.collection('viajes_activos')
        .where('linea_id', '==', lineaCodigo)
        .get();
    if (viajesSnap.empty)
        return [];
    // 2. Para cada viaje, buscar token en users por conductor_id o coche_id
    const tokens = [];
    for (const doc of viajesSnap.docs) {
        const data = doc.data();
        const conductorId = (_a = data.conductor_id) !== null && _a !== void 0 ? _a : data.chofer_id;
        if (!conductorId)
            continue;
        // Buscar token directamente en viaje
        if (data.conductor_fcm_token) {
            tokens.push(data.conductor_fcm_token);
            continue;
        }
        // Buscar en users
        const userDoc = await db.collection('users').doc(conductorId).get();
        if (userDoc.exists && ((_b = userDoc.data()) === null || _b === void 0 ? void 0 : _b.fcmToken)) {
            tokens.push(userDoc.data().fcmToken);
        }
    }
    return tokens;
}
/** Deduplica y filtra tokens vacíos */
function uniqueTokens(tokens) {
    return [...new Set(tokens.filter((t) => t && t.length > 10))];
}
// ─── Trigger onCreate ─────────────────────────────────────────────────────────
exports.onIncidenciaCreated = functions.firestore
    .document('incidencias/{incidenciaId}')
    .onCreate(async (snap, context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const incidenciaId = context.params.incidenciaId;
    const inc = snap.data();
    if (!inc)
        return null;
    // No reenviar si ya fue procesada (p.ej. por un retry del trigger)
    if (inc.fcmSent === true)
        return null;
    const tipo = String((_b = (_a = inc.type) !== null && _a !== void 0 ? _a : inc.tipo) !== null && _b !== void 0 ? _b : 'INCIDENCIA');
    const descripcion = String((_d = (_c = inc.description) !== null && _c !== void 0 ? _c : inc.descripcion) !== null && _d !== void 0 ? _d : 'Nueva incidencia reportada');
    const lineaCodigo = String((_f = (_e = inc.lineaCodigo) !== null && _e !== void 0 ? _e : inc.linea) !== null && _f !== void 0 ? _f : '');
    const priority = String((_h = (_g = inc.priority) !== null && _g !== void 0 ? _g : inc.prioridad) !== null && _h !== void 0 ? _h : 'MEDIA').toUpperCase();
    const isUrgent = priority === 'ALTA' || priority === 'CRITICA';
    // Recopilar tokens según prioridad
    const [supervisorTokens, conductorTokens] = await Promise.all([
        getSupervisorTokens(),
        isUrgent ? getConductorTokensForLine(lineaCodigo) : Promise.resolve([]),
    ]);
    const allTokens = uniqueTokens([...supervisorTokens, ...conductorTokens]);
    if (allTokens.length === 0) {
        await snap.ref.update({
            fcmSent: false,
            fcmError: 'no_tokens_found',
            fcmErrorAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.warn(`[incidenciaDispatcher] Sin tokens FCM para incidencia ${incidenciaId}`);
        return null;
    }
    const lineaLabel = lineaCodigo ? ` — Línea ${lineaCodigo}` : '';
    const notification = {
        tokens: allTokens,
        notification: {
            title: `🚨 ${tipo}${lineaLabel}`,
            body: descripcion.slice(0, 160),
        },
        data: {
            incidenciaId,
            tipo,
            lineaCodigo,
            priority,
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
            route: '/dashboard/traffic/incidents',
        },
        android: {
            priority: isUrgent ? 'high' : 'normal',
            notification: { sound: isUrgent ? 'default' : 'silent', channelId: 'incidencias' },
        },
        apns: {
            payload: { aps: { sound: isUrgent ? 'default' : undefined, badge: 1 } },
        },
    };
    try {
        const response = await messaging.sendEachForMulticast(notification);
        const sent = response.responses.filter((r) => r.success).length;
        const failed = response.failureCount;
        await snap.ref.update({
            fcmSent: true,
            fcmSentAt: admin.firestore.FieldValue.serverTimestamp(),
            fcmTokensSent: sent,
            fcmTokensFailed: failed,
            fcmSupervisores: supervisorTokens.length,
            fcmConductores: conductorTokens.length,
        });
        console.log(`[incidenciaDispatcher] ${incidenciaId}: ${sent} pushes OK, ${failed} fallidas`);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await snap.ref.update({
            fcmSent: false,
            fcmError: msg.slice(0, 200),
            fcmErrorAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.warn(`[incidenciaDispatcher] Error enviando push:`, msg);
    }
    return null;
});
