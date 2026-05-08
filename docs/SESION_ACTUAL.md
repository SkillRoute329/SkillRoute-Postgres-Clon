# SESION ACTUAL — estado vivo

**Última actualización:** 2026-05-09 02:45 UTC — AUD-008/012/014/015/016/032 CERRADOS. 21/31 AUD-items completados. AUD-012 con observación de cobertura (31 pares vs 302 históricos — data pipeline). En cola: P1 data bugs (AUD-017..022).

---

## ✅ COMPLETADOS ESTA SESIÓN (commits verificados)

| AUD | Descripción | Commit | Verificado |
|---|---|---|---|
| AUD-012 | droMatrix: lng→lon fix + shapeKey desde doc.id + deduplicación lógica + safety guard + filtro shapeReconstruction + sentido pre-filter + MIN_OVERLAP_PCT 5% | `08a25433` | ✅ droMatrix 31 pares, cross-op confirmado |
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
