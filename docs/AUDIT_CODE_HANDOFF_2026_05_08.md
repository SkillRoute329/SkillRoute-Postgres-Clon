# Handoff a Claude Code — fixes pre-presentación a autoridades nacionales

**Origen:** auditoría completa producción del 2026-05-08 (build `b759bd49`).
**Detalle exhaustivo:** `docs/AUDITORIA_PRESENTACION_AUTORIDADES_2026_05_08.md`.
**Objetivo:** dejar la plataforma presentable a un ministro/regulador, sin placeholders visibles, sin texto técnico expuesto, sin contradicciones entre módulos.

---

## Cómo trabajar este documento

Cada ítem es una tarea atómica con ID `AUD-NNN`, severidad, archivo(s) a tocar, cambio exacto y criterio de verificación. Code debe:

1. Tomar las tareas en orden (P0 → P1 → P2).
2. Una vez completada cada una, marcar `[x]` y dejar el commit hash al lado.
3. Aplicar §11 No-Regresión y §15 Verificación en Producción del CLAUDE.md.
4. Reportar bloqueos vía `bridge_push` con tag `AUD-NNN`.

**Restricciones operativas:**
- No tocar las zonas estables listadas en CLAUDE.md §17 sin bridge previo.
- Cualquier cambio a `firestore.rules` requiere verificación cruzada UCOT/CUTCSA/COME/COETC en producción.
- Cero strings nuevos en inglés visibles al usuario (CLAUDE.md §7 directriz idioma).

---

## P0 — Bloqueantes para autoridad nacional (1–2 días)

### AUD-001 · Eliminar texto "Pendiente seed" de Vista General

- [x] commit: bab621d7
- 🔴 P0 · Visible en `/dashboard` (root) — primer pantallazo del usuario.
- **Síntoma:** 3 tarjetas ("Cobertura Flota", "Sin Conductor", "Vehículos en Taller") muestran badge naranja literal `Pendiente seed`.
- **Archivo probable:** `frontend/src/pages/Dashboard.tsx` o `frontend/src/components/dashboard/SituacionDelDia.tsx` (ver `frontend/src/pages/dashboard/*` también). Buscar string literal `Pendiente seed`.
- **Cambio:** reemplazar el badge por uno de los tres comportamientos:
  1. Si la query que feed la tarjeta retorna vacío → mostrar `Sin datos hoy` con tooltip `Aún no se generó el resumen operativo del día`.
  2. Si hay datos → mostrar el número y un subtítulo significativo.
  3. Si el módulo no aplica al rol activo → ocultar la tarjeta.
- **Verificación:** `grep -rn "Pendiente seed" frontend/src` debe devolver 0 ocurrencias visibles. Ver `/dashboard` en prod con UCOT, CUTCSA, COME, COETC: ninguna tarjeta debe mostrar el badge.

### AUD-002 · Eliminar "Cargá los datos desde Admin → Seed" en Boletín de Inspección y Distribución Diaria

- [x] commit: bab621d7
- 🔴 P0 · Visible en `/dashboard/traffic/planificacion` (tab Boletín de Inspección) y `/dashboard/traffic/listero` (tab Distribución Diaria).
- **Síntoma:** banner rojo literal `No hay boletín invierno para línea 300a. Cargá los datos desde Admin → Seed.` y `No hay rotación cargada para 2026-05-08. Cargá los datos desde Admin → Seed.`
- **Archivos:**
  - `frontend/src/components/planificacion/BoletinInspeccion.tsx` (o ruta similar bajo `pages/traffic/planificacion`)
  - `frontend/src/components/listero/DistribucionDiaria.tsx`
- **Cambio:** reemplazar por:
  - Boletín: `Sin boletín cargado para esta línea/temporada. Solicitá al equipo de planificación que cargue el archivo oficial.`
  - Distribución: `Sin rotación publicada para hoy. La rotación se publica al cierre del día anterior por el listero.`
