"use strict";
/**
 * complianceAlertsTick — detecta líneas con cumplimiento degradado y
 * persiste alertas en la colección `compliance_alerts`.
 *
 * Corre cada 6 horas. Por cada línea con ≥5 eventos en las últimas 24h:
 *   - pct < 50% → nivel CRITICO
 *   - 50% ≤ pct < 65% → nivel BAJO
 *   - pct ≥ 65% → elimina alerta preexistente (línea recuperada)
 *
 * Además envía FCM a todos los usuarios ADMIN/TRAFFIC con token registrado
 * cuando hay alertas CRITICO nuevas o actualizadas.
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
exports.complianceAlertsTick = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
// Defaults espejo de AlertasConfigPage — se sobreescriben desde Firestore al inicio de cada ciclo
const DEFAULTS = { UMBRAL_CRITICO: 50, UMBRAL_BAJO: 65, MIN_EVENTOS: 5 };
const NOMBRE_EMPRESA = {
    '70': 'UCOT',
    '50': 'CUTCSA',
    '20': 'COME',
    '10': 'COETC',
};
exports.complianceAlertsTick = functions.pubsub
    .schedule('every 6 hours')
    .timeZone('America/Montevideo')
    .onRun(async () => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const hace24h = admin.firestore.Timestamp.fromMillis(now.toMillis() - 24 * 60 * 60 * 1000);
    /* ── 0. Leer umbrales configurables desde Firestore ──── */
    const paramSnap = await db.collection('parametros_sistema').doc('default').get();
    const paramData = paramSnap.exists ? paramSnap.data() : {};
    const UMBRAL_CRITICO = Number((_a = paramData.UMBRAL_CRITICO) !== null && _a !== void 0 ? _a : DEFAULTS.UMBRAL_CRITICO);
    const UMBRAL_BAJO = Number((_b = paramData.UMBRAL_BAJO) !== null && _b !== void 0 ? _b : DEFAULTS.UMBRAL_BAJO);
    const MIN_EVENTOS = Number((_c = paramData.MIN_EVENTOS) !== null && _c !== void 0 ? _c : DEFAULTS.MIN_EVENTOS);
    /* ── 1. Leer eventos de las últimas 24h ─────────────── */
    const eventosSnap = await db
        .collection('vehicle_events')
        .where('createdAt', '>=', hace24h)
        .get();
    const porLinea = {};
    for (const doc of eventosSnap.docs) {
        const d = doc.data();
        const linea = String((_d = d.linea) !== null && _d !== void 0 ? _d : '?');
        const empresa = String((_f = (_e = d.codigoEmpresa) !== null && _e !== void 0 ? _e : d.empresa) !== null && _f !== void 0 ? _f : '?');
        const key = `${empresa}_${linea}`;
        if (!porLinea[key])
            porLinea[key] = { total: 0, enTiempo: 0, empresa };
        porLinea[key].total++;
        if (d.estadoCumplimiento === 'EN_TIEMPO')
            porLinea[key].enTiempo++;
    }
    /* ── 2. Calcular y escribir alertas ─────────────────── */
    const batch = db.batch();
    const nuevasCriticas = [];
    for (const [key, data] of Object.entries(porLinea)) {
        if (data.total < MIN_EVENTOS)
            continue;
        const pct = Math.round((data.enTiempo / data.total) * 100);
        const [empresa, linea] = key.split('_');
        const ref = db.collection('compliance_alerts').doc(key);
        if (pct < UMBRAL_BAJO) {
            const nivel = pct < UMBRAL_CRITICO ? 'CRITICO' : 'BAJO';
            batch.set(ref, {
                linea,
                empresa,
                empresaNombre: (_g = NOMBRE_EMPRESA[empresa]) !== null && _g !== void 0 ? _g : empresa,
                pctEnTiempo: pct,
                totalEventos: data.total,
                nivel,
                updatedAt: now,
                dismissed: false,
                dismissedBy: null,
                dismissedAt: null,
            }, { merge: true });
            if (nivel === 'CRITICO') {
                nuevasCriticas.push(`Línea ${linea} (${(_h = NOMBRE_EMPRESA[empresa]) !== null && _h !== void 0 ? _h : empresa}) — ${pct}%`);
            }
        }
        else {
            // Línea recuperada: eliminar alerta preexistente
            batch.delete(ref);
        }
    }
    await batch.commit();
    /* ── 3. FCM a supervisores si hay alertas CRITICO ───── */
    if (nuevasCriticas.length > 0) {
        const usersSnap = await db
            .collection('users')
            .where('role', 'in', ['ADMIN', 'TRAFFIC'])
            .where('fcmToken', '!=', null)
            .get();
        const tokens = usersSnap.docs
            .map((d) => d.data().fcmToken)
            .filter(Boolean);
        if (tokens.length > 0) {
            const titulo = `⚠️ ${nuevasCriticas.length} línea${nuevasCriticas.length > 1 ? 's' : ''} con cumplimiento crítico`;
            const cuerpo = nuevasCriticas.slice(0, 3).join(' · ');
            await admin.messaging().sendEachForMulticast({
                tokens,
                notification: { title: titulo, body: cuerpo },
                data: {
                    type: 'compliance_alert',
                    count: String(nuevasCriticas.length),
                    url: '/dashboard/traffic/diagnostico',
                },
                android: { priority: 'high' },
            });
        }
    }
    functions.logger.info(`complianceAlertsTick: ${Object.keys(porLinea).length} líneas analizadas, ` +
        `${nuevasCriticas.length} alertas CRITICO`);
});
