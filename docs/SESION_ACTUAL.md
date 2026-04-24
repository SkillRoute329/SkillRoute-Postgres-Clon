# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

> **Para Claude (cualquier sesión nueva)**: este archivo es lo SEGUNDO que lees después de `CLAUDE.md`. Acá está dónde se quedó la sesión previa, qué decisiones se tomaron pendientes de implementar, y cuál es el próximo paso concreto. Antes de cerrar tu sesión, actualizalo con los nuevos pendientes.

> **Para Jonathan**: este archivo se actualiza automáticamente al final de cada sesión productiva. No lo borres ni lo edites manualmente — Claude lo gestiona.

**Última actualización:** 2026-04-24 (sesión bis 4 — deploy lado servidor), Claude Code Windows

---

## 🎯 EN CURSO

Nada en curso. Working tree limpio. Todos los commits pusheados.

**Lo que se hizo en esta sesión (lado servidor):**
1. ✅ `firestore.rules` desplegado a producción — reglas para `corridor_overlap`,
   `shapes_cross_operator`, `incidencias`, `disruptions`, `desvios_reportados`,
   `delegaciones_inspector`, `parametros_operativos*` y eliminación de
   `isAdmin()` case-sensitive (reemplazada por `isAdminNorm()`).
   Los `permission-denied` del V7 quedan resueltos.
2. ✅ `/api/positions` — Cloud Function ya estaba sirviendo datos en producción.
   730 buses en vivo, campo `empresaId` numérico (coincide con lo que usa el V7).
   No requirió cambios.
3. ✅ `servicios_estado` — la colección se popula manualmente desde el módulo
   listero cuando asignan servicios del día. Si está vacía es porque no hubo
   asignaciones hoy (viernes noche). El V7 lo maneja correctamente mostrando
   "—" con pesos dinámicos. No es un bug del V7.

---

## 📋 PRÓXIMO PASO INMEDIATO

**Estado limpio.** Todos los pasos del lado servidor completados y commiteados. El V7 debería mostrar las Zonas Críticas y la Cuota de Mercado con datos reales en la próxima sesión de browser. Hacer hard refresh (Ctrl+Shift+R en incógnito) para limpiar cualquier cache de Firestore rules.

Pegar este bloque tal cual en Claude Code (cwd = `C:\Users\jonat\Desktop\PROYECTOS\GestionUcot`):

