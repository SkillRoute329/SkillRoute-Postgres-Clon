# SkillRoute — Catálogo de Funciones (Estado Actual)

> **Capa 1 de la auditoría interna** definida en `docs/ESTRATEGIA_INTERNATIONAL_GRADE.md`.
> **Inventario verificado por inspección directa del código** el 2026-04-25.
> **Base contra la cual auditar** todas las capacidades del producto.
>
> **Fuente:** `frontend/src/App.tsx`, `frontend/src/components/Sidebar.tsx`,
> `functions/src/index.ts`, schema Firestore inspeccionado vía REST API.

---

## Resumen cuantitativo

| Capa | Cantidad |
|---|---|
| Pages (vistas React) en App.tsx | 83 |
| Rutas registradas | 85 |
| Cloud Functions exportadas | 32 |
| Services frontend (`frontend/src/services/`) | 93 |
| Hooks compartidos (`frontend/src/hooks/`) | 20 |
| Colecciones Firestore referenciadas en `functions/` | 44 |
| Operadores soportados nativamente | 4 (UCOT, CUTCSA, COME, COETC) |

---

## Sección 1 — Módulos del Sidebar (operativos)

### 1.1 Operaciones Diarias

| Módulo | Ruta | Roles | Cross-op | Función |
|---|---|---|---|---|
| Matriz de Servicio | `/dashboard/traffic/service-matrix` | ADMIN, TRAFFIC, LISTERO, INSPECTOR | ✅ | Vista calendario de servicios planificados por línea/día. Edición masiva. |
| Gestor de Cartones | `/dashboard/traffic/cartons` | ADMIN, TRAFFIC, LISTERO | ✅ | CRUD de cartones (hojas de ruta diarias). Importación masiva desde Excel. |
| Terminal Listero | `/dashboard/traffic/listero` | ADMIN, TRAFFIC, LISTERO | ✅ | Consola operativa para asignar servicios a coches/conductores en tiempo real. |
| Listero Cascada (Ops) | `/dashboard/traffic/listero-cascada` | ADMIN, TRAFFIC, LISTERO | ✅ | Vista cascada de turnos del día con estados de cumplimiento. |
| Distribución Diaria | `/dashboard/traffic/distribucion` | ADMIN, TRAFFIC, LISTERO | ✅ | Distribución de personal a coches y servicios. |
| Boletín de Inspección | `/dashboard/traffic/boletin` | ADMIN, TRAFFIC, LISTERO | ✅ | Boletines oficiales con tiempos de tránsito entre paradas. |
| Navegador | `/dashboard/traffic/navigation` | ADMIN, TRAFFIC, LISTERO, DRIVER | ✅ | Visor cartográfico de líneas con paradas y geometría. |

### 1.2 Control y Monitoreo

| Módulo | Ruta | Roles | Cross-op | Función |
|---|---|---|---|---|
| Monitoreo de Flota | `/dashboard/traffic/fleet-monitor` | ADMIN, TRAFFIC | ✅ | Mapa en vivo de buses con estados, alertas, métricas operativas. |
| Puntualidad OTP | `/dashboard/traffic/otp` | ADMIN, TRAFFIC, INSPECTOR | ✅ | Dashboard On-Time Performance con thresholds configurables. |
| Centro de Incidencias | `/dashboard/traffic/incidents` | ADMIN, TRAFFIC, INSPECTOR | ✅ | Gestión de incidentes operativos en vivo. |
| Control Inspectores | `/dashboard/traffic/inspector-control` | ADMIN, TRAFFIC, INSPECTOR | ⚠️ Parcial | Dashboard de inspectores con asignaciones y resultados. |
| Captura Inspector (Móvil) | `/dashboard/traffic/inspector-capture` | ADMIN, TRAFFIC, INSPECTOR | ⚠️ Parcial | UI mobile-first para inspectores en campo. |

### 1.3 Flota y Mantenimiento

