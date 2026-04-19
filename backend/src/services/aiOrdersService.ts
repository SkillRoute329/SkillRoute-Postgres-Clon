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

import { db } from '../config/firebase';
import logger from '../config/logger';

export type AiOrderStatus =
  | 'suggested'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'expired';

export type AiOrderType = 'hold_vehicle' | 'advance_vehicle' | 'raise_alert';

export interface AiOrder {
  id: string;
  type: AiOrderType;
  targetInternalNumber?: string;
  lineId?: string;
  params: Record<string, unknown>;
  summary: string;
  status: AiOrderStatus;
  createdAt: Date;
  createdByModel: string;
  requestedByUserId: string;
  conversationContext?: string;
  approvedByUserId?: string;
  approvedAt?: Date;
  rejectedByUserId?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  executedAt?: Date;
  outcomeNotes?: string;
}

const COLLECTION = 'ai_orders';
const SUGGESTION_TTL_MIN = 30;

/**
 * Crea una sugerencia en estado `suggested`. Solo el backend puede hacer esto.
 * Devuelve el documento recién creado (con su id).
 */
export async function createSuggestion(
  input: Omit<AiOrder, 'id' | 'status' | 'createdAt'>,
): Promise<AiOrder> {
  const ref = db.collection(COLLECTION).doc();
  const now = new Date();

  const doc: AiOrder = {
    ...input,
    id: ref.id,
    status: 'suggested',
    createdAt: now,
  };

  await ref.set(doc);
  logger.info(`[AiOrders] Sugerencia creada ${doc.type} #${ref.id}`, {
    model: doc.createdByModel,
    target: doc.targetInternalNumber,
  });
  return doc;
}

export async function listPendingOrders(limit = 20): Promise<AiOrder[]> {
  // Evitamos orderBy en Firestore (requeriría índice compuesto con status).
  // Ordenamos en memoria — aceptable mientras haya < ~500 sugerencias pendientes.
  const snap = await db.collection(COLLECTION).where('status', '==', 'suggested').get();
  const orders = snap.docs.map((d) => d.data() as AiOrder);
  return orders
    .sort((a, b) => {
      const toMs = (v: unknown) =>
        v instanceof Date
          ? v.getTime()
          : typeof v === 'object' && v && 'toDate' in v
            ? (v as { toDate: () => Date }).toDate().getTime()
            : new Date(v as string).getTime();
      return toMs(b.createdAt) - toMs(a.createdAt);
    })
    .slice(0, limit);
}

export async function getOrder(id: string): Promise<AiOrder | null> {
  const doc = await db.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return doc.data() as AiOrder;
}

/**
 * Aprueba una sugerencia (suggested → approved). Solo permitido si estaba `suggested`
 * y no venció el TTL.
 */
export async function approveOrder(id: string, userId: string): Promise<AiOrder> {
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();

  if (!snap.exists) throw new Error('Orden no encontrada');
  const current = snap.data() as AiOrder;

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

  logger.info(`[AiOrders] Aprobada ${id} por ${userId}`);
  return { ...current, status: 'approved', approvedByUserId: userId, approvedAt: now };
}

export async function rejectOrder(
  id: string,
  userId: string,
  reason: string,
): Promise<AiOrder> {
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();

  if (!snap.exists) throw new Error('Orden no encontrada');
  const current = snap.data() as AiOrder;

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

  logger.info(`[AiOrders] Rechazada ${id} por ${userId}: ${reason}`);
  return {
    ...current,
    status: 'rejected',
    rejectedByUserId: userId,
    rejectedAt: now,
    rejectionReason: reason,
  };
}

function isExpired(order: AiOrder): boolean {
  const created =
    order.createdAt instanceof Date
      ? order.createdAt
      : new Date((order.createdAt as { toDate?: () => Date }).toDate?.() ?? order.createdAt);
  return Date.now() - created.getTime() > SUGGESTION_TTL_MIN * 60 * 1000;
}
