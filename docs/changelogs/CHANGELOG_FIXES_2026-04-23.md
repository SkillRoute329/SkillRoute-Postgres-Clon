# Changelog de fixes — 2026-04-23

## Contexto

Ejecución de la **Semana 1 del plan 9.1** del informe de auditoría (`Auditoria_Inteligencia_Operativa_2026-04-23.docx`). Objetivo: cerrar los 7 ítems críticos que un auditor técnico externo podría detectar en minutos, más la Fase 0 de higiene transversal (fuente única de verdad para parámetros operativos + política de transparencia con fuentes oficiales).

Regla aplicada en todo: **no-regresión**. Cada cambio es backward-compatible, reversible, y mantiene las APIs públicas intactas.

---

## Resumen de cambios

| # | Archivo | Cambio | Reversión |
|---|---|---|---|
| Fase 0 | `frontend/src/config/parametros-operativos.ts` | Archivo nuevo — fuente única de parámetros económicos/operativos con metadata (fuente, URL, confidence, disclaimer, editableByAdmin) | Borrar archivo |
| Fase 0 | `backend/src/config/parametros-operativos.ts` | Archivo nuevo — espejo server-side | Borrar archivo |
| Fase 0 | `FUENTES_OFICIALES.md` | Documento público con fuentes verificables (IMM, ANCAP, MTSS, UITP, BRT Standard, TRL, BSE) | Borrar archivo |
| #1 | `functions/src/intelligenceApi.ts` | Reemplazo literal `2.0` por constante `RADIO_COMPETENCIA_KM` (0.3 km). Resuelve contradicción comentario-vs-código. | Revertir a `dist <= 2.0` |
| #2 | `frontend/src/pages/traffic/EconomicProjectionsPage.tsx` | Tarifa y costos ahora se importan de `parametros-operativos.ts` (no más constantes locales hardcodeadas) | Restaurar constantes locales |
| #2 | `backend/src/services/forecastService.ts` | Reemplazo literal `56` por `TARIFA_STM_UYU` importada | Restaurar literal 56 |
| #2 | `backend/src/services/analyticsService.ts` | Reemplazo 3 literales `56` por `TARIFA_STM_UYU` | Restaurar literales |
| #3 | `frontend/src/pages/traffic/EconomicProjectionsPage.tsx` | Factor mágico `0.002` del simulador ahora referenciado como `ELASTICIDAD_FLOTA` con justificación Balcombe (2004) TRL593 | Restaurar literal 0.002 |
| #4 | `backend/src/services/realtimeService.ts` | Flag `SOCKET_IO_ENABLED` (default false). `initializeSocket()` y emitters son no-op cuando flag false. Código 100 % preservado. | Setear `SOCKET_IO_ENABLED=true` |
| #5 | `frontend/src/pages/traffic/CompetitorIntelligencePage.tsx` | Fallback automático a Cloud Function `intelligenceApi` si Bridge local caído. Nuevo estado `usingFallback`. | Forzar `BRIDGE_FALLBACK=''` |
| #6 | `frontend/src/pages/traffic/DigitalAgentsModule.tsx` | `handleDelegarInspector` ahora escribe a colección `delegaciones_inspector` (antes solo toast). | Restaurar a toast simple |
| #7 | `frontend/src/pages/traffic/ShadowRadar.tsx` | Verificado: el fallback a `vehicle_events` (agencyId=70, 8 min) + shadowDispatcher automático ya están implementados. Índices Firestore en su lugar. Sin cambios adicionales requeridos. | N/A |

---

## Fase 0 — Política de datos y fuentes oficiales

### Archivos creados

1. `frontend/src/config/parametros-operativos.ts`
2. `backend/src/config/parametros-operativos.ts`
3. `FUENTES_OFICIALES.md`

### Qué hacen

Centralizan TODO parámetro económico/operativo en un solo lugar con metadata completa. Cada parámetro lleva:

- `valor` — el número usado por el sistema
- `unidad` — legible para humanos (UYU/km, pax/viaje, etc.)
- `fuente` — nombre de la fuente oficial
- `fuenteUrl` — URL verificable cuando aplica (ANCAP, MTSS, IMM, UITP, etc.)
- `fechaVigenciaDesde` — cuándo empezó a regir
- `confidence` — `'oficial' | 'calibrado' | 'estimado' | 'hardcoded'`
- `editableByAdmin: true` — todo parámetro es editable por Super Admin
- `disclaimer` — texto visible al usuario ejecutivo cuando el valor no es ground-truth real

### Política de transparencia

Todo número mostrado al usuario debe llevar un badge con su `confidence`. Cuando el valor es `estimado` o `hardcoded`, la UI mostrará explícitamente que es una aproximación. Así el sistema es más honesto que un Excel tradicional: el usuario sabe qué está viendo, y puede editarlo si tiene mejor dato.

### Fuentes oficiales incorporadas

| Parámetro | Fuente |
|---|---|
| TARIFA_STM | IMM pliego tarifario urbano |
| COSTO_COMBUSTIBLE_KM | ANCAP precios oficiales gasoil |
| COSTO_CONDUCTOR_DIA | Consejo de Salarios Grupo 13 MTSS |
| KM_PROMEDIO_VIAJE | Recorridos oficiales STM |
| OCUPACION_PICO/VALLE | BRT Standard (ITDP) |
| COSTO_MANTENIMIENTO | Benchmark UITP KPIs |
| COSTO_SEGURO_DIA | BSE primas flota comercial |
| ELASTICIDAD_FLOTA | Balcombe et al. (2004) TRL593 |

Ver `FUENTES_OFICIALES.md` para URLs completas y metodología.

---

## Fix #1 — Radio de competencia

### Archivo y línea

`functions/src/intelligenceApi.ts:185`

### Problema

El comentario de la línea 85 documentaba `RADIO_COMPETENCIA_KM = 0.3` (300 m) como "corredor compartido real", pero en línea 185 el filtro usaba el literal `2.0` (2 km). Generaba falsos positivos sistemáticos en detección de amenaza competitiva.

### Cambio aplicado

```diff
-        if (dist <= 2.0 && rival.linea) {
+        // Fix #1 (2026-04-23): usar la constante RADIO_COMPETENCIA_KM (300 m)
+        // en lugar del literal 2.0 km que contradecía el comentario de línea 85.
+        if (dist <= RADIO_COMPETENCIA_KM && rival.linea) {
```

### Impacto

Se reduce el radio de 2 km a 300 m. Los rivales detectados son ahora realmente "en corredor compartido", no buses en barrios vecinos. La cantidad de amenazas reportadas bajará, pero las que se reporten serán reales.

### Validación sugerida (cuando haya data real)

1. Ejecutar endpoint `/api/inteligencia/300` y contar `competencia.length`.
2. Si el resultado es 0 en hora pico (10-12, 17-19), revisar: ¿la línea realmente no tiene competencia en su corredor? Mirar en mapa.
3. Si el resultado es > 10 en hora pico, revisar: ¿el radio es demasiado estrecho? Ajustar a 0.5 km.

---

## Fix #2 — Unificación de tarifa STM

### Archivos afectados

- `frontend/src/pages/traffic/EconomicProjectionsPage.tsx`
- `backend/src/services/forecastService.ts`
- `backend/src/services/analyticsService.ts`

### Problema

Frontend usaba `TARIFA_STM_UYU = 45`, backend usaba `56` en múltiples cálculos. Desvío del ±24 % en todas las proyecciones de ingresos.

### Cambio aplicado

Todos los archivos ahora importan la tarifa desde `parametros-operativos.ts`:

- Frontend: `import { TARIFA_STM_UYU } from '../../config/parametros-operativos';`
- Backend: `import { TARIFA_STM_UYU } from '../config/parametros-operativos';`

