/**
 * dbBridgeController.ts — Endpoint REST genérico para el shim Firestore (FASE 4)
 *
 * Sirve operaciones CRUD básicas sobre cualquier tabla Postgres listada en la
 * whitelist. Diseñado para que el shim del frontend (firestoreShim.ts) pueda
 * traducir `getDocs(collection(db, 'X'))` a `GET /api/db/X` sin necesidad de
 * escribir un controller específico por colección.
 *
 * Cuando un archivo del frontend se migra a usar endpoints REST específicos
 * (ej. /api/cartones, /api/fleet/vehicles), deja de pasar por acá.
 *
 * Reglas:
 *   - REGLA -3 OWASP A01: whitelist explícita de colecciones permitidas. Nada
 *     de `${req.params.collection}` en SQL sin validar.
 *   - REGLA -3 OWASP A03: todas las queries van con Knex parametrizado.
 *   - REGLA -2: si la tabla no existe o está vacía, devuelve array vacío con
 *     warning, no inventa data.
 *   - REGLA -1: el clon ya tiene la mayoría de las tablas (schema_inicial +
 *     schema_fase2 + schema_fase2_extended + schema_fase3_5). Las que faltan
 *     se irán creando a demanda.
 *
 * Endpoints:
 *   GET    /api/db/:collection                  → lista (con paginación)
 *   GET    /api/db/:collection/:id              → uno
 *   POST   /api/db/:collection                  → crear (id en body o autogenerado)
 *   PUT    /api/db/:collection/:id              → actualizar / upsert
 *   DELETE /api/db/:collection/:id              → borrar
 *
 * Query params en GET lista:
 *   ?where=field:value,field2:value2            → filtros AND
 *   ?orderBy=field:desc                          → ordenamiento
 *   ?limit=N                                     → tope (default 500, max 5000)
 *   ?offset=N                                    → paginación
 */

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

// ─── Whitelist de colecciones permitidas ───────────────────────────────────
//
// Cada entrada mapea el nombre de la colección Firestore (string que viene del
// frontend) a la configuración de la tabla Postgres equivalente.
//
// Si el frontend pide una colección no listada acá, el endpoint devuelve 404.
//
// Para agregar una colección nueva: añadir entrada con tabla Postgres existente.
// Si la tabla aún no existe, crearla primero en un schema SQL.

interface CollectionMap {
  table: string;            // nombre de la tabla en Postgres
  pkCol: string;            // columna PK
  idAuto?: boolean;         // si true y no se manda id, autogenerar uuid
  /** Columnas que NO se exponen al frontend (ej. password_hash). */
  hiddenColumns?: string[];
}

