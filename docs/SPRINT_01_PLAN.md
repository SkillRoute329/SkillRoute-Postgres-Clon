# Sprint 1 — Quick Wins Comerciales

> **Sprint:** 1 de 12 del roadmap (semanas 1-2)
> **Objetivo:** mover la aguja comercial en 2 semanas con cuatro entregables de bajo esfuerzo y alto impacto.
> **Régimen:** todo bajo Regla §11 de CLAUDE.md (no regresión obligatoria).

---

## División de trabajo

### Cowork (Cowork sandbox) — entregables 1.1, 1.2, 1.4

Cowork hace **archivos NUEVOS** + **diseño de features** + **documentación**.
NO toca archivos críticos compartidos (ver §10 de CLAUDE.md).

| # | Entregable | Output Cowork |
|---|---|---|
| 1.1 | Pricing público | Componente nuevo `frontend/src/pages/public/PricingPage.tsx` + documento `docs/PRICING_PUBLICO.md` con justificación de tiers |
| 1.2 | Onboarding 2-4 semanas documentado | `docs/ONBOARDING_PROCESO.md` con timeline, hitos, caso UCOT |
| 1.4 | Compliance reporting design | Diseño del template + endpoint nuevo `functions/src/api/regulatorio.ts` (archivo nuevo) — **el cron y la integración los cierra Code** |

### Claude Code (Windows nativo) — entregables 1.3 + integración + verificación

| # | Entregable | Output Code |
|---|---|---|
| 1.3 | GTFS-RT Service Alerts auto-publish | Modifica `functions/src/gtfsRealtime.ts` (archivo crítico) + agrega cron en `functions/src/index.ts` (archivo crítico) |
| Integración 1.1 | Registrar ruta `/pricing` | Edit puntual en `frontend/src/App.tsx` (archivo crítico) — 1-2 líneas |
| Integración 1.4 | Conectar endpoint regulatorio | Registrar `regulatorio` en `functions/src/index.ts` |
| Verificación | Tests + Build + Deploy + Smoke test | Bajo Regla §11 (no regresión) |
| Commit | Mensaje completo redactado | Una vez verificado |

---

## 🔴 GAPS DETECTADOS POST-§12 (2026-04-25 — sprint re-abierto, segunda iteración)

Bajo Regla §12 (verificación en producción excluyente), Sprint 1 sigue
abierto. Los gaps documentados en orden de detección:

### Iteración 1 — gaps detectados por Cowork
1. **Bug CTAs PricingPage** — `{tier.name}` literal en mailto. ✅ Fix
   aplicado en `frontend/src/pages/public/PricingPage.tsx` (template
   string con backticks + encodeURIComponent).
2. **Onboarding documentado pero NO público** — `docs/ONBOARDING_PROCESO.md`
   no era accesible web. ✅ Creado `OnboardingPage.tsx` pública + link
   desde Pricing.

### Iteración 2 — gaps detectados por Code en verificación humana §12
3. **OTP devuelve 0% engañoso** — los 5000 eventos del rango tienen
   `desviacionMin === null` porque el ingestor IMM no calcula desviación
   (gap conocido del scraper STM por parada). El reporte mostraba 0%
   puntualidad cuando la verdad es "no medible por falta de datos".
   ✅ **Fix aplicado en `functions/src/api/regulatorio.ts`**: refactor de
   `calcularOTP()` que distingue 3 casos (desviación calculada / línea
   tiene horarios_stm pero falta cálculo cron / línea no tiene horarios_stm).
   Output incluye nuevo bloque `calidadDeDatos` transparente con conteos,
   cobertura % y advertencias para regulador.
4. **Índice Firestore faltante** — query `agencyId AND createdAt BETWEEN`
   necesita índice. ✅ **Code agregó 2 índices** en commit 34baabe0
   (`empresa, tipo, timestamp` + `tipo, timestamp`).