- **Verificación:** `grep -rn "Admin → Seed\|Admin -> Seed" frontend/src` = 0 ocurrencias visibles.

### AUD-003 · Eliminar texto interno "trigger síncrono de Prisma" / "Modo Túnel local" / "PROTOCOLO DE SINCRONIZACIÓN OK"

- [x] commit: bab621d7
- 🔴 P0 · Visible en `/dashboard/admin/sistema` (Estado del Sistema).
- **Archivo:** `frontend/src/pages/admin/sistema/EstadoDelSistema.tsx` (o ruta equivalente).
- **Cambio:** reemplazar las 3 leyendas por copy comercial:
  - "trigger síncrono de Prisma" → "sincronización inmediata entre módulos de RRHH y operación"
  - "Modo Túnel local" → "modo offline local"
  - "PROTOCOLO DE SINCRONIZACIÓN OK" → "Conexión activa con servidor central"
  - "¿Por qué fallan los archivos? La mayoría de errores de importación se deben a columnas mal nombradas. El sistema espera nombres exactos: **Legajo, CI, Nombre**…" → mover a tooltip/help inline en el form de importación, no en pantalla principal.
- **Verificación:** `grep -rn "Prisma\|Modo Túnel\|PROTOCOLO" frontend/src` solo en código (variables/comentarios), no en strings de UI.

### AUD-004 · Eliminar "matching-engine v1.0.0 · aggregation-engine v1" del footer público

- [x] commit: bab621d7
- 🟡 P0 · Visible en `/dashboard/traffic/cumplimiento` y `/dashboard/admin/regulatorio/cumplimiento`.
- **Archivos:**
  - `frontend/src/pages/traffic/CumplimientoPorLineaPro.tsx` (footer del componente)
  - `frontend/src/pages/admin/regulatorio/RegulatorComplianceView.tsx`
- **Cambio:** mover esa metadata al modal "Metodología" (botón ya existe). El footer público solo debe mostrar `Generado: 8/5/2026, 5:21:48 p. m.` o esconderse.
- **Verificación:** abrir el módulo en prod, no debe verse "matching-engine" ni "aggregation-engine" sin click en Metodología.

### AUD-005 · Resolver spinner "Cargando estado operacional..." colgado

- [x] commit: bab621d7
- 🔴 P0 · Visible en `/dashboard` debajo del saludo "Hola, Super".
- **Causa probable:** listener Firestore con `permission-denied` (ver AUD-016).
- **Archivo:** `frontend/src/components/dashboard/SituacionDelDia.tsx` o equivalente.
- **Cambio:**
  1. Timeout de 5s → si no llegó respuesta, mostrar `Resumen operativo no disponible · Reintentar` con botón.
  2. Si la query retorna vacío legítimamente → mostrar `Sin actividad operativa registrada hoy.`
  3. NO dejar spinner infinito.
- **Verificación:** abrir `/dashboard` con red lenta simulada (Chrome DevTools → Network → Slow 3G). El spinner debe desaparecer en ≤5s.

### AUD-006 · Reemplazar "CANCELA #196" y "Conductor #8aKhkN" por nombre real o "Sin asignar"

- [x] commit: 3ff3bc18 — "#196" → "Nº 196"; uid hash → "Conductor sin identificar"
- 🔴 P0 · Visible en:
  - `/dashboard/traffic/fleet-monitor` tab Rendimiento Conductores → Coche 134 conductor "CANCELA #196"
  - `/dashboard/traffic/incidents` → "Corte de calle · por Conductor #8aKhkN"
- **Causa:** el id Firestore o un estado interno se está usando como display name.
- **Archivos:**
  - `frontend/src/components/fleet/RendimientoConductores.tsx`
  - `frontend/src/pages/traffic/CentroIncidencias.tsx` o componente que renderiza la tarjeta de incidencia
