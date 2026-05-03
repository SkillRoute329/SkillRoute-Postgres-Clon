# SkillRoute — Roadmap de Cierre de Gaps Priorizado

> **Documento de Fase 3 — Roadmap ejecutable para cerrar los gaps detectados en el análisis competitivo internacional.**
>
> **Fecha:** 2026-04-25
> **Inputs:** 5 dossiers de competidores, matriz comparativa maestra (51 funciones), hallazgos consolidados, dossier Cittati urgente.
> **Horizonte:** 6 meses (12 sprints de 2 semanas) — abril a octubre 2026.
> **Output esperado al cierre:** todos los gaps prioritarios cerrados con evidencia objetivable + dossier ejecutivo "SkillRoute vs The World" v1.0 listo para entregar a CUTCSA / IMM / STM / inversores.

---

## Filosofía del roadmap

Tres principios vinculantes:

**Uno — Definition of Done con evidencia.** Cada sprint cierra con
evidencia objetivable: captura de pantalla, link a archivo, ID de
commit, métrica medida en producción, reporte exportable. No se
acepta "está hecho" sin evidencia.

**Dos — Prioridad por (Impacto × Diferencial) ÷ Esfuerzo.** Los
quick-wins comerciales (esfuerzo bajo, impacto alto) van primero.
Los gaps técnicos profundos (EAM, NetworkEditor, ML predictions) se
intercalan después con sprints más largos.

**Tres — El moat cross-op se profundiza en paralelo.** Cada sprint,
dedicar 10-20% del esfuerzo a profundizar nuestros diferenciadores
estructurales (cross-op DRO/HRR/Coverage/Penetración + multi-tenancy
+ regulatorio). No solo cerrar gaps de los líderes, también ampliar
distancia donde ya ganamos.

---

## Cronograma de alto nivel (6 meses · 12 sprints · 4 hitos)

| Bloque | Sprints | Foco | Hito al cierre |
|---|---|---|---|
| **Bloque 1 — Comercial** | 1-2 (4 semanas) | Quick wins de mercado | Pricing público + onboarding documentado + GTFS-RT Service Alerts auto + HeadwayInsights MVP |
| **Bloque 2 — Real-time depth** | 3-4 (4 semanas) | Cerrar gap vs Swiftly | Map Hub + Run Times + Stop dwell + GPS Playback |
| **Bloque 3 — Compliance & Estándares** | 5-6 (4 semanas) | Cerrar gap vs ISO/WCAG/UITP | Compliance statement ISO 27001 + WCAG audit + OpenAPI docs |
| **Bloque 4 — AI/ML predictions** | 7-8 (4 semanas) | Cerrar gap vs Swiftly ML | Predictions ETA modelo ML producción |
| **Bloque 5 — Planning depth** | 9-10 (4 semanas) | Cerrar gap vs Remix | NetworkEditor visual + demographic overlay + Equity Latam engine |
| **Bloque 6 — EAM + dossier final** | 11-12 (4 semanas) | Cerrar gap vs Trapeze + producir dossier | Schema EAM + work orders + Dossier Ejecutivo v1.0 |

Al final del Bloque 6, SkillRoute pasa de **score actual ~55** a
**score proyectado ~75-80** en la matriz comparativa, con
**diferenciadores cross-op profundizados** y **dossier ejecutivo
firmado** listo para CUTCSA.

---

## Sprint 1 — Quick wins comerciales · Semanas 1-2

**Objetivo del sprint:** mover la aguja comercial en 2 semanas con
cuatro entregables de bajo esfuerzo y alto impacto.

| # | Entregable | DoD | Owner |
|---|---|---|---|
| 1.1 | **Pricing público transparente con tier por buses** publicado en página comercial | Página `/pricing` accesible, 3 tiers (50/200/500+ buses), CTA a contacto. Capturas en evidencia. | Jonathan + Cowork |
| 1.2 | **Documento "Onboarding 2-4 semanas"** con timeline visible y caso UCOT como evidencia | PDF o página web pública. Incluye semana 1, 2, 3, 4 con tareas concretas. | Cowork |
| 1.3 | **GTFS-RT Service Alerts auto-publish** — cualquier alerta táctica genera GTFS-RT Service Alert push | Cron + endpoint validado contra Google validator. Evidencia: feed público + reporte validador. | Code |
| 1.4 | **Compliance reporting export estructurado** para reguladores | Endpoint `/api/regulatorio/export` que genera PDF estandarizado. Evidencia: PDF de muestra. | Cowork (diseño) + Code (implementación) |

