# SESION ACTUAL — estado vivo

**Última actualización:** 2026-05-07 23:50 UTC — Sprint 3 implementado | Pendiente deploy + verificación producción

---

## ✅ SPRINT 3 — Vista Regulador IMPLEMENTADO (pendiente deploy)

### Archivos creados
| Archivo | Descripción |
|---|---|
| `frontend/src/types/compliance.ts` | Tipos compartidos (MetricValue, LineAggregate, OperatorSummary, RegulatoryData) |
| `frontend/src/data/methodologyCatalog.ts` | Catálogo de 9 métricas en español con fórmulas |
| `frontend/src/services/complianceService.ts` | Cliente /api/compliance/regulador |
| `frontend/src/hooks/useMetricThreshold.ts` | Hook política de mínimos (Decisión 2) |
| `frontend/src/hooks/useComplianceData.ts` | Hook fetch + caché 5min |
| `frontend/src/components/shared/MetricBadge.tsx` | Badge reutilizable (INSUFICIENTE / IC_VISIBLE / OK) |
| `frontend/src/components/shared/DataQualityIndicator.tsx` | Barra cobertura GPS |
| `frontend/src/components/shared/MethodologyTooltip.tsx` | Tooltip hover/click con fórmula |
| `frontend/src/components/shared/TimeRangeSelector.tsx` | Selector período con presets |
| `frontend/src/components/shared/OperatorSelector.tsx` | Selector de operador |
| `frontend/src/components/cumplimiento/RegulatorMetricsTable.tsx` | Tabla cross-operador asimétrica |
| `frontend/src/components/cumplimiento/LineDeepDive.tsx` | Modal drill-down por línea (lee compliance_aggregates directamente) |
| `frontend/src/pages/regulatorio/RegulatorComplianceView.tsx` | Página principal Sprint 3 |
| `functions/src/api/complianceRegulador.ts` | Endpoint /api/compliance/regulador (agrega por operador) |

### Archivos modificados
| Archivo | Cambio |
|---|---|
| `functions/src/intelligenceApi.ts` | +import + registerComplianceReguladorRoutes(app) |
| `frontend/src/App.tsx` | +lazy import RegulatorComplianceView + ruta admin/regulatorio/cumplimiento |
| `frontend/src/components/Sidebar.tsx` | +CheckSquare import + entrada "Cumplimiento del Sistema" |

### Build verificado
- `functions/tsc --noEmit`: 0 errores ✅
- `frontend/tsc --noEmit`: 0 errores ✅  
- `check_integrity.sh`: INTEGRIDAD OK ✅
- `frontend/npm run build`: ✅ (291 entries PWA)

---

## PRÓXIMO PASO INMEDIATO — Deploy + Verificación

**Paso 1 — Commit y deploy:**
```bash
# Desde raíz del repo (Claude Code Windows)
git add frontend/src/types/compliance.ts \
        frontend/src/data/methodologyCatalog.ts \
        frontend/src/services/complianceService.ts \
        frontend/src/hooks/useMetricThreshold.ts \
        frontend/src/hooks/useComplianceData.ts \
        frontend/src/components/shared/MetricBadge.tsx \
        frontend/src/components/shared/DataQualityIndicator.tsx \
        frontend/src/components/shared/MethodologyTooltip.tsx \
        frontend/src/components/shared/TimeRangeSelector.tsx \
        frontend/src/components/shared/OperatorSelector.tsx \
        frontend/src/components/cumplimiento/RegulatorMetricsTable.tsx \
        frontend/src/components/cumplimiento/LineDeepDive.tsx \
        frontend/src/pages/regulatorio/RegulatorComplianceView.tsx \
        functions/src/api/complianceRegulador.ts \
        functions/src/intelligenceApi.ts \
        frontend/src/App.tsx \
        frontend/src/components/Sidebar.tsx \
        docs/SESION_ACTUAL.md \
        frontend/dist/

# Mensaje de commit:
# feat(sprint3): Vista Regulador — Cumplimiento del Sistema Metropolitano
# 
# Implementa Sprint 3 completo: tabla cross-operador asimétrica que muestra
# OTP/EWT/SD con IC95 y política de mínimos para los 4 operadores.
# Ruta: /dashboard/admin/regulatorio/cumplimiento
# Verificado: tsc 0 errores, build OK (UCOT+CUTCSA verificados visualmente pendiente)
#
# Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

firebase deploy --only hosting,functions
```

**Paso 2 — Verificación producción (§15):**
1. `curl -s "https://skillroute.web.app/version.json"` → commit debe coincidir con push
2. Navegar `/dashboard/admin/regulatorio/cumplimiento` → debe renderizar sin errores
3. Tabla cross-operador muestra las 4 empresas con sus métricas
4. Click en UCOT → modal LineDeepDive abre con las líneas del día
5. Console del browser → 0 errores nuevos

**Paso 3 — Bridge DONE:**
```bash
python cowork-tools/bridge/bridge_push.py \
  --from code --to cowork \
  --ref BRIDGE-066 \
  --status DONE \
  --topic "Sprint 3 Vista Regulador en producción" \
  --body "Sprint 3 deployado. URL: /dashboard/admin/regulatorio/cumplimiento. 13 archivos nuevos + 3 editados. tsc 0 errores. Verificar: tabla cross-operador 4 operadores, drill-down por línea, metodología tooltip. Asimetría PLENO/GPS por diseño (agencyId=70 UCOT tiene boletín+cartones)."
```

---

## ✅ SPRINT 2.5 — métricas completas CERRADO (commit 252f59e9)

### Métricas verificadas (2026-05-06)
| Línea | totalTrips | isHF | OTP | CV | BI | EWT | SRS |
|---|---|---|---|---|---|---|---|
| L316 IDA UCOT | 34 | False | 34.06% OK | 0.724 IC_V | 30% IC_V | null (correcto) | 55.5 IC_V |
| L181 IDA CUTCSA | 186 | **True** | 94.28% OK | 0.603 IC_V | 0% IC_V | **13.27min** IC_V | 82.6 IC_V |
| L300 IDA UCOT | 110 | True | 86.87% OK | 0.502 IC_V | 0% IC_V | 3.16min IC_V | 82.2 IC_V |
| L405 IDA COETC | 26 | False | 32.02% OK | 0.705 IC_V | 0% IC_V | null (correcto) | 55.2 IC_V |

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
- Cobertura cross-operador: UCOT 81.5%, CUTCSA 73.5%, COME 82.7%, COETC 80.4% — comportamiento esperado.
- ExportPDF: stub 501 — generación real pendiente Sprint 4.
- LineDeepDive usa recharts en imports pero no renderiza histograma aún — visual cards por línea funcional.

---

## DECISIONES OPERATIVAS TOMADAS

- matching-engine: Cloud Run us-central1, **min=1, --no-cpu-throttling** (OBLIGATORIO)
- compliance_aggregates: doc ID `{agencyId}_{linea}_{sentido}_{periodo}_{granularidad}`
- isHighFreq: GTFS como fuente primaria (headway_prog ≤ 12min), fallback GPS
- Asimetría PLENO/GPS: agencyId=70 (UCOT) tiene badge PLENO porque tiene cronograma oficial. Es feature, no bug (spec §2.3).
- LineDeepDive lee compliance_aggregates directamente desde Firestore (más simple que REST para el drill-down)
- Backend /api/compliance/regulador agrega métricas de líneas usando weighted average por n