### Iteración 3 — gap CRÍTICO detectado por Cowork verificando con Chrome MCP §12
5. **Endpoint regulatorio devuelve 403 a usuarios admin reales.**
   Causa raíz: `requireAdmin` en `regulatorio.ts` leía `decoded.role`
   del JWT, pero el sistema SkillRoute **NO usa custom claims** —
   replica la lógica de `firestore.rules getUserRole()` que lee
   el documento `users/{uid}` y el campo `role` o `rol` lowercase.
   El JWT tiene `name: "SuperAdmin"` como displayName (Firebase Auth)
   pero eso NO indica rol. Bug habría bloqueado completamente el feature
   regulatorio si se hubiera presentado a CUTCSA.
   ✅ **Fix aplicado en `functions/src/api/regulatorio.ts`**: refactor
   de `requireAdmin()` para verificar contra Firestore `users/{uid}`,
   aceptar `role` o `rol`, normalizar lowercase. Mensaje de error mejor
   ("Tu rol actual es 'X'. Contacta al administrador.").

### Iteración 4 — dos errores 500 detectados por Cowork tras fix de auth
6. **`/export?empresa=70` devuelve 500** — Firestore reporta:
   *"That index is currently building and cannot be used yet"*. El índice
   `(empresa, tipo, timestamp)` que Code agregó en commit 34baabe0 está
   en construcción todavía. Firestore puede tardar minutos a horas en
   indexar colecciones grandes. **No requiere acción de código** — solo
   esperar al build de Firestore.
7. **`/export-cross-op` devuelve 500** — falta otro índice. La función
   `coberturaCrossOp()` en `regulatorio.ts` filtra `vehicle_events` por
   `empresa = X AND timestamp BETWEEN A AND B` (sin `tipo`). El índice
   existente de Code es `(empresa, tipo, timestamp)` — sirve para
   `calcularOTP()` pero NO para `coberturaCrossOp()`.
   ✅ **Fix aplicado en `firestore.indexes.json`**: agregado índice
   `(empresa, timestamp)` para queries cross-op sin filtro por tipo.

### Iteración 7 — índice (agencyId, createdAt ASC) faltante §12
10. **Después del fix `timestampGPS → createdAt`, Firestore exige
    índice ASC.** El existente es `(agencyId, createdAt DESC)`. Aunque
    técnicamente BETWEEN funciona con cualquier dirección, Firestore
    aquí pide explícitamente ASC. ✅ **Fix aplicado en
    `firestore.indexes.json`**: agregados índices
    `(agencyId ASC, createdAt ASC)` y `(createdAt ASC)` para queries
    sin filtro por agencyId.

### Iteración 6 — campo timestamp incorrecto detectado §12
9. **`timestampGPS` no existe en docs actuales de `vehicle_events`.**
   El ingestor cambió y solo puebla `createdAt` ahora. Los 3 docs viejos
   con `timestampGPS` son legacy. Mi query con
   `where('timestampGPS', '>=', X)` excluía todos los docs nuevos que
   carecen de ese campo (Firestore comportamiento estándar). Por eso
   los endpoints respondían 200 pero con `total: 0` para todos los
   operadores.
   ✅ **Fix aplicado en `regulatorio.ts`**: replace_all
   `timestampGPS → createdAt`. El índice existente
   `(agencyId ASC, createdAt DESC)` cubre el query BETWEEN.

### Iteración 5 — schema mismatch crítico detectado por Cowork con query directa Firestore §12
8. **Schema real de `vehicle_events` no coincide con el código.**
   Verificación con Firestore REST API expuso los campos reales:
   - `empresa: string` ("UCOT", no número 70)
   - `agencyId: string` ("70", string del código numérico)
   - `timestampGPS: Timestamp` (NO existe `timestamp`)
   - `estadoCumplimiento: string` (EN_TIEMPO / ADELANTADO / SIN_HORARIO / FUERA_DE_SERVICIO) — **fuente canónica de OTP pre-calculada por el sistema**
   - `desviacionMin: number` (existe, 80% de cobertura — Code se equivocó al decir "todos null")
   - `idBus: string` (NO existe `coche` excepto legacy)
   - **NO existe el campo `tipo`** — el filtro `tipo === 'arrival_at_stop'` siempre devolvía 0 docs.
   ✅ **Fix aplicado en `functions/src/api/regulatorio.ts`**:
   - `calcularOTP()` reescrito para usar `agencyId` + `timestampGPS` +
     `estadoCumplimiento` como fuente canónica. Fallback a `desviacionMin`.
   - `coberturaCrossOp()` reescrito con mismo schema.
   - Helper `codigoToAgencyId(num)` para mapear input numérico API → agencyId string.
   - Los 3 índices Firestore que agregamos esta sesión son **innecesarios** (campos `tipo` y `timestamp` no existen). Quedan inactivos sin costo. El índice `(agencyId, timestampGPS ASC)` que ya existía pre-Sprint 1 es el correcto.

