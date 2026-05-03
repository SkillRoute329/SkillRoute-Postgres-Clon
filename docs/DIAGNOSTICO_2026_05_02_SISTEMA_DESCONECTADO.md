# Diagnóstico 2026-05-02 — Por qué SkillRoute parece "desconectado"

> Pedido del usuario (Jonathan): el programa debería estar todo interconectado y relacionado, desde el más mínimo detalle, porque siempre algo influye (falta de personal, atraso de una línea, servicio asignado, disponibilidad de personal/coche/línea, mantenimiento, etc.). Además, la ingesta de la API de la IMM lleva días corriendo y se asume que ya hay estadísticas — pero las pantallas aparecen vacías y cada función parece operar por separado.

Este dossier responde **dos preguntas distintas** que el usuario mezcló (con razón, son síntomas del mismo problema):

1. **¿Por qué las estadísticas no se llenan?** — bug operativo de URL.
2. **¿Por qué cada módulo parece funcionar por separado?** — falta arquitectónica (Motor de Consecuencias).

---

## 1. Por qué las estadísticas no se llenan — ROOT CAUSE encontrado

**El backend SÍ está recolectando datos. El frontend está apuntando al dominio equivocado.**

### Evidencia operativa (medida 2026-05-02 18:53 UTC)

| Endpoint | Resultado |
|---|---|
| `https://skillroute.web.app/api/autostats/health` | `status: UP`, `upSince: 2026-04-26T08:16:26Z`, **0 fallos consecutivos** |
| `https://skillroute.web.app/api/autostats/compliance/70` (UCOT) | **66 buses**, 12 líneas operando |
| `https://skillroute.web.app/api/autostats/compliance/50` (CUTCSA) | **476 buses** |
| `https://skillroute.web.app/api/autostats/compliance/20` (COME) | **43 buses** |
| `https://skillroute.web.app/api/autostats/compliance/10` (COETC) | **114 buses** |
| `https://skillroute.web.app/api/autostats/history/70?days=2` | **1057 eventos línea 306**, 631 línea 370, 540 línea 300, etc. |

Total: ~700 buses cross-operador con tracking en vivo y **2+ días de historial agregado**. El cron `autoStatsCollectorTick` corre cada 15 min sin fallar desde el 26 de abril.

### Por qué el dashboard muestra "datos no disponibles"

El frontend deployado en `skillroute.web.app` tenía esta variable en `frontend/.env.production:5`:

```
VITE_API_URL=https://ucot-gestor-cloud.web.app/api   # ❌ dominio viejo, sin rewrite a Cloud Functions
```

El dominio viejo `ucot-gestor-cloud.web.app` ya no tiene los rewrites a `intelligenceApi`, por lo que devuelve **HTTP 503** en `/api/autostats/...`. El frontend interpreta eso como "backend caído" y muestra "Los datos en tiempo real no están disponibles".

**Fix aplicado en esta sesión** (commit pendiente):

```diff
- VITE_API_URL=https://ucot-gestor-cloud.web.app/api
+ VITE_API_URL=https://skillroute.web.app/api
```

Pasos restantes para que los datos aparezcan en el dashboard:

```bash
cd "C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\frontend"
npm run build
cd ..
firebase deploy --only hosting:skillroute
```

### Módulos afectados por el bug de URL

Los servicios que usaban `VITE_API_URL` con el dominio roto:

- `frontend/src/services/autoStatsService.ts` — afecta TODOS los módulos de Cumplimiento (Diagnóstico por Línea, Alertas OTP, Ranking de Coches, Puntualidad OTP, Cumplimiento Horario GPS, Semana vs Semana).

Los servicios que usan paths relativos (`/api/...` sin dominio) NO estaban afectados — por eso el dashboard principal sí muestra alertas, posiciones de flota y ShadowRadar funcionando. La asimetría entre módulos que veía el usuario tiene esta explicación técnica directa.

---

## 2. Bugs adicionales encontrados durante el diagnóstico

### 2.1 Coordenadas GPS basura no filtradas

En la respuesta de compliance/70 hay buses con coordenadas imposibles:

```json
{ "idBus": "33", "linea": "306", "lat": -258.02588, "lon": -258.02588, ... }
{ "idBus": "115", "linea": "329", "lat": -258.02588, "lon": -258.02588, ... }
```

Latitud válida: -90 a 90. Longitud válida: -180 a 180. El collector `autoStatsCollector.ts:300-307` no descarta features con coordenadas fuera de rango antes de escribir en `vehicle_events`. Esto contamina mapas y cálculo DRO.

**Fix sugerido** (`functions/src/autoStatsCollector.ts` cerca de línea 304):

