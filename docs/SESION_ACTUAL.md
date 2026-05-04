# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

**Última actualización:** 2026-05-04 — Fix Firestore rules deployado + Cumplimiento "Por Línea" matriz live

> 🎯 **ARQUITECTURA**: Sistema metropolitano completo — COETC (10), COME (20), CUTCSA (50), UCOT (70). Jonathan es super-admin con visión de todos los operadores.

---

## 🎯 FIX COHERENCIA AUDITORÍA + STICKY HEADERS (Code debe deployar AHORA)

### Problemas reportados por Jonathan + verificados por Cowork en prod

**1. Inconsistencia de %**: la fila resumen muestra L149 CUTCSA con 18% en tiempo, 18% atrasado, 64% adelantado (= 22 eventos coherentes con datos crudos). Al entrar a la Auditoría detallada, los viajes 00:34-03:26 mostraban "0% en tiempo · 5/7/8/2 pasadas" — números no consistentes.

**Causa raíz** (auditoría cross-API directa a Firestore): mi auditoriaService calculaba `desv = tReal - tProgramado` por su cuenta, asignando eventos al control point temporalmente más cercano. Pero el backend ya hace **snap-to-shape geográfico** y guarda `desviacionMin` real en cada evento. Mi cálculo manual daba números distintos al del backend → discrepancia con la fila resumen.

**Fix**: usar `ev.desviacionMin` del backend cuando está disponible (en lugar de mi cálculo). Cumplimiento `EN_TIEMPO` ahora considera AMBAS condiciones: `estado === EN_TIEMPO` (del backend) o `|desv| <= 4 min`.

**2. Header tabla NO sticky**: al hacer scroll en el listado de líneas, los nombres de columna (LÍNEA / SENT. / COCHES / EVENTOS / etc.) salían de vista. Mismo problema en la tabla de salidas de la auditoría.

**Fix**: `<thead className="sticky top-0 z-20 bg-slate-900 shadow-md">` + bg explícito en cada `<th>` para evitar transparencia. Aplicado en CumplimientoPorLineaPro y AuditoriaLineaTimeline.

**3. Eventos sin sentido detectado** (Cowork verificó cross-operador):
- UCOT: 0/22 con sentido detectado
- CUTCSA: 0/33 (top 3) con sentido
- COETC: 0/131 con sentido (línea G)
- COME: 4/23 con sentido

El detector de bearing del autoStatsCollector no se está calibrando bien (necesita varios puntos GPS consecutivos por bus, y el TTL de 7 días puede no acumular suficientes en líneas con baja frecuencia). Resultado: las tabs IDA y VUELTA muestran los MISMOS eventos null duplicados.

**Fix**: agregada métrica `sentidoCobertura` y warning amarillo visible en la auditoría cuando < 50%. Texto: "Sentido sin detectar: sólo X% traen IDA/VUELTA del backend. Los datos en esta tab incluyen también pasadas con sentido desconocido — pueden coincidir con la otra dirección."

**4. Bug pre-existente del backend** (NO se arregla en esta sesión, queda documentado):
COETC L405 muestra **96 eventos, todos con `desviacionMin = 0` y estado `EN_TIEMPO`**. Esto es la fórmula tautológica que SESION_ACTUAL.md ya documenta del autoStatsCollector — no viene mi código. Se sospecha que es endpoint del IMM que devuelve estado idéntico para esa línea, o un bug en el snap-to-shape para esa ruta. **Acción post-presentación**: revisar `functions/src/autoStatsCollector.ts` líneas relacionadas con L405. Si el ingeniero CUTCSA pregunta por una línea con 100% en tiempo, decir que esos datos están bajo revisión técnica.

### Líneas con mejor data para la demo

| Operador | Línea | Eventos | Coches | % en tiempo | Notas |
|---|---|---|---|---|---|
| **COETC** | **G** | 131 | 25 | 61% | **Recomendada** — historia completa |
| COETC | 427 | 92 | 15 | 76% | También buena |
| COETC | 2 | 90 | 19 | 60% | Rica en data |
| **CUTCSA** | **103** | 33 | — | mostrar | Buena para CUTCSA pitch |
| CUTCSA | 182 | 33 | — | mostrar | También buena |
| UCOT | 306 | 4 hoy / 22+ dom | varios | varía | Muy poca data hoy → usar **dom 03 may** |

