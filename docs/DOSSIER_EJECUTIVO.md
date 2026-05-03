# SkillRoute vs The World

**Dossier Ejecutivo · Análisis Competitivo Internacional · Posicionamiento Estratégico**

---

**Confidencial · v1.0 · 2026-04-25**

**Preparado por:** Jonathan Laluz, Fundador
**Producto:** SkillRoute (anteriormente TransformaFacil 2.0)
**Mercado:** Sistema metropolitano de transporte público de Uruguay y Latinoamérica
**Distribución:** restringida — uso interno + presentación a partners estratégicos.

---

## Índice

1. Resumen Ejecutivo
2. Tesis del Producto
3. Panorama Competitivo Internacional
4. Posicionamiento SkillRoute por Eje Funcional
5. Diferenciadores Estructurales Únicos
6. Cumplimiento de Estándares Internacionales
7. Validación Operativa de Día Completo
8. Gaps Cerrados con Evidencia (Sprints 1-2)
9. Roadmap Forward (6 meses)
10. Riesgos Estratégicos y Mitigaciones
11. Conclusiones — Invitación a Auditar
12. Anexos · Referencias

---

# 1. Resumen Ejecutivo

SkillRoute es la **única plataforma de gestión de transporte público
diseñada arquitectónicamente para sistemas metropolitanos completos**,
no para operadores individuales. En el universo del software de
transporte público mundial, los cuatro líderes globales — **Optibus**
(Israel/UK, $140M funding, 6.000 ciudades), **Swiftly** (USA, 136
agencies), **Remix/Via** (USA, 340 cities), **Trapeze/Modaxo**
(Canadá/USA, parte de Constellation Software) — son todos
**single-tenant por diseño**: cada uno vende a un operador a la vez,
con datos en silos contractuales. Mezclar datos de operadores
distintos en una misma ciudad les requeriría rehacer su modelo de
negocio.

SkillRoute nació cross-operador. Eso hace que cinco capacidades
estructurales sean **únicas en el mercado mundial**: detección DRO
(Directional Route Overlap, TCRP 195) en tiempo real entre operadores;
HRR (Headway-to-Rival Ratio) live cross-op; análisis de cobertura
cross-operador en tiempo real; análisis de penetración por corredor;
y multi-tenancy de operadores en una sola plataforma. Estas no son
features que un competidor pueda agregar en un sprint — son la
consecuencia de una decisión arquitectónica de origen.

Adicionalmente, SkillRoute cubre con suficiencia las áreas donde los
líderes son fuertes: planning + scheduling + operations + real-time
analytics + EAM. No alcanza la profundidad de Optibus en optimización
de schedules ni la de Swiftly en predictions ETA, pero **cubre los
cuatro verticales en una sola plataforma a un precio que ningún líder
puede igualar**: tier público USD 6-8 por bus por mes, contra
USD 80-300K/año típicos de Optibus o Trapeze para operadores
equivalentes.

El mercado latinoamericano hispanoparlante está **mayormente intacto
para los líderes globales**. La única excepción regional es Cittati
(Brasil, parte del mismo conglomerado Modaxo), que en junio 2022
adquirió Auttran con mandato corporativo declarado de expansión Latam.
Eso convierte la velocidad estratégica de SkillRoute en una variable
crítica: penetrar el mercado uruguayo con CUTCSA + IMM antes de la
expansión de Cittati a Hispanoamérica.

El producto está **operativo en producción** sirviendo al sistema
metropolitano de Montevideo (UCOT 70, CUTCSA 50, COME 20, COETC 10),
con 83 vistas, 32 Cloud Functions, 44 colecciones Firestore, 4
diferenciadores estructurales en producción y 1 listo para deploy
(Sprint 2). Cumple GTFS-Static + GTFS-RT V2 + TCRP 195 (extendido
cross-op, único en el mundo). Compliance ISO 27001 + WCAG 2.2 AA en
roadmap formal Sprint 4.

**La invitación que extiende este dossier** es a auditar SkillRoute
con cualquier consultora internacional independiente. La afirmación
del moat es verificable en 30 segundos de inspección de código y
endpoints públicos.

---

# 2. Tesis del Producto

## 2.1 Filosofía vinculante

SkillRoute **no es un MVP, no es un demo, no es un piloto**. Es un
producto **international-grade desde el día uno**, listo para operar
el sistema metropolitano completo de Montevideo bajo estándares
internacionales — UITP, GTFS, NeTEx, SIRI, TCRP, ISO 25010, ISO
27001, WCAG 2.2 AA, Ley 18.331 Uruguay.

