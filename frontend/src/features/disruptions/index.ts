/**
 * features/disruptions — API pública
 *
 * Solo se debe importar desde esta barrel file desde fuera de la feature.
 * Lo interno (implementaciones de hooks, componentes privados, helpers) no
 * se exporta para evitar acoplamiento cruzado entre features.
 *
 * Esta es la primera feature migrada al patrón feature-first (ADR 002).
 * Sirve de template para las siguientes: competidores, cartones, shadow-radar.
 */

// Componentes reutilizables
export { default as ActiveDisruptionsWidget } from './components/ActiveDisruptionsWidget';

// Páginas (para el router)
export { default as AdminDisruptionsPage } from './pages/AdminDisruptionsPage';

// Tipos y schemas (para callers que necesitan tipar estado)
export {
  type Disruption,
  type DisruptionSeverity,
  type DisruptionStatus,
  type DisruptionType,
  type DisruptionCreatePayload,
  DisruptionSchema,
  DisruptionCreatePayloadSchema,
  DisruptionSeveritySchema,
  DisruptionTypeSchema,
  VALID_TRANSITIONS,
  canTransition,
  severityColor,
  severityEmoji,
} from './schemas/disruption';

// Service — solo lo que otras features podrían necesitar consumir
export {
  subscribeActiveDisruptions,
  createDisruption,
  transitionDisruption,
  fetchHistory,
} from './services/disruptionsService';