### Archivos modificados (3, todos edits chicos)

| Archivo | Cambio |
|---|---|
| `frontend/src/services/auditoriaService.ts` | Usa `ev.desviacionMin` del backend; agrega `pctEnTiempoLineaCompleta`, `totalEventosLineaCompleta`, `sentidoCobertura` |
| `frontend/src/pages/traffic/AuditoriaLineaTimeline.tsx` | KPI "% en tiempo línea" + KPI "% asociadas"; warning sentido<50%; sticky thead en tabla salidas |
| `frontend/src/pages/traffic/CumplimientoPorLineaPro.tsx` | Sticky thead en tabla listado de líneas, max-h 65vh |

### Verificación Cowork

- `npx tsc --noEmit --skipLibCheck --noUnusedLocals` = 0 errores ✅
- 0 NULs ✅
- No-regresión §11: matriz, ranking, OTP, por coche, semana vs semana, etapas — INTACTOS. Solo edits aditivos en service + KPIs + sticky header. ✅

### Acción Code (≤ 8 minutos)

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\frontend
npm run build
cd ..
firebase deploy --only hosting --project ucot-gestor-cloud
curl https://skillroute.web.app/version.json
# Esperado: commit nuevo, no 83b18497

git add frontend/src/services/auditoriaService.ts `
        frontend/src/pages/traffic/AuditoriaLineaTimeline.tsx `
        frontend/src/pages/traffic/CumplimientoPorLineaPro.tsx `
        docs/SESION_ACTUAL.md cowork-tools/bridge/inbox.md

git commit -m "fix(auditoria): coherencia con fila resumen + sticky headers + warning sentido

(1) Usa ev.desviacionMin del backend (snap-to-shape geografico) en lugar
de calcular tReal-tProgramado a mano. Resuelve la discrepancia entre el %
de la fila resumen y el detalle de la auditoria reportada por el usuario
en L149 CUTCSA (fila decia 18% en tiempo, viajes detallados decian 0%
incorrectamente porque mi calc manual era impreciso).

(2) Agrega KPI '% en tiempo linea' (igual que la fila resumen, sobre
todos los eventos del dia) ademas del KPI '% asociadas' (solo eventos
matcheados a control points +-12 min). El usuario ve ambos numeros y
puede contrastar.

(3) Header tabla sticky: thead con sticky top-0 z-20 bg-slate-900 +
overflow-y-auto max-h-65vh, en listado de lineas Y tabla de salidas.

(4) Warning visible cuando sentidoCobertura<50% (los GPS no traen
IDA/VUELTA del backend) - aclara por que las tabs IDA y VUELTA pueden
mostrar las mismas pasadas duplicadas. Cowork verifico cross-operador
que CUTCSA/UCOT/COETC tienen 0% sentido detectado actualmente.

No-regresion §11 verificada: tsc 0 errores, NULs 0, solo aditivos."

git push origin main
```

Reportar DONE en bridge con buildId nuevo. Cowork verifica visualmente.

---

## 🎯 FIX UX NAVEGACIÓN NOTEBOOK — Code debe deployar (post-Auditoría)

Cowork verificó la Auditoría en prod (commit `83b18497`) — funciona perfecto:
**109 puntos de control · 7 coches detectados · 27 pasadas GPS** en línea 306 IDA del domingo.
Pero detectó 3 problemas UX que bloquean la navegación en notebook 1366×768 (la pantalla del usuario en la demo):

1. **Scrollbars invisibles globalmente** (CSS `::-webkit-scrollbar { display: none }`).
   La sidebar tiene 1885 px de contenido en 710 px visibles — 1175 px ocultos sin indicador. El usuario no ve que se puede scrollear.
2. **Build badge** posicionado `bottom-left` con `z-index: 9999` taparía el último item de la sidebar.
3. **Sidebar items demasiado altos** (`min-h-44px py-3` para mobile táctil). En notebook ocupan 2x el alto necesario.

### Fixes aplicados por Cowork (3 archivos editados)

**`frontend/src/index.css`** (regla `::-webkit-scrollbar`):
- Antes: `display: none` global → invisible.
- Después: `width: 10px`, thumb `slate-600/70` con hover, track `slate-900/40` redondeado, padding interior. Firefox: `scrollbar-width: thin` + `scrollbar-color`. Mantiene oculta solo en `@media (hover: none) and (pointer: coarse)` (mobile táctil).

