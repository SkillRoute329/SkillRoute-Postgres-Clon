# SkillRoute vs The World — Hallazgos Consolidados

> **Documento ejecutivo de Fase 2 — síntesis estratégica**
> **Fecha:** 2026-04-25
> **Inputs:** 4 dossiers individuales (Optibus, Swiftly, Remix, Trapeze) + matriz comparativa maestra (51 funciones × 5 plataformas + 17 estándares internacionales).
> **Output:** Este documento consolida hallazgos, define posicionamiento estratégico, prioriza gaps y arma la base para Fase 3 (roadmap de cierre).

---

## Resumen ejecutivo (1 página)

Después de auditar a los 4 líderes mundiales del software de transporte
público — Optibus (Israel/UK, $140M funding, 6.000 ciudades), Swiftly
(USA, 136 agencies, líder real-time), Remix/Via (USA, 340 cities, líder
planning), Trapeze/Modaxo (Canadá, 38 años de historia, backed by
Constellation Software) — y cruzar 51 funciones canónicas con 17
estándares internacionales aplicables, los hallazgos son cinco:

**Uno.** Los 4 líderes son **complementarios entre sí**, no competidores
puros. Optibus = scheduling + planning. Swiftly = real-time + analytics.
Remix = network design + equity. Trapeze = stack legacy + EAM. Una
agencia grande tipo LA Metro probablemente paga **los cuatro
simultáneamente** — entre 700K USD y 1.5M USD/año combinados — porque
ninguno cubre el espectro completo.

**Dos.** Los 4 líderes son **single-tenant por diseño arquitectónico**.
Cada uno vende a UN operador a la vez. Mezclar datos de múltiples
operadores en una misma ciudad es contractualmente prohibido y
arquitectónicamente costoso para ellos. **SkillRoute nació
multi-tenant cross-op por decisión de origen.** Eso convierte
nuestro ShadowRadar DRO live, HRR live cross-op, Cobertura cross-op y
Análisis de Penetración por corredor en capacidades que **literalmente
ninguno de los 4 puede ofrecer hoy**, y replicarlo les tomaría 2-3 años
de rehacer modelo de negocio.

**Tres.** El mercado **latinoamericano está mayormente intacto** para
los 4 líderes. Optibus tiene presencia DACH y UK, Swiftly USA, Remix
USA + Europa. **El único competidor con presencia regional es Cittati
(Brasil, dentro de Modaxo).** Eso lo convierte en la alarma estratégica
más relevante. Si Cittati se expande a Uruguay, Argentina, Chile o
Colombia antes que nosotros, el ángulo regional se debilita.

**Cuatro.** Hay **gaps reales y serios** en SkillRoute respecto a los
líderes. Network editor visual (Remix), schedule optimization AI
(Optibus), predictions ETA con ML (Swiftly), EAM completo (Trapeze),
GTFS-RT Service Alerts auto-publish, equity analysis automatizado,
compliance ISO 27001 público. Todos cerrables con roadmap concreto;
ninguno bloqueante para empezar a comercializar el moat cross-op.

**Cinco.** La narrativa comercial es clara. **No competimos cabeza a
cabeza con Optibus en scheduling, ni con Swiftly en predictions, ni
con Remix en planning, ni con Trapeze en EAM.** Competimos en
**cobertura suficiente integrada de los 4 verticales + cross-op único
+ pricing accesible + onboarding rápido + español nativo + adaptación
regulatoria latinoamericana**. Es un perfil que ninguno de los 4
líderes puede igualar sin años de inversión.

---

## Patrones detectados al cruzar los 4 análisis

### Patrón 1 — La fragmentación del mercado es nuestra oportunidad

Cada líder es excepcional en SU vertical y débil fuera de él:

| Líder | Vertical fuerte | Score promedio fuera de su vertical |
|---|---|---|
| Optibus | Scheduling + Planning | ~2.5/5 en real-time + EAM |
| Swiftly | Real-time + Analytics | ~1.5/5 en planning + EAM |
| Remix | Planning + Equity | ~1/5 en real-time + EAM + scheduling |
| Trapeze | EAM + Mobility on Demand | ~3/5 en real-time, débil en innovación |

Una agencia que necesita los 4 verticales termina pagando los 4
productos. **SkillRoute ofrece cobertura de "bueno-en-todo" en lugar
de "excepcional-en-uno"**, lo cual para operadores 50-500 buses es
exactamente lo que necesitan a fracción del costo.

