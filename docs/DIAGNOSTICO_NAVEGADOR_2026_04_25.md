# Diagnóstico Navegador Tráfico — 2026-04-25

> Auditoría funcional en producción de `https://ucot-gestor-cloud.web.app/dashboard/traffic/navigation`
> Realizada con Chrome MCP, usuario `superadmin / SuperAdminInt #329`.
> Build inspeccionado: `index-Bgd6W4Lo-1777146824778.js` (build 21916064 · 2026-04-25 19:53)

---

## Resumen ejecutivo

El módulo Navegador renderiza UI pero está funcionalmente vacío para el usuario:
mapa sin polilínea, sin marcadores de paradas, sin GPS de buses en vivo. La lista
de paradas en el panel derecho muestra nombres, pero ninguna parada aparece
georreferenciada en el mapa porque todas tienen `lat=0, lng=0`. Además se
observa un error de permisos de Firestore en cada cambio de línea.

Severidad: **alta**. El módulo está en sidebar visible para los roles
`ADMIN, TRAFFIC, LISTERO, DRIVER, CONDUCTOR` y entrega información engañosa
(parece que está cargando, pero nunca completa).

---

## Bugs encontrados (priorizados)

### BUG 1 · Permisos Firestore para `desvios_guardados` — CRÍTICO

| Campo | Valor |
|---|---|
| Síntoma | Console: `FirebaseError: Missing or insufficient permissions.` cada vez que se selecciona una línea. Origina desde `[desviosService] Error escuchando desvios`. |
| Archivo afectado | `firestore.rules` (archivo crítico §10 — exclusivo Code) |
| Causa raíz | `frontend/src/services/desviosService.ts:26` define `const COL = 'desvios_guardados'` y abre listener `onSnapshot` sobre esa colección. `firestore.rules:443` solo declara reglas para `desvios_reportados`. La colección `desvios_guardados` cae al deny default. |
| Impacto | (a) console error en cada navegación; (b) banner de desvíos no se actualiza en tiempo real; (c) contador de desvíos en el badge nunca se refresca. |
| Fix necesario | Agregar bloque de reglas en `firestore.rules` antes del default deny: read autenticado, create/update solo `isTrafficOrAdmin()`, delete prohibido. |

```
// Bloque a insertar después de la regla de desvios_reportados
match /desvios_guardados/{document=**} {
  allow read: if isAuthenticated();
  allow create: if isTrafficOrAdmin();
  allow update: if isTrafficOrAdmin();
  allow delete: if false;
}
```

---

### BUG 2 · Recorrido y paradas vacíos sin feedback al usuario — CRÍTICO UX

| Campo | Valor |
|---|---|
| Síntoma | Para todas las líneas UCOT probadas (300a, 306a) el mapa muestra Montevideo entero sin polilínea ni paradas. La lista de paradas a la derecha muestra **nombres** pero todas tienen `lat=0, lng=0`. |
| Archivo afectado | `frontend/src/pages/traffic/NavigationModule.tsx` (1307 líneas — §10 prohíbe edits >20 líneas desde Cowork). |
| Evidencia (DevTools) | Línea 300a: `recorridoLen=0`, `paradasValidas=0` aunque `paradasLen=8`. Línea 306a igual. |
| Causa raíz 1 | Datos en Firestore `lineas_ucot` no tienen `recorrido` poblado y las paradas guardadas tienen coordenadas (0,0). |
| Causa raíz 2 | El auto-sync (NavigationModule.tsx:309-322) llama a `syncLineaFromAPI` que pega contra `https://us-central1-ucot-gestor-cloud.cloudfunctions.net/montevideoProxy?endpoint=transporteRest/...`. Probado en consola del browser: **devuelve `{error: "Request failed with status code 403"}`**. Coherente con CLAUDE.md§"No usar (devuelven 403/bloqueado): api.montevideo.gub.uy/api/publictransport". |
| Causa raíz 3 | El componente NO tiene empty-state intermedio para el caso `linea !== null && (recorrido.length === 0 \|\| paradas.every(p => !p.lat))`. Solo se muestra "Sin coordenadas" cuando `linea === null && hitosTeoricos.length > 0` (línea 1000 del módulo). |
| Impacto | Usuario ve mapa de Montevideo en blanco, lista de paradas con nombres, sin entender qué falta. Botón "Actualizar datos" gira pero no cambia nada. |

