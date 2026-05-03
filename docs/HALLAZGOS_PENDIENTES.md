# Hallazgos pendientes del informe de auditoría

**Fecha:** 2026-04-23
**Referencia:** `Auditoria_Inteligencia_Operativa_2026-04-23.docx` — secciones 4 (críticos), 5 (importantes), 6 (validación matemática), 7 (UX), 8 (brechas internacionales).

Este documento lista **lo que todavía no se resolvió** del informe original. Los ítems marcados ✅ en el changelog ya están cerrados. Acá están solo los que siguen abiertos.

---

## 1. Cerrados en sesiones anteriores (para referencia)

De los 6 hallazgos **críticos** del informe:

| Ítem | Hallazgo | Estado |
|---|---|---|
| 4.1 | Tarifa STM inconsistente 45 vs 56 | ✅ Fix #2 |
| 4.2 | Radio competencia 300m vs 2km | ✅ Fix #1 |
| 4.3 | ShadowRadar con datos estáticos | ✅ Fix #7 |
| 4.4 | Socket.io huérfano | ✅ Fix #4 |
| 4.5 | EconomicProjections con cascada ficticia | 🟡 PARCIAL — parametros-operativos creado; callers aún usan defaults locales |
| 4.6 | Heatmap mock + Math.random puro | ✅ Fase 1 #2 |

De los 10 hallazgos **importantes**:

| Ítem | Hallazgo | Estado |
|---|---|---|
| 5.1 | Delegar Inspector fachada | ✅ Fix #6 |
| 5.2 | CompetitorIntelligence sin fallback | ✅ Fix #5 |
| 5.3 | OTP simétrico ±3 | ✅ Fase 1 #1 |
| 5.6 | 3 colecciones de cartones | ✅ Analizado (ver ANALISIS_CARTONES.md) |

**Total cerrado:** 10 ítems (6 críticos + 4 importantes).

---

## 2. Hallazgos AÚN PENDIENTES

### 🔴 CRÍTICO parcial

#### 2.1 EconomicProjections sigue leyendo constantes locales, no parámetros dinámicos

**Referencia:** Sección 4.5 del informe.
**Archivo:** `frontend/src/pages/traffic/EconomicProjectionsPage.tsx`

**Qué quedó:** Las constantes se centralizaron en `parametros-operativos.ts` y hay UI Super Admin para editarlas, pero los cálculos siguen importando **el valor estático al load-time**. Si un Super Admin edita la tarifa desde UI, las proyecciones NO reflejan el cambio hasta rebuild.

**Solución (1-2 h):** migrar los callers de imports estáticos a `getParametroValor('TARIFA_STM')` del servicio dinámico (`services/firestore/parametrosOperativos.ts`). El patrón ya está listo, solo falta aplicarlo página por página.

**Prioridad:** ALTA post-deploy. Bloquea el valor completo de la UI de Super Admin.

---

### 🟡 IMPORTANTES

#### 2.2 IVA no considerado en proyecciones

**Referencia:** Sección 5.4.
**Archivo:** `frontend/src/pages/traffic/EconomicProjectionsPage.tsx` + `backend/src/services/forecastService.ts`.

**Problema:** Los ingresos proyectados son brutos. Uruguay aplica IVA 22 % a ciertos servicios de transporte. Si el usuario interpreta los números como netos, sobreestima margen.

**Solución (2-3 h):**
1. Agregar parámetro `IVA_TRANSPORTE` (valor 0 o 0.22 según régimen que aplique a UCOT) a `parametros-operativos.ts` con fuente DGI.
2. En `calcularLinea()`, restar `ingresos * IVA_TRANSPORTE` antes de calcular margen.
3. En UI, mostrar ingresos "brutos" y "netos" separados.

**Prioridad:** ALTA — afecta honestidad de números frente a CUTCSA.

#### 2.3 Cruce de medianoche no validado

**Referencia:** Sección 5.5 + 6.5.
**Archivo:** `backend/src/services/scheduleComplianceEngine.ts:127`.