```
Continuamos la sesión de Cowork. Leé CLAUDE.md y docs/SESION_ACTUAL.md primero.

Tu trabajo:

1) DEV SERVER LIMPIO:
   - Matar Vite si está corriendo (Ctrl+C en terminal o Stop-Process si quedó zombie).
   - cd frontend && npm run dev
   - Esperá puerto activo.
   - En browser: cerrar TODAS las pestañas de http://127.0.0.1:3005, abrir una nueva en incógnito (para limpiar cache de auth corrupto que dejaron los HMR de la sesión anterior).
   - Login normal con tu usuario.

2) VERIFICACIÓN DEL V7 BUGFIXED (con datos reales):
   - Navegá a http://127.0.0.1:3005/dashboard/traffic/ceo-v7
   - Confirmá:
     a. Header: "Centro de Mando de Red v7" + chip "CROSS-OPERADOR" + "Sistema Metropolitano de Montevideo".
     b. Salud de la Red gauge muestra un score (no rojo absoluto si hay datos parciales, debe redistribuir pesos).
     c. Sub-componentes: si OTP / Aglom / Cober / Riesgo no tienen datos, muestran "—" en gris (no "0").
     d. Si bunching está capped, muestra "⚠" junto al label "Aglom".
     e. Aviso "Calculado sobre N de 4 componentes" aparece sólo cuando hay datos parciales.
     f. KPIs cards: Puntualidad / Aglomeración / Cumplimiento / Riesgo Operativo.
     g. **CRÍTICO** Zonas Críticas: AHORA debería listar top 5 corredores cross-operador. Si sigue en "Sin pares cruzados", abrir DevTools > Network y ver si la query a `corridor_overlap` devuelve docs. Si devuelve, es bug del filtro; si está vacía, es problema de Firestore rules (ver paso 3).
     h. Cuota de Mercado: si /api/positions devuelve datos, mostrar tabla. Si no, estado vacío explicativo (paso 3).
     i. Riesgos Activos: si hay incidencias críticas, listarlas. Si no, "Sin riesgos críticos".
     j. Footer en español: "Radar de Sombra (en vivo)", "Analítica de Sombra", "Inteligencia de Corredores", "Mapa de Corredores", "Panel de Puntualidad (OTP)", "Cumplimiento Horario", "Proyecciones Económicas", "Agentes Digitales", "Centro de Incidencias".
   - Probar selector de operador: cambiar a CUTCSA, COME, COETC. Las Zonas Críticas y Cuota de Mercado deben recalcularse en cada cambio.

3) RESOLVER 3 PROBLEMAS DE SERVIDOR (los detecté en consola del browser, no son bugs del V7):

   3.a) **firestore.rules — permission denied en `corridor_overlap` y `incidencias`**
        En la sesión anterior la consola mostraba:
          [CEODashboardV7] corridor_overlap query failed: permission-denied
          [CEODashboardV7] incidencias query failed: permission-denied
        Verificá `firestore.rules`:
          - ¿Existe regla de read para `corridor_overlap`? (la usa también ShadowRadar y CorridorIntelligence)
          - ¿Existe regla para `incidencias`?
        Si faltan, agregar reglas allow read autorizadas para roles ADMIN/TRAFFIC. Igual a las otras colecciones del módulo.
        Después: firebase deploy --only firestore:rules

   3.b) **/api/positions devuelve nada / 404**
        Vite proxy lo apunta a https://us-central1-ucot-gestor-cloud.cloudfunctions.net/intelligenceApi
        Verificar:
          curl -v http://127.0.0.1:3005/api/positions 2>&1 | head -30
        Si responde 404 desde la Cloud Function, revisar `functions/src/intelligenceApi.ts` que la ruta /positions esté registrada y desplegada (npm run build && firebase deploy --only functions:intelligenceApi).
        Si devuelve datos pero sin `codigoEmpresa` en properties, ajustar el handler para incluir ese campo.

   3.c) **ServicioEstadoService.getByDate(today) devuelve 0**
        La colección `servicios_estado` puede no tener docs para hoy (2026-04-24, viernes). Verificá:
          - ¿El cron diario que popula `servicios_estado` está corriendo?
          - ¿Hay docs para hoy? (Firebase console → servicios_estado → query date == '2026-04-24')
        Si la colección está vacía para hoy: chequear `functions/src/scheduleComplianceEngine.ts` o el cron equivalente.

4) CHEQUEO PRE-COMMIT:
   - bash scripts/check_integrity.sh (exit 0 obligatorio)
   - cd frontend && npx tsc --noEmit --tsBuildInfoFile /tmp/fresh.tsbuildinfo -p tsconfig.app.json | grep -E "CEODashboardV7|App\.tsx|Sidebar\.tsx" (no debe haber output)

5) COMMIT (incluye los 6 bugfixes + traducciones del footer perdidas):

   git add frontend/src/pages/traffic/CEODashboardV7.tsx CLAUDE.md docs/SESION_ACTUAL.md docs/HISTORIAL_SESIONES.md

   # Si modificaste firestore.rules en paso 3.a, agregalas también:
   # git add firestore.rules

   git commit -m "fix(ceo-v7): bugs detectados en verificacion funcional + traduccion footer

- agencyId numerico ('70'/'50'/'20'/'10') en lugar de 'UCOT'/'CUTCSA'.
  Sincroniza con ShadowRadar.tsx EMPRESA_TO_AGENCY. Antes el filtro de
  Zonas Criticas nunca matcheaba, ahora si.
- Hot Zones usa campos denormalizados (agencyA/lineaA/sentidoA/...) del
  doc corridor_overlap. Elimina JOIN innecesario con shapes_cross_operator.
- Salud de la Red maneja N/A vs 0: si un componente no tiene datos, su
  peso se redistribuye entre los componentes disponibles. Mostrar
  warning 'Calculado sobre N de 4 componentes' cuando es parcial.
  Antes el score era artificialmente bajo (35/100 cuando debia ser N/A).
- Bunching cap a 5000 (antes 2000) + indicador visual cuando se llega
  al cap. Threshold subido de 100 a 200 eventos.
- Promise.all con catch independiente por query: una falla
  permission-denied no rompe el resto del dashboard.
- Footer traducido al espanol (perdido en sesion previa por reconstruccion
  desde HEAD pre-traduccion).
- Sub-componentes muestran '—' en gris cuando no hay dato (no 0).

Verificacion funcional via Chrome MCP confirmo:
- Selector cross-operador funciona perfectamente
- Estados vacios explicativos en cada seccion
- UI 100% en espanol
- Layout production-grade comparable a Optibus/Swiftly

Pendiente lado servidor (paso 3 de la orden):
- firestore.rules para corridor_overlap e incidencias (permission-denied)
- /api/positions endpoint puede estar caido
- servicios_estado posiblemente sin datos para hoy

Ref: directrices CLAUDE.md no regresion + nivel internacional + UI espanol."

   git push

6) Si todo OK: 'listo, V7 funcional verificado, lo unico que falta es el lado servidor (rules + endpoint)'. Si falla algo: '## NOTA DE JONATHAN' en SESION_ACTUAL.md.
```