const COLLECTIONS: Record<string, CollectionMap> = {
  // Núcleo operacional (ya tienen tabla en Postgres)
  vehicles:               { table: 'vehiculos',            pkCol: 'id', idAuto: false },
  users:                  { table: 'users',                pkCol: 'id', idAuto: false, hiddenColumns: [] },
  personal:               { table: 'personal',             pkCol: 'id', idAuto: true },
  turnos_dia:             { table: 'turnos_dia',           pkCol: 'id', idAuto: true },
  cartones_completados:   { table: 'cartones_completados', pkCol: 'id', idAuto: false },
  cartones:               { table: 'cartones_completados', pkCol: 'id', idAuto: false }, // alias
  alertas_operativas:     { table: 'alertas_operativas',   pkCol: 'id', idAuto: true },
  alertas_regulacion:     { table: 'alertas_regulacion',   pkCol: 'id', idAuto: true },
  alertas_trafico:        { table: 'alertas_trafico',      pkCol: 'id', idAuto: true },
  vehicle_events:         { table: 'vehicle_events',       pkCol: 'id', idAuto: false },
  inspecciones:           { table: 'inspecciones',         pkCol: 'id', idAuto: true },
  boletines:              { table: 'boletines',            pkCol: 'id', idAuto: true },
  bulletins:              { table: 'boletines',            pkCol: 'id', idAuto: true }, // alias
  ai_orders:              { table: 'ai_orders',            pkCol: 'id', idAuto: true },
  auto_stats_diarios:     { table: 'auto_stats_diarios',   pkCol: 'id', idAuto: true },
  audit_log:              { table: 'logs_auditoria',       pkCol: 'id', idAuto: true },
  bus_delays:             { table: 'bus_delays',           pkCol: 'id', idAuto: true },
  bus_last_pos:           { table: 'bus_last_pos',         pkCol: 'id_bus', idAuto: false },
  empresas:               { table: 'empresas',             pkCol: 'agency_id', idAuto: false },

  // FASE 4 EXTENDED — tablas que el frontend usa vía services/firestore/*
  // Aplicar schema_fase4_extended.sql para que estas existan.
  programacion_diaria:        { table: 'programacion_diaria',        pkCol: 'id', idAuto: true },
  programacion_semanal:       { table: 'programacion_semanal',       pkCol: 'id', idAuto: true },
  shifts:                     { table: 'shifts',                     pkCol: 'id', idAuto: true },
  driverSchedule:             { table: 'driver_schedule',            pkCol: 'id', idAuto: true },
  driver_schedule:            { table: 'driver_schedule',            pkCol: 'id', idAuto: true },
  activeAssignments:          { table: 'active_assignments',         pkCol: 'id', idAuto: true },
  active_assignments:         { table: 'active_assignments',         pkCol: 'id', idAuto: true },
  assignmentConflicts:        { table: 'assignment_conflicts',       pkCol: 'id', idAuto: true },
  assignment_conflicts:       { table: 'assignment_conflicts',       pkCol: 'id', idAuto: true },
  rotationRules:              { table: 'rotation_rules',             pkCol: 'id', idAuto: true },
  rotation_rules:             { table: 'rotation_rules',             pkCol: 'id', idAuto: true },
  personalRotation:           { table: 'personal_rotation',          pkCol: 'id', idAuto: true },
  personal_rotation:          { table: 'personal_rotation',          pkCol: 'id', idAuto: true },
  serviceMatrix:              { table: 'service_matrix',             pkCol: 'id', idAuto: true },
  service_matrix:             { table: 'service_matrix',             pkCol: 'id', idAuto: true },
  serviceCategoryAssignment:  { table: 'service_category_assignment', pkCol: 'id', idAuto: true },
  service_category_assignment:{ table: 'service_category_assignment', pkCol: 'id', idAuto: true },
  cochePersonal:              { table: 'coche_personal',             pkCol: 'id', idAuto: true },
  coche_personal:             { table: 'coche_personal',             pkCol: 'id', idAuto: true },
  maintenance:                { table: 'maintenance',                pkCol: 'id', idAuto: true },
  mantenimientoLogs:          { table: 'mantenimiento_logs',         pkCol: 'id', idAuto: true },
  mantenimiento_logs:         { table: 'mantenimiento_logs',         pkCol: 'id', idAuto: true },
  inspeccionesFlota:          { table: 'inspecciones_flota',         pkCol: 'id', idAuto: true },
  inspecciones_flota:         { table: 'inspecciones_flota',         pkCol: 'id', idAuto: true },
  notificacionesFlota:        { table: 'notificaciones_flota',       pkCol: 'id', idAuto: true },
  notificaciones_flota:       { table: 'notificaciones_flota',       pkCol: 'id', idAuto: true },
  vehicleCategories:          { table: 'vehicle_categories',         pkCol: 'id', idAuto: true },
  vehicle_categories:         { table: 'vehicle_categories',         pkCol: 'id', idAuto: true },
  fleet:                      { table: 'fleet',                      pkCol: 'id', idAuto: true },
  licencias:                  { table: 'licencias',                  pkCol: 'id', idAuto: true },
  feriados:                   { table: 'feriados',                   pkCol: 'id', idAuto: true },
  departments:                { table: 'departments',                pkCol: 'id', idAuto: true },
  penalties:                  { table: 'penalties',                  pkCol: 'id', idAuto: true },
  discounts:                  { table: 'discounts',                  pkCol: 'id', idAuto: true },
  mensajesInternos:           { table: 'mensajes_internos',          pkCol: 'id', idAuto: true },
  mensajes_internos:          { table: 'mensajes_internos',          pkCol: 'id', idAuto: true },
  system_config:              { table: 'system_config',              pkCol: 'key', idAuto: false },
  systemConfig:               { table: 'system_config',              pkCol: 'key', idAuto: false },
  universal:                  { table: 'universal',                  pkCol: 'id', idAuto: true },
  servicioEstado:             { table: 'servicio_estado',            pkCol: 'id', idAuto: true },
  servicio_estado:            { table: 'servicio_estado',            pkCol: 'id', idAuto: true },
  correlativo:                { table: 'correlativo',                pkCol: 'id', idAuto: true },
  dataImport:                 { table: 'data_import',                pkCol: 'id', idAuto: true },
  data_import:                { table: 'data_import',                pkCol: 'id', idAuto: true },
  logsIncidencias:            { table: 'logs_incidencias',           pkCol: 'id', idAuto: true },
  logs_incidencias:           { table: 'logs_incidencias',           pkCol: 'id', idAuto: true },
  parametrosOperativos:       { table: 'parametros_operativos',      pkCol: 'key', idAuto: false },
  parametros_operativos:      { table: 'parametros_operativos',      pkCol: 'key', idAuto: false },

  // Aliases del original
  roadAlerts:                 { table: 'alertas_trafico',            pkCol: 'id', idAuto: true },
  alertas_log:                { table: 'logs_incidencias',           pkCol: 'id', idAuto: true }, // alias suave; el dump quedó en disco
};