**Problema:** El motor usa `nowMin = hours*60 + minutes` y filtra `nowMin >= dep && nowMin <= arr`. Un viaje 23:00 → 01:30 se divide en dos rangos y el código no lo detecta. Servicios nocturnos quedan sin validar.

**Solución (1-2 h):** detectar cuando `arr < dep` (cruza medianoche) y convertir a ventana 0-24*2=48h sumando 24h al `arr`. Ajustar también la hora actual cuando es antes de 04:00 para permitir match con viaje de la noche anterior.

**Prioridad:** MEDIA — afecta solo líneas nocturnas (CE1 expreso, algunas metropolitanas).

#### 2.4 CEO Dashboard con sparklines hardcoded

**Referencia:** Sección 5.7.
**Archivo:** `frontend/src/pages/traffic/CEODashboard.tsx:225-228`.

**Problema:** `[85, 87, 82, 88, 90, 86, 89]` y `[92, 88, 91, 85, 89, 93, 90]` son valores de arranque inventados que se reemplazan en runtime. Durante el primer render el usuario ve datos falsos.

**Solución (30 min):** inicializar con array vacío y mostrar skeleton loader hasta que llegue el fetch real.

**Prioridad:** MEDIA — es cosmético pero visible en demos.

#### 2.5 Sin tests automatizados

**Referencia:** Sección 5.8.
**Problema:** No existen `.test.ts` ni `.spec.ts` ni directorio `__tests__/` en todo el repositorio. Coverage = 0 %.

**Solución (4-6 h para suite mínima):**
1. Instalar Vitest en frontend y backend.
2. Tests unitarios para las fórmulas económicas (`calcularLinea`, penalización flota).
3. Tests unitarios para haversine, bearing, OTP asimétrico, EWT.
4. Test de snapshot para el feed GTFS-RT.
5. Configurar CI para correr tests en cada PR.

**Prioridad:** ALTA como inversión — evita regresiones futuras. Pero no bloquea CUTCSA.

#### 2.6 Factores de riesgo competitivo hardcoded 0.25 / 380

**Referencia:** Sección 5.9 + 6.4.
**Archivo:** `backend/src/services/competitionService.ts:332-336`.

**Problema:**
```
pasajerosPromedioDiarios = 380    // número mágico
factorCompetencia = 0.25          // "cuarto del pasaje en zona compartida"
```
Sin referencia a literatura ni calibración con datos reales.

**Solución (1 h):**
1. Mover `PASAJEROS_PROMEDIO_LINEA = 380` a `parametros-operativos.ts` con fuente estimación UCOT + disclaimer.
2. Mover `FACTOR_ZONA_COMPARTIDA = 0.25` a parámetros con fuente Balcombe et al. (elasticidad cruzada 0.2-0.3).
3. Documentar el `temporal_risk_factor` (1.0/0.6/0.3/0.1) con justificación o degradación exponencial fórmula e^(-dt).

**Prioridad:** MEDIA — afecta credibilidad del módulo de competencia en auditoría técnica.

#### 2.7 Accesibilidad mínima — cero aria-labels

**Referencia:** Sección 5.10 + 7.
**Problema:** Cero aria-labels en botones e inputs, cero tab-indexes explícitos, textos muy pequeños (text-xs) en widgets operativos. Bloquea WCAG 2.1 AA (requisito en procurement público EU/UK).

**Solución (4-6 h como sprint dedicado):**
1. Sweep de todas las pages/components y agregar `aria-label` a botones sin texto.
2. Tab-index explícito en formularios complejos (InspectorCapture, CartonManager).
3. Subir tamaño mínimo de fuente a text-sm en widgets críticos.
4. Contraste mínimo WCAG AA en paleta actual.

**Prioridad:** BAJA para UCOT pero ALTA si se quiere vender en EU.

#### 2.8 Inspecciones sin geolocalización

**Referencia:** (Detectado durante análisis heatmap).
**Problema:** El schema de `inspecciones` guarda `controlPointId` pero no `lat`/`lng`. Eso hace que cualquier análisis geoespacial de inspecciones tenga que cruzar con la tabla de controlPoints (que tampoco tiene schema claro).

