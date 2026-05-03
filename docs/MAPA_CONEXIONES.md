# MAPA DE CONEXIONES — SkillRoute
> Fuente de verdad del sistema. Leer ANTES de tocar cualquier módulo.
> Última actualización: 2026-05-02

---

## ¿Para qué sirve este documento?

Antes de editar cualquier archivo, este mapa responde:
1. ¿Qué colección Firestore usa este módulo?
2. ¿Quién más la usa? ¿Qué se rompe si la cambio?
3. ¿Está este módulo conectado al frontend o corre en el vacío?

---

## PIPELINE DE DATOS — orden de ejecución semanal

```
LUNES 03:00 UTC
  gtfsImporter.ts
    → ESCRIBE: shapes_cross_operator, gtfs_timetable, gtfs_stops,
                gtfs_horarios, gtfs_calendar, gtfs_fares
    → REQUIERE: API GTFS oficial IMM + token OAuth

LUNES 04:00 UYT (después del import GTFS)
  droMatrix.ts
    → LEE:    shapes_cross_operator
    → ESCRIBE: corridor_overlap
    → REQUIERE: que gtfsImporter ya corrió esta semana

DIARIO 04:15 UYT
  refreshAllStmHorarios.ts
    → SCRAPING: portal web montevideo.gub.uy/stm/horarios
    → ESCRIBE: horarios_stm/{lineaNumero}

CADA 2 MIN
  ingestaIMM.ts
    → LEE:    viajes_activos (posición anterior de cada bus UCOT)
    → ESCRIBE: viajes_activos, competencia_monitoreo/*/pings,
                ingesta_health/imm_status, kpi_snapshots/ingesta_imm

  shadowDispatcher.ts
    → LEE:    viajes_activos, competencia_monitoreo/*/pings,
                alertas_regulacion, cartones_de_servicio
    → ESCRIBE: alertas_regulacion, alertas_log, alertas_de_via,
                shadow_tracker, shadow_logs

CADA 10 MIN
  otpEngine.ts
    → LEE:    gtfs_timetable, gtfs_stops (+ GPS live de IMM)
    → ESCRIBE: bus_delays, otp_summary
    → ⚠️ DESCONEXIÓN: el dashboard de Cumplimiento NO usa estas colecciones

  hrrEngine.ts
    → LEE:    corridor_overlap, gtfs_timetable, gtfs_stops (+ GPS live)
    → ESCRIBE: hrr_live

CADA 15 MIN
  autoStatsCollector.ts
    → LEE:    horarios_stm, bus_last_pos (+ GPS STM todas las empresas)
    → ESCRIBE: vehicle_events, bus_last_pos, system_status/stm_gps
    → ⚠️ NOTA: usa horarios_stm (scrape), NO gtfs_timetable (oficial)

  gpsHistoryAccumulator.ts
    → ESCRIBE: gps_pings_raw

CADA HORA (:15)
  scheduleAdherence.ts
    → LEE:    vehicle_events
    → ESCRIBE: auto_stats_diarios, compliance_rt

CADA 6 HORAS
  complianceAlertsTick.ts
    → LEE:    vehicle_events, parametros_sistema, users (fcmToken)
    → ESCRIBE: compliance_alerts

DIARIO 06:00 UTC
  seatKmCalculator.ts
    → LEE:    shapes_cross_operator, gtfs_timetable
    → ESCRIBE: seat_km_snapshot

DIARIO 23:45 UYT
  marketPenetration.ts
    → LEE:    vehicle_events
    → ESCRIBE: penetracion_diaria
```

---

## COLECCIONES FIRESTORE — quién escribe, quién lee

### Colecciones de DATOS BASE (infraestructura)

