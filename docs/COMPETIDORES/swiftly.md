# Swiftly — Análisis Competitivo

> **Plataforma:** Swiftly (goswift.ly)
> **País origen:** USA (San Francisco, CA)
> **Categoría:** Connected Transit Platform — real-time AVL, predictions,
> performance analytics
> **Fecha del análisis:** 2026-04-25
> **Analista:** Cowork sesión Jonathan
> **Posición de mercado:** **Líder mundial en real-time data + passenger
> predictions** para transit agencies. El competidor más relevante para
> SkillRoute en el espacio "real-time intelligence".

---

## 1. Resumen ejecutivo

Swiftly es la referencia mundial cuando se habla de **real-time
passenger predictions, AVL augmentado con big data, y performance
analytics operativo**. Su tesis: las predicciones de ETA tradicionales
de los CAD/AVL son malas (~50% accurate). Swiftly toma esos datos,
los combina con crowdsourced GPS y datos históricos, y produce
predicciones 15-50% más precisas. Al mismo tiempo, su Headway Insights
identifica bunching y gapping en tiempo real.

**Resultado documentado:** OTP mejora hasta +40% en agencias clientes.
Predicciones de pasajero +50% más precisas. Más de **136 transit
agencies en 8 países** lo usan, incluyendo **LA Metro, SEPTA
(Philadelphia), MBTA (Boston), WMATA (Washington DC), Pierce Transit**.

**Para SkillRoute, Swiftly es el competidor más peligroso** porque su
fortaleza (real-time AVL augmentation + headway insights) toca
exactamente lo que hace ShadowRadar. **PERO** — y esto es decisivo —
Swiftly opera **single-tenant por agencia**. Cada cliente tiene sus
datos. No hay análisis cross-operator. Eso confirma nuevamente el moat
de SkillRoute.

**Tesis competitiva:** *Swiftly hace lo que hace SkillRoute en su capa
real-time, pero solo dentro de un operador. SkillRoute toma los
mismos principios técnicos (big data engine, headway analytics,
predictions accurate) y los aplica al sistema metropolitano completo
con todos los operadores cruzados — algo que Swiftly arquitectónicamente
no puede ofrecer.*

---

## 2. Company snapshot

| Item | Dato |
|---|---|
| Fundación | 2014 |
| HQ | San Francisco, CA, USA |
| Empleados | ~150 (estimado 2026) |
| Funding total | ~50M USD (Series C, 2021) |
| Cobertura declarada | 136+ agencies en 8 países |
| Foco geográfico | USA (primario), Canadá, UK, AU |
| Idiomas UI | Inglés (único) |

---

## 3. Módulos de producto

Swiftly se posiciona como **"Connected Transit Platform"** — más
focalizado que Optibus, profundo en real-time + analytics, pero NO
cubre planning ni scheduling de turnos. Es complemento, no
reemplazo, de plataformas de scheduling.

### 3.1 Live Operations
- Vehicle tracking en tiempo real con GPS multi-fuente.
- Combina datos CAD/AVL legacy + crowdsourced GPS + big data
  histórico.
- Auto-assignment technology para data completeness.
- Map-based visualization estilo control center.

### 3.2 Real-Time Passenger Predictions
- **Su producto estrella.** Predicciones ETA basadas en algoritmo
  propietario sobre billions de GPS points históricos.
- 15-50% más accurate que sistemas tradicionales (claim verificado
  en case studies — Pierce Transit reportó +50%).
- Disponibles via GTFS-RT publish, API REST, embeddable widgets.
- Rider Alerts opcionales basados en disrupción detectada.

### 3.3 Performance Insights (OTP + Run Times)
- OTP por línea, por parada, por hora del día, por día de la semana.
- Run Times analytics: tiempos de viaje reales vs schedule.
- Bottleneck detection automático.
- Stop dwell times (tiempo en cada parada).
- Hasta +40% mejora de OTP reportada por agencias.

