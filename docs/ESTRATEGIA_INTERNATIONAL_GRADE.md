# ESTRATEGIA SkillRoute — International-Grade desde Día Uno

> **Documento maestro estratégico — 2026-04-25**
>
> Norte para todas las decisiones de producto, ingeniería, comercial y de
> auditoría a partir de esta fecha. Cualquier propuesta nueva (feature,
> refactor, módulo, partnership) se evalúa primero contra este documento.
>
> **Vinculante.** Si una decisión contradice este norte, no se ejecuta.

---

## 1. Tesis del producto

SkillRoute **no es** un MVP, no es una demo, no es un prototipo, no es un
pilot. **Es un producto 100% funcional desde el día uno**, listo para
operar el sistema metropolitano completo de Montevideo (UCOT + CUTCSA +
COME + COETC + cualquier operador adicional) bajo estándares
internacionales — UITP, GTFS, NeTEx, SIRI, TCRP, ISO 25010, ISO 27001,
WCAG 2.2 AA, GDPR/LGPD/Ley 18.331.

Cuando llegue la mesa con CUTCSA, IMM o cualquier regulador, el mensaje
no es "tenemos un sistema interesante". El mensaje es: *"Acá está el
dossier. Cumple con estos N estándares internacionales con esta
evidencia. Supera a Optibus, Swiftly y Remix en estos M puntos
concretos. Auditen lo que quieran auditar."*

Eso no se construye con un MVP. Se construye con disciplina industrial.

## 2. Anti-patrones explícitamente prohibidos

A partir de hoy, ninguna feature nueva, refactor, ni decisión de producto
puede incurrir en lo siguiente:

- "Después lo arreglo" para algo que el usuario va a ver.
- "Esto es MVP, así queda" cuando un competidor comercial ya lo resuelve.
- Estado vacío sin mensaje explicativo y sin métrica de calidad de datos.
- Features sin métricas, sin badges, sin tooltips que expliquen el número.
- Copy-paste de prototipos directamente a producción.
- Strings de UI en inglés (excepto siglas estándar OTP, GPS, KPI, etc.).
- Hard-coded de UCOT donde debería ser variable cross-operador.
- Endpoints sin validación de input.
- Colecciones Firestore sin reglas RBAC.
- Módulos sin manejo de error real (auth faltante, data vacía, STM caído,
  cron fallido, colecciones vacías).

Si una propuesta entra en cualquiera de estas categorías, se rechaza o se
refina antes de mergear.

## 3. Metodología de auditoría interna (capa por capa)

### Capa 1 — Catálogo de estado actual

Inventario exhaustivo de lo que **ya existe** en SkillRoute:

- Cada vista del sidebar (~40), su URL, su rol, sus props.
- Cada Cloud Function (~35), su trigger, su frecuencia, su output.
- Cada colección Firestore (~50), su shape, su tamaño, su última
  actualización.
- Cada hook compartido, cada service, cada widget reusable.
- Cada test (Vitest, Playwright, Jest).

Output: `docs/CATALOGO_FUNCIONES.md` + matriz Excel exportable.

### Capa 2 — Investigación competitiva internacional

Para cada plataforma líder del mercado mundial de software de transporte
público, documentar (a) qué hace, (b) qué hace mejor que SkillRoute, (c)
qué hace peor o no hace, (d) precio aproximado, (e) clientes referenciables.

Plataformas a investigar (lista cerrada — no agregar sin justificar):

**Schedule + Optimization:**
- **Optibus** (Israel/UK) — planning, scheduling, optimization, GTFS-RT.
- **Trapeze ITS** (US/Canadá) — fleet management, scheduling, asset, ERP.
- **GIRO HASTUS** (Canadá) — schedule optimization (referente histórico).

**Real-time AVL + Predictions:**
- **Swiftly** (US) — real-time AVL, predictions, OTP, headway management.
- **Clever Devices** (US) — IntelliRide AVL.
- **INIT** (Alemania/US) — full-stack ITS, MOBILE-ITCS, COPILOT-PT.

**Network Design + Equity:**
- **Remix** (Via Transportation, US) — network design, equity analysis.
- **Optymo** (Francia) — fleet planning + simulation.