**Métrica de cierre:** 4 entregables completos con evidencia. Score
matriz actualizado: pricing 0→5, onboarding 5→5 (mantenido), GTFS-RT
Service Alerts 2→5, Compliance reporting 2→4.

---

## Sprint 2 — HeadwayInsights + GPS Playback · Semanas 3-4

**Objetivo:** cerrar gap en headway analytics (Swiftly) + entregar
GPS Playback (quick win).

| # | Entregable | DoD | Owner |
|---|---|---|---|
| 2.1 | **HeadwayInsights.tsx** — bunching/gapping single-op + HRR cross-op en una sola vista premium | Vista por ruta × parada × hora, thresholds configurables, comparación actual vs scheduled, vista cross-op HRR. Captura del producto. | Code |
| 2.2 | **GPS Playback** — timeline replay histórico de movimiento de flota | Vista `/traffic/gps-playback` con slider temporal, replay de últimas 24h por ruta o por bus. | Code |
| 2.3 | **HeadwayInsights documentado** como diferenciador en página comercial | Sección de feature destacado con captura. | Cowork |
| 2.4 | **Caso de uso público:** "Detectamos bunching cross-op entre UCOT y CUTCSA en línea X" — anonymized | Documento Markdown + screenshot real. | Cowork |

**Métrica:** HeadwayInsights 2→5 (incluyendo HRR cross-op único).

---

## Sprint 3 — Map Hub unificado + Run Times · Semanas 5-6

**Objetivo:** cerrar gap real-time profundo vs Swiftly.

| # | Entregable | DoD | Owner |
|---|---|---|---|
| 3.1 | **Map Hub unificado** — refactor LiveMap + CorridorMap + FleetMonitor en una sola vista con switch de capas (vehicles / demanda / alertas / FMS health / DRO live) | Vista única `/operations/map-hub`. Capas activables. Performance test con 300+ buses. | Code |
| 3.2 | **Run Times analytics** — comparación tiempo real vs schedule por línea/parada/hora | Dashboard `/analytics/run-times` con bottleneck detection automático. | Code |
| 3.3 | **Stop dwell times analytics** — métrica nueva en pipeline `vehicle_events` | Cron que extrae dwell times de eventos GPS, dashboard que los muestra. | Code |
| 3.4 | **Auto-assignment GPS mejorado** — matching algorithm más robusto entre GPS pings y trips/blocks | Reducción de "ghost" GPS pings. Métrica: % asignación correcta. | Code |

**Métrica:** Map Hub 3→5, Run Times 2→4, Stop dwell 0→4.

---

## Sprint 4 — Compliance & Estándares · Semanas 7-8

**Objetivo:** cerrar gap vs estándares internacionales (UITP/ISO/WCAG).

| # | Entregable | DoD | Owner |
|---|---|---|---|
| 4.1 | **Compliance statement ISO 27001** público — mapeo de controles que SkillRoute cumple sin certificación formal | Documento PDF de 10-15 páginas con checklist. Auditable por consultora externa. | Cowork |
| 4.2 | **Auditoría WCAG 2.2 AA con Lighthouse + axe-core** — informe detallado de accesibilidad | Score Lighthouse > 95, errores axe-core remediados. Reporte público. | Code + audit tool |
| 4.3 | **APIs documentadas con OpenAPI 3.0** (Swagger) | `intelligenceApi` documentada, swagger-ui accesible público en `/api/docs`. | Code |
| 4.4 | **Compliance público Ley 18.331 Uruguay** — documento técnico-legal de cómo SkillRoute cumple normativa local | Documento con asesoría legal opcional. | Cowork + asesor legal |
| 4.5 | **SLA público de SkillRoute** — uptime 99.95%, latencia GTFS-RT < 5s, etc. | Página `/sla` pública con métricas medidas + status page (statuspage.io o similar). | Cowork |

**Métrica:** ISO 27001 público 0→4, WCAG audit 1→4, Open APIs 2→4,
SLA 0→4.

---

## Sprint 5-6 — AI/ML Predictions ETA · Semanas 9-12

**Objetivo:** cerrar el gap más visible vs Swiftly. ML predictions.

### Sprint 5 (semanas 9-10) — Data prep + modelo baseline