function resolveCollection(name: string): CollectionMap | null {
  return COLLECTIONS[name] ?? null;
}

// ─── Parseo de query params Firestore-style ────────────────────────────────

function parseWhere(raw: string | undefined): Array<[string, unknown]> {
  if (!raw) return [];
  return raw
    .split(',')
    .map((kv) => kv.trim())
    .filter(Boolean)
    .map((kv) => {
      const [k, ...rest] = kv.split(':');
      return [k.trim(), rest.join(':').trim()];
    });
}

function parseOrderBy(raw: string | undefined): { col: string; dir: 'asc' | 'desc' } | null {
  if (!raw) return null;
  const [col, dir] = raw.split(':');
  return { col: col.trim(), dir: (dir?.toLowerCase() === 'desc' ? 'desc' : 'asc') };
}

// ─── Helpers de respuesta ──────────────────────────────────────────────────

function ok(res: Response, data: unknown, extra: Record<string, unknown> = {}): void {
  res.json({ ok: true, data, ...extra, timestamp: new Date().toISOString() });
}

function fail(res: Response, status: number, error: string, details?: unknown): void {
  res.status(status).json({ ok: false, error, details, timestamp: new Date().toISOString() });
}

function maskHidden<T extends Record<string, unknown>>(row: T, hidden?: string[]): T {
  if (!hidden || hidden.length === 0) return row;
  const out = { ...row };
  for (const k of hidden) delete (out as Record<string, unknown>)[k];
  return out;
}

// ─── GET /api/db/:collection ───────────────────────────────────────────────

export async function listCollection(req: Request, res: Response): Promise<void> {
  const collectionName = req.params.collection;
  const cfg = resolveCollection(collectionName);
  if (!cfg) {
    fail(res, 404, `Collection '${collectionName}' no en whitelist`);
    return;
  }

  const limit = Math.min(5000, Math.max(1, parseInt((req.query.limit as string) ?? '500', 10)));
  const offset = Math.max(0, parseInt((req.query.offset as string) ?? '0', 10));
  const wheres = parseWhere(req.query.where as string | undefined);
  const orderBy = parseOrderBy(req.query.orderBy as string | undefined);

  try {
    let q = sqlDb(cfg.table).select('*');
    for (const [col, val] of wheres) {
      // Coerción básica: si el valor parece número, lo casteamos
      const v: unknown = /^-?\d+(\.\d+)?$/.test(String(val)) ? Number(val) : val;
      q = q.where(col, v as never);
    }
    if (orderBy) q = q.orderBy(orderBy.col, orderBy.dir);
    q = q.limit(limit).offset(offset);

    const rows = await q;
    const out = rows.map((r: Record<string, unknown>) => maskHidden(r, cfg.hiddenColumns));
    ok(res, out, { total: out.length, limit, offset });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    // Si la tabla no existe o tiene un problema, devolver [] graceful en lugar
    // de romper toda la UI. La regla -2 dice "no inventar" — aquí devolvemos
    // honesto "no hay datos para esta colección" y dejamos warning en logs.
    if (/relation .* does not exist|column .* does not exist/i.test(msg)) {
      logger.warn(`[dbBridge] tabla/columna inexistente para ${collectionName}: ${msg}`);
      ok(res, [], { total: 0, warning: 'table_or_column_missing', detail: msg });
      return;
    }
    logger.error(`[dbBridge] list error ${collectionName}`, { error: msg });
    fail(res, 500, 'Error consultando colección', msg);
  }
}