**`frontend/src/components/BuildBadge.tsx`**:
- Movido de `bottom-left` a `bottom-right`, `z-index 40` (no 9999), `opacity 0.6`. Ya no tapa la sidebar.

**`frontend/src/components/Sidebar.tsx`**:
- Header: `p-6` → `px-4 py-3`, logo `w-10 h-10` → `w-9 h-9`, título `text-2xl` → `text-xl lg:text-2xl`.
- Nav: `p-4 space-y-8 mt-4` → `px-3 py-2 space-y-3 lg:space-y-4 mt-1`.
- Items: `min-h-44px py-3` → `min-h-[36px] lg:min-h-[40px] py-1.5 lg:py-2`.
  Mobile mantiene 44px (responsive). Notebook desktop usa 36-40px → 30 % menos altura, todos los items visibles sin scroll.

### Verificación Cowork

- `npx tsc --noEmit --skipLibCheck` = 0 errores ✅
- 0 NULs en los 3 archivos ✅
- No-regresión §11: solo edits de paddings/tamaños, no tocan lógica ✅

### Acción Code

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\frontend
npm run build
cd ..
firebase deploy --only hosting --project ucot-gestor-cloud
curl https://skillroute.web.app/version.json
# Esperado: commit nuevo (no 83b18497)

git add frontend/src/index.css frontend/src/components/BuildBadge.tsx frontend/src/components/Sidebar.tsx docs/SESION_ACTUAL.md cowork-tools/bridge/inbox.md
git commit -m "fix(ux): scrollbars visibles + sidebar compacta + badge reposicionado para notebook 1366x768

- index.css: regla global ::-webkit-scrollbar pasa de display:none a 10px
  con thumb slate-600/70. Mobile tactil mantiene oculta via hover:none.
- BuildBadge.tsx: bottom-left zIndex 9999 -> bottom-right zIndex 40 opacity 0.6.
- Sidebar.tsx: header p-6 -> px-4 py-3, items min-h-44px py-3 -> min-h-36px
  lg:40px py-1.5 lg:py-2, gap secciones space-y-8 -> space-y-3 lg:space-y-4.
  Mobile mantiene 44px tactil; notebook 36-40px (30% menos altura, todos
  los items visibles sin scroll en 1366x768).