| # | Entregable | DoD | Owner |
|---|---|---|---|
| 5.1 | Pipeline de datos de entrenamiento — extraer de `vehicle_events` y `viajes_activos` | Dataset CSV con features (hora, día semana, ruta, GPS, ridership, weather) y target (tiempo real al next stop). | Code |
| 5.2 | Modelo baseline supervisado — Gradient Boosting o XGBoost | MAE < 60 segundos en test set. Reporte de evaluación. | Cowork (modelo) + Code (deploy) |
| 5.3 | Endpoint `/api/predictions/eta` con respuesta < 200ms p95 | Benchmark de latencia. Cache si necesario. | Code |

### Sprint 6 (semanas 11-12) — Producción + medición

| # | Entregable | DoD | Owner |
|---|---|---|---|
| 6.1 | Modelo en producción + servicio scheduled cron retrain semanal | Predictions visibles en GTFS-RT TripUpdates. Evidencia: comparativa pre/post precision. | Code |
| 6.2 | Dashboard de model monitoring — drift detection, performance over time | Vista `/admin/ml-monitoring` con métricas. | Code |
| 6.3 | Caso de uso público: "Mejoramos OTP en Y% con predictions ML" | Documento con métricas reales. | Cowork |

**Métrica:** Predictions ETA 1→4. Big data engine 3→4. Bottleneck
detection (que se nutre de predictions) 1→4.

---

## Sprint 7-8 — Planning depth · Semanas 13-16

**Objetivo:** cerrar gap vs Remix en planning visual + equity.

### Sprint 7 (semanas 13-14) — NetworkEditor.tsx + demographic overlay

| # | Entregable | DoD | Owner |
|---|---|---|---|
| 7.1 | **NetworkEditor.tsx** — vista de edición visual de red (drag-drop líneas/paradas) con import/export GTFS | Edición de paradas, modificación de rutas, preview en mapa. Export GTFS validado. | Code |
| 7.2 | **Demographic data overlay** — capa de datos INE Uruguay (censos por barrio) sobre el mapa | Capa toggle-able. Población, ingreso medio, edad media por barrio. | Cowork (data) + Code (UI) |
| 7.3 | **Visualización de impacto financiero** al editar red — cost/km, ingresos esperados, ROI | Conexión `forecastService` ↔ NetworkEditor. Sidebar con métricas en vivo. | Code |

### Sprint 8 (semanas 15-16) — Equity Analysis Latam Engine

| # | Entregable | DoD | Owner |
|---|---|---|---|
| 8.1 | **Análisis Equidad Territorial Latam Engine** — adaptación de Title VI Remix a normativa uruguaya/latam | Análisis de cobertura por barrio + ingresos + accesibilidad. Output: reporte con criterios STM/IMM. | Cowork (algoritmo) + Code |
| 8.2 | **Reporte equity exportable** para regulador | PDF estructurado tipo "Service Equity Analysis". | Code |
| 8.3 | **Caso de uso público** — análisis de equidad de la red metropolitana de Montevideo | Documento con datos reales (anonimizados). | Cowork |

**Métrica:** NetworkEditor 1→4, Demographic overlay 0→4, Equity Latam
0→5 (diferenciador único).

---

## Sprint 9-10 — EAM completo · Semanas 17-20

**Objetivo:** cerrar gap más profundo vs Trapeze. Asset Management.

### Sprint 9 (semanas 17-18) — Schema EAM + work orders

| # | Entregable | DoD | Owner |
|---|---|---|---|
| 9.1 | **Schema EAM completo** — `assets/`, `work_orders/`, `inspections/`, `parts/`, `inventory/` colecciones Firestore | Schema documentado, migrations aplicadas, RBAC configurado. | Code |
| 9.2 | **Work Orders module** — creación, asignación, completion, attach photos | UI nueva en MaintenanceDashboard. | Code |
| 9.3 | **Asset lifecycle tracking** — estado actual + historial completo de cada vehículo | Vista detalle de cada vehículo con timeline. | Code |

### Sprint 10 (semanas 19-20) — Inventory + reliability + APK mecánico

| # | Entregable | DoD | Owner |
|---|---|---|---|
| 10.1 | **Inventory module** — partes, stock, alertas de stock bajo | UI + cron alertas. | Code |
| 10.2 | **Reliability reports** — MTBF, MTTR, Pareto de fallas por modelo | Dashboard `/maintenance/reliability`. | Code |
| 10.3 | **APK rol mecánico** — extender Capacitor con rol nuevo, vista de work orders asignadas | Build APK + distribución a operador. | Code |
| 10.4 | **Predictive maintenance ML básico** — predicción de filtros, frenos, neumáticos | Modelo + alertas en vivo en MaintenanceDashboard. | Cowork (modelo) + Code |