## ORDEN PARA CLAUDE CODE (iteración 7 — deploy índices ASC)

```
Cowork agregó 2 índices Firestore nuevos a firestore.indexes.json:
- (agencyId ASC, createdAt ASC) — para query con filtro por operador
- (createdAt ASC) — para query global cross-op

Tu trabajo:
   firebase deploy --only firestore:indexes

Después esperar 1-10 minutos al build de Firestore. Cuando ambos
índices estén "Enabled" en Firebase Console, avisar a Cowork.

https://console.firebase.google.com/project/ucot-gestor-cloud/firestore/indexes
```

## ORDEN PARA CLAUDE CODE (iteración 6 — fix createdAt + redeploy)

> Ajuste pequeño tras la iteración 5.

```
Cowork hizo replace_all timestampGPS → createdAt en
functions/src/api/regulatorio.ts. El campo timestampGPS no existe en
los docs actuales de vehicle_events; solo createdAt.

Tu trabajo:
   cd functions && npm run build && cd ..
   firebase deploy --only functions:regulatorio

Avisar a Cowork. Cowork hará verificación §12 final con token Admin.
Si JSON sale con datos reales, commit con mensaje preparado y push.

Si build/deploy falla → "## NOTA DE JONATHAN" en SESION_ACTUAL.md.
```

## ORDEN PARA CLAUDE CODE (iteración 5 — schema fix + redeploy final)

> Pegar este bloque a Code para cerrar Sprint 1.

```
Continuamos Sprint 1 §12 iteración 5. Leé docs/SPRINT_01_PLAN.md
sección "Iteración 5".

Cowork detectó schema mismatch crítico verificando con Firestore REST
API. Los campos reales de vehicle_events son:
- agencyId (string) — usar en lugar de empresa(number)
- timestampGPS (Timestamp) — usar en lugar de timestamp inexistente
- estadoCumplimiento (string) — fuente canónica de OTP pre-calculada
- NO existe el campo "tipo"

Cowork ya refactorizó functions/src/api/regulatorio.ts:
- calcularOTP usa agencyId + timestampGPS + estadoCumplimiento
- coberturaCrossOp usa mismos campos
- Helper codigoToAgencyId mapea input numérico API → agencyId string

Tu trabajo:

PASO 1 — REBUILD + REDEPLOY:
   cd functions && npm run build && cd ..
   firebase deploy --only functions:regulatorio

PASO 2 — AVISAR a Cowork. Cowork hará verificación §12 con Chrome MCP.

PASO 3 — VERIFICACIÓN §12 (Cowork ejecuta directamente):
   Cowork va a:
   a) /export?empresa=70 con token Jonathan → debe devolver 200 con
      otp.total > 0 (UCOT tiene eventos en abril). pctOTP debe ser
      número (no null) si hay eventos con estadoCumplimiento.
   b) /export-cross-op con token Jonathan → debe devolver 200 con
      cobertura mostrando buses y lineas para los 4 operadores
      (UCOT/CUTCSA/COME/COETC).
   c) calidadDeDatos.advertencias[] debe explicar el contexto.

PASO 4 — COMMIT (después que Cowork confirme verificación OK):
   git add functions/src/api/regulatorio.ts firestore.indexes.json \
     docs/SPRINT_01_PLAN.md docs/SESION_ACTUAL.md
   git commit -m "fix(regulatorio): refactor para schema real vehicle_events

   Verificación §12 con Firestore REST API expuso schema mismatch:
   - empresa es string (UCOT) no número
   - agencyId es string (70) — usar para filtrar
   - timestampGPS, no timestamp
   - estadoCumplimiento es la fuente canónica de OTP pre-calculada
   - NO existe el campo tipo

   Refactor:
   - calcularOTP usa estadoCumplimiento (EN_TIEMPO/ADELANTADO/SIN_HORARIO/
     FUERA_DE_SERVICIO) como fuente primaria. Fallback a desviacionMin.
   - coberturaCrossOp usa agencyId + timestampGPS.
   - Helper codigoToAgencyId mapea API numérico → agencyId string.

   Verificado bajo §12 con token Admin real:
   - /export?empresa=70 devuelve OTP medible.
   - /export-cross-op devuelve cobertura real de 4 operadores.

   Sprint 1 cerrado al 100%."
   git push

PASO 5 — SI ALGO FALLA:
   Escribir "## NOTA DE JONATHAN" en SESION_ACTUAL.md describiendo
   qué falló. NO commitear.
```

