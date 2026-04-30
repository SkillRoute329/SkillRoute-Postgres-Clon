# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

**Última actualización:** 2026-04-30 — routeLongName + gtfs_calendar + gtfs_fares deployados

---

## ✅ ESTADO: 3 FEATURES GTFS EN PRODUCCIÓN

### Lo que se completó en esta sesión (2026-04-30)

| Feature | Estado | Detalle |
|---|---|---|
| **routeLongName en shapes** | ✅ En prod | `gtfsImporter.ts` guarda `route_long_name` de GTFS en `shapes_cross_operator`; 1080 shapes actualizados |
| **Navegador labels con nombre real** | ✅ En prod | Dropdown muestra "100 — Pza.españa - V.farre" en vez de "100 · IDA" |
| **`gtfs_calendar` collection** | ✅ En prod | 140 docs — patrones hábil/sábado/domingo + vigencias por línea |
| **`gtfs_fares` collection** | ✅ Preparada | Cloud Function lista; IMM no publica fare_attributes.txt (0 tarifas normales para Uruguay) |
| **Reglas Firestore** | ✅ Deployadas | `gtfs_calendar` + `gtfs_fares` lectura pública |
| **Índices Firestore** | ✅ Deployados | agencyId+linea para gtfs_calendar; agencyIds+fareId para gtfs_fares |
| **Auto-reload re-habilitado** | ✅ En prod | `appVersion.ts`, `useVersionCheck.ts`, `swRegistration.ts` re-activados |
| **sw-reload-broadcast.js** | ✅ En prod | Fuerza `client.navigate()` en todos los tabs al activar nuevo SW |
| **version.json d627f1fe** | ✅ En prod | Build ID nuevo — todos los usuarios con cache vieja reciben reload automático |

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
| `navigationDataService.ts` | ✅ dual-docId lookup (underscore/GTFS primero, dash/legacy fallback) |
| Vacuous-truth bug fix | ✅ `linea.paradas.length > 0 &&` antes del `.every()` en NavigationModule.tsx |

---

## ⚠️ PENDIENTE POST-DEMO

### 1. Re-deshabilitar autenticación cuando termine la demo
Archivo: `frontend/src/components/PrivateRoute.tsx` línea 4  
Cambiar: `const DEMO_MODE = true;` → `const DEMO_MODE = false;`

> Nota: el auto-reload de versión ya está re-habilitado (fue deshabilitado temporalmente para la demo y ya fue re-activado en esta sesión).

---

## 📋 PRÓXIMO PASO INMEDIATO

### Verificación visual en producción (para Jonathan o Claude Code con browser)

1. Abrir https://ucot-gestor-cloud.web.app/dashboard/traffic/navigation
2. **Sin login** (DEMO_MODE=true) — las líneas deben cargar directamente
3. Seleccionar empresa "CUTCSA" → dropdown debe mostrar líneas tipo "100 — Pza.españa - V.farre"
4. Seleccionar línea → mapa debe dibujar el recorrido (205 puntos GPS para la 100)
5. Seleccionar empresa "UCOT" → verificar que también carga (~116 variantes)

Verificación adicional — calendario:
```
curl -s "https://firestore.googleapis.com/v1/projects/ucot-gestor-cloud/databases/(default)/documents/gtfs_calendar?pageSize=5"
```
Debe devolver 5 docs con campos `tieneHabil`, `tieneSabado`, `tieneDomingo`, `vigenciaDesde/Hasta`.

---

## 🔲 Backlog priorizado

1. **v2 HRR en vivo** — headway real en tramo compartido (diferenciador clave para pitch CUTCSA)
2. **Consumir gtfs_calendar en UI** — mostrar "opera hábil/sábado/domingo" en panel de línea del Navegador
3. **Dashboard seat-km market share** — v3, cross-operador por corredor
4. **Fix GTFS agencyId=0** — 8 shapes con agencyId='0' (líneas L12/L31/L32 de STM); no afectan el Navegador operativo
5. **APK Android** — actualizar con build actual
6. **Badge "IMM Conectado"** en admin/sistema

---

## Bugs conocidos no críticos

- `regresionOLS.test.ts`: 4 tests fallan (outlier en tendenciaOLS) — pre-existente
- `monitoring.ts` warning Rollup — pre-existente, no afecta runtime
- 8 shapes GTFS con `agencyId: '0'` y `empresa: 'STM'` — líneas L12/L31/L32 que el importer no pudo mapear a operador; no afectan el Navegador
- `gtfs_fares` vacío — el IMM no publica tarifas en el GTFS (Uruguay las regula centralmente via STM/IMM, no por línea)

---

## Decisiones técnicas de esta sesión

- **routeLongName en shapes**: se guarda directamente en `shapes_cross_operator` durante el import GTFS para que sea legible sin auth (en vez de cruzar con `imm_variantes` que es privada).
- **gtfs_calendar**: docId = `{agencyId}_{linea}` — cubre el caso de misma línea en diferentes empresas.
- **gtfs_fares vacío**: IMM no provee `fare_attributes.txt` — la Cloud Function ya está preparada para cuando lo hagan disponible.
- **Dual-docId lookup en navigationDataService**: intenta `agencyId_linea_direction` (GTFS/alta calidad) antes de `agencyId-linea-sentido` (legacy/baja calidad). El orden importa porque `-` (45 ASCII) < `_` (95 ASCII) en Firestore orderBy.

---

## APIs deployadas

| Endpoint | URL | Estado |
|---|---|---|
| `GET /immBusesLive?empresa=all` | `cloudfunctions.net/immBusesLive` | ✅ |
| `GET /immParadasList` | `cloudfunctions.net/immParadasList` | ✅ 4938 paradas |
| `GET /immEta?busstopId=X&lines=Y` | `cloudfunctions.net/immEta` | ✅ |
| `POST /gtfsImportRun` | `cloudfunctions.net/gtfsImportRun` | ✅ |
| `GET /gtfsDebug` | `cloudfunctions.net/gtfsDebug` | ✅ |
| `gtfsImportTick` (cron) | lunes 03:00 UTC | ✅ |
