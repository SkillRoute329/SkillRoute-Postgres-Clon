# features/disruptions

Feature de gestión de disrupciones operacionales: desvíos no programados, accidentes, cortes de servicio y cualquier incidente que afecte la operación.

## Estructura

```
disruptions/
├── components/
│   └── ActiveDisruptionsWidget.tsx   ← widget compacto para dashboards
├── pages/
│   └── AdminDisruptionsPage.tsx      ← página CRUD + workflow de estado
├── services/
│   └── disruptionsService.ts          ← Firestore CRUD + suscripciones
├── schemas/
│   ├── disruption.ts                   ← Zod schema + state machine
│   └── disruption.test.ts              ← tests del state machine
├── index.ts                             ← API pública
└── README.md                            ← este archivo
```

## API pública

Todo lo que se usa desde fuera de la feature se importa únicamente desde `@/features/disruptions`:

```ts
import {
  ActiveDisruptionsWidget,
  AdminDisruptionsPage,
  type Disruption,
  subscribeActiveDisruptions,
} from '@/features/disruptions';
```

Los archivos internos no se importan directamente. Si necesitás algo que hoy no está en `index.ts`, agregarlo explícitamente — esto mantiene el contrato de la feature claro.

## State machine

Las disrupciones siguen el ciclo: `DETECTED → ACKNOWLEDGED → IN_PROGRESS → RESOLVED | CANCELLED`

Transiciones válidas en `schemas/disruption.ts` (`VALID_TRANSITIONS`). El helper `canTransition()` debe usarse antes de cualquier `update`.

## Consumidores actuales

- `App.tsx` — registra `AdminDisruptionsPage` en `/admin/disruptions`
- `ActiveDisruptionsWidget` está listo para insertar en `CEODashboard` o cualquier dashboard ejecutivo

## Historia

Primera feature migrada al patrón feature-first (ADR 002) el 2026-04-24.
Sirve de template para las siguientes migraciones.