Esta filosofía está formalizada en el documento maestro
`docs/ESTRATEGIA_INTERNATIONAL_GRADE.md`, vinculante para todas las
decisiones de producto, ingeniería y comercial. Anti-patrones
explícitamente prohibidos:

- "Después lo arreglo" para algo que el usuario va a ver.
- "Esto es MVP" cuando un competidor comercial ya lo resuelve.
- Estado vacío sin mensaje explicativo y sin métrica de calidad de datos.
- Features sin métricas, sin badges, sin tooltips que expliquen el número.
- Hard-coded de un operador donde debería ser variable cross-operador.

## 2.2 Propuesta de valor

Para un operador que evalúa software de transporte público hoy, las
opciones tradicionales son:

- **Pagar Optibus** + Swiftly + Remix + Trapeze separadamente — entre
  USD 700K y 1.5M/año combinados para cobertura razonable. Cada uno
  excelente en su vertical pero **ninguno cross-op**.
- **Construir in-house** — equipo de 5-8 ingenieros durante 2 años,
  USD 850K-1.6M en año 1, USD 250-400K/año mantenimiento posterior,
  total 3 años: USD 1.3-2.4M. Sin cross-op tampoco.
- **SkillRoute** — USD 4.800-216.000/año dependiendo del tier.
  Cobertura end-to-end + cross-op único + onboarding 2-4 semanas vs
  6-18 meses.

La diferencia entre SkillRoute y los líderes no es solo precio. Es
**modelo de negocio incompatible** con cross-op para los líderes,
**modelo de negocio nativo** cross-op para SkillRoute.

## 2.3 Cliente ideal

- Cooperativa o operador de **50-500 buses**.
- Mercado **latinoamericano hispanoparlante** (Uruguay, Argentina,
  Chile, Colombia, México, Perú).
- Operadora ya tecnológica (CAD/AVL existente o GPS público vía IMM/regulador).
- Necesidad de **cumplimiento regulatorio** explícito (IMM, STM, CAF,
  ANTT-equivalente).
- Operadora que **forma parte de un sistema metropolitano** con otros
  operadores, donde cross-op es valor inmediato.

## 2.4 Cliente NO ideal (saber decir que no)

- Agencia federal/estatal grande de USA (Optibus/Swiftly/Trapeze los
  tienen capturados con relaciones de 10-20 años).
- Operador europeo grande (UITP/NeTEx exigen profundidad europea
  que requiere inversión específica).
- Operador de un solo corredor sin competencia en su ciudad
  (cross-op no agrega valor).
- Empresa solo-paratransit (Trapeze/RouteMatch los cubren mejor).

---

# 3. Panorama Competitivo Internacional

Análisis basado en investigación primaria de las 5 plataformas más
relevantes para el mercado objetivo de SkillRoute. Documentación
detallada en `docs/COMPETIDORES/{optibus,swiftly,remix,trapeze,cittati}.md`.

## 3.1 Optibus (Israel/UK)

**Tesis:** Plataforma end-to-end con AI generativa como diferenciador
2026. Líder mundial en planning + scheduling + operations.

| Item | Dato |
|---|---|
| Fundación | 2014 |
| Funding | $140M (Series D 2022, valuation ~$1.3B) |
| Cobertura | 6.000 ciudades, 35+ países |
| Posición UK | 70% de buses del Reino Unido operan con Optibus |
| Cliente referencia | BVG Berlín, agencias DACH |
| AI 2026 | "Preference Designer" — primer GenAI sector con input lenguaje natural |
| Pricing estimado (200 buses) | USD 80-200K/año |
| Sales cycle típico | 6-18 meses (sector público) |
| Cross-op real-time | ❌ No |

**Fortalezas adoptables:** AI declarativa, GTFS-RT auto-publish 2026,
Map Hub unificada, Driver App con shift exchange.

**Debilidades aprovechables:** sales cycle lento, pricing enterprise
opaco, foco USA/UK/DACH (Latam intacto), brecha entre AI poderosa y
UX simple (su propia SWOT lo declara).

## 3.2 Swiftly (USA)

**Tesis:** Líder mundial en real-time AVL + ML predictions. Cliente
típico: agencias grandes USA (LA Metro, SEPTA, MBTA, WMATA). Su
producto estrella son las predicciones ETA 15-50% más precisas que
CAD/AVL tradicional, con OTP +40% mejorado en clientes.

