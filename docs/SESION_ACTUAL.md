# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

**Última actualización:** 2026-05-01 — OTP Engine + StopSchedulePanel con puntualidad real deployados

---

## ✅ ESTADO: OTP Engine + timetable + panel horarios EN PRODUCCIÓN

### Lo que se completó en esta sesión (2026-05-01)

| Feature | Estado | Detalle |
|---|---|---|
| **`gtfs_timetable` collection** | ✅ En prod | 1361 docs — horarios completos por parada, dirección y tipo de servicio |
| **`otpEngine.ts`** | ✅ En prod | Cloud Function cron cada 10 min + HTTP `/computeOtpNow` |
| **`bus_delays` collection** | ✅ En prod | Retraso actual por bus — snap a parada más cercana (<400m) |
| **`otp_summary` collection** | ✅ En prod | % puntualidad + retraso promedio por línea, actualizado cada 10 min |
| **`StopSchedulePanel.tsx`** | ✅ En prod | Panel "Próximas salidas" + badge "X% a tiempo" en tiempo real |
| **`gtfsTimetableService.ts`** | ✅ En prod | Servicio frontend con cache + `getProximasSalidasEnParada()` |
| **`otpService.ts`** | ✅ En prod | Frontend — `getOtpSummary()` con cache 5 min |
| **Reglas Firestore** | ✅ Deployadas | `gtfs_timetable`, `bus_delays`, `otp_summary` lectura pública |
| **version.json 5c345ff2** | ✅ En prod | Build ID nuevo — usuarios con cache vieja reciben reload |

### Verificación en producción (confirmada 2026-05-01 00:43 UY)

- `computeOtpNow`: 12 buses vivos (medianoche), 2 retrasados detectados, 8 líneas activas en 17s
- `otp_summary`: docs escritos para líneas 522, 538, 546, etc.
- `gtfs_timetable/50_100_0_HABIL`: 94 viajes, 53 paradas, primera 05:42, última 23:56
- 90/94 viajes con cobertura completa de paradas

### Sesiones anteriores — acumulado en prod

| Feature | Estado |
|---|---|
| `immBusesLive` Cloud Function | ✅ GPS enriquecido 4 empresas, ~996 buses |
| `immParadasList` Cloud Function | ✅ 4938 paradas con lat/lng, cache 30 min |
| Fleet Monitor — fuente IMM | ✅ IMM primero, fallback STM |
| Fleet Monitor — badges enriquecidos | ✅ velocidad, ♿ piso bajo, ❄ AC, ⚡ eléctrico |
| Fleet Monitor — toggle Paradas | ✅ 4938 markers en mapa |
| Fleet Monitor — panel ETA | ✅ Click en parada → próximos arrivos cross-empresa |
| `FleetEtaPanel.tsx` | ✅ Componente panel ETA con badges por empresa |
| DEMO_MODE (sin auth) | ✅ Activo — `PrivateRoute.tsx` DEMO_MODE=true |
| `gtfsImporter.ts` | ✅ Cron semanal lunes 03:00 UTC; HTTP POST /gtfsImportRun |
| GTFS shapes en Firestore | ✅ 1080 shapes con routeLongName; COETC:130, COME:48, CUTCSA:779, UCOT:116 |
| `gtfs_horarios` collection | ✅ 280 docs de horarios oficiales por empresa |
| `gtfs_calendar` collection | ✅ 140 docs — patrones hábil/sábado/domingo + vigencias por línea |
| `gtfs_fares` collection | ✅ Preparada (IMM no publica fare_attributes.txt en Uruguay) |
| `gtfs_stops` collection | ✅ 4891 paradas con nombre oficial, lat/lng, accesibilidad |
| `gtfs_timetable` collection | ✅ 1361 docs — horarios completos por parada/dirección/servicio |
| `navigationDataService.ts` | ✅ dual-docId lookup + enrichParadasFromStops (nombres reales) |
| Vacuous-truth bug fix | ✅ `linea.paradas.length > 0 &&` antes del `.every()` en NavigationModule.tsx |
| Auto-reload re-habilitado | ✅ `appVersion.ts`, `useVersionCheck.ts`, `swRegistration.ts` re-activados |

---

## ⚠️ PENDIENTE POST-DEMO

### 1. Re-deshabilitar autenticación cuando termine la demo
Archivo: `frontend/src/components/PrivateRoute.tsx` línea 4  
Cambiar: `const DEMO_MODE = true;` → `const DEMO_MODE = false;`