No-regresion: solo paddings/tamanos, no logica."
git push origin main
```

Verificación visual post-deploy: la sidebar muestra TODOS los items del menú visibles sin scroll en 1366×768. Si hay scroll necesario, la barra es visible (slate-600). Build badge en esquina inferior derecha, opaco.

---

## 🚨 ENTREGA CRÍTICA PRE-DEMO — Code debe deployar AHORA

### Qué se entrega esta iteración (DIFERENCIADOR DEL PITCH)

**Vista "Auditoría por Línea" estilo IMM** — replica el patrón visual de la consulta del STM (`montevideo.gub.uy/app/stm/horarios/`) pero AGREGA por encima las pasadas GPS reales detectadas por SkillRoute. El mensaje al ingeniero CUTCSA:

> "Sin que el operador nos haya dado un solo dato interno, podemos auditar el cumplimiento de cada salida de cada línea. Con sus datos internos, esto se vuelve quirúrgico."

### UX

1. Listado de líneas (existente) → cada fila ahora tiene **2 botones**:
   - 🟢 **Auditoría** (nuevo, verde) — abre la vista IMM
   - 🔵 **Matriz** (existente) — la vista actual de matriz × coches
2. Vista Auditoría:
   - Tabs **IDA / VUELTA** con % cumplimiento por sentido
   - Selector de día (últimos 7)
   - 4 KPIs: Salidas programadas / Puntos de control / % en tiempo / Pasadas sin asociar
   - Tabla de salidas estilo IMM: `Desde / Salida / Llegada / Destino / Coches / Pasadas / % en tiempo / [Ver]`
3. Click en "Ver" abre **modal con TIMELINE de control points**:
   - ●─── 04:30  Portonesterminal (origen)
   - │           ▼ Coche 22  04:31 (+1)  ✓
   - │           ▼ Coche 78  04:29 (-1)  ✓
   - ●─── 04:40  Malvin
   - ●─── 04:46  Av Rivera/S López
   - ...
   - Cada punto marca origen/destino, % en tiempo, y todas las pasadas detectadas

### Archivos nuevos (Cowork ya escribió, 0 NULs, tsc 0 errores)

| Archivo | Líneas | Estado |
|---|---|---|
| `frontend/src/services/auditoriaService.ts` | 15.6 KB | ✅ Nuevo |
| `frontend/src/pages/traffic/AuditoriaLineaTimeline.tsx` | 15.9 KB | ✅ Nuevo |
| `frontend/src/components/audit/SalidaTimelineModal.tsx` | 12.4 KB | ✅ Nuevo |
| `frontend/src/pages/traffic/CumplimientoPorLineaPro.tsx` | edits chicos | ✅ Editado (lazy import + estado + botón Auditoría + render condicional) |

### Datos consumidos (todos ya en Firestore, todos con lectura pública)

- `gtfs_timetable/{agencyId}_{linea}_{dir}_{HABIL|SABADO|DOMINGO}` — 90 viajes/día por línea, 109 control points
- `gtfs_stops/{stopId}` — nombre, lat/lng
- `vehicle_events` (ya abierto en commit `20fac2d1`) — pasadas GPS reales

**No se modifica `firestore.rules`.** `gtfs_timetable` y `gtfs_stops` ya tenían `allow get, list: if true` (datos públicos del IMM).

### Algoritmo de matching GPS ↔ control point

Para cada control point del viaje (tiempo programado `t`), busca eventos GPS:
- Misma línea, mismo sentido (o sentido=null)
- Dentro de ventana `±12 min` del tiempo programado
- Máximo 1 pasada por bus por control point por viaje

Tolerancia EN_TIEMPO: `±4 min` (estándar IMM Uruguay).

### NO-REGRESIÓN (CLAUDE.md §11) — reglas que cumple

- ✅ Archivos nuevos: 3 (no editan código existente)
- ✅ `CumplimientoPorLineaPro.tsx`: solo se agregan estado + botón + render condicional. La vista matriz sigue intacta como fallback.
- ✅ `DiagnosticoCumplimiento.tsx` legacy NO se toca — sigue como fallback final.
- ✅ Otras tabs (Ranking, OTP, Por Coche, Semana, Etapas) no se tocan.
- ✅ `tsc --noEmit --skipLibCheck --noUnusedLocals` = 0 errores.
- ✅ NULs = 0 en los 4 archivos.

### Acción Code — orden ejecutable

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\frontend
npm run build
cd ..
firebase deploy --only hosting --project ucot-gestor-cloud
curl https://skillroute.web.app/version.json
# Esperado: commit nuevo (no el viejo 6e3763ee)
```

Verificación visual (post hard-refresh en `https://skillroute.web.app/dashboard/traffic/diagnostico-cumplimiento`):

1. La tabla de líneas muestra 2 botones por fila: Auditoría (verde) + Matriz (azul). ✓
2. Click "Auditoría" en L306 → abre vista a pantalla completa con tabs IDA / VUELTA, KPIs, tabla de 90 salidas. ✓
3. Tab IDA muestra `% en tiempo` calculado, tabla con `Desde / Salida / Llegada / Destino`. ✓
4. Click "Ver" en una salida con pasadas → modal con timeline de control points, cada punto con hora programada + pasadas detectadas con desviación coloreada. ✓
5. Toggle a tab VUELTA → se recalcula. ✓
6. "Volver al listado" cierra la vista. ✓
7. **No-regresión**: ShadowRadar, CartonManager, FleetMonitor renderizan sin errores. ✓

