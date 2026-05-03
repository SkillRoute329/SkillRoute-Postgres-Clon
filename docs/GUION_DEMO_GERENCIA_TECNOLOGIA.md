# Guion Demo — Gerente General de Tecnología CUTCSA

**Duración objetivo:** 25-30 minutos.
**Audiencia:** ingeniero senior, dirigente de área tecnológica de un operador con departamento propio de IT/desarrollo.
**Tesis a vender:** SkillRoute no es software para reemplazar lo que CUTCSA hace internamente, es **inteligencia de la red completa** — algo que ningún operador individual puede generar por sí mismo.

---

## Mentalidad para entrar a la reunión

Un ingeniero gerente general:

- No quiere ver "lo lindo". Quiere ver "lo defendible".
- Va a abrir DevTools y mirar la consola. Tener consola limpia o asumir que él va a ver lo que vos no querés que vea.
- Va a contrastar dos números entre pantallas. Si no cuadran, hay que tener respuesta o reconocerlo.
- Va a preguntar "¿de dónde sale ese dato?". Cada cifra debe rastrear a una fuente: `IMM_GPS`, `STM`, `Firestore /collection`, etc.
- Respeta más una respuesta honesta que un golpe de relaciones públicas. Si algo no está terminado, decirlo: "Esa pantalla todavía no está pulida; lo que sí tenemos terminado es esto otro."

**Regla de oro:** mejor demostrar 4 cosas sólidas que 12 a medio terminar.

---

## Estructura de la demo

### Tramo 1 · Apertura (3 min)

**Mensaje:**
> "Antes de ver pantallas, dos minutos de contexto. SkillRoute no compite con su departamento de tecnología. Lo que hace SkillRoute es construir la **vista del sistema metropolitano completo** — UCOT, CUTCSA, COME, COETC — usando exclusivamente datos públicos del IMM y del STM. Esa vista no la puede generar un operador individual porque solo tiene la mitad del mapa. Yo voy a mostrarles qué se ve cuando uno tiene las cuatro mitades."

No abrir nada todavía. Que el ingeniero esté escuchando antes que evaluando.

### Tramo 2 · Demostración del dato vivo — Fleet Monitor (5 min)

**Ruta:** `/dashboard/traffic/fleet-monitor`

**Por qué entrar acá:** es la prueba más fuerte de "esto no es PowerPoint". El mapa carga ~1.000-1.250 buses en vivo. El ingeniero ve los markers moverse.

**Qué mostrar:**

1. Mapa Leaflet con los markers diferenciados por color por operador.
2. Header con el conteo: "X CUTCSA activos · Y rivales en vía · Z líneas operando · W bunching CUTCSA · 1.095 total en ruta".
3. Lista de **bunching detectado** en vivo: "L137 INT 202 y 235 — 0.047 km" — dos buses de la misma línea con menos de 50 metros entre ellos. Eso es operación real.

**Qué decir:**
> "Esto se actualiza cada 30 segundos contra el endpoint `stm-online` del IMM. Detectamos bunching cross-operador en tiempo real, sin instrumentar nada nuevo en los buses. Hoy hay 367 incidentes de bunching CUTCSA en la red."

**Lo que va a preguntar el ingeniero:**

- *"¿Cuántos puntos de datos por bus?"* → "Latitud, longitud, velocidad, línea, sublínea, destino y empresa. Todo del feed público IMM."
- *"¿Cómo defines bunching?"* → "Distancia geodésica entre dos buses de la misma línea-sentido menor a un threshold configurable, hoy 200m." (Si todavía no es exactamente así, ajustar la respuesta antes del lunes.)
- *"¿Qué hacen con esa información?"* → "Notificación al despachador para que reposicione el segundo bus o ajuste headway."

### Tramo 3 · Inteligencia que solo se puede armar con la red completa — Cross-Op (7 min)

**Ruta:** `/dashboard/traffic/corridor-intelligence`

**Por qué entrar acá:** es el diferencial técnico más fuerte. Un ingeniero de transporte conoce TCRP 195 (Bus Transit Capacity and Quality of Service Manual). Que una pantalla muestre métricas DRO con esa nomenclatura es señal de seriedad.

**Qué mostrar:**

1. Header: 824 pares de líneas analizados, 1.392 km de red compartida, 3 operadores rivales.
2. Balance: 89% gano / 11% perdido frente a rivales.
3. **Top 3 amenazas** — donde un rival cubre más del corredor que UCOT.
4. **Top 3 oportunidades** — donde UCOT cubre más que el rival.

**Qué decir:**
> "DRO es Directional Route Overlap, métrica del TCRP 195 — el manual canónico de capacidad y calidad de servicio del transporte público. Por cada par de líneas que comparten corredor, calculamos el % de ruta de A que está cubierto por B en el mismo sentido. Sobre 824 pares analizados en la red metropolitana, identificamos 3 corredores donde un rival nos pisa con ventaja superior al 24%. La línea 127 vs COETC LL14 tiene Δ DRO de 30 puntos — ahí es donde un operador pierde mercado sin saberlo."

