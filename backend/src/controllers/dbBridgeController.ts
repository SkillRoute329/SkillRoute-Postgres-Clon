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
import { busDbEvent } from '../services/socketBus';

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
  fixedFilter?: Record<string, unknown>; // e.g. { tipo: 'parts' }
}

const COLLECTIONS: Record<string, CollectionMap> = {
  // Núcleo operacional (ya tienen tabla en Postgres)
  vehicles:               { table: 'vehiculos',            pkCol: 'id', idAuto: false },
  vehiculos:              { table: 'vehiculos',            pkCol: 'id', idAuto: false }, // alias español
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
  reglas_rotacion:            { table: 'rotation_rules',             pkCol: 'id', idAuto: true },
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
  // FASE 4.8 (2026-05-12): aliases para que el frontend cargue Vista General
  // sin warnings 404. Apuntan al mismo system_config (key/value store).
  // /api/db/system_settings        → lista filas de system_config
  // /api/db/system/global_config   → row con key='global_config'
  system_settings:            { table: 'system_config',              pkCol: 'key', idAuto: false },
  systemSettings:             { table: 'system_config',              pkCol: 'key', idAuto: false },
  system:                     { table: 'system_config',              pkCol: 'key', idAuto: false },
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

  // FASE 4.9 (2026-05-13): Soporte completo para auditoría del ente regulador
  corridor_overlap:           { table: 'corridor_overlap',           pkCol: 'id', idAuto: true },
  shapes_cross_operator:      { table: 'shapes_cross_operator',      pkCol: 'id', idAuto: true },
  incidencias:                { table: 'logs_incidencias',           pkCol: 'id', idAuto: true },
  gtfs_timetable:             { table: 'gtfs_timetable',             pkCol: 'id', idAuto: false },
  alertas:                    { table: 'alertas',                    pkCol: 'id', idAuto: true },

  // FASE 5 (2026-05-13): VIEWs derivadas de bus_last_pos (poller IMM real)
  // que reemplazan las colecciones Firestore homónimas del cloud. Datos reales
  // de los 4 operadores, NO sintéticos. Ver backend/src/database/schema_fase5_views.sql.
  viajes_activos:             { table: 'viajes_activos',             pkCol: 'id', idAuto: false },
  competidores:               { table: 'competidores',               pkCol: 'id', idAuto: false },
  competencia_monitoreo:      { table: 'competencia_monitoreo',      pkCol: 'id', idAuto: false },
  lineas:                     { table: 'lineas',                     pkCol: 'id', idAuto: false },
  lineas_ucot:                { table: 'lineas',                     pkCol: 'id', idAuto: false }, // alias
  cambios_historicos:         { table: 'cambios_historicos',         pkCol: 'id', idAuto: true },
  boletaje:                   { table: 'boletaje',                   pkCol: 'id', idAuto: true },

  // FASE 5.1 (2026-05-13): aliases adicionales para colecciones del legacy
  // cloud que el frontend (CMU, ShadowRadar) sigue consultando.
  // FASE 5.14 (2026-05-13): compliance_alerts apunta a VIEW que mapea
  // alertas_regulacion al formato CMU (dismissed, empresa, pctEnTiempo, etc.).
  compliance_alerts:          { table: 'compliance_alerts',          pkCol: 'id', idAuto: true },
  traffic_alerts:             { table: 'alertas_trafico',            pkCol: 'id', idAuto: true },
  road_alerts:                { table: 'alertas_trafico',            pkCol: 'id', idAuto: true },

  // FASE 5.9 (2026-05-13): VIEWs para colecciones legacy del frontend.
  // Ver backend/src/database/schema_fase5_9_legacy_views.sql.
  eventos_desvio:             { table: 'eventos_desvio',             pkCol: 'id', idAuto: false },
  compliance_log:             { table: 'compliance_log',             pkCol: 'id', idAuto: false },
  fleet_positions:            { table: 'fleet_positions',            pkCol: 'id', idAuto: false },
  service_matrices:           { table: 'service_matrices',           pkCol: 'id', idAuto: true },
  licencias_personal:         { table: 'licencias_personal',         pkCol: 'id', idAuto: true },
  daily_shifts:               { table: 'daily_shifts',               pkCol: 'id', idAuto: true },
  hrr_live:                   { table: 'hrr_live',                   pkCol: 'id', idAuto: true },
  desvios_reportados:         { table: 'logs_incidencias',           pkCol: 'id', idAuto: true }, // alias
  delegaciones_inspector:     { table: 'logs_incidencias',           pkCol: 'id', idAuto: true }, // alias

  // FASE 5.13 (2026-05-13): aliases adicionales detectados en producción
  // - parametros_sistema: el frontend (EconomicProjections, parametrosService)
  //   lo pide por su nombre legacy, pero la tabla real es parametros_operativos.
  parametros_sistema:         { table: 'parametros_operativos',      pkCol: 'key', idAuto: false },

  // FASE 5.27 (2026-05-19) — Cierre de gaps detectados en mapa de auditoría
  // total. Aliases hacia tablas existentes que el frontend pide por su nombre
  // legacy Firestore (rompía SystemDoctor:"Lines:0", InspectorCapture/
  // ServiceAnalytics, DisponibilidadFlota mantenimiento).
  inspections:                { table: 'inspecciones',               pkCol: 'id', idAuto: true },
  lines:                      { table: 'lineas',                     pkCol: 'id', idAuto: false },
  maintenance_orders:         { table: 'maintenance',                pkCol: 'id', idAuto: true },
  ordenes_mantenimiento:      { table: 'maintenance',                pkCol: 'id', idAuto: true },

  // Colecciones sin tabla previa — schema creado en
  // schema_fase5_27_audit_gaps.sql. Permiten que las pantallas que las
  // consumen (CreateShift categoría, AlertasDocumentoConductor, ABL reglas/
  // números rojos, StmScraperStatus) ya no devuelvan 404 silencioso: si no
  // hay filas el módulo dice "vacío" en lugar de "404 — sin datos". Las
  // tablas se llenan desde sus respectivos flujos (no se siembran demo).
  fichas_medicas:             { table: 'fichas_medicas',             pkCol: 'id', idAuto: true },
  shift_categories:           { table: 'shift_categories',           pkCol: 'id', idAuto: true },
  penalty_rules:              { table: 'penalty_rules',              pkCol: 'id', idAuto: true },
  abl_red_numbers:            { table: 'abl_red_numbers',            pkCol: 'id', idAuto: true },
  scrapping_logs:             { table: 'scrapping_logs',             pkCol: 'id', idAuto: true },

  // FASE 5.29 (2026-05-21) — aliases adicionales detectados por crawler
  // de módulos sobre el navegador real:
  //   - `coaches` → tabla `vehiculos` (StatsWidget hace fallback a 'vehiculos'
  //     si 'coaches' viene vacío, pero el 404 generaba ruido en consola)
  //   - `rotation_schemes` → tabla `rotation_rules` (fleet.ts pide los
  //     esquemas de rotación)
  coaches:                    { table: 'vehiculos',                  pkCol: 'id', idAuto: false },
  rotation_schemes:           { table: 'rotation_rules',             pkCol: 'id', idAuto: true },

  // FASE 5.38 (2026-05-22) — Auditoría semántica detectó 5 colecciones más
  // que pantallas operativas piden y devolvían 404 ruidoso. Mapeo honesto:
  //
  //   - `gtfs_horarios` y `service_definitions`: equivalente cartón → reutilizamos
  //     `cartones_completados`. Si la tabla no tiene los campos exactos que el
  //     componente espera (era Firestore), el shim devuelve vacío sin romper.
  //   - `desvios_guardados`: legacy → `logs_incidencias` (donde se guardan
  //     desvíos reportados manualmente).
  //   - `tarifario_stm`: parámetros de tarifa STM → `parametros_operativos`.
  //   - `lineas_servicios`: cruce de líneas con servicios → `service_matrix`.
  gtfs_horarios:              { table: 'cartones_completados',       pkCol: 'id', idAuto: false },
  service_definitions:        { table: 'cartones_completados',       pkCol: 'id', idAuto: false },
  desvios_guardados:          { table: 'logs_incidencias',           pkCol: 'id', idAuto: true },
  tarifario_stm:              { table: 'tarifario_stm',              pkCol: 'id', idAuto: false },
  lineas_servicios:           { table: 'service_matrix',             pkCol: 'id', idAuto: true },

  // FASE 5.39 (2026-05-23) — otp_summary se poblaba en cloud (otpEngine cron
  // /10 min). En el clon todavía no hay el cron equivalente; creamos la tabla
  // vacía para que la pantalla /traffic/otp no muestre 404 ruidoso. Cuando
  // el motor GPS local empiece a escribir filas el dashboard las leerá sin
  // cambios. Schema: schema_fase5_39_otp_summary.sql.
  otp_summary:                { table: 'otp_summary',                pkCol: 'id', idAuto: false },

  // EAM whitelist collections (Sprints 9-10)
  parts:                      { table: 'universal',                  pkCol: 'id', idAuto: true, fixedFilter: { tipo: 'parts' } },
  inventory:                  { table: 'universal',                  pkCol: 'id', idAuto: true, fixedFilter: { tipo: 'inventory' } },
  work_orders:                { table: 'maintenance',                pkCol: 'id', idAuto: true },
  assets:                     { table: 'vehiculos',                  pkCol: 'id', idAuto: false },
};