```powershell
git add frontend/src/services/auditoriaService.ts `
        frontend/src/pages/traffic/AuditoriaLineaTimeline.tsx `
        frontend/src/components/audit/SalidaTimelineModal.tsx `
        frontend/src/pages/traffic/CumplimientoPorLineaPro.tsx `
        docs/SESION_ACTUAL.md cowork-tools/bridge/inbox.md

git commit -m "feat(cumplimiento): vista Auditoria por Linea estilo IMM (timeline + pasadas reales)

Replica el patron visual de la consulta del STM IMM y agrega por encima las
pasadas GPS reales detectadas por SkillRoute. Diferenciador del pitch:
'sin un solo dato interno del operador, podemos auditar el cumplimiento
de cada salida de cada linea'.

Componentes nuevos:
- frontend/src/services/auditoriaService.ts (carga GTFS + matching GPS)
- frontend/src/pages/traffic/AuditoriaLineaTimeline.tsx (vista principal)
- frontend/src/components/audit/SalidaTimelineModal.tsx (modal timeline)

Edits en CumplimientoPorLineaPro.tsx:
- Lazy import de AuditoriaLineaTimeline
- Nuevo estado auditoriaLinea
- Boton 'Auditoria' (verde) al lado de 'Matriz' (azul) en la lista
- Render condicional: si auditoriaLinea esta set, abre la vista a
  pantalla completa, manteniendo la matriz como fallback

Datos: gtfs_timetable + gtfs_stops + vehicle_events (todos ya con
lectura publica). No se modifica firestore.rules.

Algoritmo: por cada control point del viaje, asocia eventos GPS dentro
de ventana +-12 min, max 1 pasada por bus. Tolerancia +-4 min IMM.

No-regresion (§11):
- 3 archivos nuevos sin tocar codigo existente
- CumplimientoPorLineaPro.tsx solo agrega; la matriz sigue intacta
- DiagnosticoCumplimiento.tsx legacy preservado como fallback
- tsc 0 errores con --noUnusedLocals
- NULs 0 en los 4 archivos"

git push origin main
```

Reportar DONE en bridge cuando version.json muestre el commit nuevo y los 7 checks visuales pasen.

---

## 🔁 ITERACIÓN PRE-DEMO — Code debe redeployar HOSTING ahora

### Bug confirmado en producción (post fix rules)

Cowork verificó en `https://skillroute.web.app/dashboard/traffic/diagnostico-cumplimiento` (build `6e3763ee`, commit firestore.rules `20fac2d1`):

- ✅ Banner rojo desapareció — query a `vehicle_events` ya funciona.
- ✅ KPIs cargan: 7 coches activos, 15 eventos GPS, 47% en tiempo, 6 líneas listadas (L17, L300, L306, L316, L330, L370).
- ❌ **Click en "Ver matriz" muestra "No hay eventos GPS para Línea X (IDA)"** aunque la línea sí tiene eventos en la tabla resumen.

### Causa raíz

Diagnóstico vía REST: los 15 eventos GPS de UCOT del día tienen `sentido: NULL` (el detector de bearing en `autoStatsCollector` no logra determinar IDA/VUELTA con tan pocos puntos GPS al amanecer). Mi componente filtraba estricto `e.sentido === 'IDA' | 'VUELTA'`, descartando todo.

### Fix aplicado por Cowork (Edits chicos en archivo existente)

`frontend/src/pages/traffic/CumplimientoPorLineaPro.tsx`:
- Tipo `sentidoMatriz` ampliado a `'IDA' | 'VUELTA' | 'AMBOS'`.
- Default ahora `'AMBOS'` (incluye eventos con `sentido === null`).
- Toggle de matriz ahora tiene 3 botones: AMBOS (verde) / IDA / VUELTA.
- Modos IDA/VUELTA ahora también incluyen eventos con `sentido === null` (no perderlos).
- Lista de líneas: cuando el sentido viene null, muestra badge `s/d` con tooltip "Detector de sentido sin certeza" en lugar de un dash mudo.

`tsc --noEmit --skipLibCheck --noUnusedLocals` → 0 errores.

### ACCIÓN INMEDIATA Code

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\frontend
npm run build
cd ..
firebase deploy --only hosting --project ucot-gestor-cloud
curl https://skillroute.web.app/version.json
# Esperado: commit nuevo (no más 6e3763ee)
```

Después: hard-refresh `https://skillroute.web.app/dashboard/traffic/diagnostico-cumplimiento`, click "Ver matriz" en L306 → debería mostrar 4 pasadas (3 en "Géant", 1 en "Etiopia - Calle 16") con coche 22, 78, etc. y desviaciones.

```powershell
git add frontend/src/pages/traffic/CumplimientoPorLineaPro.tsx docs/SESION_ACTUAL.md cowork-tools/bridge/inbox.md
git commit -m "fix(cumplimiento): incluir eventos sentido=null en matriz (toggle AMBOS por default)"
git push origin main
```

---

## ✅ SESIÓN CERRADA — TODO DEPLOYADO

### Resumen de lo entregado