**Operational Analytics + MaaS:**
- **Hitachi Optimise** (UK/Japón) — MaaS, operational analytics.
- **Cubic / Umo** (US/UK) — payment + AVL + dispatch.
- **GMV** (España) — ticketing, fleet, AVL.

**Passenger-facing + Open Data:**
- **Moovit MaaS** (Israel — propiedad de Intel).
- **Citymapper** (UK — UX referencia).
- **Transit App** (Canadá).

**In-house operadoras de referencia (no comerciales pero benchmark):**
- **TfL iBus** (Transport for London) — referencia operacional gold-standard.
- **NYC MTA BusTime** — open-data + APIs públicas.
- **RATP Iris** (París) — automated train control + bus dispatch.

Output: `docs/COMPETIDORES.md` por cada plataforma + tabla resumen.

### Capa 3 — Estándares internacionales aplicables

Para cada estándar, documentar qué exige, cuál es nuestro estado actual,
y qué evidencia tenemos (o nos falta) para cumplir.

**Datos / Interoperabilidad:**
- **GTFS-Static** (Google) — feed de horarios y rutas estáticos.
- **GTFS-Realtime V2** (Google) — VehiclePositions, TripUpdates, Alerts.
- **NeTEx** (CEN/Europa) — exchange estructurado de datos de transporte.
- **SIRI v2** (CEN/Europa) — Service Interface for Real-time Information.
- **TCRP 195** (TRB/EE.UU.) — bus timepoint, headway, overlap measurement.
- **TCRP 100** (TRB/EE.UU.) — BRT planning guide.

**Calidad / Métricas:**
- **UITP best practices** — KPIs canónicos del operador internacional.
- **EN 13816** (Europa) — calidad de servicio en transporte público.

**Software Engineering:**
- **ISO/IEC 25010** — quality model (functional suitability, reliability,
  performance, usability, security, maintainability, portability,
  compatibility).
- **ISO/IEC 27001** — information security management.
- **SOC 2 Type II** — security/availability/confidentiality controls (US).

**Accesibilidad / Web:**
- **WCAG 2.2 nivel AA** — accesibilidad web.
- **W3C Web Performance API** — métricas de carga.
- **Core Web Vitals** (Google) — LCP, FID, CLS.

**Privacidad / Regulación:**
- **GDPR** (UE) — protección de datos personales.
- **LGPD** (Brasil) — equivalente brasileño.
- **Ley 18.331** (Uruguay) — protección de datos personales locales.
- **HIPAA** (US — solo si tocamos datos médicos de conductores).

Output: `docs/ESTANDARES.md` con matriz cumplimiento × evidencia × gap.

### Capa 4 — Simulación operativa de día completo

Simular un día tipo en producción sobre los 4 operadores:

| Hora | Evento | Módulo a verificar | Métrica esperada |
|---|---|---|---|
| 04:30 | Cron `refreshCompetidores` | functions/src/refreshCompetidores | `competidores` < 1 min lag |
| 04:45 | Cron `refreshHorariosUcot` | functions/src/refreshHorariosUcot | 140 líneas re-cargadas OK |
| 05:00 | Primer servicio sale | NavigationModule + ListeroModule | OTP=100% (es el primero) |
| 05:15-06:30 | Pico mañana se arma | OTPDashboard + MarketPenetration | `viajes_activos` > 200 |
| 06:30-09:00 | Pico mañana | Todos los módulos en uso real | KPIs vivos, sin lag |
| 09:00-12:00 | Valle mañana | ShadowRadar + HRR live | DRO matrix actualizada |
| 12:00 | Almuerzo conductores | RotationMatrix + AdminTurnos | Sin conflictos detectados |
| 12:00-17:00 | Valle / planning tarde | EconomicProjections + Forecasts | Pronóstico ingresos diario |
| 17:30-19:00 | Pico tarde | OTPDashboard + IncidentCommandCenter | Alertas si OTP cae <85% |
| 19:00-22:00 | Tarde-noche | FleetMonitor | Combustible y mantenimiento |
| 22:00-23:30 | Cierre y recogida | CartonManager + Boletin | Cierre de servicio |
| 00:00 | Cron diario MarketPenetration | marketPenetration.ts | Snapshot guardado |