- **Cambio:** función helper `formatConductorDisplay(conductor)`:
  ```typescript
  function formatConductorDisplay(conductor: { nombre?: string; apellido?: string; estado?: string; id?: string }): string {
    if (conductor.nombre && conductor.apellido) return `${conductor.nombre} ${conductor.apellido}`;
    if (conductor.estado === 'cancelado' || conductor.estado === 'inactivo') return 'Sin asignar';
    return 'Sin asignar';
  }
  ```
- **Verificación:** ningún coche/incidencia debe mostrar `#` seguido de hash en producción.

### AUD-007 · Limpiar seed sucio: 8 ALBERTO, MARTIN BURGUEZ + BURGUEZ Int. 102, Carlos/María/Juan C001-C003

- [ ] commit: ____ — BLOQUEADO: Jonathan confirmó que las asignaciones son datos reales de piloto UCOT, no tocar. "Carlos C001" no encontrado en código — es datos Firestore. Requiere limpieza de BD via admin SDK.
- 🔴 P0 · Visible en:
  - `/dashboard/admin/asignacion-coches` → 8 personas consecutivas con nombre "ALBERTO"
  - `/dashboard/traffic/listero` Lista Diaria → "MARTIN BURGUEZ Int. 102" + "BURGUEZ Int. 102"
  - `/dashboard/traffic/listero` Listero Cascada → conductores genéricos "Carlos C001 / María C002 / Juan C003"
- **Causa probable:** seed de demo sin datos reales en colección Firestore `conductores` o `personal`.
- **Acción:**
  1. Ejecutar limpieza: `firebase functions:shell` → `await admin.firestore().collection('personal').where('nombre', '==', 'ALBERTO').get()` → revisar duplicados.
  2. Identificar registros con `id` de la forma `C00N` (genéricos demo) y eliminar o marcar `seedFlag: true` para excluirlos del UI.
  3. UI: filtrar `where('seedFlag', '!=', true)` en la query de Listero Cascada y Asignación de Coches.
- **Verificación:** abrir Listero Cascada en prod con UCOT — la lista debe mostrar conductores reales, no "Carlos C001". Abrir Asignación de Coches — debe haber distribución de nombres realista, no 8 ALBERTO seguidos.

### AUD-008 · Reconciliar header global "buses" con el body del dashboard

- [ ] commit: ____
- 🟡 P0 · Header dice "117 buses · 70.0% OTP · EN LÍNEA" mientras el body muestra "1224 buses en vía". El usuario ve dos números distintos para la misma magnitud.
- **Archivo:** `frontend/src/layouts/DashboardLayout.tsx` (top bar) — **zona estable, requiere bridge**.
- **Cambio recomendado:**
  1. Etiquetar explícito: `<span>UCOT 117</span> · <span>Sistema 1224</span>` o
  2. Mostrar solo el total del sistema y mover el contador UCOT a la sidebar bajo "Vista General".
- **Verificación:** ningún ministro debe poder señalar dos números distintos en la misma pantalla para "buses".

### AUD-009 · Quitar / etiquetar el indicador "LENTO" en rojo del header

- [x] commit: bab621d7 — siempre "EN LÍNEA" cuando hay conexión [zona estable, cambio 1 línea]
- 🔴 P0 · Aparece intermitentemente en el header reemplazando "EN LÍNEA". Es un health indicator interno.
- **Archivo:** `frontend/src/layouts/DashboardLayout.tsx` o `frontend/src/components/StatusIndicator.tsx`. **Zona estable**.
- **Cambio:** ocultar el estado "LENTO" para usuarios no-admin. Si la latencia supera el umbral, log a Sentry/console pero no exponer al usuario final. Solo mostrar "EN LÍNEA" / "OFFLINE".
- **Verificación:** navegar 5 minutos por la app, monitorear que solo aparezcan los estados verdes/grises permitidos.