| Item | Dato |
|---|---|
| Fundación | 2014 |
| Funding | $50M (Series C) |
| Cobertura | 136+ agencies en 8 países |
| Foco geográfico | USA primario, Canadá secundario, sin Latam |
| AI 2026 | ML supervisado sobre billions de GPS points |
| Pricing estimado (200 buses) | USD 80-150K/año |
| Cross-op | ❌ No |

**Fortalezas adoptables:** Headway Insights dedicado, GPS Playback,
auto-assignment GPS multi-fuente, Run Times analytics.

**Debilidades aprovechables:** sin Latam, no cubre planning ni
scheduling (agencies pagan también Optibus), inglés único.

## 3.3 Remix (Via Transportation, USA)

**Tesis:** Plataforma estrella para network design + Title VI equity
analysis. Adquirida por Via Transportation por USD 100M en marzo 2021.

| Item | Dato |
|---|---|
| Fundación | 2014, adquirida 2021 |
| Cobertura | 340+ cities en 22 países |
| Producto estrella | Title VI Engine (compliance USA) |
| Pricing estimado (mid-size) | USD 40-80K/año |
| Cross-op | ❌ No |

**Fortalezas adoptables:** editor visual de red drag-drop,
demographic data overlay, unlimited seats, dedicated CSM, onboarding
rápido.

**Debilidades aprovechables:** Title VI es US-specific (no aplica a
Latam — oportunidad de adaptación regional con Equity Latam Engine
en Sprint 8 de SkillRoute), no toca real-time, pricing opaco.

## 3.4 Trapeze Group (Modaxo / Volaris / Constellation Software)

**Tesis:** El dinosaurio enterprise — 38 años de historia, stack
completo (CAD/AVL + EAM + Mobility on Demand + Rail). Backed by uno
de los conglomerados de SaaS B2B más grandes del mundo
(Constellation Software, IT company más grande de Canadá).

| Item | Dato |
|---|---|
| Fundación | 1988 |
| Parent | Modaxo (Volaris Group → Constellation Software TSX:CSU) |
| Cobertura | Enterprise USA/Canadá + Brasil (vía Cittati) |
| Producto estrella | EAM con 100+ agencies, MARTA gestiona 90.000 assets |
| Pricing | USD 50K-5M/año |
| Cross-op | ❌ No |
| AI | Mínimo |
| Críticas WMATA Inspector General | "slow", "complex implementation", "capabilities subutilizadas" |

**Fortalezas adoptables:** EAM profundo (asset lifecycle, work
orders, predictive maintenance), reliability reports, integración
con sistemas legacy.

**Debilidades aprovechables:** UX legacy, implementación 6-18 meses,
pricing enterprise altísimo, no AI-first.

## 3.5 Cittati Brasil (Modaxo / mismo conglomerado de Trapeze) ⚠️

**El competidor regional más urgente para SkillRoute.** 18 años de
historia en Brasil, parte del mismo conglomerado Modaxo / Constellation
Software que respalda a Trapeze.

| Item | Dato |
|---|---|
| Fundación | 2008 (Recife, Brasil) |
| Parent | Modaxo / Volaris / Constellation Software |
| Cobertura | 30.000 buses monitoreados, 180 ciudades brasileñas, 500+ clientes |
| Adquisiciones recientes | **Auttran (junio 2022) con mandato declarado de expansión Latam** |
| Producto estrella | FLITS (planning + scheduling + telematics + operations) |
| Pricing estimado (mediano) | R$ 100-300K/año (USD 30-90K) |
| Idioma | Portugués primario |
| Cross-op | ❌ No |

**Riesgo estratégico:** Cittati tiene capital de Constellation Software
para crecer agresivamente y mandato corporativo de Latam. Velocidad
de SkillRoute para asegurar Uruguay + relación con CUTCSA antes de
exposición pública es **crítica**.

**Fortalezas defensivas de SkillRoute vs Cittati:** idioma español
nativo, regulación adaptada a Uruguay (Ley 18.331, criterios
STM/IMM), pricing público transparente, GenAI en español (Sprint 11),
módulo regulatorio orientado a autoridades (Cittati no lo tiene).

## 3.6 Patrón emergente confirmado