| Módulo | Ruta | Roles | Cross-op | Función |
|---|---|---|---|---|
| Coches / Inventario | `/dashboard/fleet` | (login) | ✅ | Catálogo de vehículos con estado, asignaciones, historial. |
| Mantenimiento | `/dashboard/admin/maintenance` | ADMIN, MANTENIMIENTO | ⚠️ Parcial | Dashboard de mantenimiento reactivo (no predictivo). |
| Revisión Vehicular | `/dashboard/fleet/check` | (login) | ✅ | Inspecciones técnicas pre-servicio. |
| Asignación de Servicios | `/dashboard/admin/shifts` | ADMIN, RRHH | ✅ | Asignación de turnos a coches y conductores. |
| Alertas de Vía | `/dashboard/alerts` | (login) | ✅ | Alertas de tráfico, desvíos y eventos viales. |
| EV Charge Optimizer | `/dashboard/fleet/ev-charge` | (login) | ⚠️ Diseño | Optimizador de carga para flota eléctrica futura. |

### 1.4 Recursos Humanos

| Módulo | Ruta | Roles | Cross-op | Función |
|---|---|---|---|---|
| Gestión de Personal | `/dashboard/admin/rrhh` | ADMIN, RRHH | ✅ | CRUD de personal con roles y asignaciones. |
| Personal UCOT | `/dashboard/traffic/personal` | ADMIN, TRAFFIC, RRHH | ✅ | Vista de personal por operador y línea. |
| Fichas Médicas / CI | `/dashboard/admin/employees` | ADMIN, RRHH | ✅ | Documentación obligatoria por conductor (Ley 18.331). |
| Gestión de Turnos | `/dashboard/admin/shifts` | ADMIN, RRHH | ✅ | Turnos por persona/coche con conflictos detectados. |
| Matriz de Rotación | `/dashboard/traffic/rotation-matrix` | ADMIN, TRAFFIC, RRHH | ✅ | Rotación semanal/mensual por persona. |
| Feriados | `/dashboard/admin/rrhh/feriados` | ADMIN, RRHH | ✅ | Calendario de feriados nacionales y laborales. |
| Rotation Manager | `/dashboard/admin/rrhh/rotation` | ADMIN, RRHH | ✅ | Reglas de rotación automatizada. |

### 1.5 Inteligencia Cross-Operador (DIFERENCIADOR ⭐)

| Módulo | Ruta | Roles | Cross-op | Función |
|---|---|---|---|---|
| **Radar Sombra (Táctico)** ⭐ | `/dashboard/traffic/shadow-radar` | ADMIN, TRAFFIC | **✅ Único** | DRO live cross-op. Detecta overlap de operadores en tiempo real. **Único en el mercado mundial.** |
| **Analytics Shadow (Histórico)** ⭐ | `/dashboard/traffic/shadow-analytics` | ADMIN, TRAFFIC | **✅ Único** | Histórico de detecciones DRO + ACK performance. |
| **Análisis de Penetración** ⭐ | `/dashboard/traffic/penetration` | ADMIN, TRAFFIC | **✅ Único** | Market share por línea × operador, snapshot diario. |
| Inteligencia de Corredores | `/dashboard/traffic/corridor-intelligence` | ADMIN, TRAFFIC | ✅ | Análisis de corredores compartidos. |
| Mapa de Corredores | `/dashboard/traffic/corridor-map` | ADMIN, TRAFFIC | ✅ | Visualización geográfica de corredores cross-op. |
| Mapa en Vivo STM | `/dashboard/traffic/live-map` | ADMIN, TRAFFIC, INSPECTOR | ✅ | Mapa con heatmap de demanda + capas operativas. |
| **Cobertura Cross-Op** ⭐ | `/dashboard/admin/cross-op-coverage` | ADMIN | **✅ Único** | Score de cobertura por operador (8 métricas × 4 operadores). |

### 1.6 Pronóstico y KPIs