---

## 🐞 PROBLEMAS DETECTADOS EN VERIFICACIÓN VÍA BROWSER

Resumen de lo encontrado al probar `/dashboard/traffic/ceo-v7` como usuario:

| # | Problema | Causa | Estado |
|---|---|---|---|
| 1 | "Sin pares cruzados para UCOT/CUTCSA" pese a 1850 pares en matriz | `agencyId` filtraba por 'UCOT' pero la matriz usa '70' | ✅ Corregido en código |
| 2 | Health Score = 35/100 con datos parciales | Componentes sin datos pesaban como 0% | ✅ Corregido — pesos dinámicos + warning |
| 3 | Bunching = 2000 (capped silencioso) | Limit 2000 + threshold 100 | ✅ Subido a 5000 + threshold 200 + indicador cap |
| 4 | Permission-denied rompía Promise.all | Sin catch individual | ✅ Cada query con su catch |
| 5 | "0 de 0 servicios" en Puntualidad/Cumplimiento | ServicioEstadoService.getByDate vacío | ⚠ Pendiente investigar (paso 3.c orden) |
| 6 | "Sin datos GPS en vivo" | /api/positions sin respuesta | ⚠ Pendiente investigar (paso 3.b orden) |
| 7 | Footer en inglés | Reconstrucción desde HEAD perdió traducciones | ✅ Re-traducido |
| 8 | Sub-componentes mostraban "0" sin contexto | Falta de N/A | ✅ Ahora muestra "—" |

---

