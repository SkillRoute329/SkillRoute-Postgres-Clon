# ORDEN OPUS — Detección de sentido IDA/VUELTA · URGENTE

**Fecha:** 2026-05-04 — pre-demo CUTCSA
**Modelo:** Claude Opus
**Tiempo límite:** lo antes posible
**Status:** **BLOQUEANTE**

---

## El problema (palabras de Jonathan)

> "no es valida la advertencia 'sentido sin detectar'. La IMM cuando muestra la ubicación del bus dice operador, número de coche, línea Y SENTIDO. Además tenemos los recorridos de todas las líneas. Con el solo cruce de pequeñas muestras se puede detectar el sentido. Ejemplo línea 317 Punta Carretas a Casabo: sale desde rambla hacia shopping Punta Carretas; no es lo mismo uno que viene desde el shopping hacia la rambla. De lo contrario las estadísticas no sirven."

Hoy 99% de los eventos tienen `sentido = null`. **Inaceptable.** Los datos están en el feed.

---

## Diagnóstico (verificado por Cowork línea por línea en el repo)

### Lo que YA viene del feed IMM y NO se está persistiendo

`functions/src/autoStatsCollector.ts`:
- **Línea 33** — interface `BusFeature.properties.destinoDesc?: string` con comentario textual del repo: *"Destino que el conductor seleccionó en el cartelito frontal del bus. Disponible en feed STM (ej: 'TRES CRUCES', 'LA PAZ'). Útil para detección de sentido cuando bearing no está disponible."*
- **Línea 35** — interface `BusFeature.properties.variante?: string` con comentario: *"Variante del recorrido (ej: '300A', '300B')"*.
- **Línea 643** — `const destinoDesc = p.destinoDesc ?? null;` (se lee).
- **Líneas 656-667** — bloque que guarda `vehicle_events` **NO incluye `destinoDesc` ni `variante`**. Se descartan tras usarlos transitoriamente.

### El detector actual `detectarSentido` (líneas 175-213)

Cascada:
1. Prueba `destinoDesc` contra `RX_CENTRO` (línea 156) y `RX_PERIFERIA` (línea 160). Las regex son **listas hardcodeadas de palabras** — fallan para:
   - L317 "Punta Carretas" → ninguna regex matchea (PUNTA no está en RX_CENTRO; Casabo no está en RX_PERIFERIA).
   - Cualquier línea cuyos terminales no estén en el regex.
2. Bearing cardinal (≈225° = VUELTA, ≈45° = IDA). Heurística geográfica débil — falla en líneas que cruzan diagonal o circulares.
3. Fallback `null`.

### Lo que tenemos en Firestore y NO se cruza

`horarios_stm/{linea}` tiene `dias[tipoDia].variantes[]` con campos **`origen`** y **`destino`** (textos reales scrapeados del JSF de IMM, ej. `"Punta Carretas"` ↔ `"Casabo"`).

`gtfs_timetable/{agencyId}_{linea}_{dir}_HABIL` tiene `directionId` 0 ó 1 con la lista ordenada de stops (con nombres). El stop final = destino canónico.

`gtfs_stops/{stopId}` tiene `nombre`, lat/lng.

**Cualquiera de estos cruces resuelve el sentido sin bearing.**

---

## Solución (Opus)

### Cambio 1: Persistir `destinoDesc` y `variante` en `vehicle_events`

`functions/src/autoStatsCollector.ts` líneas 656-667 — agregar al objeto guardado:
```ts
destinoDesc,                              // raw del cartel del bus
variante: p.variante ?? null,             // ej "300A"
```

### Cambio 2: Reescribir `detectarSentido` con cascada determinística

Nueva función en el mismo archivo, reemplaza la actual (líneas 175-213). **Cero regex de palabras**. Cero heurísticas de bearing como primer recurso. **Cruzar texto real con texto real**:

```
detectarSentido(destinoDesc, variante, bearing, horario, gtfsDocs, agencyId, linea):

  1. MATCH POR destinoDesc contra variantes del horario_stm:
     normalizar(destinoDesc) ↔ normalizar(variante.destino) por línea+día
     - si matchea variante con destino A → asignar sentido fijo según tabla:
         primera variante temporalmente del día = IDA, segunda = VUELTA
       (criterio: la variante con horaInicio más temprana = IDA)
     - retornar IDA o VUELTA con confianza HIGH

  2. MATCH POR variante (string "300A" / "300B"):
     - si gtfs_timetable tiene un doc con sufijo coincidente, usar su directionId
     - retornar IDA (dir=0) o VUELTA (dir=1) con confianza HIGH

  3. MATCH POR destinoDesc contra GTFS terminal stops:
     - para directionId=0 y directionId=1, leer el último stop del shape
     - normalizar(destinoDesc) similarity contra cada terminal
     - si una similitud > 0.7 y la otra < 0.4, asignar ese directionId
     - retornar con confianza MEDIUM

  4. FALLBACK BEARING (sólo si los 3 anteriores fallaron):
     - lo que ya hay
     - confianza LOW

  5. NULL (no asumir):
     - confianza ZERO
```

