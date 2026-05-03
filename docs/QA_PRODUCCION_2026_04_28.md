# Informe QA Producción — SkillRoute (https://ucot-gestor-cloud.web.app)

**Fecha:** 2026-04-28 · 20:30–20:45 UYT
**Build auditado:** `14b8722b · 2026-04-28 23:16`
**Sesión:** SuperAdmin (INT #329 · `329@ucot.internal`)
**Método:** Navegación funcional módulo a módulo, auditoría de consola, network y DOM real (sin pruebas locales).
**Cantidad de módulos cubiertos:** 22 de 22 listados en sidebar.

---

## ⚖️ Reglas vinculantes para resolver los hallazgos

Antes de tocar nada, leer y respetar:

1. **No agregar funciones nuevas.** Solo arreglar / optimizar lo existente.
2. **No-regresión (CLAUDE.md §11).** Cada commit debe pasar tests + tsc + integrity + verificación visual de 3 módulos pre-existentes (ShadowRadar, CartonManager, FleetMonitor, OTPDashboard).
3. **Cowork no edita archivos críticos compartidos** (CLAUDE.md §10). El listado: `App.tsx`, `intelligenceApi.ts`, `firestore.rules`, `useEmpresaPropia.ts`, `linesService.ts`, etc. → eso lo aplica Claude Code en Windows.
4. **UI siempre en español.** Cualquier string en inglés visible al usuario es bug y se corrige al primer toque del archivo.
5. **Cross-operador por diseño.** Si un H1 dice "CUTCSA" donde debería leer la empresa filtrada, es bug.
6. **Verificación en producción excluyente** (CLAUDE.md §12): el fix recién está cerrado cuando se confirma en https://ucot-gestor-cloud.web.app sin error de consola.

---

## 🔥 Hallazgos críticos (bloqueantes)

### CR-1 · Centro de Mando crashea con `TypeError: re is not a constructor`

- **Módulo:** Centro de Mando (`/dashboard/traffic/ceo`).
- **Síntoma:** RouteErrorBoundary captura el crash y muestra "Error en Módulo".
- **Stack (consola):**
  ```
  TypeError: re is not a constructor
    at CEODashboardV7-BTIeE1Iv-1777418217458.js:1:11934
    at Object.my [as useMemo] (vendor-react-DMtordag.js:8:56727)
    at Fs (CEODashboardV7-BTIeE1Iv.js:1:11856)
  ```
- **Probable causa:** dentro de un `useMemo`, se hace `new X()` donde `X` quedó tree-shaken o re-exportado mal. Patrón típico: import default vs named, o un `Map`/`Date`/clase utilitaria que el bundler renombró a `re` y no es constructor.
- **Archivo a auditar:** `frontend/src/pages/CEODashboardV7.tsx` (o el componente lazy-importado en esa ruta).
- **Fix sin regresión:** identificar el `useMemo` que llama `new` sobre algo importado, validar el import, agregar `if (!X) return null` defensivo. NO reescribir el dashboard.
- **Prioridad:** P0. Es la pantalla principal para directivos / pitch CUTCSA.

### CR-2 · Firestore `permission-denied` recurrente para `RoadAlertService.getAll`

- **Módulo:** Vista General (componente `Alertas Viales`, presente en TODAS las páginas como banner).
- **Síntoma:** Cada navegación dispara `FirebaseError: Missing or insufficient permissions` en consola. La UI lo enmascara mostrando "No hay alertas viales activas en este momento" — al usuario le parece feature, en realidad es fallo silenciado.
- **Probable causa:** colección `road_alerts` (o nombre similar) no tiene regla de lectura para rol SuperAdmin/Admin, o regla mal escrita.
- **Archivo a auditar:** `firestore.rules` + `frontend/src/services/RoadAlertService.ts`.
- **Fix sin regresión:** revisar regla de la colección, agregar `match /road_alerts/{id}` con `allow read: if isAdminNorm() || isTrafficOrAdmin();`. **NO** crear una nueva colección. **NO** silenciar el error con try/catch sin distinguir empty-result de permission-denied.
- **Prioridad:** P0. Banner tóxico que aparece en todas las pantallas.

### CR-3 · Firestore índice faltante para `service_matrices`

- **Módulo:** Planificación → Matriz de Servicio (pantalla en blanco).
- **Síntoma:** Consola pide:
  ```
  failed-precondition: The query requires an index.
  Create here: https://console.firebase.google.com/v1/r/project/ucot-gestor-cloud/firestore/indexes?...
  ```
  Campos: `empresaId` (ASC) + `createdAt` (DESC).
- **Fix sin regresión:** crear índice compuesto en `firestore.indexes.json` y deployar. NO cambiar la query del código.
- **Prioridad:** P0. La pestaña queda vacía sin indicio del fallo.

### CR-4 · `AuthContext` queda colgado en cache local

- **Síntoma:** después de un reload, el header muestra `INT #---- | SUPERADMIN` y "Hola, **SuperAdmin**" en lugar de "Hola, **Super**". El warning lo confirma: `[AuthContext] DB Profile no disponible tras retries; usando cache local: FirebaseError: Missing or insufficient permissions`. Tras un par de minutos sí se recupera, pero el primer minuto el usuario ve datos incompletos.
- **Probable causa:** el listener inicial de Firestore no respeta la regla de lectura del propio doc del usuario, o el retry está mal escalonado.
- **Archivo a auditar:** `frontend/src/context/AuthContext.tsx` (archivo crítico — Cowork no lo toca, lo edita Code) y la regla del doc `users/{uid}` en `firestore.rules`.
- **Fix sin regresión:** asegurar que `users/{uid}` permita `read: if request.auth.uid == uid` antes de cualquier otro chequeo. Mantener el cache local pero mostrar badge "Reconectando…" hasta que el DB profile llegue.
- **Prioridad:** P0. UX inicial degradada.

### CR-5 · ServiceCategoryManager: `permission-denied`

- **Módulo:** Planificación → Asignación de Servicios → "Asignaciones por Categoría".
- **Síntoma:** Consola: `[ServiceCategoryManager] Error loading services: FirebaseError: Missing or insufficient permissions.` UI dice "Sin categorías creadas — Crea categorías en Gestión de Flota → Categorías primero." (mensaje engañoso porque enmascara el permission-denied).
- **Fix sin regresión:** completar regla de `service_categories` en `firestore.rules`. Distinguir UI: "no hay categorías creadas" vs "sin permisos para leer categorías".
- **Prioridad:** P0.

---

## 🟧 Hallazgos altos (rompen flujo, no la app)

### AL-1 · Tabs UCOT/CUTCSA/COME/COETC son texto sin handler en Planificación

- **Pantalla:** Planificación → Gestor de Cartones.
- **Síntoma:** los 4 labels aparecen renderizados pero `[...buttons,a].filter(t==='UCOT')` devuelve 0. No son interactivos.
- **Fix:** envolverlos en `<button onClick={setEmpresa('UCOT')}>` o `<a href>`. Usar el mismo componente `EmpresaSelector` que ya funciona en Cumplimiento (`/diagnostico-cumplimiento`).
- **Prioridad:** P1.

### AL-2 · Botón "Editar" en Planificación no responde

- **Pantalla:** Planificación → Gestor de Cartones (146 cartones, 146 botones Editar).
- **Síntoma:** click no navega ni abre modal. Solo `<button>` sin `onClick` registrado.
- **Fix:** apuntar a `/dashboard/traffic/cartons/edit/{lineId}/{serviceId}` o al modal existente. NO crear pantalla nueva.
- **Prioridad:** P1.

### AL-3 · H1 hardcoded "CUTCSA" en pantallas que muestran datos UCOT (4 módulos)

| Módulo | H1 actual | Debería leer |
|---|---|---|
| Planificación | `Gestor de Cartones — CUTCSA` | empresa filtrada / "Sistema completo" |
| Listero y Distribución | `CUTCSA — Terminal Listero` | empresa filtrada |
| Distribución Diaria | `Distribución Diaria — CUTCSA` + "Fuente: planilla oficial CUTCSA" | empresa filtrada |
| Navegador | `Navegador — CUTCSA` | empresa filtrada |
| Posición de Flota | `Radar de Flota en Vivo — CUTCSA` | empresa filtrada |
| Análisis Financiero | `Proyecciones Económicas — CUTCSA` | empresa filtrada |
| Inteligencia Cross-Op | `Posición competitiva de CUTCSA en el sistema metropolitano` | empresa filtrada |
| Centro de Mando (mientras carga) | `Cargando red CUTCSA + competidores...` | empresa filtrada |
| Radar Sombra | `Detecta coches CUTCSA en la calle…` (texto explicativo) | empresa filtrada |
| Centro de Mando v7 | `Centro de Mando de Red v7 CROSS-OPERADOR Sistema Metropolitano de Montevideo` | OK ya genérico |

- **Patrón a usar:** consumir `useEmpresaPropia()` (hook ya existente) y reemplazar el literal `'CUTCSA'` por `empresa.nombre`.
- **Cuidado:** `useEmpresaPropia.ts` está en lista de archivos críticos compartidos — cualquier toque ahí lo hace Code, no Cowork. Acá solo cambian las pantallas que consumen el hook.
- **Prioridad:** P1. Mata credibilidad en pitch CUTCSA porque parece "demo desordenada".

### AL-4 · Mapas Estratégicos: 0 shapes UCOT

- **Pantalla:** Mapas Estratégicos (`/corridor-map`).
- **Síntoma:** "OPERADORES: UCOT 0 sh., CUTCSA 278 sh., COME 66 sh., COETC 156 sh." UCOT (la empresa propia) no tiene shapes cargadas. Sin shapes propias no se puede comparar nada.
- **Probable causa:** la ingesta de shapes solo cargó competidores. Falta correr scraper/seed para UCOT sobre `routes_shapes_meta` o equivalente.
- **Fix sin regresión:** correr el cron de carga de shapes UCOT existente (no escribir uno nuevo). Si no existe, crear ticket separado — esto sí sería feature nueva.
- **Prioridad:** P1.

### AL-5 · Mapas Estratégicos: 0 buses live aunque header reporta 74 EN LÍNEA

- **Síntoma:** "0 buses en vivo" en mapa con `Buses en vivo` toggle activable. Pero header del layout muestra 74 buses UCOT activos.
- **Probable causa:** el listener de `viajes_activos` o `vehicle_events` no está conectado al overlay del mapa, o se filtra por `empresa.id !== currentEmpresaId` y como currentEmpresa puede estar mal seteada (ver AL-3) los buses se descartan.
- **Fix sin regresión:** verificar el filtro del overlay; si `useEmpresaPropia()` devuelve correctamente UCOT, los 74 buses deberían aparecer. Caso contrario, alinear con AL-3.
- **Prioridad:** P1.

### AL-6 · Centro de Desvíos: 30 notif enviadas / 0% ACK

- **Síntoma:** Tasa de acuse 0% sobre 30 notificaciones. Probablemente combinado con: `[FCM-Web] Push deshabilitado: VAPID/SW no configurados`.
- **Fix sin regresión:** **NO** activar VAPID si el equipo no lo tiene definido. Pero la métrica "0% ACK" debe tener tooltip explicativo: "Push web deshabilitado — esperando configuración FCM. Las notificaciones no se entregan al conductor por web." Esto ya impacta operación: las notificaciones a conductores no llegan.
- **Prioridad:** P1. Crítico porque CLAUDE.md prioriza notificación a conductores.

### AL-7 · Listero y Distribución: "Sin servicios para esta fecha"

- **Pantalla:** Terminal Listero (2026-04-28). "0 conductores · 0 coches · Sin servicios".
- **Probable causa:** ese día no hay listero generado. El módulo no explica al usuario qué hacer.
- **Fix sin regresión:** mensaje claro: "Aún no se generó el listero de hoy. Haga click en 'Generar día' (Listero Cascada) para producirlo." Sin código adicional, solo copy.
- **Prioridad:** P1.

### AL-8 · Boletín de Inspección: "No hay boletín invierno para línea 300a — Cargá los datos desde Admin → Seed"

- **Síntoma:** ninguna línea tiene boletín. Para todas dice "Cargá los datos desde Admin → Seed". Eso es inaceptable en producción para un usuario operativo.
- **Fix sin regresión:** correr el seed (Admin → Setup Inicial Maestro o Carga Datos UCOT — ya existen). Si no existe el botón seed para la temporada actual, agregar SOLO el botón apuntando al endpoint existente.
- **Prioridad:** P1.

### AL-9 · Sistema y Configuración: "ERROR DE ENLACE" en BASE DE DATOS

- **Pantalla:** `/admin/sistema` → tab Estado del Sistema.
- **Síntoma:**
  - BASE DE DATOS: **ERROR DE ENLACE**
  - Latencia FIRESTORE: vacío (`ms` sin número)
  - Versión servidor: `v` (vacío)
- **Probable causa:** correlaciona con CR-2/CR-4 (mismas reglas Firestore). El check de salud no puede leer una colección de prueba y reporta enlace caído.
- **Fix sin regresión:** mismo fix de reglas (CR-2/CR-4). Adicional: que el check de salud use `auth.currentUser?.uid` antes de probar Firestore.
- **Prioridad:** P1.

---

## 🟨 Hallazgos medios (UX / datos sucios)

### MD-1 · Mantenimiento: strings en INGLÉS + "Invalid Date" en todas las filas

- **Pantalla:** Gestión de Flota → Mantenimiento.
- **Síntoma:** Cada fila dice `General · Invalid Date · Unit · WithDamages`.
- **Fix sin regresión:**
  1. Traducir `'Unit' → 'Unidad'`, `'WithDamages' → 'Con daños'`, `'General' → 'General'` (ya OK).
  2. Bug fechas: parsear `Timestamp` Firestore con `t.toDate?.() ?? t` y formatear con `Intl.DateTimeFormat('es-UY')`. NO mostrar `new Date(undefined)`.
- **Prioridad:** P2.

### MD-2 · Asignación de Coches: primer conductor llamado "2+00+0" + rol "DRIVER"

- **Pantalla:** Asignación de Coches.
- **Síntomas:**
  1. Primer conductor con nombre `2+00+0` — fórmula Excel quedó como string. Puede haber otros con nombres rotos.
  2. Columna ROL muestra `DRIVER` (en inglés). Debería decir `Conductor`.
- **Fix sin regresión:**
  1. Sanitizar al ingest: descartar registros con nombre que matchee `/^[\d\W]+$/` o contenga `+`/`=`/fórmulas Excel.
  2. Mapear roles a etiqueta español: `DRIVER → Conductor`, `INSPECTOR → Inspector`, etc.
- **Prioridad:** P2.

### MD-3 · Inspectores: lista de líneas tiene fragmentos rotos

- **Pantalla:** Inspectores → selector de Línea.
- **Síntoma:** mezcla líneas válidas (221, 300, etc.) con fragmentos: `EDO`, `OMETRO`, `TNAL`, `ILLA`, `Y`, `A`, `L`, `PQ`, `UNKNOWN`. Estos parecen derivar de splitting mal hecho de strings de destino (`"PORTONES"` → `"PORT"+"ONES"`?).
- **Fix sin regresión:** filtrar al render: descartar entradas cuyo nombre no matchee `/^[A-Z0-9\-]{2,}$/` y excluir `'UNKNOWN'`. Mejor todavía: identificar el origen del bug en el agrupador y filtrar antes de guardar.
- **Prioridad:** P2.

### MD-4 · Incidencias: muestra UID crudo en lugar de nombre conductor

- **Pantalla:** Incidencias.
- **Síntoma:** "Corte de calle Línea 505 (VUELTA) · por **8aKhkNotuWWqP4XTPsXhofgQCkA2**". Eso es el `uid` de Firebase Auth, no el nombre.
- **Fix sin regresión:** join contra `users/{uid}` para obtener `displayName` o `interno + nombre`. Fallback "Conductor #{uid.slice(0,6)}" si no existe el doc.
- **Prioridad:** P2.

### MD-5 · Vista General: 5 alertas "RIVAL_PISANDO_TURNO" sin diferenciador visible

- **Pantalla:** Vista General → "Alertas Operativas Activas".
- **Síntoma:** las 5 filas dicen exactamente `RIVAL_PISANDO_TURNO · MEDIA` sin línea, sin rival, sin hora. El usuario no puede saber a qué se refiere cada una hasta que abra el detalle.
- **Fix sin regresión:** mostrar `RIVAL_PISANDO_TURNO · L300 vs COETC LCE1 · 14:32 · MEDIA`. La data ya existe (la usa el detalle), solo es renderizado.
- **Prioridad:** P2.

### MD-6 · Vista General: "Cobertura 100% sobre 0/0 turnos"

- **Síntoma:** Card "COBERTURA FLOTA" reporta 100% pero el subtítulo dice `0/0 turnos`. Matemáticamente indefinido. Si no hay turnos programados, mostrar "—" o "Sin turnos programados".
- **Fix sin regresión:** `cobertura = totalTurnos > 0 ? asignados/totalTurnos : null`. Render `null` como "—".
- **Prioridad:** P2.

### MD-7 · Vista General: "Líneas operando: 11" cuando UCOT habitualmente opera 25–30

- **Síntoma:** baja cantidad de líneas. Puede ser día de paro (CLAUDE.md menciona UCOT en paro), pero no hay indicador en la UI.
- **Fix sin regresión:** badge informativo: "Operación reducida — paro UCOT" cuando líneas operando < 50% del histórico. Sin lógica nueva: usar el flag `operacion.estado` si existe, o mostrar tooltip "Datos GPS en vivo IMM, refresco cada 30s".
- **Prioridad:** P2.

### MD-8 · Header: "INT #----" durante el primer minuto + badge "···" intermitente

- **Síntomas:**
  1. Después de un reload, header muestra `INT #---- | SUPERADMIN` ~30–60 s mientras AuthContext recupera el DB profile (CR-4).
  2. En varias pantallas el badge de buses muestra `···` por unos segundos antes de mostrar el número.
- **Fix sin regresión:** mostrar skeleton `INT #—` (con guión EM) o esconder el badge hasta tener el dato. Ya hay loading-state code en otros componentes; reutilizar.
- **Prioridad:** P2.

### MD-9 · Centro de Turno reporta 0 coches activos cuando hay 71 EN LÍNEA en header

- **Pantalla:** Centro de Turno.
- **Síntoma:** "0 COCHES ACTIVOS / 0 EN TALLER / 0 DESVÍOS / 0 INCIDENCIAS" pero header dice 71 buses UCOT en línea. La tarjeta usa una colección distinta (`asignaciones_dia` o similar) que está vacía.
- **Fix sin regresión:** alinear la métrica "coches activos" al mismo origen que el badge (GPS live). O documentar la diferencia con tooltip "Coches con servicio asignado vs coches con GPS reportando".
- **Prioridad:** P2.

### MD-10 · Gestión de Personal: "Personal (691)" pero abajo "0 de 0 empleados"

- **Pantalla:** Gestión de Personal → Personal.
- **Síntoma:** el contador del tab dice 691 pero la tabla está vacía.
- **Probable causa:** filtro de rol/estado no inicializado o regla de Firestore.
- **Fix sin regresión:** asegurar que el initial state lea SIN filtros y que el contador del tab corresponda al mismo query.
- **Prioridad:** P2.

### MD-11 · Disponibilidad de Flota: 100+ filas con "Disponible/No/—/Sin datos"

- **Pantalla:** Gestión de Flota → Disponibilidad.
- **Síntoma:** todas las filas idénticas, sin info útil. Es la pantalla más larga del sistema y la más vacía de valor.
- **Fix sin regresión:** mostrar EmptyState si todas las filas son "Sin datos". Si solo algunas, ordenar por "completitud descendente" para mostrar las útiles primero.
- **Prioridad:** P3.

### MD-12 · Reportes Regulatorios: 2 reportes VENCIDOS sin acción automática evidente

- **Pantalla:** Reportes Regulatorios.
- **Síntoma:** "Declaración Jurada de Flota: VENCIDO Auto" y "Reporte de Kilómetros: VENCIDO Auto". Si son `Auto`, ¿por qué están vencidos?
- **Fix sin regresión:** verificar si el cron del backend sigue ejecutándose. Si está caído, restaurar. Si la lógica de "Auto" implica generación pero NO envío, dejar claro en UI: "Generado · Pendiente envío manual" en vez de "VENCIDO".
- **Prioridad:** P2.

---

## 🟦 Hallazgos bajos (cosméticos / consistencia)

### BJ-1 · ConnectivityGuard registra "No User" en cada navegación

- Cada vez que se cambia de ruta, consola loggea `🛡️ ConnectivityGuard: No User. Skipping Firewall/Latency Check`. Probable race con AuthContext.
- **Fix:** esperar al próximo tick o suscribirse al `authState` antes de evaluar. Solo log limpio.
- **Prioridad:** P3.

### BJ-2 · `[FCM-Web] Push deshabilitado: VAPID/SW no configurados`

- Warning recurrente en consola. Documentado, ya conocido.
- **Fix:** dejar el warning solo una vez por sesión, no en cada reload. O mover a `console.info`.
- **Prioridad:** P3.

### BJ-3 · Branding inconsistente: título de tab "TransForma Fácil 2.0 | Gestión UCOT" vs UI "SkillRoute"

- **Fix:** unificar `<title>` en `frontend/index.html` o `useEffect(() => { document.title = 'SkillRoute' })` por ruta.
- **Prioridad:** P3.

### BJ-4 · "Navegador" del sidebar usa /navigation; no hay redirect desde /navegador

- Se confirmó: `/dashboard/traffic/navegador` redirige a `/dashboard` en vez de `/dashboard/traffic/navigation`. Si alguien guarda la URL traducida, queda en pantalla equivocada.
- **Fix:** agregar redirect 1→1 en el router. NO cambiar la URL canónica.
- **Prioridad:** P3.

### BJ-5 · `/dashboard/traffic/posicion` redirige a `/dashboard` (debería ir a /fleet-monitor)

- Mismo patrón que BJ-4. Agregar redirect.
- **Prioridad:** P3.

---

## ✅ Lo que funciona bien (no tocar)

- **Cumplimiento (`/diagnostico-cumplimiento`):** ✅ datos reales, tabla por línea con OTP, atrasados, diagnóstico. Modelo a seguir para los selectores de empresa.
- **Incidencias:** ✅ datos reales (5 abiertas, 2 alta prioridad), tipos clasificados, listado con coords GPS. Solo necesita el fix MD-4 (UID → nombre).
- **Radar de Competencia (`/competitor-intelligence`):** ✅ datos reales (73 buses UCOT, 11 líneas, top líneas en disputa con %). Todo en español.
- **Inteligencia Cross-Op (`/corridor-intelligence`):** ✅ datos reales (824 pares analizados, 1.392 km red compartida, 89% gano vs rivales, top 3 amenazas). Solo H1 hardcoded (AL-3).
- **BRT 2027:** ✅ contenido completo, tabs funcionales, datos de inversión y proyecciones bien presentados.
- **Análisis Financiero:** ✅ simulador de escenarios funcional, sliders responsivos, tabla de rentabilidad por línea poblada. Solo H1 hardcoded.
- **Gestor de Cartones — vista de detalle (`/cartons/detail/{lineId}/{serviceId}`):** ✅ muestra paradas y tiempos del cartón real.

---

## 📋 Plan modular de corrección sugerido (prioridad y batching)

### Sprint A — P0 / bloqueantes (1 día)

1. **firestore.rules** + redeploy: arreglar lectura para `road_alerts`, `service_categories`, `users/{uid}`. → cierra CR-2, CR-4, CR-5, AL-9.
2. **firestore.indexes.json**: agregar índice `service_matrices(empresaId ASC, createdAt DESC)`. → cierra CR-3.
3. **CEODashboardV7.tsx**: identificar el `useMemo` que llama `new` y arreglar import o agregar guard. → cierra CR-1.
4. Verificación: abrir /ceo, /dashboard, /traffic/planificacion en prod sin errores rojos en consola.

### Sprint B — P1 / consistencia cross-operador (1 día)

5. Reemplazar literales `'CUTCSA'` por `useEmpresaPropia().nombre` en 7 pantallas (AL-3). Hacerlo archivo por archivo, **sin tocar `useEmpresaPropia.ts`** (Cowork no lo edita).
6. Conectar tabs UCOT/CUTCSA/COME/COETC en Planificación (AL-1) usando el mismo componente que Cumplimiento.
7. Wire del botón Editar en Planificación (AL-2).
8. Tooltip "Push web deshabilitado" + revisar setting VAPID (AL-6, BJ-2).
9. Mensaje claro de estado vacío para Listero (AL-7) y Boletín (AL-8).

### Sprint C — P2 / datos sucios + UX (1 día)

10. Mantenimiento: traducir `Unit/WithDamages` + parsear fechas (MD-1).
11. Asignación de Coches: sanitizar nombres + traducir `DRIVER` (MD-2).
12. Inspectores: filtrar fragmentos `EDO/OMETRO/TNAL/ILLA/Y/A/L/PQ/UNKNOWN` (MD-3).
13. Incidencias: join contra `users` para nombres (MD-4).
14. Vista General: render alertas con detalle (MD-5), cobertura `0/0 → '—'` (MD-6), "Líneas operando" con contexto (MD-7).
15. Header skeleton mientras AuthContext recupera (MD-8).
16. Centro de Turno alineado con badge buses (MD-9).
17. Personal: contador del tab consistente con tabla (MD-10).

### Sprint D — P2 / Mapas y operadores (½ día)

18. Disparar el seed/cron existente para shapes UCOT (AL-4). Si no existe el cron → ticket separado (es feature nueva).
19. Verificar listener de buses live en mapa (AL-5).
20. Reportes Regulatorios: estado real de los crons (MD-12).

### Sprint E — P3 / cosmético (½ día)

21. Branding `<title>` (BJ-3).
22. Redirects /navegador → /navigation y /posicion → /fleet-monitor (BJ-4, BJ-5).
23. ConnectivityGuard race (BJ-1).

---

## 🔍 Cómo validar cada fix antes de cerrar

Por cada bug arreglado:

1. `npx tsc --noEmit --skipLibCheck` en `frontend/` y `functions/` → 0 errores nuevos.
2. `npm run build` limpio.
3. `bash scripts/check_integrity.sh` (desde Code, no Cowork — directriz §10).
4. Deploy → abrir https://ucot-gestor-cloud.web.app en browser limpio (sin cache).
5. Verificar 3 módulos pre-existentes que NO se tocaron:
   - ShadowRadar (`/centro-turno` → tab Radar Sombra)
   - Cumplimiento (`/diagnostico-cumplimiento`)
   - Incidencias (`/incidents`)
6. Reabrir el módulo arreglado y confirmar:
   - sin error rojo en consola
   - sin tarjeta vacía sin explicación
   - números coherentes con el badge del header

---

## 📎 Anexo · Inventario de URLs auditadas

```
/dashboard                                    [Vista General]
/dashboard/traffic/planificacion              [Planificación]
/dashboard/traffic/cartons/detail/221/1190    [Cartón detalle]
/dashboard/traffic/listero                    [Listero]
/dashboard/traffic/navigation                 [Navegador]
/dashboard/traffic/centro-turno               [Turno en Vivo]
/dashboard/traffic/fleet-monitor              [Posición de Flota]
/dashboard/traffic/diagnostico-cumplimiento   [Cumplimiento]
/dashboard/traffic/incidents                  [Incidencias]
/dashboard/traffic/ceo                        [Centro de Mando — CRASHEA]
/dashboard/traffic/competitor-intelligence    [Radar de Competencia]
/dashboard/traffic/corridor-intelligence      [Inteligencia Cross-Op]
/dashboard/traffic/corridor-map               [Mapas Estratégicos]
/dashboard/traffic/brt                        [BRT 2027]
/dashboard/traffic/financiero                 [Análisis Financiero]
/dashboard/fleet                              [Gestión de Flota]
/dashboard/admin/rrhh                         [Gestión de Personal]
/dashboard/admin/asignacion-vehiculos         [Asignación de Coches]
/dashboard/traffic/inspector-control          [Inspectores]
/dashboard/admin/sistema                      [Sistema y Configuración]
/dashboard/admin/regulatorio                  [Reportes Regulatorios]
/dashboard/driver/compliance                  [Mi Rendimiento]
/dashboard/market                             [Bolsa de Trabajo]
/dashboard/my-balance                         [Mi Cuenta]
```

---

## 🧭 Resumen ejecutivo (para Jonathan)

- **5 bugs P0 (bloqueantes)** — uno hace crashear el dashboard del CEO, dos rompen lectura de datos por reglas Firestore mal configuradas, uno por índice faltante. **Se resuelven en 1 día desde Code, sin agregar código nuevo.**
- **9 bugs P1** — la mayoría es la palabra "CUTCSA" hardcodeada en H1 de pantallas que en realidad muestran datos UCOT. **Es lo más visible para una demo a CUTCSA o cualquier prospect**: hace ver el sistema desordenado.
- **12 bugs P2** — strings en inglés, fechas inválidas, UIDs en vez de nombres, contadores inconsistentes. Pequeños pero acumulan ruido visual.
- **5 bugs P3** — cosmético / redirects.
- **7 módulos funcionan bien** y deben preservarse intactos: Cumplimiento, Incidencias, Radar de Competencia, Inteligencia Cross-Op, BRT 2027, Análisis Financiero (datos), Cartón detalle.

**Restricción explícita honrada en este informe:** ningún fix propuesto agrega features nuevas. Todo es: arreglar reglas, arreglar imports, traducir strings, sanitizar datos, conectar handlers. Compatible con la **Regla de No-Regresión §11 de CLAUDE.md**.

---

*Generado durante sesión QA en producción · sin modificación de código · cubre 22 módulos accesibles para SuperAdmin · build `14b8722b`.*