Cinco plataformas analizadas independientemente. **Cinco
confirmaciones del mismo hallazgo:** todas son single-tenant por
diseño arquitectónico. Ninguna ofrece cross-op real-time. La razón
no es técnica — es de modelo de negocio. Cada uno vende a un
operador a la vez con contratos individuales y cláusulas de
privacidad de datos. Mezclar datos de operadores distintos requiere
renegociar contratos legales con cada cliente individualmente —
imposible para empresas con cientos de clientes pagando 200K+/año.

SkillRoute nació diseñado cross-op. **Es un moat estructural
inexplotable por los competidores actuales.**

---

# 4. Posicionamiento SkillRoute por Eje Funcional

Comparativa cuantificada de SkillRoute vs los 5 competidores en 51
funciones canónicas del sector. Detalle completo en
`docs/COMPETIDORES/MATRIZ_MAESTRA.xlsx`.

Score: 0 (no tiene) → 5 (mejor del mundo).

## 4.1 Planning

| Función | SkillRoute | Optibus | Swiftly | Remix | Trapeze | Cittati |
|---|---|---|---|---|---|---|
| Network editor visual | 1 → 4 (roadmap) | 3 | 0 | **5** | 3 | 3 |
| Demographic overlay | 0 → 4 | 1 | 0 | **5** | 1 | 0 |
| Equity analysis | 0 → **5 (Latam único)** | 1 | 0 | 5 (Title VI USA) | 1 | 0 |
| Schedule optimization AI | 2 → 4 | **5** | 0 | 3 | 4 | 3 |
| GenAI declarativa | 0 → 4 (Sprint 11) | **5** | 0 | 0 | 0 | 0 |

## 4.2 Real-time + Analytics

| Función | SkillRoute | Optibus | Swiftly | Remix | Trapeze | Cittati |
|---|---|---|---|---|---|---|
| Real-time AVL + dispatch | 4 | 4 | **5** | 1 | 4 | 4 |
| Predictions ETA ML | 1 → 4 (Sprint 6) | 2 | **5** | 0 | 2 | 1 |
| Headway Insights | 2 → **5 (con HRR cross-op)** | 3 | 5 (single-op) | 0 | 3 | 0 |
| OTP Dashboard | 4 | 5 | 5 | 0 | 4 | 3 |
| GPS Playback | 2 → 4 (Sprint 2) | 3 | **5** | 0 | 3 | 2 |
| Bottleneck detection | 1 → 4 | 3 | **5** | 0 | 3 | 1 |
| GTFS-RT auto-publish | **5** | 5 (2026) | 5 | 1 | 4 | 2 |

## 4.3 Cross-Operador (DIFERENCIADOR ESTRUCTURAL ⭐)

| Función | SkillRoute | Optibus | Swiftly | Remix | Trapeze | Cittati |
|---|---|---|---|---|---|---|
| **DRO live cross-op (TCRP 195)** | **5** | **0** | **0** | **0** | **0** | **0** |
| **HRR live cross-op** | **5** (Sprint 2) | **0** | **0** | **0** | **0** | **0** |
| **Cobertura cross-op real-time** | **5** | **0** | **0** | **0** | **0** | **0** |
| **Penetración por corredor cross-op** | **5** | **0** | **0** | **0** | **0** | **0** |
| **Multi-tenancy nativa** | **5** | 1 | 1 | 1 | 1 | 1 |

## 4.4 Asset Management (EAM)

| Función | SkillRoute | Optibus | Swiftly | Remix | Trapeze | Cittati |
|---|---|---|---|---|---|---|
| Lifecycle / work orders | 1 → 4 (Sprint 9) | 2 | 0 | 0 | **5** | 3 |
| Predictive maintenance ML | 1 → 3 | 1 | 0 | 0 | 3 | 1 |
| Reliability reports | 2 → 4 | 2 | 0 | 0 | **5** | 2 |

## 4.5 Compliance + Regulatorio

| Función | SkillRoute | Optibus | Swiftly | Remix | Trapeze | Cittati |
|---|---|---|---|---|---|---|
| **Dossier regulatorio para autoridades** | 3 → **5** | **0** | **0** | **0** | 1 | **0** |
| **Análisis Equity Latam (Ley 18.331)** | 0 → **5** | **0** | **0** | 1 (US-only) | **0** | **0** |
| Compliance público (UITP/ISO/SOC) | 2 → 4 | 1 | 1 | 1 | 1 | 1 |

## 4.6 Comercial