**Fix corto plazo (insertar entre líneas 1011 y 1012 de NavigationModule.tsx):**

```tsx
) : selectedCodigo && linea && (
    linea.recorrido.length === 0 ||
    linea.paradas.every((p) => p.lat === 0 && p.lng === 0)
) ? (
  <div className="w-full h-full min-h-[300px] bg-slate-800 rounded-xl border border-amber-700/50 flex flex-col items-center justify-center p-6 text-center">
    <AlertTriangle className="w-12 h-12 text-amber-500 mb-3" />
    <p className="text-amber-200 font-medium">
      Esta línea aún no tiene shape ni paradas georreferenciadas
    </p>
    <p className="text-slate-400 text-sm mt-2 max-w-md">
      La sincronización con STM API está temporalmente fuera de servicio (endpoint
      legacy bloqueado por la IMM). Las paradas se muestran a la derecha con sus
      nombres pero sin coordenadas.
    </p>
    <p className="text-slate-500 text-xs mt-3">
      Próxima migración: cargar shapes desde el feed GTFS importado a
      <code className="mx-1 px-1 py-0.5 rounded bg-slate-900">shapes_cross_operator</code>.
    </p>
  </div>
) : (
```

**Fix largo plazo (otro sprint):** reemplazar `syncLineaFromAPI` (proxy STM 403) por carga desde `shapes_cross_operator` — la misma fuente que ya usan los demás operadores en `linesService.ts:115-180`. Eso unifica el path de datos para los 4 operadores.

---

### BUG 3 · Filtro hardcodeado de líneas 317/371/379 — DEUDA TÉCNICA

| Campo | Valor |
|---|---|
| Archivo | `frontend/src/pages/traffic/NavigationModule.tsx:206` |
| Código actual | `if (/^(317|371|379)[a-z]?$/i.test(String(item.codigo))) return false;` |
| Por qué importa | (a) §10 política cross-operador: nada hardcoded por línea; (b) si esas líneas existen en Firestore el operador debería verlas — el empty-state del Bug 2 ya las maneja sin necesidad de esconderlas; (c) sin documentación inline que explique por qué se ocultan, es código huérfano. |
| Fix | Eliminar la línea 206 (1 línea). |

---

### BUG 4 · Lista de líneas UCOT incompleta (8 líneas base) — DATOS

| Campo | Valor |
|---|---|
| Síntoma | Dropdown "Línea" para empresa UCOT muestra solo 8 códigos base (300, 306, 316, 328, 329, 330, 370, 396) y 7 códigos de competencia (103, 110, 128, 169, 185, 505, 522). UCOT real opera **decenas** de líneas. |
| Archivo | `frontend/src/services/ucotLinesService.ts:39-49` (`LINEAS_UCOT_BASE`) — array de 8 códigos. |
| Causa | La lista está hardcodeada y limitada a las que tienen ID verificado. Líneas reales adicionales no aparecen. |
| Impacto | Conductor que opera línea fuera del catálogo no puede iniciar viaje GPS. |
| Fix | (a) cargar el catálogo desde Firestore `lineas_ucot` directamente, sin hardcoded base; (b) o sincronizar contra GTFS `routes.txt` cuando esté importado. **Decisión de Jonathan**: priorizar contra otros pendientes. |

---

### BUG 5 · Calidad de código — NavigationModule.tsx fuera de límite

