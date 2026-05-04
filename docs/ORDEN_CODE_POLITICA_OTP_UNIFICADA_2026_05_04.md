# ORDEN CODE — Política OTP unificada cross-módulos

**Fecha:** 2026-05-04 — post-demo CUTCSA
**Modelo recomendado:** Claude Opus (toca backend + frontend, hay decisiones de arquitectura)
**Severidad:** ALTA — riesgo de pérdida de credibilidad si CUTCSA u otro operador audita los números y encuentra módulos que devuelven cifras distintas para la misma operación.

---

## Por qué este trabajo

Cowork hizo QA cross-módulos en frontend (`frontend/src/pages/traffic/`) y backend (`functions/src/`) para verificar que TODOS los módulos calculen cumplimiento de la misma manera. Resultado: hay **5 inconsistencias reales** que pueden generar resultados distintos para la misma línea según en qué módulo se la mire.

Esto es bloqueante para acuerdos comerciales. Un solo número que no cuadra entre dos pantallas destruye credibilidad.

---

## Política única (canon — todos los módulos deben respetarla)

| Regla | Valor canónico | Fuente |
|---|---|---|
| Tolerancia EN_TIEMPO | **±4 min** | `autoStatsCollector.ts` L527 (`SNAP_TOL_MIN`), comentario *"TCRP 165 / IMM Uruguay"* |
| Definición EN_TIEMPO | `estado === 'EN_TIEMPO'` **OR** `\|desv\| ≤ 4` | Una pasada cuenta como en tiempo si **cualquiera** de las dos condiciones se cumple — coherencia con backend que ya marca el estado y con desviación numérica para casos límite. |
| Denominador OTP | `enTiempo + atrasado + adelantado` | Excluye `SIN_HORARIO` y `FUERA_DE_SERVICIO` del denominador. Estos no son "incumplimientos", son "no medibles". |
| Sentido | Lectura del evento (`sentido`) — **no recalcular en downstream** | El único módulo autorizado a calcular sentido es `autoStatsCollector.ts` (cron). Con el deploy de BRIDGE-028 (commit 299c7edb) ya usa cascada determinística destinoDesc → variante → terminal GTFS → bearing. |
| FUERA_DE_SERVICIO | Descartar SIEMPRE en lecturas de OTP/cumplimiento | Se preserva en eventos crudos para auditoría, pero ningún cálculo de % lo cuenta. |
| `confianzaSentido` | Persistir y respetar | Si el cálculo upstream produjo `confianzaSentido = ZERO`, el evento tiene `sentido = null` y se incluye en tabs IDA/VUELTA con caveat (no se duplica). |

---

## 5 fixes a aplicar

### Fix 1 — Frontend: `CumplimientoPorLineaPro.tsx` (BUG VISIBLE AL USUARIO)

**Path:** `frontend/src/pages/traffic/CumplimientoPorLineaPro.tsx`
**Línea:** 247 (función `resumenLineas` useMemo)

**Antes:**
```ts
const enT = conHorario.filter(e => e.estadoCumplimiento === 'EN_TIEMPO').length;
const atr = conHorario.filter(e => e.estadoCumplimiento === 'ATRASADO').length;
const adl = conHorario.filter(e => e.estadoCumplimiento === 'ADELANTADO').length;
```

**Después:**
```ts
// Política unificada: EN_TIEMPO = estado backend O desv en tolerancia ±4 min.
// (Coherente con auditoriaService.ts y SalidaTimelineModal.tsx)
const TOL_EN_TIEMPO_MIN = 4;
const inTime = (e: VehicleEvent) =>
  e.estadoCumplimiento === 'EN_TIEMPO' ||
  (typeof e.desviacionMin === 'number' && Math.abs(e.desviacionMin) <= TOL_EN_TIEMPO_MIN);

const enT = conHorario.filter(inTime).length;
// Atrasado: estado === ATRASADO Y desv > +4 (estricto, no se solapa con enT)
const atr = conHorario.filter(e =>
  e.estadoCumplimiento === 'ATRASADO' &&
  (typeof e.desviacionMin !== 'number' || e.desviacionMin > TOL_EN_TIEMPO_MIN)
).length;
// Adelantado: estado === ADELANTADO Y desv < -4
const adl = conHorario.filter(e =>
  e.estadoCumplimiento === 'ADELANTADO' &&
  (typeof e.desviacionMin !== 'number' || e.desviacionMin < -TOL_EN_TIEMPO_MIN)
).length;
```

**Por qué importa**: la fila resumen muestra `% en tiempo` de cada línea. Hoy un evento con `estado=ATRASADO` y `desv=2 min` cuenta como atrasado (subestima OTP). Con el fix, esos casos límite (eventos que el backend rotuló según una versión anterior del algoritmo, o que tienen desv pequeña) se cuentan como EN_TIEMPO — alineado con la auditoría detallada y con la suma 18%/18%/64% que vio Jonathan en L149.

---

### Fix 2 — Backend: `functions/src/etapaStatsTick.ts`

