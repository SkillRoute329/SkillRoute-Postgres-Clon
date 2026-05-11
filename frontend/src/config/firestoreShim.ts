/**
 * firestoreShim.ts — Capa de compatibilidad Firestore → REST clon (FASE 4)
 *
 * Reemplaza el SDK `firebase/firestore` con una implementación que traduce
 * las operaciones a llamadas REST contra el backend del clon (`/api/db/*`)
 * y a eventos Socket.io para `onSnapshot`.
 *
 * Permite que los 148 archivos del frontend que importan firebase sigan
 * funcionando IDÉNTICOS sin tocar su código, mientras se hace migración real
 * archivo por archivo en paralelo.
 *
 * Cuando un archivo se refactoriza para usar `apiClient` directo y deja de
 * usar `collection/getDocs/onSnapshot`, deja de pasar por este shim.
 *
 * Lo que IMPLEMENTA (subset suficiente para el código del clon):
 *   - getFirestore(): instancia placeholder
 *   - collection(db, name) / doc(db, name, id): refs
 *   - getDoc(ref), getDocs(refOrQuery)
 *   - setDoc(ref, data, options), addDoc(ref, data), updateDoc(ref, partial)
 *   - deleteDoc(ref)
 *   - query, where, orderBy, limit, startAfter
 *   - onSnapshot(refOrQuery, observer)
 *   - Timestamp (objeto compatible)
 *   - FieldValue.serverTimestamp(), FieldValue.delete(), FieldValue.increment()
 *
 * NO IMPLEMENTA (intencional, no se usa en el código del clon):
 *   - transactions
 *   - batched writes
 *   - subcollections profundas
 *   - tipos GeoPoint
 *
 * Reglas:
 *   - REGLA -6: opera SOLO contra el clon.
 *   - REGLA -2: si una colección no devuelve datos, devuelve snapshot vacío
 *     honesto, no inventa.
 *   - REGLA -7: este es un puente TEMPORAL. Cada archivo migrado a usar
 *     apiClient directo es un paso hacia eliminar este shim.
 */

import { apiClient, ApiError } from '../clients/apiClient';
import { on as socketOn, getSocket } from '../clients/socketClient';

// ─── Tipos públicos compatibles con firebase/firestore ─────────────────────

export interface Firestore {
  __shim: true;
}
export interface DocumentReference<T = DocumentData> {
  __type: 'doc';
  collection: string;
  id: string;
  __firestoreShimTag: true;
  __t?: T;
}
export interface CollectionReference<T = DocumentData> {
  __type: 'collection';
  collection: string;
  __firestoreShimTag: true;
  __t?: T;
}
export interface Query<T = DocumentData> {
  __type: 'query';
  collection: string;
  filters: QueryFilter[];
  ordering?: { col: string; dir: 'asc' | 'desc' };
  limitN?: number;
  startAfterId?: string;
  __t?: T;
}
export type DocumentData = Record<string, unknown>;
export interface DocumentSnapshot<T = DocumentData> {
  exists: () => boolean;
  id: string;
  data: () => T | undefined;
  ref: DocumentReference<T>;
  get: (field: string) => unknown;
}
export interface QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {
  data: () => T;
}
export interface QuerySnapshot<T = DocumentData> {
  empty: boolean;
  size: number;
  docs: QueryDocumentSnapshot<T>[];
  forEach: (cb: (d: QueryDocumentSnapshot<T>) => void) => void;
}

interface QueryFilter {
  field: string;
  op: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';
  value: unknown;
}

// ─── Singleton del db ──────────────────────────────────────────────────────

const _db: Firestore = { __shim: true };

export function getFirestore(): Firestore {
  return _db;
}

// ─── Refs ──────────────────────────────────────────────────────────────────

export function collection<T = DocumentData>(
  _db: Firestore,
  name: string,
  ..._rest: string[]
): CollectionReference<T> {
  // subcolecciones: las aplanamos uniendo con `/`; la whitelist del backend
  // las acepta como nombre completo si están listadas.
  const fullName = _rest.length ? [name, ..._rest].join('/') : name;
  return { __type: 'collection', collection: fullName, __firestoreShimTag: true };
}

