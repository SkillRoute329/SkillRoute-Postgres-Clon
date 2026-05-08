# SESION ACTUAL — estado vivo

**Última actualización:** 2026-05-08 19:05 UTC — ✅ BRIDGE-067 RESUELTO. sentidoV2 poblado al 100% en eventos frescos. Sprint 4 desbloqueado.

---

## ✅ BRIDGE-067 RESUELTO — Fix sentidoV2 en eventos frescos

### Root cause confirmado
`autoStatsCollector.ts` era el único escritor de eventos GPS frescos en `vehicle_events`. Usaba una función local `detectarSentido()` que producía el campo `sentido` (legacy) pero NUNCA poblaba `sentidoV2`, `confianzaV2`, `scoreV2`, `tripIdV2`, `snapDistanceMV2`. El matching-engine Cloud Run `/infer` no tenía ningún caller en el codebase.

### Fix aplicado (commit pendiente)
`functions/src/autoStatsCollector.ts` — líneas 833-877:
- Añadido cómputo de `snapDistKm` usando `calcBestDistKm()` (ya existía para desvío detection)
- Campos V2 mapeados desde lógica local ya existente:
  - `sentidoV2 = result.sentido`
  - `confianzaV2 = result.confianzaSentido as string`
  - `scoreV2 = null` (sin score numérico en algo local)
  - `tripIdV2 = null` (sin trip matching en algo local)
  - `snapDistanceMV2 = isFinite(snapDistKm) ? Math.round(snapDistKm * 1000) : null`
  - `algoVersion = 'local-v1.0.0'`
- `calcBestDistKm` hoisted antes del event push, reutilizado en desvío detection (elimina doble cómputo)

### Verificación post-deploy (2026-05-08 18:58 UTC)
| Check | Resultado |
|---|---|
| sentidoV2 presente | ✅ 100/100 eventos (100%) |
| confianzaV2 presente | ✅ 100/100 |
| snapDistanceMV2 presente | ✅ 99/100 |
| Operadores cubiertos en muestra | CUTCSA (50) + UCOT (70) |
| autoStatsCollectorTick deployado | ✅ |
| autoStatsCollectorNow deployado | ✅ |

---

## PRÓXIMO PASO INMEDIATO — Sprint 4: Vista Operador

### Spec
- Ruta: `/dashboard/admin/regulatorio/operador/:agencyId`
- Similar a `RegulatorComplianceView` pero filtrada por la empresa propia del usuario
- ExportPDF firmado con SHA-256 (stub 501 ya existe)
- Spec completa: `docs/SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md` sección 3

### Commit pendiente (autoStatsCollector fix)

```
git add functions/src/autoStatsCollector.ts functions/lib/autoStatsCollector.js
git commit -m "fix(autoStats): poblar sentidoV2/confianzaV2/snapDistanceMV2 en eventos frescos

Root cause BRIDGE-067: autoStatsCollector.ts usaba detectarSentido() local
pero nunca escribia los campos V2. El matching-engine /infer no tenia callers.

Fix: mapear result.sentido -> sentidoV2, result.confianzaSentido -> confianzaV2,
calcBestDistKm() -> snapDistanceMV2. scoreV2/tripIdV2=null (sin snap avanzado
en algo local). algoVersion='local-v1.0.0'.

Verificado: 100/100 eventos recientes con sentidoV2, tsc 0 errores, build OK.
Deploys: autoStatsCollectorTick + autoStatsCollectorNow us-central1.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## CONTEXTO HISTÓRICO Sprint 3.5 (COMPLETADO)

### Swap ejecutado
| Operación | Resultado |
|---|---|
| Backup vehicle_events → vehicle_events_legacy_pre_swap_2026_05_07 | ~250k docs (parcial; v2 es el backup completo) |
| Swap vehicle_events_v2 → vehicle_events | **315.284 docs copiados** ✅ |
| aggregationEngine SOURCE_COL | `vehicle_events` (actualizado) ✅ |
| infer.ts V2_COL | `vehicle_events` (actualizado) ✅ |
| reprocess.ts V2_COL | `vehicle_events` (actualizado, permite también legacy) ✅ |
| aggregationEngineNow 2026-05-07 | processed=410, errors=0 ✅ |
| compliance/regulador 4 operadores | OK post-swap ✅ |
| Matching-engine Cloud Run redeploy | commit 668c7e50 ✅ |
| autoStatsCollector sentidoV2 fix | 100% cobertura ✅ |

---

## ✅ SPRINT 3 — Vista Regulador CERRADO (commit 50366978)

Verificado en producción: 4 operadores, cobertura 87.1%, endpoint OK.

---

## BACKLOG PRIORIZADO

| Prioridad | Tarea | Sprint |
|---|---|---|
| P0 (próximo) | Sprint 4: Vista Operador — OperatorComplianceView | Sprint 4 |
| P1 | ExportPDF firmado (stub implementado, lógica pendiente) | Sprint 4 |
| P1 | Eliminar adminDataSwap (función temporal, post-Sprint 3.5) | Post-Sprint 3.5 |
| P2 | Sprint 5: Vista Ejecutivo | Sprint 5 |
| P3 | Completar backup vehicle_events_legacy (si requerido) | Post-Sprint 3.5 |
| P3 | Reprocess CUTCSA completo (155k/500k estimado) | Post-Sprint 3 |

---

## BUGS CONOCIDOS NO CRÍTICOS

- Backup vehicle_events_legacy incompleto (~250k de ~500k docs). No crítico: v2 es el backup real.
- adminDataSwap Cloud Function no eliminada (temporal, hacerlo post-Sprint 4).
- L330/L370/L79: precisión 89-91%. Causa: rutas circulares complejas.
- ExportPDF: stub 501 — pendiente Sprint 4.
- LineDeepDive: histograma recharts no implementado aún.
- scoreV2 y tripIdV2 = null en eventos de autoStatsCollector (lógica local no produce score numérico ni trip matching). No bloquea aggregation ni compliance.

---

## DECISIONES OPERATIVAS TOMADAS

- Post-swap: `vehicle_events` es LA colección canónica para todos los eventos GPS enriquecidos
- `vehicle_events_v2` se mantiene 7 días como histórica (campo expiresAt controla TTL)
- aggregationEngine.ts SOURCE_COL = 'vehicle_events' (commit 668c7e50)
- matching-engine escribe a vehicle_events (no a _v2) desde deploy 668c7e50
- Backup parcial aceptado: v2 (315k docs enriquecidos) es la fuente de verdad
- Swap atómico implementado como Cloud Function con resume por cursor de documentId
- autoStatsCollector usa `algoVersion='local-v1.0.0'` para distinguir eventos enriquecidos localmente vs por matching-engine
- scoreV2=null y tripIdV2=null en eventos locales es comportamiento esperado y documentado