| Función | SkillRoute | Optibus | Swiftly | Remix | Trapeze | Cittati |
|---|---|---|---|---|---|---|
| **Pricing público transparente** | **5** | 1 | 1 | 2 | 1 | 1 |
| **Onboarding rápido (2-4 semanas)** | **5** | 1 | 3 | 4 | 1 | 3 |
| **i18n español nativo** | **3** → 4 | 2 | 0 | 1 | 2 | 0 (portugués) |
| Modern UX cloud-native | **5** | 4 | 4 | 4 | 2 | 3 |

**Lectura:** SkillRoute hoy ~55, post-roadmap ~75-80. Los líderes
están en 50-58. Donde perdemos (planning visual, schedule
optimization, EAM profundidad, predictions ML) son cerrables con
roadmap concreto. Donde ganamos (cross-op, multi-tenancy, pricing,
onboarding, regulatorio Latam) son **estructurales** — los líderes
no pueden cerrar esos gaps sin rehacer su modelo de negocio.

---

# 5. Diferenciadores Estructurales Únicos

Los cinco diferenciadores que **ningún competidor mundial puede
ofrecer hoy** y que requerirían 2-3 años para que un competidor los
implemente (porque dependen de rehacer modelo de negocio, no de
escribir código).

## 5.1 DRO live cross-operador (TCRP 195)

Implementación en producción del estándar académico TCRP 195
(Directional Route Overlap), aplicado en tiempo real sobre los datos
combinados de los 4 operadores del sistema metropolitano. Detecta
cuándo un bus de operador A y un bus de operador B operan el mismo
corredor en la misma dirección con headway ineficiente.

**Implementación:**

- `frontend/src/pages/traffic/ShadowRadar.tsx` — UI operativa.
- `functions/src/droMatrix.ts` — motor de cálculo offline.
- `functions/src/shadowDispatcher.ts` — dispatch de alertas tácticas.

**Por qué los competidores no pueden replicarlo:** requiere datos
en tiempo real de **múltiples operadores simultáneamente**, lo que
ningún SaaS single-tenant tiene contractualmente.

## 5.2 HRR live cross-operador (Headway-to-Rival Ratio)

Métrica académica TCRP que ningún producto comercial implementa.
SkillRoute la calcula en tiempo real: por cada bus de un operador,
identifica el bus rival más próximo en la misma línea, calcula la
distancia haversine, convierte a tiempo, y compara con el headway
esperado del operador propio. Si HRR < 0.3, hay bunching cross-op
(bus rival pegado al propio = ineficiencia).

**Implementación:** `frontend/src/services/headwayInsightsService.ts`
+ `frontend/src/pages/traffic/HeadwayInsights.tsx` (Sprint 2, listo
sin deploy).

**Caso de uso comercial:**
> *"Mire línea 117 ahora. Bus suyo #859 a 204m de bus UCOT #54. HRR
> 0.13. Bunching cross-op detectado en tiempo real. Esta línea opera
> con 30% más buses de los necesarios entre los dos operadores."*

## 5.3 Cobertura cross-operador real-time

Score de cobertura por operador agregando 8 métricas operativas
(shapes_cross_operator, corridor_overlap, vehicle_events 24h,
personal, vehicles, cartones, turnos_dia hoy, alertas_regulacion 7d).

**Implementación:** `frontend/src/pages/admin/CrossOpCoverage.tsx`
en producción.

**Por qué es único:** ningún competidor tiene los datos para hacerlo.

## 5.4 Análisis de Penetración por Corredor

Snapshot diario de market share por (línea × operador), con
proyecciones de crecimiento y comparativa histórica.

**Implementación:** `functions/src/marketPenetration.ts` (cron
diario) + `frontend/src/pages/traffic/MarketPenetration.tsx`.

**Caso de uso comercial:** la IMM puede usar estos reportes para
auditar la eficiencia de la red y reorganizar corredores. Optibus
solo puede mostrar market share *dentro* de un operador.

## 5.5 Multi-tenancy nativa

Todos los módulos cross-op respetan la convención
`useEmpresaPropia` — un selector global del operador propio que
filtra todos los queries, todas las visualizaciones, todos los
endpoints. **29 módulos cross-operador implementados** sobre esta
abstracción.

**Implementación:** `frontend/src/hooks/useEmpresaPropia.ts` (99
líneas, núcleo del sistema).

