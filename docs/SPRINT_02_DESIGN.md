# Sprint 2 — Design (schema-first bajo §12)

> **Filosofía:** lección aprendida en las 7 iteraciones de Sprint 1.
> Antes de codear, inspección obligatoria del schema real de las
> colecciones que vamos a tocar. Documentar shapes verificados y
> mapeo de campos a features. Solo después diseño técnico y
> codificación.
>
> **Fecha diseño:** 2026-04-25 (esperando cierre §12 de Sprint 1)
> **Fecha estimada inicio:** post-cierre Sprint 1
> **Bloque del roadmap:** Bloque 2 — Real-time depth (semanas 3-4)

---

## Entregables del Sprint 2

| # | Entregable | Diferenciador comercial |
|---|---|---|
| 2.1 | **HeadwayInsights.tsx** — bunching/gapping single-op + HRR cross-op | Único en el mundo: combinación single-op (paridad con Swiftly) + HRR cross-op (nuestro moat) |
| 2.2 | **GPSPlayback.tsx** — timeline replay histórico de flota | Paridad con Swiftly. Forensic analysis de incidentes |
| 2.3 | **Sección comercial** del diferenciador HRR cross-op (página `/pricing`) | Documentación pública del moat |
| 2.4 | **Caso de uso anonymized** "bunching cross-op detectado entre operadores en línea X" | Evidencia real para pitch |

---

## Schema-first — colecciones inspeccionadas en Firestore real

Inspección hecha el 2026-04-25 antes de codear. Los nombres de campos
y tipos son los **reales en producción**, no asumidos.

### `viajes_activos` — posición actual de cada bus operando

ID del documento = `interno` (número del coche, integer como string).
Un documento por bus activo. Se actualiza cada vez que llega ping GPS.

```
{
  fuente:            string       ("imm_stm_online")
  interno:           integer      (10, 101, 1146...)
  empresa:           string       ("UCOT" | "CUTCSA" | "COME" | "COETC")
  linea:             string       ("300", "396", "CE2"...)
  variante:          integer      (4701, ...)
  posicion:          GeoPoint     (lat, lon actual)
  posicion_anterior: GeoPoint     (lat, lon previa — útil para sentido)
  updatedAt:         Timestamp    (último ping)
}
```

**Uso para HeadwayInsights:**
- Agrupar por `(linea, variante)` → buses en la misma sublínea/sentido.
- Para cada par consecutivo en orden de avance (`posicion` proyectada
  sobre el shape de la línea), calcular distancia entre buses.
- Convertir distancia → headway en minutos usando velocidad media (de
  `vehicle_events.velocidad` últimos N pings).
- Cross-op: agrupar por `linea` sin filtrar `empresa`, identificar
  bus propio vs bus rival más próximo, calcular HRR.

### `horarios_stm` — frecuencia esperada por línea, día tipo y variante

ID del documento = código de línea (`"100"`, `"300"`...). Un doc por
línea con scrapeado completo de horarios oficiales STM.

```
{
  linea:    string
  dias:     map {
    "Hábiles":  { variantes: array of { origen, destino, frecuenciaMin, horaInicio, horaFin } }
    "Sábados":  { variantes: array of {...} }
    "Domingos": { variantes: array of {...} }
  }
  scrapedAt: Timestamp
  updatedAt: Timestamp
}
```

**Uso para HeadwayInsights:**
- Por cada par de buses en `viajes_activos`, leer
  `horarios_stm/{linea}.dias[tipoDia].variantes[X].frecuenciaMin` →
  frecuencia esperada en minutos.
- `headway_actual / frecuencia_esperada`:
  - < 0.5 → BUNCHING (buses pegados, ineficiente)
  - 0.5 a 1.5 → NORMAL
  - \> 1.5 → GAPPING (gap de servicio)
- Si `frecuenciaMin === 0` o no hay horarios para esa variante →
  marcar como **NO MEDIBLE** (transparencia §12 — gap conocido del
  scraper STM).

### `vehicle_events` — eventos históricos GPS (ya conocido)

Schema verificado en Sprint 1 iteraciones 5-6:

```
{
  idBus:               string
  agencyId:            string ("70" = UCOT, "50" = CUTCSA, etc.)
  empresa:             string ("UCOT", "CUTCSA"...)
  linea:               string
  lat:                 double
  lon:                 double
  velocidad:           integer (km/h)
  estadoCumplimiento:  string (EN_TIEMPO | ADELANTADO | SIN_HORARIO | FUERA_DE_SERVICIO)
  desviacionMin:       integer
  proximaParada:       string
  sentido:             string
  bearing:             integer
  timestampGPS:        Timestamp (legacy, no en docs nuevos)
  expiresAt:           Timestamp
  createdAt:           Timestamp (campo principal de tiempo)
}
```

**Uso para GPSPlayback:**
- Query: `where('idBus', '==', X) AND where('createdAt', BETWEEN A, B)`.
- Usa índice existente `(idBus ASC, createdAt DESC)` ← ya en
  firestore.indexes.json.
- Devuelve secuencia ordenada de pings GPS para timeline replay.

### `alertas_regulacion` — alertas tácticas cross-op (ya integradas en GTFS-RT)

Schema confirmado parcialmente en Sprint 1. Útil para HeadwayInsights
porque cada alerta indica un evento de bunching detectado.

---

## Diseño técnico de cada entregable

### 2.1 HeadwayInsights.tsx

