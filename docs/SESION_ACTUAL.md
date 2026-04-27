# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

> **Para Claude (cualquier sesión nueva)**: este archivo es lo SEGUNDO que lees después de `CLAUDE.md`. Acá está dónde se quedó la sesión previa, qué decisiones se tomaron pendientes de implementar, y cuál es el próximo paso concreto. Antes de cerrar tu sesión, actualizalo con los nuevos pendientes.

> **Para Jonathan**: este archivo se actualiza automáticamente al final de cada sesión productiva. No lo borres ni lo edites manualmente — Claude lo gestiona.

---

## ## VERIFICACIÓN POST-RESTAURACIÓN 2026-04-26

### Paso 1 — NULs y JSONs (Windows nativo)

| Check | Resultado |
|---|---|
| NULs en `frontend/src/**` | **0 NULs** — falso positivo del mount Cowork confirmado |
| `package.json` | OK ✅ |
| `frontend/package.json` | OK ✅ |
| `functions/package.json` | OK ✅ |
| `frontend/src/data/shapesAllOperators.json` | OK ✅ |
| `frontend/tsconfig.json` | OK ✅ |
| `frontend/tsconfig.app.json` | FAIL — JSONDecodeError (esperado: es JSONC con comentarios, no JSON estricto — no es daño) |

### Paso 2 — Diagnóstico: Caso A

Cero archivos dañados. Los cambios en `RouteMap.tsx` (feature `liveBuses`) y `regulatorio.ts` (fix auth middleware) son **legítimos de sesiones Cowork**. No se restauró nada con `git checkout HEAD --`.

Problema adicional detectado: 28 docIds en `shapesAllOperators.json` tenían prefijo `imm_` (legacy del scraper cuando agencyId era null) — el injector hacía fast-path lookup por `50_133_IDA` pero la clave real era `imm_133_IDA`. **Fix aplicado**: renombrado de claves `imm_*` → `{agencyId}_{linea}_{sentido}` directo en el JSON.

### Paso 3 — crossOpShapesInjector.ts

- `crossOpShapesInjector.ts`: 8415 bytes, 0 NULs, 205 líneas ✅ (exacto per ORDEN)
- tsc `--noEmit --skipLibCheck`: 0 errores ✅
- Build: OK ✅
- Deploy: `data-shapes-all-D_UVFp4k-1777247649298.js` → HTTP 200 ✅

### Paso 4 — Bug líneas azules múltiples

**Diagnóstico confirmado**: 272 de 280 shapes tenían saltos > 500m entre puntos consecutivos (Hipótesis A del ORDEN). El scraper concatenaba múltiples LineStrings del mapa OL sin reordenar → Leaflet dibujaba líneas rectas entre segmentos discontinuos visualmente como "múltiples líneas azules".

**Fix aplicado en `crossOpShapesInjector.ts`**:
- Nueva función `longestContiguousSegment(points, MAX_JUMP_M=800)`: parte el array en segmentos contiguos y devuelve el más largo.
- Aplicada en `entryToLineaUCOT` antes de asignar `recorrido`.
- Resultado: cada línea muestra solo su tramo contiguo más largo — sin saltos visuales.

**Deploy final**: `data-shapes-all-D_UVFp4k-1777247772374.js` → HTTP 200 en prod ✅

### Estado final del JSON

- 280 docs · 140 líneas únicas · 0 nulls · 0 imm_ keys
- COETC (10): 36 · COME (20): 18 · CUTCSA (50): 206 · UCOT (70): 20
- `agencyId`: 100% string

---

**Última actualización:** 2026-04-26 (commit efe8ae81 — NavigationModule wire-up + 3 Cloud Functions desplegadas)

## ✅ SPRINT 1 — CERRADO (commit efe8ae81)

### Lo que se entregó en esta sesión (Code)

| Qué | Dónde | Estado |
|---|---|---|
| Wire-up NavigationModule → navigationDataService | `NavigationModule.tsx` líneas 33-36, 275, 307, 425, 525, 696 | ✅ En producción |
| Registro Cloud Functions en index.ts | `functions/src/index.ts` | ✅ En producción |
| Deploy hosting | https://ucot-gestor-cloud.web.app | ✅ |
| Deploy `gpsHistoryAccumulatorTick` | Cloud Functions us-central1 | ✅ Cron 60s activo |
| Deploy `shapeBuilderTick` | Cloud Functions us-central1 | ✅ Cron 1h activo |
| Deploy `shapeBuilderRun` | https://us-central1-ucot-gestor-cloud.cloudfunctions.net/shapeBuilderRun | ✅ HTTP disponible |

### Arquitectura activa en producción

