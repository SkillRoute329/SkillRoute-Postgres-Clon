# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

> **Para Claude (cualquier sesión nueva)**: este archivo es lo SEGUNDO que lees después de `CLAUDE.md`. Acá está dónde se quedó la sesión previa, qué decisiones se tomaron pendientes de implementar, y cuál es el próximo paso concreto. Antes de cerrar tu sesión, actualizalo con los nuevos pendientes.

> **Para Jonathan**: este archivo se actualiza automáticamente al final de cada sesión productiva. No lo borres ni lo edites manualmente — Claude lo gestiona.

---

**Última actualización:** 2026-04-25 (Sprint 1 RE-ABIERTO bajo §12)

## 🆕 NUEVA REGLA §12 — Verificación en Producción Excluyente

Jonathan instaló directiva permanente:
*"verifica en producción excluyente, no avanzaremos hasta dar por 100%
ok el funcionamiento. quien recibe el producto no le importan las pruebas
de codigo o local"*

Guardada en `CLAUDE.md` §12. Aplicable a TODOS los sprints en adelante.
Tests locales + tsc verde + build OK NO son suficiente. La única
verificación válida es: ¿un usuario final que recibe el producto puede
usarlo en producción sin que se rompa nada?

## ⚠️ SPRINT 1 RE-ABIERTO BAJO §12

Al aplicar §12 retroactivamente a Sprint 1, detecté **3 gaps** que mi
verificación inicial no captó (era puramente HTTP 200 status check):

| Gap | Severidad | Estado |
|---|---|---|
| 1. Bug CTA PricingPage — `{tier.name}` literal en mailto | 🔴 Crítico | ✅ Fix aplicado en código local |
| 2. Onboarding doc no accesible público sin login | 🔴 Crítico | ✅ Creada OnboardingPage.tsx pública |
| 3. Endpoints regulatorio /export sin verificación humana con token | 🟠 Excepción §12 | ⏸️ Pendiente Jonathan |

## 📋 ENTREGABLES ACTUALIZADOS POR COWORK (esta sesión)

| # | Archivo | Estado |
|---|---|---|
| 1.1 fix | `frontend/src/pages/public/PricingPage.tsx` (Edit puntual: mailto template + link a onboarding) | ✅ Listo |
| 1.2 fix | `frontend/src/pages/public/OnboardingPage.tsx` (componente nuevo, página pública con timeline + comparativa + caso UCOT + compromisos) | ✅ Listo |
| Regla §12 | `CLAUDE.md` agregado §12 con 7 criterios + responsabilidades | ✅ Listo |
| Plan actualizado | `docs/SPRINT_01_PLAN.md` con orden post-§12 para Code | ✅ Listo |

## 📋 PRÓXIMO PASO INMEDIATO

**Para Jonathan / Claude Code:**

Pegar a Claude Code este prompt para cerrar Sprint 1 bajo §12:

```
Continuamos Sprint 1 bajo Regla §12. Leé CLAUDE.md (especial §12) y
docs/SPRINT_01_PLAN.md sección "ORDEN ACTUALIZADA POST-§12".

Cowork resolvió 2 gaps en código:
1. Fix bug CTA mailto en frontend/src/pages/public/PricingPage.tsx
2. Creada frontend/src/pages/public/OnboardingPage.tsx pública

Tu trabajo:
1. Edit puntual App.tsx para registrar /pricing/onboarding
2. npm run build + firebase deploy --only hosting
3. Verificación §12 en producción (7 criterios listados en SPRINT_01_PLAN)
4. Si todo OK, commit con mensaje preparado y push

Si algo falla, escribir "## NOTA DE JONATHAN" en SESION_ACTUAL.md
describiendo qué falló.
```

**Después** de que Code complete eso, **Jonathan ejecuta la verificación
humana de §12** (excepción permitida):

- Probar `/regulatorio/export?empresa=70&desde=2026-04-01&hasta=2026-04-25`
  con su token ADMIN (desde DevTools → Network del dashboard logueado).
- Verificar que el JSON output es consumible por humanos.
- Reportar OK o gaps al feedback.

**Solo cuando los 3 gaps cierren al 100% en producción**, Sprint 1 pasa
a `completed`. Recién ahí arrancamos Sprint 2 (HeadwayInsights + GPS
Playback).

## ✅ ENTREGABLES SPRINT 1 — ESTADO

