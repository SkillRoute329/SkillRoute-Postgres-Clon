# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

**Última actualización:** 2026-05-01 — Sprint pre-CUTCSA · P0 cerrados + seat-km deployado

---

## ✅ ESTADO: Demo path operativa para presentación lunes 5 mayo

### Lo que se completó en esta sesión (2026-05-01)

| Fix | Estado | Detalle |
|---|---|---|
| **CR-1 · CEO Dashboard crash** | ✅ En prod | `Map as MapIcon` → `MapPin as MapIcon` — elimina colisión bundle con `new Map()` |
| **Seat-km Market Share** | ✅ En prod | Cron + HTTP + dashboard + tab CorredoresHub |
| **HRR en vivo** | ✅ En prod | Sesión anterior |
| **Rebranding SkillRoute** | ✅ En prod | "Copiloto SkillRoute", "Iniciando SkillRoute…" |

### Estado de cada P0 del sprint (deadline: lunes 5 mayo 09:00)

| CR | Descripción | Estado | Detalle |
|---|---|---|---|
| CR-1 | CEO Dashboard `TypeError: re is not a constructor` | ✅ CERRADO | Fix deployado hoy |
| CR-2 | `road_alerts` permission-denied | ✅ CERRADO | Regla ya existía en firestore.rules |
| CR-3 | Índice `service_matrices` faltante | ✅ CERRADO | Ya en `firestore.indexes.json` y deployado |
| CR-4 | AuthContext "INT #----" durante carga | 🟡 MENOR | Cosmético transitorio — no bloquea demo |
| CR-5 | ServiceCategoryManager permission-denied | 🟡 MENOR | No está en el demo path |

### Verificación del demo path (estado por módulo)

| Módulo | Ruta | Estado para demo |
|---|---|---|
| Centro de Mando V7 | `/traffic/ceo` | ✅ LISTO (CR-1 fix) |
| Fleet Monitor | `/traffic/fleet-monitor` | ✅ LISTO |
| Inteligencia Cross-Op | `/traffic/corridor-intelligence` | ✅ LISTO |
| Radar Competencia | `/traffic/competitor-intelligence` | ✅ LISTO |
| Incidencias | `/traffic/incidents` | ✅ LISTO (UID fallback ya existía) |
| BRT 2027 | `/traffic/brt` | ✅ LISTO |
| CUTCSA Fleet Demo | `/traffic/cutcsa-fleet` | ✅ LISTO |

### Módulos a EVITAR en la demo (guion ya lo documenta)

| Ruta | Motivo |
|---|---|
| `/traffic/financiero` | Datos sintéticos ($17.640 en todas las líneas) |
| `/traffic/diagnostico-cumplimiento` | OTP oscila 55%↔100% (backend, pendiente investigación) |
| `/traffic/listero`, `/distribución` | Estado vacío sin datos del día |
| `/traffic/inspector-control` | Líneas con "EDO/OMETRO/UNKNOWN" |
| `/admin/asignacion-vehiculos` | Nombre conductor "2+00+0", rol "DRIVER" en inglés |
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
| DEMO_MODE | ✅ Activo — `PrivateRoute.tsx` DEMO_MODE=true |

---

## 📋 PRÓXIMO PASO INMEDIATO

### Verificación end-to-end del demo path (para Claude Code o Jonathan)

Abrir https://skillroute.web.app con DevTools abiertos y recorrer en orden:

1. `/dashboard/traffic/ceo` → debe cargar sin error rojo en consola. KPIs visibles.
2. `/dashboard/traffic/fleet-monitor` → mapa con ~1000+ markers, conteo buses en header.
3. `/dashboard/traffic/corridor-intelligence` → 824+ pares, balance UCOT visible.
4. `/dashboard/traffic/competitor-intelligence` → líneas con tier ALTA/MEDIA/BAJA.
5. `/dashboard/traffic/incidents` → incidencias con nombre conductor (no UID crudo).
6. `/dashboard/traffic/brt` → KPIs BRT 2027 en header, tabs funcionando.

Si algún módulo da error rojo en consola → escribir "## NOTA DE JONATHAN" en este archivo.

---

## ⚠️ PENDIENTE POST-DEMO

### 1. Re-deshabilitar autenticación
Archivo: `frontend/src/components/PrivateRoute.tsx` línea 4
Cambiar: `const DEMO_MODE = true;` → `const DEMO_MODE = false;`

### 2. OTP 55%↔100% oscillation (investigación backend)
Hipótesis: `complianceAlertsTick` o `otpEngine` marca EN_TIEMPO cuando no hay boletín.
Fix: en el backend, si no hay horario programado → dejar `estadoCumplimiento = null`, no 'EN_TIEMPO'.
Archivo a investigar: `functions/src/complianceAlertsTick.ts` + `functions/src/otpEngine.ts`.

### 3. Corridor Map UCOT shapes
`shapes_cross_operator` tiene 0 shapes para agencyId='70' en la vista del mapa.
Verificar que el shape builder corre con empresa 70 también.

---

## 🔲 Backlog post-presentación

1. **Consumir gtfs_calendar en UI** — mostrar hábil/sáb/dom en Navegador
2. **Fix GTFS agencyId=0** — 8 shapes con agencyId='0' (líneas L12/L31/L32)
3. **APK Android** — actualizar con build actual
4. **Calibrar capacidades flota** — datos oficiales STM para CAPACITY_BY_AGENCY
5. **Seat-km sábado/domingo** — svcType param al cron

---

## Bugs conocidos no críticos

- `regresionOLS.test.ts`: 4 tests fallan (outlier en tendenciaOLS) — pre-existente
- 8 shapes GTFS con `agencyId: '0'` — líneas L12/L31/L32, no afectan el Navegador
- OTP 55%↔100% oscillation — DiagnosticoCumplimiento fuera del demo path
- índice compuesto `corridor_overlap` (sameEmpresa+pctAInB) aún construyendo en Firestore — workaround activo (filtro en memoria en hrrEngine)

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
| `hrrTick` (cron) | cada 10 min | ✅ |
| `seatKmCalculatorCron` (cron) | diario 6am Montevideo | ✅ |
