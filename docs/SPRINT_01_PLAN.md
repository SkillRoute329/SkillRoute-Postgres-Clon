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

## ORDEN COMPLETA PARA CLAUDE CODE

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
