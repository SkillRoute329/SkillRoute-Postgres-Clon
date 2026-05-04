# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

**Última actualización:** 2026-05-04 — Fix Firestore rules deployado + Cumplimiento "Por Línea" matriz live

> 🎯 **ARQUITECTURA**: Sistema metropolitano completo — COETC (10), COME (20), CUTCSA (50), UCOT (70). Jonathan es super-admin con visión de todos los operadores.

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