| Entregable | §11 (build/deploy) | §12 (producción real) |
|---|---|---|
| 1.1 Pricing público | ✅ deployado | 🟡 Bug CTA detectado y arreglado · pendiente redeploy |
| 1.2 Onboarding doc | ✅ MD escrito | 🟡 Página pública creada · pendiente registrar ruta + deploy |
| 1.3 GTFS-RT Service Alerts | ✅ deployado | ✅ Verificado V2 + 100 entidades + cron 1min |
| 1.4 Compliance reporting | ✅ deployado | 🟠 /health OK · /export pendiente verificación humana con token |

## 📚 DOCUMENTOS GENERADOS HOY

Estratégicos (Fases 1-3 del roadmap international-grade):

| Documento | Tipo |
|---|---|
| `docs/ESTRATEGIA_INTERNATIONAL_GRADE.md` | Norte vinculante |
| `docs/COMPETIDORES/optibus.md` | Dossier líder global |
| `docs/COMPETIDORES/swiftly.md` | Dossier líder global |
| `docs/COMPETIDORES/remix.md` | Dossier líder global |
| `docs/COMPETIDORES/trapeze.md` | Dossier enterprise |
| `docs/COMPETIDORES/cittati.md` | Único competidor regional urgente |
| `docs/COMPETIDORES/MATRIZ_MAESTRA.xlsx` | 6 hojas, 95 fórmulas |
| `docs/COMPETIDORES/HALLAZGOS_CONSOLIDADOS.md` | Síntesis ejecutiva |
| `docs/ROADMAP_CIERRE_GAPS.md` | 12 sprints, 6 meses |
| `docs/DECISION_M_A.md` | 3 opciones M&A |

Sprint 1 (entregables tácticos):

| Documento | Tipo |
|---|---|
| `docs/SPRINT_01_PLAN.md` | Plan + orden post-§12 |
| `docs/PRICING_PUBLICO.md` | Justificación tiers |
| `docs/ONBOARDING_PROCESO.md` | Texto base onboarding |
| `frontend/src/pages/public/PricingPage.tsx` | Componente con fix CTA |
| `frontend/src/pages/public/OnboardingPage.tsx` | Componente nuevo |
| `functions/src/api/regulatorio.ts` | Endpoint compliance |

## 🟡 PENDIENTES DE FONDO

- #24 Rotar service account key comprometida (acción humana GCP)
- #26 Borrar archivos zombie + limpieza sidebar
- #87 **DECISIÓN M&A** — Jonathan decide A/B/C en próximas 1-2 semanas

## 📌 DECISIONES OPERATIVAS

1. Producto NO se vende como MVP. International-grade desde día uno.
2. Auditoría INTERNA primero. Pitch a CUTCSA recién post-Fase 4.
3. **§10 CLAUDE.md:** Cowork no edita archivos grandes/críticos.
4. **§11 CLAUDE.md:** No-Regresión obligatoria. 7 criterios pre-commit.
5. **§12 CLAUDE.md (NUEVA):** Verificación en producción excluyente.
   No avanzar sin 100% OK funcional desde perspectiva de usuario final.
6. División Cowork/Code: Cowork hace archivos NUEVOS + diseño + docs;
   Code hace edits en críticos + build + deploy + verificación.

## 🔴 RIESGOS ESTRATÉGICOS ACTIVOS

1. **Cittati llega a CUTCSA antes que nosotros** (alta probabilidad,
   alto impacto). Mitigación: velocidad estratégica + relación CUTCSA.
2. **Optibus lanza versión Latam-friendly** (media probabilidad,
   alto impacto). Mitigación: moat cross-op profundizado + patentes.
3. **Falla de seguridad pública** (baja-media, crítico). Mitigación:
   ISO 27001 compliance statement Sprint 4.

## 📝 NOTA PARA JONATHAN

Lo que aprendimos hoy aplicando §12: aunque Code reportó "Sprint 1
cerrado con 7/7 criterios §11 OK", al verificar con criterio de usuario
final detectamos un bug crítico (CTA mailto roto) y un gap funcional
(onboarding no accesible al público).

**Sin §12, ese pricing iba al pitch a CUTCSA con un bug embarazoso.**
La regla es ahora vinculante para los próximos 11 sprints.

Cuando Code complete el redeploy y la verificación §12 en producción,
y vos pruebes los endpoints regulatorio con tu token, **recién ahí
Sprint 1 cierra**. Después arrancamos Sprint 2 (HeadwayInsights + GPS
Playback) — pero esta vez con §12 desde el día uno.