Para cada hora:
1. Ejecutar el flujo en la app deployada.
2. Capturar pantalla y datos.
3. Anotar latencia, cumplimiento, errores en consola.
4. Comparar contra benchmark internacional ("¿Optibus haría esto mejor?
   ¿Swiftly mostraría más?").
5. Reportar en `docs/SIMULACION_DIA_OPERATIVO.md`.

### Capa 5 — Matriz comparativa cruzada

Excel `docs/MATRIZ_COMPARATIVA.xlsx` con:

- **Eje vertical (filas):** ~50 funciones canónicas del sistema
  (planning, scheduling, AVL, OTP, predictions, network design,
  market intelligence, MaaS, payment, accessibility, security…).
- **Eje horizontal (columnas):** SkillRoute + cada competidor (10+) +
  cada estándar internacional aplicable.
- **Cada celda:** score (0-5), evidencia (link/screenshot), fuente.

Esto produce visualmente:
- Filas verdes en SkillRoute: nuestras ventajas (a destacar en pitch).
- Filas rojas en SkillRoute: nuestros gaps (a cerrar antes de pitch).
- Filas verdes en competidores que SkillRoute tiene rojo: lo que tenemos
  que adoptar e implementar mejor.
- Filas rojas en TODOS los competidores: oportunidad de océano azul.

### Capa 6 — Roadmap de cierre de gaps

Output del análisis: cada gap con (a) prioridad, (b) esfuerzo, (c)
Definition of Done, (d) evidencia que demuestre cierre.

Sprints de 1-2 semanas. Cada sprint: cerrar 3-5 gaps + agregar 1-2
diferenciadores nuevos.

### Capa 7 — Dossier ejecutivo "SkillRoute vs the World"

PDF de calidad consultoría internacional (tipo McKinsey/Deloitte) con:

1. Tapa profesional + clasificación CONFIDENTIAL.
2. Resumen ejecutivo (1 página).
3. Tesis (1 página).
4. Panorama competitivo internacional (5 páginas).
5. Posicionamiento SkillRoute en cada eje (10 páginas).
6. Gaps cerrados con evidencia (5 páginas).
7. Diferenciadores únicos (5 páginas).
8. Cumplimiento de estándares (3 páginas).
9. Roadmap forward (2 páginas).
10. Conclusiones + invitación a auditar (1 página).
11. Anexos: matriz comparativa, screenshots, capturas Firestore,
    referencias bibliográficas.

Total: ~30-40 páginas. Es el documento que se le entrega a CUTCSA/IMM
sin necesidad de explicación adicional. Es el equivalente al "white
paper" que las consultoras facturan 40K USD.

## 4. Filosofía de diferenciación competitiva

Para cada plataforma competidora, aplicar tres preguntas:

1. **¿Qué hace mejor que nosotros?** → ADOPTAR Y MEJORAR.
   No copiar idéntico — copiar el principio y adaptarlo a nuestra realidad
   (uruguaya, multi-operador, recursos limitados, regulador presente). El
   resultado debe ser igual de bueno o mejor.

2. **¿Qué hace mal o no hace?** → CONVERTIR EN NUESTRO FUERTE.
   Si Optibus no hace análisis cross-operador en tiempo real (y no lo
   hace porque no tiene los datos de múltiples operadores en una misma
   ciudad), eso es nuestro océano azul. Nuestro ShadowRadar ya está ahí.
   Documentarlo como diferenciador y profundizarlo.

3. **¿Qué hace que es overkill para nuestro mercado?** → IGNORAR.
   No queremos ser Optibus. Queremos ser la mejor solución para el
   mercado latinoamericano, donde un operador chico necesita
   sofisticación pero no puede pagar 200K USD/año. Si Optibus tiene una
   feature que cuesta 50K en consultoría implementar, y nuestro mercado
   no la va a usar, ignorarla con conocimiento — saber que existe pero
   no implementarla.

El criterio de éxito no es "ser igual a Optibus". Es **ser la elección
racional** para una operadora que:
- Necesita OTP, AVL, scheduling, MaaS-readiness, market intelligence.
- No tiene 500K USD para un setup tradicional.
- Quiere datos cross-operador (cosa que ningún competidor le puede dar).
- Quiere cumplir estándares internacionales sin equipo dedicado.

## 5. Hipótesis de diferenciadores únicos confirmadas

Las siguientes capacidades de SkillRoute son únicas en el mercado o
implementadas por debajo de nuestro nivel por los competidores. Hay que
profundizarlas y documentarlas como pilares del pitch:

- **ShadowRadar DRO live cross-operador** — TCRP 195 implementado en
  tiempo real con datos de 4 operadores cruzados. Optibus no lo hace
  (no tiene los datos). Swiftly no lo hace (foco en operador único).
  Remix lo hace offline en planning, pero no en operación.
- **HRR live (Headway-to-Rival Ratio)** — métrica académica de TCRP que
  ningún competidor implementa en producto comercial.
- **Cobertura cross-op real-time** — nadie compara cumplimiento OTP de
  4 operadores simultáneamente sobre mismos corredores.
- **Análisis de penetración por corredor** — market share por línea ×
  agencia, snapshot diario. Optibus tiene algo similar pero solo
  para el operador propio.
- **Dossier regulatorio automatizado** — output preparado para autoridad
  reguladora (IMM/STM) con un click. Ningún competidor lo automatiza.
- **Multi-tenancy de operador en una sola plataforma** — la mayoría de
  los competidores son single-tenant; nosotros nacimos cross-op.

## 6. Hipótesis de gaps a cerrar (preliminar — confirmar con benchmark)

Lista preliminar; el benchmark formal va a refinarla:

**Schedule optimization automatizado**
   Optibus genera schedules ML-optimizados (turnos + rotaciones). Nosotros
   tenemos Admin de turnos pero el algoritmo no es ML.

**Predictive maintenance**
   Plataformas tipo Trapeze/INIT predicen falla mecánica con 2-3 semanas
   de anticipación. Nosotros tenemos MaintenanceDashboard reactivo.

**APIs públicas REST + GraphQL versionadas**
   Tenemos endpoints internos. Falta documentación OpenAPI/Swagger
   pública con SDK generado.

**Passenger-facing app pública**
   No tenemos app de pasajero. Moovit/Citymapper sí. Quizás esto se
   resuelve integrándose con ellos en lugar de competir.

**Pagamento integrado (account-based ticketing)**
   Cubic/GMV son fuertes acá. Nosotros no tocamos pagamento.

**Accesibilidad WCAG AA verificada**
   No tenemos auditoría formal. Hay que pasar Lighthouse + axe + lectores
   de pantalla.

**ISO 27001 + SOC 2**
   No tenemos certificación. Hay que decidir si la perseguimos
   formalmente (~80K USD) o producimos un "compliance statement" interno
   robusto.

**Internacionalización i18n**
   Hoy todo en español. Si queremos vender afuera de Uruguay, falta i18n
   para portugués, inglés, francés.

## 7. Indicadores de éxito de la estrategia

A los **3 meses** (julio 2026), la auditoría interna completa debe
arrojar:

- ✅ Catálogo de funciones cerrado y publicado.
- ✅ 10+ competidores investigados y documentados.
- ✅ Matriz comparativa con 50 funciones × 11 plataformas.
- ✅ Simulación operativa de día completo ejecutada y documentada.
- ✅ Top 10 gaps identificados con plan de cierre.
- ✅ Top 10 diferenciadores documentados.
- ✅ Dossier ejecutivo PDF v1.0 publicado.
- ✅ 30+ % de los gaps prioritarios cerrados.

Solo cuando ese checklist esté en 100%, se inicia el proceso comercial
con CUTCSA/IMM.

## 8. Reglas de gobernanza del documento

- **Este archivo es vinculante.** Cualquier cambio se discute con
  Jonathan antes de mergear.
- **Cualquier nueva feature** se evalúa primero contra esta estrategia.
  Si no encaja, no se implementa hasta que la estrategia se actualice.
- **Cada sesión de trabajo** debe abrir refiriéndose a este documento y
  cerrar verificando que lo hecho avanza alguno de los 9 hitos del
  TodoList (#77 a #85).
- **Tasks completadas** deben adjuntar evidencia (link a archivo, captura,
  commit hash).

---

> Este documento existe porque el mercado de software de transporte
> público no necesita un MVP más. Necesita una alternativa real a
> Optibus/Swiftly/Remix que sea adaptable, cross-operador, internacional
> en estándares y económicamente accesible para los mercados que esos
> tres ignoran. SkillRoute es esa alternativa, o no es nada.
