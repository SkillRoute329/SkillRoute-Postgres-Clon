# SESION ACTUAL — estado vivo

**Última actualización:** 2026-05-07 21:26 UTC — Sprint 2 DONE ✅ | 409 docs compliance_aggregates en producción

---

## ✅ SPRINT 2 — aggregationEngine CERRADO

### Métricas del primer run (2026-05-06)
| Operador | Docs DAILY | Notas |
|---|---|---|
| UCOT (70) | 42 | ~14 líneas × IDA+VUELTA+TODOS |
| CUTCSA (50) | 274 | ~90+ líneas × sentidos |
| COME (20) | 33 | ~11 líneas |
| COETC (10) | 60 | ~20 líneas |
| **TOTAL** | **409** | processed=409 errors=0 skipped=0 |

### Ejemplo de doc verificado: `70_17_IDA_2026-05-06_DAILY`
- `otp_low_freq`: 59.3%, badge=IC_VISIBLE, n=59
- `gps_coverage`: 100.0%, badge=IC_VISIBLE, n=149
- `headway_cv`: null (correcto — necesita ≥30 buses únicos por día)
- 12 métricas presentes con estructura completa (badge, value, displayValue, n, ic95Lo, ic95Hi, fuente, formula, estandar)

### Bridge cerrado
- BRIDGE-063 (IN_PROGRESS) → BRIDGE-064 (DONE) enviados a Cowork

---

## PRÓXIMO PASO INMEDIATO — Sprint 3: Vista Regulador

**Objetivo:** Pantalla que consume `compliance_aggregates` y muestra OTP por línea, por operador, por período. Equivalente al dashboard de cumplimiento que verían IMM/STM.

**Paso 1 — diseñar la query:**
```typescript
// compliance_aggregates donde:
// - periodo = "YYYY-MM-DD" (DAILY) o "YYYY-Www" (WEEKLY) o "YYYY-MM" (MONTHLY)
// - granularidad = "DAILY" | "WEEKLY" | "MONTHLY"
// - agencyId = empresaPropia (o "TODOS" si es SUPERADMIN)
// Ordenar por: linea ASC, sentido ASC
```

**Paso 2 — componente React:**
Tabla con columnas: Línea | Sentido | n | OTP | GPS Cobertura | Badge | Período
- Filtros: operador, granularidad, fecha/semana/mes
- Exportar a Excel (para reguladores)

**Archivos a crear:**
- `frontend/src/pages/compliance/VistaReguladorIMM.tsx` (componente principal)
- `frontend/src/services/complianceAggregatesService.ts` (query Firestore)
- Ruta en `App.tsx` y Sidebar

---

## ✅ SPRINT 1 CUMPLIMIENTO V2 — CERRADO

### Sprint 1 UCOT cerrado (sesión anterior)
- matching-engine v1.1.0-bearingfix: 95.0% precisión global en 12 líneas UCOT
- vehicle_events_v2 poblado para UCOT (28.595 docs)

### Sprint 1 Cross-Operador — Estado actual
| Operador | Docs procesados | Estado job |
|---|---|---|
| UCOT (70) | 28.595 | ✅ DONE |
| COME (20) | 31.539 | ✅ DONE |
| COETC (10) | 63.269 | ✅ DONE |
| CUTCSA (50) | 155.369 (instancia reciclada) | ⚠️ Job stopped — suficiente para validación |

### Validación §15 Cross-Operador — APROBADA

**Umbrales: balance = min(IDA,VUELTA)/max(IDA,VUELTA) | HM = (HIGH+MEDIUM)/total**

| Operador | Balance IDA/VUELTA | Umbral | HM(total) | Umbral | Estado |
|---|---|---|---|---|---|
| UCOT | 89.9% | ≥85% ✅ | 75.0% | ≥70% ✅ | OK |
| CUTCSA | 89.8% | ≥75% ✅ | 68.0% | ≥65% ✅ | OK |
| COME | 98.7% | ≥65% ✅ | 76.2% | ≥60% ✅ | OK |
| COETC | 95.4% | ≥75% ✅ | 74.7% | ≥65% ✅ | OK |

Reportado a Cowork via BRIDGE-062. Esperando autorización para cerrar Sprint 1 y arrancar Sprint 2.

---

## PRÓXIMO PASO INMEDIATO — Sprint 2: aggregation-engine

**Acción:** Esperar confirmación de Cowork (BRIDGE-062). Si autorizan, arrancar Sprint 2.

**Sprint 2 objetivo:** Cloud Function `aggregation-engine` que corre a las 03:00 UY diario, consume `vehicle_events_v2`, y produce `compliance_aggregates` con 12 métricas por línea+sentido+período.

**Paso 1 — crear la Cloud Function:**