### Patrón 2 — La AI 2026 está bifurcada

Optibus apuesta fuerte a **GenAI declarativa** (Preference Designer
en lenguaje natural, Copilot futuro). Swiftly profundiza **ML
supervisado** sobre big data (predictions ETA, auto-assignment).
Remix y Trapeze van **mucho más atrás** en ambas dimensiones.

**Implicación SkillRoute:** roadmap AI debería incluir AMBAS — GenAI
declarativa para preferences/rules de scheduling, y ML clásico para
predictions ETA. Empezar con ML predictions porque es expectativa
básica del mercado; agregar GenAI después como diferenciador 2027.

### Patrón 3 — Los pricing son opacos y caros

Ninguno de los 4 líderes publica pricing. Todos son quote-based con
sales cycles de 1-18 meses. Estimaciones reales de licitaciones:

| Tier operador | Optibus | Swiftly | Remix | Trapeze |
|---|---|---|---|---|
| 50-100 buses | $30-60K | $25-50K | $15-30K | $50-150K (TripSpark) |
| 200-500 buses | $80-200K | $80-150K | $40-80K | $100-300K |
| 1000+ buses | $300-800K | $300-600K | $100-200K | $1-5M |

**Implicación SkillRoute:** publicar pricing transparente con tier por
buses elimina el "cost of inquiry" — operadores chicos y medianos hoy
no piden cotización a Optibus porque saben que no pueden pagar. Si
ven nuestro pricing público y entra en presupuesto, evalúan. Esa
fricción es un gap comercial que vale más que cualquier feature.

### Patrón 4 — Multi-tenancy es la línea divisoria estructural

Los 4 líderes son single-tenant. Su modelo: cada cliente tiene un
deployment lógico separado, datos en silo, contratos individuales.
**Esto no es un bug — es una decisión de modelo de negocio arraigada
durante años.** Para mezclar datos de operador A con operador B
necesitan: (a) contratos legales con ambos; (b) infra técnica
multi-tenant; (c) cláusulas de privacidad cruzadas; (d) precios
diferenciales. Es complejo, lento y peligroso para empresas con
clientes pagando 200K+/año cada uno.

**Implicación SkillRoute:** multi-tenancy nativa es el moat más
defensible. Para profundizarlo: documentar arquitectónicamente cómo lo
hacemos, cómo cumplimos privacidad de cada operador (Ley 18.331
Uruguay), y cómo el regulador (IMM/STM) tiene una vista cross-op
agregada que ningún operador individual ve. Eso vende solo, sin
necesidad de feature work adicional.

### Patrón 5 — La accesibilidad regulatoria/política está vacante

Ninguno de los 4 líderes tiene un módulo serio para **autoridades
reguladoras** (DOT en USA, IMM/STM en Uruguay, CAF en países latinos).
Los 4 venden a **operadores**, no a reguladores. Sus reportes
son estilo "agency self-serve", no "regulatory dashboard".

**Implicación SkillRoute:** Dossier Regulatorio Automatizado es un
diferenciador único orientado a IMM/STM/CAF. Para CUTCSA esto vale
oro político: si CUTCSA puede decirle a la IMM "implementé un sistema
que ustedes pueden auditar en tiempo real", su posición regulatoria
mejora dramaticamente. Es una palanca de venta que ningún competidor
ofrece.

---

## Posicionamiento estratégico SkillRoute

### Tagline interno
*"La única plataforma de transporte público diseñada para el sistema
metropolitano completo, no para un operador a la vez."*

### Tagline comercial (a refinar con marketing)
*"Inteligencia cross-operador para redes de transporte público.
Cumplimiento internacional. Pricing transparente. Onboarding en
semanas."*

### Mensaje 30 segundos (elevator pitch)
*"Optibus, Swiftly y Remix son las mejores herramientas del mundo —
cada una para optimizar UN operador. Pero ninguna te dice qué pasa
cuando 4 operadores comparten el mismo corredor en una ciudad. Ahí
está el 30% de ineficiencia oculta del transporte público
metropolitano. SkillRoute es la única plataforma que la mide en
tiempo real, con cumplimiento UITP/GTFS/TCRP/ISO, en español, a
precio que un operador mediano puede pagar."*

### Cliente ideal
- Cooperativa o operador de **50-500 buses**.
- Mercado **latinoamericano** o **español-hablante**.
- Operadora ya tecnológica (CAD/AVL existente o GPS por IMM).
- Necesidad de **cumplimiento regulatorio** explícito (IMM, STM,
  reguladores nacionales).