```
Continuamos la sesión de Cowork. Leé CLAUDE.md y docs/SESION_ACTUAL.md primero.

Tu trabajo:

1) VERIFICACIÓN FUNCIONAL DEL V7 (browser):
   - Levantá el dev server: cd frontend && npm run dev (esperá puerto activo)
   - Si Vite quedó corriendo de antes, reiniciálo (Ctrl+C y npm run dev otra vez) — el lazy chunk del CEODashboard fue editado y el cache puede mentir.
   - Navegá a http://localhost:3005/dashboard/traffic/ceo-v7 (o el puerto que use tu Vite — chequeá la consola que tira al levantar).
   - Confirmá:
     a. El header muestra "Centro de Mando de Red v7" + chip "CROSS-OPERADOR".
     b. El selector "Operador" arranca en UCOT y al cambiar a CUTCSA todas las métricas se recalculan.
     c. El gauge "Salud de la Red" muestra un score 0-100 y los 4 sub-componentes (OTP / Aglom / Cober / Riesgo).
     d. La sección "Zonas Críticas — Corredores en Disputa" muestra top 5 corredores entre operadores o un mensaje de estado vacío explicativo.
     e. La sección "Cuota de Mercado — Buses en Vivo por Línea Compartida" muestra una tabla con buses propios vs competidores por línea, o estado vacío.
     f. La sección "Riesgos Activos" muestra incidencias críticas / personal sin asignar / vehículos en taller (o "Sin riesgos críticos").
     g. El sidebar muestra dos entradas: "Dashboard CEO (legacy)" y "⭐ Centro de Mando v7".
     h. Todos los textos visibles están en español (los términos técnicos OTP, GPS, STM, IMM, UITP, BRT, KPI son siglas y se mantienen).

2) VERIFICACIÓN DEL LEGACY (zero regresión):
   - Navegá a http://localhost:3005/dashboard/traffic/ceo (el viejo).
   - Confirmá que sigue funcionando igual que antes + tiene el selector Operador en el header (refactor cross-operador previo).
   - Si está roto, escribí "## NOTA DE JONATHAN" arriba de SESION_ACTUAL.md describiendo el problema y avisame ANTES de commitear.

3) CHEQUEO PRE-COMMIT:
   - bash scripts/check_integrity.sh (exit 0 obligatorio)
   - cd frontend && npx tsc --noEmit --tsBuildInfoFile /tmp/fresh.tsbuildinfo -p tsconfig.app.json | grep -E "CEODashboardV7|App\.tsx|Sidebar\.tsx|CEODashboard\.tsx|CompetitorThreatWidget" (no debe haber output — los ~98 errores TS pre-existentes en otros archivos están aceptados como deuda).

4) COMMIT (un solo commit grande con todo):
   git add frontend/src/pages/traffic/CEODashboardV7.tsx frontend/src/pages/traffic/CEODashboard.tsx frontend/src/components/CompetitorThreatWidget.tsx frontend/src/App.tsx frontend/src/components/Sidebar.tsx CLAUDE.md docs/SESION_ACTUAL.md docs/HISTORIAL_SESIONES.md

   git commit -m "feat(ceo-dashboard): Centro de Mando de Red v7 + refactor cross-operador del legacy

- Crea /dashboard/traffic/ceo-v7 (Centro de Mando de Red v7) con Salud de Red
  0-100, KPIs en español con sigla técnica internacional: Puntualidad (OTP),
  Indice de Aglomeracion (24h), Cumplimiento de Servicio, Riesgo Operativo.
  Zonas Criticas desde corridor_overlap, Cuota de Mercado en vivo por linea
  desde GPS STM, panel de Riesgos compacto. Entre operadores desde el primer
  pixel (UCOT/CUTCSA/COME/COETC). Inspirado en Optibus Network Health, Swiftly
  Service Reliability, TfL EWT, NYC MTA Bunching Index, RATP Regularite.
- Toda la UI en espanol (directriz 2026-04-24): los operadores no manejan
  ingles. Solo siglas tecnicas estandar (OTP, GPS, STM, IMM, UITP, BRT) y
  nombres propios de productos extranjeros entre comillas como referencia.
- Cada KPI linkea a su modulo especializado (Radar de Sombra, Panel OTP,
  Inteligencia de Corredores, etc.) — evita duplicacion de calculos.
- Mantiene CEODashboard.tsx legacy intacto en /dashboard/traffic/ceo.
  Sidebar muestra ambos para comparacion lado a lado.
- Refuerzo directriz 7 en CLAUDE.md: las pruebas son siempre responsabilidad
  del agente; si no puede ejecutar, redacta orden completa para Claude Code.

Verificado: tsc fresco 0 errores en archivos tocados. Integrity script OK.
Errores TS pre-existentes en otros componentes (~98) quedan como deuda.

Ref: directrices Alcance del producto + Filosofia de producto + Nivel
internacional por defecto + Espanol para UI en CLAUDE.md."

   git push

5) Si todo sale bien, decime "listo, V7 desplegado" y nada más. Si falla algo, escribí ## NOTA DE JONATHAN en SESION_ACTUAL.md.
```

---

## 🔮 BACKLOG DE PRÓXIMAS SESIONES

1. ~~CEO Dashboard cross-operador legacy~~ ✅ cerrado.
2. ~~Network Command V7 (Fase 1: build paralelo)~~ ✅ cerrado en esta sesión.
3. **Fase 2 V7 — promover a default**: Una vez validado v7 en producción durante 1-2 días, redirigir `/ceo` → `/ceo-v7` y eliminar el legacy. Limpiar Sidebar para dejar sólo "Network Command".
4. **Períodos 7d/30d en V7**: Hoy los botones están deshabilitados con tooltip "Próximamente — backend de históricos en construcción". Implementar:
   - Histórico de OTP: agregación diaria desde `auto_stats_diarios` o similar.
   - Histórico de bunching: ya existe `alertas_regulacion`, query con range.
   - Histórico de Service Delivery: requiere pipeline `cartones_planificados` vs `cartones_ejecutados`.