| Módulo | Ruta | Roles | Cross-op | Función |
|---|---|---|---|---|
| CEO Dashboard V7 | `/dashboard/traffic/ceo` | ADMIN, TRAFFIC | ✅ | Dashboard ejecutivo cross-op con KPIs UITP. |
| Centro de Mando | `/dashboard/traffic/incidents` (alt path) | ADMIN, TRAFFIC, INSPECTOR | ✅ | Vista directiva agregada. |
| Cumplimiento Horario | `/dashboard/traffic/otp` | ADMIN, TRAFFIC | ✅ | OTP detallado con benchmark. |
| Gestión de Contingencia | `/dashboard/traffic/contingency` | ADMIN, TRAFFIC | ✅ | Disrupciones operativas y plan B. |
| Proyecciones Económicas | `/dashboard/traffic/projections` | ADMIN, TRAFFIC | ✅ | Forecast de ingresos por línea. |

### 1.7 Administración

| Módulo | Ruta | Roles | Cross-op | Función |
|---|---|---|---|---|
| Ingesta de Datos | `/dashboard/admin/ingestion` | ADMIN | ✅ | Importación masiva (Excel, CSV). |
| Setup Inicial Maestro | `/dashboard/admin/setup` | ADMIN | ✅ | Onboarding técnico del operador. |
| Carga Datos UCOT | `/dashboard/admin/seed` | ADMIN, SUPERADMIN | ✅ | Seed de datos demo / pruebas. |
| Estado del Sistema | `/dashboard/admin/debug` | (login) | ✅ | Healthcheck + diagnóstico técnico. |
| Cumplimiento MTOP/IMM | `/dashboard/admin/compliance` | (login) | ✅ | Compliance hub para reportes regulatorios. |
| Configuración | `/dashboard/admin/config` | ADMIN | ✅ | Parámetros del sistema. |
| Turnos & Umbrales OTP | `/dashboard/admin/turnos-operativos` | ADMIN, SUPERADMIN | ✅ | Parámetros operativos por operador. |
| Audit Log | `/dashboard/admin/audit-log` | ADMIN, SUPERADMIN | ✅ | Trazabilidad de cambios (ISO 27001-ready). |
| Monitor Ingesta STM | `/dashboard/traffic/scraper-status` | ADMIN, TRAFFIC | ✅ | Healthcheck del scraper de horarios STM. |
| Referencia BRT 2027 | `/dashboard/traffic/brt` | ADMIN, TRAFFIC | ✅ | Plan de referencia BRT futuro. |

### 1.8 Páginas Públicas (sin login)

| Módulo | Ruta | Función |
|---|---|---|
| Pricing público | `/pricing` | 3 tiers transparentes + comparativa con líderes mundiales (Sprint 1). |
| Onboarding documentado | `/pricing/onboarding` | Proceso 2-4 semanas + caso UCOT (Sprint 1). |
| Login | `/login` | Auth Firebase. |

---

## Sección 2 — Cloud Functions (backend de producción)

### 2.1 Proxies y endpoints HTTP

| Function | Tipo | Función |
|---|---|---|
| `montevideoProxy` | onRequest | Proxy CORS al GeoServer de Montevideo. |
| `geoserverProxy` | onRequest | Proxy a capas WFS de IMM. |
| `stmOnlineProxy` | onRequest | Proxy al endpoint público STM-Online (GPS en vivo). |
| `stmHorariosProxy` | onRequest | Proxy al endpoint de horarios STM. |
| `gpsWebhook` | onRequest | Receptor webhook de GPS desde driver app. |
| `intelligenceApi` | onRequest (Express) | API principal de inteligencia (~25 endpoints internos). |
| `gtfsRealtime` | onRequest (Express) | Feed GTFS-RT V2 (VehiclePositions + TripUpdates + ServiceAlerts). |
| `regulatorio` ⭐ | onRequest (Express) | Reportes regulatorios cross-op para autoridades. **Único en el mercado.** |

### 2.2 Sincronización y datos