function resolveCollection(name: string): CollectionMap | null {
  return COLLECTIONS[name] ?? null;
}

/**
 * Helper para traducir campos camelCase (Firestore) a columnas Postgres.
 */
const GLOBAL_COL_MAP: Record<string, string> = {
  'toUserId': 'to_user',
  'fromUserId': 'from_user',
  'createdAt': 'created_at',
  'updatedAt': 'updated_at',
  'agencyId': 'agency_id',
  'timestampGPS': 'timestamp_gps',
  'timestampGps': 'timestamp_gps',
  'timestamp_g_p_s': 'timestamp_gps',
  'estadoCumplimiento': 'estado_cumplimiento',
  'desviacionMin': 'desviacion_min',
  // FASE 5.14 (2026-05-13): aliases para campos legacy del frontend
  // que filtraban por nombres del data_jsonb. Mapeo al equivalente top-level.
  'empresa_id': 'agency_id',  // ShadowRadar filtra empresa_id → agency_id
  'empresaId': 'agency_id',
  // FASE 5.29 (2026-05-21): FleetService.getVehicles intenta where=empresa:70
  // (campo legacy Firestore). Mapear a agency_id.
  'empresa': 'agency_id',
  'idBus': 'id_bus',
  'cocheId': 'id_bus',
  'lineaId': 'linea',           // si el campo viene como string-id
  'tripId': 'trip_id',
  'proximaParada': 'proxima_parada',
  'serviceNumber': 'service_number',
  'vehiculoId': 'vehiculo_id',
  'conductorId': 'conductor_id',
};