```typescript
for (const feat of features) {
  const p = feat.properties;
  if (!p?.codigoBus || !p?.linea) continue;
  const [lon, lat] = feat.geometry.coordinates;
  // Validar rango GPS antes de procesar
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    console.warn(`[AutoStats] GPS inválido descartado: bus ${p.codigoBus} (${lat},${lon})`);
    continue;
  }
  // ... resto del procesamiento
}
```

### 2.2 Cumplimiento siempre 100% — violación de la Regla Anti-Simulación

Todos los buses devuelven `estadoCumplimiento: "EN_TIEMPO"` con `desviacionMin: 0`. Eso es estadísticamente imposible (700 buses, 4 operadores, paro ucotiano la semana pasada, atrasos típicos de Montevideo) y rompe el CLAUDE.md §"Regla Anti-Simulación".

**Causa**: la lógica `calcularCumplimiento()` en `autoStatsCollector.ts` cae en `EN_TIEMPO` por defecto cuando no encuentra horarios scrapeados (`horarios_stm/{linea}` vacío o parcial). El estado correcto cuando falta el horario es `SIN_HORARIO`, no `EN_TIEMPO`.

Esto se nota porque la línea `L12` (única que sí tiene horario faltante reconocido) dice `SIN_HORARIO`. Las demás reciben `EN_TIEMPO` falsamente.

**Verificación pendiente**: contar cuántas líneas tienen horario scrapeado en `horarios_stm` vs total de líneas con buses GPS. Probable resultado: <30%.

### 2.3 `fleet-ranking/70?days=2` devuelve 0 coches

Endpoint pagado del backend pero `vehicles: []`. La query existe (`autostats.ts:321`) pero no encuentra coincidencias. Sospecha: el ranking depende de un campo que no se está populando o el filtro de fecha está mal.

### 2.4 Hardcoded URLs al dominio viejo en código frontend

11 archivos del frontend tienen URLs hardcodeadas a `https://us-central1-ucot-gestor-cloud.cloudfunctions.net/...`:

- `frontend/src/data/geo/routeCacheService.ts:41` — montevideoProxy
- `frontend/src/pages/traffic/CompetitorIntelligencePage.tsx:58` — intelligenceApi
- `frontend/src/pages/traffic/FleetEtaPanel.tsx:32` — immEta
- `frontend/src/pages/traffic/FleetMonitorModule.tsx:113,118` — immParadasList, immBusesLive
- `frontend/src/pages/traffic/ShadowRadar.tsx:114` — montevideoProxy
- `frontend/src/services/ucotLinesService.ts:32` — montevideoProxy

Estas URLs **siguen funcionando** porque el proyecto Cloud Functions `ucot-gestor-cloud` sigue activo (mismo project del backend). Pero son una bomba de tiempo: si Jonathan algún día migra el proyecto Firebase, todo esto se cae. Refactor recomendado: centralizar en una constante `CLOUD_FN_BASE` derivada de `import.meta.env`.

---

## 3. Por qué cada módulo parece funcionar por separado — falta arquitectónica

Esto es **lo que más le importa al usuario** y es legítimo: SkillRoute hoy es una colección de pantallas que leen Firestore independientemente, no un sistema reactivo donde un evento se propague.

### Estado actual (mapa de dependencias por módulo)

| Módulo | Lee de | Escribe en | Reacciona a |
|---|---|---|---|
| Dashboard CEO | `vehicle_events`, `alertas` | — | nada |
| Cumplimiento | `vehicle_events`, `horarios_stm` | — | nada |
| Posición Flota | `viajes_activos`, `imm_buses_live` | — | nada |
| ShadowRadar | `corridor_overlap`, GPS live | `alertas` (al detectar pisada) | nada |
| Listero/Distribución | `services`, `vehicles`, `drivers` | `daily_assignments` | nada |
| Mantenimiento | `vehicles`, `mantenimiento_eventos` | — | nada |
| Subsidios MTOP | `daily_otp`, `gtfs_timetable` | — | nada |
| Cartones | `cartones`, `boletines` | — | nada |
| Incidencias | `incidencias` | — | nada |

Cada uno funciona, pero **no se hablan entre sí**. Si UCOT tiene un conductor ausente:
1. Listero lo marca → `daily_assignments.status = AUSENTE`
2. **Nadie** dispara una alerta a Cumplimiento de que la línea X va a tener un servicio caído.
3. **Nadie** recalcula la cobertura proyectada para el día.
4. **Nadie** avisa al motor de OTP que la frecuencia real va a ser distinta a la programada.
5. **Nadie** ajusta el cálculo de subsidio MTOP por la pérdida de seat-km.