| Function | Tipo | Función |
|---|---|---|
| `syncUCOTLines` | onRequest | Sincronización manual de líneas UCOT. |
| `syncUCOTLinesCron` | pubsub.schedule | Cron diario 03:00 — refresh líneas UCOT. |
| `syncParadasSTM` | onRequest | Sincronización manual de paradas STM. |
| `syncParadasSTMCron` | pubsub.schedule | Cron diario 03:30 — refresh paradas. |
| `syncVariantRoutes` | onRequest | Sincronización de variantes (sublíneas). |
| `discoverVariants` | onRequest | Descubrimiento automático de variantes nuevas. |
| `seedUCOTData` | onRequest | Seed inicial de datos UCOT (usado en onboarding). |
| `parseBulkTicketsStorage` | onObjectFinalized | Parsing automático de Excel masivo subido a Cloud Storage. |
| `refreshHorariosUcot` | (export) | Refresh de horarios UCOT. |
| `refreshCompetidores` | (export) | **Cron — refresh de operadores cross-op (10/20/50/70).** |
| `refreshAllStmHorarios` | (export) | Refresh masivo de horarios STM (140 líneas). |

### 2.3 Inteligencia y métricas

| Function | Tipo | Función |
|---|---|---|
| `detectarDesvio` | (export) | Detección de desvíos operativos. |
| `shadowDispatcher` | (export) | Dispatch de alertas tácticas cross-op. |
| `ingestaIMM` | (export) | Ingesta de datos IMM (STM-online → Firestore). |
| `autoStatsCollector` | (export) | Colector automático de estadísticas. |
| `scheduleAdherence` | (export) | Motor de cumplimiento de horarios cross-op. |
| `marketPenetration` | (export) | Cron diario — snapshot de market share por corredor. |
| `serviceDeliveryEngine` | (export) | Motor de service delivery (UITP canónico). |
| `droMatrix` | (export) | Matriz DRO offline (TCRP 195) cross-op. |
| `shapeReconstruction` | (export) | Reconstrucción de shapes cross-op desde GPS. |
| `historicMetrics` | (export) | Cálculo de métricas históricas. |
| `fcmAlertDispatcher` | (export) | Dispatch de notificaciones FCM (driver app). |
| `archiveVehicleEvents` | (export) | Archivado de eventos GPS viejos. |
| `auditLog` | onWrite triggers (10) | Audit log inmutable de cambios críticos. |
| `gtfsStatic` | (export) | Generador de feed GTFS-Static. |
| `siriRealtime` | (export) | Endpoint SIRI v2. |
| `netexEndpoint` | (export) | Endpoint NeTEx (Europa). |
| `systemHealth` | (export) | Healthcheck del sistema. |
| `refreshGtfsRtAlerts` | pubsub.schedule (1 min) | **Cron — auto-publish de Service Alerts (Sprint 1).** |

---

## Sección 3 — Colecciones Firestore (44+)

### 3.1 Operativas (datos en vivo)

| Colección | Schema clave | Función |
|---|---|---|
| `viajes_activos` | `interno, empresa, linea, posicion(GeoPoint), updatedAt` | Posición actual de cada bus operando. |
| `vehicle_events` | `idBus, agencyId, empresa, linea, lat/lon, estadoCumplimiento, desviacionMin, createdAt` | Eventos GPS históricos (auto-archived después de N días). |
| `competidores` | Empresa-shape similar a viajes_activos | **Cross-op — buses de operadores rivales.** |
| `pings` | `empresa, timestamp, ...` | Pings GPS crudos. |
| `coches` / `vehicles` / `vehiculos` | Mixed schemas (legacy) | Catálogo de vehículos. |

### 3.2 Planificación

