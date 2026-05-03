# Módulo: Pipeline GTFS (Horarios y Rutas Oficiales)

## En el negocio

GTFS (General Transit Feed Specification) es el estándar internacional de datos de transporte público. La IMM publica semanalmente el GTFS oficial de Montevideo con los horarios, rutas y paradas de todas las líneas de todos los operadores.

SkillRoute importa ese GTFS cada lunes y lo convierte en colecciones Firestore optimizadas. Esos datos son la base de:
- El cálculo de solapamiento entre rutas (DRO)
- El OTP real con snap-to-stop (otpEngine)
- El HRR (frecuencia relativa al rival)
- El seat-km (market share por corredor)
- El feed GTFS-RT que consume Google Maps y Moovit

## Arquitectura del pipeline

```
LUNES 03:00 UTC
──────────────────────────────────────────────────────────────────
gtfsImporter.ts
  └─ Descarga GTFS oficial de la IMM (requiere token OAuth IMM)
  └─ Procesa: routes, trips, stop_times, stops, shapes, calendar
  └─ Escribe en Firestore:
       shapes_cross_operator → geometría de cada ruta (IDA/VUELTA)
       gtfs_timetable        → horarios por trip, parada y hora
       gtfs_stops            → posición GPS de cada parada
       gtfs_horarios         → resumen de frecuencias por línea
       gtfs_calendar         → días de servicio (L-V, fines de semana, feriados)
       gtfs_fares            → tarifas oficiales

LUNES 04:00 UYT (depende de que gtfsImporter terminó)
──────────────────────────────────────────────────────────────────
droMatrix.ts
  └─ Lee: shapes_cross_operator (todas las rutas de todos los operadores)
  └─ Calcula: DRO entre cada par de rutas en mismo sentido
              (% de puntos de ruta A que están a ≤120m de ruta B)
  └─ Escribe: corridor_overlap → base de todo el análisis competitivo

CONTINUO (usa los datos del GTFS semanal)
──────────────────────────────────────────────────────────────────
otpEngine.ts (cada 10 min)
  └─ Lee: gtfs_timetable + gtfs_stops + GPS live IMM
  └─ Calcula: delay real por bus por parada (snap-to-stop)
  └─ Escribe: bus_delays, otp_summary

hrrEngine.ts (cada 10 min)
  └─ Lee: corridor_overlap + gtfs_timetable + GPS live
  └─ Calcula: HRR (tiempo al próximo rival en tramo compartido)
  └─ Escribe: hrr_live

seatKmCalculator.ts (diario 06:00 UTC)
  └─ Lee: shapes_cross_operator + gtfs_timetable
  └─ Calcula: seat-km por empresa y corredor
  └─ Escribe: seat_km_snapshot

gtfsRealtime.ts (siempre activo — HTTP)
  └─ Lee: vehicle_events + desvios_activos + alertas_regulacion
  └─ Sirve: feed GTFS-RT (protobuf + JSON) para Google Maps, Moovit, etc.
```

## Token OAuth IMM

El gtfsImporter requiere un token OAuth de la IMM para acceder al GTFS:
- `immTokenService.ts` maneja el ciclo de vida del token
- `immOAuthCallback.ts` es el stub de callback registrado en el portal IMM (URL: `https://us-central1-ucot-gestor-cloud.cloudfunctions.net/immOAuthCallback`)
- El portal OAuth de IMM: `api.montevideo.gub.uy/admin/applications` — SkillRoute registrado con ID 51137bff, estado LIVE

## Colecciones involucradas

| Colección | La llena | Frecuencia | La leen |
|---|---|---|---|
| `shapes_cross_operator` | gtfsImporter | Semanal lunes | droMatrix, seatKmCalculator, frontend (ShadowRadar, CorridorIntelligence) |
| `gtfs_timetable` | gtfsImporter | Semanal lunes | otpEngine, hrrEngine, seatKmCalculator |
| `gtfs_stops` | gtfsImporter | Semanal lunes | otpEngine, hrrEngine |
| `gtfs_horarios` | gtfsImporter | Semanal lunes | gtfsSchedulesService (frontend — análisis competitivo) |
| `gtfs_calendar` | gtfsImporter | Semanal lunes | (referencia — no consumido activamente) |
| `gtfs_fares` | gtfsImporter | Semanal lunes | (referencia — no consumido activamente) |
| `corridor_overlap` | droMatrix | Semanal lunes (post-import) | hrrEngine, frontend (ShadowRadar tiers, CorridorIntelligence, CorridorMarketShare) |
| `ingesta_health/gtfs_importer` | gtfsImporter | Semanal lunes | StmScraperStatus (frontend monitoring) |

## Consecuencias de tocar este pipeline

| Si tocás... | Se rompe... |
|---|---|
| Schema de `shapes_cross_operator` | droMatrix no puede calcular DRO → corridor_overlap queda desactualizado → ShadowRadar pierde tiers, CorridorIntelligence pierde análisis |
| Schema de `gtfs_timetable` | otpEngine + hrrEngine + seatKmCalculator dejan de funcionar |
| Schema de `corridor_overlap` | ShadowRadar pierde clasificación T1/T2/T3, HRR incorrecto |
| `immTokenService.ts` | gtfsImporter no puede autenticarse → sin datos GTFS nuevos |
| `gtfsImporter.ts` | Todo el pipeline aguas abajo queda con datos de la semana anterior |
| Orden de cron (droMatrix antes de gtfsImporter) | droMatrix usa shapes viejas — corridor_overlap desactualizado |

## Verificación del pipeline

Después de que corre el gtfsImporter, verificar en Firestore:
- `ingesta_health/gtfs_importer` → campo `status: 'OK'` y `lastRun` con fecha de hoy
- `shapes_cross_operator` → contar docs (debe haber cientos de shapes por los 4 operadores)
- `gtfs_timetable` → contar docs (debe haber miles de trips)

Después de droMatrix:
- `corridor_overlap` → contar docs (actualmente ~1850 pares)

## Estado

| Componente | Estado |
|---|---|
| gtfsImporter (cron semanal lunes) | ✅ Activo |
| droMatrix (cron lunes post-import) | ✅ Activo |
| shapes_cross_operator | ✅ 1167 shapes de 4 operadores |
| corridor_overlap | ✅ 1850 pares DRO calculados |
| gtfs_timetable + gtfs_stops | ✅ Datos actualizados |
| Token OAuth IMM | ✅ Registrado y activo (ID 51137bff) |
| gtfsRealtime (feed GTFS-RT) | ✅ Activo — sirve vehicle-positions, trip-updates, service-alerts |
| UCOT shapes (en shapes_cross_operator) | ⚠️ 0 shapes UCOT — solo competidores. UCOT no aparece en Mapas Estratégicos |