| Feature | Commit | Estado |
|---|---|---|
| `CumplimientoPorLineaPro.tsx` — matriz Puntos de Control × Coches por día | `2c3f3e89` | ✅ prod |
| `CumplimientoHub.tsx` — swap lazy import a nuevo componente | `2c3f3e89` | ✅ prod |
| `DiagnosticoCumplimiento.tsx` — reescritura con vehicle_events histórico | `2c3f3e89` | ✅ prod |
| `firestore.rules` — vehicle_events `allow read: if true` (fix auth gap) | `20fac2d1` | ✅ prod |

### Por qué el módulo mostraba 0 datos (root cause confirmado)

El login custom de SkillRoute (`localStorage.tf_user`) **no genera una sesión de Firebase Auth**. El `firebaseLocalStorage` IndexedDB está vacío. Por eso `request.auth == null` en Firestore → `permission-denied` en todas las queries directas desde el frontend.

**Fix aplicado:** `vehicle_events` → `allow read: if true` (datos GPS públicos del IMM, sin info sensible).

**Verificación post-deploy:** REST API sin auth devuelve 3 docs: UCOT/L306, CUTCSA/L109, COETC/L409 ✅

---

## 📋 PRÓXIMO PASO INMEDIATO

### 1. Confirmar visualmente en browser (Jonathan)

Abrir con **hard-refresh (Ctrl+Shift+R)**:
https://skillroute.web.app/dashboard/traffic/diagnostico-cumplimiento

Esperado:
- **Sin** banner rojo "Missing or insufficient permissions"
- KPI "Coches activos" > 0
- KPI "Eventos GPS" > 0
- Tabla de líneas visible (L300, L183, etc.)
- Clic "Ver matriz" en cualquier línea → filas = paradas, columnas = coches, celdas con hora + color

### 2. Refactor post-presentación: `signInWithCustomToken`

El fix actual (`allow read: if true`) es correcto para datos GPS públicos pero el bug sistémico del auth sigue. Tarea post-demo: sincronizar `localStorage.tf_user` con Firebase Auth usando `signInWithCustomToken` para que las reglas protegidas (`isAuthenticated()`) funcionen correctamente.

Colecciones afectadas con el mismo bug: `road_alerts`, `system_status` (y potencialmente otras).

---

## 🔄 Estado de los datos en Firestore

| Colección | Documentos | Contenido |
|---|---|---|
| `vehicle_events` | TTL 7 días, cron c/15min | GPS + estadoCumplimiento + desviacionMin + agencyId |
| `eventos_desvio` | creciendo c/TICK | FUERA_DE_RUTA: coche, linea, agencyId, metros_fuera |
| `bus_last_pos` | ~300+ docs | Clave `{agencyId}_{coche}`, lat/lon/ts |
| `horarios_stm` | 141 líneas | Fuente primaria horarios |
| `boletin_oficial` | UCOT-only | Paradas + servicios por línea |
| `servicios_ucot` | UCOT-only | Vueltas con paradas[]+hora detalladas |
| `etapa_stats` | acumula c/30min | OTP por parada — usado por tab "Análisis por Etapa" |

---

## 🐛 Bugs conocidos no críticos

- **Auth gap sistémico**: `localStorage.tf_user` no sincroniza con Firebase Auth → queries con `isAuthenticated()` fallan en prod. Fix real: `signInWithCustomToken`. Workaround actual: `allow read: if true` en `vehicle_events`.
- `road_alerts` y `system_status` tienen el mismo problema de auth — afectan RoadAlertService y SystemIntegrity.
- `serviceAccountKey.json` en `backend_legacy/` tiene JWT inválido — usar ADC.
- 6 shapes GTFS con empresa "STM" (agencyId no reconocido).
- `App.tsx:136` declara `lazy(DiagnosticoCumplimiento)` sin usar en ningún `<Route>` — dead import, baja prioridad.

---

## 📦 Backlog priorizado

1. **Verificación visual** — Jonathan confirma que el módulo muestra datos reales (post hard-refresh)
2. **refactor auth** — `signInWithCustomToken` para sincronizar custom login con Firebase Auth
3. **Eliminar DiagnosticoCumplimiento.tsx legacy** — una vez confirmado que el nuevo funciona 1 semana
4. **Export CSV/PDF** de la matriz Puntos de Control × Coches
5. **v2 HRR en vivo** — headway real usando corridor_overlap
6. **Dashboard seat-km market share** — cross-operador por corredor