// ─── GET /api/db/:collection/:id ───────────────────────────────────────────

export async function getDoc(req: Request, res: Response): Promise<void> {
  const collectionName = req.params.collection;
  const id = req.params.id;
  const cfg = resolveCollection(collectionName);
  if (!cfg) return fail(res, 404, `Collection '${collectionName}' no en whitelist`);

  try {
    const row = await sqlDb(cfg.table).where(cfg.pkCol, id).first();
    if (!row) return fail(res, 404, 'Documento no encontrado');
    ok(res, maskHidden(row, cfg.hiddenColumns));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[dbBridge] getDoc error ${collectionName}/${id}`, { error: msg });
    fail(res, 500, 'Error consultando documento', msg);
  }
}

// ─── POST /api/db/:collection ──────────────────────────────────────────────
// Si el body trae `id`, lo usa. Si no y idAuto=true, genera uuid.

export async function createDoc(req: Request, res: Response): Promise<void> {
  const collectionName = req.params.collection;
  const cfg = resolveCollection(collectionName);
  if (!cfg) return fail(res, 404, `Collection '${collectionName}' no en whitelist`);

  const body = (req.body ?? {}) as Record<string, unknown>;
  let id = body[cfg.pkCol] as string | undefined;
  if (!id) {
    if (!cfg.idAuto) return fail(res, 400, `Falta '${cfg.pkCol}' en el body`);
    id = uuidv4();
  }

  try {
    const row: Record<string, unknown> = { ...body, [cfg.pkCol]: id };
    await sqlDb(cfg.table).insert(row).onConflict(cfg.pkCol).merge();
    ok(res, { id, [cfg.pkCol]: id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[dbBridge] createDoc error ${collectionName}`, { error: msg });
    fail(res, 500, 'Error creando documento', msg);
  }
}

// ─── PUT /api/db/:collection/:id ───────────────────────────────────────────

export async function updateDoc(req: Request, res: Response): Promise<void> {
  const collectionName = req.params.collection;
  const id = req.params.id;
  const cfg = resolveCollection(collectionName);
  if (!cfg) return fail(res, 404, `Collection '${collectionName}' no en whitelist`);

  const body = { ...(req.body ?? {}) } as Record<string, unknown>;
  delete body[cfg.pkCol]; // nunca cambiar el id desde el body
  if (Object.keys(body).length === 0) return fail(res, 400, 'Body vacío');

  try {
    // Upsert idempotente: si no existe, inserta con merge. Comportamiento parecido a Firestore.set(merge:true).
    const exists = await sqlDb(cfg.table).where(cfg.pkCol, id).first();
    if (exists) {
      await sqlDb(cfg.table).where(cfg.pkCol, id).update(body);
    } else {
      await sqlDb(cfg.table).insert({ ...body, [cfg.pkCol]: id });
    }
    ok(res, { id, [cfg.pkCol]: id, updated: !!exists });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[dbBridge] updateDoc error ${collectionName}/${id}`, { error: msg });
    fail(res, 500, 'Error actualizando documento', msg);
  }
}

// ─── DELETE /api/db/:collection/:id ────────────────────────────────────────

export async function deleteDoc(req: Request, res: Response): Promise<void> {
  const collectionName = req.params.collection;
  const id = req.params.id;
  const cfg = resolveCollection(collectionName);
  if (!cfg) return fail(res, 404, `Collection '${collectionName}' no en whitelist`);

  try {
    const deleted = await sqlDb(cfg.table).where(cfg.pkCol, id).delete();
    if (deleted === 0) return fail(res, 404, 'Documento no encontrado');
    ok(res, { id, [cfg.pkCol]: id, deleted: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[dbBridge] deleteDoc error ${collectionName}/${id}`, { error: msg });
    fail(res, 500, 'Error eliminando documento', msg);
  }
}

// ─── GET /api/db (lista de colecciones disponibles) ────────────────────────

export function listAvailableCollections(_req: Request, res: Response): void {
  ok(res, {
    collections: Object.keys(COLLECTIONS).sort(),
    total: Object.keys(COLLECTIONS).length,
  });
}