| Colección | La llena | Con qué frecuencia | La leen |
|---|---|---|---|
| `horarios_stm` | refreshAllStmHorarios | Diario 04:15 | autoStatsCollector |
| `gtfs_timetable` | gtfsImporter | Semanal lunes | otpEngine, hrrEngine, seatKmCalculator |
| `gtfs_stops` | gtfsImporter | Semanal lunes | otpEngine, hrrEngine |
| `gtfs_horarios` | gtfsImporter | Semanal lunes | gtfsSchedulesService (frontend) |
| `gtfs_calendar` | gtfsImporter | Semanal lunes | (referencia, no consumida aún) |
| `gtfs_fares` | gtfsImporter | Semanal lunes | (referencia, no consumida aún) |
| `shapes_cross_operator` | gtfsImporter | Semanal lunes | droMatrix, seatKmCalculator, frontend (ShadowRadar, CorridorIntelligence) |
| `corridor_overlap` | droMatrix | Semanal lunes | hrrEngine, frontend (ShadowRadar, CorridorIntelligence, CorridorMarketShare, CEODashboardV7) |

### Colecciones de POSICIÓN EN VIVO

| Colección | La llena | Con qué frecuencia | La leen |
|---|---|---|---|
| `viajes_activos` | ingestaIMM | Cada 2 min | shadowDispatcher, frontend (ShadowRadar, useRealtimeData, useFleetRealtime, useKPIs, useLiveBusesByLine) |
| `bus_last_pos` | autoStatsCollector | Cada 15 min | autoStatsCollector (posición anterior para calcular bearing) |
| `gps_pings_raw` | gpsHistoryAccumulator | Cada 15 min | shapeBuilder (reconstrucción de shapes) |
| `competencia_monitoreo/*/pings` | ingestaIMM, shadowDispatcher | Cada 2 min | shadowDispatcher |

### Colecciones de MÉTRICAS OTP (⚠️ pipeline dividido — ver módulo OTP)

| Colección | La llena | Frecuencia | La leen | Estado |
|---|---|---|---|---|
| `vehicle_events` | autoStatsCollector | Cada 15 min | scheduleAdherence, complianceAlertsTick, gtfsRealtime, historicMetrics, marketPenetration, consequenceTriggers | ✅ Activo |
| `bus_delays` | otpEngine | Cada 10 min | Dashboard OTP (frontend) | ⚠️ Desconectado del dashboard principal |
| `otp_summary` | otpEngine | Cada 10 min | Dashboard OTP (frontend) | ⚠️ Desconectado — dashboard usa vehicle_events |
| `auto_stats_diarios` | scheduleAdherence | Cada hora :15 | Dashboard CEO, AutoStatsModule | ✅ Conectado |
| `compliance_rt` | scheduleAdherence | Cada hora :15 | Mapa en vivo, CEODashboardV7 | ✅ Conectado |
| `compliance_alerts` | complianceAlertsTick | Cada 6 horas | Dashboard (compliance_alerts) | ✅ Conectado |
| `otp_daily` | consequenceTriggers (trigger) | OnCreate vehicle_events | consequenceTriggers (trigger) | ✅ Activo |

### Colecciones de ALERTAS Y RADAR

| Colección | La llena | La leen | Estado |
|---|---|---|---|
| `alertas_regulacion` | shadowDispatcher, consequenceTriggers | gtfsRealtime, historicMetrics, frontend (ShadowRadar, PanelFinanciero, GestionDesvios) | ✅ Activo |
| `alertas_de_via` | shadowDispatcher | Frontend | ✅ Activo |
| `alertas_log` | shadowDispatcher | Analytics histórico | ✅ Activo |
| `shadow_tracker` | shadowDispatcher | Frontend (ShadowRadar overlay) | ✅ Activo |
| `shadow_logs` | shadowDispatcher | Auditoría | ✅ Activo |

### Colecciones de MARKET SHARE Y RED