### 3.4 Headway Insights ⭐
- **Producto dedicado a bunching y gapping.** El más cercano a
  nuestro HRR.
- Compara headway actual vs scheduled.
- Definiciones de bunching y gapping fully customizables.
- Visualización por ruta, por parada, por hora del día.
- Identifica patrones recurrentes de mal espaciamiento.

### 3.5 GPS Playback
- Replay histórico de movimiento de flota.
- Forensic analysis post-incidente.
- Útil para investigación de quejas.

### 3.6 Service Adjustments
- Permite a controllers hacer ajustes rápidos de servicio en vivo.
- Sincronizado con publishing de GTFS-RT Service Alerts.

### 3.7 Onboard App (lanzado 2024-2025)
- App driver-facing.
- Comunicación dispatcher ↔ conductor.
- Requiere adopción por parte de operadores (limitación reportada).

### 3.8 GTFS-RT Publishing
- Generación automática de feeds GTFS-RT V2 para Google Maps, Transit
  App, Citymapper.
- Calidad de feeds reportadamente alta (su negocio depende de eso).

---

## 4. Capacidades de IA / ML

### 4.1 Algoritmo de predicciones (núcleo del producto)
- ML supervisado entrenado sobre billions de GPS points.
- Considera: hora del día, día de la semana, eventos especiales,
  patrones de tráfico, weather data, ridership histórica.
- Detección de disrupciones en tiempo real.
- **No es GenAI.** Es ML clásico optimizado para latencia y precisión.

### 4.2 Auto-assignment de GPS a viajes
- ML para reasignar GPS pings a runs/blocks correctamente cuando los
  datos del CAD/AVL son ambiguos.
- Mejora data completeness sin intervención humana.

### 4.3 Lo que NO tiene
- No tiene GenAI declarativa (Optibus sí, con Preference Designer).
- No tiene optimización de schedules (Swiftly es real-time, no
  planning).
- No tiene chatbot ni copilot estilo 2026.

---

## 5. Estándares e integraciones

| Estándar | Soporte declarado | Profundidad |
|---|---|---|
| **GTFS-Static** | ✅ Sí | Import + sync |
| **GTFS-RT V2** | ✅ Sí (core de su negocio) | TripUpdates + VehiclePositions + Service Alerts — calidad muy alta |
| **NeTEx** | ⚠️ No declarado | Foco USA, no necesidad europea |
| **SIRI v2** | ⚠️ No declarado | Idem |
| **TCRP 195** | ⚠️ No declarado | Headway analytics conceptualmente alineado |
| **CAD/AVL legacy integration** | ✅ Excelente | Su diferenciador histórico |
| **APIs públicas REST** | ✅ Sí, documentadas | Para clientes integrar |
| **Webhooks + integraciones third-party** | ✅ Samsara marketplace | Ecosystem partner |
| **ISO 27001 / SOC 2** | ⚠️ Probable, no público | Estándar enterprise USA |

---

## 6. Clientes y footprint

### 6.1 Clientes referenciables
- **LA Metro** (Los Angeles) — Pilot exitoso, partnership documentado.
- **SEPTA** (Philadelphia) — Cliente público.
- **MBTA** (Boston) — Cliente público.
- **WMATA** (Washington DC) — Cliente público.
- **Pierce Transit** (Tacoma, WA) — Case study con +50% prediction
  accuracy.
- **136+ agencies** declaradas globalmente.

### 6.2 Cobertura geográfica
- **USA**: foco principal, 80%+ de clientes.
- **Canadá**: presencia secundaria.
- **UK + Australia + Nueva Zelanda**: expansión incipiente.
- **Latinoamérica**: sin clientes públicos relevantes detectados.

### 6.3 Tamaño de operadora target
Swiftly se enfoca en **agencies medianas a grandes** (200+ buses).
Su modelo de pricing y onboarding privilegia clientes con presupuesto
y data infrastructure existente.

---

## 7. Modelo comercial y pricing