**Métrica:** EAM lifecycle 1→4, Predictive maintenance 1→3, APK
mecánico 1→4, Reliability reports 2→4.

---

## Sprint 11-12 — Refinamiento + Dossier Ejecutivo · Semanas 21-24

**Objetivo:** producir el dossier ejecutivo final y cerrar gaps
restantes.

### Sprint 11 (semanas 21-22) — Refinamiento + GenAI Preferences

| # | Entregable | DoD | Owner |
|---|---|---|---|
| 11.1 | **GenAI Preferences en español** — implementar Preference Designer-style usando OpenAI/Anthropic API para reglas de turnos | UI: usuario escribe "no más de 10 turnos sobre 9 horas" → genera regla ejecutable. | Code |
| 11.2 | **Cobertura cross-op dashboard refinado** — nivel ejecutivo, exportable a PDF | Dashboard `/executive/coverage` para directivos no técnicos. | Code |
| 11.3 | **Análisis de Penetración cross-op** mejorada — comparativa histórica + proyección | Roadmap UI + chart trends. | Code |
| 11.4 | **Patentes investigadas** — asesoría legal sobre patentabilidad método DRO/HRR cross-op | Documento legal con conclusión y plan de aplicación. | Jonathan + abogado |

### Sprint 12 (semanas 23-24) — Dossier Ejecutivo + materiales pitch

| # | Entregable | DoD | Owner |
|---|---|---|---|
| 12.1 | **Dossier Ejecutivo "SkillRoute vs The World" v1.0** — PDF profesional 30-40 páginas | Tapa + índice + metodología + competidores + posicionamiento + gaps cerrados + diferenciadores + cumplimiento estándares + roadmap forward + conclusiones + anexos. | Cowork |
| 12.2 | **Pitch deck CUTCSA v1.0** — 15-20 slides | Tapa + tesis + producto + diferenciadores + propuesta valor CUTCSA + financials + ask | Cowork + Jonathan |
| 12.3 | **Página comercial completa** — todo público y consumible sin pitch | URL pública con valor proposition + features + pricing + onboarding + compliance + casos de uso + contacto | Cowork |
| 12.4 | **Video demo de 5 minutos** — flujo completo del producto en operativa diaria simulada | Captura de pantalla con voiceover. Subir a YouTube unlisted o página comercial. | Jonathan + Cowork |
| 12.5 | **Score final matriz comparativa** — actualizar `MATRIZ_MAESTRA.xlsx` con nuevos scores | SkillRoute target → SkillRoute actual. Score esperado 75-80. | Cowork |

**Métrica:** Dossier publicado, pitch deck listo, score matriz
actualizado.

---

## Inversiones paralelas (no por sprint)

Cinco workstreams paralelos durante los 6 meses, no asociados a
sprints específicos:

### A. Inteligencia comercial continua (Cittati + competidores)
- Google Alerts: "Cittati expansion Uruguay", "Optibus Latin America",
  "Modaxo new market", "Constellation Software transit acquisition".
- Mensual: review de noticias UITP, Mass Transit Magazine, ITS
  International.
- Trimestral: actualizar matriz comparativa con nuevos features
  detectados.

### B. Relación con CUTCSA + IMM + STM
- Mensual: contacto con CUTCSA. Empezar antes de Sprint 1.
- Trimestral: posibilidad de visita IMM con dossier preliminar.
- Continuo: mantener UCOT informado del progreso.

### C. Decisión M&A
- Sprint 1-2: Jonathan define tesis (ver `docs/DECISION_M_A.md`).
- Determina cómo nos posicionamos públicamente y qué IP defendemos.

### D. Asesoría legal
- IP / patentes método DRO/HRR cross-op (urgente, antes de exposición
  pública).
- Trademark "SkillRoute" en Latam.
- Contratos con CUTCSA + estructura societaria.

### E. Equipo / hiring
- Si el roadmap muestra capacidad insuficiente: contratar 1-2
  desarrolladores (frontend ML, backend Cloud Functions).
- Considerar consultora UX externa para refinar Map Hub + NetworkEditor.

---

## Hitos comerciales asociados al roadmap