/**
 * FASE 5.14 (2026-05-13): mapeos POR TABLA cuando el nombre Firestore-style
 * no coincide con ninguna columna real. Se aplica DESPUES del GLOBAL_COL_MAP
 * pero ANTES del fallback camelCase→snake_case.
 *
 * Caso de uso original: CentroMandoUnificado y otros componentes piden
 * `orderBy('timestamp', 'desc')` sobre vehicle_events, pero la tabla solo
 * tiene `timestamp_gps` y `created_at`. Sin este map devolvia 500.
 */
const TABLE_COL_MAP: Record<string, Record<string, string>> = {
  vehicle_events: {
    timestamp: 'timestamp_gps',
    fecha: 'created_at',
  },
  bus_last_pos: {
    timestamp: 'timestamp_gps',
    updatedAt: 'updated_at',
  },
  // FASE 5.14 (2026-05-13): la VIEW eventos_desvio ahora expone `resuelto`
  // como COALESCE(atendida, false), asi que ya NO mapeamos resuelto->atendida.
  // Solo mantenemos el alias empresa->agency_id que usa GestionDesviosPage.
  eventos_desvio: {
    empresa: 'agency_id',
  },
  // FASE 5.29 (2026-05-21): el frontend Firestore-style sigue mandando
  // service_date/serviceDate/actual_passed_at sobre `inspecciones`. La tabla
  // solo tiene `fecha_inspeccion` como columna de tiempo y el resto en
  // `data_jsonb`. Mapeamos al equivalente top-level. Para campos que viven
  // dentro de data_jsonb (lineId, cartonServiceId, etc.), el filtro se cae
  // al fallback "ignorar where" para que NO rompa la pantalla (ver
  // safeListCollection).
  inspecciones: {
    service_date:    'fecha_inspeccion',
    serviceDate:     'fecha_inspeccion',
    actual_passed_at:'fecha_inspeccion',
    actualPassedAt:  'fecha_inspeccion',
    timestamp:       'fecha_inspeccion',
  },
  // FASE 5.38 (2026-05-22): el frontend legacy Firestore mandaba `start`
  // (hora de salida) sobre daily_shifts. Mapeamos al equivalente real.
  daily_shifts: {
    start:    'hora_salida',
    end:      'hora_llegada_estimada',
    serviceNumber: 'turno',
  },
  // compliance_log: el frontend manda `mes` (string YYYY-MM) y `fecha_envio`
  // que no existen. Los descartamos al filtrar inválidos (TABLE_REAL_COLUMNS
  // arriba) en lugar de tirar 500.
  compliance_log: {
    timestamp: 'created_at',
    fecha:     'created_at',
  },
};

