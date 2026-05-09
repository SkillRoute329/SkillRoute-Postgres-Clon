# Glosario de Métricas — SkillRoute

> Documento de referencia para distinguir los distintos conteos de "líneas", "buses", "coches" y "cobertura"
> que aparecen en distintos módulos del sistema. Ningún número es incorrecto — cada uno mide una cosa distinta.
> Actualizar cada vez que se añada un módulo nuevo con una métrica nominalmente similar.

---

## Líneas de servicio

| Nombre oficial | Definición | Fuente de datos | Dónde se usa |
|---|---|---|---|
| **Líneas activas hoy** | Cantidad de líneas distintas con al menos 1 bus reportando GPS en las últimas 2 horas | `vehicle_events` del día (campo `linea`) | Dashboard principal, header, Centro de Mando |
| **Líneas con servicio programado hoy** | Líneas que tienen al menos 1 viaje en el `gtfs_timetable` para la fecha y tipo de día (hábil/sábado/domingo) | `gtfs_timetable` + `horarios_stm` | Módulo Vista del Día, Planificación |
| **Líneas con boletín cargado** | Líneas que tienen al menos 1 registro en la colección `boletin` (tiempos de tránsito por etapa) | `boletin` | Módulo Cumplimiento por Línea, Auditoria |
| **Líneas en GTFS oficial** | Total de líneas distintas importadas del feed GTFS de IMM, sin filtrar por servicio del día | `gtfs_timetable` (distinct `route_short_name`) | Módulo Horarios Oficiales GTFS, Competencia |

**Regla general:** cuando un módulo muestra un conteo de líneas, debe incluir un tooltip que indique cuál de las 4 definiciones aplica.

---

## Buses / Coches / Vehículos

| Nombre oficial | Definición | Fuente de datos | Dónde se usa |
|---|---|---|---|
| **Buses en vivo** | Buses reportando GPS al IMM en los últimos 15 minutos | Endpoint STM `stm-online` → `viajes_activos` | Header del sistema, mapa en vivo |
| **Flota operativa** | Coches con estado `operativo` en la colección `vehicles` / `vehiculos` de la empresa | `vehicles` / `vehiculos` | Centro de Mando, Fleet Intelligence |
| **Coches activos hoy** | Coches con al menos 1 evento GPS registrado en `vehicle_events` hoy | `vehicle_events` del día (campo `idBus`) | Inteligencia de Flota, AutoStats |
| **Flota total** | Total de coches registrados en la base de datos de la empresa (operativos + en taller + paralizados) | `vehicles` / `vehiculos` (sin filtro de estado) | Panel Administrativo, reportes UCOT |

---

## Cobertura GPS

| Nombre oficial | Definición | Fuente de datos | Dónde se usa |
|---|---|---|---|
| **Cobertura GPS del sistema** | % de eventos GPS en `vehicle_events` del período que tienen un viaje programado asociado en GTFS (`estadoCumplimiento` ≠ SIN_HORARIO ≠ FUERA_DE_SERVICIO) | `vehicle_events` + `gtfs_timetable` | Módulo de Auditoría, reportes de cobertura |
| **OTP (cumplimiento en tiempo)** | % de eventos GPS con `estadoCumplimiento == EN_TIEMPO` sobre el total de eventos con referencia horaria | `vehicle_events` (campo `estadoCumplimiento`) | Dashboard CEO, Cumplimiento por Línea, Flota Inteligente |
| **Cobertura de línea** | % de viajes programados de una línea para los que se registró al menos 1 ping GPS en `vehicle_events` | `compliance_aggregates` (campo `coverageGps`) | Vista Operador, Vista Regulador |

---

## Solapamiento / Competencia

| Nombre oficial | Definición | Fuente de datos | Dónde se usa |
|---|---|---|---|
| **DRO (Directional Route Overlap)** | % de puntos GPS resampleados de la ruta A que están a ≤35m lateral y ≤60° de bearing de algún segmento de la ruta B, en el **mismo sentido** (TCRP 195) | `corridor_overlap` (campo `droAtoB`) | Cross-Op Intelligence, ShadowRadar |
| **Pares de rutas analizados** | Cantidad de pares (ruta A, ruta B) distintos con al menos 1 punto de solapamiento calculado | `corridor_overlap` (count de docs) | Cross-Op Intelligence, Red Metropolitana |
| **Tiering T1/T2/T3** | Clasificación de pares por nivel de competencia: T1 ≥60% DRO (crítico), T2 30-59% (moderado), T3 10-29% (bajo) | Calculado en frontend desde `droAtoB` | ShadowRadar, Cross-Op |

---

## Reglas de tooltip obligatorias (UI)

Cada módulo que muestre un número de líneas, buses, o cobertura DEBE mostrar un tooltip o subtítulo que especifique:
1. Qué conteo es (usar nombres de la tabla anterior)
2. El período de referencia (hoy, últimas 2h, últimos 7 días, etc.)
3. Si el dato es en vivo o calculado en batch

**Ejemplo correcto:**
> `12 líneas activas hoy` (tooltip: "Líneas con al menos 1 bus GPS en las últimas 2 horas")

**Ejemplo incorrecto:**
> `12 líneas` (sin contexto)

---

*Versión 1.0 — 2026-05-09. Generado como parte de AUD-022 (auditoría pre-presentación CUTCSA).*
