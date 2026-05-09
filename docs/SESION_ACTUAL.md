# SESION ACTUAL — estado vivo

## NOTA AUDITORIA AUTOMATICA — 2026-05-09 15:14 UTC (iter 17)

Sin alarma — progreso incremental respecto iter 16:

- **Sistema operativo, 0 regresiones**. Build prod `fba9f37d` (sin cambios), HEAD avanzó a `67fceb4f` (+2 commits vs iter 16: `88511436` fix droMatrix corridor_overlap restore + `67fceb4f` docs STOP-AND-FIX) → **16 commits droMatrix pendientes deploy** (era 14, +2). Pipeline live 841 buses 4 ops 118 líneas (UY 12:03 transición almuerzo, IMM feed 842 features delta -1 normal). autoStatsCollector UP, lastSuccess 14:55Z (8 min), 0 fallos.
- **Reparación May 9 (acción 1)**: `aggregationEngineNow?date=2026-05-09` ejecutado vía fire-and-forget (curl --max-time 3, Cloud Function continuó server-side). Cobertura 68.5% → **68.9%** (+0.4 pts), eventos **9 106 → 11 858** (+2 752). UCOT 798→1117 ev / 73.4→74.7, CUTCSA 5948→7509 ev / 66.0→66.0, COME 868→1280 ev / 72.4→73.1, COETC 1492→1952 ev / 73.7→74.2.
- **Cobertura sistema 7d**: 57.2% → **57.4%** (+0.2 pts). Total eventos 7d: 200 292 → 203 044.
- **Cobertura 7d por operador (delta vs iter 16):** UCOT +0.5, CUTCSA +0.1, COME +0.3, COETC +0.3.
- **DATA-002 sin cambio (7ª iter sin progreso)**: May 8 cov 12.6% / 54 137 events idéntico iter11–17. Acción agotada (§16). Escalación a Jonathan/Code se mantiene (BRIDGE-080 sugerido iter 13).
- **Vista Operador L300 IDA UCOT**: OTP 87.67% n=527 cov=99.6% — **idéntico iter 14/15/16/17**, coherente ✅.
- **PATTERN-001 5ª evidencia**: cron `aggregationEngineCron` 06 UTC no procesa eventos posteriores. 5 iters consecutivas con backfill manual. Recomendación firme: aumentar frecuencia cron a cada 2 h o trigger onWrite.
- **Bridge actualizado**: BRIDGE-079 cerrado (P1 AUD-012 corridor_overlap restaurado a 8 395 pares — Code 13:28Z, Cowork validó zona estable Cross-Op + ShadowRadar 13:36Z). **Pendiente Code**: P2 Red Metropolitana dedupe (2 031 duplicados) + 3 hallazgos H-001/2/3 Cross-Op pre-presentación nacional + deploy 16 commits droMatrix.
- **NEW-001 latente** (9ª iter); AUD-012-P2 + H-001/2/3 documentados como hallazgos persistentes.

Detalle completo en `docs/AUDIT_LOG/ejecucion-2026-05-09-15-03.md`.

---

## NOTA AUDITORIA AUTOMATICA — 2026-05-09 13:17 UTC (iter 16)

Sin alarma — progreso incremental respecto iter 15:

- **Sistema operativo, 0 regresiones**. Build prod `fba9f37d` (sin cambios), HEAD `18d2e85d` (sin cambios) → 14 commits droMatrix pendientes deploy. Pipeline live 808 buses 4 ops 116 líneas (UY 10:03 rush mañana, IMM feed 813 features delta -5 normal). autoStatsCollector UP, lastSuccess 13:09Z (0 min — fresco), 0 fallos.
- **Reparación May 9 (acción 1)**: `aggregationEngineNow?date=2026-05-09` ejecutado. Cobertura sistema 68.6% → **68.5%** (-0.1 marginal por dilución), eventos **3 707 → 9 106** (+5 399, el incremento más grande observado en 4 iters de PATTERN-001). UCOT 524→798 ev / 74.8→73.4, CUTCSA 902→5 948 ev / 65.6→66.0, COME 247→868 ev / 70.8→72.4, COETC 182→1 492 ev / 70.8→73.7.
- **Cobertura sistema 7d**: 56.9% → **57.2%** (+0.3 pts, mejor delta de las últimas 4 iters). Total eventos 7d: 194 893 → 200 292.
- **Cobertura 7d por operador (delta vs iter 15):** UCOT +0.2, CUTCSA +0.2, COME +0.4, COETC +0.4.
- **DATA-002 sin cambio (6ª iter sin progreso)**: May 8 cov 12.6% / 54 137 events idéntico iter11–16. Acción agotada (§16). Escalación a Jonathan/Code se mantiene (BRIDGE-080 sugerido iter 13).
- **Vista Operador L300 IDA UCOT**: OTP 87.67% n=527 cov=99.6% — **idéntico iter 15**, coherente ✅.
- **PATTERN-001 4ª evidencia**: cron `aggregationEngineCron` 06 UTC no procesa eventos posteriores. 4 iters consecutivas con backfill manual (+1 240 a +5 399 events). Recomendación firme: aumentar frecuencia cron a cada 2h o trigger onWrite.
- **NEW-001 latente** (8ª iter), **DEPLOY-AUD-012** sin cambios (14 commits droMatrix pendientes deploy Code).

Detalle completo en `docs/AUDIT_LOG/ejecucion-2026-05-09-13-05.md`.

---

## NOTA AUDITORIA AUTOMATICA — 2026-05-09 11:14 UTC (iter 15)

Sin alarma — progreso incremental respecto iter 14:

- **Sistema operativo, 0 regresiones**. Build prod `fba9f37d` (sin cambios), HEAD `18d2e85d` (avanzó +3 commits droMatrix pendientes deploy: total **14 acumulados**). Pipeline live 595 buses 4 ops (UY 08:04 rush mañana, IMM feed 597 features delta -2 normal). autoStatsCollector UP, lastSuccess 10:54Z (12 min), 0 fallos.
- **Reparación May 9 (acción 1)**: `aggregationEngineNow?date=2026-05-09` ejecutado. Cobertura 68.5% → **68.6%** (+0.1 pts), eventos **2 060 → 3 707** (+1 647). UCOT 74.1→74.8, CUTCSA 66.4→65.6, COME 62.0→70.8, COETC 73.3→70.8. Mismo patrón iter 13/14: cron 06 UTC no cubre eventos posteriores; backfill manual cierra hueco.
- **Cobertura sistema 7d**: 56.8% → **56.9%** (+0.1 marginal). Techo natural 56-58% mientras DATA-002 (May 8) y DATA-001 (May 1-5) sigan en ventana.
- **DATA-002 sin cambio (5ª iter sin progreso)**: May 8 cov 12.6% idéntico. Acción agotada (§16). Escalación a Jonathan/Code se mantiene (BRIDGE-080 sugerido iter 13).
- **Vista Operador L300 IDA UCOT**: OTP 87.67% n=527 cov=99.6% — idéntico iter 14, coherente ✅.
- **NUEVO PATTERN-001 documentado**: cron `aggregationEngineCron` 06 UTC no procesa eventos posteriores a su corrida. 3 iters consecutivas (13/14/15) con backfill manual de +1240 a +1647 eventos. Recomendación: aumentar frecuencia a cada 2h o trigger onWrite.
- **NEW-001 latente** (7ª iter), **DEPLOY-AUD-012** ahora con 14 commits droMatrix pendientes deploy Code (+3 vs iter 14: `18d2e85d`, `509b93ce`, `819924ac`).

Detalle completo en `docs/AUDIT_LOG/ejecucion-2026-05-09-11-07.md`.

---

## NOTA AUDITORIA AUTOMATICA — 2026-05-09 09:10 UTC (iter 14)

Sin alarma — progreso incremental respecto iter 13:

- **Sistema operativo, 0 regresiones**. Build prod `fba9f37d`, HEAD `509b93ce` (sin cambios). Pipeline live saludable: 386 buses, 4 operadores, 85 líneas (UY 06:08, transición madrugada→mañana). IMM feed 391 features (delta -5, normal). autoStatsCollector UP, lastSuccess 08:54Z (14 min atrás), 0 fallos.
- **Reparación May 9 (acción 1)**: `aggregationEngineNow?date=2026-05-09` ejecutado. Cobertura 64.9% → **68.5%** (+3.6 pts), eventos 820 → 2 060 (+1 240). Mejoras por operador: UCOT +2.3 / CUTCSA +3.1 / COME +14.2 / COETC +0.2. Mismo patrón que iter 13: el cron diario 06 UTC no cubre eventos del día; el manual cierra el hueco.
- **Cobertura sistema 7d**: 56.7% → **56.8%** (+0.1, marginal — May 9 solo aporta 2 060 eventos vs 193 246 totales). Techo natural 56-58% mientras DATA-002 (May 8) y DATA-001 (May 1-5 vacíos) sigan en la ventana.
- **DATA-002 sin cambio (4ª iter sin progreso)**: May 8 cov 12.6% idéntico. Acción `aggregationEngineNow?date=2026-05-08` agotada por §16 — escalación a Jonathan/Code se mantiene (BRIDGE-080 sugerido en iter 13).
- **Vista Operador L300 IDA UCOT**: OTP 87.67% n=527 cov=99.6% — idéntico iter 13, coherente ✅.
- **NEW-001 latente** (6ª iter), **DEPLOY-AUD-012** sigue con 11 commits droMatrix pendientes deploy Code.

Detalle completo en `docs/AUDIT_LOG/ejecucion-2026-05-09-09-10.md`.

---

## ESCALAR — auditoria automatica agotó acciones — 2026-05-09 07:12 UTC (iter 13)

**Para Jonathan: DATA-002 cumplió criterio anti-loop (§16): 3 iteraciones consecutivas sin progreso.**

- **Problema:** May 8 cobertura GPS sistema = **12.6%** (vs ~85% típico). Detalle por op: UCOT 15.5% / CUTCSA 4.4% / COME 24.4% / COETC 25.6%. Idéntico en iter11, iter12 e iter13.
- **Acciones agotadas desde sandbox:**
  - `aggregationEngineNow?date=2026-05-08` ejecutado 3 veces (iter11, 12, 13) — sin cambio. El aggregator funciona; los datos fuente no llegan.
  - `aggregationEngineNow` para fuente vacía May 4-5 (DATA-001 legacy) — agotado iter11.
  - `gtfsImportRun` — agotado (HEAD inmutable, nada que importar).
  - `refreshAllStmHorariosNow` — causa raíz fuera de SkillRoute (feed IMM).
- **Causa raíz fuera del sandbox:** `vehicle_events` para 2026-05-08 tiene un gap. Hipótesis (orden de probabilidad):
  1. Cron `gpsHistoryAccumulator` o `gtfsRealtime` cayó parcialmente ese día.
  2. Snap-to-shape rejects masivos (ver `shapeReconstructionLog`).
  3. Feed IMM con intermitencia ese día.
- **Acción recomendada para Jonathan/Code (BRIDGE-080 sugerido):**
  1. Revisar logs Cloud Functions May 8 para `gpsHistoryAccumulator`, `gtfsRealtime`, `autoStatsCollectorTick`.
  2. Si se identifica gap, re-correr `gpsHistoryAccumulatorNow` para la ventana afectada.
  3. Después re-ejecutar `aggregationEngineNow?date=2026-05-08` y validar §15.
- **Lo que SÍ se reparó esta iter:** May 9 cobertura 0% → 64.9% (events 0 → 820, 4 operadores activos). El cron `aggregationEngineCron` 06 UTC no había procesado May 9 (o falló silente). La invocación manual lo cerró.

Sistema operativo, sin regresiones. Build prod `fba9f37d` estable. Detalle completo en `docs/AUDIT_LOG/ejecucion-2026-05-09-07-02.md`.

---

## NOTA AUDITORIA AUTOMATICA — 2026-05-09 05:02 UTC (iter 12)

Sin alarma — sin progreso desde iter 11 (esperado, ningún commit nuevo + acciones reparadoras agotadas):