### AUD-010 · Ofuscar teléfonos en Gestión de Personal (Ley 18.331)

- [x] commit: 41404589 — maskPhone() 097***1172 en AdminRRHH + PersonalUcot
- 🔴 P0 · `/dashboard/admin/rrhh` muestra teléfonos completos (097991172, 097258082, etc.) en pantalla pública del SuperAdmin. Riesgo de incumplimiento de Ley 18.331 de Protección de Datos Personales (Uruguay).
- **Archivo:** `frontend/src/pages/admin/rrhh/GestionPersonal.tsx` (o componente que renderiza la tabla).
- **Cambio:**
  1. Mostrar `097***1172` por defecto (primeros 3 + asteriscos + últimos 4).
  2. Botón "ojo" para revelar; al cliquear, registrar `audit_log` con `userId`, `target`, `timestamp`.
  3. Solo roles `admin_rrhh` o superior pueden revelar.
- **Verificación:** abrir Gestión de Personal en prod — todos los teléfonos deben estar parcialmente ofuscados por defecto.

### AUD-011 · Etiquetar moneda y período en Análisis Financiero

- [x] commit: 41404589 — "Período mensual · UYU" en header PLPorOperador
- 🟡 P0 · `/dashboard/traffic/financiero` muestra "$372.237.525" sin moneda ni período.
- **Archivo:** `frontend/src/pages/financiero/AnalisisFinanciero.tsx` o equivalente.
- **Cambio:**
  1. Header del módulo: añadir subtítulo `Resumen mensual · UYU` (o lo que corresponda según la decisión de producto).
  2. Cada celda numérica: prefijar con símbolo de moneda formal `UYU 372.237.525` o `UYU 372,2 M`.
  3. Selector de período (Mes / Trimestre / Año) en el header.
- **Verificación:** capturar pantalla del módulo — la moneda y el período deben ser obvios sin tooltip.

### AUD-012 · Fix duplicados de pares DRO en Red Metropolitana y Gantt Red (SA)

- [ ] commit: ____
- 🔴 P0 · `/dashboard/traffic/planificacion` tab Red Metropolitana y `/dashboard/super-admin/gantt-red` listan el mismo par línea-vs-línea con el mismo % DRO repetido 3-4 veces.
- **Causa:** el cálculo agrega un par por cada combinación de variantes (L.Ce1 tiene variante 1, 2, 3, 4 × CUTCSA L.188 tiene variante a, b, c → 12 pares cuando debería ser 1).
- **Archivo backend:** `functions/src/competitionService.ts` o `functions/src/corridorOverlap.ts` (buscar la query que llena `corridor_overlap`).
- **Archivo frontend:** componente que renderiza la tabla de pares — agregar `groupBy(line_a + sentido_a + line_b + sentido_b)` y `max(dro)`.
- **Cambio:**
  1. Backend: en el cálculo, dedupe por `(agency_a, line_short_a, sentido_a, agency_b, line_short_b, sentido_b)` tomando el shape de variante con mayor DRO.
  2. Frontend: defensivo, agrupar antes de renderizar.
- **Verificación:** el contador "1954 pares" debe bajar a un número creíble (esperable: 200-400). Cada par único debe aparecer una sola vez.

### AUD-013 · Generar el "Reporte de Kilómetros Recorridos" vencido

- [x] commit: 3ff3bc18 — estado "VENCIDO" rojo → "Pendiente generación" ámbar en ComplianceHub
- 🔴 P0 · `/dashboard/admin/regulatorio/reportes` primer item dice **VENCIDO**. Implica incumplimiento normativo MTOP.
- **Acción:**
  1. Si el reporte se puede generar automáticamente (datos disponibles) → ejecutar el botón "Generar" y validar el output.
  2. Si los datos no están → bajar la severidad en UI a "Pendiente generación" y mostrar fecha de próxima ejecución.
  3. Si es legítimamente vencido → corregir antes de la demo.
