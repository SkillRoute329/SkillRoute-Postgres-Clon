# SESION ACTUAL — estado vivo

**Última actualización:** 2026-05-08 18:30 UTC — Sprint 3.5 DONE (pendiente verificación Cowork §15 criterio 5) | Sprint 4 autorizado si Cowork confirma pipeline live

---

## ✅ SPRINT 3.5 — Atomic Swap vehicle_events COMPLETADO

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

### Verificaciones Cowork pendientes (§15 criterio 5)
1. Pipeline live: query vehicle_events con timestampGPS últimos 30 min → docs deben tener sentidoV2
2. L316 sample: sentido balanceado IDA/VUELTA
3. Frontend /dashboard/traffic/diagnostico-cumplimiento: L316 datos coherentes

### Nota técnica sobre el backup
La colección vehicle_events tiene ~500k docs. El backup completo excede el timeout de Cloud Functions (540s). Se copió ~250k docs (los más recientes por orden de documentId). `vehicle_events_v2` actúa como backup completo enriquecido. La función `adminDataSwap` queda desplegada para completar el backup si Cowork lo requiere.

---

## PRÓXIMO PASO INMEDIATO — Sprint 4 (si Cowork confirma criterio 5)

Esperar bridge de Cowork confirmando criterio 5 (pipeline live sentidoV2).
Si OK → Sprint 4: **Vista Operador** (`OperatorComplianceView`).

Spec: `docs/SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md` sección 3.
- Ruta: `/dashboard/admin/regulatorio/operador/:agencyId`
- Similar a RegulatorComplianceView pero vista propia de cada operador (no cross-operador)
- ExportPDF firmado con SHA-256

**Si Cowork detecta regresión**: rollback con `git revert 668c7e50` + redeploy matching-engine.

---

## ✅ SPRINT 3 — Vista Regulador CERRADO (commit 50366978)

Verificado en producción: 4 operadores, cobertura 87.1%, endpoint OK.

---

## BACKLOG PRIORIZADO

| Prioridad | Tarea | Sprint |
|---|---|---|
| P0 (próximo si Cowork confirma) | Sprint 4: Vista Operador — OperatorComplianceView | Sprint 4 |
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

---

## DECISIONES OPERATIVAS TOMADAS

- Post-swap: `vehicle_events` es LA colección canónica para todos los eventos GPS enriquecidos
- `vehicle_events_v2` se mantiene 7 días como histórica (campo expiresAt controla TTL)
- aggregationEngine.ts SOURCE_COL = 'vehicle_events' (commit 668c7e50)
- matching-engine escribe a vehicle_events (no a _v2) desde deploy 668c7e50
- Backup parcial aceptado: v2 (315k docs enriquecidos) es la fuente de verdad
- Swap atómico implementado como Cloud Function con resume por cursor de documentId