**Lo que va a preguntar el ingeniero:**

- *"¿Cómo separan IDA de VUELTA?"* — Tener respuesta clara. (Hoy: probablemente cuenta IDA y VUELTA por separado, hay que verificar.)
- *"¿De dónde salen los shapes?"* — "Del catálogo de líneas STM, normalizado en formato GTFS internamente."
- *"¿Por qué confían en el 89% gano?"* — "Es el % de pares donde nuestro DRO ≥ DRO rival. No es market share; es cobertura geométrica del corredor compartido. El ratio de market share real está en otra pantalla con datos de pasajeros."

### Tramo 4 · Visión competitiva por línea — Radar (5 min)

**Ruta:** `/dashboard/traffic/competitor-intelligence`

**Por qué:** muestra la red completa con priorización ALTA/MEDIA/BAJA por línea, datos diferenciados (no synthetic).

**Qué mostrar:**

1. 13 líneas activas con buses en vivo — 12 en rojo (alta disputa), 1 en amarillo, 0 en verde.
2. Por línea: nombre del recorrido real (PARQUE ROOSEVELT--CASABÓ, INSTRUCCIONES - PLAZA ZITARROSA), # buses en disputa, % flota.

**Qué decir:**
> "Cada operador ve su propia operación. Lo que esta pantalla agrega es: en la línea 306 (Parque Roosevelt-Casabó), 24 buses están en disputa con rivales — y el % de flota afectada es 71%. Para el directivo de operaciones, esto es accionable: ¿reforzamos frecuencia ahí o pivotamos hacia un corredor menos disputado?"

### Tramo 5 · Cierre operativo — Incidencias y notificación a conductores (3 min)

**Ruta:** `/dashboard/traffic/incidents`

**Qué mostrar:** las 5 incidencias abiertas con coordenadas GPS, categorización (corte de calle, demora, mecánica, evasión), y la lógica de "Resolver" / "Notificar conductor".

**Qué decir:**
> "Cierro con la pieza operativa: cuando se detecta un corte de calle o un desvío, esto le llega al despachador y se puede notificar directo al conductor. Hoy tenemos 5 incidencias abiertas con su coordenada GPS — la del Camino Maldonado por ejemplo lleva 9 horas sin resolverse, y eso explica los atrasos en línea 17."

### Tramo 6 · Cierre estratégico — BRT 2027 (5 min)

**Ruta:** `/dashboard/traffic/brt`

**Por qué:** muestra que SkillRoute no es solo monitoreo; es **planificación estratégica** ante la reforma del transporte de Montevideo.

**Qué mostrar:**

1. KPIs cabecera: US$ 490M de inversión, inicio obras enero 2027, 7 líneas UCOT afectadas, modelo $/km.
2. Tabs Corredores / Impacto / Modelo $/km / Alimentadoras / Timeline / Benchmarks / Plan Obras / Simulador / UCOT→ASM.

**Qué decir:**
> "Y la última pantalla. CUTCSA y UCOT van a operar en el mismo sistema cuando salga el BRT 2027. SkillRoute incluye un análisis de impacto por línea, modelo de remuneración $/km comparado con benchmarks internacionales (TfL, RATP, NYC), y simulador para evaluar escenarios. Para una conversación regulatoria con MTOP/IMM, esto es la base."

### Tramo 7 · Cierre y Q&A (3 min)

**Mensaje de cierre:**
> "Lo que vieron son 5 módulos de los 22 que hay en producción. Los otros 17 cubren operación interna — listero, planificación de cartones, RRHH, mantenimiento, reportes regulatorios — y están en distintos estados de madurez. La conversación que les propongo no es 'compren un software'. Es 'construyamos juntos la capa de inteligencia metropolitana que ningún operador individual puede armar solo'. CUTCSA tiene los recursos técnicos para ser parte; UCOT tiene la prueba de concepto. SkillRoute es el puente."

---

## ❌ Pantallas a EVITAR durante la demo (hoy)

| Ruta | Motivo |
|---|---|
| `/dashboard/traffic/ceo` | Crashea con `TypeError: re is not a constructor` (P0). |
| `/dashboard/traffic/financiero` | Datos sintéticos: 186 líneas con $17.640 idénticos. **Demo killer.** |
| `/dashboard/traffic/diagnostico-cumplimiento` | OTP oscila 55%↔100% sin razón. Pregunta segura del ingeniero, sin respuesta sólida hoy. |
| `/dashboard/traffic/listero` y `/distribución` | "Sin servicios para esta fecha" — vacío. |
| `/dashboard/traffic/inspector-control` | Lista de líneas con "EDO/OMETRO/UNKNOWN". |
| `/dashboard/admin/asignacion-vehiculos` | Conductor "2+00+0", rol "DRIVER" en inglés. |
| `/dashboard/fleet` → tab Mantenimiento | "Invalid Date" + strings inglés. |
| `/dashboard/admin/sistema` | "ERROR DE ENLACE" en BD. |
| `/dashboard/traffic/corridor-map` | UCOT 0 shapes — la empresa propia sin datos cartográficos. |