**Por qué los competidores no pueden replicarlo:** todos sus
sistemas asumen un único cliente por deployment, con datos en silos
contractuales. Refactor masivo requerido.

---

# 6. Cumplimiento de Estándares Internacionales

Implementación verificada en código + documentación pública.

| Estándar | Estado | Evidencia |
|---|---|---|
| **GTFS-Static** | ✅ Producción | `functions/src/gtfsStatic.ts` |
| **GTFS-Realtime V2** (VehiclePositions + TripUpdates + Alerts) | ✅ Producción | `functions/src/gtfsRealtime.ts` con auto-publish 1 min (Sprint 1) |
| **TCRP 195** (DRO/Headway) | ✅ Producción + EXTENDIDO cross-op | ShadowRadar + droMatrix + HeadwayInsights |
| **NeTEx** (Europa) | ⚠️ Parcial | `functions/src/netexEndpoint.ts` |
| **SIRI v2** (Europa) | ⚠️ Parcial | `functions/src/siriRealtime.ts` |
| **UITP best practices** | ✅ KPIs canónicos | OTPDashboard, KPI snapshots, regulatorio cross-op |
| **Ley 18.331 Uruguay** | ✅ Parcial | Firestore RBAC + audit_log inmutable |
| **ISO 27001** | 🔴 Sprint 4 | Compliance statement público planificado |
| **WCAG 2.2 AA** | 🔴 Sprint 4 | Auditoría formal con Lighthouse + axe-core |
| **OpenAPI 3.0** | 🔴 Sprint 4 | Documentación pública de APIs internas |

**Compromiso del producto:** publicar **abiertamente** la auditoría
de cumplimiento. Los líderes mundiales mantienen sus certificaciones
bajo NDA. SkillRoute las publica para que cualquier consultora
externa pueda auditar — eso es un diferenciador comercial al cliente
regulado.

---

# 7. Validación Operativa de Día Completo

Documentación detallada en `docs/SIMULACION_DIA_OPERATIVO.md`.

Simulación de 9 franjas horarias del día tipo Hábil (03:00 → 03:00)
sobre los 4 operadores. Volumen estimado: 1.500 buses totales,
1.400-1.450 concurrentes en pico, 25-30K viajes/día,
100K-200K eventos GPS/día.

**Cobertura cross-op por franja:**

- 9 franjas con datos suficientes ✅
- Solo nocturno (<300 buses) tiene volumen bajo para análisis
  cross-op significativo (esperable, no bug).

**Stress points identificados:**

- Pico tarde 17:00-19:30 (~1.450 buses): 🟡 Bien cubierto, falta
  load testing formal — Sprint 4.
- Pico mañana 06:30-09:00: 🟡 Idem.
- Cron 03:00-04:30: 🟢 Verde, autopilot funcional.
- STM-Online inestable ocasional: 🟡 Mitigado con retry.

**Comparativa con líderes:** SkillRoute cubre las mismas franjas que
Optibus/Swiftly/Trapeze + cross-op único. Falta load test formal
documentado comparable al de LA Metro / SEPTA / MBTA — Sprint 4.

---

# 8. Gaps Cerrados con Evidencia (Sprints 1-2 ya en disco)

## 8.1 Sprint 1 — Quick wins comerciales (deployado)

| Entregable | Estado | URL pública |
|---|---|---|
| **Pricing público transparente** con 3 tiers | ✅ Producción | `https://ucot-gestor-cloud.web.app/pricing` |
| **Onboarding 2-4 semanas documentado** | ✅ Producción | `https://ucot-gestor-cloud.web.app/pricing/onboarding` |
| **GTFS-RT Service Alerts auto-publish** | ✅ Producción | Cron 1 min, 100 entidades reales en feed |
| **Compliance Reporting** (regulatorio cross-op) | ✅ Producción | `/regulatorio/export-cross-op` con auth ADMIN |

## 8.2 Sprint 2 — Real-time depth (listo, deploy condicional)

| Entregable | Estado |
|---|---|
| **HeadwayInsights** (Single-Op + HRR Cross-Op + Histórico) | ✅ En código, esperando deploy post-Sprint 1 |
| **GPS Playback** (timeline replay con Leaflet) | ✅ En código, esperando deploy post-Sprint 1 |

## 8.3 Catálogo de capacidades verificado

Inventario completo en `docs/CATALOGO_FUNCIONES.md`:

