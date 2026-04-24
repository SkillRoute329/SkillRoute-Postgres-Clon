/**
 * disruptions.ts — Servicio Firestore de disrupciones operacionales
 * Trim+ #67 (2026-04-23)
 *
 * CRUD + state machine para colección `disruptions`.
 * Todas las transiciones se validan contra `canTransition()`.
 */

import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit as limitFn,
  onSnapshot,
  serverTimestamp,
  getDocs,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from '../../../config/firebase';
import {
  type Disruption,
  type DisruptionStatus,
  type DisruptionCreatePayload,
  DisruptionCreatePayloadSchema,
  DisruptionSchema,
  canTransition,
} from '../schemas/disruption';
import { safeParseOrLog } from '../../../schemas';

const COL = 'disruptions';

/**
 * Crea una disrupción nueva. La validación Zod corre antes de escribir —
 * si el payload es inválido, tira descriptivamente sin tocar Firestore.
 */
export async function createDisruption(
  payload: DisruptionCreatePayload,
): Promise<{ id: string }> {
  const parsed = DisruptionCreatePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `createDisruption: payload inválido — ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  const user = auth.currentUser;
  const now = serverTimestamp();
  const doc = {
    ...parsed.data,
    estado: 'DETECTED' as DisruptionStatus,
    createdAt: now,
    detectedAt: now,
    reportedBy: user?.uid ?? parsed.data.reportedBy,
    reportedByName: user?.displayName ?? user?.email ?? parsed.data.reportedByName,
    accionesRealizadas: [],
    alertasRelacionadas: [],
    desviosRelacionados: [],
  };
  const ref = await addDoc(collection(db, COL), doc);
  return { id: ref.id };
}

/**
 * Transiciona el estado de una disrupción.
 * Valida: disrupción existe + transición permitida + permiso usuario (reglas Firestore).
 */
export async function transitionDisruption(
  id: string,
  newStatus: DisruptionStatus,
  extras: Partial<Disruption> = {},
): Promise<void> {
  const ref = doc(db, COL, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Disruption ${id} no existe`);
  const current = snap.data() as Disruption;
  if (!canTransition(current.estado, newStatus)) {
    throw new Error(
      `Transición inválida: ${current.estado} → ${newStatus}. Ver VALID_TRANSITIONS.`,
    );
  }

  const user = auth.currentUser;
  const now = serverTimestamp();
  const update: Record<string, unknown> = {
    estado: newStatus,
    ...extras,
  };

  // Auto-sellado timestamps por transición
  if (newStatus === 'ACKNOWLEDGED') {
    update.acknowledgedAt = now;
    if (!update.assignedTo) update.assignedTo = user?.uid;
    if (!update.assignedToName) update.assignedToName = user?.displayName ?? user?.email;
  }
  if (newStatus === 'RESOLVED' || newStatus === 'CANCELLED') {
    update.resolvedAt = now;
  }

  await updateDoc(ref, update);
}

/** Listener real-time de disrupciones activas (no resueltas ni canceladas). */
export function subscribeActiveDisruptions(
  cb: (list: Disruption[]) => void,
  opts: { operadorId?: string; maxItems?: number } = {},
): Unsubscribe {
  const base = collection(db, COL);
  const constraints = [
    where('estado', 'in', ['DETECTED', 'ACKNOWLEDGED', 'IN_PROGRESS']),
    orderBy('createdAt', 'desc'),
    limitFn(opts.maxItems ?? 100),
  ];
  const q = opts.operadorId
    ? query(base, where('operadorId', '==', opts.operadorId), ...constraints)
    : query(base, ...constraints);
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Disruption[] = [];
      snapshot.forEach((d) => {
        const parsed = safeParseOrLog(DisruptionSchema, { id: d.id, ...d.data() }, `disruptions/${d.id}`);
        if (parsed) list.push(parsed);
      });
      cb(list);
    },
    (err) => console.warn('[disruptions] listener fallido:', err),
  );
}

/** Fetch histórico — últimas N disrupciones resueltas/canceladas. */
export async function fetchHistory(opts: { operadorId?: string; limit?: number } = {}): Promise<Disruption[]> {
  const base = collection(db, COL);
  const constraints = [
    where('estado', 'in', ['RESOLVED', 'CANCELLED']),
    orderBy('resolvedAt', 'desc'),
    limitFn(opts.limit ?? 50),
  ];
  const q = opts.operadorId
    ? query(base, where('operadorId', '==', opts.operadorId), ...constraints)
    : query(base, ...constraints);
  const snap = await getDocs(q);
  const list: Disruption[] = [];
  snap.forEach((d) => {
    const parsed = safeParseOrLog(DisruptionSchema, { id: d.id, ...d.data() }, `disruptions_history/${d.id}`);
    if (parsed) list.push(parsed);
  });
  return list;
}
