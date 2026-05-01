# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

**Última actualización:** 2026-05-01 — Seat-km Market Share deployado + verificado en prod

---

## ✅ ESTADO: Seat-km Market Share en producción

### Lo que se completó en esta sesión (2026-05-01)

| Feature | Estado | Detalle |
|---|---|---|
| **`seatKmCalculator.ts`** | ✅ En prod | Cron 6am + HTTP seatKmCalculatorNow + seatKmSnapshotQuery |
| **`seat_km_snapshot` collection** | ✅ Escribe en prod | Doc por fecha con empresas{}, corredores[], metodologia{} |
| **`SeatKmDashboard.tsx`** | ✅ En prod | Donut market share, sparklines histórico, tabla corredores, fallback cliente |
| **Tab "Seat-km Market Share"** | ✅ En prod | CorredoresHub tiene tab con icono Gauge |
| **Rebranding SkillRoute** | ✅ En prod | "Copiloto Táctico SkillRoute" + "Iniciando SkillRoute…" |
| **`hrrEngine.ts` + HrrDashboard** | ✅ En prod | HRR cron 10min, tabla + sparklines + mapa |

### Verificación en producción (confirmada 2026-05-01)

```
seatKmCalculatorNow → ok: true
date: 2026-05-01 | svcType: HABIL
total: 30.195.817 seat-km | lineasConDatos: 243

Distribución por empresa (día hábil):
  COETC  (10): 15.205.181 seat-km → 50.36%  (19 líneas, 1552 viajes)
  CUTCSA (50):  6.822.660 seat-km → 22.59%  (84 líneas, 4838 viajes)
  UCOT   (70):  4.622.331 seat-km → 15.31%  (12 líneas, 1016 viajes)
  COME   (20):  3.545.645 seat-km → 11.74%  (11 líneas, 1223 viajes)
```

> **Nota de datos:** COETC aparece con 50% de market share de oferta.
> Esto puede reflejar que sus rutas metropolitanas son muy largas (alta longitud × viajes).
> Verificar contra capacidades reales cuando se cuente con datos oficiales de flota.
> La metodología tiene disclaimer visible en el dashboard.

---

## ✅ Acumulado en producción (sesiones previas)

| Feature | Estado |
|---|---|
| `immBusesLive` Cloud Function | ✅ GPS enriquecido 4 empresas, ~996 buses |
| `immParadasList` Cloud Function | ✅ 4938 paradas con lat/lng, cache 30 min |
| Fleet Monitor — fuente IMM | ✅ IMM primero, fallback STM |
| Fleet Monitor — badges enriquecidos | ✅ velocidad, ♿ piso bajo, ❄ AC, ⚡ eléctrico |
| `gtfsImporter.ts` | ✅ Cron semanal lunes 03:00 UTC |
| `gtfs_timetable` collection | ✅ 1361 docs — horarios completos |
| `otpEngine.ts` | ✅ OTP cron 10min + HTTP computeOtpNow |
| `StopSchedulePanel.tsx` | ✅ Panel "Próximas salidas" con OTP |
| DRO matrix corridor_overlap | ✅ 1850 pares cross-operador |
| `hrrEngine.ts` | ✅ HRR cron 10min + HTTP |
| `HrrDashboard.tsx` | ✅ Tabla + sparklines + mapa Leaflet |
| `seatKmCalculator.ts` | ✅ Cron diario 6am + HTTP |
| `SeatKmDashboard.tsx` | ✅ Cross-operador con fallback cliente |
| DEMO_MODE | ✅ Activo — `PrivateRoute.tsx` DEMO_MODE=true |

---

## ⚠️ PENDIENTE POST-DEMO

### 1. Re-deshabilitar autenticación
Archivo: `frontend/src/components/PrivateRoute.tsx` línea 4
Cambiar: `const DEMO_MODE = true;` → `const DEMO_MODE = false;`

---

## 📋 PRÓXIMO PASO INMEDIATO

### Verificación funcional seat-km en browser

1. Abrir https://skillroute.web.app/dashboard/traffic/corredores
2. Click en tab **"Seat-km Market Share"** (icono medidor)
3. Verificar que aparece:
   - Donut chart con 4 empresas coloreadas
   - Badge "Snapshot guardado" o "Calculado en tiempo real"
   - Tabla de corredores con columnas seatKm/pct/longKm/viajes
   - Banner de metodología con las asunciones documentadas
4. Verificar filtro por empresa funciona
5. Verificar sort por seatKm descendente

Verificación backend:
```
curl -s "https://us-central1-ucot-gestor-cloud.cloudfunctions.net/seatKmCalculatorNow" | findstr "total"
```

---

## 🔲 Backlog priorizado

1. **Consumir gtfs_calendar en UI** — mostrar hábil/sáb/dom en Navegador
2. **Fix GTFS agencyId=0** — 8 shapes con agencyId='0' (líneas L12/L31/L32)
3. **APK Android** — actualizar con build actual
4. **Badge "IMM Conectado"** en admin/sistema
5. **Calibrar capacidades flota** — datos oficiales STM para CAPACITY_BY_AGENCY (ahora estimado)
6. **Seat-km sábado/domingo** — el cron solo genera hábil; agregar svcType param al cron

---

## Bugs conocidos no críticos

- `regresionOLS.test.ts`: 4 tests fallan (outlier en tendenciaOLS) — pre-existente
- 8 shapes GTFS con `agencyId: '0'` — líneas L12/L31/L32, no afectan el Navegador
- `gtfs_fares` vacío — IMM no publica tarifas en GTFS Uruguay
- índice compuesto `corridor_overlap` (sameEmpresa+pctAInB) aún construyendo en Firestore — workaround activo (filtro en memoria en hrrEngine)
- COETC con 50% seat-km aparente — puede ser artefacto de rutas largas vs capacidades estimadas, no datos oficiales

---

## APIs deployadas

| Endpoint | URL | Estado |
|---|---|---|
| `GET /immBusesLive?empresa=all` | `immbuseslive-3o5d3sy5xq-uc.a.run.app` | ✅ |
| `GET /immParadasList` | `immparadaslist-3o5d3sy5xq-uc.a.run.app` | ✅ |
| `POST /gtfsImportRun` | `gtfsimportrun-3o5d3sy5xq-uc.a.run.app` | ✅ |
| `GET /computeOtpNow` | `computeotpnow-3o5d3sy5xq-uc.a.run.app` | ✅ |
| `GET /hrrQueryNow` | `hrrquerynow-3o5d3sy5xq-uc.a.run.app` | ✅ |
| `GET /hrrData?agencyId=70` | `hrrdata-3o5d3sy5xq-uc.a.run.app` | ✅ |
| `GET /seatKmCalculatorNow` | `us-central1-ucot-gestor-cloud.cloudfunctions.net/seatKmCalculatorNow` | ✅ |
| `GET /seatKmSnapshotQuery?date=YYYY-MM-DD` | `us-central1-ucot-gestor-cloud.cloudfunctions.net/seatKmSnapshotQuery` | ✅ |
| `hrrTick` (cron) | cada 10 min | ✅ |
| `seatKmCalculatorCron` (cron) | diario 6am Montevideo | ✅ |