- 83 vistas React deployadas
- 32 Cloud Functions exportadas
- 44 colecciones Firestore
- 93 services frontend
- 20 hooks compartidos
- 4 operadores soportados nativamente

---

# 9. Roadmap Forward (6 meses)

Plan formal en `docs/ROADMAP_CIERRE_GAPS.md`. 12 sprints, 6 meses.

| Bloque | Sprints | Foco | Hito |
|---|---|---|---|
| Bloque 1 — Comercial | 1-2 | Quick wins | Pricing público + GTFS-RT auto + HeadwayInsights |
| Bloque 2 — Real-time depth | 3-4 | Cerrar gap vs Swiftly | Map Hub + Run Times + GPS Playback |
| Bloque 3 — Compliance | 5-6 | Cerrar gap UITP/ISO/WCAG | Compliance statement ISO 27001 + WCAG audit + OpenAPI |
| Bloque 4 — AI/ML predictions | 7-8 | Cerrar gap Swiftly ML | Predictions ETA modelo ML producción |
| Bloque 5 — Planning depth | 9-10 | Cerrar gap Remix | NetworkEditor + Equity Latam Engine |
| Bloque 6 — EAM + Dossier | 11-12 | Cerrar gap Trapeze + entregar dossier final | Schema EAM + GenAI Preferences + Dossier v2.0 |

**Resultado proyectado al cierre:** SkillRoute pasa de score actual
~55 a proyectado ~75-80 en la matriz comparativa, con 5
diferenciadores estructurales profundizados y dossier ejecutivo v2.0
con métricas operacionales reales firmado.

---

# 10. Riesgos Estratégicos y Mitigaciones

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| 1 | **Cittati llega a CUTCSA antes que SkillRoute** | Alta | Alto | Velocidad estratégica. Penetrar Uruguay con CUTCSA + IMM antes de exposición pública. |
| 2 | Optibus lanza "Optibus Lite" para Latam | Media | Alto | Construir moat cross-op rápido. Considerar patentes método DRO/HRR cross-op. |
| 3 | Falla de seguridad pública (data breach) | Baja-Media | **Crítico** | ISO 27001 compliance statement Sprint 4. Auditorías. Bug bounty. |
| 4 | Constellation Software intenta adquisición | Media (si crecemos) | Variable | Decisión M&A documentada en `docs/DECISION_M_A.md` (3 opciones). |
| 5 | CUTCSA o IMM construyen solución in-house | Baja-Media | Alto | Demostrar TCO real menor que in-house con números (USD 1.3-2.4M en 3 años in-house vs USD 150-600K SkillRoute Enterprise). |
| 6 | Cambios regulatorios STM/IMM | Media | Medio | Arquitectura modular cross-op se adapta sin refactor mayor. |
| 7 | GTFS-RT V3 cambia estándares | Baja | Medio | Implementación cerca de spec oficial. |

---

# 11. Conclusiones — Invitación a Auditar

SkillRoute tiene **un moat estructural defensible que ningún líder
mundial puede replicar sin rehacer su modelo de negocio**. Los gaps
identificados son cerrables con roadmap concreto y la mayoría son
quick-wins de bajo esfuerzo y alto impacto. El mercado regional
hispanoparlante está mayormente intacto, con Cittati como única
alarma estratégica.

La narrativa comercial es clara, defendible con evidencia objetivable,
y no requiere "inventar algo nuevo" — solo profundizar lo que ya
tenemos en producción y cerrar los 10 gaps prioritarios identificados.

## Invitación

Este dossier extiende **invitación abierta a cualquier consultora
internacional independiente** (Deloitte, McKinsey, BCG, KPMG, EY,
o consultoras técnicas especializadas en transit como TransitCenter,
Fehr & Peers, Steer) a auditar las afirmaciones aquí contenidas.

**Lo que se puede verificar en 30 minutos:**

1. URLs públicas operativas:
   - `https://ucot-gestor-cloud.web.app/pricing`
   - `https://ucot-gestor-cloud.web.app/pricing/onboarding`
   - `https://us-central1-ucot-gestor-cloud.cloudfunctions.net/regulatorio/health`
   - `https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsRealtime/service-alerts.json`

2. Repositorio git público (si autorizado):
   - 32 Cloud Functions en `functions/src/`
   - 83 vistas React en `frontend/src/pages/`
   - 5 dossiers competitivos en `docs/COMPETIDORES/`
   - Matriz comparativa en `docs/COMPETIDORES/MATRIZ_MAESTRA.xlsx`