## ORDEN PARA CLAUDE CODE (iteración 4 — deploy índice cross-op + esperar)

> Pegar a Code para resolver los dos 500.

```
Continuamos Sprint 1 §12 iteración 4. Leé docs/SPRINT_01_PLAN.md
sección "Iteración 4".

Cowork detectó 2 errores 500 al verificar con Chrome MCP usando token
de SuperAdmin. Diagnóstico exacto desde body de respuesta de Firestore:

- /export-cross-op: falta índice (empresa, timestamp) sin tipo.
  Cowork ya agregó el índice en firestore.indexes.json.

- /export?empresa=70: índice (empresa, tipo, timestamp) que vos agregaste
  en commit 34baabe0 está en estado "currently building". No requiere
  fix, solo esperar a Firestore.

Tu trabajo:

PASO 1 — DEPLOY ÍNDICES:
   firebase deploy --only firestore:indexes

PASO 2 — ESPERAR. Los índices Firestore tardan en construirse.
   Verificar progreso en:
   https://console.firebase.google.com/project/ucot-gestor-cloud/firestore/indexes

   Cuando ambos estén "Enabled" (no "Building"), avisame.

PASO 3 — COMMIT (después que el deploy del índice se aplique):
   git add firestore.indexes.json docs/SPRINT_01_PLAN.md
   git commit -m "fix(regulatorio): agregar índice (empresa, timestamp) para coberturaCrossOp

   Bug detectado bajo Regla §12 al verificar /export-cross-op con token real.
   Firestore devolvía 500 porque coberturaCrossOp filtra empresa+timestamp
   sin incluir tipo, y solo existía el índice (empresa, tipo, timestamp).

   El índice de Cowork (empresa, timestamp) cubre la query cross-op
   independiente. El de Code (empresa, tipo, timestamp) sigue cubriendo
   calcularOTP que sí filtra por tipo.

   Sprint 1 §12 iteración 4 — pendiente verificación final con token
   real una vez los índices terminen de construir."
   git push
```

## ORDEN PARA CLAUDE CODE (iteración 3 — fix auth regulatorio)

> Pegar este bloque a Code para cerrar Sprint 1 al 100%.

```
Continuamos Sprint 1 bajo Regla §12, iteración 3. Leé CLAUDE.md
(especial §12) y docs/SPRINT_01_PLAN.md sección "Iteración 3".

Cowork detectó bug crítico verificando con Chrome MCP: el endpoint
regulatorio devolvía 403 incluso a SuperAdmin reales. Causa: leía
decoded.role del JWT en lugar de Firestore users/{uid}.role como hace
firestore.rules. Fix aplicado en functions/src/api/regulatorio.ts.

Tu trabajo:

PASO 1 — REBUILD + REDEPLOY functions:
   cd functions && npm run build && cd ..
   firebase deploy --only functions:regulatorio

PASO 2 — VERIFICAR §12 directo (sin esperar a Jonathan):
   Cowork hará la verificación funcional con Chrome MCP usando el
   token del usuario logueado en el browser de Jonathan, una vez que
   el deploy esté en producción.

PASO 3 — COMMIT:
   git add -A
   git commit -m "fix(regulatorio): auth lee Firestore users/{uid}.role en lugar de JWT custom claim

   Bug crítico detectado bajo Regla §12 al verificar con Chrome MCP:
   endpoint regulatorio devolvía 403 a usuarios SuperAdmin reales.

   Causa: requireAdmin() leía decoded.role del JWT, pero SkillRoute
   no usa custom claims — replica la lógica de firestore.rules
   getUserRole() que lee users/{uid}.role o .rol normalizado lowercase.
   El name: 'SuperAdmin' del JWT es solo displayName de Firebase Auth.

   Fix: refactor requireAdmin para hacer fetch a Firestore users/{uid}
   y validar role/rol lowercase contra ['admin', 'superadmin'].
   Mensaje de error mejorado con rol actual del usuario.

   Habría bloqueado completamente el feature regulatorio si llegaba
   a CUTCSA con auth ADMIN."
   git push
```