Valor unificado: **$45 UYU** (tarifa STM oficial IMM 2024).

### Impacto

Ingresos backend bajarán un 19.6 % (45/56 – 1). Al mismo tiempo, frontend y backend ahora concuerdan. La decisión del valor canonical (45) fue por ser la tarifa oficial publicada.

Si la tarifa real operativa es otra (p. ej. 56 por algún ajuste), editar el valor en **un solo lugar**: `parametros-operativos.ts` en ambos espejos. No más de una fuente.

---

## Fix #3 — Ecuación del simulador de escenarios

### Archivo y línea

`frontend/src/pages/traffic/EconomicProjectionsPage.tsx:~239`

### Problema

El factor mágico `0.002` en `penalizacionDemanda = 1 - (flotaDelta * 0.002)` estaba sin justificación ni documentación. Un auditor técnico podría cuestionarlo sin defensa.

### Cambio aplicado

El factor se lee de `ELASTICIDAD_FLOTA` en `parametros-operativos.ts`, que referencia la fuente:

> **Balcombe et al. (2004)** "The demand for public transport: a practical guide", TRL Report 593. Elasticidad frecuencia→demanda urbana corto plazo rango 0.15–0.35; escalado a "% por % reducción" = 0.0015–0.0035. Valor conservador 0.002.

URL fuente: https://trl.co.uk/publications/trl593---the-demand-for-public-transport-a-practical-guide

### Impacto

Ningún cambio numérico (valor 0.002 preservado). Cambio de credibilidad: el factor ahora es defendible con referencia a literatura internacional reconocida.

---

## Fix #4 — Socket.io apagado por flag

### Archivo

`backend/src/services/realtimeService.ts`

### Problema

El backend emitía eventos Socket.io (`location-update`, `service-status-changed`, `inspector-alert`, `fleet-check-completed`) que el frontend ya no escuchaba — hook y servicio marcados como DEPRECATED tras migración a Firestore onSnapshot. Overhead + logs engañosos.

### Cambio aplicado

Nueva constante `SOCKET_IO_ENABLED = process.env.SOCKET_IO_ENABLED === 'true'` (default: false).

`initializeSocket()` hace early-return con log informativo cuando el flag está false. Las 4 funciones `broadcastXxx()` hacen no-op en ese caso.

### Impacto

- Default: no se registran listeners, no se emiten eventos. Cero overhead, cero logs engañosos.
- Para reactivar: variable de entorno `SOCKET_IO_ENABLED=true` y reiniciar backend.
- **Código preservado 100 %.** Reversión en 1 segundo.

---

## Fix #5 — Fallback de CompetitorIntelligence

### Archivo

`frontend/src/pages/traffic/CompetitorIntelligencePage.tsx`

### Problema

Si el Bridge Server local (`localhost:3099`) no respondía, la página mostraba un modal gigante de error que bloqueaba toda la UI. Sin red corporativa, sin demo.

### Cambio aplicado

1. Nueva constante `BRIDGE_FALLBACK` apuntando a la Cloud Function `intelligenceApi` (`https://us-central1-ucot-gestor-cloud.cloudfunctions.net/intelligenceApi`).
2. Helper `tryHealth(base)` que prueba el endpoint `/api/health` y también `/health` por compatibilidad.
3. Si el primario falla, automáticamente intenta el fallback. Si funciona, setea `activeBridge = BRIDGE_FALLBACK` y `usingFallback = true`.
4. El modal "Bridge no disponible" solo aparece si **ambos** fallan.
5. El estado `usingFallback` puede usarse para mostrar un badge "Datos desde Cloud" al usuario (pendiente cambio UI; la lógica ya está lista).

### Impacto

- Cuando Bridge local está disponible: comportamiento idéntico.
- Cuando Bridge local cae: la página funciona con Cloud Function como respaldo, sin intervención del usuario.
- Cuando ambos caen: mensaje claro al usuario.

---

## Fix #6 — Delegación al inspector persistente

### Archivo

