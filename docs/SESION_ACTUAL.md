# SESION ACTUAL — estado vivo

**Última actualización:** 2026-05-07 — Sprint 1 Cumplimiento V2: matching-engine completo + BRIDGE-055 cerrado

---

## EN CURSO

### Sprint 1 Cumplimiento V2 — MATCHING-ENGINE VIVO EN PRODUCCIÓN ✅

- **URL:** `https://matching-engine-231108889084.us-central1.run.app`
- **Imagen:** `gcr.io/ucot-gestor-cloud/matching-engine:420a0e3b`
- **Health:** `{"status":"ok","version":"matching-v1.0.0"}` ✅
- **/infer L316 smoke test:** `sentido=IDA, confianza=MEDIUM, snapDistanceM=2.39m` ✅

Lo que falta (Días 8-14 del sprint):
1. **Reprocesar último mes** — `POST /reprocess`
2. **Validación 10 líneas ground truth** — §5.5 de la spec

### PRÓXIMO PASO INMEDIATO (para la próxima sesión)

Ejecutar el reprocesamiento del último mes:

```bash
ACCESS_TOKEN=$(gcloud auth print-identity-token)

# 1. Lanzar reprocesamiento (UCOT primero)
curl -s -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "2026-04-01T00:00:00Z",
    "to":   "2026-05-07T00:00:00Z",
    "agencyId": "70",
    "writeTarget": "vehicle_events_v2"
  }' \
  https://matching-engine-231108889084.us-central1.run.app/reprocess

# 2. Polling de progreso (reemplazar JOB_ID con el jobId del response)
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  https://matching-engine-231108889084.us-central1.run.app/reprocess/status/JOB_ID

# 3. Cuando status=DONE: verificar docs en vehicle_events_v2
# Esperado: docs con sentidoV2, confianzaV2, algoVersion=matching-v1.0.0
```

---

## HECHO EN ESTA SESIÓN (2026-05-07)

### Sprint 1 Cumplimiento V2 — matching-engine

| Archivo | Estado |
|---|---|
| `services/matching-engine/package.json` | ✅ Creado |
| `services/matching-engine/Dockerfile` | ✅ Creado |
| `services/matching-engine/cloudbuild.yaml` | ✅ Creado |
| `services/matching-engine/src/types.ts` | ✅ Interfaces completas |
| `services/matching-engine/src/lib/firestore.ts` | ✅ Admin SDK init |
| `services/matching-engine/src/lib/turfHelpers.ts` | ✅ snap, tangente, fuzzy |
| `services/matching-engine/src/lib/shapeCache.ts` | ✅ Cache 24h, max-stops |
| `services/matching-engine/src/lib/senseInference.ts` | ✅ Algoritmo §5 completo |
| `services/matching-engine/src/lib/tripMatching.ts` | ✅ Algoritmo §6 completo |
| `services/matching-engine/src/routes/health.ts` | ✅ GET /health |
| `services/matching-engine/src/routes/infer.ts` | ✅ POST /infer |
| `services/matching-engine/src/routes/reprocess.ts` | ✅ POST /reprocess + polling |
| `services/matching-engine/src/index.ts` | ✅ Express bootstrap |
| `services/matching-engine/test/senseInference.spec.ts` | ✅ 10 casos §10.1 |
| `services/matching-engine/test/tripMatching.spec.ts` | ✅ 3 tests mock |

**Resultados:**
- tsc: 0 errores
- Tests: 13/13 verdes
- npm run build: limpio

### BRIDGE-055 (UI cosmético)

- `CEODashboardV7.tsx:1111`: `"≤3 min"` → `"±4 min"` + `"Métrica estándar UITP"` → `"TCRP 165 / IMM"`
- `DashboardHome.tsx:108`: badge `"Pendiente seed"` cuando value===0 o '—'

### Fixes de sesiones anteriores (ya pusheados)

- `functions/src/gtfsImporter.ts`: max-stops selection + dual threshold (L46/L106) + delete solo dir truncada
- `functions/src/api/regulatorio.ts`: ATRASADO explícito como medible + tolerancia ≤4 min

---

## BACKLOG PRIORIZADO (post-Sprint 1)

| Prioridad | Tarea | Sprint |
|---|---|---|
| P0 | Deploy matching-engine a Cloud Run + /health OK | Sprint 1 Días 8-14 |
| P0 | POST /reprocess último mes → vehicle_events_v2 poblado | Sprint 1 |
| P0 | Validación ground truth 10 líneas (precisión ≥92%) | Sprint 1 |
| P1 | aggregation-engine Cloud Function (cron diario 03:00 UY) | Sprint 2 |
| P1 | compliance_aggregates → 12 métricas por línea+sentido+período | Sprint 2 |
| P2 | Vista Regulador (IMM/STM) — consume compliance_aggregates | Sprint 3 |
| P2 | Vista Operador — refactor existente a V2 | Sprint 4 |
| P3 | Vista Ejecutivo | Sprint 5 |

---

## BUGS CONOCIDOS NO CRÍTICOS

- `BRIDGE-054` cerrado (3 fixes P0 regulatorio) pero no hay screenshot de verificación post-deploy en prod
- L46 CUTCSA: SIN_HORARIO es correcto (IMM no publica timetable para L46), no es bug de código
- `vehicle_events_v2` colección no existe aún — se crea con el primer deploy del matching-engine

---

## DECISIONES OPERATIVAS TOMADAS

- matching-engine: Cloud Run us-central1, min=1, max=10, concurrency=80, timeout=30s
- `vehicle_events_v2`: misma estructura que v1 + campos V2 (sentidoV2, confianzaV2, tripIdV2, etc.)
- Rollback plan: feature flag `useV2=false` en `system_config/feature_flags`
- shapeCache: max-stops selection (mismo criterio que gtfsImporter BRIDGE-053)
- Dual threshold para dirección truncada: `shorter < 12 AND ratio < 0.5`
