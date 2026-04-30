# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

**Última actualización:** 2026-04-29 23:55 — GTFS oficial importado (1080 shapes, 4 empresas)

---

## ✅ ESTADO: GTFS OFICIAL EN PRODUCCIÓN — SHAPES CROSS-EMPRESA

### Lo que se completó en esta sesión

| Feature | Estado | Detalle |
|---|---|---|
| `immBusesLive` Cloud Function | ✅ Deployada | GPS enriquecido 4 empresas, ~996 buses |
| `immParadasList` Cloud Function | ✅ Deployada | 4938 paradas con lat/lng, cache 30 min |
| Fleet Monitor — fuente IMM | ✅ Live | IMM primero, fallback STM |
| Fleet Monitor — badges enriquecidos | ✅ Live | velocidad, ♿ piso bajo, ❄ AC, ⚡ eléctrico |
| Fleet Monitor — toggle Paradas | ✅ Live | Activa 4938 markers en el mapa |
| Fleet Monitor — panel ETA | ✅ Live | Click en parada → próximos arrivos cross-empresa |
| `FleetEtaPanel.tsx` | ✅ Committed | Componente panel ETA con badges por empresa |
| DEMO_MODE (sin auth) | ✅ Activo | `PrivateRoute.tsx` DEMO_MODE=true — 2h demo window |
| Auto-reload deshabilitado | ✅ Activo | 3 mecanismos pausados para la demo |
| **`gtfsImporter.ts`** | ✅ **Deployado** | GTFS oficial IMM → shapes_cross_operator |
| **GTFS shapes en Firestore** | ✅ **1080 shapes** | UCOT:105, CUTCSA:784, COME:48, COETC:130, STM:13 |

### Datos en vivo (verificado 2026-04-29)

| Recurso | Valor |
|---|---|
| Buses activos (todas las empresas) | ~996 (UCOT 100, CUTCSA 628, COME 95, COETC 173) |
| Paradas disponibles | 4938 |
| Shapes GTFS escritas | 1080 |
| Líneas GTFS procesadas | 319 |
| Fuente GPS | API oficial IMM (enriquecida) |
| Fuente shapes | GTFS oficial (semanal) + GPS shapeBuilder (horario, fallback) |

### APIs deployadas

| Endpoint | URL | Estado |
|---|---|---|
| `GET /immBusesLive?empresa=all` | `cloudfunctions.net/immBusesLive` | ✅ |
| `GET /immParadasList` | `cloudfunctions.net/immParadasList` | ✅ 4938 paradas |
| `GET /immEta?busstopId=X&lines=Y` | `cloudfunctions.net/immEta` | ✅ |
| `POST /gtfsImportRun` | `cloudfunctions.net/gtfsImportRun` | ✅ |
| `GET /gtfsDebug` | `cloudfunctions.net/gtfsDebug` | ✅ |
| `gtfsImportTick` (cron) | lunes 03:00 UTC | ✅ |

---

## ⚠️ PENDIENTE POST-DEMO

Cuando se cierre la ventana de demo (2 horas desde el momento en que Jonathan compartió el link):

### 1. Re-habilitar autenticación
Archivo: `frontend/src/components/PrivateRoute.tsx` línea 4  
Cambiar: `const DEMO_MODE = true;` → `const DEMO_MODE = false;`

### 2. Re-habilitar auto-reload de versión
Tres archivos, descomentando la línea `window.location.reload()`:
- `frontend/src/utils/appVersion.ts` línea 41 — cambiar el `console.log` a `window.location.reload()`
- `frontend/src/hooks/useVersionCheck.ts` línea 35 — descomentar `window.location.reload()`
- `frontend/src/utils/swRegistration.ts` líneas 26-31 — descomentar el bloque `controllerchange`

---

## 📋 PRÓXIMO PASO INMEDIATO

### Verificación visual en producción (pendiente)

Navegar a: `https://ucot-gestor-cloud.web.app` → Radar de Flota

1. Badge **"IMM OFICIAL"** aparece junto a la hora de actualización
2. KPIs muestran ~996 buses totales en sistema
3. Botón **"Paradas"** aparece en los controles del header
4. Al activar Paradas + zoom >= 13: aparecen 4938 puntos grises
5. Al clickear una parada: panel ETA con próximos buses cross-empresa
6. Panel ETA muestra minutos de arribo y badges ♿ ❄ ⚡

Verificar también shapes en mapa (si el mapa de líneas usa shapes_cross_operator):
- Abrir "Análisis de Competencia" o "ShadowRadar"
- Las líneas deben tener trazados más precisos (GTFS oficial vs GPS aproximado)

---

## 🔲 Backlog priorizado

1. **v2 HRR en vivo** — headway real en tramo compartido (diferenciador clave para pitch CUTCSA)
2. **Dashboard seat-km market share** — v3, cross-operador por corredor
3. **APK Android** — actualizar con build actual
4. **Horarios oficiales desde GTFS** — stop_times.txt → schedules para competidores (CUTCSA, COME, COETC)
5. **Badge "IMM Conectado"** en admin/sistema

---

## Bugs conocidos no críticos

- `regresionOLS.test.ts`: 4 tests fallan (outlier en tendenciaOLS) — pre-existente
- `monitoring.ts` warning Rollup — pre-existente, no afecta runtime

---

## Decisiones técnicas de esta sesión

- **Fuente GPS primaria**: IMM oficial OAuth → `immBusesLive`, fallback a STM-online (`/api/positions`).
- **Lazy loading de paradas**: 4938 paradas cargan solo al activar toggle, cacheadas en estado React.
- **Zoom-aware rendering**: paradas solo renderizan a zoom >= 13.
- **ETA lines pasadas dinámicamente**: hasta 30 líneas del GPS live actual, sin mapeo estático.
- **GTFS agency cross-reference**: el GTFS IMM publica todo bajo `STM-MVD` sin separar empresas. Se cruza con `shapes_cross_operator` GPS (que sí tiene agencyId) para etiquetado correcto. 13 líneas sin GPS previo quedan como `agencyId: '0'` (STM genérico).
- **GTFS como inicial, GPS como refinamiento**: GTFS cubre el 100% de líneas desde el día 1. El shapeBuilder GPS horario refina los recorridos con datos reales. Si la API IMM cae, ambos siguen activos en Firestore.
- **Cache paradas 30 min en CDN**: `/immParadasList` tiene `Cache-Control: public, max-age=1800`.