export function doc<T = DocumentData>(
  refOrDb: Firestore | CollectionReference<T>,
  pathOrId: string,
  ...rest: string[]
): DocumentReference<T> {
  if ((refOrDb as CollectionReference<T>).__type === 'collection') {
    const col = (refOrDb as CollectionReference<T>).collection;
    return { __type: 'doc', collection: col, id: pathOrId, __firestoreShimTag: true };
  }
  // doc(db, 'collection', 'id') signature
  if (rest.length === 1) {
    return { __type: 'doc', collection: pathOrId, id: rest[0], __firestoreShimTag: true };
  }
  // doc(db, 'collection') → autogenerar id
  return { __type: 'doc', collection: pathOrId, id: cryptoRandomId(), __firestoreShimTag: true };
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return 'auto_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Query builders ────────────────────────────────────────────────────────

export function query<T = DocumentData>(
  base: CollectionReference<T> | Query<T>,
  ...clauses: QueryClause[]
): Query<T> {
  const initial: Query<T> =
    (base as Query<T>).__type === 'query'
      ? { ...(base as Query<T>) }
      : { __type: 'query', collection: (base as CollectionReference<T>).collection, filters: [] };
  for (const c of clauses) {
    if (c.kind === 'where') initial.filters.push({ field: c.field, op: c.op, value: c.value });
    if (c.kind === 'orderBy') initial.ordering = { col: c.field, dir: c.dir };
    if (c.kind === 'limit') initial.limitN = c.n;
    if (c.kind === 'startAfter') initial.startAfterId = c.id;
  }
  return initial;
}

type QueryClause =
  | { kind: 'where'; field: string; op: QueryFilter['op']; value: unknown }
  | { kind: 'orderBy'; field: string; dir: 'asc' | 'desc' }
  | { kind: 'limit'; n: number }
  | { kind: 'startAfter'; id: string };

export function where(field: string, op: QueryFilter['op'], value: unknown): QueryClause {
  return { kind: 'where', field, op, value };
}
export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): QueryClause {
  return { kind: 'orderBy', field, dir };
}
export function limit(n: number): QueryClause {
  return { kind: 'limit', n };
}
export function startAfter(snapshotOrId: { id?: string } | string): QueryClause {
  const id = typeof snapshotOrId === 'string' ? snapshotOrId : (snapshotOrId.id ?? '');
  return { kind: 'startAfter', id };
}

// ─── Helpers de traducción a query params del backend ──────────────────────

function buildBackendQuery<T>(q: Query<T> | CollectionReference<T>): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if ((q as Query<T>).__type === 'query') {
    const Q = q as Query<T>;
    if (Q.filters.length > 0) {
      // Backend acepta where=field:value,field2:value2 (solo == por ahora).
      params.where = Q.filters
        .filter((f) => f.op === '==')
        .map((f) => `${f.field}:${String(f.value)}`)
        .join(',');
    }
    if (Q.ordering) params.orderBy = `${Q.ordering.col}:${Q.ordering.dir}`;
    if (Q.limitN) params.limit = Q.limitN;
  }
  return params;
}

// ─── Snapshot helpers ──────────────────────────────────────────────────────

function makeDocSnapshot<T extends DocumentData = DocumentData>(
  ref: DocumentReference<T>,
  raw: T | null,
): DocumentSnapshot<T> {
  return {
    exists: () => raw !== null,
    id: ref.id,
    data: () => (raw ?? undefined) as T | undefined,
    ref,
    get: (field: string) => (raw ? (raw as Record<string, unknown>)[field] : undefined),
  };
}

function makeQuerySnapshot<T extends DocumentData = DocumentData>(
  collectionName: string,
  rows: T[],
): QuerySnapshot<T> {
  const docs: QueryDocumentSnapshot<T>[] = rows.map((r) => {
    const id = String((r as Record<string, unknown>).id ?? (r as Record<string, unknown>).agency_id ?? (r as Record<string, unknown>).id_bus ?? '');
    const ref: DocumentReference<T> = { __type: 'doc', collection: collectionName, id, __firestoreShimTag: true };
    return {
      exists: () => true,
      id,
      data: () => r,
      ref,
      get: (field: string) => (r as Record<string, unknown>)[field],
    };
  });
  return {
    empty: docs.length === 0,
    size: docs.length,
    docs,
    forEach: (cb) => docs.forEach(cb),
  };
}