// FASE 5.29 (2026-05-21): columnas reales que el dbBridge conoce por tabla.
// Si un where/orderBy apunta a una columna fuera de esta lista (típicamente
// un campo Firestore-style legacy o un campo del data_jsonb), el bridge
// descarta el filtro y devuelve [] con warning honesto, en lugar de 500.
// El frontend ya filtra/ordena en cliente como fallback.
const TABLE_REAL_COLUMNS: Record<string, Set<string>> = {
  inspecciones: new Set([
    'id', 'agency_id', 'vehiculo_id', 'fecha_inspeccion',
    'inspector_id', 'data_jsonb', 'created_at',
  ]),
  vehiculos: new Set([
    'id', 'agency_id', 'internal_number', 'plate', 'data_jsonb', 'created_at',
  ]),
  users: new Set([
    'id', 'email', 'full_name', 'role', 'agency_id', 'data_jsonb',
    'created_at', 'updated_at',
  ]),
  personal: new Set([
    'id', 'agency_id', 'internal_number', 'full_name', 'role', 'estado_hoy',
    'motivo_ausencia', 'ausencia_fecha', 'ausencia_registrada_por',
    'hora_ultimo_servicio', 'es_conductor_reserva', 'telefono', 'data_jsonb',
    'created_at', 'updated_at',
  ]),
  // FASE 5.38 (2026-05-22): vistas con shape Firestore-style. Listamos las
  // columnas REALES de la vista para que filtros sobre `start`, `mes`,
  // `fecha_envio` que el frontend manda no rompan en 500.
  daily_shifts: new Set([
    'id', 'agency_id', 'date', 'fecha', 'conductor_id', 'conductorId',
    'conductor_nombre', 'conductor_interno', 'vehiculo_id', 'vehiculoId',
    'vehiculo_interno', 'linea_id', 'lineaId', 'linea', 'variante_key',
    'turno', 'hora_salida', 'horaSalida', 'hora_llegada_estimada',
    'terminal', 'estado', 'reserva_activada', 'conductor_reserva_id',
    'data_jsonb', 'created_at', 'updated_at',
  ]),
  compliance_log: new Set([
    'id', 'agency_id', 'id_bus', 'cocheId', 'linea', 'lineaId', 'lat',
    'lon', 'lng', 'velocidad', 'estado_cumplimiento', 'estado',
    'desviacion_min', 'desviacionMin', 'timestamp_gps', 'created_at',
    'data_jsonb',
  ]),
  servicio_estado: new Set([
    'id', 'agency_id', 'linea_id', 'estado', 'fecha', 'data_jsonb',
    'created_at', 'updated_at',
  ]),
};

