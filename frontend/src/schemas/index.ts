/**
 * schemas/index.ts — Zod schemas para boundaries Firestore→UI
 * ============================================================
 * Mes+1 #4 (2026-04-23)
 *
 * Valida docs de Firestore ANTES de pasárselos a los componentes.
 * Si Firestore devuelve un shape inesperado (migración vieja, doc corrupto,
 * reglas rotas), safeParseOrLog loggea el error y devuelve null en lugar
 * de dejar que React rompa.
 *
 * Uso típico:
 *
 *   onSnapshot(ref, (snap) => {
 *     snap.forEach(d => {
 *       const parsed = safeParseOrLog(VehicleEventSchema, d.data(), `vehicle_events/${d.id}`);
 *       if (parsed) list.push(parsed);
 *     });
 *   });
 */

import { z, ZodError, type ZodSchema } from 'zod';

/** Timestamp Firestore (pato-tipo: toDate(), toMillis(), seconds). */
const FirestoreTimestampSchema = z.object({
  toDate: z.function().args().returns(z.date()).optional(),
  toMillis: z.function().args().returns(z.number()).optional(),
  seconds: z.number().optional(),
}).passthrough();

/** Firestore GeoPoint (latitude, longitude). */
const GeoPointSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
}).passthrough();

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE EVENTS (GPS en vivo — ingestaIMMTick)
// ═══════════════════════════════════════════════════════════════════════════

export const VehicleEventSchema = z.object({
  idBus: z.union([z.string(), z.number()]),
  agencyId: z.string(),
  linea: z.string().nullable().optional(),
  lat: z.number(),
  lon: z.number(),
  velocidad: z.number().optional(),
  timestampGPS: z.union([z.string(), FirestoreTimestampSchema]).optional(),
  expiresAt: z.union([z.string(), FirestoreTimestampSchema]).optional(),
}).passthrough();

export type VehicleEvent = z.infer<typeof VehicleEventSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// ALERTA DE REGULACIÓN (ShadowRadar / shadowDispatcher)
// ═══════════════════════════════════════════════════════════════════════════

export const AlertaRegulacionSchema = z.object({
  tipo: z.string(),
  coche_id: z.union([z.string(), z.number()]),
  linea_id: z.string(),
  empresa_id: z.union([z.string(), z.number()]).optional(),
  rival_empresa: z.string().optional(),
  rival_linea: z.string().optional(),
  rival_interno: z.union([z.string(), z.number()]).optional(),
  distancia_metros: z.number().optional(),
  instruccion: z.string().optional(),
  mensaje_chofer: z.string().optional(),
  timestamp: z.union([z.string(), FirestoreTimestampSchema]).optional(),
  leido: z.boolean().optional(),
  fuente: z.string().optional(),
}).passthrough();

export type AlertaRegulacion = z.infer<typeof AlertaRegulacionSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// DELEGACIÓN AL INSPECTOR (Fix #6)
// ═══════════════════════════════════════════════════════════════════════════

export const DelegacionInspectorSchema = z.object({
  serviceNumber: z.union([z.string(), z.number()]),
  lineaId: z.string().nullable().optional(),
  requestedBy: z.string(),
  requestedByName: z.string().optional(),
  status: z.enum(['pending', 'acknowledged', 'completed', 'cancelled']),
  createdAt: z.union([z.string(), FirestoreTimestampSchema]).optional(),
  source: z.string().optional(),
}).passthrough();

export type DelegacionInspector = z.infer<typeof DelegacionInspectorSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// DESVÍO REPORTADO (Pre-CUTCSA #6)
// ═══════════════════════════════════════════════════════════════════════════

export const DesvioReportadoSchema = z.object({
  tipo: z.enum(['EVENTUAL', 'PROGRAMADO']),
  lineaCodigo: z.string(),
  varianteId: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  reportedBy: z.string(),
  createdAt: z.union([z.string(), FirestoreTimestampSchema]).optional(),
  estado: z.enum(['activo', 'cerrado', 'expirado']).optional(),
  source: z.string().optional(),
}).passthrough();

export type DesvioReportado = z.infer<typeof DesvioReportadoSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// PARÁMETRO ECONÓMICO (Fase 1 — colección parametros_operativos)
// ═══════════════════════════════════════════════════════════════════════════

export const ParametroEconomicoSchema = z.object({
  valor: z.union([z.number(), z.string(), z.boolean()]),
  unidad: z.string(),
  fuente: z.string(),
  fuenteUrl: z.string().url().optional(),
  fechaVigenciaDesde: z.string(),
  confidence: z.enum(['oficial', 'calibrado', 'estimado', 'hardcoded']),
  editableByAdmin: z.boolean(),
  nota: z.string().optional(),
  disclaimer: z.string().optional(),
  updatedBy: z.string().optional(),
  updatedByName: z.string().optional(),
  updatedAt: z.union([z.string(), FirestoreTimestampSchema]).optional(),
}).passthrough();

export type ParametroEconomicoZod = z.infer<typeof ParametroEconomicoSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// VIAJE ACTIVO (viajes_activos)
// ═══════════════════════════════════════════════════════════════════════════

export const ViajeActivoSchema = z.object({
  cocheId: z.union([z.string(), z.number()]).optional(),
  vehicleId: z.union([z.string(), z.number()]).optional(),
  empresa: z.string().optional(),
  codigoLinea: z.string().optional(),
  posicion: GeoPointSchema.optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  velocidad: z.number().optional(),
  pasajeros: z.number().optional(),
  estado: z.string().optional(),
  conductorNombre: z.string().optional(),
  updatedAt: z.union([z.string(), FirestoreTimestampSchema]).optional(),
}).passthrough();

export type ViajeActivo = z.infer<typeof ViajeActivoSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Intenta parsear un objeto con el schema dado. Si falla, loggea + devuelve null.
 * Nunca tira — la UI que llama no debe envolverse en try/catch.
 */
export function safeParseOrLog<T>(
  schema: ZodSchema<T>,
  input: unknown,
  context: string,
): T | null {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  console.warn(
    `[schemas] safeParseOrLog falló en "${context}":`,
    result.error instanceof ZodError ? result.error.issues : result.error,
  );
  return null;
}

/** Versión que tira si el parseo falla — usar solo cuando el dato ES requisito. */
export function parseOrThrow<T>(schema: ZodSchema<T>, input: unknown, context: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `[schemas] parseOrThrow falló en "${context}": ${result.error.message}`,
    );
  }
  return result.data;
}

/** Parsea un array de docs, filtrando los inválidos (los loguea pero no tira). */
export function safeParseArray<T>(
  schema: ZodSchema<T>,
  items: unknown[],
  context: string,
): T[] {
  const out: T[] = [];
  items.forEach((item, idx) => {
    const p = safeParseOrLog(schema, item, `${context}[${idx}]`);
    if (p !== null) out.push(p);
  });
  return out;
}