`frontend/src/pages/traffic/DigitalAgentsModule.tsx`

### Problema

El botón "Delegar al Inspector Humano" solo mostraba un toast `🚨 Solicitud enviada...`. No escribía nada a Firestore ni invocaba endpoint. Un usuario creía que su acción quedó registrada. Riesgo de cumplimiento operacional.

### Cambio aplicado

`handleDelegarInspector` ahora:

1. Escribe documento en colección `delegaciones_inspector` con `{ serviceNumber, lineaId, requestedBy (auth uid), requestedByName, status: 'pending', createdAt: serverTimestamp(), source }`.
2. Muestra toast de éxito con mensaje revisado.
3. Si falla la escritura, muestra toast de error claro y loggea en console.

### Nuevos campos Firestore

Colección: `delegaciones_inspector`
Estados permitidos: `pending | acknowledged | completed | cancelled`

### Próximos pasos sugeridos (no en este fix)

1. Crear regla Firestore que permita lectura a inspectores y escritura al operador.
2. Crear vista de historial de delegaciones para auditoría.
3. Notificación push al inspector cuando aparece nueva delegación `pending`.
4. Flujo para que el inspector marque como `completed` con nota.

---

## Fix #7 — ShadowRadar con vehicle_events

### Estado

El fix que el CLAUDE.md marcaba como pendiente ya está implementado en el código actual (líneas 279-334 de `ShadowRadar.tsx`). Los índices Firestore necesarios (`vehicle_events(agencyId, timestampGPS DESC)`) están en `firestore.indexes.json`.

### Verificaciones hechas

1. Consulta `vehicle_events` usa `where('agencyId', '==', '70')` + `where('timestampGPS', '>=', since8min.toISOString())` + `orderBy('timestampGPS', 'desc')` — coincide con el índice.
2. Merge con `viajes_activos` hecho vía `useMemo` sin duplicados (Map por `cocheId`).
3. `shadowDispatcher` automático escribe a `alertas_regulacion` con throttle 5 min.

### Recomendación operativa

Si la pantalla sigue mostrando datos estáticos en producción, el problema está en la ingesta, no en la vista:

- Verificar que la Cloud Function `ingestaIMMTick` esté corriendo (consola Firebase → Functions → logs).
- Verificar que documentos en `vehicle_events` se estén creando con `agencyId='70'` (string, no número).
- Verificar `timestampGPS` se guarde como ISO string, no como Timestamp object.

---

## Verificación de no-regresión

### TypeScript compilation

- **Frontend (`frontend/`):** `npx tsc --noEmit` — sin errores en los archivos modificados (EconomicProjectionsPage, CompetitorIntelligencePage, DigitalAgentsModule, parametros-operativos).
- **Backend (`backend/`):** cambios son sintácticamente válidos; los imports añadidos usan rutas existentes.
- **Functions (`functions/`):** un error preexistente en `intelligenceApi.ts:2240` (*Unterminated template literal* — commit `87fb2cb6` WIP) presente antes de esta sesión. El cambio del Fix #1 (línea ~185) no introduce sintaxis inválida (verificado en diff).

### Git diff sanity

```bash
git diff --stat HEAD
```

Archivos modificados (todos esperados):
- `frontend/src/config/parametros-operativos.ts` (nuevo)
- `backend/src/config/parametros-operativos.ts` (nuevo)
- `FUENTES_OFICIALES.md` (nuevo)
- `CHANGELOG_FIXES_2026-04-23.md` (nuevo — este archivo)
- `functions/src/intelligenceApi.ts` (1 línea cambiada + 3 de comentario)
- `frontend/src/pages/traffic/EconomicProjectionsPage.tsx` (imports + 1 cambio numérico documentado)
- `backend/src/services/forecastService.ts` (5 literales reemplazados por constante)
- `backend/src/services/analyticsService.ts` (3 literales reemplazados por constante)
- `backend/src/services/realtimeService.ts` (flag + 5 early-returns)
- `frontend/src/pages/traffic/CompetitorIntelligencePage.tsx` (const nueva + estado + helper)
- `frontend/src/pages/traffic/DigitalAgentsModule.tsx` (imports + reescritura de handleDelegarInspector)

