# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

> **Para Claude (cualquier sesión nueva)**: este archivo es lo SEGUNDO que lees después de `CLAUDE.md`. Acá está dónde se quedó la sesión previa, qué decisiones se tomaron pendientes de implementar, y cuál es el próximo paso concreto. Antes de cerrar tu sesión, actualizalo con los nuevos pendientes.

> **Para Jonathan**: este archivo se actualiza automáticamente al final de cada sesión productiva. No lo borres ni lo edites manualmente — Claude lo gestiona.

**Última actualización:** 2026-04-24 (sesión bis 2 — V7 Network Command), Cowork

---

## 🎯 EN CURSO

Nada en curso. Sesión cerrada con **CEODashboardV7.tsx (Network Command)**
construido desde cero, ruta `/dashboard/traffic/ceo-v7` agregada, entrada en
sidebar con label "⭐ Network Command v7". El CEODashboard.tsx legacy queda
intacto (zero regresión, directriz operativa).

**Cambios sin commitear (working tree):**
- `frontend/src/pages/traffic/CEODashboardV7.tsx` (nuevo, ~720 líneas)
- `frontend/src/App.tsx` (+2 líneas: lazy import + route)
- `frontend/src/components/Sidebar.tsx` (+5 líneas: nueva entrada V7 + label legacy)
- `CLAUDE.md` (refuerzo de directriz 7: testing es responsabilidad del agente, nunca de Jonathan)
- `docs/SESION_ACTUAL.md` (este archivo)
- `docs/HISTORIAL_SESIONES.md` (entrada appendeada)
- (de la sesión bis 1) `frontend/src/pages/traffic/CEODashboard.tsx` y
  `frontend/src/components/CompetitorThreatWidget.tsx` (refactor cross-operador, ya documentado).

---

## 📋 PRÓXIMO PASO INMEDIATO — ORDEN PARA CLAUDE CODE

Pegar este bloque tal cual en Claude Code (cwd = `C:\Users\jonat\Desktop\PROYECTOS\GestionUcot`):

```
Continuamos la sesión de Cowork. Leé CLAUDE.md y docs/SESION_ACTUAL.md primero.

Tu trabajo:

1) VERIFICACIÓN FUNCIONAL DEL V7 (browser):
   - Levantá el dev server: cd frontend && npm run dev (esperá puerto activo)
   - Si Vite quedó corriendo de antes, reiniciálo (Ctrl+C y npm run dev otra vez) — el lazy chunk del CEODashboard fue editado y el cache puede mentir.
   - Navegá a http://localhost:3005/dashboard/traffic/ceo-v7 (o el puerto que use tu Vite — chequeá la consola que tira al levantar).
   - Confirmá:
     a. El header muestra "Network Command v7" + chip "CROSS-OPERADOR".
     b. El selector "Operador" arranca en UCOT y al cambiar a CUTCSA todas las métricas se recalculan.
     c. El gauge "Network Health" muestra un score 0-100 y los 4 sub-componentes (OTP / Bunch / Cover / Risk).
     d. La sección Hot Zones muestra top 5 corredores cross-operador o un mensaje de estado vacío explicativo.
     e. La sección Market Share muestra una tabla con buses propios vs rivales por línea, o estado vacío.
     f. La sección Riesgos muestra incidencias críticas / personal sin asignar / vehículos en taller (o "Sin riesgos críticos").
     g. El sidebar muestra dos entradas: "Dashboard CEO (legacy)" y "⭐ Network Command v7".

2) VERIFICACIÓN DEL LEGACY (zero regresión):
   - Navegá a http://localhost:3005/dashboard/traffic/ceo (el viejo).
   - Confirmá que sigue funcionando igual que antes + tiene el selector Operador en el header (refactor cross-operador previo).
   - Si está roto, escribí "## NOTA DE JONATHAN" arriba de SESION_ACTUAL.md describiendo el problema y avisame ANTES de commitear.

3) CHEQUEO PRE-COMMIT:
   - bash scripts/check_integrity.sh (exit 0 obligatorio)
   - cd frontend && npx tsc --noEmit --tsBuildInfoFile /tmp/fresh.tsbuildinfo -p tsconfig.app.json | grep -E "CEODashboardV7|App\.tsx|Sidebar\.tsx|CEODashboard\.tsx|CompetitorThreatWidget" (no debe haber output — los ~98 errores TS pre-existentes en otros archivos están aceptados como deuda).

4) COMMIT (un solo commit grande con todo):
   git add frontend/src/pages/traffic/CEODashboardV7.tsx frontend/src/pages/traffic/CEODashboard.tsx frontend/src/components/CompetitorThreatWidget.tsx frontend/src/App.tsx frontend/src/components/Sidebar.tsx CLAUDE.md docs/SESION_ACTUAL.md docs/HISTORIAL_SESIONES.md

   git commit -m "feat(ceo-dashboard): Network Command V7 + cross-operador refactor del legacy

- Crea /dashboard/traffic/ceo-v7 (Network Command V7) con Health Score 0-100,
  KPIs UITP-style (Service Reliability, Bunching Index, Service Delivery,
  Riesgo Operativo), Hot Zones desde corridor_overlap, Market Share live por
  línea desde GPS STM, panel de Riesgos compacto. Cross-operador desde el
  primer pixel (UCOT/CUTCSA/COME/COETC). Inspirado en Optibus Network Health,
  Swiftly Service Reliability, TfL EWT, NYC MTA Bunching Index, RATP Régularité.
- Cada KPI linkea a su módulo especializado (ShadowRadar, OTPDashboard,
  CorridorIntelligence, etc.) — evita duplicación de cálculos.
- Mantiene CEODashboard.tsx legacy intacto en /dashboard/traffic/ceo.
  Sidebar muestra ambos para comparación lado a lado.
- Refuerzo directriz 7 en CLAUDE.md: las pruebas son siempre responsabilidad
  del agente; si no puede ejecutar, redacta orden completa para Claude Code.

Verificado: tsc fresco 0 errores en archivos tocados. Integrity script OK.
Errores TS pre-existentes en otros componentes (~98) quedan como deuda.

Ref: directrices Alcance del producto + Filosofía de producto + Nivel
internacional por defecto en CLAUDE.md."

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
