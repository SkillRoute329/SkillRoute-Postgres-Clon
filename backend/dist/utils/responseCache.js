"use strict";
/**
 * responseCache — cache in-memory simple con TTL para endpoints pesados.
 *
 * FASE 5.14 (2026-05-13): muchos paneles del frontend hacen el mismo
 * fetch repetido (al cambiar de tab, al refrescar, al rehacer click).
 * Con queries de 1-3s sobre vehicle_events (12M filas), la UX percibida
 * es lenta. Este cache devuelve la respuesta cacheada si está fresca,
 * cortando el overhead al ~0ms.
 *
 * Diseño minimalista:
 *   - Map<string, { expiresAt, value }>
 *   - GC perezoso (al insertar nuevo, limpia expirados si Map > 200 entries)
 *   - TTL configurable por endpoint
 *
 * Cuándo NO usar: mutaciones, datos que cambian a cada segundo, respuestas
 * grandes (>1MB). Es para queries agregadas que cambian cada ~30s naturalmente.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheGet = cacheGet;
exports.cacheSet = cacheSet;
exports.cached = cached;
exports.cacheClear = cacheClear;
exports.cacheStats = cacheStats;
const store = new Map();
const MAX_ENTRIES = 200;
function cacheGet(key) {
    const entry = store.get(key);
    if (!entry)
        return undefined;
    if (entry.expiresAt < Date.now()) {
        store.delete(key);
        return undefined;
    }
    return entry.value;
}
function cacheSet(key, value, ttlMs) {
    if (store.size >= MAX_ENTRIES) {
        // GC perezoso: borrar todas las entradas expiradas
        const now = Date.now();
        for (const [k, e] of store) {
            if (e.expiresAt < now)
                store.delete(k);
        }
    }
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
}
/**
 * Wrap async function with cache. Si hay valor cacheado fresco lo devuelve;
 * sino ejecuta `fn` y guarda el resultado.
 */
async function cached(key, ttlMs, fn) {
    const hit = cacheGet(key);
    if (hit !== undefined)
        return hit;
    const value = await fn();
    cacheSet(key, value, ttlMs);
    return value;
}
function cacheClear(prefix) {
    if (!prefix) {
        const n = store.size;
        store.clear();
        return n;
    }
    let n = 0;
    for (const k of store.keys()) {
        if (k.startsWith(prefix)) {
            store.delete(k);
            n++;
        }
    }
    return n;
}
function cacheStats() {
    return { size: store.size, keys: Array.from(store.keys()).slice(0, 20) };
}