| Mes | Hito comercial | Sprint asociado |
|---|---|---|
| Mes 1 (semanas 1-4) | Pricing público + onboarding documentado + HeadwayInsights vivo | Sprints 1-2 |
| Mes 2 (semanas 5-8) | Real-time depth completo + compliance público | Sprints 3-4 |
| Mes 3 (semanas 9-12) | Predictions ETA en producción + caso público | Sprints 5-6 |
| Mes 4 (semanas 13-16) | Planning visual + Equity Latam engine | Sprints 7-8 |
| Mes 5 (semanas 17-20) | EAM completo + APK mecánico | Sprints 9-10 |
| Mes 6 (semanas 21-24) | Dossier ejecutivo + pitch deck + presentación CUTCSA | Sprints 11-12 |

**Si CUTCSA pide reunión antes del mes 6**, podemos avanzar la
presentación con el dossier preliminar (snapshot al hito que
estemos). Pero la versión completa con todos los gaps cerrados y
patentes investigadas requiere 6 meses.

---

## Asignación de recursos esperada

| Workstream | % esfuerzo total |
|---|---|
| Cierre de gaps (sprints 1-12 entregables) | 60% |
| Profundización moat cross-op (paralelo cada sprint) | 15% |
| Compliance + documentación + dossier | 10% |
| Inteligencia comercial + relación CUTCSA | 10% |
| Asesoría legal + IP + M&A decision | 5% |

---

## Riesgos del roadmap

| Riesgo | Mitigación |
|---|---|
| Cittati llega a CUTCSA antes del mes 6 | Avanzar relación CUTCSA desde Sprint 1. Snapshot dossier antes de cierre. |
| Falta de bandwidth de Code para todos los entregables | Reducir scope de sprints 9-10 (EAM) si necesario. EAM básico es suficiente para mes 6. |
| ML predictions no logra MAE objetivo | Cambiar enfoque a heurística mejorada como bridge. Mover ML a roadmap mes 7-9. |
| Compliance ISO 27001 requiere más tiempo del esperado | Compliance statement primero (este sprint), certificación formal post-mes 6. |
| Decisión M&A no tomada a tiempo | Bloqueador. Forzar decisión Sprint 1-2 con documento `DECISION_M_A.md`. |

---

## Métrica de éxito final del roadmap

Al cierre del mes 6:

- ✅ Score SkillRoute en matriz comparativa: de ~55 a ~75-80.
- ✅ Top 10 gaps prioritarios cerrados con evidencia.
- ✅ 5 diferenciadores únicos profundizados y documentados.
- ✅ Compliance público contra UITP/GTFS/ISO/WCAG/Ley 18.331.
- ✅ Dossier Ejecutivo "SkillRoute vs The World" v1.0 publicado.
- ✅ Pitch deck CUTCSA v1.0 listo.
- ✅ Página comercial completa publicada.
- ✅ Decisión M&A tomada y documentada.
- ✅ Asesoría legal IP/patentes con resolución.
- ✅ Relación CUTCSA en estado avanzado (idealmente acuerdo o piloto firmado).

Si los 10 puntos están en verde, **estamos listos para presentar
ante CUTCSA o IMM con producto international-grade**.

---

## Próximos pasos inmediatos (esta semana)

| Acción | Owner | Plazo |
|---|---|---|
| Jonathan revisa y aprueba este roadmap | Jonathan | 2 días |
| Jonathan toma decisión M&A (ver documento separado) | Jonathan | 5 días |
| Cowork inicia Sprint 1 (pricing público + onboarding doc) | Cowork | Inmediato |
| Code prepara entorno para Sprint 1 (GTFS-RT auto-publish) | Code | 3 días |
| Investigar abogado especialista en IP transit/transit Latam | Jonathan | 1 semana |

---

## Documentos relacionados

- `docs/ESTRATEGIA_INTERNATIONAL_GRADE.md` — norte estratégico vinculante.
- `docs/COMPETIDORES/HALLAZGOS_CONSOLIDADOS.md` — síntesis de Fase 2.
- `docs/COMPETIDORES/MATRIZ_MAESTRA.xlsx` — matriz cuantitativa.
- `docs/COMPETIDORES/optibus.md`, `swiftly.md`, `remix.md`, `trapeze.md`,
  `cittati.md` — dossiers individuales.
- `docs/DECISION_M_A.md` — opciones estratégicas para Jonathan.