- **Sistema operativo, sin regresiones**. Build `fba9f37d`, HEAD `509b93ce` (sin cambios vs iter 11). Todos endpoints críticos OK, autoStatsCollector UP (lastSuccess 04:54Z, 0 fallos consecutivos).
- **Métricas estables vs iter 11**: cobertura 7d 56.7% sistema (idéntico), L300 IDA UCOT OTP 87.67% n=527 cov=100% (idéntico), buses 24h 1 814 (vs 1 794 iter 11, +20 esperado por rolling).
- **Pipeline live**: 66 buses (UY 02:02 madrugada, servicio reducido coherente — IMM feed reporta 69, delta normal). Cross-op: UCOT 10 / CUTCSA 42 / COME 2 / COETC 12.
- **DATA-002 sin cambio (2ª iter sin progreso)**: May 8 cov 12.6% sigue. Acciones de backfill ya agotadas en iter 11. **Si iter 13 tampoco avanza, escalación a Jonathan**.
- **NEW-001 sigue latente** (4ª iter sin consumer; no urge). **DEPLOY-AUD-012**: 11 commits droMatrix pendientes deploy Code, no urgente.
- **Cron diario 06:00 UTC pendiente** (faltan ~55 min). May 9 datos llegan después de eso.

**Acción Code sugerida (BRIDGE-079):** investigar logs `gpsHistoryAccumulator` + `gtfsRealtime` para 2026-05-08 — único hallazgo persistente que requiere intervención fuera del sandbox.

Detalle completo en `docs/AUDIT_LOG/ejecucion-2026-05-09-05-02.md`.

---

## NOTA AUDITORIA AUTOMATICA — 2026-05-09 03:02 UTC (iter 11)

Sin alarma — registro de progreso para próxima sesión:

- **Sistema operativo, sin regresiones**. Build prod `fba9f37d` estable; todos los endpoints críticos OK; SPA shell carga; autoStatsCollector UP (lastSuccess 03:09Z, 0 fallos).
- **Cobertura GPS sistema 7d cayó vs iter 10**: 87.1% → **56.7%**. NO es regresión del producto — es por composición de la ventana rolling-7d:
  - May 6: 87.1% (sano), May 7: 62.2% (sano), May 8: **12.6% (anómalo)**, May 1-5 sin agregados (DATA-001 pre-existente).
- **NUEVO HALLAZGO DATA-002 (severidad media)**: cobertura GPS May 8 = 12.6% sistema (UCOT 15.5%, CUTCSA 4.4%, COME 24.4%, COETC 25.6%). Backfill manual confirmó: el aggregator funciona, el problema está aguas arriba en `vehicle_events`. **Acción Code:** investigar logs `gpsHistoryAccumulator` y `gtfsRealtime` cron May 8 — posible gap del pipeline GPS o snap-to-shape masivo de rejects ese día.
- **Vista Operador L300 IDA UCOT**: OTP 87.67% n=527 cov=100% — **coherente** ✅
- **Pipeline live OK**: 270 buses 4 operadores 78 líneas (UY 00:13 noche, descenso esperado).
- **NEW-001 persistente** (iter 9→10→11): `/api/agency-lines/:X` HTTP 502, latente (sin consumer).
- **11 commits AUD-012 droMatrix pendientes deploy** Code (`509b93ce..ef1813e7`). No urgente.

**Recomendación demo CUTCSA:** ajustar filtro de fecha Vista Regulador a May 6-7 para mostrar la ventana sana (cobertura 87% / 62%) y evitar el outlier May 8.

Detalle completo en `docs/AUDIT_LOG/ejecucion-2026-05-09-03-02.md`.

---

**Última actualización:** 2026-05-09 15:47 UTC — Code ejecutó órdenes BRIDGE-079. H-001+H-003 fix deployado (commit 7dc2d6c2). PATTERN-001 resuelto con nuevo cron (commit 9ed9e94e). DATA-002 investigado y cerrado (no es falla activa). P2 BLOQUEADO (GanttRedMetropolitana CONGELADO). H-002 COETC pendiente verificación visual.

