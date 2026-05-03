# Plan Sprint Lunes — Presentación Gerente Tecnología CUTCSA

**Deadline:** Lunes 4 mayo 2026 (5 días hábiles desde 2026-04-29).
**Audiencia:** Gerente General de Tecnología (ingeniero) + posibles miembros de su equipo.
**Stake:** Validación técnica del producto. Si falla, no hay segunda oportunidad con CUTCSA.

---

## 0. Diagnóstico honesto antes de empezar

### El sistema HOY no aprueba una auditoría técnica

Un ingeniero hace 4 cosas en los primeros 5 minutos: abre DevTools, navega 3 módulos al azar, contrasta números entre pantallas, y mira el código fuente del bundle. Hoy:

1. **DevTools muestra `TypeError: re is not a constructor` en CEO Dashboard** — la pantalla principal para directivos crashea. Imposible de defender.
2. **Análisis Financiero usa datos sintéticos**: las 186 líneas reportan exactamente $17.640/día con 14 viajes y 28 pax/viaje. Cualquier ingeniero que revise dos filas detecta el mock. Es **demo killer**.
3. **Cumplimiento oscila entre 55% y 100% OTP** en 18 minutos sin razón explicable. Sugiere que el algoritmo asume "100% en tiempo" cuando no encuentra boletín de comparación. Pregunta obligada: "¿cómo calculás el OTP?". Sin respuesta sólida, cae el módulo.
4. **Hardcodes "CUTCSA" en 7 H1** mientras la sesión filtra UCOT. Lectura inmediata: software a medio terminar.
5. **Datos sucios visibles**: nombre de conductor "2+00+0", líneas "EDO/OMETRO/UNKNOWN", fechas "Invalid Date", strings en inglés ("Unit", "WithDamages", "DRIVER").

### Lo que SÍ aguanta auditoría técnica (preservar intacto)

1. **Fleet Monitor** — 1.095 buses live del IMM en mapa Leaflet con bunching detection (367 incidentes hoy). Ese cálculo cross-operador es exactamente el diferencial técnico que un ingeniero de transporte respeta.
2. **Radar de Competencia** — 104 buses UCOT, 13 líneas activas, ranking con % flota en disputa por línea. Topónimos reales, datos diferenciados, semaforización roja/amarilla/verde.
3. **Inteligencia Cross-Op (Corredores)** — 824 pares analizados, 1.392 km de red compartida, métricas DRO basadas en TCRP 195 (estándar académico que el ingeniero reconocerá). Aritmética verificada (Δ DRO correcto).
4. **Incidencias** — 5 abiertas con coords GPS reales y categorización. Solo necesita reemplazar UID por nombre.
5. **BRT 2027** — análisis estratégico ante reforma del transporte de Montevideo. Contenido sólido y bien estructurado.

### Conclusión sin filtros

**Hoy: NO está listo para esa reunión.**
**Con 5 días de Sprint enfocado solo en P0 + P1: SÍ puede estar listo.**
**Con guion de demo que esquive lo frágil y entregue solo lo robusto: SÍ se gana la presentación.**

---

## 1. Reglas vinculantes del Sprint (no negociables)

1. **Cero features nuevas.** Cada minuto que se gaste en algo nuevo es un minuto menos para arreglar lo roto.
2. **No-regresión obligatoria** (CLAUDE.md §11). Cada commit pasa: tsc + tests + integrity + verificación visual de 3 módulos pre-existentes (Fleet Monitor, Cumplimiento, Cross-Op).
3. **Cowork no toca archivos críticos compartidos** (CLAUDE.md §10). Esos los toca Claude Code en Windows.
4. **Verificación en producción excluyente** (CLAUDE.md §12). Hasta que el fix se confirme en https://ucot-gestor-cloud.web.app sin error rojo en consola, la tarea NO está cerrada.
5. **Toda UI en español.** Cualquier string en inglés visible al usuario es bug y se corrige al primer toque del archivo.
6. **Ningún módulo entra al guion de demo si:** (a) tiene error en consola, (b) los datos no son verificables matemáticamente, (c) muestra "CUTCSA" hardcodeado.

---

## 2. Cronograma de 5 días

### Día 1 — Miércoles 30 abril · Cierre de bloqueantes P0

**Responsable principal: Claude Code (Windows nativo).**

Objetivos:

- **CR-1 · Centro de Mando crash** — identificar el `useMemo` en `frontend/src/pages/CEODashboardV7.tsx` (o componente lazy) que llama `new X()` donde `X` no es constructor. Patrón típico: import default vs named, o clase tree-shakeada por el bundler. Fix: arreglar el import o agregar `if (typeof X !== 'function') return null` defensivo.
- **CR-2 · `RoadAlertService.getAll permission-denied`** — agregar regla en `firestore.rules` para colección `road_alerts` con `allow read: if isAdminNorm() || isTrafficOrAdmin();`. **Verificación:** abrir DevTools en /dashboard, no debe aparecer FirebaseError en Console.
- **CR-3 · Índice faltante `service_matrices`** — agregar a `firestore.indexes.json` el índice compuesto (empresaId ASC, createdAt DESC) y deploy. **Verificación:** abrir Planificación → Matriz de Servicio, debe renderizar contenido.
- **CR-4 · `AuthContext` cache local** — asegurar que la regla `users/{uid}` permite `read: if request.auth.uid == uid` antes de cualquier otro chequeo. **Verificación:** F5 en /dashboard, header debe pasar de "INT #----" a "INT #329" en menos de 5 segundos.
- **CR-5 · `ServiceCategoryManager permission-denied`** — completar regla de `service_categories` en `firestore.rules`.

Cierre del día: deploy a producción, abrir cada módulo afectado en browser limpio, confirmar consola sin error rojo. Commit: `fix(p0): cerrar 5 bloqueantes auditados QA — CEO useMemo + 4 reglas Firestore + índice service_matrices`.

### Día 2 — Jueves 1 mayo · Cross-operador correcto + datos auditables

**Responsable principal: Cowork (preparar) + Code (aplicar en archivos críticos).**

Objetivos:

- **AL-3 · Eliminar literales `'CUTCSA'`** en 7 H1 hardcoded. Mapeo:
  - `Planificación → Gestor de Cartones` ← `Planificación / Cartones`
  - `Listero → CUTCSA — Terminal Listero` ← `Terminal Listero — {empresa}`
  - `Distribución Diaria — CUTCSA` ← `Distribución Diaria — {empresa}`
  - `Navegador — CUTCSA` ← `Navegador — {empresa}`
  - `Radar de Flota en Vivo — CUTCSA` ← `Radar de Flota en Vivo — {empresa}`
  - `Proyecciones Económicas — CUTCSA` ← `Proyecciones Económicas — {empresa}`
  - `Posición competitiva de CUTCSA en el sistema metropolitano` ← `Posición competitiva de {empresa} en el sistema metropolitano`
- Patrón: consumir `useEmpresaPropia()` (hook ya existente). NO modificar el hook.
- **AL-1 · Tabs UCOT/CUTCSA/COME/COETC funcionales en Planificación** — copiar el componente `EmpresaSelector` que ya funciona en Cumplimiento.
- **AL-2 · Botón "Editar" en Planificación** — apuntar al modal o ruta existentes.

Cierre del día: pasar 4 pantallas (Planificación, Listero, Navegador, Cross-Op) por 4 valores de empresa, confirmar que el H1 cambia y los datos cambian.

### Día 3 — Viernes 2 mayo · Datos demoables (la auditoría más dura)

**Responsable: Code + análisis de datos.**

Objetivos críticos:

- **Auditoría Cumplimiento OTP** — investigar por qué oscila 55%↔100%. Hipótesis: cuando no hay boletín cargado para la temporada, el algoritmo asume `desviacion = 0` y por tanto "en tiempo". Fix: si no hay boletín, el render debe ser "Sin datos de horario programado", NO "100% en tiempo". **Esto es lo que va a preguntar el ingeniero.** Fundamental.
- **Decisión sobre Análisis Financiero**:
  - Opción A (recomendada): SACAR del demo. La data sintética (todas las líneas con $17.640) no aguanta inspección.
  - Opción B: cargar números reales por línea desde Excel UCOT. Riesgo: si quedan inconsistentes, peor que sacarlo.
- **MD-4 · Incidencias UID → nombre** — join contra `users/{uid}` para mostrar nombre del conductor. Fallback "Conductor #{uid.slice(0,6)}".
- **MD-5 · Alertas RIVAL_PISANDO_TURNO con detalle** — render `RIVAL_PISANDO_TURNO · L300 vs COETC LCE1 · 14:32 · MEDIA` en vez de label suelto.
- **MD-6 · Cobertura "100% sobre 0/0 turnos"** — si totalTurnos = 0, mostrar "—" o "Sin turnos programados".
- **MD-7 · Líneas operando con contexto** — tooltip "Datos GPS vivos IMM, refresco 30s. Si UCOT está en paro, este número baja temporalmente."

### Día 4 — Sábado 3 mayo · Limpieza de datos sucios + cosmético P2/P3

Objetivos:

- **MD-1 · Mantenimiento "Invalid Date" + traducciones** — parsear Timestamp Firestore con `t.toDate?.()` y formatear `Intl.DateTimeFormat('es-UY')`. Traducir Unit/WithDamages/General.
- **MD-2 · Asignación de Coches** — sanitizar nombres con `/^[\d\W]+$/` para descartar fórmulas Excel ("2+00+0"). Mapear `DRIVER → Conductor`.
- **MD-3 · Inspectores líneas rotas** — filtrar fragmentos `EDO/OMETRO/TNAL/ILLA/Y/A/L/PQ/UNKNOWN` al render.
- **MD-8 · Header skeleton** mientras AuthContext recupera (mostrar `INT #—` con guion EM en vez de `INT #----`).
- **MD-9 · Centro de Turno 0 coches** — alinear con badge buses, o tooltip que distingue "asignados" vs "GPS reportando".
- **MD-10 · Personal "(691) vs 0 empleados"** — corregir contador del tab.
- **AL-7/AL-8 · Mensajes de estado vacío** en Listero y Boletín con instrucción accionable.
- **BJ-3 · `<title>` "SkillRoute"** en lugar de "TransForma Fácil 2.0 | Gestión UCOT".
- **BJ-4/BJ-5 · Redirects** /navegador → /navigation, /posicion → /fleet-monitor.

### Día 5 — Domingo 4 mayo · Ensayo de demo + plan B

Tarde / noche:

- Recorrer el guion de demo (ver doc `GUION_DEMO_GERENCIA_TECNOLOGIA.md`) en el laptop con el que se va a presentar.
- Cronómetro: cada módulo debe abrir en menos de 4 segundos. Si supera 8s, optimizar o sacarlo.
- Tener Plan B preparado para cada módulo: ¿qué decir si el ingeniero pide algo no preparado? Respuesta corta y honesta.
- Snapshot del estado de producción a las 23:00 del domingo. Si el lunes hay algo raro, comparar con el snapshot.

---

## 3. División de roles Cowork ↔ Code (no improvisar)

| Tarea | Cowork (sandbox Linux) | Code (Windows nativo) |
|---|---|---|
| Editar `firestore.rules` | NO (archivo crítico) | SÍ |
| Editar `useEmpresaPropia.ts`, `App.tsx`, `intelligenceApi.ts` | NO | SÍ |
| Editar pantallas individuales (`<400 líneas`) para reemplazar literales | SÍ | SÍ |
| Correr `npx tsc --noEmit`, `npm run build`, `bash scripts/check_integrity.sh` | NO (mount inyecta NULs) | SÍ |
| Verificar consola browser de producción | SÍ (vía Chrome MCP) | SÍ |
| `git add/commit/push` | NO | SÍ |
| Análisis estático y diagnóstico | SÍ | SÍ |
| Redactar mensajes de commit | SÍ | — |

**Workflow:** Cowork prepara los cambios pequeños y deja "PRÓXIMO PASO INMEDIATO" en `docs/SESION_ACTUAL.md` con el commit message redactado. Jonathan abre Claude Code y le dice "leé SESION_ACTUAL.md, ejecutá el próximo paso, commiteá y push". Code aplica, verifica, y deja confirmación en `cowork-tools/bridge/inbox.md` con status DONE.

---

## 4. Criterios de cierre del Sprint (no se cierra hasta cumplir todos)

Antes del lunes 9:00, deben cumplirse 7 puntos:

1. **DevTools sin errores rojos** en estas 6 rutas:
   - `/dashboard`
   - `/dashboard/traffic/fleet-monitor`
   - `/dashboard/traffic/diagnostico-cumplimiento`
   - `/dashboard/traffic/competitor-intelligence`
   - `/dashboard/traffic/corridor-intelligence`
   - `/dashboard/traffic/incidents`
2. **CEO Dashboard renderiza** algo (aunque sea estado vacío con explicación).
3. **Cumplimiento OTP estable**: dos snapshots con 15 min de diferencia tienen variación < 10%, no 55%↔100%.
4. **Ningún H1 dice "CUTCSA"** cuando el filtro activo es UCOT.
5. **Cero `Invalid Date`, cero `2+00+0`, cero `UNKNOWN`** en pantallas demoables.
6. **Tests:** `npm test` 22/22 + `npx tsc --noEmit` exit 0 + `bash scripts/check_integrity.sh` exit 0.
7. **Build de producción** desplegado y verificado vivo.

Si alguno falla, no se hace la presentación con esos módulos. Se ajusta el guion.

---

## 5. Stop-loss honesto

Si para el viernes 23:00 NO se cerraron los 5 P0 + AL-3 (CUTCSA hardcoded), la recomendación es **mover la reunión 1 semana**. Mejor pedir 7 días que destrozar la credibilidad en una demo rota.

---

*Generado 2026-04-29 · sin features nuevas, solo cierre de bugs identificados en QA producción · cumple no-regresión §11 + verificación excluyente §12.*