| Colección | Schema clave | Función |
|---|---|---|
| `cartones` | `linea, servicio, fecha, ...` | Hojas de ruta planificadas. |
| `servicios_ucot` | (legacy UCOT) | Cartones legacy específicos de UCOT. |
| `cartones_activos` | (subcolección operativa) | Cartones en ejecución hoy. |
| `cartones_completados` | (histórico) | Cartones cerrados. |
| `lineas_ucot` | (legacy) | Catálogo de líneas UCOT. |
| `paradas_stm` | (catálogo) | Paradas oficiales STM. |
| `horarios_oficiales` | (catálogo) | Horarios oficiales STM. |
| `horarios_stm` | `dias.{Hábiles\|Sábados\|Domingos}.variantes[]` | Horarios scrapeados por línea (140+ líneas). |
| `boletin_oficial` | (oficial) | Boletines oficiales. |
| `boletin_verano_2026` | (estacional) | Boletín verano. |
| `shapes_cross_operator` | `agencyId, codigo, geometry` | Shapes geo cross-op (catálogo unificado). |

### 3.3 Personal y RRHH

| Colección | Función |
|---|---|
| `personal` | CRUD de personal con roles. |
| `users` | Usuarios autenticados con role/rol. |
| `fichas_medicas` | Documentación CI obligatoria. |
| `daily_shifts` | Turnos del día. |
| `shifts` | Turnos plantilla. |
| `rotacion_diaria` | Rotación diaria. |
| `rotation_schemes` | Esquemas de rotación. |
| `assignment_conflicts` | Conflictos detectados de asignación. |

### 3.4 Inteligencia y alertas

| Colección | Función |
|---|---|
| `alertas_regulacion` | **Alertas tácticas cross-op (input GTFS-RT auto-publish).** |
| `alertas_de_via` | Alertas viales públicas. |
| `alertas_operativas` | Alertas internas. |
| `alertas_trafico` | Alertas de tráfico. |
| `desvios_activos` | Desvíos detectados. |
| `eventos_desvio` | Histórico de desvíos. |
| `competencia_monitoreo` | Monitoreo de competencia. |
| `shadow_logs` | Logs de detecciones shadow. |
| `shadow_tracker` | Tracker shadow. |

### 3.5 Métricas y KPIs

| Colección | Función |
|---|---|
| `kpi_snapshots` | Snapshots periódicos de KPIs UITP. |
| `data_lake_tickets` | Datos crudos de ticketing. |
| `auto_stats` | Estadísticas auto-recolectadas. |
| `incidencias` | Incidencias reportadas. |
| `audit_log` | **Audit log inmutable (ISO 27001 ready).** |

### 3.6 Sistema y configuración

| Colección | Función |
|---|---|
| `system_config` | Config del sistema. |
| `system_status` | Estado de salud. |
| `parametros_operativos` | Parámetros operativos por operador. |
| `parametros_sistema` | Parámetros globales. |
| `parametros_operativos_historial` | Histórico de cambios de parámetros. |
| `archive_log` | Log de archivos. |
| `ingesta_health` | Salud de ingestores. |
| `horarios_oficiales_health` | Salud del scraper STM. |

---

## Sección 4 — Hooks Compartidos Críticos

| Hook | Archivo | Función |
|---|---|---|
| `useEmpresaPropia` ⭐ | `hooks/useEmpresaPropia.ts` | **Selector global cross-op (UCOT/CUTCSA/COME/COETC). 29+ módulos lo importan.** |
| `useAuth` (via context) | `context/AuthContext.tsx` | Auth + rol del usuario. |
| `usePushNotifications` | `hooks/usePushNotifications.ts` | FCM tokens + listeners. |
| `useNativeDriverAlerts` | `hooks/useNativeDriverAlerts.ts` | Bridge driver app ↔ plugins nativos. |
| `useFirestoreCollection` | `hooks/useFirestoreCollection.ts` | Subscripción Firestore reactiva. |
| `useCamera` | `hooks/useCamera.ts` | Cámara para inspectores móviles. |

---

## Sección 5 — Services Compartidos Críticos

### 5.1 Cross-operador

| Service | Función |
|---|---|
| `linesService.ts` ⭐ | **Catálogo unificado cross-op de líneas.** |
| `schedulesService.ts` ⭐ | **Horarios STM cross-op para todos los operadores.** |
| `competitorIntelligence.ts` / `competitorIntelligenceEngine.ts` ⭐ | Motor de inteligencia cross-op. |

