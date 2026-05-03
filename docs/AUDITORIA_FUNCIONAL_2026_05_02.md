# Auditoría funcional — qué hace cada módulo y por qué los datos no llegan

**Fecha**: 2026-05-02 (tarde) — sesión post-deploy de Code (commit `4267b0cd`).
**Pedido del usuario**: ver no si los módulos abren, sino qué hacen, qué datos consumen, y por qué los datos descargados de IMM no aparecen donde deberían.

---

## TL;DR — los tres problemas reales (no uno solo)

1. **Hay tres clases de datos en el sistema, y solo una se llena sola**:
   - **Datos IMM en vivo (GPS, paradas, shapes, horarios GTFS)** → llenos. Crons activos, ~700 buses, 1266 shapes, 4938 paradas, 1361 docs en `gtfs_timetable`.
   - **Datos operacionales internos (flota, personal, turnos, asignaciones, licencias, mantenimiento)** → vacíos. Nadie los carga. No hay seed corrido en producción para CUTCSA, COME, COETC; UCOT solo tiene datos parciales.
   - **Datos agregados/históricos (otp_daily, daily_shifts, daily_otp, weekly_kpis)** → casi vacíos. Faltan los crons nocturnos, o existen pero no se ejecutan.

2. **El frontend lee de colecciones distintas a donde el backend escribe.** Hay nombres paralelos para el mismo concepto:
   - Flota: `vehicles` (backend escribe, 8 archivos) ↔ `vehiculos` (frontend lee en 11 archivos) ↔ `coches` (otros 2). Tres almacenes, una sola realidad.
   - Líneas: `lineas_ucot` (backend, 6) ↔ `lines` (2) ↔ `lineas` (2). Tres convenciones.
   - Alertas: `alertas_regulacion` (14) ↔ `traffic_alerts` (4) ↔ `compliance_alerts` (6) ↔ `road_alerts` (1). Cuatro silos.
   - Inspecciones: `inspections` ↔ `inspecciones`.
   - Mantenimiento: `maintenance` ↔ `ordenes_mantenimiento` ↔ `maintenance_orders`.

3. **Cuando se arregla un módulo, otro se rompe** — porque hay 14 archivos críticos compartidos (CLAUDE.md §10) más hooks globales (`useEmpresaPropia`) más strings de colección hardcodeados en ~80 archivos sin constantes centralizadas. Tocar cualquier punto crítico mueve la cadena.

---

## Censo módulo por módulo (lo que se ve hoy en producción)

> Producción está en commit `014b7b1e` (build `mooqiitu-b7h0zt`). El último commit local `4267b0cd` (fix OTP honesto) está deployado en Cloud Functions pero NO en hosting frontend — Code commiteó pero no rebuildeó/redeployó el sitio.