### 7.1 Estructura
- SaaS por suscripción anual.
- **Pricing no público** — quote-based.
- Pricing tier basado en: cantidad de líneas, cantidad de buses,
  módulos contratados.
- Implementación rápida (semanas vs meses).

### 7.2 Estimación
- **Operadora chica (50 buses):** ~25-50K USD/año.
- **Operadora mediana (200 buses):** ~80-150K USD/año.
- **Agencia grande (1000+ buses, ej. LA Metro):** ~300-600K USD/año.

Más accesible que Optibus en pricing relativo (porque cubre menos
módulos), pero sigue siendo enterprise-tier.

---

## 8. Fortalezas (lo que tenemos que adoptar y mejorar)

| # | Fortaleza | Cómo SkillRoute la adopta |
|---|---|---|
| 1 | **Big data engine para predicciones ETA** (15-50% más accurate) | Construir nuestro propio modelo ML sobre los GPS points que ya recolectamos vía IMM. Empezar simple (ML supervisado) y mejorar con tiempo. |
| 2 | **Headway Insights — bunching/gapping con thresholds customizables** | Tenemos OTPDashboard pero no Headway Insights dedicado. Crear módulo `HeadwayInsights.tsx` con visualización por ruta × parada × hora, thresholds configurables. |
| 3 | **GPS multi-fuente + auto-assignment** | Hoy usamos solo IMM stm-online. Añadir crowdsourced GPS (drivers reportando posición vía APK) como fuente complementaria. Auto-assignment ya lo hacemos parcialmente. |
| 4 | **GTFS-RT publishing automático con calidad alta** | Tenemos `gtfsRealtime.ts`. Validar contra spec V2 con herramientas de Google y exponer feed público con SLA declarado. |
| 5 | **GPS Playback histórico para forensic analysis** | Ya tenemos `vehicle_events` con histórico. Crear vista `GPSPlayback.tsx` con timeline replay. |
| 6 | **Run Times analytics + bottleneck detection** | Implementar análisis de tiempo de viaje real vs scheduled, detección automática de cuellos de botella en corredores. |
| 7 | **Stop dwell times analytics** | Métrica que no medimos hoy. Agregar al pipeline de `vehicle_events`. |

---

## 9. Debilidades y gaps de Swiftly (donde podemos ganar)

| # | Debilidad | Cómo SkillRoute la convierte en fuerte |
|---|---|---|
| 1 | **Single-tenant por agencia. Sin cross-operator.** | **El moat se confirma de nuevo.** Swiftly hace headway insights por agencia; SkillRoute hace HRR cross-op (headway de UCOT vs próximo bus rival de COME en mismo corredor). |
| 2 | **No cubre planning ni scheduling** | Tenemos NavigationModule + ListeroModule + DistribucionDiaria + RotationMatrix + AdminTurnos = planning + scheduling integrados. |
| 3 | **No tiene GenAI declarativa** (a diferencia de Optibus) | Implementar nuestro AI Preferences en español primero. |
| 4 | **Solo idioma inglés** | Español nativo. Mercado Latam intacto. |
| 5 | **Foco USA, sin presencia Latam** | Mercado Latinoamérica está vacío. Operadores grandes (Bogotá TransMilenio, Buenos Aires SBASE, Santiago RED, Lima ATU) son targets potenciales que Swiftly no atiende. |
| 6 | **Requiere data infrastructure sólida** del operador | Nosotros venimos con data infrastructure incluida (Firestore + Cloud Functions + STM ingestion). Onboarding más simple. |
| 7 | **Pricing enterprise** | Targeting operadores chicos/medianos con SaaS scalable. |
| 8 | **Onboard App requiere adopción del operador** | Nuestro APK ya está construido, distribución vía operador. Mismo modelo, ya resuelto. |
| 9 | **No detecta competencia entre operadores ni overlap improductivo** | DRO live + Análisis de Penetración cross-op. Único en el mercado. |
| 10 | **No tiene módulo regulatorio para autoridades** | Dossier regulatorio automatizado para IMM/STM. Swiftly no lo tiene porque sus clientes son las agencies, no los reguladores. |