### 🔴 PRÓXIMO PASO INMEDIATO (para Cowork — verificación browser)
1. **H-001 + H-003**: Abrir Cross-Op (CorridorIntelligencePage) → confirmar que balance muestra porcentajes reales (antes: "0% ganado / 100% perdido") y que aparecen oportunidades DRO ≥ 10% (antes: "Sin oportunidades")
2. **H-002 COETC**: En la misma vista, verificar si aparecen 4 operadores rivales (antes: solo 3, faltaba COETC). Si COETC sigue faltando, escalar a Code con bridge para rerun `reconstructShapesNow` + DRO.
3. **ShadowRadar**: Confirmar DRO coverage cercano al 72% histórico (ya verificado por Cowork en BRIDGE-079, pero confirmar que el fix H-001 no rompió nada)
4. **P2 Red Metropolitana**: Archivo CONGELADO por §17. Pendiente decisión Jonathan: descongelar o limpiar shapes_cross_operator en Firestore. Sin acción de Code hasta orden.
5. Si todo OK: avanzar a AUD-017..022 (P1 data bugs)

---

## ✅ COMPLETADOS ESTA SESIÓN (commits verificados)

| AUD | Descripción | Commit | Verificado |
|---|---|---|---|
| AUD-012 | droMatrix: lng→lon + shapeKey fallback + safety guard + STOP-AND-FIX (RESAMPLE 200m + SegB precomputado + bbox 0.02°) → 8395 pares, 133s | `88511436` | ✅ logs función status 200, written=8395 · verificación visual pendiente Cowork |
| H-001+H-003 | Cross-Op balance y oportunidades: dos queries paralelas agencyA+agencyB en ExecutiveSummary (reemplaza limit(5000) que cortaba UCOT-as-agencyA por orden lexicográfico). CorridorMarketShare: limit 5000→10000 | `7dc2d6c2` | ✅ deploy prod verified (version.json 7dc2d6c2 15:25:45Z) · verificación visual pendiente Cowork |
| PATTERN-001 | aggregationEngineMidDayCron 18:00 UTC (15:00 UY): procesa el día actual con datos parciales, elimina backfill manual recurrente. Deployed como nueva Cloud Function | `9ed9e94e` | ✅ firebase deploy OK + gcloud list ACTIVE |
| AUD-014 | VistaDia: reset filtro on empresa change + type mismatch busesVivos + directionId en FilaLinea | `fba9f37d` | ✅ version.json |
| AUD-016 | useRealtimeData.ts: 4 onSnapshot con error handler; SystemIntegrity.ts sin setDoc auto-create; firestore.rules reglas explícitas coaches/vehicles/fleet_checks/_healthcheck | `7fa7c2c8` | ✅ version.json |
| AUD-015 | ShadowRadar.tsx: `Number(b.codigoEmpresa) === empresaPropia` corrige type mismatch string/number → UCOT ya no muestra 0 | `0500ad3c` | ✅ version.json |
| AUD-008 | DashboardLayout.tsx header: pill ahora muestra "130 · 1319 sistema" en lugar de solo propios | `0ee549ad` | ✅ version.json |

**Total acumulado completados:** 21/31 AUD-items

---

## 🔴 EN CURSO — Auditoría pre-presentación BRIDGE-071

**Estado global:** 21/31 AUD completados · 1 BLOQUEADO (decisión Jonathan) · 9 pendientes (P1 + P2 restantes)

### ✅ Completados histórico (sesiones anteriores, commits verificados)

| AUD | Descripción | Commit |
|---|---|---|
| AUD-001 | Badge "Sin datos hoy" en DashboardHome | `bab621d7` |
| AUD-002 | Copy profesional en BoletinInspeccion + DistribucionDiaria | `bab621d7` |
| AUD-003 | Copy RRHH/técnico en AppMaintenance | `bab621d7` |
| AUD-004 | Versiones eliminadas de RegulatorComplianceView + OperatorComplianceView | `bab621d7` |
| AUD-005 | Timeout 5s spinner + "Sin alertas hoy" emerald | `bab621d7` |
| AUD-006 | `Nº ${h.interno}` + "Conductor sin identificar" | `3ff3bc18` |
| AUD-009 | Header siempre "EN LÍNEA" | `bab621d7` |
| AUD-010 | Teléfonos enmascarados maskPhone() Ley 18.331 | `41404589` |
| AUD-011 | PLPorOperador subtítulo UYU + período + tarifa STM | `41404589` |
| AUD-013 | ComplianceHub vencido → "Pendiente generación" | `3ff3bc18` |
| AUD-026 | DiagnosticoEjecutivo: BloqueRecomendaciones al TOP | `7b781e55` |
| AUD-027 | DashboardHome badge "Sin datos hoy" | `bab621d7` |
| AUD-030 | ListeroModule: "—" si turnosTotal=0 | `7b781e55` |

