/**
 * parametrosOperativos.ts — Service Firestore para parámetros operativos
 * =====================================================================
 *
 * Cierre de Fase 1 (2026-04-23):
 *   Convierte el archivo estático `parametros-operativos.ts` en una fuente
 *   de verdad DINÁMICA editable por Super Admin desde UI.
 *
 * Arquitectura:
 *   Firestore `parametros_operativos/{key}`   → valor vigente
 *   Firestore `parametros_operativos_historial/{autoId}` → auditoría
 *   Cache en memoria                          → lectura sincrónica rápida
 *   Archivo local `config/parametros-operativos.ts` → defaults/fallback
 *
 * Política no-regresión:
 *   Los callers que importan las constantes del archivo siguen funcionando.
 *   Esta capa es OPT-IN: solo componentes nuevos (UI admin) la usan.
 *   Cuando queramos que un caller use la versión dinámica, se migra al
 *   helper `getParametroValor(key)` que devuelve el valor de cache.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  limit,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase';
import {
  PARAMETROS_REGISTRY,
  type ParametroEconomico,
  type ConfidenceLevel,
} from '../../config/parametros-operativos';

/** Colecciones Firestore. */
const COL_PARAMS = 'parametros_operativos';
const COL_HISTORIAL = 'parametros_operativos_historial';

/** Cache en memoria — clave → parámetro completo (defaults + override Firestore). */
const cache = new Map<string, ParametroEconomico>();

/** Flag de inicialización: true tras el primer load exitoso desde Firestore. */
let initialized = false;

/** Listener activo de onSnapshot — se setea al usar `subscribeAll()`. */
let activeUnsub: Unsubscribe | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// MODELO DOCUMENTO FIRESTORE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Forma de un documento `parametros_operativos/{key}`.
 * Es el mismo shape que `ParametroEconomico` pero añade auditoría.
 */
export interface ParametroDoc extends ParametroEconomico {
  /** UID del último usuario que actualizó este parámetro. */
  updatedBy?: string;
  /** Nombre del último usuario que actualizó. */
  updatedByName?: string;
  /** Timestamp de última actualización (Firestore server time). */
  updatedAt?: Timestamp;
}

export interface HistorialEntry {
  id?: string;
  key: string;
  valorAnterior: any;
  valorNuevo: any;
  fuenteAnterior?: string;
  fuenteNueva?: string;
  changedBy: string;
  changedByName: string;
  timestamp: Timestamp;
  motivo?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN Y CACHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Carga cache con defaults del archivo local (sin tocar red).
 * Se ejecuta la primera vez que se accede a cualquier helper.
 */
function bootDefaults(): void {
  for (const [key, param] of Object.entries(PARAMETROS_REGISTRY)) {
    if (!cache.has(key)) cache.set(key, param);
  }
}

/**
 * Carga todos los parámetros desde Firestore y fusiona con defaults.
 * Los documentos de Firestore OVERRIDEN los defaults.
 * Si Firestore falla, queda el cache con defaults locales (fallback silencioso).
 */
export async function loadAll(): Promise<ParametroEconomico[]> {
  bootDefaults();
  try {
    const snap = await getDocs(collection(db, COL_PARAMS));
    snap.forEach((d) => {
      const data = d.data() as ParametroDoc;
      cache.set(d.id, { ...PARAMETROS_REGISTRY[d.id], ...data });
    });
    initialized = true;
  } catch (err) {
    console.warn('[parametrosOperativos] Fallo al leer Firestore, usando defaults locales:', err);
  }
  return Array.from(cache.values());
}

/**
 * Suscribe al snapshot de la colección — mantiene cache actualizado.
 * Devuelve unsubscribe; si ya había uno activo, lo reemplaza.
 */
export function subscribeAll(cb: (params: ParametroEconomico[]) => void): Unsubscribe {
  bootDefaults();
  if (activeUnsub) activeUnsub();
  activeUnsub = onSnapshot(
    collection(db, COL_PARAMS),
    (snap) => {
      snap.forEach((d) => {
        const data = d.data() as ParametroDoc;
        cache.set(d.id, { ...PARAMETROS_REGISTRY[d.id], ...data });
      });
      initialized = true;
      cb(Array.from(cache.values()));
    },
    (err) => {
      console.warn('[parametrosOperativos] Suscripción falló, usando cache:', err);
      cb(Array.from(cache.values()));
    },
  );
  return activeUnsub;
}

/**
 * Devuelve el valor de un parámetro desde cache (sincrónico).
 * Si no está en cache, usa el default del archivo local.
 * Si la clave no existe en ningún lado, devuelve `undefined`.
 */
export function getParametroValor<T = number>(key: string): T | undefined {
  bootDefaults();
  const p = cache.get(key);
  return p?.valor as T | undefined;
}

/** Devuelve el parámetro completo desde cache (con toda su metadata). */
export function getParametro(key: string): ParametroEconomico | undefined {
  bootDefaults();
  return cache.get(key);
}

/** Devuelve todos los parámetros desde cache. */
export function listParametros(): Array<{ key: string; param: ParametroEconomico }> {
  bootDefaults();
  return Array.from(cache.entries()).map(([key, param]) => ({ key, param }));
}

export function isInitialized(): boolean {
  return initialized;
}

// ═══════════════════════════════════════════════════════════════════════════
// ESCRITURA — solo Super Admin (validado por Firestore rules)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Actualiza un parámetro. Escribe el doc principal + entrada de historial.
 * La regla Firestore valida que el usuario tenga rol admin/superadmin.
 *
 * @param key        clave del parámetro (ej. 'TARIFA_STM')
 * @param updates    campos a modificar (valor, fuente, fuenteUrl, etc.)
 * @param motivo     texto opcional para el historial
 */
export async function updateParametro(
  key: string,
  updates: Partial<ParametroEconomico>,
  motivo?: string,
): Promise<void> {
  bootDefaults();
  const user = auth.currentUser;
  if (!user) throw new Error('Requiere sesión autenticada.');

  const prev = cache.get(key) ?? PARAMETROS_REGISTRY[key];
  if (!prev) throw new Error(`Parámetro desconocido: ${key}`);

  const merged: ParametroDoc = {
    ...prev,
    ...updates,
    // Nunca permitir cambiar el tipo/unidad desde UI (solo valor y fuente)
    unidad: prev.unidad,
    // Mantener fechaVigenciaDesde del default si no se provee una nueva
    fechaVigenciaDesde: updates.fechaVigenciaDesde ?? new Date().toISOString().slice(0, 10),
    updatedBy: user.uid,
    updatedByName: user.displayName ?? user.email ?? 'Super Admin',
    updatedAt: serverTimestamp() as unknown as Timestamp,
  };

  // 1. Upsert documento principal
  await setDoc(doc(db, COL_PARAMS, key), merged, { merge: true });

  // 2. Append historial (audit trail inmutable)
  await addDoc(collection(db, COL_HISTORIAL), {
    key,
    valorAnterior: prev.valor,
    valorNuevo: merged.valor,
    fuenteAnterior: prev.fuente,
    fuenteNueva: merged.fuente,
    changedBy: user.uid,
    changedByName: user.displayName ?? user.email ?? 'Super Admin',
    timestamp: serverTimestamp(),
    motivo: motivo ?? null,
  });

  // 3. Actualizar cache local
  cache.set(key, merged);
}

/**
 * Seed inicial: vuelca los defaults del archivo local a Firestore
 * (solo los que no existen ya). Idempotente — se puede correr varias veces.
 *
 * Útil la primera vez que se abre la UI de Super Admin en un proyecto fresco.
 */
export async function seedInitial(): Promise<{ creados: number; existentes: number }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Requiere sesión autenticada.');