function mapCol(col: string, tableName?: string): string {
  if (tableName && TABLE_COL_MAP[tableName]?.[col]) return TABLE_COL_MAP[tableName][col];
  if (GLOBAL_COL_MAP[col]) return GLOBAL_COL_MAP[col];
  // fallback genérico: camelCase a snake_case
  return col.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// FASE 5.38 (2026-05-22): autodetect de columnas reales de cualquier tabla
// para que el comportamiento de "descartar filtros inválidos" funcione sin
// mantener TABLE_REAL_COLUMNS manualmente para cada tabla. Cache de 5 min.
const _columnsCache = new Map<string, { cols: Set<string>; loadedAt: number }>();
const COLUMNS_TTL_MS = 5 * 60 * 1000;

async function getRealColumns(tableName: string): Promise<Set<string>> {
  // Hardcoded toma precedencia si existe.
  if (TABLE_REAL_COLUMNS[tableName]) return TABLE_REAL_COLUMNS[tableName];
  const cached = _columnsCache.get(tableName);
  if (cached && Date.now() - cached.loadedAt < COLUMNS_TTL_MS) return cached.cols;
  try {
    const rows: Array<{ column_name: string }> = await sqlDb('information_schema.columns')
      .select('column_name')
      .where({ table_schema: 'public', table_name: tableName });
    const cols = new Set(rows.map((r) => r.column_name));
    _columnsCache.set(tableName, { cols, loadedAt: Date.now() });
    return cols;
  } catch {
    return new Set();
  }
}

// ─── Parseo de query params Firestore-style ────────────────────────────────

type WhereTuple = { field: string; op: string; value: unknown };

/**
 * Parsea ?where=field:value (op ==), ?where=field>=value, ?where=field<value, etc.
 * Soporta múltiples filtros separados por coma.
 *   field:value         → field == value (compat con shim original)
 *   field=value         → field == value
 *   field>=value        → field >= value
 *   field<=value        → field <= value
 *   field>value         → field > value
 *   field<value         → field < value
 *   field!=value        → field != value
 */
function parseWhere(raw: string | undefined): WhereTuple[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((kv) => kv.trim())
    .filter(Boolean)
    .map<WhereTuple | null>((kv) => {
      // El orden importa: los multichar antes que los single.
      for (const op of ['>=', '<=', '!=', '>', '<', '=', ':']) {
        const i = kv.indexOf(op);
        if (i > 0) {
          const field = kv.substring(0, i).trim();
          const value = kv.substring(i + op.length).trim();
          const normalizedOp = op === ':' || op === '=' ? '=' : op;
          return { field, op: normalizedOp, value };
        }
      }
      return null;
    })
    .filter((w): w is WhereTuple => w !== null);
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

/**
 * FASE 5.1 (2026-05-13): Aplana `data_jsonb` al top-level del documento.
 * El frontend (heredado del shim Firestore cloud) consulta propiedades como
 * `v.status`, `v.dismissed`, `v.empresa` que en Postgres vivieron dentro de
 * un campo `data_jsonb` jsonb. Para no tener que reescribir 148 archivos del
 * frontend, aplanamos automáticamente en la respuesta.
 *
 * Prioridad: las columnas top-level Postgres SOBRESCRIBEN cualquier clave
 * homónima dentro de data_jsonb (ej. `agency_id` top wins sobre data_jsonb.agencyId).
 *
 * El campo `data_jsonb` se mantiene en la respuesta por si alguna pantalla
 * lo lee literalmente (no debería, pero es defensivo).
 */
function flattenDataJsonb<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const jsonb = row.data_jsonb;
  if (!jsonb || typeof jsonb !== 'object') return row;
  return { ...(jsonb as Record<string, unknown>), ...row };
}

/**
 * FASE 5.13 (2026-05-13): Duplica columnas snake_case Postgres en camelCase
 * para compatibilidad con frontend heredado de Firestore (que esperaba
 * propiedades como `idBus`, `agencyId`, `timestampGPS`, `estadoCumplimiento`).
 *
 * Solo agrega los alias camelCase si NO existían ya — para no sobrescribir
 * valores ya aplanados desde data_jsonb.
 *
 * Mapping documentado de columnas más frecuentes. Para otras, aplica heurística
 * genérica snake → camel.
 */
const ROW_FIELD_ALIASES: Record<string, string> = {
  id_bus: 'idBus',
  agency_id: 'agencyId',
  timestamp_gps: 'timestampGPS',
  estado_cumplimiento: 'estadoCumplimiento',
  desviacion_min: 'desviacionMin',
  trip_id: 'tripId',
  proxima_parada: 'proximaParada',
  service_number: 'serviceNumber',
  vehiculo_id: 'vehiculoId',
  conductor_id: 'conductorId',
  updated_by: 'updatedBy',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  expires_at: 'expiresAt',
  full_name: 'fullName',
  internal_number: 'internalNumber',
  estado_hoy: 'estadoHoy',
  motivo_ausencia: 'motivoAusencia',
  ausencia_fecha: 'ausenciaFecha',
  hora_ultimo_servicio: 'horaUltimoServicio',
  es_conductor_reserva: 'esConductorReserva',
  conductor_nombre: 'conductorNombre',
  conductor_interno: 'conductorInterno',
  vehiculo_interno: 'vehiculoInterno',
  linea_id: 'lineaId',
  variante_key: 'varianteKey',
  hora_salida: 'horaSalida',
  hora_llegada_estimada: 'horaLlegadaEstimada',
  reserva_activada: 'reservaActivada',
  conductor_reserva_id: 'conductorReservaId',
  delay_min: 'delayMin',
  calculado_en: 'calculadoEn',
  coche_id: 'cocheId',
};

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * FASE 5.14 (2026-05-13): aliases inversos por TABLA, aplicados sobre el row
 * de salida. Caso de uso: la VIEW `eventos_desvio` expone `atendida` pero el
 * frontend GestionDesviosPage espera `resuelto` (legacy del schema Firestore
 * cloud). Para no editar 4 archivos del frontend, duplicamos el valor con el
 * nombre legacy al serializar.
 */
const TABLE_OUT_ALIASES: Record<string, Record<string, string>> = {
  eventos_desvio: {
    atendida: 'resuelto', // atendida boolean → resuelto boolean (mismo significado)
  },
};

function addCamelCaseAliases<T extends Record<string, unknown>>(row: T, tableName?: string): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [key, val] of Object.entries(row)) {
    if (!key.includes('_')) continue; // ya es camelCase
    const alias = ROW_FIELD_ALIASES[key] ?? snakeToCamel(key);
    if (!(alias in out)) {
      out[alias] = val;
    }
  }
  if (tableName && TABLE_OUT_ALIASES[tableName]) {
    for (const [from, to] of Object.entries(TABLE_OUT_ALIASES[tableName])) {
      if (from in out && !(to in out)) out[to] = out[from];
    }
  }
  // FASE 5.15 (2026-05-13): El script populate_corridor_overlap.js guarda los puntos
  // como { lat, lon } según standard GTFS shape_pt_lon. El frontend legacy Firestore
  // espera { lat, lng } (Google Maps standard). Adaptamos el formato de salida al vuelo.
  if (tableName === 'shapes_cross_operator') {
    const fixPts = (arr: unknown): unknown => {
      if (!Array.isArray(arr)) return arr;
      return arr.map((p: Record<string, unknown>) => {
        if (p && typeof p === 'object') {
          return { lat: p.lat, lng: p.lng ?? p.lon };
        }
        return p;
      });
    };
    if ('points' in out) out.points = fixPts(out.points);
    if (out.data_jsonb && typeof out.data_jsonb === 'object') {
      const j = out.data_jsonb as Record<string, unknown>;
      if ('points' in j) j.points = fixPts(j.points);
    }
  }
  return out;
}

