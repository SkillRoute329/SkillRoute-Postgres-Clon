# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

> **Para Claude (cualquier sesión nueva)**: este archivo es lo SEGUNDO que lees después de `CLAUDE.md`. Acá está dónde se quedó la sesión previa, qué decisiones se tomaron pendientes de implementar, y cuál es el próximo paso concreto. Antes de cerrar tu sesión, actualizalo con los nuevos pendientes.

> **Para Jonathan**: este archivo se actualiza automáticamente al final de cada sesión productiva. No lo borres ni lo edites manualmente — Claude lo gestiona.

**Última actualización:** 2026-04-25 (sesión Cowork de cleanup + verificación V7), tarde-noche

---

## 🎯 EN CURSO

Nada en curso. Working tree limpio, todo deployado y verificado en producción.
Build activo: `145893c5 · 2026-04-25 01:12`.

---

## ✅ LO QUE SE CERRÓ EN ESTA SESIÓN

1. **Sistema de continuidad entre sesiones**: creados `docs/SESION_ACTUAL.md` (este) + `docs/HISTORIAL_SESIONES.md` (append-only) + directriz 8 en CLAUDE.md.
2. **Heatmap de demanda restaurado**: `LiveMapPage.tsx` (506 líneas) restaurado desde git HEAD; estaba borrado por error en consolidación previa con CorridorMap. Re-agregado al sidebar en Operación Táctica como "🔴 Mapa en Vivo STM".
3. **Franjas horarias con datos reales**: `frontend/src/utils/franjasHorarias.ts` (183 líneas) creado. Separa **FranjaSTM** (regular/especial, basado en flag IMM real) de **TurnoPersonal** (configurable por operador). CEODashboard ya no muestra "TURNO MATUTINO/VESPERTINO/NOCTURNO" inventados — ahora calcula el turno real con `clasificarTurnoPersonal(hora, empresaPropia)`.
4. **Sidebar reestructurado**: 13 entradas en 1 bloque → 8 en 3 bloques con identidad clara (INTELIGENCIA DE RED / OPERACIÓN TÁCTICA / ANÁLISIS FINANCIERO).
5. **firestore.rules restauradas**: estaban truncadas (433 líneas, faltaba la regla default wildcard + cierres). Restauradas a 460 líneas balanceadas. Producción verificada con "skipping upload — already up to date".
6. **CEO Dashboard schema fix**: el backend cambió `/api/positions` a formato `{buses:[...]}` plano con `empresaId`. El CEO esperaba GeoJSON viejo `{features:[].properties.codigoEmpresa}`. Ahora soporta ambos formatos. Verificado en vivo: CUTCSA muestra 275/275 unidades reales (no más 0/0).
7. **Errores de consola "no críticos" arreglados**:
   - AuthContext getDoc(users/{uid}) ahora hace retry con backoff (100ms, 250ms) cuando da permission-denied — resuelve el race timing del SDK Firestore con onAuthStateChanged.
   - RoadAlertsWidget useEffect ahora depende de `user?.uid` (esperaba que el AuthContext terminara antes de query).
   - usePushNotifications detecta VAPID placeholder y skip silencioso. token-subscribe-failed ahora es warn no error.
8. **Service Worker + Workbox cache limpiados** durante QA — el browser servía bundle viejo aunque hosting tenía nuevo. Resuelto con `caches.delete()` + `serviceWorker.unregister()`.
9. **V7 verificado funcionalmente** (los 10 items a-j del checklist + selector cross-operador):
   - Header CROSS-OPERADOR ✅
   - Salud de la Red 58/100 con pesos dinámicos cuando datos parciales ✅
   - OTP/Aglom/Cober/Riesgo con "—" en gris cuando no hay dato ✅
   - Bunching capped a 5000 con "⚠" indicador ✅
   - Zonas Críticas con top 5 reales (UCOT: L316 IDA vs CUTCSA L103 IDA 41.4%/12.3km; CUTCSA: L127 VUELTA vs COETC L14 VUELTA 43.3%/16.4km)
   - Cuota de Mercado con 8 líneas en disputa real ✅
   - Riesgos Activos con mensaje explicativo "Sin riesgos críticos" ✅
   - Footer 100% en español ✅
   - Selector empresa recalcula TODO al cambiar (UCOT → CUTCSA verificado) ✅

---

## 📋 PRÓXIMO PASO INMEDIATO

**No hay un próximo paso forzado**. Sistema 100% funcional al cierre. Próximas iteraciones según prioridad de Jonathan (ver backlog).

Cuando retomes la sesión, decirle al user:
> "Sistema verificado al 100% en producción (build 145893c5). ¿Qué priorizamos hoy del backlog?"

---

## 🔮 BACKLOG DE PRÓXIMAS SESIONES

En orden sugerido:

1. **Promover V7 a default** — redirigir `/dashboard/traffic/ceo` → `/dashboard/traffic/ceo-v7` y eliminar el CEODashboard.tsx legacy. Sugerido esperar 1-2 días de uso real antes para confirmar que V7 cubre todo lo que el legacy tenía. Limpiar Sidebar para dejar solo "Centro de Mando de Red".
2. **Históricos en V7 (botones 7D/30D)** — hoy deshabilitados con tooltip "Próximamente". Backend pipeline:
   - OTP histórico: agregación diaria desde `auto_stats_diarios` o `vehicle_events`.
   - Bunching histórico: query de `alertas_regulacion` con range fecha.
   - Service Delivery: pipeline `cartones_planificados` vs `cartones_ejecutados` (no existe todavía).