**Línea:** 25

**Antes:**
```ts
const EN_TIEMPO_TOL = 3;   // ±3 min = EN_TIEMPO
```

**Después:**
```ts
// Política unificada (docs/ORDEN_CODE_POLITICA_OTP_UNIFICADA_2026_05_04.md)
// Tolerancia ±4 min IMM/TCRP 165, alineada con autoStatsCollector.SNAP_TOL_MIN.
const EN_TIEMPO_TOL = 4;
```

**Por qué importa**: este cron agrega OTP por parada cada 30 min y guarda en `etapa_stats`. Con tolerancia distinta, el módulo "Análisis por Etapa" reportaba % distintos a "Por Línea". La diferencia se nota en líneas con buses ligeramente atrasados (3-4 min): etapa los rotulaba como atrasados, auditoría como en tiempo.

---

### Fix 3 — Backend: `functions/src/otpEngine.ts`

**Línea:** 150

**Antes:**
```ts
// tolerancia operativa estándar UITP
if (Math.abs(deviation) <= 3) ...
```

**Después:**
```ts
// Política unificada: tolerancia ±4 min IMM (TCRP 165 / IMM Uruguay).
// Alineada con autoStatsCollector y etapaStatsTick.
if (Math.abs(deviation) <= 4) ...
```

**Por qué importa**: este motor calcula OTP en tiempo real para varios consumidores (HRR, dashboards). Mantener una tolerancia distinta genera divergencia entre tiempo real y agregado.

---

### Fix 4 — Backend: `functions/src/api/autostats.ts`

**Línea:** 118 (endpoint `/api/autostats/compliance/:agencyId`)

**Antes:**
```ts
const pctCumplimiento = (enTiempo + adelantados) / busesActivos;
// busesActivos incluye TODOS los buses, también FUERA_DE_SERVICIO
```

**Después:**
```ts
// Política unificada: denominador excluye FUERA_DE_SERVICIO y SIN_HORARIO.
// OTP = enTiempo / (enTiempo + atrasado + adelantado).
// "adelantados" se cuenta como NO en tiempo (es un incumplimiento por adelanto).
const medibles = enTiempo + atrasado + adelantado;
const pctCumplimiento = medibles > 0 ? (enTiempo / medibles) : 0;
```

**Importante**: este cambio modifica el **contrato de `/api/autostats/compliance/:agencyId`**. Verificar que ningún consumidor del frontend dependa de la vieja semántica `(enT+adel)/busesActivos`. Buscar:
```bash
grep -rn "fetchComplianceRealtime" frontend/src --include="*.ts" --include="*.tsx"
```

---

### Fix 5 — Backend: `functions/src/marketPenetration.ts` y `vehicleStatsTick.ts` / `conductorStatsTick.ts`

**Cambio**: agregar filtro explícito de `FUERA_DE_SERVICIO` antes de los agregados.

`marketPenetration.ts` línea 92-95: snapshot de buses únicos por línea. Hoy cuenta también buses FUERA_DE_SERVICIO. Filtrarlos para que el "market share" refleje operación efectiva.

`vehicleStatsTick.ts` línea 115-117: agregado por bus. Documentar (comentario) que cuenta solo `EN_TIEMPO + ATRASADO + ADELANTADO` y verificar que el comportamiento ya es correcto. Si hay edge case con FUERA_DE_SERVICIO inflando totales, filtrarlo.

`conductorStatsTick.ts` línea 118-120: ídem vehicleStatsTick.

---

## Verificación post-deploy

### Frontend
1. Abrir `https://skillroute.web.app/dashboard/traffic/diagnostico-cumplimiento`.
2. UCOT, mirar L306 VUELTA en la fila resumen y en la auditoría detallada.
3. **Criterio**: `% EN TIEMPO` de la fila ≈ `% EN TIEMPO LÍNEA` de la cabecera de auditoría (±1% por redondeo).
4. Repetir con CUTCSA L149 y CUTCSA L21.

### Backend
```bash
# Trigger etapaStatsTick on-demand (si existe endpoint, sino esperar próximo cron)
curl https://us-central1-ucot-gestor-cloud.cloudfunctions.net/etapaStatsTickHttp

# Verificar que la tolerancia escrita en etapa_stats sea consistente
# (no hay forma directa, pero los % de etapa_stats ahora deben subir 1-3 puntos para líneas que tenían eventos en el rango 3-4 min)

# Verificar API contract
curl 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/api/autostats/compliance/70' | jq '.summary'
# Esperado: pctCumplimiento por línea ahora respeta la fórmula nueva
```

---

## No-regresión

Antes de cada commit:
- `npx tsc --noEmit --skipLibCheck` 0 errores
- `cd functions && npm run build` 0 errores
- `bash scripts/check_integrity.sh` exit 0 (desde Code, no Cowork)
- Tests de Vitest pasan
- Verificación visual: ShadowRadar, CartonManager, FleetMonitor renderizan sin errores
- L306 VUELTA en CumplimientoHub: % de fila resumen ↔ % de auditoría coinciden (±1%)