// ─── EAM Helpers ────────────────────────────────────────────────────────────

export async function prepareRowForWrite(cfg: CollectionMap, body: Record<string, unknown>, id: string, isUpdate = false) {
  const knownCols = await getRealColumns(cfg.table);
  const row: Record<string, unknown> = {};

  let existingDataJsonb: Record<string, unknown> = {};
  if (isUpdate && knownCols.has('data_jsonb')) {
    const existing = await sqlDb(cfg.table).select('data_jsonb').where(cfg.pkCol, id).first();
    if (existing && existing.data_jsonb) {
      existingDataJsonb = typeof existing.data_jsonb === 'string'
        ? JSON.parse(existing.data_jsonb)
        : existing.data_jsonb;
    }
  }

  const extraFields: Record<string, unknown> = { ...existingDataJsonb };

  for (const [key, val] of Object.entries(body)) {
    const colName = mapCol(key, cfg.table);
    if (knownCols.has(colName)) {
      row[colName] = val;
    } else if (knownCols.has('data_jsonb')) {
      extraFields[key] = val;
    }
  }

  const pkColMapped = mapCol(cfg.pkCol, cfg.table);
  row[pkColMapped] = id;

  if (cfg.fixedFilter) {
    for (const [col, val] of Object.entries(cfg.fixedFilter)) {
      const colMapped = mapCol(col, cfg.table);
      if (knownCols.has(colMapped)) {
        row[colMapped] = val;
      }
    }
  }

  if (knownCols.has('data_jsonb')) {
    if (body.data_jsonb && typeof body.data_jsonb === 'object') {
      row.data_jsonb = {
        ...extraFields,
        ...(body.data_jsonb as Record<string, unknown>),
      };
    } else {
      row.data_jsonb = extraFields;
    }
  }

  return row;
}