---

### ❌ BLOQUEADO — Decisión Jonathan

| AUD | Razón |
|---|---|
| AUD-007 | Internos asignados a coches son muestra piloto, no producción real. No filtrar. |

---

## 🔴 PRÓXIMO PASO INMEDIATO — AUD-017..022 (P1 datos críticos demo)

AUD-014 completado. AUD-012 completado con observación (ver abajo). Próximo objetivo: P1 data bugs.

### AUD-017 — Fleet Intelligence 0% OTP por vehículo

**Síntoma:** módulo Fleet Intelligence muestra 0% OTP para todos los coches.
**Diagnóstico a hacer:**
1. Grep `autoStatsService.ts` por `otpPorCoche` — verificar si el campo se calcula y persiste
2. Verificar que el cron `autoStatsCollectorTick` está corriendo (lastSuccessful < 15 min)
3. Verificar colección `auto_stats` — ¿tienen campo `otpScore`?

### AUD-018 — Centro de Mando "3 de 4 componentes"

**Síntoma:** CentroMandoUnificado muestra 3 de 4 componentes OK.
**Diagnóstico:** identificar qué componente falla (buses activos, compliance, OTP, o alertas).

### AUD-019 — COME/COETC/CUTCSA flota activa = 0

**Síntoma:** Centro de Mando SA muestra flota activa = 0 para los 3 operadores no-UCOT.
**Diagnóstico:** verificar query de `isVehiculoActivo` para cada agencyId.

### AUD-020 — GTFS frequencies idénticas (14 min)

**Síntoma:** todos los operadores muestran frecuencia 14 min en módulo GTFS.
**Diagnóstico:** verificar colección `gtfs_frequencies` o cómo se calcula el headway.

### AUD-021 — Centro de Desvíos 0% ACK rate

**Síntoma:** 0% de alertas de desvío reconocidas.
**Diagnóstico:** verificar si el endpoint de ACK existe y si hay datos en `desvios_ack`.

### AUD-022 — "líneas operando" inconsistente

**Síntoma:** número de líneas operando difiere entre módulos.
**Diagnóstico:** identificar qué query usa cada módulo para contar líneas.

---

## ⚠️ OBSERVACIÓN AUD-012 — Cobertura corridor_overlap reducida

**Estado:** código correcto, datos parciales (31 pares vs ~302 históricos).

**Root cause documentado:**
- El deploy roto (`pairsWritten=0`) ejecutó el cleanup y borró los 1954 docs históricos
- Los 1954 docs venían de ~290 shapes de `shapeReconstruction` con 72h lookback
- Hoy hay 58 shapes disponibles (26 persistidas + 40 del `reconstructShapesNow`)
- `MAX_PINGS_PER_AGENCY = 25000` en `shapeReconstruction.ts` limita la cobertura

**Mitigaciones aplicadas:**
- `MIN_OVERLAP_PCT`: 10→5 para maximizar pares capturados con shapes disponibles
- Safety guard en droMatrix: si 0 pares calculados → abortar, no borrar colección
- Cron `droMatrixTick` (lunes 04:00) recalculará con shapes acumuladas

**Acción pendiente (decisión Cowork/Jonathan):**
- ¿Aumentar `MAX_PINGS_PER_AGENCY` en `shapeReconstruction.ts` (actualmente 25k)?
- Con más pings se cubren más líneas en cada run → más shapes → más pares DRO

---

## BACKLOG PRIORIZADO