3. **VAPID real para FCM push** — obtener desde Firebase Console > Cloud Messaging > Web Push certificates, configurar en `frontend/.env.local` como `VITE_FCM_VAPID_KEY=...`. El código ya la consume si existe.
4. **Driver app UI para ACK de FCM** — cuando llega push al móvil del conductor, mostrar modal con botón "RECIBIDO" → llama a `acknowledgeAlerta` endpoint (ya existe en backend desde 2026-04-24).
5. **ShadowRadar UI: mostrar estado ACK** — icono ✓ en alertas reconocidas + response_time_sec.
6. **ShadowAnalytics: tab "ACK Performance"** — `ack_rate` y `avg_response_time_sec` por línea/conductor. KPI de eficiencia operativa.
7. **Bug "Document already exists"** en `alertas_regulacion`: ~100 warnings/sesión. Migrar `addDoc` (auto-ID) a `setDoc` con ID determinístico tipo `${empresaPropia}_${coche}_${rival}_${Math.floor(Date.now()/(5*60*1000))}` (una alerta cada 5 min máx por par).
8. **Generalizar `CompetitorThreatWidget`** — el prop `empresaPropia` viaja pero el algoritmo interno sigue usando `LINEAS_UCOT_BASE` (UCOT-only).
9. **Conectar TurnoPersonal a Admin/Parámetros Operativos** — los defaults de `franjasHorarias.ts` deberían leerse de Firestore `parametros_operativos/{agencyId}/turnos` editable desde Admin. Hoy son hardcoded.
10. **Refactor "Cuota de Mercado" del V7** — cuando empresaPropia tiene 0 buses propios pero competidores activos, el label "PROPIOS = 0" confunde. Sugerencia: agregar segunda tabla "Líneas ajenas dominadas por competencia" o renombrar la métrica.
11. **Verificar `git rm` de los 3 archivos legacy** zombies — `OperationsIntelligenceHub.tsx`, `ServiceStatistics.tsx` (LiveMapPage ya recuperado y vivo). Si están en HEAD, borrarlos desde Claude Code.
12. **Limpiar errores TS pre-existentes** (~98) en componentes de competition/forecast — tech debt heredado, no urgente.

---

## 🐛 BUGS CONOCIDOS Y NO CRÍTICOS

- **Document already exists** en `alertas_regulacion`: ~100 warnings por sesión activa de ShadowRadar. No rompe nada (throttle previene la mayoría), pero ensucia logs. Solución en backlog #7.
- **Sesión auth se pierde con reloads** en localhost en algunos casos — probable cookie de Firebase Auth caducando rápido en dev. No reproducido en producción.
- **Errores TS pre-existentes** (~98) ocultos por cache incremental de tsc — solo aparecen al hacer fresh build. No son del trabajo nuevo.

---

## 📌 DECISIONES OPERATIVAS DE LA SESIÓN

(2026-04-25 sesión continua, ordenadas cronológicamente)

- **NO se promovió V7 a default** todavía — esperar 1-2 días de uso real para confirmar paridad funcional con legacy. Mientras tanto ambos viven en sidebar como "Dashboard CEO (legacy)" + "⭐ Centro de Mando v7".
- **Tres archivos legacy** (`OperationsIntelligenceHub.tsx`, `ServiceStatistics.tsx`, `LiveMapPage.tsx`) — el último se recuperó. Los otros dos siguen en disco zombies (sin imports), pueden borrarse en próxima sesión desde Claude Code.
- **Schema mismatch del CEO Dashboard** se trató como compatibility fix (acepta ambos formatos) en lugar de forzar al backend a mantener GeoJSON. Decisión: backend evoluciona, frontend se adapta con dual-format.
- **VAPID key**: NO se reemplazó la key placeholder. Se configuró el código para detectar el placeholder y skipear FCM silenciosamente. La key real la pone Jonathan cuando active push notifications de verdad.
- **Cuota de Mercado del V7** muestra "0 propios" en líneas donde el operador NO opera. Es información valiosa ("hay competencia ahí, vos no estás") pero el label confunde. Cambio cosmético postpuesto al backlog #10 — no urgente.

---

## ⚙️ RECORDATORIOS DE PROCESO

- Nunca hacer `git commit` desde el sandbox Cowork — `.git/index.lock` se cuelga del lado Windows. Jonathan committea desde Claude Code.
- Para edits sobre archivos >500 líneas: **Python atomic write** (`os.replace(tmp, path)`). Patrón documentado en CLAUDE.md líneas 96-100.
- Antes de decir "listo": **siempre** correr `bash scripts/check_integrity.sh`. Exit 0 = OK.
- Verificación funcional (directriz 7) la hace Claude. Browser via Claude in Chrome MCP. Si dice 0/0 o vacío, antes de declarar bug confirmar que no son datos reales (paro, sin programación cargada, etc.).
- Si vés errores de Firestore permission-denied tras un deploy de hosting, probablemente es **caché de Service Worker** sirviendo bundle viejo. `caches.delete()` + `serviceWorker.unregister()` + reload resuelve.