  let creados = 0;
  let existentes = 0;
  for (const [key, param] of Object.entries(PARAMETROS_REGISTRY)) {
    const ref = doc(db, COL_PARAMS, key);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      existentes++;
      continue;
    }
    await setDoc(ref, {
      ...param,
      updatedBy: user.uid,
      updatedByName: user.displayName ?? user.email ?? 'Super Admin (seed)',
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, COL_HISTORIAL), {
      key,
      valorAnterior: null,
      valorNuevo: param.valor,
      fuenteAnterior: null,
      fuenteNueva: param.fuente,
      changedBy: user.uid,
      changedByName: user.displayName ?? user.email ?? 'Super Admin (seed)',
      timestamp: serverTimestamp(),
      motivo: 'Seed inicial desde archivo local',
    });
    creados++;
  }
  return { creados, existentes };
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORIAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Obtiene las últimas N entradas de historial de un parámetro (default 10).
 * Requiere índice Firestore sobre (key ASC, timestamp DESC) — ver firestore.indexes.json.
 */
export async function getHistorial(key: string, max: number = 10): Promise<HistorialEntry[]> {
  try {
    const q = query(
      collection(db, COL_HISTORIAL),
      where('key', '==', key),
      orderBy('timestamp', 'desc'),
      limit(max),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HistorialEntry, 'id'>) }));
  } catch (err) {
    console.warn('[parametrosOperativos] Historial no disponible:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES PARA UI
// ═══════════════════════════════════════════════════════════════════════════

/** Devuelve clases Tailwind para el badge de confidence. */
export function confidenceBadgeClass(c: ConfidenceLevel): string {
  switch (c) {
    case 'oficial':   return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'calibrado': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    case 'estimado':  return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'hardcoded': return 'bg-red-500/15 text-red-400 border-red-500/30';
    default:          return 'bg-slate-700/40 text-slate-400 border-slate-600';
  }
}

export function confidenceLabelEs(c: ConfidenceLevel): string {
  switch (c) {
    case 'oficial':   return 'Oficial';
    case 'calibrado': return 'Calibrado (literatura)';
    case 'estimado':  return 'Estimación';
    case 'hardcoded': return 'Provisional';
    default:          return 'Desconocido';
  }
}