El usuario lo describió bien: "todo en realidad está reaccionado y conectado" — y hoy el sistema no refleja eso.

### Diseño propuesto: Motor de Consecuencias (Event Bus + Cascade Engine)

Esto está listado en backlog #1 del SESION_ACTUAL.md. Aquí va el diseño concreto.

#### Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                     EVENT SOURCES (escriben)                     │
├─────────────────────────────────────────────────────────────────┤
│ • RRHH: ausencia, certificado, licencia                          │
│ • Tráfico: atraso, bunching, desvío, accidente                   │
│ • Flota: avería, taller, fuera de servicio                       │
│ • Listero: reasignación, servicio caído, refuerzo                │
│ • IMM/STM: cambio de recorrido, semáforo, manifestación          │
│ • Combustible: carga insuficiente                                │
│ • Mantenimiento: vencimiento ITV, revisión                       │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
              ┌──────────────────────┐
              │  Firestore: events    │  ← cada cosa que pasa se escribe acá
              │  (append-only log)    │
              └──────────┬───────────┘
                         ▼
           ┌────────────────────────────┐
           │ consequenceTriggers (CF)    │  ← onDocumentCreated → fan-out
           └─────────────┬──────────────┘
                         ▼
        ┌────────────────┼────────────────────┐
        ▼                ▼                    ▼
┌──────────────┐  ┌──────────────┐  ┌─────────────────┐
│ State Refs   │  │ KPI Updates  │  │ Alert Routing    │
│ (denorm)     │  │ (counters)   │  │ (FCM, dashboard) │
└──────────────┘  └──────────────┘  └─────────────────┘
```

#### Reglas de cascada (catálogo inicial — 12 cadenas críticas)

1. **Ausencia conductor → servicio caído** ⇒ pérdida de seat-km en línea X durante horario H ⇒ baja proyección OTP ⇒ marca riesgo subsidio MTOP.
2. **Coche en taller → flota disponible -1** ⇒ Listero recalcula factibilidad de servicios ⇒ si insuficiente, dispara alerta de planificación.
3. **GPS bus indica >5 min atraso** ⇒ alerta OTP ⇒ si persiste >15 min ⇒ incidencia automática ⇒ sugerencia "Regular X minutos" ⇒ notif al conductor.
4. **Bunching detectado** (DRO live) ⇒ alerta a sala de tráfico ⇒ propuesta de despacho de refuerzo si hay coches reserva.
5. **Pisada de rival** (DRO + HRR) ⇒ alerta táctica ⇒ histograma de pisadas/día por línea ⇒ feed de "Inteligencia Cross-Operador".
6. **Vencimiento ITV próximo** (≤30 días) ⇒ bloquear coche en programación de Listero al llegar fecha ⇒ alerta a Mantenimiento.
7. **Documento conductor próximo a vencer** (carnet, libreta) ⇒ Listero no lo asigna desde 7 días antes ⇒ alerta a RRHH.
8. **Carga combustible insuficiente** para servicio asignado ⇒ alerta operador antes de despacho.
9. **Cambio recorrido por desvío IMM** ⇒ recalcular ETA en paradas ⇒ notif passenger app (futuro).
10. **Accidente reportado** ⇒ coche fuera de servicio ⇒ Listero busca reemplazo ⇒ recalcular OTP del día.
11. **Cierre del día** ⇒ snapshot agregado a `daily_otp`, `daily_seatkm`, `daily_compliance` por línea/empresa ⇒ alimenta dashboards históricos y subsidios.
12. **Cierre semanal** ⇒ archivo `weekly_kpis` con benchmark cross-operador ⇒ alimenta vista regulador y pitch.

#### Implementación concreta (a desarrollar)

Ya existe el esqueleto en `functions/src/consequenceTriggers.ts` (Trigger 3 sobre `vehicle_events` ya está). Faltan:

- `onDocumentCreated` para `daily_assignments` (ausencia → servicio caído).
- `onDocumentUpdated` para `vehicles.estado` (taller → flota -1).
- `onDocumentCreated` para `incidencias` (accidente → impacto operacional).
- Schedule diario `nightlyAggregator` que genere `daily_otp`, `daily_seatkm`, `daily_compliance`.
- Schedule semanal `weeklyKpiSnapshot` que copie a `weekly_kpis`.
- Vista UI `/dashboard/super-admin/motor-consecuencias` con stream de cascadas en tiempo real (auditoría).

#### Por qué importa (pitch CUTCSA)

CUTCSA tiene departamento tecnológico propio y puede construir paneles. Lo que **no puede** construir es:

- **Datos cross-operador** en vivo de los 4 operadores (CUTCSA solo tiene los suyos).
- **Reglas de competencia** que cuantifiquen pisada de rival con datos GPS reales de los 4.
- **Motor de consecuencias** que en una sola vista muestre cómo una ausencia en CUTCSA línea 100 desencadena oportunidad/riesgo en COME línea 522 (corredor compartido).

Este motor convierte SkillRoute en sistema-de-sistemas, no en otro CAD/AVL.

---

## 4. Plan de acción priorizado

### Sprint inmediato (esta semana)

1. **Fix URL backend** — ya aplicado en esta sesión (`.env.production`). Falta `npm run build && firebase deploy --only hosting:skillroute`. Sin esto, el resto del trabajo no se ve.
2. **Filtrar GPS basura** en `autoStatsCollector.ts:304`.
3. **Corregir lógica de cumplimiento** — devolver `SIN_HORARIO` (no `EN_TIEMPO`) cuando `horarios_stm/{linea}` no existe o está incompleto.
4. **Auditoría rápida**: contar líneas con `horarios_stm` poblado vs total de líneas activas en `vehicle_events`. Disparar scraper para las faltantes.

### Sprint Motor de Consecuencias (2-3 semanas)

5. **`nightlyAggregator`** — primer trigger que escribe `daily_otp`, `daily_seatkm`, `daily_compliance` a las 23:55 cada día. Es la base de los dashboards históricos vacíos hoy.
6. **`onAssignmentChanged`** — propagar cambios de Listero a la cobertura proyectada de la línea.
7. **`onVehicleStateChanged`** — propagar taller/avería a flota disponible.
8. **Vista `MotorConsecuencias.tsx`** — feed visible de cascadas (transparencia para directivos).

### Sprint Histórico (mes 2)

9. **`weeklyKpiSnapshot`** — base del benchmarking cross-operador.
10. **Exportador GTFS-RT** desde el motor de eventos (cumple Regla 13 — ya estaba parcial).
11. **API regulatoria** — endpoints `GET /api/regulatorio/otp-historico/{empresa}/{semana}` para reguladores.

---

## 5. Verificación funcional pendiente para Claude Code

> Cowork no puede correr `firebase deploy` ni `npm run build` desde sandbox. Los comandos de cierre van a Code.

```bash
cd "C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\frontend"
npm run build