5. **Driver app UI para ACK de FCM** — cuando llega push, mostrar modal con botón "RECIBIDO" → llama a `acknowledgeAlerta` endpoint (ya existe en backend).
6. **ShadowRadar UI: mostrar estado ACK** — icono ✓ en alertas reconocidas + response_time_sec.
7. **ShadowAnalytics: tab "ACK Performance"** — `ack_rate` y `avg_response_time_sec` por línea/conductor.
8. **Bug "Document already exists"** en `alertas_regulacion`: migrar a `setDoc` con ID determinístico.
9. **Generalizar `CompetitorThreatWidget` a CUTCSA/COME/COETC** — hoy el prop `empresaPropia` viaja pero el algoritmo interno sigue usando `LINEAS_UCOT_BASE` (UCOT-only).
10. **Limpiar errores TS pre-existentes** (~98) en componentes de competition/forecast. Tech debt heredado.
11. **Verificar git rm de los 3 archivos legacy** (`OperationsIntelligenceHub.tsx`, `LiveMapPage.tsx`, `ServiceStatistics.tsx`) — si están todavía en HEAD, borrarlos desde Claude Code.

---

## 🐛 BUGS CONOCIDOS Y NO CRÍTICOS

- **Document already exists** en `alertas_regulacion`: ~100 warnings/sesión por colisión `addDoc` frontend vs `shadowDispatcher` backend.
- **Sesión auth se pierde con reloads** en localhost.
- **Errores TS pre-existentes** (~98) ocultos por cache incremental.
- **Truncamiento recurrente del Edit tool** en archivos grandes: la sesión actual sufrió 4 truncamientos (CEODashboard.tsx, CompetitorThreatWidget.tsx, App.tsx, Sidebar.tsx). Todos rescatados con Python `os.replace(tmp, path)` reconstruyendo desde `git show HEAD:`. Patrón documentado en CLAUDE.md.

---

## 📌 DECISIONES OPERATIVAS DE LA SESIÓN

(2026-04-24 sesión bis 2, ordenadas cronológicamente)

- **No tocar el CEODashboard legacy** durante Fase 1 V7 — directriz "no regresión de avances logrados". V7 vive paralelo en `/ceo-v7` para comparar.
- **Network Health Score 0-100** con pesos UITP: 40% OTP / 25% Bunching / 20% Cobertura / 15% Riesgo. Documentado en pantalla con tooltip.
- **KPIs canónicos de la industria** en lugar de inventados: Service Reliability (UITP), Bunching Index (NYC MTA), Service Delivery (TfL/Swiftly), Riesgo Operativo. Cada uno con explicación inline de qué mide.
- **Cada KPI linkea al módulo especializado** — el V7 NO recalcula lo que otros módulos ya calculan, sólo agrega y resume. Evita duplicación documentada en análisis previo.
- **Datos reales desde colecciones existentes**: corridor_overlap (matriz DRO), shapes_cross_operator, alertas_regulacion (24h window), incidencias, ServicioEstadoService.getByDate, /api/positions, FleetService.getVehicles. Cero datos mockeados.
- **Estados vacíos explicativos** en cada sección (Hot Zones, Market Share, Riesgos) — directriz "production-grade" / "Filosofía de producto".
- **Botones de período 7d/30d disabled con tooltip** "Próximamente — backend de históricos en construcción". No prometer features que no están listas.
- **Refuerzo directriz 7 en CLAUDE.md**: las pruebas son responsabilidad del agente. Si no puede ejecutar (sin acceso a la red de Windows, dev server no corriendo en sandbox, etc.), redacta orden completa pegable para Claude Code. **Nunca** decirle a Jonathan "probalo vos".
- **Sidebar muestra "⭐ Network Command v7"** con estrella para que Jonathan sepa cuál es el nuevo. Y "Dashboard CEO (legacy)" para indicar que el viejo está en sunset.

---

## ⚙️ RECORDATORIOS DE PROCESO

- Nunca hacer `git commit` desde el sandbox.
- Para edits sobre archivos >500 líneas: **Python atomic write** obligatorio.
- Para detectar truncamientos AUNQUE tsc diga 0 errores: usar
  `--tsBuildInfoFile /tmp/fresh.tsbuildinfo` para invalidar el cache incremental.
- Verificación funcional siempre la hace Claude. Si no puede, deja la orden
  completa pegable en SESION_ACTUAL.md para Claude Code (directriz 7 reforzada).