| Colección | La llena | La leen | Estado |
|---|---|---|---|
| `hrr_live` | hrrEngine | Frontend ShadowRadar | ✅ Activo |
| `seat_km_snapshot` | seatKmCalculator | Dashboard market share | ✅ Activo |
| `penetracion_diaria` | marketPenetration | Frontend MarketPenetration | ✅ Activo |
| `kpi_snapshots/ingesta_imm` | ingestaIMM | Dashboard CEO | ✅ Activo |

### Colecciones OPERATIVAS (UCOT/multi-empresa)

| Colección | La llena | La leen | Notas |
|---|---|---|---|
| `vehiculos` | FleetService (frontend admin) | FleetService, useKPIs, DisponibilidadFlota | ⚠️ También existe `vehicles` — doble naming |
| `users` | UserService, DataImportService | AuthContext, complianceAlertsTick, UserManagement | Core — no tocar sin plan |
| `personal` | PersonalService, PersonalRotationService | PersonalRotationService, CrossOpCoverage | |
| `daily_shifts` | ShiftService | ShiftService, useKPIs, scheduleAdherence (indirecto) | |
| `cartones_de_servicio` | CartonService | useRealtimeCartones, shadowDispatcher | |
| `active_assignments` | ActiveAssignmentsService | ActiveAssignmentsService, useAssignmentEngine | |
| `servicio_estado` | ServicioEstadoService | ServicioEstadoService, useAssignmentEngine | |
| `programacion_diaria` | ProgramacionDiariaService | ProgramacionDiariaService, useAssignmentEngine | |
| `licencias_personal` | LicenciasService | consequenceTriggers (trigger) | Dispara motor de consecuencias |
| `consequence_events` | consequenceTriggers | Frontend Motor Consecuencias | ✅ Activo |
| `subsidy_ledger` | consequenceTriggers | Finanzas | ✅ Activo |
| `incidencias` | IncidentCommandCenter, reportarIncidencia() | PanelFinanciero, PanelRendicion, CEODashboardV7 | |
| `boletines` | BulletinService | BoletinInspeccion | |
| `parametros_sistema` | Admin | autoStatsCollector, complianceAlertsTick, shadowDispatcher | Umbrales críticos |
| `parametros_operativos` | parametrosOperativos service | Frontend parámetros (sliders) | Con historial de auditoría |

### Colecciones con NAMING INCONSISTENTE (deuda técnica documentada)

| Par duplicado | Colección A | Colección B | Quién usa cuál |
|---|---|---|---|
| Flota | `vehiculos` | `vehicles` | fleet.ts usa `vehiculos`; DisponibilidadFlota intenta ambas con fallback |
| Mantenimiento | `maintenance` | `maintenance_orders` / `ordenes_mantenimiento` | DisponibilidadFlota tiene triple fallback |
| Alertas viales | `alertas_trafico` | `road_alerts` | RoadAlertService usa `alertas_trafico`; QA reportó CR-2 con `road_alerts` |
| Líneas | `lineas` | `lineas_ucot` | ucotLinesService usa ambas |

---

## DESCONEXIONES DOCUMENTADAS (⚠️ módulos que existen pero no están conectados al flujo principal)

| Módulo | Existe | Produce | Consume | Problema |
|---|---|---|---|---|
| `otpEngine.ts` | ✅ | `bus_delays`, `otp_summary` | Dashboard OTP | El dashboard de Cumplimiento usa `vehicle_events` (autoStatsCollector), NO `otp_summary`. OTP real calculado pero no mostrado. |
| `hrrEngine.ts` | ✅ | `hrr_live` | ShadowRadar frontend | Verificar si ShadowRadar consume hrr_live o calcula HRR propio |
| `CompetitorIntelligenceEngine.ts` | ✅ | — | Frontend análisis competencia | Red STM hardcodeada en memoria. No lee Firestore. Actualizar requiere editar código, no datos. |
| `parametros_operativos` (Firestore) | ✅ | — | Frontend sliders | Legacy usa constantes hardcodeadas en `config/parametros-operativos.ts`. Doble fuente de verdad. |
| `gps_pings_raw` | ✅ | — | shapeBuilder | shapeBuilder consume estos pings pero no está en el pipeline activo |

