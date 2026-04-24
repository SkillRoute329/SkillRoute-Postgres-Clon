/**
 * disruption.ts — Modelo de disrupción operacional
 * Trim+ #67 (2026-04-23)
 *
 * Un "disruption" es un evento operacional que afecta el servicio a los pasajeros
 * y requiere seguimiento: desvío no programado, corte de calle, accidente,
 * manifestación, falla eléctrica del vehículo, etc.
 *
 * Workflow típico (estado máquina):
 *   DETECTED → ACKNOWLEDGED → IN_PROGRESS → RESOLVED / CANCELLED
 *
 * Uso:
 *   - Operador detecta incidente → `create()` con tipo/severidad/líneas afectadas
 *   - Jefe de Tráfico lo ACKNOWLEDGE → timestamp + assignedTo
 *   - Supervisor IN_PROGRESS → agrega acciones tomadas
 *   - Al resolverse: RESOLVED con root cause + prevention note
 *   - Si fue falsa alarma: CANCELLED con motivo
 *
 * El módulo expone schema Zod para validar entradas de UI y docs Firestore,
 * pero NO incluye lógica de transición (eso vive en el servicio Firestore).
 */

import { z } from 'zod';

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const DisruptionSeveritySchema = z.enum([
  'MINOR',      // afecta 1 coche o 1 parada — resolución local
  'MODERATE',   // afecta 1 línea durante < 30 min
  'MAJOR',      // afecta 1+ líneas durante > 30 min
  'CRITICAL',   // afecta múltiples corredores — activar protocolo crisis
]);
export type DisruptionSeverity = z.infer<typeof DisruptionSeveritySchema>;

export const DisruptionTypeSchema = z.enum([
  'DESVIO_NO_PROGRAMADO',   // calle cortada, obras imprevistas
  'ACCIDENTE',              // choque, atropello
  'FALLA_VEHICULO',         // mecánica en calle
  'CONGESTION_TRANSITO',    // embotellamiento extremo
  'EVENTO_MASIVO',          // manifestación, partido, concierto
  'CLIMA',                  // lluvia intensa, inundación, viento
  'FALLA_INFRA',            // corte de luz en estación, semáforos caídos
  'OTRO',
]);
export type DisruptionType = z.infer<typeof DisruptionTypeSchema>;

export const DisruptionStatusSchema = z.enum([
  'DETECTED',      // recién reportada, sin atender
  'ACKNOWLEDGED',  // tomada por supervisor
  'IN_PROGRESS',   // se están tomando acciones
  'RESOLVED',      // normalizada
  'CANCELLED',     // falsa alarma o duplicada
]);
export type DisruptionStatus = z.infer<typeof DisruptionStatusSchema>;

// ─── SCHEMA PRINCIPAL ────────────────────────────────────────────────────────

/** Timestamp Firestore (pato-tipo). */
const TimestampLike = z.object({
  toDate: z.function().optional(),
  toMillis: z.function().optional(),
  seconds: z.number().optional(),
}).passthrough();

export const DisruptionSchema = z.object({
  /** ID Firestore. Opcional en create. */
  id: z.string().optional(),

  /** Clasificación */
  tipo: DisruptionTypeSchema,
  severidad: DisruptionSeveritySchema,

  /** Estado máquina */
  estado: DisruptionStatusSchema,

  /** Texto libre — qué pasa. */
  titulo: z.string().min(3),
  descripcion: z.string().optional(),

  /** Líneas afectadas (codigos STM: "300", "CA1", etc.). Array vacío = toda la red. */
  lineasAfectadas: z.array(z.string()).default([]),

  /** Operador dueño de la disrupción — para multi-tenancy futuro. */
  operadorId: z.string().default('ucot'),

  /** Ubicación aproximada. */
  lat: z.number().optional(),
  lng: z.number().optional(),
  direccionDescriptiva: z.string().optional(), // "Av Italia y Propios"

  /** Tracking temporal */
  createdAt: z.union([z.string(), TimestampLike]).optional(),
  detectedAt: z.union([z.string(), TimestampLike]).optional(),
  acknowledgedAt: z.union([z.string(), TimestampLike]).optional(),
  resolvedAt: z.union([z.string(), TimestampLike]).optional(),

  /** Personas */
  reportedBy: z.string(),
  reportedByName: z.string().optional(),
  assignedTo: z.string().optional(),
  assignedToName: z.string().optional(),

  /** Flujo resolución */
  accionesRealizadas: z.array(z.string()).default([]),
  rootCause: z.string().optional(),
  prevencion: z.string().optional(),

  /** Impacto estimado */
  impactoVehiculos: z.number().int().nonnegative().optional(),
  impactoViajesPerdidos: z.number().int().nonnegative().optional(),
  impactoPasajerosAprox: z.number().int().nonnegative().optional(),

  /** Links a otros docs */
  alertasRelacionadas: z.array(z.string()).default([]),
  desviosRelacionados: z.array(z.string()).default([]),
}).passthrough();

export type Disruption = z.infer<typeof DisruptionSchema>;

// ─── PAYLOAD PARA create() ──────────────────────────────────────────────────

/** Mínimo para abrir una disrupción — el resto se llena en workflow. */
export const DisruptionCreatePayloadSchema = z.object({
  tipo: DisruptionTypeSchema,
  severidad: DisruptionSeveritySchema,
  titulo: z.string().min(3),
  descripcion: z.string().optional(),
  lineasAfectadas: z.array(z.string()).default([]),
  operadorId: z.string().default('ucot'),
  lat: z.number().optional(),
  lng: z.number().optional(),
  direccionDescriptiva: z.string().optional(),
  reportedBy: z.string(),
  reportedByName: z.string().optional(),
});

export type DisruptionCreatePayload = z.infer<typeof DisruptionCreatePayloadSchema>;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Transiciones válidas del estado máquina. */
export const VALID_TRANSITIONS: Record<DisruptionStatus, DisruptionStatus[]> = {
  DETECTED:      ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED:  ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS:   ['RESOLVED', 'CANCELLED'],
  RESOLVED:      [], // terminal
  CANCELLED:     [], // terminal
};

export function canTransition(from: DisruptionStatus, to: DisruptionStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Color de severidad para UI. */
export function severityColor(s: DisruptionSeverity): string {
  return {
    MINOR:    'text-slate-400',
    MODERATE: 'text-amber-400',
    MAJOR:    'text-orange-500',
    CRITICAL: 'text-red-500',
  }[s];
}

/** Icono emoji de severidad (no crítico, solo estético). */
export function severityEmoji(s: DisruptionSeverity): string {
  return { MINOR: '●', MODERATE: '⚠', MAJOR: '⚠⚠', CRITICAL: '🚨' }[s];
}