| # | Módulo (sidebar) | URL | Qué muestra hoy | Fuente esperada | Fuente real | Diagnóstico |
|---|---|---|---|---|---|---|
| 1 | **Vista General** | `/dashboard` | 767 buses live, alertas tácticas con detalle, 12 líneas, 14 bunching | GPS live (`vehicle_events`), `compliance_alerts` | OK | ✅ funciona |
| 1b | Vista General — situación del día | (mismo) | "Sin turnos · 0 reservas · 0 vehículos en taller · 0 ausentes hoy · USD 0 sin riesgo" | `daily_shifts`, `vehicles`, `licencias_personal`, KPIs | colecciones internas vacías | ❌ datos operacionales nunca cargados |
| 2 | **Planificación** | `/dashboard/traffic/planificacion` | "Sin servicios" | `services`, `daily_assignments` | vacías | ❌ sin seed |
| 3 | **Listero y Distribución** | `/dashboard/traffic/listero` | "0 conductores · 0 coches · Sin servicios para esta fecha" | `daily_shifts`, `personal`, `vehicles` | vacías | ❌ sin seed |
| 4 | **Navegador** | `/dashboard/traffic/navigation` | (no probado en este pase) | `paradas_stm`, GPS | mixto | ⚠️ |
| 5 | **Turno en Vivo** | `/dashboard/traffic/centro-turno` | (no probado) | `turnos_dia`, GPS | mixto | ⚠️ |
| 6 | **Posición de Flota** | `/dashboard/traffic/fleet-monitor` | 542 CUTCSA + 222 rivales + 79 líneas + 214 bunching + lista de aglomeraciones con coordenadas | GPS live (`/api/positions`, `imm_buses_live`) | OK | ✅ funciona, **mejor de lo esperado** |
| 7 | **Cumplimiento** | `/dashboard/traffic/diagnostico-cumplimiento` | 66 coches activos, todas las líneas "Sin datos / 0%" | `vehicle_events` (cumplimiento) | OK pero ahora honesto | ⚠️ honesto pero queda feo en demo |
| 8 | **Incidencias** | `/dashboard/traffic/incidents` | (no probado) | `incidencias` | vacía | ⚠️ |
| 9 | **Centro de Mando v7** | `/dashboard/traffic/ceo` | "Salud red 100/100 calculado sobre 1 de 4 componentes (datos parciales)", OTP/Aglom/Cumplimiento/Riesgo "—", **sí muestra cuota mercado real** (1 línea propia + 5 perdidas) | `vehicle_events`, `historicOtp`, `historicBunching`, `corridor_overlap` | parciales | ⚠️ honesto pero confiesa datos parciales |
| 10 | **Radar de Competencia** | `/dashboard/traffic/competitor-intelligence` | (encabezado dice "Posición competitiva de CUTCSA…" — bug viejo de `useEmpresaPropia`) | `/api/lines/ucot`, `/api/analysis/{linea}` | Bridge backend Express puerto 3099 (no productivo) | ❌ apunta a bridge dev local |
| 11 | **Inteligencia Cross-Op.** | `/dashboard/traffic/corridor-intelligence` | **"No se pudo cargar la colección corridor_overlap. Reintentar"** | `corridor_overlap` (1850 pares según CLAUDE.md) | colección existe pero el frontend falla al leerla | ❌ ROTO en frontend |
| 12 | **Mapas Estratégicos** | `/dashboard/traffic/corridor-map` | (no probado) | `shapes_cross_operator`, `corridor_overlap` | parcial | ⚠️ |
| 13 | **BRT 2027** | `/dashboard/traffic/brt` | (no probado) | hard-coded mock + GTFS | demo | ⚠️ |
| 14 | **Análisis Financiero** | `/dashboard/traffic/financiero` | P&L con "ingresos estimados" — UCOT $62M, CUTCSA $288M, COME $12M, COETC $8M; advertencia "calibrar con STM Card real" | cálculo en frontend con coches activos × tarifa × ocupación | sin STM Card | ⚠️ honesto pero todo estimado |
| 15 | **Gestión de Flota** | `/dashboard/fleet` | "No se encontraron unidades" | `vehicles` | vacía | ❌ inconsistencia naming + sin seed |
| 16 | **Gestión de Personal** | `/dashboard/admin/rrhh` | Contador "Personal (691)" pero tabla "0 de 0 empleados" — pide "Ejecute 'Carga Datos UCOT' primero" | `personal` o `users` | seed parcial nunca aplicado en prod | ❌ sin seed |
| 17 | **Asignación de Coches** | `/dashboard/admin/asignacion-vehiculos` | (no probado) | `vehicles` + `daily_assignments` | vacías | ❌ |
| 18 | **Inspectores** | `/dashboard/traffic/inspector-control` | (no probado) | `inspectors`, `inspections` | mixto | ⚠️ |
| 19 | **Sistema y Configuración** | `/dashboard/admin/sistema` | (no probado — debería estar el botón "Carga Datos UCOT") | `parametros_sistema` | parcial | ⚠️ |
| 20 | **Reportes Regulatorios** | `/dashboard/admin/regulatorio` | "0 vencidos · 0 próximos · 4 al día" — botones "Generar" sin verificación real | catálogo hardcodeado | mock | ❌ es catálogo estático, no estado real |
| 21 | **Centro de Mando (SA)** | `/dashboard/super-admin/centro-mando` | **0 buses, 0 alertas OTP, 0 líneas críticas, "Sin eventos recientes en vehicle_events" para todos los operadores** | `vehiculos` (con i, mal escrito), `vehicle_events` | `CentroMandoUnificado.tsx:244` lee de `vehiculos` y la real es `vehicles` | ❌ **bug de nombre de colección** confirmado |
| 22 | **Gantt Red (SA)** | `/dashboard/super-admin/gantt-red` | (no probado en este pase, pero fix-2026-05-02 dice OK) | `shapes_cross_operator`, `gtfs_timetable` | OK | ✅ |
| 23 | **Motor Consecuencias** | `/dashboard/super-admin/motor-consecuencias` | Es un **simulador interactivo** ("Configurá un evento y presioná Simular"), no un feed en vivo | `consequence_events` (vacía) | la página NO suscribe a Firestore — solo simula | ⚠️ no es lo que parecía |
| 24 | **Mi Rendimiento (driver)** | `/dashboard/driver/compliance` | (no probado) | datos GPS personales | parcial | ⚠️ |
| 25 | **Bolsa de Trabajo** | `/dashboard/market` | (no probado) | colección de trades | demo | ⚠️ |
| 26 | **Mi Cuenta** | `/dashboard/my-balance` | (no probado) | `users` | parcial | ⚠️ |

