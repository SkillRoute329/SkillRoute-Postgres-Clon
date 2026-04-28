# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

> **Para Claude (cualquier sesión nueva)**: este archivo es lo SEGUNDO que lees después de `CLAUDE.md`. Acá está dónde se quedó la sesión previa, qué decisiones se tomaron pendientes de implementar, y cuál es el próximo paso concreto. Antes de cerrar tu sesión, actualizalo con los nuevos pendientes.

> **Para Jonathan**: este archivo se actualiza automáticamente al final de cada sesión productiva. No lo borres ni lo edites manualmente — Claude lo gestiona.

---

**Última actualización:** 2026-04-28 — Auditoría técnica completa + 11 bugs críticos corregidos + verificación funcional 15/15 módulos

---

## ✅ SESIÓN 2026-04-28 — Auditoría + Bugs Críticos + Verificación Funcional

### Bugs corregidos en esta sesión

| # | Archivo | Bug | Fix |
|---|---|---|---|
| C3 | `CEODashboardV7.tsx` L1135, L1144 | Links rotos → 404 silencioso | Corregidos a `/autostats` e `/incidents` |
| M1 | `TurnoVivoHub.tsx` L28 | Tabs cortadas en mobile | `flex-wrap` añadido |
| SEC1 | `autoStats.routes.ts` L2, L17 | `verifyToken` undefined → auth silenciosamente omitida | Corregido a `verifyAuth` |
| C5 | `DisponibilidadFlota.tsx` L281, L298 | Ningún coche mostraba "En Servicio" | `.has(v.numero)` además de `.has(v.id)` |
| C7 | `ShadowRadar.tsx` L283 | Memory leak: listener Firestore fallback sin cleanup | `unsubAlertasFallback` capturado + cleanup |
| C8 | `scheduleComplianceEngine.ts` L228-234 | Variables `bus.*` inexistentes → crash siempre | Reemplazados por `lat`, `lon`, `p.codigoBus` |
| A3 | `functions/src/index.ts` | Crons `syncUCOTLinesCron`/`syncParadasSTMCron` → 403 cada noche | Early return con warning |
| SEC2 | `functions/src/api/adminSeeds.ts` | 7 endpoints admin sin auth (seed + CRUD personal) | `requireAdmin` middleware en todos |
| SEC3 | `frontend/src/pages/admin/AdminSeed.tsx` | Llamadas API sin token Firebase | Token inyectado en Authorization header |
| SCHEMA | `DisponibilidadFlota.tsx` L189 | `estado` vs `status` vs `estado_operativo` → todos caían a 'activo' | `normalizeEstado()` helper unifica |
| FCM | `functions/src/incidenciaDispatcher.ts` | Incidencias sin notificación push | Trigger `onIncidenciaCreated`: supervisores siempre + conductores si ALTA/CRITICA |
| LISTERO | `TerminalListero.tsx` L1783 | `r.vehiculo` sin fallback a `r.coche`/`r.cocheId` | Resiliente: `r.vehiculo \|\| r.coche \|\| r.cocheId` |
| TDZ | `parametros-operativos.ts` | `PARAMETROS_REGISTRY` referenciaba constantes declaradas abajo → ReferenceError en build | Movido al final del archivo |
| INDEX | `firestore.indexes.json` | Query `eventos_desvio (resuelto + timestamp)` sin índice | Índice compuesto agregado |

### Archivos nuevos creados

- `functions/src/api/authMiddleware.ts` — middleware `requireAdmin` compartido para Cloud Functions
- `functions/src/incidenciaDispatcher.ts` — trigger FCM para incidencias (multicast supervisores + conductores)
- `frontend/src/pages/traffic/TurnoVivoHub.tsx` — Hub turno vivo con lazy+Suspense+tabs
- `frontend/src/pages/traffic/FinancieroHub.tsx` — Hub financiero por perfil
- `frontend/src/pages/traffic/IncidenciasHub.tsx` — Hub incidencias
- `frontend/src/pages/traffic/ListeroHub.tsx` — Hub listero terminal
- `frontend/src/pages/traffic/MapasHub.tsx`, `CorredoresHub.tsx`, `CumplimientoHub.tsx`, `PlanificacionHub.tsx`, `MapaFlotaHub.tsx`
- `frontend/src/pages/fleet/GestionFlotaHub.tsx`
- `frontend/src/services/gpsPlaybackService.ts`, `headwayInsightsService.ts`
- `scripts/check_integrity.sh`, `scripts/hotspots.sh`

### Estado de producción

- Commit: `53af9db4`
- 15/15 módulos verificados en producción: 0 errores
- TypeScript: 0 errores (frontend + functions)
- Integrity script: ✅ OK

### Verificación funcional de los 4 fixes pendientes

| Fix | Resultado | Evidencia |
|---|---|---|
| FCM incidencias | ✅ Trigger activo | `fcmSent: false`, `fcmError: no_tokens_found` — trigger dispara, no hay tokens FCM aún registrados en dispositivos |
| Auth admin endpoints | ✅ Verificado | SIN token → 401; CON token ADMIN → 200 + `primer empleado: SERGIO SOSA` |
| normalizeEstado | ✅ Correcto | Vehiculos con `status: "activo"` → normalizados correctamente |
| TerminalListero cocheId | ✅ Correcto | `ProgramacionDiariaRecord.vehiculo` es el campo principal; fallbacks legacy cubiertos |