cd ..
firebase deploy --only hosting:skillroute

# Verificar:
# 1. Abrir https://skillroute.web.app/dashboard/traffic/diagnostico-cumplimiento
# 2. Esperar a que cargue (sin click en "Intentar de nuevo"). Debe aparecer:
#    - Coches en servicio: ~66 (UCOT) / ~476 (CUTCSA) según pestaña
#    - Cuadrícula con líneas y % cumplimiento
#    - Sin banner rojo "Los datos en tiempo real no están disponibles"
# 3. Verificar Inteligencia Cross-Operador → debe mostrar pares DRO con datos
# 4. Verificar que ShadowRadar siga funcionando (no debería cambiar — usa /api relativo)
```

Si después del deploy **sigue diciendo "datos no disponibles"**: limpiar cache del browser (Ctrl+Shift+R) — Vite cachea el bundle con el VITE_API_URL viejo.

---

## 6. Archivos tocados en esta sesión

| Archivo | Cambio | Riesgo |
|---|---|---|
| `frontend/.env.production` | `VITE_API_URL` apunta a `skillroute.web.app/api` | Bajo — env file, no código |
| `docs/DIAGNOSTICO_2026_05_02_SISTEMA_DESCONECTADO.md` | Nuevo — este dossier | Sin riesgo |

Pendiente para próxima sesión (delegado a Code o nueva sesión Cowork con archivos chicos):

- `functions/src/autoStatsCollector.ts` — filtro GPS válido (cambio de 4 líneas).
- `functions/src/autoStatsCollector.ts` — ajuste lógica `calcularCumplimiento` (10 líneas).
- `functions/src/consequenceTriggers.ts` — nuevos triggers de cascada.
- `functions/src/nightlyAggregator.ts` — archivo nuevo, snapshot diario.
- `frontend/src/pages/admin/MotorConsecuencias.tsx` — vista de cascadas.

---

**Resumen de una línea**: el motor sí captura datos hace 6 días, lo que está roto es el cable que conecta el frontend con el motor (URL en `.env.production`). El fix del cable está aplicado. Lo que está pidiendo el usuario por encima de eso — interconexión real entre módulos — es el Motor de Consecuencias, que es una semana o dos de trabajo arquitectónico bien definido.