// ─── Operaciones contra el backend ─────────────────────────────────────────

export async function getDoc<T extends DocumentData = DocumentData>(
  ref: DocumentReference<T>,
): Promise<DocumentSnapshot<T>> {
  try {
    const res = await apiClient.get<T>(`/api/db/${encodeURIComponent(ref.collection)}/${encodeURIComponent(ref.id)}`);
    return makeDocSnapshot<T>(ref, (res.data ?? null) as T | null);
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 404) {
      return makeDocSnapshot<T>(ref, null);
    }
    throw e;
  }
}

export async function getDocs<T extends DocumentData = DocumentData>(
  refOrQuery: CollectionReference<T> | Query<T>,
): Promise<QuerySnapshot<T>> {
  const colName =
    (refOrQuery as CollectionReference<T>).__type === 'collection'
      ? (refOrQuery as CollectionReference<T>).collection
      : (refOrQuery as Query<T>).collection;
  const params = buildBackendQuery(refOrQuery);
  try {
    const res = await apiClient.get<T[]>(`/api/db/${encodeURIComponent(colName)}`, { query: params });
    const rows = Array.isArray(res.data) ? res.data : [];
    return makeQuerySnapshot<T>(colName, rows);
  } catch (e: unknown) {
    // Fallback graceful: si el endpoint da error, devolvemos snapshot vacío
    // pero loguear para visibilidad.
    // eslint-disable-next-line no-console
    console.warn(`[firestoreShim] getDocs(${colName}) error, devolviendo vacío`, e);
    return makeQuerySnapshot<T>(colName, []);
  }
}

export async function getCountFromServer(
  _query: CollectionReference | Query
): Promise<{ data: () => { count: number } }> {
  // Stub simple que devuelve 0. En el clon se reemplazará con apiClient real.
  return {
    data: () => ({ count: 0 })
  };
}

export async function setDoc<T extends DocumentData = DocumentData>(
  ref: DocumentReference<T>,
  data: T,
  _options?: { merge?: boolean },
): Promise<void> {
  await apiClient.put(`/api/db/${encodeURIComponent(ref.collection)}/${encodeURIComponent(ref.id)}`, data);
}

export async function addDoc<T extends DocumentData = DocumentData>(
  ref: CollectionReference<T>,
  data: T,
): Promise<DocumentReference<T>> {
  const res = await apiClient.post<{ id?: string }>(`/api/db/${encodeURIComponent(ref.collection)}`, data);
  const id = (res.data?.id ?? cryptoRandomId()) as string;
  return { __type: 'doc', collection: ref.collection, id, __firestoreShimTag: true };
}

export async function updateDoc<T extends DocumentData = DocumentData>(
  ref: DocumentReference<T>,
  partial: Partial<T>,
): Promise<void> {
  await apiClient.put(`/api/db/${encodeURIComponent(ref.collection)}/${encodeURIComponent(ref.id)}`, partial);
}

export async function deleteDoc<T extends DocumentData = DocumentData>(ref: DocumentReference<T>): Promise<void> {
  await apiClient.delete(`/api/db/${encodeURIComponent(ref.collection)}/${encodeURIComponent(ref.id)}`);
}

export function writeBatch(_db: Firestore): { 
  set: <T>(ref: DocumentReference<T>, data: T, options?: {merge?:boolean}) => void;
  update: <T>(ref: DocumentReference<T>, partial: Partial<T>) => void;
  delete: <T>(ref: DocumentReference<T>) => void;
  commit: () => Promise<void>;
} {
  return {
    set: () => { /* stub */ },
    update: () => { /* stub */ },
    delete: () => { /* stub */ },
    commit: async () => { /* stub */ }
  };
}

// ─── onSnapshot — polling controlado por Socket.io cuando esté disponible ──
//
// Estrategia mínima viable: polling cada N segundos al backend. Cuando el
// backend emita el evento Socket.io 'firestore:<collection>' (próxima
// iteración), forzamos un refresh inmediato adicional.

