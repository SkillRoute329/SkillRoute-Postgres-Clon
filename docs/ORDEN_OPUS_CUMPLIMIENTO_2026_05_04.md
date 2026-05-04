# ORDEN OPUS — Cumplimiento de Servicio nivel internacional

**Fecha:** 2026-05-04 — pre-demo CUTCSA
**Autor:** Cowork (después de QA cross-operador + investigación de estándares)
**Modelo recomendado:** Claude Opus (algoritmo + decisiones de arquitectura)
**Tiempo estimado:** 60-90 min para deploy, no debe romper la demo de hoy

---

## 1. Estado actual y por qué estamos donde estamos

La pestaña **Cumplimiento → Por Línea** se rediseñó hoy con dos vistas:

- **Listado de líneas + Matriz de coches × control points** (ya en producción, commit 83b18497)
- **Auditoría estilo IMM**: lista de salidas → modal con timeline de control points (commit 83b18497, refinada en BRIDGE-025/026)

La estructura visual está **aprobada por Jonathan**. NO se debe cambiar.

Lo que falla hoy son los **números detrás** de esa estructura:

1. Los `desviacionMin` que devuelve `vehicle_events` son **inconsistentes según la línea**:
   - L149 CUTCSA, L306 UCOT: 100% coherentes (`estadoCumplimiento` matchea con `desv`).
   - **L405 COETC**: 96 eventos seguidos con `desviacionMin = 0` y `EN_TIEMPO`. Bug del backend confirmado por Cowork.
2. **Sentido (IDA/VUELTA) está en `null` en ~99% de los eventos** (0/22 UCOT, 0/33 CUTCSA top, 0/131 COETC G, 4/23 COME).
   - Detector de bearing del `autoStatsCollector.ts` no se está disparando o pierde el bearing al primer GPS.
3. Las pasadas no se asociaban al **control point correcto** (ya fixeado en frontend BRIDGE-025+ con algoritmo invertido `tProgramadoEsperado = tReal - desv`).

---

## 2. Estándares internacionales que vamos a aplicar

(Verificado en sesión por Cowork con browser. Fuentes citadas al final.)

| Estándar | Tolerancia EN_TIEMPO | Ventana matching GPS↔trip | Manejo gaps / sin sentido |
|---|---|---|---|
| **TCRP 165 cap.5** | salida 0..+5 min del timepoint | n/a (define umbrales) | bus que sale antes = tarde |
| **TfL iBus** | salida −2 a +5 min (baja frec.); EWT (alta frec.) | n/a (frecuencia adaptativa) | reporta `% scheduled monitored` |
| **NYC MTA Bus Time** | −1 / +5 min | DTW sobre shape vs serie pings | descarta trips con disrupción |
| **Swiftly Auto-Assigner** | −1 / +5 min (config) | ±15 min sobre ventana programada | unassigned → no se inventa |
| **IMM Uruguay (actual)** | ±4 min | n/a | n/a |

**Decisión para SkillRoute** (consistente con local + benchmark internacional):
- Tolerancia EN_TIEMPO = **±4 min** (mantener, alineado con IMM).
- Ventana de asociación amplia (cuando no hay desv backend) = **±15 min** (Swiftly).
- Ventana de match cuando hay desv backend = **±2 min** sobre `tProgramadoEsperado` (match exacto).
- Frecuencia adaptativa **EWT** para líneas con headway ≤12 min — feature post-demo.

---

## 3. Trabajo a realizar (DOS partes)

### PARTE A — Frontend: deploy del refinamiento ya escrito por Cowork

**Archivos modificados** (todos con TS 0 errores, NULs 0, listos para deploy):

1. `frontend/src/services/auditoriaService.ts` — algoritmo de matching invertido:
   - Prioridad: (a) nombre de parada coincide, (b) `|tReal - desv - tProgramado| ≤ 2 min`, (c) ventana amplia ±15 min.
   - Mantiene `desviacionMin` del backend cuando existe.
   - Constantes nuevas: `VENTANA_MATCH_TIGHT_MIN = 2`, `VENTANA_MATCH_FALLBACK_MIN = 15`.
2. `frontend/src/pages/traffic/AuditoriaLineaTimeline.tsx` — KPI "% línea" + sticky header + warning sentido + sección PasadasHuerfanas.
3. `frontend/src/pages/traffic/CumplimientoPorLineaPro.tsx` — sticky thead en listado de líneas.