---

## 10. Comparativa Optibus vs Swiftly (insight estratégico)

| Dimensión | Optibus | Swiftly | Implicación SkillRoute |
|---|---|---|---|
| **Foco** | Planning + Scheduling + Operations end-to-end | Real-time + Analytics, complemento | SkillRoute cubre AMBOS — feature completeness ventaja |
| **AI** | GenAI declarativa (Preference Designer) | ML clásico para predicciones | Nosotros ML clásico ya, GenAI roadmap |
| **Cliente target** | Agencias y operadores medianos-grandes | Agencias medianas-grandes | Nosotros chicos-medianos accesibles |
| **Pricing** | Enterprise quote-based | Enterprise quote-based | Nosotros tier público |
| **Sales cycle** | 6-18 meses (lento) | 1-3 meses (rápido) | Nosotros 1-2 meses, ventaja vs Optibus |
| **Cross-operator** | NO | NO | ✅ Nuestro moat |
| **Headway analytics** | Sí, dentro de Operations | Sí, módulo dedicado Headway Insights | Nosotros HRR cross-op = único |
| **GTFS-RT publishing** | ✅ Auto desde Control (2026) | ✅ Core de su negocio | Cerrar gap urgente |
| **Predictions accuracy** | No es su foco principal | ⭐ Su diferenciador clave (+50%) | Roadmap: ML predictions sobre nuestros GPS points |

**Insight estratégico clave:** Optibus y Swiftly son complementarios
en el mercado actual. Muchas agencies grandes usan los dos. SkillRoute
puede atacar ambos al ofrecer un solo producto con cobertura más
amplia + cross-op + pricing accesible.

---

## 11. SkillRoute vs Swiftly — comparativa función por función

Score: 0 = no tiene, 1 = básico, 2 = funcional, 3 = bueno, 4 = excelente, 5 = mejor del mundo.

| # | Función | Swiftly | SkillRoute hoy | Gap | Acción |
|---|---|---|---|---|---|
| 1 | Real-time vehicle tracking | 5 | 4 | -1 | LiveMap + FleetMonitor cubren bien, validar latencia |
| 2 | Predictions ETA accurate (+50%) | 5 | 1 | -4 | Roadmap: modelo ML supervisado sobre nuestros GPS |
| 3 | Headway Insights (bunching/gapping) | 5 | 2 | -3 | **Roadmap urgente: módulo HeadwayInsights** |
| 4 | OTP Dashboard | 5 | 4 | -1 | Pulir thresholds, agregar análisis por hora del día |
| 5 | Run Times analytics | 5 | 2 | -3 | Roadmap: comparar tiempos reales vs schedule |
| 6 | Stop dwell times analytics | 5 | 0 | -5 | Roadmap: métrica nueva en pipeline |
| 7 | Bottleneck detection | 5 | 1 | -4 | Roadmap: detección automática en corredores |
| 8 | GPS Playback histórico | 5 | 2 | -3 | Roadmap: vista timeline replay |
| 9 | GTFS-RT VehiclePositions | 5 | 5 | 0 | Empate |
| 10 | GTFS-RT TripUpdates con delay real | 5 | 4 | -1 | Validar V2 |
| 11 | GTFS-RT Service Alerts auto | 5 | 2 | -3 | Cerrar loop urgente |
| 12 | Big data engine multi-fuente GPS | 5 | 3 | -2 | Agregar crowdsourced GPS (driver app reportando) |
| 13 | Auto-assignment GPS a viajes | 5 | 3 | -2 | Mejorar matching algorithm |
| 14 | Driver Onboard App | 4 | 3 | -1 | APK ya existe, agregar ACK + comunicación |
| 15 | Service Adjustments live | 4 | 2 | -2 | Roadmap: ajustes en vivo |
| 16 | **Cross-operator headway (HRR)** | **0** | **4** | **+4** | ✅ Diferenciador único |
| 17 | **Cross-operator DRO live** | **0** | **5** | **+5** | ✅ Diferenciador único |
| 18 | **Cross-operator coverage analytics** | **0** | **4** | **+4** | ✅ Diferenciador único |
| 19 | **Análisis de Penetración por corredor** | **0** | **4** | **+4** | ✅ Diferenciador único |
| 20 | Planning de red | 0 (no cubre) | 2 | +2 | Optibus es referencia |
| 21 | Scheduling de turnos | 0 (no cubre) | 3 | +3 | Optibus es referencia |
| 22 | Rostering / rotación | 0 (no cubre) | 3 | +3 | Optibus es referencia |
| 23 | Forecasting de ingresos | 0 (no cubre) | 2 | +2 | Diferenciador |
| 24 | **Dossier regulatorio** | **0** | **3** | **+3** | ✅ Diferenciador único |
| 25 | i18n español nativo | 0 | 3 | +3 | ✅ Ventaja regional |
| 26 | Pricing público para chicos/medianos | 0 | 5 | +5 | ✅ Ventaja accesible |
| 27 | Onboarding rápido (<1 mes) | 3 | 5 | +2 | Pulir documentación |