## ORDEN ANTERIOR (iteración 2 — superada por iteración 3)

> Pegar este bloque a Code para cerrar Sprint 1 al 100%.

```
Continuamos Sprint 1 bajo Regla §12. Leé CLAUDE.md (especial §12) y
docs/SPRINT_01_PLAN.md (sección "GAPS DETECTADOS POST-§12").

Cowork resolvió en código:
1. PricingPage.tsx — fix bug CTA mailto (template string + encodeURIComponent)
2. OnboardingPage.tsx — componente nuevo, página pública con timeline + caso UCOT
3. regulatorio.ts — refactor calcularOTP para distinguir medibles vs no medibles
   + bloque calidadDeDatos transparente al regulador (cobertura %, advertencias)

Tu trabajo:

PASO 1 — INTEGRAR OnboardingPage (frontend/src/App.tsx):
   const OnboardingPage = lazy(() => import('./pages/public/OnboardingPage'));
   <Route path="/pricing/onboarding" element={<OnboardingPage />} />

PASO 2 — AGREGAR ÍNDICE FIRESTORE (firestore.indexes.json):
   Agregar al array "indexes":
   {
     "collectionGroup": "vehicle_events",
     "queryScope": "COLLECTION",
     "fields": [
       { "fieldPath": "empresa", "order": "ASCENDING" },
       { "fieldPath": "tipo", "order": "ASCENDING" },
       { "fieldPath": "timestamp", "order": "ASCENDING" }
     ]
   }
   (Nota: el query es "empresa = X AND tipo = arrival_at_stop AND
   timestamp BETWEEN A AND B". Si Firestore Console pide otro shape
   exacto, copiar el link de error que da el endpoint y crear el índice
   sugerido en Console — equivalente.)

PASO 3 — REBUILD + REDEPLOY:
   cd frontend && npm run build && cd ..
   cd functions && npm run build && cd ..
   firebase deploy --only hosting,functions,firestore:indexes

PASO 4 — VERIFICACIÓN §12 EN PRODUCCIÓN (criterio usuario final, 6 puntos):

   a) https://ucot-gestor-cloud.web.app/pricing en incógnito limpio:
      - Click "Reservar reunión" tier Profesional → subject del mailto
        debe ser "SkillRoute - Tier Profesional - Reunión de descubrimiento"
        (NO debe contener "{tier.name}" literal).
      - Click link "Ver proceso de onboarding" en hero → navega a
        /pricing/onboarding.

   b) https://ucot-gestor-cloud.web.app/pricing/onboarding en incógnito:
      - Carga sin auth.
      - Muestra timeline 4 semanas (Setup, Datos, Capacitación, Go-live).
      - Comparativa con líderes mundiales visible.
      - Caso UCOT visible con tabla de hitos.
      - 0 errores en console.
      - Mobile-responsive a viewport 390px (DevTools emulator).

   c) Endpoints regulatorio con tu token ADMIN:
      Test 1 — cross-op (debería tener data real):
        curl -H "Authorization: Bearer <TOKEN>" \
          "https://us-central1-ucot-gestor-cloud.cloudfunctions.net/regulatorio/export-cross-op?desde=2026-04-01&hasta=2026-04-25" \
          | python -m json.tool > /tmp/cross-op.json

        Verificar en /tmp/cross-op.json:
        - otpRed.pctOTP es null O número (no 0% engañoso).
        - calidadDeDatos.red.advertencias[] explica el "no medible"
          si pctOTP es null.
        - cobertura[] tiene 4 operadores con buses y lineasActivas reales.
        - calidadPorOperador tiene desglose por operador (10/20/50/70).

      Test 2 — operador individual (post-índice):
        curl -H "Authorization: Bearer <TOKEN>" \
          "https://us-central1-ucot-gestor-cloud.cloudfunctions.net/regulatorio/export?empresa=70&desde=2026-04-01&hasta=2026-04-25" \
          | python -m json.tool > /tmp/ucot.json

        Debe responder 200 (no 500). El JSON debe ser estructuralmente
        igual al cross-op pero con un solo operador.

   d) GTFS-RT sigue OK (regresión):
      curl https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsRealtime/service-alerts.json \
        | python -c "import json,sys; d=json.load(sys.stdin); print(d['meta'])"
      Debe imprimir totalEntities > 0.

   e) Regresión sidebar: cargar /dashboard/traffic/ceo, /traffic/cartones,
      /traffic/shadow-radar — los 3 deben renderizar sin errores nuevos.

   f) Reportar a Jonathan los 6 puntos con resultado.

PASO 5 — SI TODO PASA → COMMIT:
   git add -A
   git commit -m "fix(sprint-1-§12): cierre completo bajo regla 12

   Aplicación de Regla §12 (Verificación en Producción Excluyente)
   resolvió 4 gaps en Sprint 1:

   1. PricingPage CTA mailto: {tier.name} literal → template string.
   2. OnboardingPage.tsx pública en /pricing/onboarding.
   3. regulatorio.calcularOTP: refactor para distinguir medibles vs
      no medibles. Output incluye calidadDeDatos transparente con
      cobertura % y advertencias para regulador. OTP devuelve null
      en lugar de 0% engañoso cuando no hay datos suficientes.
   4. Índice Firestore (empresa, tipo, timestamp ASC) para queries
      de export por operador.

   Verificación §12 ejecutada en producción:
   - /pricing CTA correcto.
   - /pricing/onboarding carga, mobile-responsive, 0 errores console.
   - /regulatorio/export-cross-op devuelve OTP=null transparente
     con advertencias.
   - /regulatorio/export?empresa=X devuelve 200 (post-índice).
   - GTFS-RT feed sin regresión.
   - 3 módulos sidebar sin regresión."
   git push

PASO 6 — SI ALGO FALLA en pasos 4-5:
   Escribir "## NOTA DE JONATHAN" arriba de SESION_ACTUAL.md
   describiendo qué falló. NO commitear.
```