---

## CONSECUENCIAS — qué se rompe si tocás X

| Si tocás... | Se rompe... | Módulos afectados |
|---|---|---|
| `gtfs_timetable` schema | OTP real deja de calcularse | otpEngine, hrrEngine, seatKmCalculator |
| `vehicle_events` schema | Toda la cadena de métricas diarias | scheduleAdherence → auto_stats_diarios → Dashboard CEO, complianceAlertsTick, historicMetrics, marketPenetration |
| `viajes_activos` schema | Radar en vivo + KPIs del header | shadowDispatcher, ShadowRadar, useRealtimeData, useFleetRealtime, useKPIs |
| `corridor_overlap` schema | Análisis competitivo + ShadowRadar tiers | hrrEngine, ShadowRadar (tiers T1/T2/T3), CorridorIntelligence, CorridorMarketShare |
| `shapes_cross_operator` schema | DRO matrix + market share | droMatrix, seatKmCalculator, frontend (3 módulos) |
| `horarios_stm` schema | autoStatsCollector falla al calcular cumplimiento | vehicle_events → toda la cadena de métricas |
| `users` schema | AuthContext + notificaciones push | Toda la app (AuthContext es crítico) |
| `parametros_sistema` schema | Umbrales de alertas erróneos | shadowDispatcher, complianceAlertsTick, autoStatsCollector |
| `licencias_personal` (nuevo campo) | Motor de consecuencias puede no disparar | consequenceTriggers → consequence_events, alertas_regulacion, subsidy_ledger |
| `useEmpresaPropia.ts` (archivo) | TODOS los módulos cross-operador | 11 páginas dependen del hook |
| `services/firestore/index.ts` | TODOS los servicios del frontend | 46 archivos lo importan |
| `AuthContext.tsx` | Toda la aplicación colapsa | 56 archivos lo importan |
| `App.tsx` | Rutas rotas, lazy imports fallan | Toda la app |

---

## ARCHIVOS CRÍTICOS — no editar sin plan documentado

Estos archivos son importados por 10+ módulos. Editarlos puede romper toda la app.

| Archivo | Importado por | Riesgo |
|---|---|---|
| `frontend/src/context/AuthContext.tsx` | 56 archivos | CRÍTICO — toda la app |
| `frontend/src/services/firestore/index.ts` | 46 archivos | CRÍTICO — todos los servicios |
| `frontend/src/services/api.ts` | 20+ archivos | ALTO |
| `frontend/src/hooks/useEmpresaPropia.ts` | 11 páginas | ALTO — cross-operador |
| `frontend/src/App.tsx` | Base de rutas | ALTO |
| `frontend/src/layouts/DashboardLayout.tsx` | Layout global | ALTO |
| `frontend/src/components/Sidebar.tsx` | Navegación | MEDIO |
| `functions/src/index.ts` | Exporta todo el backend | ALTO |
| `functions/src/intelligenceApi.ts` | Backend HTTP principal | ALTO |
| `firestore.rules` | Seguridad de toda la BD | CRÍTICO |

---

## REGLAS DE TRABAJO (derivadas del mapa)

1. **Antes de tocar cualquier colección**: verificar la columna "La leen" — cada módulo listado ahí puede quebrarse.
2. **Antes de cambiar un schema Firestore**: leer la sección "CONSECUENCIAS" arriba.
3. **Antes de tocar un archivo crítico**: leer su entrada en esta tabla y listar qué páginas pueden afectarse.
4. **Al agregar una colección nueva**: agregarla acá ANTES de escribir código.
5. **Al resolver una desconexión**: actualizar la tabla de desconexiones con estado ✅.
6. **Al descubrir un naming duplicado**: documentarlo en la tabla de pares duplicados, NO crear un tercero.