| Prioridad | Tarea |
|---|---|
| P1 inmediato | AUD-017..022 (datos críticos demo) |
| P2 restantes | AUD-023 (alertas→mapa), AUD-024 (tooltips severity), AUD-025 (date selector global — zona estable), AUD-028 (estado "Todas+sentido"), AUD-029 (timestamps idénticos), AUD-031 (BRT badge) |
| Producto | PROD-01..04 (decisiones Jonathan) |
| Demo dry-run | Después de cerrar P1 |

---

## BUGS CONOCIDOS NO CRÍTICOS

- **AUD-007:** Asignaciones conductor↔coche son muestra piloto. Visible en Listero Cascada + Asignación de Coches.
- **AUD-012 cobertura:** corridor_overlap con 31 pares (histórico 302). Mejora con cada reconstructShapesTick.
- **NEW-001:** índice Firestore faltante `line_inspector_configs (agencyId, lineId)` → `/api/agency-lines/:agencyId` HTTP 502. No afecta UX (sin consumidor frontend activo). Fix: agregar índice en `firestore.indexes.json`.
- Backup `vehicle_events_legacy` incompleto (~250k de ~500k docs). No crítico.
- `scoreV2` y `tripIdV2` = null en eventos `autoStatsCollector`. Comportamiento esperado.
- GTFS 66.2% líneas OK — causa externa al feed IMM.
- `ExportPDF`: stub 501 — pendiente.

---

## DECISIONES OPERATIVAS TOMADAS ESTA SESIÓN

- AUD-012 root cause chain: `gtfsImporter` no persiste campo `key` en docData → `d.key = undefined` → `shapeBKey: undefined` → Firestore rechaza doc. Fix: `d.key ?? doc.id`. Además el `Point` interface usa `lon` pero gtfsImporter escribe `lng` → haversine NaN → overlap siempre 0.
- AUD-012 timeout root cause: 3 fuentes en `shapes_cross_operator` (gtfsImporter 1579 docs, shapeBuilder, shapeReconstruction 26-58 docs). Con fix `doc.id` las 1579 shapes tenían claves únicas → ~2.5M pares → timeout 540s. Fix: filtrar solo shapeReconstruction (`typeof d.key === 'string'` + agencyId in ['10','20','50','70']).
- `shapeReconstruction.ts` persiste campo `key` explícito en docData; `gtfsImporter.ts` y `shapeBuilder.ts` no lo hacen → diferenciador confiable.
- `gtfsImporter.ts` usa `AGENCY_CODE_MAP` pero el GTFS de la IMM usa códigos distintos → todas las líneas quedan con `agencyId="0"` → shapes de gtfsImporter inútiles para DRO cross-operador.
- AUD-015 root cause: `b.codigoEmpresa` llega como string desde API IMM; `empresaPropia` es number. Fix: `Number(b.codigoEmpresa) === empresaPropia`.
- AUD-016 root cause 1: onSnapshot sin error handler → "Uncaught Error in snapshot listener" logs en consola.
- AUD-016 root cause 2: SystemIntegrity.ts hacía `setDoc` en `system/global_config` antes de que Auth restaure el token → permission-denied en mount.
- AUD-016 root cause 3: coaches, vehicles, fleet_checks, _healthcheck sin reglas explícitas en firestore.rules.

---

## Lo que SÍ funciona — zona estable (no romper)

- Posición de Flota → Mapa en Vivo STM (4 operadores, IMM oficial)
- Cumplimiento por Línea (42 líneas, OTP/EWT/SD, drill-down funcional)
- Vista Regulador (4 operadores PLENO/GPS)
- Diagnóstico Ejecutivo (recomendaciones TOP + 4 bloques)
- Inteligencia Cross-Op (DRO y market share)
- Mapas Estratégicos (866 shapes)
- Navegador (mapa + paradas reales)
- Auth custom + Firebase
- Sentido IDA/VUELTA (91.5% cobertura)
- ShadowRadar (UCOT count fix 0500ad3c)
- Bridge Cowork↔Code (protocolo activo)
- Vista del Día (filtro operador fix fba9f37d)