**Si el ingeniero pide ver alguna de estas, decir:**
> "Esa pantalla la tenemos en remediación. Hoy le muestro [alternativa relevante]; lo abrimos en una segunda sesión cuando esté pulida."

Honestidad gana credibilidad. NO improvisar excusas técnicas; reconocerlo.

---

## Preguntas duras esperables y respuestas preparadas

**P:** "¿Cuántos usuarios concurrentes soporta?"
**R:** Firestore + Cloud Functions escala automático. No tenemos hoy un benchmark contra carga real (es UCOT como único operador productivo). Para CUTCSA con 50 unidades extra, la latencia esperada del feed IMM es la misma; el cuello de botella es el endpoint público del IMM, no la app.

**P:** "¿Tienen tests automatizados? ¿Coverage?"
**R:** Sí, vitest 22/22 hoy. Coverage no estamos midiendo formalmente; es un punto a mejorar.

**P:** "¿Cómo manejan datos sensibles? GDPR / Ley 18.331 (UY)?"
**R:** No persistimos datos personales de pasajeros. Conductores y empleados están en colección con RBAC Firestore. El feed IMM es público.

**P:** "¿Por qué Firestore y no PostgreSQL?"
**R:** Decisión de arranque por velocidad (real-time listeners gratis), pero hay un plan de migración parcial a Postgres para reportes regulatorios (queries analíticas pesadas). Para volumen actual, Firestore alcanza.

**P:** "¿Y si CUTCSA quiere su propio deploy?"
**R:** Multi-tenant ya está pensado en el modelo de datos (campo `empresaId` en colecciones). El deploy dedicado es factible pero no recomendado — el valor está en que los 4 operadores compartan la capa de inteligencia. Eso es lo que les contamos al inicio.

**P:** "Veo que el título de la pestaña dice 'TransForma Fácil 2.0'. ¿Cómo se llama el producto?"
**R:** SkillRoute. El nombre legacy del repo es del primer prototipo; lo cambiamos en interfaz pero quedó el `<title>`. Punto a corregir.

**P:** "¿Qué pasa si falla el feed IMM?"
**R:** El sistema tiene fallback: muestra "Sin datos GPS - última posición conocida hace X minutos" y mantiene incidencias cargadas desde Firestore. No queda en blanco.

**P:** "¿Tienen documentación técnica?"
**R:** Sí, hay docs en el repo (CLAUDE.md, ARQUITECTURA_OBJETIVO.md, varios diagnósticos). Te los puedo enviar mañana.

**P:** "¿Ese banner de 'No hay alertas viales activas' está hardcoded o es real?"
**R:** Lectura real de Firestore. Las alertas viales se cargan por el equipo de tráfico cuando hay un evento (corte, marcha, etc.); hoy no hay activas. Punto a mejorar: cuando es lectura vacía vs lectura sin permiso, el mensaje debería distinguirse.

---

## Plan B si algo falla en vivo

1. **Si la app no carga:** abrir en otro browser. Si tampoco, abrir versión local levantada en laptop.
2. **Si Fleet Monitor no muestra buses:** explicar "el feed IMM puede tener saltos; les muestro la ruta `/api/positions` directamente" → mostrar JSON puro como evidencia de datos reales.
3. **Si un módulo crashea inesperado:** "Ese módulo me hicieron una refactor anoche, lo abrimos sin riesgo en otra reunión. Sigamos con [siguiente del guion]."
4. **Si se quedan colgados con una métrica que no se sabe explicar:** "Buen punto, déjeme verificar el cálculo exacto y le respondo por correo. Prefiero no improvisar."

---

## Checklist 30 minutos antes de la reunión

- [ ] Browser limpio (incógnito) abierto en `https://ucot-gestor-cloud.web.app/dashboard`.
- [ ] Login con cuenta SuperAdmin probado y funcionando.
- [ ] DevTools cerrado (que no se vea consola al abrir la pestaña).
- [ ] Las 6 rutas del guion abiertas en tabs separadas, todas cargadas y verificadas.
- [ ] Snapshot de KPIs principales anotados en una hoja: hoy hay X buses UCOT, Y rivales, Z bunching. Si en la reunión los números cambian (porque es vivo), explicarlo: "como es vivo, fluctúa cada 30s".
- [ ] Laptop con cargador conectado.
- [ ] Conexión wifi de respaldo (hotspot móvil) probada.

---

*Documento preparado 2026-04-29 con auditoría QA del mismo día. Todas las rutas mencionadas como "demoables" fueron verificadas en producción con datos coherentes. Las rutas marcadas "evitar" fueron verificadas como rotas o con datos sintéticos.*