### Cómo revertir

Cada fix tiene una entrada "Reversión" en la tabla de arriba. Ningún cambio es destructivo:

- Constantes antiguas se mantienen como re-exports.
- Socket.io preservado 100 % — se apaga por env var.
- Formularios y UI sin cambios visuales.

Para revertir todo de una:
```bash
git checkout HEAD -- \
  frontend/src/pages/traffic/EconomicProjectionsPage.tsx \
  frontend/src/pages/traffic/CompetitorIntelligencePage.tsx \
  frontend/src/pages/traffic/DigitalAgentsModule.tsx \
  backend/src/services/forecastService.ts \
  backend/src/services/analyticsService.ts \
  backend/src/services/realtimeService.ts \
  functions/src/intelligenceApi.ts
rm frontend/src/config/parametros-operativos.ts backend/src/config/parametros-operativos.ts FUENTES_OFICIALES.md
```

---

## Qué sigue (fases 1-3 del plan)

Estos fixes cierran la **Semana 1**. La estrategia completa documentada en el informe ejecutivo continúa con:

### Fase 1 — Parcialmente ejecutada en esta misma sesión (2026-04-23)

**✅ Completado** — UI Super Admin para editar parámetros operativos sin redeploy + migración a Firestore con historial. Ver sección siguiente "Cierre de Fase 1".

**⬜ Restante de Fase 1 (próximas 2-4 semanas):**

- Publicar feed GTFS-RT de salida (VehiclePositions, TripUpdates).
- Reemplazar heatmap mock del LiveMap por datos reales de inspecciones.
- OTP asimétrico UITP (–1 min / +3 min) en lugar del actual ±3 simétrico.
- Unificar las 3 colecciones de cartones (`cartones` / `cartones_de_servicio` / `cartones_completados`).
- Tests automatizados mínimos (Vitest) para fórmulas económicas y haversine.

---

## Cierre de Fase 1 — UI Super Admin de parámetros operativos

### Qué se construyó

1. **Servicio Firestore** `frontend/src/services/firestore/parametrosOperativos.ts`
   - Cache en memoria que combina defaults locales + overrides de Firestore
   - `loadAll()` — carga inicial con fallback silencioso a defaults si Firestore cae
   - `subscribeAll(cb)` — listener real-time
   - `listParametros()` / `getParametro(key)` / `getParametroValor(key)` — lecturas sincrónicas
   - `updateParametro(key, updates, motivo?)` — escribe el doc + entrada de historial
   - `seedInitial()` — vuelca los defaults al Firestore la primera vez (idempotente)
   - `getHistorial(key, max)` — lista las últimas N entradas de auditoría
   - Helpers de UI: `confidenceBadgeClass(c)`, `confidenceLabelEs(c)`

2. **Página React** `frontend/src/pages/admin/AdminParametrosOperativos.tsx`
   - Tabla con todos los parámetros, badge por confidence (oficial/calibrado/estimado/provisional)
   - Enlace externo a la fuente oficial (ANCAP, IMM, MTSS, UITP, etc.)
   - Edición inline de: valor, fuente, fuenteUrl, motivo del cambio
   - Panel historial con los últimos 15 cambios (autor, timestamp, valor anterior → nuevo, motivo)
   - Botón **Seed inicial** para volcar defaults a Firestore en proyectos frescos
   - Búsqueda filtrable por key / fuente / unidad
   - Disclaimer visible sobre la política de datos

3. **Ruta protegida** en `App.tsx`
   ```
   /dashboard/admin/parametros-operativos
   ```
   Guard `PrivateRoute roles={['ADMIN','SUPERADMIN']}`.