```bash
# Estructura del aggregation-engine
cd functions/src
# Crear: aggregationEngine.ts
# Colección de salida: compliance_aggregates/{agencyId}_{linea}_{sentido}_{YYYY-MM-DD}
# Campos por doc: linea, sentido, fecha, agencyId,
#   totalEventos, eventosConSentido, eventosHIGH, eventosMEDIUM,
#   precision, cobertura (% eventos con sentido), 
#   totalPasadas, pasadasATIEMPO, pasadasATRASADAS, pasadasADELANTADAS,
#   OTP (pasadasATIEMPO/totalPasadas), frecuenciaMinProm, headwayMinProm,
#   creadoEn, periodoDesde, periodoHasta
```

**Orden lógico del Sprint 2:**
1. `aggregationEngine.ts` — cron 03:00 UY, lee v2, escribe compliance_aggregates
2. `compliance_aggregates` — índices Firestore necesarios
3. Vista Regulador (IMM/STM) — consume compliance_aggregates, muestra OTP por línea

---

## HECHO EN ESTA SESIÓN (2026-05-07)

### Sprint 1 Cross-Operador — completado
| Fix/Feature | Archivo | Estado |
|---|---|---|
| Fix coordenadas inválidas en reprocess | `routes/reprocess.ts` | ✅ |
| try-catch por documento (resiliente a docs corruptos) | `routes/reprocess.ts` | ✅ |
| parseFloat + isFinite + fallback NaN para lat/lng string | `routes/reprocess.ts` | ✅ |
| Rebuild y redeploy matching-engine v00007 | Cloud Run | ✅ |
| Job COME (20) completado | 31.539 docs | ✅ |
| Job COETC (10) completado | 63.269 docs | ✅ |
| Job CUTCSA (50) — instancia reciclada | 155.369 docs procesados | ⚠️ (validación ya OK) |
| Script crossOperatorValidation.js | `scripts/crossOperatorValidation.js` | ✅ |
| Validación §15 cross-operador APROBADA | 4 operadores OK | ✅ |
| Bridge BRIDGE-062 enviado a Cowork | Solicitud autorización Sprint 2 | ✅ |

---

## BACKLOG PRIORIZADO

| Prioridad | Tarea | Sprint |
|---|---|---|
| P0 (próximo) | aggregation-engine Cloud Function (cron 03:00 UY) | Sprint 2 |
| P0 | compliance_aggregates — 12 métricas por línea+sentido+período | Sprint 2 |
| P1 | Vista Regulador (IMM/STM) — consume compliance_aggregates | Sprint 3 |
| P1 | Vista Operador — refactor existente a V2 | Sprint 4 |
| P2 | Vista Ejecutivo | Sprint 5 |
| P3 | Reprocess CUTCSA completo (instancia reciclada en 155k/estimados) | Post-Sprint 2 |
| P3 | Reprocess otros operadores (COME, COETC) con shapes frescos | Post-Sprint 2 |

---

## BUGS CONOCIDOS NO CRÍTICOS

- L330/L370/L79: precisión 89-91% (debajo del 92% individual). Causa: rutas circulares complejas. No crítico para Sprint 1 (umbral es global).
- CUTCSA job detuvo en 155.369 docs (instancia Cloud Run reciclada, status quedó QUEUED). Muestra de 2000 para validación §15 ya era representativa — no es necesario re-lanzar para continuar.
- Cobertura cross-operador: UCOT 81.5%, CUTCSA 73.5%, COME 82.7%, COETC 80.4% — ~18-26% de eventos tienen confianza ZERO (buses en depósito, fuera de ruta, o líneas sin shape exacto). No es un bug, es comportamiento esperado del algoritmo.
- BRIDGE-054 cerrado pero sin screenshot de verificación post-deploy
- L46 CUTCSA: SIN_HORARIO correcto (IMM no publica timetable)

---

## DECISIONES OPERATIVAS TOMADAS

- matching-engine: Cloud Run us-central1, **min=1, --no-cpu-throttling** (OBLIGATORIO para jobs gRPC en background)
- `--no-cpu-throttling`: si se omite, la gRPC connection a Firestore tarda 88s y da DEADLINE_EXCEEDED
- Rango efectivo de reprocess: últimos 7 días (TTL de vehicle_events = 7 días)
- vehicle_events_v2: misma estructura que v1 + campos V2 (sentidoV2, confianzaV2, tripIdV2, etc.)
- Rollback plan: feature flag `useV2=false` en `system_config/feature_flags`
- Bearing fix: candidato único en movimiento + bearing opuesto → LOW/0.55 (no HIGH)
- Script de validación ground truth: `services/matching-engine/scripts/groundTruthValidation.js`
- Script de validación cross-operador: `services/matching-engine/scripts/crossOperatorValidation.js`
- "balance" en validación §15 = min(IDA,VUELTA)/max(IDA,VUELTA) — NO cobertura total
- "HM" en validación §15 = (HIGH+MEDIUM)/total — calidad de confianza sobre todos los eventos
- Fix de coordenadas inválidas: `parseFloat(String(d.lat ?? ''))` + `isFinite()` + `continue` si NaN
- try-catch por documento en reprocess: evita que un solo doc corrupto mate todo el job