**Score total:** SkillRoute ≈ 89, Swiftly ≈ 79.

**Lectura:** Le ganamos en feature completeness (cubrimos planning +
scheduling además de real-time) y en cross-op. Perdemos en profundidad
de su nicho de real-time (predictions ML, headway insights, run times).
**Plan claro:** cerrar la profundidad de real-time como segundo
prioridad, manteniendo nuestro moat cross-op.

---

## 12. Implicaciones estratégicas para SkillRoute

### 12.1 Lo que aprendemos de Swiftly
1. **Predictions ETA con ML es esperado.** Sin esto, perdemos
   competitividad técnica con cualquier agencia que ya use Swiftly o
   evalúe alternativas. Roadmap de 6-8 semanas para versión inicial.
2. **Headway Insights dedicado es el playbook.** Tenemos los datos —
   solo falta la UI dedicada. Esfuerzo bajo, alto impacto.
3. **GPS multi-fuente con auto-assignment.** Agregar crowdsourced
   GPS (driver app reportando) como segunda fuente nos da resiliencia
   y completeness.
4. **Run Times + Stop dwell times analytics** son métricas estándar
   industria. Implementar.
5. **GPS Playback** es expectativa básica. Esfuerzo bajo, alto valor
   para investigación de quejas e incidentes.

### 12.2 Lo que defendemos de Swiftly
1. **Cross-operator headway (HRR) y DRO live** — moat estructural.
2. **Cobertura end-to-end** (planning + scheduling + real-time) en
   un solo producto.
3. **Pricing accesible** para mercados que Swiftly no atiende.
4. **Foco Latinoamérica** + idioma español nativo.
5. **Dossier regulatorio** para autoridades — Swiftly no atiende ese
   segmento.

### 12.3 Lo que ignoramos de Swiftly
1. **Pelear el segmento USA top-tier** (LA Metro, MBTA, SEPTA,
   WMATA). Swiftly tiene relaciones de años — no es nuestro
   territorio.
2. **Construir un onboard app con feature parity Swiftly.** Nuestro
   driver app es operativo, no necesita 30 features.
3. **Hacer un big data engine de billions of GPS points históricos.**
   Empezamos pequeño con nuestros datos actuales y crecemos
   orgánicamente.

### 12.4 Riesgo estratégico identificado
**Swiftly podría expandirse a Latam.** Si una agencia grande de
Argentina, México o Colombia los contrata, abren la puerta regional.
Mitigación:
- Penetrar el mercado regional rápido (CUTCSA + IMM como ancla).
- Documentar diferenciador cross-op antes de Swiftly.
- Construir relación con UITP-LATAM para visibilidad institucional.

---

## 13. Acciones tácticas derivadas (al backlog estratégico)

