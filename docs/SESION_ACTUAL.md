# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

**Última actualización:** 2026-05-01 — Sprint cerrado · Login obligatorio restaurado · 6/6 módulos verificados

---

## ✅ ESTADO: Sistema en producción con login obligatorio

### Lo que se completó en esta sesión (2026-05-01)

| Fix | Estado | Detalle |
|---|---|---|
| **Seat-km Market Share** | ✅ En prod | Cron + HTTP + dashboard + tab CorredoresHub |
| **CR-1 · CEO Dashboard crash** | ✅ En prod | `Map as MapIcon` → `MapPin as MapIcon` — elimina colisión bundle |
| **DEMO_MODE=false** | ✅ En prod | Login obligatorio en todas las rutas protegidas |
| **Verificación Playwright 6/6** | ✅ Confirmado | Todos los módulos verificados con sesión activa |

### Estado de cada P0

| CR | Descripción | Estado |
|---|---|---|
| CR-1 | CEO Dashboard `TypeError: re is not a constructor` | ✅ CERRADO |
| CR-2 | `road_alerts` permission-denied | ✅ CERRADO |
| CR-3 | Índice `service_matrices` faltante | ✅ CERRADO |
| CR-4 | AuthContext "INT #----" durante carga | 🟡 MENOR — cosmético |
| CR-5 | ServiceCategoryManager permission-denied | 🟡 MENOR — no en el flujo principal |

### Verificación módulos (con sesión activa)

| Módulo | Ruta | Estado |
|---|---|---|
| Centro de Mando V7 | `/traffic/ceo` | ✅ LISTO |
| Fleet Monitor | `/traffic/fleet-monitor` | ✅ LISTO |
| Inteligencia Cross-Op | `/traffic/corridor-intelligence` | ✅ LISTO |
| Radar Competencia | `/traffic/competitor-intelligence` | ✅ LISTO |
| Incidencias | `/traffic/incidents` | ✅ LISTO |
| BRT 2027 | `/traffic/brt` | ✅ LISTO |

### Rutas a EVITAR

| Ruta | Motivo |
|---|---|
| `/traffic/financiero` | Datos sintéticos |
| `/traffic/diagnostico-cumplimiento` | OTP oscila 55%↔100% |
| `/traffic/listero`, `/distribución` | Estado vacío sin datos del día |
| `/traffic/inspector-control` | Líneas con "EDO/OMETRO/UNKNOWN" |
| `/admin/asignacion-vehiculos` | Nombre conductor "2+00+0" |
| `/fleet` → Mantenimiento | "Invalid Date" + strings en inglés |
| `/admin/sistema` | "ERROR DE ENLACE" en BD |
| `/traffic/corridor-map` | UCOT 0 shapes — empresa propia sin datos cartográficos |

---

## ✅ Acumulado en producción

| Feature | Estado |
|---|---|
| `immBusesLive` Cloud Function | ✅ GPS enriquecido 4 empresas, ~996 buses |
| `immParadasList` Cloud Function | ✅ 4938 paradas con lat/lng, cache 30 min |
| Fleet Monitor — fuente IMM | ✅ IMM primero, fallback STM |
| `gtfsImporter.ts` | ✅ Cron semanal lunes 03:00 UTC |
| `gtfs_timetable` collection | ✅ 1361 docs — horarios completos |
| `otpEngine.ts` | ✅ OTP cron 10min + HTTP computeOtpNow |
| DRO matrix corridor_overlap | ✅ 1850 pares cross-operador |
| `hrrEngine.ts` + HrrDashboard | ✅ HRR cron 10min, sparklines, mapa |
| `seatKmCalculator.ts` + SeatKmDashboard | ✅ 30.2M seat-km, 243 corredores, 4 empresas |
| Login obligatorio | ✅ DEMO_MODE=false activo |

---

## 📋 PRÓXIMO PASO INMEDIATO

### 1. OTP 55%↔100% oscillation (investigación backend)
Hipótesis: `complianceAlertsTick` marca EN_TIEMPO cuando no hay boletín programado.
Fix: si no hay horario → dejar `estadoCumplimiento = null`, no 'EN_TIEMPO'.
Archivos: `functions/src/complianceAlertsTick.ts` + `functions/src/otpEngine.ts`.

### 2. Corridor Map UCOT shapes
`shapes_cross_operator` tiene 0 shapes para agencyId='70'.
Verificar que el shape builder corre con empresa 70.

---

## ⚠️ Backlog

1. **OTP oscillation** — investigar `complianceAlertsTick.ts` (ver arriba)
2. **Corridor Map UCOT** — shapes agencyId=70 faltantes
3. **Consumir gtfs_calendar en UI** — hábil/sáb/dom en Navegador
4. **Fix GTFS agencyId=0** — 8 shapes con agencyId='0' (L12/L31/L32)
5. **APK Android** — actualizar con build actual
6. **Calibrar capacidades flota** — datos oficiales STM para CAPACITY_BY_AGENCY
7. **Seat-km sábado/domingo** — svcType param al cron

---

## Bugs conocidos no críticos

- `regresionOLS.test.ts`: 4 tests fallan (outlier en tendenciaOLS) — pre-existente
- 8 shapes GTFS con `agencyId: '0'` — líneas L12/L31/L32
- OTP 55%↔100% oscillation — DiagnosticoCumplimiento fuera del flujo principal
- Índice compuesto `corridor_overlap` (sameEmpresa+pctAInB) aún construyendo en Firestore — workaround activo
- AuthContext "INT #----" durante carga — cosmético, se resuelve al cargar el perfil

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
| `GET /seatKmSnapshotQuery` | `us-central1-ucot-gestor-cloud.cloudfunctions.net/seatKmSnapshotQuery` | ✅ |
| `hrrTick` (cron) | cada 10 min | ✅ |
| `seatKmCalculatorCron` (cron) | diario 6am Montevideo | ✅ |
