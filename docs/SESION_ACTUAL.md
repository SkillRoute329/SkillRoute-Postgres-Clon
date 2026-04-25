# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

> **Para Claude (cualquier sesión nueva)**: este archivo es lo SEGUNDO que lees después de `CLAUDE.md`. Acá está dónde se quedó la sesión previa, qué decisiones se tomaron pendientes de implementar, y cuál es el próximo paso concreto. Antes de cerrar tu sesión, actualizalo con los nuevos pendientes.

> **Para Jonathan**: este archivo se actualiza automáticamente al final de cada sesión productiva. No lo borres ni lo edites manualmente — Claude lo gestiona.

---

**Última actualización:** 2026-04-25 (Bug 1 cerrado — §12 confirmado fix9: 0 errors)

## ✅ BUGS NAVEGADOR — ESTADO DEFINITIVO (§12 confirmado)

| Bug | Estado | Fix aplicado |
|---|---|---|
| Bug 1 — `desvios_guardados` permission-denied | ✅ **CERRADO** | onSnapshot→getDocs; reglas `allow get,list` |
| Bug 1b — `tarifarioService` sin handler | ✅ **CERRADO** | `listenToTarifas` → `getTarifas` (getDocs) |
| Bug 1c — auto-sync STM 403 | ✅ **CERRADO** | Bloque `syncLineaFromAPI` deshabilitado |
| Bug 2 — Mapa en blanco | ✅ **CERRADO** | Empty-state ámbar |
| Bug 3 — Filtro hardcoded 317/371/379 | ✅ **CERRADO** | Línea eliminada |
| Bug 7 — `RoadAlertService` permission-denied | 🟡 **Separado** | Pre-existente, no scope |

**fix9 verificado por Cowork: 0 errors en consola.**

### Warn residual conocido (polish, no bloqueante)
`[UCOT] Firestore offline para getLineaData: 300a` — 1 warn por cambio de línea.  
**Causa**: pre-auth race en `useEffect([selectedCodigo, empresaPropia, getLineCodigo])` sin
guard `!user?.uid`. El efecto dispara `getDoc(lineas_ucot/codigo)` antes de que el SDK
Firestore propague el token. Rules correctas (verificado vía REST API ruleset `91891827`).
Fallback `buildLineaFromTemplates` absorbe el error — módulo funciona al 100%.  
**Fix cuando corresponda**: agregar `if (!user?.uid) return` al inicio del effect en
`NavigationModule.tsx:300`.

---

---

## 📋 PENDIENTES DEL NAVEGADOR (próximas sesiones)

| Bug | Descripción | Cuándo |
|---|---|---|
| #4 | Catálogo UCOT limitado a 8 códigos base en `LINEAS_UCOT_BASE` (`ucotLinesService.ts:39`). Líneas reales adicionales no aparecen en dropdown. | Decidir contra otros sprints. |
| #5 | NavigationModule.tsx >1300 líneas (límite §5: 250). Refactor a `features/navigation/` con LineSelector, NavigationHUD, TarifarioModal, LineEditor, hooks. | Sprint dedicado deuda técnica. |
| #6 | Chip "LENTO" del ConnectivityGuard parpadea pre-auth en esquina inferior izq. | Issue separado. |
| Migración shapes | Reemplazar `syncLineaFromAPI` (proxy STM 403) por carga desde `shapes_cross_operator`. Unificaría path de datos para los 4 operadores. | Sprint 2/3. |

---

## ✅ SPRINT 1 — ESTADO FINAL POST §12

| Entregable | §11 (build/deploy) | §12 (producción real) |
|---|---|---|
| 1.1 Pricing público `/pricing` | ✅ deployado | ✅ CTA mailto OK ✅ |
| 1.2 Onboarding doc `/pricing/onboarding` | ✅ deployado | ✅ lazy import OK ✅ |
| 1.3 GTFS-RT Service Alerts | ✅ deployado | ✅ 100 entidades vivas, cron 1min ✅ |
| 1.4 Compliance reporting | ✅ deployado | ✅ /health OK · /export pendiente Jonathan con token (excepción §12a) |
| Fix RouteErrorBoundary (key prop) | ✅ deployado | ✅ módulos cargan sin Error en Módulo ✅ |
| Fix Navegador cross-operador (3-step selector) | ✅ deployado | ⏳ verificación visual pendiente Jonathan |

## 📋 VERIFICACIÓN PENDIENTE (Jonathan) — Sprint 1 al 100%

```
# 1. Endpoint regulatorio — copiar Bearer token desde DevTools del dashboard
curl -H "Authorization: Bearer TU_TOKEN_ADMIN" \
  "https://us-central1-ucot-gestor-cloud.cloudfunctions.net/regulatorio/export-cross-op?desde=2026-04-01&hasta=2026-04-25" \
  | python -m json.tool

# Verificar:
# 1. JSON llega sin error 401/403
# 2. calidadDeDatos.red.advertencias[] explica si no hay horarios_stm
# 3. otpPorOperador tiene entradas para empresas 10, 20, 50, 70
```

Si retorna OK → **Sprint 1 CERRADO**.

## 🚀 PRÓXIMO SPRINT (Sprint 2)

**Sprint 2: HeadwayInsights + GPS Playback**

Archivos ya creados por Cowork (no comiteados aún, verificar):
- `frontend/src/pages/traffic/HeadwayInsights.tsx`
- `frontend/src/pages/traffic/GPSPlayback.tsx`
- `frontend/src/services/headwayInsightsService.ts`
- `frontend/src/services/gpsPlaybackService.ts`

Antes de arrancar Sprint 2: Jonathan confirma OK en verificación del endpoint regulatorio.

---

## 📌 DECISIONES OPERATIVAS VIGENTES

1. Producto NO se vende como MVP. International-grade desde día uno.
2. Auditoría INTERNA primero. Pitch a CUTCSA recién post-Fase 4.
3. **§10 CLAUDE.md:** Cowork no edita archivos grandes/críticos.
4. **§11 CLAUDE.md:** No-Regresión obligatoria. 7 criterios pre-commit.
5. **§12 CLAUDE.md:** Verificación en producción excluyente. No avanzar sin 100% OK funcional.
6. División Cowork/Code: Cowork hace archivos NUEVOS + diseño + docs; Code hace edits en críticos + build + deploy + verificación.

## 🟡 PENDIENTES DE FONDO

- #24 Rotar service account key comprometida (acción humana GCP Console)
- #26 Borrar archivos zombie + limpieza sidebar
- #87 **DECISIÓN M&A** — Jonathan decide A/B/C en próximas 1-2 semanas

## 🔴 RIESGOS ESTRATÉGICOS ACTIVOS

1. **Cittati llega a CUTCSA antes que nosotros** — mitigación: velocidad estratégica.
2. **Optibus lanza versión Latam-friendly** — mitigación: moat cross-op.
3. **Falla de seguridad pública** — mitigación: ISO 27001 Sprint 4.