## ORDEN ANTERIOR (iteración 1, ya superada)

> Pegar este bloque en Claude Code para cerrar Sprint 1 bajo §12.

```
Continuamos Sprint 1 bajo regla §12 (Verificación en Producción Excluyente).
Leé CLAUDE.md (especial §12) y docs/SPRINT_01_PLAN.md.

Cowork detectó 2 gaps técnicos y los resolvió en código local. Tu trabajo:

1. INTEGRAR OnboardingPage — Edit puntual en frontend/src/App.tsx:
   const OnboardingPage = lazy(() => import('./pages/public/OnboardingPage'));
   <Route path="/pricing/onboarding" element={<OnboardingPage />} />

2. REBUILD + REDEPLOY frontend (incluye fix CTA PricingPage + nueva
   OnboardingPage):
   cd frontend
   npm run build
   cd ..
   firebase deploy --only hosting

3. VERIFICACIÓN EN PRODUCCIÓN EXCLUYENTE (§12, 7 criterios):
   a) Abrir https://ucot-gestor-cloud.web.app/pricing en incógnito limpio.
      - Click en CTA "Reservar reunión" del Tier Profesional.
      - Verificar que el subject del mailto es exactamente:
        "SkillRoute - Tier Profesional - Reunión de descubrimiento"
        (no "{tier.name}" literal).
   b) Abrir https://ucot-gestor-cloud.web.app/pricing/onboarding en incógnito.
      - Verificar que carga sin auth.
      - Verificar que muestra timeline 4 semanas, comparativa con líderes,
        caso UCOT, compromisos mutuos, CTA mailto al final.
      - Verificar 0 errores en console.
   c) Mobile-responsive: emular viewport 390x844 (iPhone) en DevTools.
      Verificar que /pricing y /pricing/onboarding no tienen overflow
      horizontal y todos los elementos son visibles.
   d) Regresión: cargar /dashboard/traffic/ceo, /dashboard/traffic/cartones,
      /dashboard/traffic/shadow-radar — los 3 deben renderizar normal.
   e) Feed GTFS-RT: confirmar que sigue devolviendo entidades
      (curl https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsRealtime/service-alerts.json
      | head -200).

4. SI TODO PASA → COMMIT:
   git add -A
   git commit -m "fix(sprint-1-§12): bug CTA mailto + OnboardingPage pública

   Aplicación de regla §12 (Verificación en Producción Excluyente) a
   Sprint 1. Dos gaps detectados y resueltos:

   1. PricingPage tenía mailto con {tier.name} literal en lugar de
      interpolado. Subject del email roto al click. Fix con template
      string + encodeURIComponent.

   2. ONBOARDING_PROCESO.md documentado pero no accesible al público.
      Creada OnboardingPage.tsx pública en /pricing/onboarding con
      timeline 4 semanas, comparativa líderes, caso UCOT, compromisos
      mutuos. Link agregado desde /pricing.

   Verificación §12:
   - /pricing CTA mailto → subject correcto (no {tier.name})
   - /pricing/onboarding accesible sin auth
   - Mobile-responsive verificado a 390px
   - 0 errores console
   - 3 módulos pre-existentes sin regresión
   - Feed GTFS-RT sigue OK"
   git push

5. PENDIENTE para Jonathan (excepción §12 humana):
   Probar /regulatorio/export y /export-cross-op con tu token ADMIN
   y reportar si el JSON de salida es consumible.
```