---

## Lo que SÍ está descargado de IMM (verificado con curl en vivo)

| Colección | Volumen | Fuente | Cron | Estado |
|---|---|---|---|---|
| `vehicle_events` | miles de docs/día (1057 línea 306, 631 línea 370 en últimos 2 días sólo UCOT) | STM `/buses/rest/stm-online` | `autoStatsCollectorTick` cada 15 min | ✅ activo desde 26-abr |
| `gtfs_timetable` | 1361 docs (CLAUDE.md) | GTFS oficial IMM `google_transit.zip` (16.8 MB) | `gtfsImportTick` semanal lunes 03:00 | ✅ activo |
| `gtfs_horarios` | 165 rutas (UCOT 32, CUTCSA 57, COME 48, COETC 28) | mismo GTFS | mismo cron | ✅ activo |
| `gtfs_stops` | ~4938 paradas | mismo GTFS | mismo cron | ✅ activo |
| `shapes_cross_operator` | ~1266 shapes | mismo GTFS | mismo cron | ✅ activo |
| `paradas_stm` | 4938 paradas con lat/lng | endpoint `immParadasList` | `refreshParadasTick` cron | ✅ activo |
| `corridor_overlap` | 1850 pares DRO calculados | `droMatrix` cada lunes | `droMatrix` lunes 04:00 | ✅ activo |
| `competidores` | docs por empresa | `competitorsIngestionService` | `refreshCompetidoresTick` cada 10 min | ✅ activo |
| `horarios_oficiales` | docs IMM API OAuth | `gtfsImporter` | mismo | ✅ activo |
| `bus_last_pos` | última posición por bus | `autoStatsCollector` | mismo cron | ✅ activo |

**Conclusión**: la integración con IMM está completa y los datos descargan bien. Lo que falla es que **el frontend no lee mucho de esto, o lo lee de la colección equivocada**.

---

## Causas raíz del problema "fix-A-rompe-B"

### 1. Nombres de colección dispersos en strings literales

Hay ~80 archivos con `collection(db, 'algo')` hardcoded. No existe una constante única. Esto se ve en `frontend/src/pages/traffic/CentroMandoUnificado.tsx:244` que lee `'vehiculos'` (mal) cuando los datos están en `'vehicles'`. Cambiar uno no propaga al otro.