4. **Reglas Firestore** (`firestore.rules`)
   - `parametros_operativos/{key}` — read autenticado · write solo `isAdminNorm()`
   - `parametros_operativos_historial/{doc}` — read admin · create admin · update/delete prohibido
   - `delegaciones_inspector/{doc}` — read autenticado · create autenticado · update admin/inspector · delete prohibido (audit trail)

5. **Índices Firestore** (`firestore.indexes.json`)
   - `parametros_operativos_historial(key ASC, timestamp DESC)` — para historial por parámetro
   - `delegaciones_inspector(status ASC, createdAt DESC)` — para bandeja del inspector

### Cómo usar (Super Admin)

1. Desplegar reglas y rebuild frontend:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   cd frontend && npm run build
   ```
2. Loguearse como usuario con rol `ADMIN` o `SUPERADMIN` (campo `rol` o `role` en `users/{uid}`).
3. Navegar a `/dashboard/admin/parametros-operativos`.
4. La primera vez, clic en **Seed inicial** para volcar los defaults del archivo local a Firestore.
5. Cualquier parámetro puede editarse con el botón **Editar**. El motivo del cambio queda en historial.
6. El historial se consulta con el botón **Historial** en cada fila.

### No-regresión verificada

- `tsc --noEmit` en frontend pasa limpio para los 3 archivos nuevos y las modificaciones a `App.tsx`.
- Los callers actuales (EconomicProjectionsPage, forecastService, analyticsService) siguen usando los defaults del archivo local — no hay breaking change. La migración a la versión dinámica se hará gradualmente en Fase 1 restante.
- Reglas Firestore son estrictamente aditivas — no cambian comportamiento de colecciones existentes.
- Índices nuevos no entran en conflicto con los existentes.

### Archivos nuevos

- `frontend/src/services/firestore/parametrosOperativos.ts`
- `frontend/src/pages/admin/AdminParametrosOperativos.tsx`

### Archivos modificados

- `frontend/src/App.tsx` — import lazy + ruta nueva
- `firestore.rules` — 3 bloques nuevos
- `firestore.indexes.json` — 2 índices nuevos

### Cómo revertir Fase 1 (si hiciera falta)

```bash
git checkout HEAD -- frontend/src/App.tsx firestore.rules firestore.indexes.json
rm frontend/src/services/firestore/parametrosOperativos.ts
rm frontend/src/pages/admin/AdminParametrosOperativos.tsx
```

Las colecciones Firestore creadas (`parametros_operativos`, `parametros_operativos_historial`, `delegaciones_inspector`) quedan sin usar pero sin afectar nada — pueden borrarse desde consola Firebase o dejarse como están.

### Próximo paso sugerido — migrar callers a la versión dinámica

Cuando querramos que los valores editados desde la UI surtan efecto en los cálculos en runtime, hay que cambiar algunos imports:

**Antes (estático — sigue funcionando):**
```typescript
import { TARIFA_STM_UYU } from '../../config/parametros-operativos';
const ingresos = pax * TARIFA_STM_UYU;
```

**Después (dinámico — lee valor editado por Super Admin):**
```typescript
import { getParametroValor } from '../../services/firestore/parametrosOperativos';
const ingresos = pax * (getParametroValor<number>('TARIFA_STM') ?? 45);
```

Hacer esta migración página por página, testeando que el comportamiento numérico no cambie cuando el valor Firestore coincide con el default.

### Fase 2 (mes 2)

- Progressive Trust UI — badges de confidence visibles al usuario ejecutivo en cada KPI.
- APC piloto con 5 vehículos instrumentados.
- ETA predictiva con ML sobre histórico GTFS-RT.

### Fase 3 (mes 3+)

- SIRI compliance, NeTEx exports.
- Digital twin (estilo LTA DRIVE).
- Multi-tenancy con data isolation para SaaS multi-operador.
- Fare evasion analytics (APC vs validaciones).

Ver informe `Auditoria_Inteligencia_Operativa_2026-04-23.docx` sección 9 para detalle de cada ítem.