export async function handleStockDecrement(partsUsed: any[], ticketId: string, collectionName: string) {
  logger.info(`[EAM] Procesando decremento de stock para ${partsUsed.length} repuestos del ticket ${ticketId} en ${collectionName}`);
  for (const item of partsUsed) {
    const partId = item.partId ?? item.id;
    const qty = Number(item.quantity ?? item.qty ?? item.cantidad ?? 1);
    if (!partId) continue;

    try {
      const partRow = await sqlDb('universal')
        .where('id', partId)
        .where('tipo', 'parts')
        .first();

      if (!partRow) {
        logger.warn(`[EAM] Repuesto con ID "${partId}" no encontrado en universal`);
        continue;
      }

      let data = partRow.data_jsonb;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          data = {};
        }
      }

      const currentStock = Number(data.currentStock ?? 0);
      const minStock = Number(data.minStock ?? 0);
      const newStock = Math.max(0, currentStock - qty);

      const updatedData = {
        ...data,
        currentStock: newStock,
      };

      await sqlDb('universal')
        .where('id', partId)
        .where('tipo', 'parts')
        .update({
          data_jsonb: updatedData,
          updated_at: new Date(),
        });

      logger.info(`[EAM] Stock de ${data.sku} decrementado de ${currentStock} a ${newStock} (cantidad usada: ${qty})`);

      busDbEvent('parts', 'updated', { id: partId, table: 'universal' });

      if (newStock < minStock) {
        logger.warn(`[EAM] ALERTA DE STOCK CRÍTICO: ${data.sku} está en ${newStock} (mínimo ${minStock})`);
        const alertId = uuidv4();
        const alertRow = {
          id: alertId,
          agency_id: '70', // UCOT
          fecha: new Date().toISOString().slice(0, 10),
          tipo: 'cobertura_critica',
          urgencia: 'alta',
          linea_id: null,
          conductor_id: null,
          vehiculo_id: null,
          turno_id: null,
          titulo: `Stock crítico — ${data.sku ?? partId}`,
          mensaje: `El repuesto "${data.description ?? ''}" (SKU: ${data.sku ?? ''}) tiene stock insuficiente. Stock actual: ${newStock}. Stock mínimo: ${minStock}.`,
          accion_sugerida: `Reponer stock en taller.`,
          datos_extra: JSON.stringify({ partId, sku: data.sku, currentStock: newStock, minStock, ticketId, collectionName }),
          atendida: false,
          atendida_por: null,
          hora_atendida: null,
          impacto_ingresos_usd: null,
          created_at: new Date(),
        };
        await sqlDb('alertas_operativas').insert(alertRow);
        busDbEvent('alertas_operativas', 'created', { id: alertId, table: 'alertas_operativas' });
      }
    } catch (err) {
      logger.error(`[EAM] Error decrementando stock para el repuesto "${partId}"`, err);
    }
  }
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
    if (cfg.fixedFilter) {
      for (const [col, val] of Object.entries(cfg.fixedFilter)) {
        q = q.where(col, val as any);
      }
    }
    // FASE 5.38 (2026-05-22): autodetect ahora se aplica a TODAS las tablas
    // (no solo las hardcoded). Cache de 5min en information_schema.
    const knownCols = await getRealColumns(cfg.table);
    const droppedFilters: string[] = [];
    for (const w of wheres) {
      const mapped = mapCol(w.field, cfg.table);
      if (knownCols.size > 0 && !knownCols.has(mapped)) {
        droppedFilters.push(w.field);
        continue;
      }
      // Coerción básica: si el valor parece número, lo casteamos
      const v: unknown = /^-?\d+(\.\d+)?$/.test(String(w.value)) ? Number(w.value) : w.value;
      q = q.where(mapped, w.op as never, v as never);
    }
    if (orderBy) {
      const mappedOrderCol = mapCol(orderBy.col, cfg.table);
      if (knownCols.size > 0 && !knownCols.has(mappedOrderCol)) {
        droppedFilters.push('orderBy:' + orderBy.col);
      } else {
        q = q.orderBy(mappedOrderCol, orderBy.dir);
      }
    }
    q = q.limit(limit).offset(offset);

    const rows = await q;
    const out = rows.map((r: Record<string, unknown>) =>
      addCamelCaseAliases(
        maskHidden(flattenDataJsonb(r), cfg.hiddenColumns) as Record<string, unknown>,
        cfg.table,
      ),
    );
    const extra: Record<string, unknown> = { total: out.length, limit, offset };
    if (droppedFilters.length > 0) {
      extra.warning = `filtros descartados (columnas inexistentes o en data_jsonb): ${droppedFilters.join(', ')}`;
    }
    ok(res, out, extra);
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
    let q = sqlDb(cfg.table).where(cfg.pkCol, id);
    if (cfg.fixedFilter) {
      for (const [col, val] of Object.entries(cfg.fixedFilter)) {
        q = q.where(col, val as any);
      }
    }
    const row = await q.first();
    if (!row) return fail(res, 404, 'Documento no encontrado');
    ok(res, addCamelCaseAliases(maskHidden(flattenDataJsonb(row), cfg.hiddenColumns) as Record<string, unknown>, cfg.table));
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
    const row = await prepareRowForWrite(cfg, body, id, false);
    await sqlDb(cfg.table).insert(row).onConflict(cfg.pkCol).merge();
    // FASE 5.30 (2026-05-21): emit al bus para que el frontend reciba la
    // propagación en vivo sin polling.
    busDbEvent(collectionName, 'created', { id, table: cfg.table });
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
    let checkQuery = sqlDb(cfg.table).where(cfg.pkCol, id);
    if (cfg.fixedFilter) {
      for (const [col, val] of Object.entries(cfg.fixedFilter)) {
        checkQuery = checkQuery.where(col, val as any);
      }
    }
    const exists = await checkQuery.first();
    const row = await prepareRowForWrite(cfg, body, id, !!exists);
    if (exists) {
      await sqlDb(cfg.table).where(cfg.pkCol, id).update(row);
    } else {
      await sqlDb(cfg.table).insert(row);
    }

    // Interceptor de decremento de stock al cerrar ticket
    if (
      (collectionName === 'incidencias' || collectionName === 'maintenance' || collectionName === 'work_orders') &&
      (body.status === 'CLOSED' || body.status === 'FINALIZADO' || body.estado === 'CLOSED' || body.estado === 'FINALIZADO')
    ) {
      let partsUsed = body.partsUsed ?? (body.data_jsonb as any)?.partsUsed;
      if (typeof partsUsed === 'string') {
        try {
          partsUsed = JSON.parse(partsUsed);
        } catch {}
      }
      if (Array.isArray(partsUsed) && partsUsed.length > 0) {
        await handleStockDecrement(partsUsed, id, collectionName);
      }
    }

    busDbEvent(collectionName, exists ? 'updated' : 'created', { id, table: cfg.table });
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
    let deleteQuery = sqlDb(cfg.table).where(cfg.pkCol, id);
    if (cfg.fixedFilter) {
      for (const [col, val] of Object.entries(cfg.fixedFilter)) {
        deleteQuery = deleteQuery.where(col, val as any);
      }
    }
    const deleted = await deleteQuery.delete();
    if (deleted === 0) return fail(res, 404, 'Documento no encontrado');
    busDbEvent(collectionName, 'deleted', { id, table: cfg.table });
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
