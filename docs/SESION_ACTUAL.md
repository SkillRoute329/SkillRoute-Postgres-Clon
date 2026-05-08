# SESION ACTUAL — estado vivo

**Última actualización:** 2026-05-08 00:05 UTC — Sprint 3 CERRADO en producción | Próximo: Sprint 3.5 atomic swap vehicle_events

---

## ✅ SPRINT 3 — Vista Regulador CERRADO (commit 50366978 + fix índice)

### Verificación en producción confirmada (§15)
| Check | Resultado |
|---|---|
| `version.json` commit | `50366978` ✅ |
| Endpoint `/api/compliance/regulador` | 4 operadores con datos reales ✅ |
| Verificación visual | Confirmada por Jonathan ✅ |

### Métricas verificadas en producción
| Operador | OTP | EWT | SD% | Cobertura GPS |
|---|---|---|---|---|
| UCOT (70) | 67.62% (n=4.083) | 3.16 min (n=9) | 42.94% (n=336) | 86.5% |
| CUTCSA (50) | 52.79% (n=21.504) | 12.14 min (n=257) | 71.25% (n=2.857) | 87.4% |
| COME (20) | 76.75% (n=5.097) | 10.63 min (n=98) | 30.74% (n=271) | 84.2% |
| COETC (10) | 58.37% (n=7.901) | 4.48 min (n=31) | 54.88% (n=535) | 88.0% |
| **Sistema** | — | — | — | **87.1%** |

### Fix adicional aplicado en esta sesión
- Índice Firestore faltante agregado: `compliance_aggregates (agencyId ASC + granularidad ASC + periodo ASC)`
- Deployado en `firestore.indexes.json` + `firebase deploy --only firestore:indexes`

---

## PRÓXIMO PASO INMEDIATO — Sprint 3.5: atomic swap vehicle_events

**Contexto:** Cowork dejó pendiente en BRIDGE-065 el Sprint 3.5 (autorizado).
El sprint consiste en hacer un swap atómico de `vehicle_events` → `vehicle_events_v2`
para que el pipeline live use la nueva colección con sentidoV2.

**Antes de empezar, verificar precondiciones de Cowork (BRIDGE-065):**
1. `vehicle_events_v2` tiene datos de las últimas horas con campo `sentidoV2`
2. Matching engine escribe en `vehicle_events_v2` (confirmar)
3. Backup `vehicle_events_legacy_pre_swap_2026_05_07` existe
4. Frontend `/dashboard/traffic/diagnostico-cumplimiento` muestra datos coherentes (no 0 eventos)
5. Pipeline live: eventos del feed STM últimos 30 min llegan a `vehicle_events` con `sentidoV2`

**Si los 5 puntos pasan → ejecutar el swap:**
```bash
# Desde Claude Code
python cowork-tools/bridge/bridge_pull.py code
# Leer BRIDGE-065 completo para instrucciones del swap atómico
```

---

## BACKLOG PRIORIZADO

| Prioridad | Tarea | Sprint |
|---|---|---|
| P0 (próximo) | Sprint 3.5: atomic swap vehicle_events ← v2 | Sprint 3.5 |
| P1 | Sprint 4: Vista Operador — OperatorComplianceView | Sprint 4 |
| P1 | ExportPDF firmado (stub implementado, lógica pendiente) | Sprint 4 |
| P2 | Sprint 5: Vista Ejecutivo | Sprint 5 |
| P3 | Reprocess CUTCSA completo (instancia reciclada en 155k/estimados) | Post-Sprint 3 |

---

## BUGS CONOCIDOS NO CRÍTICOS

- L330/L370/L79: precisión 89-91% (debajo del 92% individual). Causa: rutas circulares complejas. No crítico.
- CUTCSA job detuvo en 155.369 docs (instancia Cloud Run reciclada). Validación §15 ya era representativa.
- ExportPDF: stub 501 — generación real pendiente Sprint 4.
- LineDeepDive usa recharts en imports pero no renderiza histograma aún — visual cards por línea funcional.
- BRIDGE-067 en inbox.md es duplicado accidental de BRIDGE-066 (retry por error encoding). Ignorar.

---

## DECISIONES OPERATIVAS TOMADAS

- matching-engine: Cloud Run us-central1, **min=1, --no-cpu-throttling** (OBLIGATORIO)
- compliance_aggregates: doc ID `{agencyId}_{linea}_{sentido}_{periodo}_{granularidad}`
- isHighFreq: GTFS como fuente primaria (headway_prog ≤ 12min), fallback GPS
- Asimetría PLENO/GPS: agencyId=70 (UCOT) tiene badge PLENO porque tiene cronograma oficial. Es feature, no bug (spec §2.3).
- LineDeepDive lee compliance_aggregates directamente desde Firestore (más simple que REST para el drill-down)
- Backend /api/compliance/regulador agrega métricas de líneas usando weighted average por n
- Índice Firestore compliance_aggregates necesita periodo ASCENDING para queries con `>=`/`<=` (el índice DESCENDING existente no aplica a range queries)
