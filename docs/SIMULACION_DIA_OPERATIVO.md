# SkillRoute — Simulación Operativa de Día Completo Cross-Operador

> **Capa 4 de la auditoría interna** definida en `docs/ESTRATEGIA_INTERNATIONAL_GRADE.md`.
> **Validación funcional del producto bajo carga operativa real** simulada
> hora por hora sobre los 4 operadores del sistema metropolitano de Montevideo.
>
> **Fecha:** 2026-04-25
> **Datos de referencia:** schema verificado en producción + catálogo de funciones (`docs/CATALOGO_FUNCIONES.md`) + dossiers competitivos.
> **Output:** identificación de stress points, validación de cobertura cross-op por franja, base para el Dossier Ejecutivo final (#85).

---

## Metodología

Simulación documental de un **día tipo Hábil** sobre los 4 operadores
del sistema metropolitano (UCOT 70, CUTCSA 50, COME 20, COETC 10).
Para cada franja horaria documentamos:

- **Eventos típicos**: volumen de buses operando, viajes completados, alertas generadas.
- **Módulos en uso primario**: qué pantallas usa cada rol (tráfico, listero, dirección, regulador).
- **Crons activos**: pipelines automatizados que corren en esa franja.
- **Métricas críticas**: KPIs que el sistema debe poder reportar en vivo.
- **Estados de carga**: estimación de carga sobre infra (Firestore reads, Cloud Function invocations).
- **Riesgos operativos detectados**: dónde el sistema puede romper o degradarse.
- **Estado de cobertura** (verde / amarillo / rojo): qué tan bien el producto sostiene esa franja.

**Asunción de volumen:**

| Métrica | Valor estimado |
|---|---|
| Buses totales sistema metropolitano | ~1.500 (todos operadores) |
| Buses pico mañana | ~1.200-1.400 |
| Buses pico tarde | ~1.300-1.450 |
| Buses valle nocturno | ~150-300 |
| Viajes/día sistema completo | ~25.000-30.000 |
| Pings GPS/segundo en pico | ~50-80 |
| Eventos `vehicle_events`/día | ~100.000-200.000 |

---

## Cronograma por franja horaria

### 🌙 03:00-04:30 — Cierre nocturno + crons de mantenimiento

| Item | Detalle |
|---|---|
| **Eventos típicos** | <50 buses todavía operando líneas nocturnas (CE1, CE2, líneas 24h). Cierre de servicios. |
| **Módulos primarios** | (Operación humana mínima — autopilot del sistema) |
| **Crons activos** | `syncUCOTLinesCron` (03:00), `syncParadasSTMCron` (03:30), `archiveVehicleEvents` (vehicle_events viejos), `marketPenetration` snapshot diario, `historicMetrics` agregados, audit log compaction. |
| **Métricas críticas** | Health checks del scraper STM (`ingesta_health`), exit codes de crons, archivado exitoso. |
| **Carga infra** | BAJA. Crons batch — escrituras pesadas pero no concurrentes. |
| **Riesgos** | Si un cron falla silencioso, puede romper datos del día siguiente. **Mitigación:** healthcheck de cron en `system_status` con alerta. |
| **Cobertura** | 🟢 Verde — autopilot funcional. |

### 🌅 04:30-05:00 — Refresh competidores + arranque

| Item | Detalle |
|---|---|
| **Eventos típicos** | Primeros conductores llegan a depósito. Inspección pre-servicio. |
| **Módulos primarios** | VehicleCheck (mecánicos), Driver app (conductores haciendo check-in). |
| **Crons activos** | `refreshCompetidores` cron (cross-op data refresh), `refreshHorariosUcot`, scrapers STM. |
| **Métricas críticas** | `competidores` collection actualizada con buses operadores rivales para toda la jornada. Salud del feed STM-online. |
| **Carga infra** | BAJA-MEDIA. Crons + arranque de driver app FCM. |
| **Riesgos** | STM-Online a veces devuelve respuesta vacía o con error 5xx. **Mitigación:** retry exponencial en `immRealtimeService`. |
| **Cobertura** | 🟢 Verde. |

### 🚌 05:00-06:30 — Primer servicio + arranque pico mañana

| Item | Detalle |
|---|---|
| **Eventos típicos** | Primeros viajes salen. Crecen rápidamente de ~50 a ~800 buses operando. Volumen GPS pings explota. |
| **Módulos primarios** | NavigationModule (planificadores ven líneas activarse), TerminalListero (listeros confirman salidas), FleetMonitor (control en vivo). |
| **Crons activos** | Cron `refreshGtfsRtAlerts` cada 1 min publicando feed GTFS-RT con alertas tácticas en tiempo real. |
| **Métricas críticas** | OTP del primer servicio (debe ser cercano a 100%, los buses recién arrancan), alertas tempranas si un coche no salió. |
| **Carga infra** | MEDIA. Lectura masiva de `viajes_activos` desde dashboards. ~50 pings GPS/s. |
| **Riesgos** | Si un coche no salió o salió tarde, el sistema debe detectarlo en <5 min. **Mitigación:** `detectarDesvio` corriendo continuo + alertas FCM al supervisor. |
| **Cobertura** | 🟢 Verde — flujo crítico bien cubierto. |

### 🚦 06:30-09:00 — PICO MAÑANA (carga máxima)

| Item | Detalle |
|---|---|
| **Eventos típicos** | ~1.200-1.400 buses operando simultáneamente. Pasajeros máximos. Alertas múltiples (tráfico, demoras, cambios de cartón). |
| **Módulos primarios** | **TODOS los módulos en uso intenso.** FleetMonitor, OTPDashboard, ShadowRadar, IncidentCommandCenter, HeadwayInsights (Sprint 2), CartonManager, Boletín. |
| **Crons activos** | `refreshGtfsRtAlerts` cada 1 min, `shadowDispatcher` continuo, `scheduleAdherence` motor cross-op activo. |
| **Métricas críticas** | OTP en vivo (target >85% como Swiftly +40%), HRR cross-op (detección de bunching cross-operador), DRO live, alertas FCM a conductores con instrucciones tácticas en español. |
| **Carga infra** | **ALTA.** ~80 pings GPS/s. ~10K Firestore reads/min agregados. Cloud Functions concurrent invocations elevadas. |
| **Riesgos identificados** | (a) Latencia del feed GTFS-RT >5s degrada experiencia de pasajeros en Google Maps. (b) Si Firestore alcanza quota de reads se degrada. (c) Múltiples ACK simultáneos pueden causar `Document already exists` (ya mitigado con setDoc determinístico). |
| **Cobertura** | 🟡 Amarillo — flujo cubierto pero requiere monitoreo activo. **Recomendación: load test formal en Sprint 4.** |

### ☀️ 09:00-12:00 — Valle mañana

| Item | Detalle |
|---|---|
| **Eventos típicos** | Caída a ~700-800 buses. Foco en optimización: detección de overlap improductivo, planificación tarde. |
| **Módulos primarios** | ShadowRadar (analítica cross-op más detallada), MarketPenetration, EconomicProjections. Reuniones de planificación usan CEODashboard V7. |
| **Crons activos** | `scheduleAdherence`, `marketPenetration` continuo. |
| **Métricas críticas** | DRO cross-op por corredor, % de overlap improductivo, ROI proyectado por línea. |
| **Carga infra** | MEDIA. Caída natural de la actividad. |
| **Riesgos** | Bajo. Frame ideal para correr análisis pesados. |
| **Cobertura** | 🟢 Verde. |

### 🍽️ 12:00-12:30 — Pico almuerzo + relevo conductores

| Item | Detalle |
|---|---|
| **Eventos típicos** | ~1.000 buses. Cambio de turnos masivo en depósitos. RotationMatrix activo. |
| **Módulos primarios** | RotationMatrix, AdminTurnos (cross-op), DistribucionDiaria. |
| **Crons activos** | (continuos) |
| **Métricas críticas** | Conflictos de asignación detectados, conductores sin coche, coches sin conductor. |
| **Carga infra** | MEDIA-ALTA. Escrituras a `daily_shifts` + `assignment_conflicts`. |
| **Riesgos** | Si un relevo no se ejecuta a tiempo, el bus queda en cochera. **Mitigación:** alertas tempranas a supervisor. |
| **Cobertura** | 🟢 Verde. |

### 🏞️ 12:30-17:00 — Valle tarde + planificación

| Item | Detalle |
|---|---|
| **Eventos típicos** | ~700 buses operando estable. Foco directivo y planificación. |
| **Módulos primarios** | CEODashboard V7, ProyeccionesEconomicas, AnalysisOfPenetration, Compliance. |
| **Crons activos** | (continuos) |
| **Métricas críticas** | Forecast de ingresos del día completo, cobertura cross-op acumulada, dossier regulatorio si aplica. |
| **Carga infra** | MEDIA. |
| **Riesgos** | Bajo. |
| **Cobertura** | 🟢 Verde. |

### 🚦 17:00-19:30 — PICO TARDE (carga máxima)

| Item | Detalle |
|---|---|
| **Eventos típicos** | ~1.300-1.450 buses (pico anual más alto). Incidentes de tráfico frecuentes. |
| **Módulos primarios** | IncidentCommandCenter, FleetMonitor, OTPDashboard, ShadowRadar, HeadwayInsights, GTFS-RT publishing intensivo. |
| **Crons activos** | `refreshGtfsRtAlerts` 1 min, `shadowDispatcher`, `scheduleAdherence`. |
| **Métricas críticas** | OTP en tiempo real (debe mantenerse >80% pico), alertas tácticas a conductores, DRO crítico, **cobertura del dispatcher** (¿llega a todos los buses?). |
| **Carga infra** | **MUY ALTA.** Pico operacional del día. |
| **Riesgos** | Idem pico mañana + cansancio operativo (turnos largos). |
| **Cobertura** | 🟡 Amarillo — bien cubierto pero requiere monitoreo activo. |

### 🌆 19:30-22:00 — Tarde-noche

| Item | Detalle |
|---|---|
| **Eventos típicos** | Caída gradual a ~600-400 buses. Cierre de servicios. |
| **Módulos primarios** | FleetMonitor, MaintenanceDashboard (anticipa mantenimiento nocturno). |
| **Crons activos** | (continuos) |
| **Métricas críticas** | Combustible, predictive maintenance (cuando se implemente), ETA de regreso a cochera. |
| **Carga infra** | MEDIA. |
| **Riesgos** | Bajo. |
| **Cobertura** | 🟢 Verde. |

### 🌃 22:00-23:30 — Cierre y recogida + servicios nocturnos

| Item | Detalle |
|---|---|
| **Eventos típicos** | <300 buses. Líneas nocturnas (CE1, CE2 24h). Cierre formal de servicios. |
| **Módulos primarios** | CartonManager (cierre), Boletín (próximo día), VehicleList (mantenimiento programado). |
| **Crons activos** | Pre-batch nocturno. |
| **Métricas críticas** | Servicios cerrados completos, viajes completados vs planificados (Service Delivery UITP). |
| **Carga infra** | BAJA. |
| **Riesgos** | Bajo. |
| **Cobertura** | 🟢 Verde. |

### 🌌 23:30-03:00 — Vacío nocturno

| Item | Detalle |
|---|---|
| **Eventos típicos** | <100 buses (líneas 24h). Sistema en idle excepto monitoreo. |
| **Módulos primarios** | Solo SystemDoctor + audit log. |
| **Crons activos** | (silencio relativo). |
| **Métricas críticas** | Healthcheck del sistema. |
| **Carga infra** | BAJA. |
| **Cobertura** | 🟢 Verde. |

---

## Stress Points identificados

Lista priorizada de momentos donde el sistema tiene mayor riesgo de degradación:

| # | Stress point | Franja | Causa | Mitigación actual | Mejora roadmap |
|---|---|---|---|---|---|
| 1 | **Pico tarde 17:00-19:30** | Tarde | ~1.450 buses concurrentes + alertas múltiples | GTFS-RT cron 1 min, shadowDispatcher continuo | Load test formal Sprint 4 |
| 2 | **Pico mañana 06:30-09:00** | Mañana | ~1.400 buses concurrentes | Idem | Idem |
| 3 | **Cron pesado 03:00-04:30** | Madrugada | Archivado + agregados batch | Health check + alerta si falla | Sprint 4 — alertas formales |
| 4 | **Relevo 12:00-12:30** | Mediodía | Escrituras masivas a `daily_shifts` | Validaciones de conflictos | Sprint 5 — schema EAM enriquecido |
| 5 | **STM-Online inestable** | Continuo | Endpoint público IMM con caídas ocasionales | Retry exponencial en immRealtimeService | Cache local de fallback |
| 6 | **Quota Firestore reads** | Picos | ~10K reads/min en pico | Cache cliente + indexes | Sprint 4 — Redis cache opcional |
| 7 | **FCM throttling** | Picos | Push masivos a conductores | Batch FCM + retry | Sprint 4 — colas de mensajes |

---

## Cobertura cross-op por franja

Validación de que el moat cross-op funciona en todas las franjas:

| Franja | Buses cross-op | DRO live | HRR live | Cobertura cross-op | Mercado share |
|---|---|---|---|---|---|
| 03:00-04:30 | <50 | ✅ | ✅ | ✅ | ⚠️ Volumen bajo |
| 05:00-06:30 | ~800 | ✅ | ✅ | ✅ | ✅ |
| **06:30-09:00** | **~1.400** | ✅ | ✅ | ✅ | ✅ |
| 09:00-12:00 | ~750 | ✅ | ✅ | ✅ | ✅ |
| 12:00-12:30 | ~1.000 | ✅ | ✅ | ✅ | ✅ |
| 12:30-17:00 | ~700 | ✅ | ✅ | ✅ | ✅ |
| **17:00-19:30** | **~1.450** | ✅ | ✅ | ✅ | ✅ |
| 19:30-22:00 | ~500 | ✅ | ✅ | ✅ | ✅ |
| 22:00-23:30 | ~250 | ✅ | ✅ | ✅ | ⚠️ Volumen bajo |

**Conclusión:** los 5 diferenciadores estructurales (DRO live, HRR live,
Cobertura cross-op, Penetración, Multi-tenancy) operan en **todas las
franjas con datos suficientes**. Solo en franjas nocturnas (<300 buses)
el volumen es bajo para análisis cross-op significativo, pero eso es
esperable y no es bug.

---

## Comparativa cobertura — SkillRoute vs líderes mundiales en operativa diaria

| Capacidad | SkillRoute | Optibus | Swiftly | Remix | Trapeze |
|---|---|---|---|---|---|
| Operativa pico mañana 06:30-09:00 | ✅ Cubierto | ✅ | ✅ | ❌ | ✅ |
| Operativa pico tarde 17:00-19:30 | ✅ Cubierto | ✅ | ✅ | ❌ | ✅ |
| Auto-publish GTFS-RT cada 1 min | ✅ | ✅ (2026) | ✅ | ❌ | ⚠️ |
| Cross-op real-time todo el día | ✅ **Único** | ❌ | ❌ | ❌ | ❌ |
| Reportes regulatorios para autoridades | ✅ Sprint 1 | ❌ | ❌ | ❌ | ❌ (parcial) |
| Driver app con FCM operativo | ✅ | ✅ | ✅ | ❌ | ✅ |
| HRR cross-op live | ✅ Sprint 2 | ❌ | ❌ (single-op) | ❌ | ❌ |
| Carga sostenida en pico | ⚠️ No load-tested | ✅ Probado | ✅ Probado | n/a | ✅ Probado |

**Hallazgo central:** SkillRoute cubre las mismas franjas operativas que
los líderes mundiales **+ cross-op único**, pero **falta validación
formal de carga** en pico (~1.450 buses concurrentes). Optibus, Swiftly
y Trapeze tienen load testing documentado para tráfico LA Metro / SEPTA
/ MBTA. **Mitigación: Sprint 4 incluye load test formal.**

---

## Recomendaciones operativas

A partir de la simulación, recomendaciones priorizadas para los
próximos sprints:

1. **Sprint 3 (compliance):** auditar logs de los crons críticos
   (refreshCompetidores, refreshGtfsRtAlerts, scheduleAdherence) y
   formalizar healthchecks visibles en `system_status`.

2. **Sprint 4 (load testing):** simular concurrentemente ~1.500 buses
   pingando GPS, ~10K Firestore reads/min, ~80 alertas FCM/min. Verificar
   degradación gradual sin caída.

3. **Sprint 5 (EAM):** anticipar mantenimiento nocturno usando
   predictive maintenance ML — calendarizar reparaciones en franja
   23:30-03:00 cuando el bus está disponible.

4. **Roadmap forward (post-Sprint 12):** caché Redis o Firestore
   bundles para mitigar quota de reads en picos, o suscripciones
   websocket directas en lugar de polling.

---

## Métrica de éxito de la simulación

✅ **9 franjas horarias documentadas** con eventos, módulos, crons,
métricas, carga, riesgos y cobertura cross-op.

✅ **7 stress points priorizados** con causa y plan de mitigación.

✅ **Comparativa funcional** con 4 líderes mundiales — SkillRoute
cubre todas las franjas + diferenciador cross-op único.

✅ **4 recomendaciones forward** alineadas a sprints 3-5 del roadmap.

---

## Próximo paso del roadmap maestro

Con esta simulación cerrada, **se completa la Capa 4 de la auditoría
interna**. Los inputs disponibles para el Dossier Ejecutivo final
(#85) son:

- `docs/ESTRATEGIA_INTERNATIONAL_GRADE.md` (norte estratégico)
- `docs/COMPETIDORES/MATRIZ_MAESTRA.xlsx` (51 funciones × 5 plataformas)
- `docs/COMPETIDORES/HALLAZGOS_CONSOLIDADOS.md` (síntesis ejecutiva)
- `docs/COMPETIDORES/{optibus,swiftly,remix,trapeze,cittati}.md`
  (5 dossiers individuales)
- `docs/ROADMAP_CIERRE_GAPS.md` (12 sprints, 6 meses)
- `docs/DECISION_M_A.md` (3 opciones M&A)
- `docs/CATALOGO_FUNCIONES.md` (#80 — capa 1 de auditoría)
- **`docs/SIMULACION_DIA_OPERATIVO.md`** (#81 — capa 4 de auditoría) ← este documento

**Pendiente para entregar el Dossier Ejecutivo (#85):** todos los
inputs están listos. El dossier puede generarse en paralelo a Sprints
3-12 cuando el momento comercial lo requiera.