---

## Casos de prueba (recomendados, opcional pero ideal)

```ts
// Frontend: CumplimientoPorLineaPro inTime
expect(inTime({ estadoCumplimiento: 'EN_TIEMPO', desviacionMin: 0 })).toBe(true);
expect(inTime({ estadoCumplimiento: 'ATRASADO', desviacionMin: 2 })).toBe(true); // dentro de tolerancia
expect(inTime({ estadoCumplimiento: 'ATRASADO', desviacionMin: 5 })).toBe(false);
expect(inTime({ estadoCumplimiento: 'EN_TIEMPO', desviacionMin: 6 })).toBe(true); // backend manda
expect(inTime({ estadoCumplimiento: 'SIN_HORARIO', desviacionMin: null })).toBe(false);

// Backend: api/autostats compliance fórmula
const summary = { enTiempo: 60, adelantado: 10, atrasado: 20, sinHorario: 5, fueraServicio: 5 };
const pct = (60) / (60 + 10 + 20); // = 0.667
// busesActivos sería 100, vieja fórmula daría (60+10)/100 = 0.70 — distinto.
```

---

## Documentar política

Crear `docs/POLITICA_OTP_UNIFICADA.md` con:
- La tabla de reglas canónicas (de la sección "Política única" arriba).
- Tabla de módulos que tocan OTP y cuál es su rol (escritor/lector/agregador).
- Sección "Si agregás un módulo nuevo, validá lo siguiente" con la checklist.

Esto previene regresiones futuras: cualquier persona que agregue un módulo nuevo lee este doc y sabe qué tolerancia usar.

---

## Acción Code

Orden sugerido:
1. **Frontend Fix 1** primero (más visible al usuario).
2. **Backend Fix 2, 3, 4** en mismo commit (todos tocan tolerancia/fórmula).
3. **Backend Fix 5** en commit separado (refactor menor, sin urgencia comercial).
4. **Documentar política** en último commit.

```powershell
# Fix 1 (frontend)
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\frontend
# editar CumplimientoPorLineaPro.tsx línea 247
npx tsc --noEmit --skipLibCheck
npm run build
cd ..

# Fix 2-4 (backend)
cd functions
# editar etapaStatsTick.ts L25, otpEngine.ts L150, api/autostats.ts L118
npm run build
cd ..

# Deploy
firebase deploy --only hosting,functions:autoStatsCollector,functions:etapaStatsTick,functions:otpEngine,functions:api --project ucot-gestor-cloud
curl https://skillroute.web.app/version.json

# Backfill etapa_stats: trigger manual del cron etapaStatsTick para reprocesar últimas 24h con la nueva tolerancia
curl -X POST 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/etapaStatsTickHttp?hours=24'
# (si no existe, esperar 30 min para que el cron próximo lo ejecute)

# Commit
git add frontend/src/pages/traffic/CumplimientoPorLineaPro.tsx `
        functions/src/etapaStatsTick.ts `
        functions/src/otpEngine.ts `
        functions/src/api/autostats.ts `
        functions/src/marketPenetration.ts `
        functions/src/vehicleStatsTick.ts `
        functions/src/conductorStatsTick.ts `
        docs/ORDEN_CODE_POLITICA_OTP_UNIFICADA_2026_05_04.md `
        docs/POLITICA_OTP_UNIFICADA.md `
        cowork-tools/bridge/inbox.md

git commit -m "fix(otp): unificar politica de cumplimiento cross-modulos (5 fixes)

Frontend:
- CumplimientoPorLineaPro: pctEnTiempo usa estado backend O |desv|<=4
  (alineado con auditoriaService) — resuelve discrepancia de % entre fila
  resumen y auditoria detallada.

Backend:
- etapaStatsTick: tolerancia ±3 -> ±4 min (estandar IMM/TCRP 165).
- otpEngine: tolerancia ±3 -> ±4 min (mismo).
- api/autostats compliance endpoint: denominador OTP excluye
  FUERA_DE_SERVICIO (regla unificada). Antes: (enT+adel)/busesActivos.
  Ahora: enT/(enT+atras+adel).
- marketPenetration + vehicleStatsTick + conductorStatsTick:
  filtrar/documentar FUERA_DE_SERVICIO.

Politica documentada en docs/POLITICA_OTP_UNIFICADA.md para prevenir
regresiones futuras.

No-regresion §11: tsc 0 errores, tests pasan, 3 modulos pre-existentes
verificados.

Refs: docs/ORDEN_CODE_POLITICA_OTP_UNIFICADA_2026_05_04.md"

git push origin main
```

Reportar DONE en bridge con:
- Commit hash
- buildId post-deploy
- Diferencia observada en `% en tiempo` antes/después para L306 VUELTA UCOT (esperada: 1-3 pts más alto por reasignación de eventos atrasados leves a EN_TIEMPO).
- Confirmación de que `etapa_stats` se reprocesó (o hora del próximo cron).