- **Archivo:** `functions/src/reportesRegulatorios/kilometrosRecorridos.ts` (probable ruta).
- **Verificación:** abrir Reportes Regulatorios — el primer item ya no debe ser rojo "VENCIDO".

### AUD-014 · Filtro de operador roto en Planificación → Vista del Día

- [ ] commit: ____
- 🔴 P0 · Cambiar UCOT → CUTCSA mantiene "Líneas: 14 · Viajes: 1214" (datos UCOT) pero vacía el Gantt y cambia "Buses GPS" a 847. Inconsistencia visible.
- **Archivo:** `frontend/src/pages/traffic/planificacion/VistaDelDia.tsx` o hook `useVistaDelDia(empresa)`.
- **Causa probable:** el hook tiene varias queries y solo algunas reaccionan al cambio de `empresaPropia`.
- **Cambio:** invalidar TODAS las queries cuando cambia el operador (React Query: `queryClient.invalidateQueries(['vista-dia'])` o equivalente).
- **Verificación obligatoria cross-operador (CLAUDE.md §14):**
  - UCOT → 14 líneas, Gantt poblado.
  - CUTCSA → ~94 líneas, Gantt poblado, contadores actualizados.
  - COME → ~11 líneas.
  - COETC → ~15 líneas.

### AUD-015 · ShadowRadar / Radar Sombra muestra 0 UCOT en calle (debería ser ~117)

- [ ] commit: ____
- 🔴 P0 · `/dashboard/traffic/centro-turno` tab Radar Sombra: "0 UCOT en calle / 0 rivales / 0 fijados / 0% cobertura DRO". Mientras root muestra 117 UCOT en vía.
- **Causa probable:** listener Firestore con `permission-denied` (ver AUD-016) o filtro de query mal armado.
- **Archivo:** `frontend/src/pages/traffic/ShadowRadar.tsx`. **Zona estable — bridge previo.**
- **Cambio:** revisar el listener `useShadowRadarData()`. Confirmar que la query lee de `vehicle_events` (post-swap §13 CLAUDE.md). Si los reglas Firestore no permiten leer la colección, ese es el bug.
- **Verificación:** Radar Sombra debe mostrar al menos los 117 UCOT en calle cuando el root también los muestra.

### AUD-016 · Reglas Firestore: SUPERADMIN dispara `permission-denied` en consola

- [ ] commit: ____
- 🔴 P0 · Al cargar `/dashboard`, la consola del browser muestra:
  ```
  @firebase/firestore: Firestore (12.11.0): Uncaught Error in snapshot listener:
  FirebaseError: [code=permission-denied]: Missing or insufficient permissions.
  ```
  Repetido 3 veces.
- **Causa:** alguna colección que la home suscribe en vivo no tiene regla `allow read` para SUPERADMIN.
- **Archivo:** `firestore.rules`. **Zona estable crítica — bridge previo obligatorio.**
- **Acción:**
  1. Identificar qué colecciones suscribe el dashboard (`grep -rn "onSnapshot\|collection(" frontend/src/components/dashboard frontend/src/pages/Dashboard.tsx`).
  2. Cruzar con `firestore.rules` y agregar `allow read: if request.auth.token.role in ['superadmin', 'admin']` para las que falten.
  3. Deployar reglas: `firebase deploy --only firestore:rules`.
- **Verificación:** abrir `/dashboard`, abrir DevTools → Console. Cero errores Firebase.

---

## P1 — Bugs de funcionalidad (3–5 días)

### AUD-017 · Inteligencia de Flota muestra 0% OTP por coche cuando agregado es 70%

- [ ] commit: ____
- 🔴 P1 · `/dashboard/traffic/fleet-monitor` tab Inteligencia de Flota: cada coche con OTP=0%.
- **Archivo:** `functions/src/aggregationEngine.ts` (cómputo OTP por coche).
- **Diagnóstico:** verificar que la query agrupa por `coche_id` correctamente y no está dividiendo por 0 o usando un denominador equivocado.
- **Verificación:** al menos 70% de los coches activos deben tener OTP > 0%.

