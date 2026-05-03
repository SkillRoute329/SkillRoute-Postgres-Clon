# Módulo: Pipeline OTP (Cumplimiento Horario)

## En el negocio

El OTP (On-Time Performance) mide cuántos buses de cada línea llegaron a tiempo según el horario programado. Es la métrica más importante para el regulador (STM/IMM) y para la negociación del subsidio: el subsidio que recibe cada operador depende parcialmente de su cumplimiento horario.

Para UCOT, CUTCSA, COME y COETC, el OTP define:
- Si el operador merece el subsidio completo o se le descuenta
- Cuáles líneas tienen peor rendimiento y necesitan intervención
- La comparación competitiva entre operadores

## El problema: hay DOS pipelines de OTP que no están conectados al mismo destino

```
PIPELINE A — Heurístico (el que VE el dashboard hoy)
─────────────────────────────────────────────────────
autoStatsCollector.ts (cada 15 min)
  └─ Lee: horarios_stm (scrape web STM)
  └─ Calcula: si el bus está dentro de la ventana horaria de su línea
  └─ Escribe: vehicle_events.estadoCumplimiento
             (SIN_HORARIO / EN_TIEMPO / ATRASADO / ADELANTADO)

scheduleAdherence.ts (cada hora)
  └─ Lee: vehicle_events
  └─ Agrega: auto_stats_diarios, compliance_rt

Dashboard Cumplimiento (/diagnostico-cumplimiento)
  └─ Lee: auto_stats_diarios via autoStatsService HTTP
  └─ Muestra: OTP del día por línea ← ESTO ES LO QUE VE EL USUARIO

PROBLEMA: el cálculo es heurístico. Sin snap-to-stop real, si el bus
está dentro de la ventana de servicio se asume EN_TIEMPO. La desviación
exacta en minutos no se puede calcular sin saber en qué parada está el bus.
```

```
PIPELINE B — Real con GTFS (existe pero NO conectado al dashboard)
──────────────────────────────────────────────────────────────────
otpEngine.ts (cada 10 min)
  └─ Lee: gtfs_timetable (horarios GTFS oficiales IMM)
  └─ Lee: gtfs_stops (posiciones de paradas)
  └─ Calcula: distancia real del bus a la parada más cercana (snap-to-stop)
  └─ Calcula: delay = tiempo_llegada_real - tiempo_programado_en_horario
  └─ Escribe: bus_delays/{agencyId}_{busId}
              otp_summary/{agencyId}_{linea}

Estado: Motor activo. Datos escritos en Firestore cada 10 min.
PERO: el Dashboard de Cumplimiento NO lee bus_delays ni otp_summary.
Los datos existen en Firestore pero no se muestran en ninguna pantalla.
```

## Consecuencia práctica hoy (2026-05-02)

- El dashboard muestra OTP honesto pero aproximado (SIN_HORARIO para 63/67 buses UCOT que no tienen match exacto con el horario scrapeado)
- El OTP real por parada existe en `otp_summary` pero ninguna pantalla lo consume
- Para la presentación del lunes: el OTP "SIN_HORARIO" es correcto y honesto — es mejor que inventar 100% en tiempo (bug anterior)

## Cómo conectar los dos pipelines (backlog prioridad alta)

**Cambio necesario:** hacer que el Dashboard de Cumplimiento lea `otp_summary` (Pipeline B) en lugar de `auto_stats_diarios` (Pipeline A).

**Archivo a modificar:** `frontend/src/services/autoStatsService.ts`
- Agregar función `fetchOtpSummary(agencyId)` que lea `otp_summary/{agencyId}_*` de Firestore
- El dashboard llama a esta función en lugar del endpoint HTTP actual

**Impacto:** solo `DiagnosticoCumplimiento.tsx` y `AutoStatsModule.tsx` necesitan actualizar su fuente de datos. El resto del sistema no se toca.

**Riesgo:** bajo — es solo cambiar la fuente de lectura, sin tocar el cálculo ni los schemas.

## Colecciones involucradas

| Colección | La llena | Con qué | La lee |
|---|---|---|---|
| `horarios_stm` | refreshAllStmHorarios | Scrape diario 04:15 | autoStatsCollector |
| `vehicle_events` | autoStatsCollector | Cada 15 min | scheduleAdherence, dashboard (Pipeline A) |
| `auto_stats_diarios` | scheduleAdherence | Cada hora | Dashboard Cumplimiento hoy |
| `gtfs_timetable` | gtfsImporter | Semanal lunes | otpEngine |
| `gtfs_stops` | gtfsImporter | Semanal lunes | otpEngine |
| `bus_delays` | otpEngine | Cada 10 min | ⚠️ Nadie en frontend hoy |
| `otp_summary` | otpEngine | Cada 10 min | ⚠️ Nadie en frontend hoy |
| `otp_daily` | consequenceTriggers | OnCreate vehicle_events | consequenceTriggers (trigger cascada) |

## Estado

| Componente | Estado |
|---|---|
| otpEngine.ts | ✅ Activo — calcula OTP real con snap-to-stop |
| Colecciones bus_delays + otp_summary | ✅ Se llenan cada 10 min |
| Dashboard consume otp_summary | ❌ No conectado — usa auto_stats_diarios |
| Dashboard Cumplimiento (/diagnostico-cumplimiento) | ✅ Funcional con Pipeline A heurístico |