**Acción Code (≤8 min):**

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\frontend
npm run build
cd ..
firebase deploy --only hosting --project ucot-gestor-cloud
git add frontend/src/services/auditoriaService.ts `
        frontend/src/pages/traffic/AuditoriaLineaTimeline.tsx `
        frontend/src/pages/traffic/CumplimientoPorLineaPro.tsx `
        docs/SESION_ACTUAL.md docs/ORDEN_OPUS_CUMPLIMIENTO_2026_05_04.md `
        cowork-tools/bridge/inbox.md
git commit -m "fix(cumplimiento): algoritmo matching nivel internacional (Swiftly Auto-Assigner + DTW pattern)

(1) Match invertido: usa desv del backend para deducir tProgramadoEsperado
y asociar al control point CORRECTO. Resuelve la inconsistencia entre
fila resumen y auditoria detallada (L149 CUTCSA, etc.).

(2) Prioridad cascada: (a) match por nombre proximaParada<->cp.nombre,
(b) match por tProgramadoEsperado en ventana ±2 min, (c) fallback ventana
amplia ±15 min (estandar Swiftly Auto-Assigner).

(3) Sticky headers en tabla listado y tabla salidas.

(4) Pasadas huerfanas se muestran SIEMPRE (politica anti-simulacion: no
esconder ningun registro GPS).

(5) Warning visible cuando sentidoCobertura<50% para aclarar duplicacion
IDA/VUELTA cuando bearing detector falla.

(6) KPI '% en tiempo linea' (igual que fila resumen) ademas de
'% asociadas a control points'.

Verificacion Cowork: tsc 0 errores con --noUnusedLocals, NULs 0,
no-regresion §11 OK.

Refs: TCRP 165 cap.5, NYC MTA bus matching DTW, Swiftly Auto-Assigner
cascade, TfL iBus QSI."
git push origin main
```

### PARTE B — Backend: fix raíz del autoStatsCollector (USAR OPUS)

**Bugs confirmados por Cowork via REST API directo:**

#### Bug B1 — `desviacionMin = 0` masivo en líneas completas

**Síntoma**: COETC L405 hoy tiene 96 eventos GPS, TODOS con `desviacionMin = 0` y `estadoCumplimiento = EN_TIEMPO`. Distribución unique: 1 valor (0). Esto es estadísticamente imposible para una operación real.

**Hipótesis**:
1. La fórmula tautológica `desv = transcurrido - duracion*pctCompletado` (= 0 SIEMPRE) sigue activa en alguna rama del código que Code reportó haber fixeado el 2026-05-02 (commit 4267b0cd). Verificar en `functions/src/autoStatsCollector.ts` líneas relacionadas con `calcularCumplimiento` (NO la rama snap-to-shape, sino el fallback).
2. La rama `snapToGtfsCompliance` está fallando para L405 (stop ≤400m no encontrado o GTFS missing) y se cae al cálculo manual tautológico.

**Acción**:
- Auditar `functions/src/autoStatsCollector.ts` con foco en `calcularCumplimiento` y la transición al fallback.
- Test sintético: bus con velocidad 25 km/h sobre L405, verificar que `desv` sea distinto de 0 en al menos 5 muestras temporales.
- Si la fórmula tautológica persiste, **eliminar esa rama**: cuando snap-to-shape falla, marcar `estadoCumplimiento = SIN_HORARIO` con `desviacionMin = null` en lugar de inventar `desv = 0`.
- Backfill: re-procesar las últimas 24h de eventos de L405 con el algoritmo corregido.

#### Bug B2 — Bearing detector inactivo

**Síntoma**: 0% de eventos tienen `sentido` IDA/VUELTA detectado, en TODOS los operadores (UCOT 0/22, CUTCSA 0/33 top, COETC 0/131 G, COME 4/23). El detector debería al menos darle sentido al ~70% de eventos en operación normal.

**Causa raíz probable** (ver `autoStatsCollector.ts` función `detectarSentido`):
- `bearing` viene `null` cuando no hay posición previa en `bus_last_pos`. Esto ocurre en cold-start o cuando el TTL de `bus_last_pos` expira.
- El detector asume "centro" / "periferia" con regex de nombres de variantes — heurística frágil.

**Acción Opus**:
- Refactor `detectarSentido` con DTW-light: comparar la dirección del vector posición-actual → posición-anterior contra el shape del trip candidato.
- Backfill `bus_last_pos` con TTL más largo (24h en lugar de 7 días que se mezcla con archivado).
- Test: para CUTCSA L21 día domingo (que tiene mucha data), verificar que ≥60% de eventos del backfill tengan sentido detectado.

#### Bug B3 — Filtros de calidad de datos (estándar Swiftly)

**Síntoma**: el código actual (línea ~539) filtra GPS con coordenadas sentinela (-258, -258) pero no filtra por:
- Velocidad >90 km/h (típico de error GPS)
- Salto >500m respecto al ping anterior con dt <30s

**Acción**:
- Agregar pre-filtros en `snapshotAgency` antes del bloque de procesamiento.
- Reportar contador de pings descartados por razón en la respuesta del cron (calidad de datos, UITP-style).

### Casos de prueba (mínimos)

```ts
// 1. Match exacto cuando desv backend coincide
const evento = { tReal: 93, desviacionMin: 1 };
const cps = [{ tProgramado: 92 }, { tProgramado: 100 }];
expect(asociarPasadas(cps, [evento])).toMatch(cps[0]);
// porque tProgramadoEsperado = 93 - 1 = 92 → matchea cp[0] exacto