3. Demo guiado por el fundador:
   - 60 minutos
   - Sin compromiso, sin SOW, sin lock-in
   - Cubrimos: cross-op live, regulatorio cross-op, compliance, roadmap

**Contacto:** jonathanlaluz@gmail.com

---

# 12. Anexos · Referencias

## 12.1 Documentos internos referenciados

- `docs/ESTRATEGIA_INTERNATIONAL_GRADE.md` — Norte estratégico vinculante
- `docs/COMPETIDORES/optibus.md` — Análisis Optibus (16 secciones)
- `docs/COMPETIDORES/swiftly.md` — Análisis Swiftly (16 secciones)
- `docs/COMPETIDORES/remix.md` — Análisis Remix (15 secciones)
- `docs/COMPETIDORES/trapeze.md` — Análisis Trapeze (15 secciones)
- `docs/COMPETIDORES/cittati.md` — Análisis Cittati (15 secciones, regional urgente)
- `docs/COMPETIDORES/MATRIZ_MAESTRA.xlsx` — 51 funciones × 5 plataformas, 95 fórmulas, 0 errores
- `docs/COMPETIDORES/HALLAZGOS_CONSOLIDADOS.md` — Síntesis ejecutiva
- `docs/CATALOGO_FUNCIONES.md` — Inventario verificado del producto
- `docs/SIMULACION_DIA_OPERATIVO.md` — Validación 9 franjas horarias
- `docs/ROADMAP_CIERRE_GAPS.md` — 12 sprints, 6 meses
- `docs/DECISION_M_A.md` — 3 opciones M&A para fundador
- `docs/SPRINT_01_PLAN.md`, `docs/SPRINT_02_DESIGN.md` — Sprints en ejecución

## 12.2 Estándares internacionales referenciados

- GTFS-Static + GTFS-Realtime V2 (Google)
- NeTEx CEN/EN16614 (Europa)
- SIRI CEN/TS 15531 v2 (Europa)
- TCRP Report 195 (TRB / FTA, USA — Bus timepoint, headway, DRO)
- TCRP Report 100 (TRB — BRT planning guide)
- UITP best practices (Unión Internacional de Transporte Público)
- ISO/IEC 25010 (software quality model)
- ISO/IEC 27001 (information security management)
- WCAG 2.2 nivel AA (W3C accesibilidad)
- Ley 18.331 Uruguay (protección datos personales)

## 12.3 Plataformas competitivas referenciadas

- [Optibus.com](https://optibus.com/)
- [Swiftly.com](https://www.goswift.ly/)
- [Remix by Via](https://ridewithvia.com/solutions/remix)
- [Trapeze Group](https://trapezegroup.com/)
- [Cittati Tecnologia](https://cittati.com.br/)
- [Modaxo (parent group)](https://modaxo.com/)
- [Constellation Software](https://www.csisoftware.com/) — TSX:CSU

## 12.4 Casos de uso públicos para benchmark

- LA Metro + Swiftly partnership
- BVG Berlín + Optibus
- DRPT Virginia + Remix
- MARTA Atlanta + Trapeze EAM (90.000 assets, 1.100 users desde 2006)
- WMATA + Trapeze (con críticas Inspector General)
- Cittati: J. Mendes corporate shuttling (2.000 empleados)

## 12.5 Versionado del dossier

- v1.0 (este documento) — 2026-04-25 — auditoría interna inicial
- v1.1 — post-Sprint 4 — ISO 27001 compliance statement publicado
- v1.5 — post-Sprint 6 — Predictions ETA en producción + métricas reales
- v2.0 — post-Sprint 12 — todos los gaps cerrados + evidencia operacional 6 meses

---

> Este dossier es la culminación de la **auditoría interna formal**
> definida en `docs/ESTRATEGIA_INTERNATIONAL_GRADE.md`. Capa 1 de 7
> capas completadas (catálogo). Capas 2-4 completadas (investigación
> competitiva, estándares, simulación). Capas 5-7 en progreso (matriz
> consolidada, roadmap priorizado, dossier ejecutivo). Cuando este
> dossier se acompañe de la verificación 100% en producción de los
> Sprints 1-12 según Regla §12, SkillRoute estará listo para
> presentarse formalmente a CUTCSA + IMM + STM con producto
> international-grade auditable.

**Fin del Dossier Ejecutivo v1.0.**