**Vista:**
- Header con selector de operador (`useEmpresaPropia`).
- Tabs: "Single-Op (mi flota)" | "Cross-Op (HRR)" | "Histórico"
- Para single-op: tabla por línea con columnas:
  - Línea, # buses activos, headway promedio actual, frecuencia esperada,
    % bunching, % gapping, % normal, calidad medible.
- Para cross-op: tabla por corredor con columnas:
  - Corredor (líneas que comparten), operadores en corredor, mi bus
    más próximo, rival más próximo, distancia entre ellos, HRR,
    estado (CRÍTICO si HRR < 0.3 = rival cerca = bunching cross-op).
- Para histórico: chart línea de bunching% por hora del día, últimos 7 días.

**Servicio:**
- `frontend/src/services/headwayInsightsService.ts` (archivo nuevo).
- Función `calcularHeadwaySingleOp(operador, linea?)` que:
  1. Lee `viajes_activos` filtrado por `empresa = operador` (y opcional `linea`).
  2. Agrupa por `(linea, variante)`.
  3. Lee `horarios_stm/{linea}` para frecuencia esperada por tipo día.
  4. Calcula headway por par consecutivo.
  5. Clasifica BUNCHING/NORMAL/GAPPING/NO_MEDIBLE.
- Función `calcularHRRCrossOp(operadorPropio, lineaCorredor)` que:
  1. Lee `viajes_activos` por `linea` (sin filtrar `empresa`).
  2. Identifica buses propios vs rivales.
  3. Para cada bus propio, encuentra rival más próximo en la misma
     dirección.
  4. Calcula HRR = headway propio / tiempo al rival.

**Backend (opcional Sprint 2 — calcular en frontend primero):**
- Si la query Firestore desde frontend es lenta, mover a Cloud Function
  `headwayInsightsApi.ts`.

### 2.2 GPSPlayback.tsx

**Vista:**
- Selector de bus (`idBus`) o línea.
- Date range picker (default: últimas 24 horas).
- Mapa con polyline animada de la trayectoria.
- Slider temporal con play/pause/speed.
- Cards laterales con: velocidad, estadoCumplimiento, próxima parada
  en cada punto del playback.

**Servicio:**
- `frontend/src/services/gpsPlaybackService.ts` (archivo nuevo).
- Función `getTrayectoria(idBus, desde, hasta)` que:
  1. Query `vehicle_events.where(idBus, ==).where(createdAt, BETWEEN)`.
  2. Devuelve array ordenado por `createdAt`.

### 2.3 Documentación pública diferenciador HRR

Editar `frontend/src/pages/public/PricingPage.tsx` agregando una
sección destacada del feature HeadwayInsights cross-op (sin URL nueva,
solo bloque visual). Edit puntual chico.

### 2.4 Caso de uso anonymized

Documento Markdown en `docs/CASOS_USO/bunching_cross_op_caso_1.md`
con una captura real de HeadwayInsights mostrando un evento de
bunching cross-op detectado entre dos operadores. Anonimizar nombres
si es necesario para confidencialidad.

---

## Verificación §12 al cierre del Sprint 2

Bajo regla §12, los criterios de cierre **antes** de pasar a Sprint 3:

1. `/headway-insights` accesible al usuario logueado, renderiza datos
   reales de `viajes_activos` y `horarios_stm`. Sin error de console.
2. **Single-op:** tabla muestra al menos 10 líneas de UCOT (operador
   con más buses) con valores numéricos coherentes. Frecuencia
   esperada coincide con horarios_stm de cada línea.
3. **Cross-op:** muestra al menos 5 corredores donde detecta HRR
   medible. Si no hay datos para una línea, lo dice explícitamente.
4. **GPSPlayback:** seleccionar un bus real (ej. `idBus = "10"`),
   rango últimas 24h. Mapa muestra la polyline. Slider funciona.
5. Mobile-responsive ambas vistas (viewport 390px).
6. Regresión: cargar CEO Dashboard, Cartones, ShadowRadar — sin errores.
7. Caso de uso documento publicado en `docs/CASOS_USO/`.

---

## Anti-patrones detectados en Sprint 1 — NO repetir

1. **Suposición de campos sin verificar.** Confirmado: 6 iteraciones
   gastadas en Sprint 1 por asumir nombres de campos. Ahora schema
   inspeccionado primero.

2. **Asumir que `desviacionMin` no existe** porque Code dijo así.
   Verificado: 80% de docs lo tienen. Cualquier afirmación sobre data
   debe verificarse con query directa, no con reportes textuales.

3. **No leer índices existentes antes de codear.** Sprint 1 agregó 5
   índices, 4 inútiles. Ahora documenté que `(idBus ASC, createdAt
   DESC)` ya existe → puedo usarlo sin agregar índice nuevo.

4. **Diseñar endpoint sin verificar que la convención del sistema
   coincide con mi diseño** (caso requireAdmin que leía
   `decoded.role` cuando el sistema usa `users/{uid}.role`).

---

## Próximo paso operativo

1. **Esperar cierre Sprint 1** (índice Firestore terminando de construir
   en este momento — verificación §12 final pendiente).
2. **Cuando Sprint 1 cierre**, arrancar Sprint 2 con este documento
   como base. Cowork crea archivos nuevos:
   - `frontend/src/services/headwayInsightsService.ts`
   - `frontend/src/pages/traffic/HeadwayInsights.tsx`
   - `frontend/src/services/gpsPlaybackService.ts`
   - `frontend/src/pages/traffic/GPSPlayback.tsx`
3. Code agrega rutas en App.tsx + Sidebar (edits puntuales).
4. Verificación §12 con datos reales según los 7 criterios listados
   arriba.