## ORDEN COMPLETA INICIAL PARA CLAUDE CODE (sprint original — ya ejecutada)

> Pegar este bloque en Claude Code cuando Cowork termine los entregables 1.1, 1.2, 1.4.

```
Continuamos la sesión de Cowork. Sprint 1 del roadmap international-grade.
Leé CLAUDE.md (especial atención a §11 No-Regresión y §10 archivos críticos)
y docs/SESION_ACTUAL.md.

Cowork ya entregó:
- frontend/src/pages/public/PricingPage.tsx (componente nuevo)
- docs/ONBOARDING_PROCESO.md (documento nuevo)
- docs/PRICING_PUBLICO.md (justificación de tiers)
- functions/src/api/regulatorio.ts (endpoint nuevo, sin registrar todavía)

Tu trabajo:

1. INTEGRAR Pricing — Edit puntual en frontend/src/App.tsx:
   - Agregar `const PricingPage = lazy(() => import('./pages/public/PricingPage'));` en la zona de imports lazy
   - Agregar `<Route path="/pricing" element={<PricingPage />} />` antes del fallback `<Route path="*" />`
   Ambos edits chicos (<5 líneas), respetando §10.

2. INTEGRAR Compliance Reporting — Edit puntual en functions/src/index.ts:
   - Agregar `export { regulatorio } from './api/regulatorio';` después de los exports existentes.

3. IMPLEMENTAR 1.3 GTFS-RT Service Alerts auto-publish:
   - Modificar functions/src/gtfsRealtime.ts:
     a) Agregar función `generateServiceAlertsFromAlertasTacticas()` que toma docs de
        la colección `alertas_regulacion` con estado=ACTIVA y los convierte a
        FeedEntity con Alert (transit_realtime.proto).
     b) Combinar el output con los entities existentes de TripUpdates y VehiclePositions
        en el feed que ya genera el endpoint público.
   - Agregar cron en functions/src/index.ts:
     `export const refreshGtfsRtAlerts = functions.pubsub.schedule('every 1 minutes').onRun(...)`
     que invoca la función nueva y mantiene el feed fresco.

4. VERIFICAR (Regla §11 No-Regresión):
   a) cd frontend && npx tsc --noEmit --skipLibCheck → 0 errores nuevos
   b) cd functions && npx tsc --noEmit → 0 errores nuevos
   c) cd .. && bash scripts/check_integrity.sh → exit 0
   d) cd frontend && npm run build → sin warnings
   e) cd functions && npm run build → sin warnings
   f) Validar feed GTFS-RT contra spec V2 con curl + protobuf decoder
      (https://gtfs-validator.mobilitydata.org/ idealmente)
   g) Verificar que pueden cargar /pricing en https://ucot-gestor-cloud.web.app/pricing
      sin auth, sin errores en consola.
   h) Verificar regresión: cargar /dashboard/traffic/ceo, /dashboard/traffic/cartones,
      /dashboard/traffic/shadow-radar — los 3 deben renderizar sin errores.

5. SI TODO PASA → DEPLOY:
   - cd functions && npm run deploy
   - cd .. && firebase deploy --only hosting,firestore
   - Esperar 1-2 min para cache-bust
   - Re-verificar /pricing y los 3 módulos en producción

6. COMMIT (con mensaje preparado por Cowork):
   git add -A
   git commit -m "feat(sprint-1): pricing público + onboarding doc + GTFS-RT Service Alerts auto + compliance reporting

   Sprint 1 del roadmap international-grade. Cuatro entregables:

   1.1 Pricing público transparente con 3 tiers (50/200/500+ buses) en /pricing
   1.2 Onboarding 2-4 semanas documentado con caso UCOT
   1.3 GTFS-RT Service Alerts auto-publish desde alertas_regulacion (cron 1 min)
   1.4 Compliance reporting export estructurado (endpoint /api/regulatorio/export)

   Aplica regla §11 No-Regresión:
   - tsc 0 errores nuevos (frontend + functions)
   - integrity script exit 0
   - build sin warnings (frontend + functions)
   - GTFS-RT feed validado contra spec V2
   - 3 módulos pre-existentes (CEO, Cartones, ShadowRadar) verificados sin regresión
   - /pricing accesible sin auth, sin errores consola"

   git push

7. SI ALGO FALLA en pasos 4-7:
   No commitear. Escribir "## NOTA DE JONATHAN" arriba de SESION_ACTUAL.md
   describiendo qué falló y qué pasos quedan. Avisar a Jonathan.

8. REPORTAR a Jonathan:
   - 4 entregables del Sprint 1 ✅
   - 7 criterios §11 No-Regresión ✅
   - URL de /pricing en producción
   - Confirmación de feed GTFS-RT actualizado
```