---

## 📋 PRÓXIMO PASO INMEDIATO

### Verificación visual en producción (para Jonathan o Claude Code con browser)

1. Abrir https://ucot-gestor-cloud.web.app/dashboard/traffic/navigation
2. Seleccionar empresa "CUTCSA" → dropdown debe mostrar líneas tipo "100 — Pza.españa - V.farre"
3. Seleccionar línea 100 → mapa dibuja el recorrido
4. Hacer click en una parada del mapa o de la lista lateral
5. **NUEVO**: debe aparecer `StopSchedulePanel` con "Próximas salidas" y horarios reales tipo "05:42 / En 12 min"
6. Panel debe tener botón X para cerrar y botón de refresh

Verificación adicional — timetable:
```
curl -s "https://firestore.googleapis.com/v1/projects/ucot-gestor-cloud/databases/(default)/documents/gtfs_timetable/50_100_0_HABIL" | python -c "import sys,json; d=json.load(sys.stdin); f=d['fields']; print('viajes:', f.get('totalViajes',{}).get('integerValue'), '| primera:', f.get('primeraS',{}).get('stringValue'), '| ultima:', f.get('ultimaS',{}).get('stringValue'))"
```

---

## 🔲 Backlog priorizado

1. **v2 HRR en vivo** — headway real en tramo compartido usando corridor_overlap (diferenciador clave para pitch CUTCSA)
4. **Consumir gtfs_calendar en UI** — mostrar "opera hábil/sábado/domingo" en panel de línea del Navegador
5. **Dashboard seat-km market share** — v3, cross-operador por corredor
6. **Fix GTFS agencyId=0** — 8 shapes con agencyId='0' (líneas L12/L31/L32 de STM); no afectan el Navegador operativo
7. **APK Android** — actualizar con build actual
8. **Badge "IMM Conectado"** en admin/sistema

---

## Bugs conocidos no críticos

- `regresionOLS.test.ts`: 4 tests fallan (outlier en tendenciaOLS) — pre-existente
- `monitoring.ts` warning Rollup — pre-existente, no afecta runtime
- 8 shapes GTFS con `agencyId: '0'` y `empresa: 'STM'` — líneas L12/L31/L32 que el importer no pudo mapear a operador; no afectan el Navegador
- `gtfs_fares` vacío — el IMM no publica tarifas en el GTFS (Uruguay las regula centralmente via STM/IMM, no por línea)
- `gtfs_timetable` viajes con t[] parcial: 4/94 trips en línea 100 tienen cobertura parcial (viajes cortos) — correcto por diseño

---

## Decisiones técnicas de esta sesión

- **Formato compacto timetable**: `{stops: string[], viajes: [{s: "HH:MM", t: number[]}]}` donde `t[i]` = minutos desde medianoche para parada `stops[i]`, -1 si el viaje no sirve esa parada. ~8KB por doc, 1361 docs total.
- **Single-pass stop_times**: Se agrega `tripFullTimes` capture al parse ya existente de stop_times.txt, sin releer el archivo (sería >100MB). El `shapeToStopIds` (para paradas representativas) y `tripFullTimes` (para timetable) coexisten en el mismo loop.
- **serviceType por service_id**: calendar.txt se relee dentro del bloque horarios (es pequeño, <10KB) para no refactorizar el orden de parseo de archivos.
- **StopSchedulePanel posición**: aparece debajo de StopsList cuando `selectedStopId !== null`, inline en el sidebar. El cierre limpia `selectedStopId` (no necesita nuevo estado).
- **Cache in-memory en gtfsTimetableService**: los docs se actualizan 1x/semana (cron GTFS), así que cachear por sesión es apropiado.

---

## APIs deployadas

| Endpoint | URL | Estado |
|---|---|---|
| `GET /immBusesLive?empresa=all` | `cloudfunctions.net/immBusesLive` | ✅ |
| `GET /immParadasList` | `cloudfunctions.net/immParadasList` | ✅ 4891 paradas |
| `GET /immEta?busstopId=X&lines=Y` | `cloudfunctions.net/immEta` | ✅ |
| `POST /gtfsImportRun` | `cloudfunctions.net/gtfsImportRun` | ✅ |
| `GET /gtfsDebug` | `cloudfunctions.net/gtfsDebug` | ✅ |
| `gtfsImportTick` (cron) | lunes 03:00 UTC | ✅ |