**Solución (2-3 h):**
1. En `InspectorCapture.tsx`, cuando se crea la inspección, capturar `geolocation.getCurrentPosition()` del dispositivo móvil y guardar `posicion: GeoPoint(lat, lng)` en el documento.
2. Para inspecciones históricas sin posición, dejar `posicion: null` y mostrar "sin geo" en reportes.

**Prioridad:** MEDIA — habilitaría heatmap de inspecciones (además del actual de vehicle_events) + análisis de patrones geográficos de desempeño.

---

### 🟡 CORRECTITUD MATEMÁTICA

#### 2.9 `KM_PROMEDIO_VIAJE = 18` para TODAS las líneas

**Referencia:** Sección 6.2.
**Problema:** Las líneas UCOT reales varían 14-25 km. Asumir 18 km uniforme genera ±15 % de error en costos proyectados por línea.

**Solución (3-4 h):**
1. Agregar campo `kmViaje` a cada documento en `lineas_ucot` de Firestore (usando recorridos STM oficiales).
2. En `calcularLinea()`, leer `kmViaje` del documento de línea en lugar del global.
3. Si la línea no tiene `kmViaje` poblado, usar el global 18 como fallback.

**Prioridad:** MEDIA — mejora precisión de proyecciones por línea.

#### 2.10 Tendencia con promedio simple en lugar de regresión

**Referencia:** Sección 6.2.
**Archivo:** `backend/src/services/forecastService.ts:407` + `EconomicProjectionsPage.tsx` lado cliente.

**Problema:** La tendencia compara "promedio última semana" vs "promedio primera semana". No es robusto a outliers y no captura variabilidad.

**Solución (2 h):** reemplazar por mínimos cuadrados ordinarios (OLS). Fórmula:
```
slope = (n·Σxy – Σx·Σy) / (n·Σx² – (Σx)²)
intercept = (Σy – slope·Σx) / n
```
Devolver `slope` como tendencia. Bonus: R² como indicador de confianza.

**Prioridad:** BAJA — matemáticamente correcto pero diferencia práctica es mínima para los horizontes de 30 días.

#### 2.11 Break-even unidad ambigua

**Referencia:** Sección 6.2.
**Archivo:** `EconomicProjectionsPage.tsx:115-116`.

**Problema:** `breakEvenPasajeros = ceil(costosDia / (viajesDia × TARIFA))`. El label dice "Break-even pasajeros/viaje" pero la fórmula da "pasajeros totales/día".

**Solución (5 min):** o cambiar el label a "pax/día" o corregir la fórmula a `ceil(costosDia / TARIFA / viajesDia)` para que sea por-viaje.

**Prioridad:** BAJA — confusión cosmética, cálculo consistente internamente.

#### 2.12 `LINEAS_UCOT` hardcoded en array de 6 líneas

**Referencia:** Sección 4.5.
**Archivo:** `EconomicProjectionsPage.tsx:47-54`.

**Problema:** El módulo "Proyecciones Económicas" solo analiza 6 líneas UCOT fijas (370, 517, 369, 300, 329, 17). UCOT tiene ~29 líneas. El ejecutivo ve parcialidad sin saberlo.

**Solución (30 min):** leer dinámicamente de la colección `lineas_ucot` de Firestore. Si no hay documentos, fallback a la lista hardcoded con badge "muestra parcial".

**Prioridad:** ALTA — afecta decisiones ejecutivas sobre qué líneas son rentables.

---

### 🟡 UX TRANSVERSALES

#### 2.13 Números sin unidad visible

**Referencia:** Sección 7.
**Problema:** En varios widgets aparece "0.5" sin decir si es km, metros, minutos. "+$5000" sin saber si es ganancia o pérdida. El `parametros-operativos.ts` ya tiene la unidad por parámetro, solo falta rendererla en UI.

**Solución (2-3 h):** sweep de componentes críticos (Bunching, Distancia, Margen, Tendencia) para agregar unidad al lado del número.

**Prioridad:** MEDIA — mejora profesionalismo.

#### 2.14 Modales bloqueantes sin alternativa