---

## Definition of Done por entregable

### 1.1 Pricing público
- [ ] `PricingPage.tsx` renderiza 3 tiers con features desplegadas.
- [ ] Ruta `/pricing` accesible sin auth.
- [ ] Mobile-responsive (probado en width < 480px).
- [ ] CTA "Solicitar reunión" abre mailto a Jonathan o formulario.
- [ ] Captura de pantalla en producción guardada como evidencia.

### 1.2 Onboarding documentado
- [ ] `ONBOARDING_PROCESO.md` con timeline semana por semana.
- [ ] Caso UCOT como evidencia (anonimizado donde corresponda).
- [ ] Lista de prerequisitos del operador.
- [ ] Lista de entregables del proveedor.
- [ ] Métricas de éxito por hito.

### 1.3 GTFS-RT Service Alerts auto-publish
- [ ] Cron cada 1 minuto extrayendo alertas activas.
- [ ] Feed combinado con TripUpdates + VehiclePositions existentes.
- [ ] Validado contra GTFS-RT spec V2.
- [ ] URL pública del feed documentada.
- [ ] Alerta de prueba creada → aparece en feed dentro de 60s.

### 1.4 Compliance reporting
- [ ] Endpoint `/api/regulatorio/export` con auth ADMIN/SUPERADMIN.
- [ ] Output PDF estructurado por tipo: cumplimiento OTP, cobertura cross-op, KPIs UITP.
- [ ] Filtros de período (mes/trimestre/año).
- [ ] PDF de muestra guardado como evidencia.

---

## Métricas de cierre del Sprint 1

| Métrica | Antes | Target | Evidencia |
|---|---|---|---|
| Pricing transparente score (matriz) | 5 | 5 | URL /pricing pública |
| Onboarding documentado score | 5 | 5 | docs/ONBOARDING_PROCESO.md |
| GTFS-RT Service Alerts score | 2 | 5 | Feed validado V2 |
| Compliance reporting score | 2 | 4 | Endpoint + PDF muestra |
| Score consolidado SkillRoute (matriz) | ~55 | ~58 | MATRIZ_MAESTRA.xlsx actualizada |
| Regla §11 No-Regresión cumplida | — | ✅ | 7 criterios verificados |

---

## Riesgos del Sprint 1

| Riesgo | Mitigación |
|---|---|
| GTFS-RT alerts auto-publish causa carga excesiva (cron 1 min × 4 operadores) | Cron solo procesa alertas con cambios desde último run. Cache headers correctos. |
| Pricing público filtra info sensible | Nada de números reales de UCOT. Solo tier por buses + features visible. |
| Endpoint /api/regulatorio/export falla en datos vacíos | Validación de input + manejo de empty result set con mensaje "sin datos disponibles". |
| Build introduce regresión no detectada | Regla §11 obliga verificar 3 módulos pre-existentes. Si fallan, revert. |