### 5.2 Datos

| Service | Función |
|---|---|
| `forecastService.ts` | Forecast de ingresos. |
| `competitionService.ts` | Servicio de competencia. |
| `desviosService.ts` | Servicio de desvíos. |
| `dossierRegulatorio.ts` | Generación de dossier regulatorio (frontend). |

### 5.3 Sprint 2 nuevos (no deployados aún)

| Service | Función |
|---|---|
| `headwayInsightsService.ts` ⭐ | **Bunching/gapping single-op + HRR cross-op (Sprint 2).** |
| `gpsPlaybackService.ts` | Timeline replay histórico (Sprint 2). |

---

## Sección 6 — Estado por Diferenciador Único Confirmado

Verificado contra los 5 diferenciadores estructurales identificados en
el análisis competitivo internacional (`docs/COMPETIDORES/HALLAZGOS_CONSOLIDADOS.md`):

| Diferenciador | Implementado | Endpoint / Vista | Maturity |
|---|---|---|---|
| **DRO live cross-op** (TCRP 195) | ✅ | ShadowRadar + droMatrix Cloud Function | Producción |
| **HRR live cross-op** | ✅ | HeadwayInsights tab Cross-Op (Sprint 2) | Listo, sin deploy |
| **Cobertura cross-op real-time** | ✅ | CrossOpCoverage page + endpoint | Producción |
| **Análisis de Penetración por corredor** | ✅ | MarketPenetration page + cron diario | Producción |
| **Multi-tenancy nativa** | ✅ | useEmpresaPropia + 29 módulos cross-op | Producción |
| **Dossier Regulatorio Automatizado** | ⚠️ Parcial | regulatorio Cloud Function (Sprint 1) | Esperando verif. §12 |
| **Análisis Equity Latam** | ❌ Pendiente | (Sprint 8 del roadmap) | Diseño |

---

## Sección 7 — Estándares Internacionales Implementados

| Estándar | Implementación |
|---|---|
| **GTFS-Static** | `functions/src/gtfsStatic.ts` ✅ |
| **GTFS-RT V2** (VehiclePositions/TripUpdates/Alerts) | `functions/src/gtfsRealtime.ts` ✅ |
| **TCRP 195** (DRO/Headway) | `droMatrix.ts` + `ShadowRadar.tsx` + `headwayInsightsService.ts` ✅ EXTENDIDO cross-op |
| **NeTEx** (Europa) | `functions/src/netexEndpoint.ts` ⚠️ Parcial |
| **SIRI v2** (Europa) | `functions/src/siriRealtime.ts` ⚠️ Parcial |
| **UITP best practices** | OTPDashboard + KPI canónicos ✅ |
| **Ley 18.331 Uruguay** | RBAC + audit_log ✅ Parcial |
| **ISO 27001** | Compliance statement pendiente (Sprint 4) |
| **WCAG 2.2 AA** | Auditoría formal pendiente (Sprint 4) |

---

## Conclusión

SkillRoute, al 2026-04-25, tiene **infraestructura de producto end-to-end**
con **5 diferenciadores estructurales únicos confirmados** y cobertura de
**6 estándares internacionales** (parcial o total). Stack de **83 vistas
+ 32 Cloud Functions + 44 colecciones Firestore + 93 services + 20 hooks**
sirviendo a **4 operadores del sistema metropolitano de Montevideo**.

Esta es la base contra la cual se construye:
- La matriz comparativa final con scores reales (Fase 2 capa 5).
- El roadmap de cierre de gaps refinado (Fase 3).
- El dossier ejecutivo "SkillRoute vs The World" (Fase 4 entregable #85).

**Próximos pasos del catálogo:**
1. Cuando Sprint 2 deploye, agregar `HeadwayInsights` y `GPSPlayback` a la sección 1.5.
2. Cuando Sprint 3 cierre compliance, agregar evidencia formal al cuadro de estándares.
3. Mantener este documento sincronizado al cierre de cada sprint.