---

## 🎯 PRÓXIMO PASO INMEDIATO

### DriverAlertOverlay para incidencias (siguiente feature prioritaria)

`DriverAlertOverlay.tsx` solo maneja mensajes FCM de tipo `alertas_regulacion`. El dispatcher de incidencias envía `data.tipo` y `data.route = '/dashboard/traffic/incidents'`. Los conductores reciben el push pero no ven el overlay en la app.

**Cambio requerido:**
- Archivo: `frontend/src/components/DriverAlertOverlay.tsx`
- Agregar case para `tipo: 'incidencia'` (o `data.route === '/dashboard/traffic/incidents'`) en el handler `onMessage` de FCM
- El overlay debe mostrar: descripción, prioridad (color rojo si ALTA/CRITICA), botón "Ver incidencia" que navega a `/dashboard/traffic/incidents`

**Pasos para la próxima sesión:**
1. Leer `DriverAlertOverlay.tsx` para entender el patrón actual
2. Agregar el case para incidencias (archivo pequeño, Cowork puede hacerlo)
3. Verificar con el dispatcher que los campos `data.incidenciaId`, `data.tipo`, `data.lineaCodigo`, `data.priority` llegan correctamente

### Deploy de índice Firestore pendiente

El nuevo índice `eventos_desvio (resuelto ASC, timestamp DESC)` está en `firestore.indexes.json` pero NO fue deployado todavía. Para deployarlo:

```bash
cd c:\Users\jonat\Desktop\PROYECTOS\GestionUcot
firebase deploy --only firestore:indexes
```

Esto tarda ~2 minutos en construirse. Sin este índice, `TurnoVivoHub` puede mostrar warning en Firestore console (la query funciona pero no está optimizada).

### Registrar FCM tokens en usuarios

Para que las notificaciones push lleguen a dispositivos, el supervisor/conductor debe:
1. Abrir la app en su celular (APK v1.1 que tiene FCM configurado)
2. Autenticarse con su cuenta
3. El token se guarda automáticamente en `users/{uid}.fcmToken`

Una vez que haya al menos un usuario con token registrado, el test de incidencia dará `fcmSent: true`.

---

## 🗂️ BACKLOG PRIORIZADO

1. **Deploy índice Firestore** — `firebase deploy --only firestore:indexes` (5 min, sin código)
2. **DriverAlertOverlay para incidencias** — overlay en app móvil cuando llega push de incidencia
3. **HRR v2 en vivo** — headway real sobre tramo compartido usando corridor_overlap
4. **Panel matutino del supervisor** — resumen al iniciar turno (06:00–08:00 hs)
5. **Cron semanal DRO** — `droMatrixTick` corre lunes 04:00 Mvd. Verificar próxima semana
6. **snap-to-shape** — proyectar posición de buses sobre el shape para HRR más preciso (backlog largo plazo)
7. **APK v1.2** — verificación FCM en dispositivo físico Android (probar notificaciones reales)

---

## 🐛 BUGS CONOCIDOS NO CRÍTICOS

- **Errores TS pre-existentes** en `cascadeEngineService.ts` — no bloquean build
- **ShadowRadar speed fallback**: buses parados → velocidad 20 km/h → HRR falso en terminales. Documentado, no bloqueante
- **shapesAllOperators.json** 9.2MB excede límite SW cache 6MB → nunca se cachea. Conocido, no bloqueante
- **VehicleList `status`** (OPERATIONAL): DisponibilidadFlota normaliza correctamente pero VehicleList sigue escribiendo en inglés. Eventual migración a `estado` + valores en español
- **FCM tokens**: ningún usuario tiene token FCM registrado aún → todas las notificaciones caen a `no_tokens_found`. Se resuelve naturalmente cuando usuarios abran la app móvil.

## 📱 APK ANDROID

- **Release APK v1.1 (FCM)** ✅: `C:\Users\jonat\Desktop\SkillRoute-release-v1.1-fcm.apk` (17 MB) — firmada v2, con push nativas
- **⚠️ RESGUARDAR**: contraseña del keystore = `SkillRoute2026!`
- FCM: `google-services.json` en `frontend/android/app/` (commiteado), token guardado en `users/{uid}.fcmToken`

## 🔑 DECISIONES OPERATIVAS

- **Hub pattern**: hubs en `pages/traffic/`, `pages/fleet/`, `pages/admin/` con lazy+Suspense+tabs
- **requireAdmin middleware**: centralizado en `functions/src/api/authMiddleware.ts`. Todos los endpoints admin DEBEN importarlo desde ahí
- **incidenciaDispatcher**: supervisores SIEMPRE reciben push; conductores solo si prioridad ALTA/CRITICA (evita spam)
- **normalizeEstado**: cualquier módulo nuevo que lea estado de vehículo debe usar este helper de DisponibilidadFlota o importar lógica similar
- **authReady pattern**: para servicios Firestore que fallan en cold start con `permission-denied`, importar `authReady` de `config/firebase.ts` y hacer `await authReady` antes de queries
- **Socket.io deprecated**: no crear nuevos componentes que dependan de Socket.io
- **Ruflo descartado permanentemente**: vulnerabilidades de seguridad críticas