- Operadora que **forma parte de un sistema metropolitano** con otros
  operadores (donde nuestro cross-op es valor inmediato).

### Cliente NO ideal (saber decir que no)
- Agencia federal/estatal grande de USA (Optibus/Swiftly/Trapeze los
  tienen capturados).
- Operador europeo grande (UITP, Optibus, NeTEx exigen profundidad
  que no tenemos).
- Operador de un solo corredor sin competencia (cross-op no agrega).
- Empresa solo-paratransit (Trapeze/RouteMatch los cubren mejor).

---

## Top 10 gaps prioritarios (de la matriz Excel)

Ordenados por score (Impacto Comercial × Diferencial Competitivo) ÷
Esfuerzo. Detalle completo en `MATRIZ_MAESTRA.xlsx`, hoja "4. Gap
Analysis Priorizado".

| # | Gap | Score | Esfuerzo | Impacto |
|---|---|---|---|---|
| 1 | Pricing público con tier por buses | 25 | Bajo | Alto |
| 2 | Inteligencia Cittati (Brasil) — research comercial | 20 | Bajo | Alto |
| 3 | Documentar onboarding 2-4 semanas con evidencia | 20 | Bajo | Alto |
| 4 | Compliance reporting export estructurado | 10 | Bajo | Alto |
| 5 | HeadwayInsights.tsx (single-op + HRR cross-op) | 12.5 | Medio | Alto |
| 6 | GTFS-RT Service Alerts auto-publish | 12 | Bajo | Medio |
| 7 | GPS Playback histórico timeline | 4.5 | Bajo | Medio |
| 8 | Patente método DRO/HRR cross-op | 8.3 | Medio | Alto |
| 9 | Compliance statement ISO 27001 público | 6.7 | Medio | Alto |
| 10 | Análisis Equidad Territorial Latam (engine) | 6.3 | Alto | Alto |

**Lectura:** los primeros 4 son de esfuerzo bajo y alto impacto —
**pueden cerrarse en 1-2 semanas y mover la aguja comercial
inmediatamente**. Son los "quick wins" estratégicos. El resto requiere
sprints de 2-8 semanas pero entrega diferenciadores fuertes.

---

## Top 5 diferenciadores únicos confirmados (de la matriz)

| # | Diferenciador | Score actual | Riesgo de ser copiado |
|---|---|---|---|
| 1 | DRO live cross-operador (TCRP 195 cross-op real-time) | 5/5 | Bajo — 2-3 años para que un competidor rehaga su modelo |
| 2 | Multi-tenancy nativa de operadores | 5/5 | Bajo — decisión arquitectónica de origen |
| 3 | Pricing accesible para 50-500 buses | 5/5 | Bajo — los líderes no van a bajar pricing |
| 4 | Onboarding rápido 2-4 semanas | 5/5 | Medio — Remix ya es rápido pero foco diferente |
| 5 | HRR live cross-op + Cobertura cross-op | 4/5 | Bajo — misma razón que DRO |

**Acción:** estos 5 diferenciadores son la columna vertebral del pitch
comercial. Toda la narrativa del Dossier Ejecutivo (Fase 4) gira
alrededor de ellos.

---

## Top 5 riesgos estratégicos identificados

| # | Riesgo | Probabilidad | Impacto | Mitigación urgente |
|---|---|---|---|---|
| 1 | Cittati (Trapeze/Modaxo Brasil) llega a CUTCSA antes que nosotros | Alta | Alto | Velocidad. Cerrar relación profunda CUTCSA + IMM antes de exposición pública. |
| 2 | Optibus lanza "Optibus Lite" agresivo para Latam (tienen $140M funding) | Media | Alto | Construir moat cross-op rápido. Considerar patentes. |
| 3 | Falla de seguridad pública destruye credibilidad | Baja-Media | **Crítico** | ISO 27001/SOC 2 prioritario. Auditorías. Bug bounty. |
| 4 | Constellation Software intenta adquisición | Media (si crecemos) | Variable | Decisión estratégica del fundador: definir tesis M&A. |
| 5 | CUTCSA o IMM deciden construir solución in-house | Baja-Media | Alto | Demostrar TCO menor que in-house con mantenimiento real. |

Detalle completo en `MATRIZ_MAESTRA.xlsx` hoja "6. Riesgos
Estratégicos".

---

## Cumplimiento de estándares — estado actual

Cruzamos los 17 estándares internacionales aplicables:

**Implementados sólidamente (✅):**
- GTFS-RT V2 (VehiclePositions + TripUpdates con delay real)
- TCRP 195 (DRO + Headway — extendido a cross-op, único en el mundo)

**Implementados parcialmente (⚠️):**
- GTFS-Static
- UITP best practices (KPIs canónicos)
- Ley 18.331 Uruguay (RBAC + audit log)

**No implementados pero alta prioridad (🔴):**
- ISO 27001 / SOC 2 (compliance statement primero, certificación 2027)
- WCAG 2.2 AA (auditoría formal con Lighthouse + axe)
- GTFS-RT Service Alerts auto-publish

**No aplicables o bajo prioridad (—):**
- NeTEx, SIRI v2 (mercado europeo, no foco inicial)
- HIPAA (no aplica)
- GDPR (solo si entramos a UE)
- LGPD (cuando entremos a Brasil)

---

## Decisión estratégica recomendada para Fase 3

Pasar a **Fase 3 — Roadmap de cierre de gaps priorizado** sin agregar
más competidores. Los 4 ya analizados muestran patrón consistente:
agregar INIT, Hitachi o HASTUS robustecería el dossier final pero
no cambiaría conclusiones estratégicas.

**Si después de Fase 4 (dossier ejecutivo final) sentimos que CUTCSA
o un consultor regulatorio piden más profundidad**, agregamos:

- **INIT** (Alemania) — para profundidad europea ITS.
- **Hitachi Optimise** (UK/Japón) — para ángulo MaaS + datos.
- **HASTUS / GIRO** (Canadá) — para alternativa enterprise scheduling.
- **Cittati** (Brasil) — el más urgente comercialmente.

**Mi recomendación:** **investigar Cittati ahora aunque sea fuera de
fase**, porque es nuestro único competidor regional. Los otros 3
pueden esperar. Cittati es prioridad de inteligencia comercial, no de
benchmark técnico.

---

## Próximos pasos (Fase 3 — Roadmap)

Inputs disponibles:
- 4 dossiers individuales en `docs/COMPETIDORES/`
- `MATRIZ_MAESTRA.xlsx` con 51 funciones × 5 plataformas + 17 estándares + 29 gaps + 11 diferenciadores + 10 riesgos.
- Este documento de hallazgos consolidados.

Outputs a producir en Fase 3:
1. `docs/ROADMAP_CIERRE_GAPS.md` — plan trimestral con sprints,
   Definition of Done por gap, evidencia objetivable de cierre.
2. `docs/DECISION_M&A.md` — decisión estratégica del fundador sobre
   apertura a adquisición (informa cómo nos posicionamos).
3. `docs/COMPETIDORES/cittati.md` — investigación urgente del
   competidor regional.

---

## Anexos disponibles

- **Dossiers individuales** (formato Markdown):
  - `docs/COMPETIDORES/optibus.md` — 16 secciones, 30 funciones comparadas, score SkillRoute 88 vs Optibus 105.
  - `docs/COMPETIDORES/swiftly.md` — 16 secciones, 27 funciones comparadas, score SkillRoute 89 vs Swiftly 79.
  - `docs/COMPETIDORES/remix.md` — 15 secciones, 19 funciones comparadas, score SkillRoute 65 vs Remix 47.
  - `docs/COMPETIDORES/trapeze.md` — 15 secciones, 19 funciones comparadas, score SkillRoute 53 vs Trapeze 51.

- **Matriz comparativa maestra** (formato Excel):
  - `docs/COMPETIDORES/MATRIZ_MAESTRA.xlsx` (6 hojas).

- **Estrategia maestra**:
  - `docs/ESTRATEGIA_INTERNATIONAL_GRADE.md` (norte vinculante).

---

## Conclusión

SkillRoute tiene un moat estructural defensible (cross-op + multi-tenancy
+ regulatorio Latam) que **ningún líder mundial puede replicar sin
rehacer su modelo de negocio**. Los gaps identificados son cerrables
con roadmap concreto y la mayoría son quick-wins de bajo esfuerzo y
alto impacto. El mercado regional está mayormente intacto, con Cittati
(Brasil) como única alarma estratégica que requiere acción acelerada.

La narrativa comercial es clara, defendible con evidencia (matriz
maestra de 51 funciones × 5 plataformas), y no requiere "inventar
algo nuevo" — solo profundizar lo que ya tenemos y cerrar los 10
gaps prioritarios identificados.

**Estamos listos para Fase 3.**