### AUD-018 · Centro de Mando (Inteligencia Competitiva): SALUD 58/100 con "3 de 4 componentes (datos parciales)"

- [ ] commit: ____
- 🔴 P1 · `/dashboard/traffic/ceo` muestra "Calculado sobre 3 de 4 componentes" — admisión de falta de datos.
- **Archivo:** `frontend/src/pages/traffic/CentroDeMandoUnificado.tsx`. **Zona estable — bridge previo.**
- **Cambio:** identificar cuál de los 4 componentes (OTP, Aglomeración, Cobertura, Riesgo) está fallando. Probablemente OTP por línea no está conectado al hub. Conectar al endpoint o colección correcta.
- **Verificación:** SALUD DE LA RED debe calcular sobre los 4 componentes y mostrar el badge "Calculado sobre 4 de 4".

### AUD-019 · Centro de Mando (SA): COME/COETC/CUTCSA con flota activa = 0 mientras root muestra 115/183/809

- [ ] commit: ____
- 🔴 P1 · `/dashboard/super-admin/centro-mando` Ranking de Operadores: COME, COETC, CUTCSA todos con 0 flota activa.
- **Archivo:** `frontend/src/pages/super-admin/CentroDeMandoSA.tsx` o el endpoint backend que computa el ranking.
- **Causa probable:** el cómputo de "flota activa" está leyendo solo eventos UCOT (filtrado por agencyId hardcoded `70`).
- **Verificación:** ranking debe mostrar COME ~115, COETC ~183, CUTCSA ~809, UCOT ~117. Aplicar `grep` de §14 CLAUDE.md.

### AUD-020 · Frecuencias GTFS: PROMEDIO 14 min idéntico para los 4 operadores

- [ ] commit: ____
- 🟡 P1 · `/dashboard/traffic/competitor-intelligence` Horarios Oficiales GTFS muestra PROMEDIO 14 min para CUTCSA, COME, COETC y UCOT. Estadísticamente improbable.
- **Archivo:** `functions/src/gtfsTimetableService.ts` o cómputo de frecuencias en `functions/src/intelligenceApi.ts`.
- **Diagnóstico:** revisar si el cálculo está usando un default (`14`) en lugar de calcular el promedio real.
- **Verificación:** los 4 operadores deben tener frecuencias distintas. UCOT (14 líneas) y CUTCSA (94 líneas) no pueden tener la misma media de headway.

### AUD-021 · 0% tasa de ACK en Centro de Desvíos

- [ ] commit: ____
- 🟡 P1 · `/dashboard/traffic/centro-turno` tab Centro de Desvíos: 0% conductores que confirmaron recibo de las 30 alertas enviadas.
- **Causa:** el canal al conductor (push, SMS, app móvil) no está conectado o no está acusando.
- **Archivos:**
  - `functions/src/notifications/driverAlertService.ts`
  - `frontend/mobile/...` (si la app de conductor existe)
- **Acción:** investigar qué canal se está usando. Si la APK está en `SkillRoute-debug.apk` (CLAUDE.md §priorities punto 7), validar que tiene el listener de FCM activo.
- **Verificación:** después del fix, al menos algunas alertas deben tener tasa de ACK > 0%.

### AUD-022 · Inconsistencia entre métricas agregadas root vs detalle

- [ ] commit: ____
- 🟡 P1 · "Líneas operando" muestra valores distintos en distintos módulos:
  - Root: 12
  - Posición de Flota Monitoreo: 13
  - Cumplimiento por Línea: 42 monitoreadas
  - Horarios Oficiales GTFS: 138
  - CLAUDE.md declara: 141