**Referencia:** Sección 7.
**Problema:** CompetitorIntelligence ya tiene fallback (Fix #5) pero otros flujos (ShadowRadar disparo táctico) abren modales que bloquean la UI.

**Solución (1-2 h):** reemplazar modales por sidebars laterales o toasts expandibles.

**Prioridad:** BAJA — cosmético.

#### 2.15 Sin validación de datos entrante (Zod/Yup)

**Referencia:** Sección 7.
**Problema:** Si Firestore devuelve un doc con shape inesperado, la UI rompe silenciosamente. No hay validación de schema en ningún boundary.

**Solución (6-8 h como sprint):**
1. Definir schemas Zod para los documentos críticos (vehicle_events, cartones_de_servicio, viajes_activos, alertas_regulacion).
2. Validar en el cliente antes de renderizar.
3. Si falla validación, loggear + mostrar "dato inválido" en UI.

**Prioridad:** MEDIA — evita crashes en edge cases.

#### 2.16 Sin error boundaries por widget

**Referencia:** Sección 7.
**Problema:** Un error en un componente tira la página entera.

**Solución (2 h):** wrap cada widget crítico con `<ErrorBoundary>` que muestre un placeholder "Widget no disponible" sin romper el resto.

**Prioridad:** MEDIA.

#### 2.17 Timestamps sin zona horaria explícita

**Referencia:** Sección 7 + 6.5.
**Problema:** Algunos timestamps se muestran en UTC, otros en hora local, sin consistencia. Si el servidor corre en UTC, hay desfase de 3h con Montevideo.

**Solución (1 h):** helper global `formatTimestampMvd(ts)` que siempre usa `Intl.DateTimeFormat('es-UY', { timeZone: 'America/Montevideo', ... })`. Reemplazar todos los `.toLocaleTimeString()` por este helper.

**Prioridad:** ALTA si ocurren inconsistencias visibles al usuario.

#### 2.18 Toast de éxito sin validar escritura

**Referencia:** Sección 7 + 5.1.
**Problema:** ShadowRadar (y otros flujos) muestran "Disparo emitido" aunque la escritura a Firestore falle. El Fix #6 (Delegar Inspector) ya lo corrigió, pero el patrón persiste en otros lados.

**Solución (2-3 h):** auditoría de todos los `toast.success` que siguen a un `addDoc/setDoc` para verificar que están dentro del `try` después del `await`, no antes.

**Prioridad:** MEDIA.

---

### 🟢 BRECHAS vs CLASE MUNDIAL (no bloquean CUTCSA, definen roadmap post-venta)

#### 2.19 GTFS-static propio

Hoy publicamos GTFS-RT pero no GTFS-static (stops, routes, trips, shapes). Google Maps y Moovit ideal consumen ambos — hoy tendrían que cruzar con el GTFS-static del STM.
**Esfuerzo:** 8-12 h. **Prioridad:** MEDIA post-CUTCSA.

#### 2.20 TripUpdates GTFS-RT

Agregar `/trip-updates.pb` al publisher. Requiere schedule interno por trip_id + predicciones ETA.
**Esfuerzo:** 12-20 h. **Prioridad:** MEDIA.

#### 2.21 ServiceAlerts GTFS-RT

Mapear `alertas_regulacion` + `desvios_activos` a `Alert` entities GTFS-RT.
**Esfuerzo:** 6-8 h. **Prioridad:** BAJA.

#### 2.22 SIRI compliance (EU/UK)

Lo que GTFS-RT es para Norteamérica, SIRI es para Europa. Agregar endpoint SIRI-VM paralelo al GTFS-RT abre mercado europeo.
**Esfuerzo:** 15-25 h. **Prioridad:** solo si se quiere vender en EU.

#### 2.23 APC (Automatic Passenger Counting)

Hardware + integración. Sin esto los forecast económicos son "estimación sobre estimación".
**Esfuerzo:** 3-6 meses proyecto con piloto de 5-10 vehículos. **Prioridad:** ALTA como inversión, BAJA como urgencia.

#### 2.24 Driver behavior scoring (OBD-II / CAN)

Aceleración brusca, velocidad excedida, frenadas duras desde telemetría vehicular.
**Esfuerzo:** 2-3 meses proyecto. **Prioridad:** MEDIA post-CUTCSA.

#### 2.25 Predictive maintenance con telemetría

Modelo ML que predice fallas de componentes (motor, frenos, transmisión) desde datos de CAN + historial de taller.
**Esfuerzo:** 4-6 meses. **Prioridad:** BAJA, requiere data histórica robusta.

#### 2.26 ETA predictiva con ML

Modelo que predice minutos-a-llegada por parada usando GTFS-RT histórico + condiciones de tráfico.
**Esfuerzo:** 2-3 meses con al menos 3 meses de histórico. **Prioridad:** MEDIA.

#### 2.27 Lost mileage reporting (UITP KPI)

Km planificado vs km realizado con causal coding (tráfico/mecánico/staff/clima).
**Esfuerzo:** 1-2 semanas. **Prioridad:** MEDIA para venta a operadores internacionales.

#### 2.28 Disruption management workflow

Crear incidencia → asignar supervisor → re-routear flota → notificar pasajeros. Workflow core de cualquier OCC (Operations Control Center) profesional.
**Esfuerzo:** 3-4 semanas. **Prioridad:** ALTA post-CUTCSA — es el workflow que diferencia "dashboard" de "plataforma operativa".

#### 2.29 Multi-tenancy con data isolation

Para vender SaaS a CUTCSA + COETC + COME simultáneamente sin que se vean datos entre sí.
**Esfuerzo:** 4-8 semanas. **Prioridad:** CRÍTICA si el modelo de negocio es SaaS. BAJA si se venden instalaciones dedicadas.

---

## 3. Agrupación por prioridad operativa

### 🔴 Hacer antes del pitch a CUTCSA (1 semana concentrada)

| # | Item | Esfuerzo |
|---|---|---|
| 2.1 | EconomicProjections lea parámetros dinámicos | 1-2 h |
| 2.2 | IVA en proyecciones | 2-3 h |
| 2.12 | `LINEAS_UCOT` dinámico desde Firestore | 30 min |
| 2.4 | CEO Dashboard sin sparklines hardcoded | 30 min |
| 2.17 | Timestamps consistentes Montevideo | 1 h |
| 2.18 | Toast después de confirmar write | 2-3 h |

**Total:** ~7-10 horas. Cierra los pendientes visibles al usuario ejecutivo.

### 🟡 Hacer el mes siguiente (mejora de calidad)

| # | Item | Esfuerzo |
|---|---|---|
| 2.3 | Cruce medianoche | 1-2 h |
| 2.5 | Suite mínima de tests (Vitest) | 4-6 h |
| 2.6 | Factores competencia a parámetros | 1 h |
| 2.8 | Geolocalización en inspecciones | 2-3 h |
| 2.9 | `kmViaje` por línea | 3-4 h |
| 2.13 | Unidades visibles en UI | 2-3 h |
| 2.15 | Zod validation en boundaries | 6-8 h |
| 2.16 | Error boundaries por widget | 2 h |
| 2.19 | GTFS-static propio | 8-12 h |

**Total:** ~30-40 horas. Cierra el grueso de la deuda técnica.

### 🟢 Roadmap post-venta (trimestre+)

Items 2.20-2.29 — definen el siguiente nivel de producto, no son bloqueadores.

---

## 4. Qué es DESDE YA un diferenciador defendible

Frente a CUTCSA o cualquier operador técnico, después de estos fixes SkillRoute tiene:

- GTFS-RT publisher propio (implementado, pendiente deploy).
- OTP asimétrico UITP (implementado).
- EWT UITP para alta frecuencia (implementado).
- Haversine validado en 3 implementaciones coherentes.
- Parámetros económicos editables por Super Admin con fuentes oficiales verificables.
- Reglas Firestore con RBAC granular.
- Inteligencia competitiva cruzada de 4 operadores — el único diferencial genuinamente irreplicable.

Los pendientes del apartado 3.🔴 son lo único que bloquea presentar esto con confianza total.