```
NavigationModule
  └→ navigationDataService (wrapper, prioridad decreciente)
       1. shapes_cross_operator (oficial GPS-derived — se llenará en 24-72h)
       2. ucotShapesInjector (estático routeCache.json — 16 variantes UCOT YA funcionando)
       3. linesService legacy (fallback)

gpsHistoryAccumulatorTick (cron 60s)
  └→ gps_pings_raw (TTL 7 días)
       └→ shapeBuilderTick (cron 1h)
            └→ shapes_cross_operator/{agencyId}_{linea}_{variante}
```

### Estado del Navegador HOY

- **UCOT** (agencyId 70): 16 variantes (300a/b…396a/b) con shape + paradas geo — **funcionando vía ucotShapesInjector**.
- **CUTCSA / COME / COETC**: shapes llegarán via shapeBuilder en 24-72h cuando gpsHistoryAccumulator acumule suficientes pings.
- `shapeBuilderRun` corrió manualmente → `grupos: 259, shapesEscritos: 0` (normal, acumulador recién iniciado).

## 🎯 PRÓXIMO PASO INMEDIATO

### Opción A — Correr scraper Puppeteer para llenar shapes YA (no esperar 72h)

Requiere `GOOGLE_APPLICATION_CREDENTIALS` apuntando al serviceAccount de ucot-gestor-cloud:

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\serviceAccountKey.json"
node scripts/scrape_stm_oficial.cjs
```

⚠️ **ADVERTENCIA CRÍTICA antes de correr**: el scraper llama `inferirAgencyId()` que siempre retorna `null`. Eso significa que los docs se guardarán con `agencyId: null`, pero `navigationDataService.fetchShapesCrossOperator(50)` busca `where('agencyId', '==', '50')`. **Los docs del scraper NO serán encontrados por el nuevo wrapper**.

**Fix antes de correr el scraper** — editar `scripts/scrape_stm_oficial.cjs` línea 208:
Reemplazar `agencyId: agencyId ? String(agencyId) : null` por una lógica que asigne el agencyId correcto.
O más simple: después del scraper, correr un script de migración que cruce los doc IDs `imm_{linea}_{sentido}` contra la lista de líneas por empresa y actualice el campo `agencyId`.

### Opción B — Esperar 24-72h que gpsHistoryAccumulator + shapeBuilder lo hagan solos

El cron 60s ya está activo. En 24h debería haber suficientes pings para shapeBuilder.
Verificar con: `curl -X POST https://us-central1-ucot-gestor-cloud.cloudfunctions.net/shapeBuilderRun -H "Content-Type: application/json" -d "{}"` y ver si `shapesEscritos > 0`.

## 🗂️ BACKLOG PRIORIZADO

1. **Fix agencyId en scraper** — `scripts/scrape_stm_oficial.cjs:45` función `inferirAgencyId` retorna null. Completar con tabla de rangos de líneas por empresa o cross-merge con pings GPS.
2. **Verificación §12 completa** — Jonathan o Code debe abrir `/dashboard/traffic/navigation?cb=fix11` con SUPERADMIN, iterar CUTCSA/COME/COETC y confirmar >95% con shape. UCOT ya funciona.
3. **Sprint 2** — HeadwayInsights + GPSPlayback (archivos ya creados: `HeadwayInsights.tsx`, `GPSPlayback.tsx`, `headwayInsightsService.ts`, `gpsPlaybackService.ts` — pendientes de wire-up a rutas).
4. **Polish warn pre-auth** — `NavigationModule.tsx:~300` agregar guard `if (!user?.uid || !selectedCodigo) return;` para eliminar warn `[UCOT] Firestore offline para getLineaData`.
5. **Listeners Socket.io frontend** — incompletos.
6. **APK Android** — Capacitor configurado, pendiente generar.

## 🐛 BUGS CONOCIDOS NO CRÍTICOS

- **Warn pre-auth race** en NavigationModule: `[UCOT] Firestore offline para getLineaData: ...` aparece 1 vez por cambio de línea (no error, solo warn). Fallback funciona. Fix: guard `!user?.uid` en useEffect línea ~300.
- **Errores TS pre-existentes** en `cascadeEngineService.ts` y `scheduleComplianceEngine.ts` — no bloquean build (Vite usa esbuild), pero generan output en `npm run build`. No introducidos en esta sesión.

## 🔑 DECISIONES OPERATIVAS DE ESTA SESIÓN

- **shapeBuilderRun corrió sin shapes** (esperado): `gpsHistoryAccumulator` recién empezó, necesita acumular antes de que shapeBuilder tenga datos. Normal.
- **version.json**: el build script lo auto-regenera (ignora ediciones manuales). OK.
- **Scraper Puppeteer NO se corrió**: agencyId bug detectado antes de ejecutar. Evitó poblar Firestore con docs inútiles (agencyId null nunca matched). Bien.