| Campo | Valor |
|---|---|
| Archivo | `frontend/src/pages/traffic/NavigationModule.tsx` — 1307 líneas |
| CONVENCIONES.md §5 | Página React: máximo 250 líneas. NavigationModule supera el límite **5x**. |
| Refactor sugerido | Mover a `features/navigation/` con: `pages/traffic/NavigationPage.tsx` (shell <250L) + `features/navigation/components/{LineSelector,NavigationHUD,TarifarioModal,LineEditor,DesviosBanner}.tsx` + `features/navigation/hooks/{useGpsTracking,useTarifas,useLineSelection}.ts`. |
| Cuándo | No bloquea este fix; documentado como deuda. Hacerlo en próximo sprint dedicado. |

---

### BUG 6 · Indicador "LENTO" parpadea al cargar sin auth — POLISH

| Campo | Valor |
|---|---|
| Síntoma | Al cargar la página aparece chip "LENTO" en esquina inferior izquierda durante 1-2 segundos. |
| Origen | `frontend/src/services/ConnectivityGuard.ts` + render en `DashboardLayout.tsx`. |
| Por qué se ve | Boot Check inicia, después detecta "No User" y se rinde. Pero el chip se renderiza brevemente. |
| Fix | Esconder chip mientras `auth` aún no resolvió (`!user`). Out of scope para este fix; abrir issue separado. |

---

## Verificación funcional realizada

| Paso | Resultado |
|---|---|
| Navegar a `/dashboard/traffic/navigation` con auth válida | OK — header, sidebar, controles renderizan |
| Selector Empresa UCOT/CUTCSA/COME/COETC | OK — selector funciona |
| Selector Línea + Sentido/Destino | OK funcionalmente; **catálogo limitado** (Bug 4) |
| Mapa Leaflet renderiza | OK |
| Polilínea de recorrido | **FALLA** — `pathDLen=4` (vacío). Bug 2. |
| Marcadores de paradas | **FALLA** — `markersOnMap=0`. Bug 2. |
| Botón "Actualizar datos" | UI gira pero proxy STM 403; sin feedback al usuario. Bug 2. |
| Botón "Desvíos" abre panel | OK (panel renderiza "Sin desvíos configurados") |
| Listener `desvios_guardados` | **FALLA** — Firestore deny. Bug 1. |
| Console errors | 1 inicial + 1 por cada cambio de línea — todos `Missing or insufficient permissions`. |
| Mobile viewport (resize 390x844) | El window resize de Chrome MCP no propaga a `window.innerWidth` en este entorno; verificación mobile queda **pendiente para Code en navegador real**. |

---

## Orden lista para Claude Code

Todos los fixes a continuación se aplican desde Claude Code (Windows nativo) por
estar (a) en archivos críticos compartidos (`firestore.rules`) o (b) en archivos
>500 líneas (`NavigationModule.tsx`) — ambos prohibidos para Cowork por §10.

### Paso 1 — Fix Bug 1 (Firestore rules)

Editar `firestore.rules` insertando el bloque de `desvios_guardados` justo
después del bloque de `desvios_reportados` (después de la línea 448):

```
// ============================================================
// DESVIOS GUARDADOS — overlays de ruta alternativa por línea
// (los gestiona el módulo Navegador). Lectura autenticada,
// escritura solo TRAFFIC/ADMIN, no se borran (audit trail).
// ============================================================
match /desvios_guardados/{document=**} {
  allow read: if isAuthenticated();
  allow create: if isTrafficOrAdmin();
  allow update: if isTrafficOrAdmin();
  allow delete: if false;
}
```

Deploy: `firebase deploy --only firestore:rules`.

### Paso 2 — Fix Bug 3 (filtro hardcoded)

En `frontend/src/pages/traffic/NavigationModule.tsx` eliminar la línea 206:

```diff
-        if (/^(317|371|379)[a-z]?$/i.test(String(item.codigo))) return false;
```