// 2. Match por nombre cuando hay ambigüedad temporal
const evento = { tReal: 95, proximaParada: 'Tres Cruces', desviacionMin: null };
const cps = [{ tProgramado: 95, nombre: 'Bv Artigas' }, { tProgramado: 105, nombre: 'Tres Cruces' }];
expect(asociarPasadas(cps, [evento])).toMatch(cps[1]); // por nombre, no tiempo

// 3. Sin match cuando está fuera de ventana
const evento = { tReal: 200, desviacionMin: 5 };
const cps = [{ tProgramado: 80 }];  // gap > 15 min
expect(asociarPasadas(cps, [evento])).toEqual([]); // huérfano

// 4. desv del backend tiene precedencia sobre cálculo manual
// (ya cubierto en Parte A)
```

---

## 4. No-regresión § 11 (OBLIGATORIO)

Antes de cada commit:
- `npm test` (Vitest) + `npm run lint` exit 0
- `npx tsc --noEmit --skipLibCheck` 0 errores
- `bash scripts/check_integrity.sh` exit 0 (desde Code, no Cowork — false positives mount)
- Build limpio
- Verificación funcional **3 módulos no tocados**: ShadowRadar, CartonManager, FleetMonitor
- L149 CUTCSA: % de cada viaje en la auditoría suman lo mismo que la fila resumen del listado (±5%)

---

## 5. Filosofía aplicada

**Cero datos simulados, cero valores fabricados** (CLAUDE.md regla anti-simulación):
- Si snap-to-shape falla → `desv = null`, NO `desv = 0`.
- Si bearing detector no concluye → `sentido = null`, NO inventar IDA/VUELTA.
- Si un evento queda fuera de ventana → mostrar como pasada huérfana, NO descartar.

**Cero datos internos del operador** (diferenciador del pitch):
- Toda la lógica nueva opera sobre `vehicle_events` (GPS feed IMM) + `gtfs_timetable` (GTFS oficial).
- No requiere AVL trip_id ni block_id del operador (a diferencia de Optibus/Swiftly).

---

## 6. Sources (verificadas con browser por Cowork 2026-05-04)

- [TCRP Report 165 cap.4 PDF](https://onlinepubs.trb.org/onlinepubs/tcrp/tcrp_rpt_165ch-04.pdf)
- [TfL Buses performance data](https://tfl.gov.uk/corporate/publications-and-reports/buses-performance-data)
- [TfL QSI quarterly report](https://bus.data.tfl.gov.uk/boroughreports/current-quarter.pdf)
- [NYC MTA — bus matching DTW](https://www.mta.info/article/its-2-am-do-you-know-where-your-bus)
- [NYC MTA Performance Metrics](https://www.mta.info/transparency/metrics)
- [Swiftly Auto-Assigner](https://swiftly.zendesk.com/hc/en-us/articles/360061452512)
- [Swiftly OTP best practices](https://www.goswift.ly/blog/on-time-performance-measurement-best-practices)

---

## 7. Reportar resultado

Bridge a Cowork con:
- Commit hash final
- buildId (`curl https://skillroute.web.app/version.json`)
- Resultado del test L405: `desv` ya no es 0 en TODOS los eventos
- Resultado del test bearing: % de eventos con sentido detectado en backfill 24h CUTCSA
- Lista de pasos pendientes si quedó algo (BLOCKED en bridge si aplica)