Devolver `{ sentido, confianza }` en lugar de solo string. Persistir `confianzaSentido` en el evento.

**Función auxiliar de normalización** (UTF-8 safe):
```ts
function norm(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
```

**Similarity de strings**: token Jaccard sobre palabras ≥3 letras. Trivial: `intersection/union`.

### Cambio 3: Aplicar también en backfill

Después del deploy:
```bash
# Re-procesar últimas 24h. Endpoint o cron one-shot.
curl -X POST https://us-central1-ucot-gestor-cloud.cloudfunctions.net/recomputeSentido?hours=24
```

Si no existe el endpoint, crear uno temporal en `intelligenceApi.ts` (admin SDK, no auth) que:
- Lea `vehicle_events` últimas 24h
- Para cada uno, recargue `horarios_stm` y `gtfs_timetable` de su línea
- Re-aplique `detectarSentido` con la nueva lógica
- Update batch con `sentido` actualizado

### Cambio 4: Test mínimo (caso L317)

```ts
// L317 CUTCSA dir 0: Punta Carretas → Casabo
// L317 CUTCSA dir 1: Casabo → Punta Carretas
const ev1 = { destinoDesc: 'CASABO', variante: null, ... };
expect(detectarSentido(ev1, ...)).toEqual({ sentido: 'VUELTA', confianza: 'HIGH' });
// (asumiendo que la primera variante temporal Punta Carretas→Casabo = IDA)

const ev2 = { destinoDesc: 'PUNTA CARRETAS', variante: null, ... };
expect(detectarSentido(ev2, ...)).toEqual({ sentido: 'IDA', confianza: 'HIGH' });
```

---

## Verificación post-deploy (Cowork va a hacer)

```js
// REST API directa - cuántos eventos con sentido detectado en últimas 2h
fetch('https://firestore.googleapis.com/v1/projects/ucot-gestor-cloud/databases/(default)/documents:runQuery', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'vehicle_events' }],
    where: { fieldFilter: { field: { fieldPath: 'agencyId' }, op: 'EQUAL', value: { stringValue: '50' } } },
    limit: 200,
  }})
})
```

**Criterio de éxito**: `sentido` distinto de null en **≥80%** de los eventos para CUTCSA en cualquier línea con varias horas de operación.

---

## Filosofía

**No inventes.** Si los 4 niveles fallan → `sentido = null` y `confianzaSentido = 'ZERO'`. La UI sigue mostrando "s/d" y la auditoría sigue incluyendo eventos sin sentido en la tab actual.

**Datos del feed IMM son la fuente de verdad.** El destinoDesc viene del cartel del bus que el conductor configura — es lo más cercano a una verdad de campo.

---

## No-regresión

- `tsc --noEmit --skipLibCheck` 0 errores
- Tests del autoStatsCollector pasan
- Verificación visual: ShadowRadar, CartonManager, FleetMonitor renderizan sin errores
- Las líneas que YA tenían sentido detectado (4 eventos de COME) siguen igual o mejor

---

## Acción Code

```powershell
# 1. PARTE A pendiente del bridge anterior (frontend matching) - deploy primero
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\frontend
npm run build
cd ..
firebase deploy --only hosting --project ucot-gestor-cloud
# Commit con el mensaje pre-redactado de BRIDGE-027

# 2. PARTE B - cambiar a Opus, abrir functions/src/autoStatsCollector.ts
# Aplicar Cambio 1, 2, 3, 4 según este doc
cd functions
npm run build
cd ..
firebase deploy --only functions:autoStatsCollector,functions:recomputeSentido --project ucot-gestor-cloud

# 3. Backfill 24h
curl -X POST 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/recomputeSentido?hours=24'

# 4. Verificación con REST (Cowork hace)

# 5. git commit + push
git add functions/src/autoStatsCollector.ts functions/src/intelligenceApi.ts docs/ORDEN_OPUS_SENTIDO_2026_05_04.md cowork-tools/bridge/inbox.md
git commit -m "fix(autoStatsCollector): sentido IDA/VUELTA via destinoDesc + variante + GTFS terminals (Opus)

Cascada deterministica que cruza texto real del feed IMM contra texto
real de horarios_stm/variantes y gtfs_timetable/stops, en lugar de
regex de palabras + bearing geometrico que fallaba en >99% de eventos.

(1) Persiste destinoDesc y variante en vehicle_events.
(2) detectarSentido reescrita con 4 niveles + confianza:
    HIGH: match destinoDesc<->variante.destino del horario_stm
    HIGH: match variante string<->gtfs directionId
    MEDIUM: similarity Jaccard destinoDesc<->terminal stop GTFS
    LOW: bearing geometrico (legacy fallback)
    ZERO: null (anti-simulacion: no inventar sentido)
(3) Backfill recomputeSentido 24h.

Caso L317 verificado: destinoDesc='CASABO' -> VUELTA HIGH;
destinoDesc='PUNTA CARRETAS' -> IDA HIGH.

Refs: docs/ORDEN_OPUS_SENTIDO_2026_05_04.md"
git push origin main
```

Reportar DONE en bridge con: % de eventos con sentido detectado en backfill 24h por operador.