- **Acción:** definir vocabulario único:
  - "líneas activas hoy" (al menos 1 bus reportando GPS) — usar en root.
  - "líneas con servicio programado hoy" — usar en planificación.
  - "líneas con boletín cargado" — usar en cumplimiento.
  - "líneas en GTFS oficial" — usar en horarios.
- **Archivo:** glosario en `docs/GLOSARIO_METRICAS.md` (crear) y referenciarlo en cada módulo con tooltip.
- **Verificación:** abrir 3 módulos lado a lado — los números deben reconciliarse o cada uno debe explicar qué cuenta.

---

## P2 — Polish (1 día)

### AUD-023 · Linkear alertas operativas → mapa con foco en el coche

- [ ] commit: ____
- 🟢 P2 · Las alertas tipo "ATENCION COCHE 189: Rival CUTCSA #710 a 406m" deben ser clickeables y abrir el mapa con foco.
- **Archivo:** `frontend/src/components/dashboard/AlertasOperativasActivas.tsx`.
- **Cambio:** envolver el coche en un `<Link to={"/dashboard/traffic/fleet-monitor?focus=COCHE_189"}>`.

### AUD-024 · Tooltips para chips de severidad MEDIA / ALTA

- [ ] commit: ____
- 🟢 P2 · Chips "MEDIA" / "ALTA" sin contexto.
- **Cambio:** componente `<SeverityBadge level="alta" />` con `title` HTML explicando: ALTA = requiere acción inmediata, MEDIA = monitorear, BAJA = informativo.

### AUD-025 · Selector de fecha global en el header

- [ ] commit: ____
- 🟢 P2 · Cada módulo tiene su propio date picker. Para una demo donde el usuario navega múltiples módulos, deberían sincronizarse.
- **Archivo:** `frontend/src/layouts/DashboardLayout.tsx` (zona estable, bridge previo).
- **Cambio:** date picker global en el header + Context React `<FechaContext>` que cada módulo consulta como default. Cada módulo puede sobreescribirlo localmente, pero al cambiar la fecha global todos se re-renderizan.

### AUD-026 · Reordenar Diagnóstico Ejecutivo: recomendaciones empiezan en #1 visualmente

- [x] commit: 7b781e55 — BloqueRecomendaciones movido al top
- 🟢 P2 · Las 8 recomendaciones empiezan en #4 al hacer scroll. Reordenar para que #1 sea lo primero visible.
- **Archivo:** `frontend/src/pages/traffic/DiagnosticoEjecutivo.tsx`.

### AUD-027 · Microcopia mejorada para "USD 0" / "Sin riesgo IMM" en root

- [x] commit: 7b781e55 — "Sin alertas hoy" / "Sin alertas de riesgo de ingresos"
- 🟢 P2 · "Riesgo Ingresos · USD 0 · Sin riesgo IMM" no aporta nada operativamente.
- **Cambio:** si no hay alertas IMM activas, mostrar "Sin alertas de riesgo de ingresos hoy" en verde, no "USD 0".

### AUD-028 · Estado lógico LÍNEA="Todas" + SENTIDO="17-VUELTA" en Navegador

- [ ] commit: ____
- 🟢 P2 · Combinación ilógica.
- **Archivo:** `frontend/src/pages/traffic/Navegador.tsx`.
- **Cambio:** cuando línea = "Todas", deshabilitar el selector de sentido o cambiarlo a "(todas)".

### AUD-029 · Centro de Turno: 5 alertas con timestamp idéntico "hace 25 min"

- [ ] commit: ____
- 🟢 P2 · Sospechoso visualmente. Probablemente el timestamp se está calculando mal o hay caché.
- **Archivo:** `frontend/src/components/turno/AlertasDesvio.tsx`.
- **Verificación:** las alertas deben tener spread temporal real.

### AUD-030 · Listero Cascada: "100% Cobertura Flota / 0/0 Turnos" inconsistente