### Paso 3 — Fix Bug 2 (empty-state explicativo)

En `frontend/src/pages/traffic/NavigationModule.tsx`, sección de render del
mapa (alrededor de la línea 1011), agregar una rama intermedia entre el caso
`!linea && hitosTeoricos.length > 0` y el caso default `<RouteMap />`. Insertar
entre línea 1011 y 1012:

```tsx
) : selectedCodigo && linea && (
    linea.recorrido.length === 0 ||
    linea.paradas.every((p) => p.lat === 0 && p.lng === 0)
) ? (
  <div className="w-full h-full min-h-[300px] bg-slate-800 rounded-xl border border-amber-700/50 flex flex-col items-center justify-center p-6 text-center">
    <AlertTriangle className="w-12 h-12 text-amber-500 mb-3" />
    <p className="text-amber-200 font-medium">
      Esta línea aún no tiene shape ni paradas georreferenciadas
    </p>
    <p className="text-slate-400 text-sm mt-2 max-w-md">
      La sincronización con STM API está temporalmente fuera de servicio (endpoint
      legacy bloqueado por la IMM). Las paradas se muestran a la derecha con sus
      nombres pero sin coordenadas.
    </p>
    <p className="text-slate-500 text-xs mt-3">
      Próxima migración: cargar shapes desde el feed GTFS importado a
      <code className="mx-1 px-1 py-0.5 rounded bg-slate-900">shapes_cross_operator</code>.
    </p>
  </div>
) : (
```

### Paso 4 — Verificación post-fix (Chrome o Playwright)

1. `npm run build` en `frontend/` — exit 0 sin warnings.
2. `bash scripts/check_integrity.sh` — exit 0.
3. `firebase deploy --only firestore:rules,hosting`.
4. Navegar a `/dashboard/traffic/navigation` con cuenta SUPERADMIN:
   - Console: cero errores `Missing or insufficient permissions`.
   - Selector línea 300 → empty-state ámbar visible: "Esta línea aún no tiene shape...".
   - Selector línea 300 → cambiar a 306 → empty-state se mantiene visible (no cuelga).
   - Click "Desvíos" → panel abre, "Sin desvíos configurados" — sin error en consola.
   - Sidebar → otros 3 módulos abren sin regresión (ShadowRadar, OTPDashboard, FleetMonitor).
5. Mobile viewport (DevTools 390x844): scroll horizontal = 0, controles legibles.

### Paso 5 — Commit

```
fix(navegador): corregir permisos desvios_guardados + empty-state shape

- Agrega regla Firestore para `desvios_guardados` (faltaba; cada cambio de
  línea generaba `Missing or insufficient permissions` en consola).
- Empty-state ámbar cuando la línea seleccionada tiene recorrido vacío o
  paradas con (0,0). Antes se mostraba mapa de Montevideo "en blanco" sin
  feedback. Issue conocido: proxy STM API devuelve 403 (endpoint deprecado);
  pendiente migración a shapes_cross_operator.
- Quita filtro hardcoded de líneas 317/371/379 (no documentado, contradice
  política cross-operador §10).

Verificado en producción: console limpia, empty-state visible, sidebar OK.

Refs: docs/DIAGNOSTICO_NAVEGADOR_2026_04_25.md
```

---

## Pendientes que NO se cierran con este fix

1. **Bug 4** — Catálogo UCOT limitado a 8 códigos base. Decisión de Jonathan.
2. **Bug 5** — Refactor de NavigationModule.tsx a `features/navigation/`. Próximo sprint.
3. **Bug 6** — Chip "LENTO" parpadea pre-auth. Issue separado.
4. **Migración shapes**: reemplazar `syncLineaFromAPI` (proxy STM 403) por
   carga desde `shapes_cross_operator`. Sprint 2/3.
5. **Verificación mobile real** en Code (Chrome MCP de Cowork no propaga
   resize a `innerWidth`).
