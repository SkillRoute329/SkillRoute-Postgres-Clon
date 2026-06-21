"use strict";
/**
 * AIOrdersService — colección `ai_orders`
 *
 * Toda sugerencia que el copiloto emita (retener interno, adelantar paso,
 * levantar alerta) queda como documento en Firestore con ciclo de vida:
 *
 *   suggested  ──(aprobación humana)──▶  approved  ──(ejecución futura)──▶  executed
 *                  └──(rechazo)────▶     rejected
 *                  └──(TTL 30min)──▶     expired
 *
 * Las únicas escrituras se hacen desde el BACKEND (service-account bypass
 * de reglas). El frontend solo lee y dispara approve/reject vía REST.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSuggestion = createSuggestion;
exports.listPendingOrders = listPendingOrders;
exports.getOrder = getOrder;
exports.approveOrder = approveOrder;
exports.rejectOrder = rejectOrder;
const firebase_1 = require("../config/firebase");
const logger_1 = __importDefault(require("../config/logger"));
const COLLECTION = 'ai_orders';
const SUGGESTION_TTL_MIN = 30;
/**
 * Crea una sugerencia en estado `suggested`. Solo el backend puede hacer esto.
 * Devuelve el documento recién creado (con su id).
 */
async function createSuggestion(input) {
    const ref = firebase_1.db.collection(COLLECTION).doc();
    const now = new Date();
    const doc = {
        ...input,
        id: ref.id,
        status: 'suggested',
        createdAt: now,
    };
    await ref.set(doc);
    logger_1.default.info(`[AiOrders] Sugerencia creada ${doc.type} #${ref.id}`, {
        model: doc.createdByModel,
        target: doc.targetInternalNumber,
    });
    return doc;
}
async function listPendingOrders(limit = 20) {
    // Evitamos orderBy en Firestore (requeriría índice compuesto con status).
    // Ordenamos en memoria — aceptable mientras haya < ~500 sugerencias pendientes.
    const snap = await firebase_1.db.collection(COLLECTION).where('status', '==', 'suggested').get();
    const orders = snap.docs.map((d) => d.data());
    return orders
        .sort((a, b) => {
        const toMs = (v) => v instanceof Date
            ? v.getTime()
            : typeof v === 'object' && v && 'toDate' in v
                ? v.toDate().getTime()
                : new Date(v).getTime();
        return toMs(b.createdAt) - toMs(a.createdAt);
    })
        .slice(0, limit);
}
async function getOrder(id) {
    const doc = await firebase_1.db.collection(COLLECTION).doc(id).get();
    if (!doc.exists)
        return null;
    return doc.data();
}
/**
 * Aprueba una sugerencia (suggested → approved). Solo permitido si estaba `suggested`
 * y no venció el TTL.
 */
async function approveOrder(id, userId) {
    const ref = firebase_1.db.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists)
        throw new Error('Orden no encontrada');
    const current = snap.data();
    if (current.status !== 'suggested') {
        throw new Error(`No se puede aprobar: estado actual '${current.status}'`);
    }
    if (isExpired(current)) {
        await ref.update({ status: 'expired' });
        throw new Error('Sugerencia vencida (TTL excedido)');
    }
    const now = new Date();
    await ref.update({
        status: 'approved',
        approvedByUserId: userId,
        approvedAt: now,
    });
    logger_1.default.info(`[AiOrders] Aprobada ${id} por ${userId}`);
    return { ...current, status: 'approved', approvedByUserId: userId, approvedAt: now };
}
async function rejectOrder(id, userId, reason) {
    const ref = firebase_1.db.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists)
        throw new Error('Orden no encontrada');
    const current = snap.data();
    if (current.status !== 'suggested') {
        throw new Error(`No se puede rechazar: estado actual '${current.status}'`);
    }
    const now = new Date();
    await ref.update({
        status: 'rejected',
        rejectedByUserId: userId,
        rejectedAt: now,
        rejectionReason: reason,
    });
    logger_1.default.info(`[AiOrders] Rechazada ${id} por ${userId}: ${reason}`);
    return {
        ...current,
        status: 'rejected',
        rejectedByUserId: userId,
        rejectedAt: now,
        rejectionReason: reason,
    };
}
function isExpired(order) {
    const created = order.createdAt instanceof Date
        ? order.createdAt
        : new Date(order.createdAt.toDate?.() ?? order.createdAt);
    return Date.now() - created.getTime() > SUGGESTION_TTL_MIN * 60 * 1000;
}