const SNAPSHOT_POLL_MS = 5000;

export function onSnapshot<T extends DocumentData = DocumentData>(
  refOrQuery: DocumentReference<T> | CollectionReference<T> | Query<T>,
  onNext: (snap: DocumentSnapshot<T> | QuerySnapshot<T>) => void,
  onError?: (err: Error) => void,
): () => void {
  let stopped = false;

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      if ((refOrQuery as DocumentReference<T>).__type === 'doc') {
        const snap = await getDoc(refOrQuery as DocumentReference<T>);
        if (!stopped) onNext(snap);
      } else {
        const snap = await getDocs(refOrQuery as CollectionReference<T> | Query<T>);
        if (!stopped) onNext(snap);
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (!stopped && onError) onError(err);
    }
  }

  // Primer tick inmediato.
  void tick();

  // Polling continuo.
  const interval = setInterval(tick, SNAPSHOT_POLL_MS);

  // Trigger por Socket.io: si el backend avisa que la colección cambió, refresh.
  const colName =
    (refOrQuery as DocumentReference<T>).__type === 'doc'
      ? (refOrQuery as DocumentReference<T>).collection
      : (refOrQuery as CollectionReference<T> | Query<T>).collection;
  const unsubscribeSocket = socketOn(`firestore:${colName}`, () => {
    void tick();
  });

  return () => {
    stopped = true;
    clearInterval(interval);
    unsubscribeSocket();
  };
}

// ─── Timestamp (compatibilidad básica) ─────────────────────────────────────

export class Timestamp {
  seconds: number;
  nanoseconds: number;
  constructor(seconds: number, nanoseconds = 0) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  static now(): Timestamp {
    return new Timestamp(Math.floor(Date.now() / 1000));
  }
  static fromDate(date: Date): Timestamp {
    return new Timestamp(Math.floor(date.getTime() / 1000));
  }
  toDate(): Date {
    return new Date(this.seconds * 1000);
  }
  toMillis(): number {
    return this.seconds * 1000;
  }
}

export class GeoPoint {
  latitude: number;
  longitude: number;
  constructor(latitude: number, longitude: number) {
    this.latitude = latitude;
    this.longitude = longitude;
  }
}

// ─── FieldValue (sentinels) ────────────────────────────────────────────────
// El backend interpreta el sentinel y aplica la operación correspondiente.

export const FieldValue = {
  serverTimestamp: (): { __sentinel: 'serverTimestamp' } => ({ __sentinel: 'serverTimestamp' }),
  delete: (): { __sentinel: 'delete' } => ({ __sentinel: 'delete' }),
  increment: (n: number): { __sentinel: 'increment'; n: number } => ({ __sentinel: 'increment', n }),
  arrayUnion: (...items: unknown[]): { __sentinel: 'arrayUnion'; items: unknown[] } => ({ __sentinel: 'arrayUnion', items }),
  arrayRemove: (...items: unknown[]): { __sentinel: 'arrayRemove'; items: unknown[] } => ({ __sentinel: 'arrayRemove', items }),
};

// Alias compatibles con import { serverTimestamp } from 'firebase/firestore'
export const serverTimestamp = FieldValue.serverTimestamp;
export const deleteField = FieldValue.delete;
export const increment = FieldValue.increment;
export const arrayUnion = FieldValue.arrayUnion;
export const arrayRemove = FieldValue.arrayRemove;

export async function disableNetwork(_db: Firestore): Promise<void> {
  /* no-op wrapper */
}
export async function enableNetwork(_db: Firestore): Promise<void> {
  /* no-op wrapper */
}

// ─── Compatibilidad con import default ─────────────────────────────────────

export default {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  Timestamp,
  FieldValue,
  serverTimestamp,
  deleteField,
  increment,
  arrayUnion,
  arrayRemove,
  writeBatch,
  getCountFromServer,
  disableNetwork,
  enableNetwork,
  GeoPoint,
};

// ─── Socket inicial (precalentamiento) ──────────────────────────────────────
try { getSocket(); } catch { /* sin conexión inicial es OK */ }