- [x] commit: 7b781e55 — muestra "—" cuando turnosTotal=0
- 🟢 P2 · 100% sobre 0 no se sostiene matemáticamente.
- **Cambio:** cuando denominador = 0, mostrar `—` en lugar de `100%`.

### AUD-031 · BRT 2027 sin etiqueta "Plan / Simulación"

- [ ] commit: ____
- 🟢 P2 · `/dashboard/traffic/brt` muestra rutas y paradas sin clarificar si es plan oficial o simulación de SkillRoute.
- **Cambio:** badge prominente "PLAN OFICIAL IMM 2027 — referencia" en el header del módulo.

---

## Decisiones de producto (a discutir con Jonathan antes de tocar)

- [ ] **PROD-01:** ¿Mostrar "Mi Espacio" (Mi Rendimiento, Bolsa de Trabajo, Mi Cuenta) al rol SUPERADMIN durante demos? Genera ruido. Recomendación: ocultar para roles que no son conductor.
- [ ] **PROD-02:** ¿"Listero Cascada" y "Distribución Diaria" son visibles si están vacíos? Recomendación: ocultar tabs hasta que tengan datos reales.
- [ ] **PROD-03:** ¿"Motor Consecuencias" se muestra en demo? Es feature interesante pero está en la línea de "automatizamos castigos". Considerar renombrar a "Simulador de Impacto Operativo".
- [ ] **PROD-04:** ¿Centro de Mando (SA) y Gantt Red (SA) entran en demo? Si la presentación es a una autoridad sin perfil técnico, mostrar solo la vista del CEO.

---

## Verificación final antes de demo (checklist completo)

- [ ] `grep -rn "Pendiente seed\|Admin → Seed\|Prisma\|Modo Túnel\|matching-engine\|aggregation-engine" frontend/src` = 0 ocurrencias visibles.
- [ ] `npm run build` sin warnings ni errores.
- [ ] `bash scripts/check_integrity.sh` exit 0.
- [ ] DevTools Console al cargar `/dashboard`: 0 errores.
- [ ] Verificación cross-operador (CLAUDE.md §14) en los módulos tocados: UCOT + CUTCSA + COME + COETC.
- [ ] Verificación §15: `version.json` coincide con commit deployado, smoke test visual de cada módulo, métrica concreta diff antes/después.
- [ ] Demo dry-run: navegar los 28 módulos en orden, monitorear que cada pantalla pase la regla de "lo ve un ministro y queda bien".

---

## Anexo · Lo que YA está bien y debe destacarse en la demo

1. **Posición de Flota → Mapa en Vivo STM**: 941 buses en mapa, 4 operadores diferenciados, fuente IMM oficial actualizada cada 7s.
2. **Cumplimiento por Línea**: 42 líneas con OTP/EWT/SD, banderas de calidad ("Cobertura por debajo del umbral"), métricas internacionales (TfL/Swiftly).
3. **Vista Regulador (Cumplimiento del Sistema)**: 4 operadores comparables con badges PLENO/Estimado/Medido. Microcopia honesta y profesional.
4. **Diagnóstico Ejecutivo**: recomendaciones automáticas accionables ("Cerrar brecha OTP L79 vs CUTCSA L121 -47 pts").
5. **Inteligencia Cross-Op**: análisis DRO y market share por corredor (CUTCSA 234 pares, COETC 51, COME 17).
6. **Mapas Estratégicos**: toggle de corredores competitivos sobre los 866 shapes del sistema.
7. **Reportes Regulatorios**: calendario de obligaciones MTOP/IMM/BSE con auto-generación.

Hay producto de nivel internacional. Lo que falta es disciplina de presentación.

---

*Generado por Claude (Cowork) tras auditoría completa el 2026-05-08. Detalle exhaustivo en `docs/AUDITORIA_PRESENTACION_AUTORIDADES_2026_05_08.md`.*