**Fix estructural** (no para el lunes, post-demo): crear `frontend/src/data/collections.ts` con:

```typescript
export const COL = {
  VEHICLES: 'vehicles',
  PERSONAL: 'personal',
  VEHICLE_EVENTS: 'vehicle_events',
  // ...
} as const;
```

Y migrar progresivamente. **No tocar todo de golpe** porque romperíamos producción.

### 2. Archivos críticos compartidos (ya identificados en CLAUDE.md §10)

14 archivos importados por ≥10 módulos. Tocar `useEmpresaPropia.ts` afecta toda la app. Por eso el bug "CUTCSA hardcoded en H1 cuando SuperAdmin no tiene empresa" siguió apareciendo en módulos distintos durante varios sprints.

### 3. Hooks globales con fallbacks engañosos

`useEmpresaPropia()` cuando no hay empresa devuelve fallback `'CUTCSA'`. Por eso pantallas como Centro de Mando v7 dicen "Posición competitiva de CUTCSA…" siendo SuperAdmin sin empresa asignada. Cada vez que se intenta corregir el H1 se vuelve a ver porque el hook devuelve mal.

### 4. Bridge dev (puerto 3099) referenciado en producción

`CompetitorIntelligencePage.tsx`, `operationsIntelligenceService.ts`, `rivalTrackerService.ts` usan `BRIDGE_BASE = import.meta.env?.PROD ? '' : 'http://localhost:3099'`. En producción `BRIDGE_BASE = ''` → fetch a `/api/posicion`, `/api/agency-lines/...`, `/api/ucot/fleet-intel` — algunos de estos endpoints existen en `intelligenceApi`, otros no. Si no existen, el módulo se queda cargando o muestra error genérico.

### 5. Datos operacionales nunca seedeados en producción

Para que el sistema "tenga vida" en flota, personal, turnos, asignaciones, licencias, mantenimiento — tiene que existir un proceso de **carga inicial** del operador. Para UCOT existió un seed parcial. Para CUTCSA, COME, COETC nunca se cargaron. Por eso el sistema parece vacío para 3 de 4 operadores.

### 6. "Motor de Consecuencias" no es lo que el nombre sugiere

Hoy es un **simulador hipotético** (introducís un evento, te dice qué pasaría). No es un feed en vivo de cascadas reales. Es útil para demo pero no es "el sistema reaccionando solo" que describiste.

Para que sea reactivo en vivo:
- Triggers Firestore (`onDocumentCreated`, `onDocumentUpdated`) sobre `licencias_personal`, `daily_shifts`, `vehicle_events`, `incidencias` → escribir a `consequence_events`.
- Esos triggers ya **existen parcialmente** en `functions/src/consequenceTriggers.ts` (Trigger 3 sobre `vehicle_events` está activo). Faltan los otros y la página `/motor-consecuencias` debería suscribirse a `consequence_events` con `onSnapshot` para mostrar cascadas en vivo, no esperar input del usuario.

---

## Plan de acción (sin tocar código todavía)

### Fase A — diagnóstico completo (esta sesión, 2-3 h más)

Antes de modificar nada:

A1. **Censo completo del esquema real de Firestore**: por cada colección citada en frontend o backend, verificar:
- Cuántos docs tiene hoy.
- Quién la escribe (cron / endpoint manual / nadie).
- Quién la lee (cuántos archivos).
- Cuál es la "canónica" cuando hay múltiples.

A2. **Mapa visual de duplicados a resolver**: tabla con `vehicles ↔ vehiculos ↔ coches`, etc., y decisión de cuál preservar. La regla: la canónica es la que tiene MÁS DATOS y MÁS LECTORES. Las demás se redirigen.

A3. **Check de qué leen las páginas críticas**: para cada uno de los 25 módulos del sidebar, listar los `collection(db, ...)` y `fetch(...)` reales. Aparecerán los misnamings sistemáticos.