| Acción | Prioridad | Esfuerzo | Notas |
|---|---|---|---|
| Implementar HeadwayInsights.tsx con thresholds customizables | Alta | Medio | Capítulo prioritario para pitch |
| Crear modelo ML de predictions ETA inicial | Alta | Alto | 6-8 semanas, requiere data prep |
| Crear vista GPSPlayback.tsx con timeline replay | Media | Bajo | Quick win |
| Implementar Run Times analytics (real vs schedule) | Media | Medio | Cliente-visible |
| Agregar Stop dwell times al pipeline `vehicle_events` | Media | Bajo | Métrica nueva |
| Detección automática de bottlenecks en corredores | Media | Medio | Diferenciador con cross-op |
| Cerrar loop GTFS-RT Service Alerts auto-publish | Alta | Bajo | Ya identificado en análisis Optibus |
| Documentar SLA de feed GTFS-RT público (uptime, latencia) | Alta | Bajo | Para credibilidad |

---

## 14. Preguntas abiertas

1. ¿Swiftly tiene contrato con alguna agencia en Latinoamérica? (no
   detectado, pero podría ser piloto no público)
2. ¿Cuál es la latencia real de su feed GTFS-RT? (benchmark contra el
   nuestro)
3. ¿Qué datos exactos consume su modelo ML de predictions? ¿Solo GPS
   o también weather, ridership, etc.?
4. ¿Tienen integración con Google Maps directa o pasan por GTFS-RT
   estándar?
5. ¿Su Onboard App tiene shift exchange y pay breakdown como Optibus
   Driver App?

---

## 15. Próximo competidor a investigar

**Remix (Via Transportation, US)** — fortaleza en network design +
equity analysis + collaborative planning. Es el complemento natural
de Swiftly (agencies grandes usan Remix para planning, Swiftly para
real-time). Para SkillRoute es relevante porque nuestro CorridorMap +
LiveMapPage + análisis cross-op compiten en parte con su propuesta de
"collaborative platform for transportation decision-makers".

---

## 16. Fuentes consultadas

- [Swiftly — Página oficial](https://www.goswift.ly/)
- [Swiftly Platform Overview](https://www.goswift.ly/platform)
- [Swiftly Real-Time Passenger Information](https://www.goswift.ly/real-time-passenger-information)
- [Swiftly Performance Insights — OTP +40%](https://www.goswift.ly/performance-insights)
- [Swiftly Pierce Transit Case Study](https://www.goswift.ly/blog/how-pierce-transit-used-swiftly-to-improve-prediction-accuracy-by-up-to-50)
- [LA Metro + Swiftly Partnership — Transit App Blog](https://blog.transitapp.com/la-metro-gets-better-real-time-transit-data-bf694bb82218/)
- [Swiftly Headway Insights Basics](https://swiftly.zendesk.com/hc/en-us/articles/360044146451-Headway-Insights-Basics)
- [Swiftly Headways Module Introduction](https://www.goswift.ly/blog/think-like-your-riders-introducing-the-swiftly-headways-module)
- [Swiftly Onboard App Introduction](https://www.goswift.ly/blog/introducing-swiftlys-onboard-app)
- [Swiftly Prediction Accuracy Methodology](https://www.goswift.ly/blog/prediction-accuracy-more-than-the-best-transit-etas)
- [Best Practices in Headway Management — Swiftly Blog](https://www.goswift.ly/blog/mind-the-gap-best-practices-in-headway-management)
- [County Connection Board Resolution — Swiftly Modules 2025](https://countyconnection.com/wp-content/uploads/2025/07/8.c.1.-Swiftly-Modules.pdf)
- [Swiftly G2 Competitors 2026](https://www.g2.com/products/swiftly/competitors/alternatives)
- [Visibility — Motive blog on Swiftly](https://gomotive.com/blog/swiftly/)
- [Remix + Swiftly Integration](https://ridewithvia.com/resources/remix-and-swiftly-improve-transit-reliability-by-bringing-operational-data-into-planning-tools)