### Fase B — fixes superficiales sin cambiar código (mientras llega el seed real)

B1. **Visualizar lo que SÍ funciona**: el dashboard tiene datos reales (767 buses, alertas, bunching, mapa). Para la demo, quedarse en módulos que llenan: Vista General, Posición de Flota, Centro de Mando v7 (con disclaimer), Gantt Red, Inteligencia Cross-Op (cuando se arregle el load).

B2. **Esconder o etiquetar como WIP** los módulos que están vacíos por falta de seed: Listero, Asignación de Coches, Gestión de Personal, Gestión de Flota. Mostrar "Carga inicial pendiente" en vez de tabla vacía.

### Fase C — corrección estructural (post-lunes)

C1. **Constante única de colecciones** (`COL` enum) — migración por archivo, no big-bang.

C2. **Reglas Firestore explícitas** para nombres con/sin acento — bloquear el "fantasma" `vehiculos` después de migrar.

C3. **Endpoint de seed multi-tenant** en backend — script que cargue datos demo realistas para CUTCSA/COME/COETC desde sus listados públicos (~30 minutos por operador).

C4. **Motor de Consecuencias en vivo** — agregar `onSnapshot` a `consequence_events` en la página, terminar de cablear los triggers faltantes.

C5. **OTP real con `gtfs_timetable`**: el cron `autoStatsCollectorTick` lee `horarios_stm` (parcial). Cambiarlo a leer `gtfs_timetable` (oficial IMM, completo). Esto destapa OTP medible para todas las líneas.

---

## Por qué la sensación de "fix-A-rompe-B"

Tres mecánicas:

1. **Hay dos verdades para el mismo dato** (vehicles vs vehiculos, etc.). Cuando un fix migra una página de `vehiculos` → `vehicles`, otra página que aún miraba `vehiculos` se rompe (porque el seed escribe en uno solo).

2. **Hooks globales con fallbacks no determinísticos** (`useEmpresaPropia` devuelve `CUTCSA` cuando no hay empresa). Cada cambio en otro lado puede mover el resultado del hook y propagarse a las 30+ páginas que lo usan.

3. **Falta de tipos compartidos**: el backend define `ComplianceState = 'EN_TIEMPO' | ...` y el frontend lo replica. Si cambia uno, el otro no.

Es 100% el efecto de un sistema grande sin **fronteras claras entre módulos** ni **fuente única de verdad**. La extensión del programa amplifica esto, pero la causa real es estructural, no de tamaño.

---

## Lo que recomiendo NO hacer hoy

- No introducir más fixes "rápidos" en archivos críticos. Cada Edit grande tiene riesgo de inducir más regresiones por la misma razón.
- No prometer en la demo del lunes que todos los módulos están operativos. Mostrar lo que sí funciona (que es mucho: GPS live cross-operador, alertas tácticas, mapas, Gantt, Cuota de Mercado por línea) y posicionar el resto como "carga inicial del operador, configurable en horas".

## Lo que recomiendo SÍ hacer hoy

1. **Aprobá esta auditoría** o pedime que profundice en alguno de los 25 módulos que no probé.
2. Si hay tiempo, **rebuild + redeploy del frontend**: producción está 1 commit atrás del backend. La inconsistencia de versiones puede explicar parte de lo que ves.
3. Decidí qué módulos **vas a mostrar en la demo del lunes** y qué módulos **vas a esconder**. Eso baja a 5-7 las cosas que tienen que estar perfectas.

---

**Cierre**: tu intuición fue correcta. No es solo URL rota. Es un sistema con **3 clases de datos**, **nombres duplicados**, **archivos críticos compartidos** y **hooks globales con fallbacks engañosos**. El motor de IMM funciona; el problema está aguas abajo. Esta auditoría es la base para no seguir parcheando a ciegas.
