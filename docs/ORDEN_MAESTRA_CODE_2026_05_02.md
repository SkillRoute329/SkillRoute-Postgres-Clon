# 🚨 ORDEN MAESTRA PARA CLAUDE CODE — Sprint Pre-Demo Lunes 2026-05-04

> **Contexto urgente**: Jonathan presenta SkillRoute el lunes (probable CUTCSA). El sistema parece "desconectado" porque hay una serie de bugs en cadena que **se solucionan en una sola sesión**. Cowork dejó todo el diagnóstico hecho y los archivos chicos editados. Esta orden contiene el resto, en orden estricto de ejecución.
>
> **NO ROMPER NADA QUE YA FUNCIONA.** Se aplica Regla §11 No-Regresión a cada commit. Build limpio + integrity script + verificación funcional ANTES de pushear.
>
> **Tiempo estimado total**: 3–5 horas. Empezar por P0 — sin eso el dashboard sigue vacío.

---

## 🗺️ Mapa de prioridades

| Bloque | Item | Prioridad | Tiempo | Verificación |
|---|---|---|---|---|
| **P0** | A. Build + deploy del fix `VITE_API_URL` | Demo killer | 10 min | Dashboard muestra 66 buses UCOT |
| **P0** | B. Fix bug matemático `desviacionMin = 0` siempre | Demo killer | 30 min | OTP ya no dice 100% en todo |
| **P1** | C. Filtrar GPS basura (lat/lon imposibles) | Visible | 10 min | No más `lat: -258` en payload |
| **P1** | D. Activar cron `stmHorariosScraperTick` | Calidad | 20 min | Más líneas con horarios reales |
| **P1** | E. Activar cron `dailyOtpAggregator` (nuevo) | Histórico | 45 min | `otp_daily` se llena cada noche |
| **P2** | F. Verificación funcional módulo por módulo | Demo | 30 min | Capturas en bridge |
| **P2** | G. Vista "Motor de Consecuencias" mínima visible | Demo | 60 min | `/motor-consecuencias` muestra cascadas |
| **P3** | H. Refactor 11 URLs hardcodeadas | Post-lunes | — | — |

---

## ▶️ P0-A · Build + deploy del fix `VITE_API_URL` (HACER PRIMERO)

**Cowork ya editó** `frontend/.env.production` cambiando:
```
VITE_API_URL=https://ucot-gestor-cloud.web.app/api → https://skillroute.web.app/api
```

Sin esto, los módulos Cumplimiento/Ranking/OTP/Puntualidad siguen mostrando "Datos no disponibles" porque el servicio `frontend/src/services/autoStatsService.ts:4` usa esta variable.

### Comandos exactos

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\frontend
npm run build
cd ..
firebase deploy --only hosting:skillroute
```

### Verificación obligatoria post-deploy

```powershell
# Browser: abrir con Ctrl+Shift+R (limpiar cache)
start https://skillroute.web.app/dashboard/traffic/diagnostico-cumplimiento

# Curl verifica que la URL nueva resuelve (debe ser status: UP)
curl -sS "https://skillroute.web.app/api/autostats/health"
curl -sS "https://skillroute.web.app/api/autostats/compliance/70" | python -c "import json,sys; d=json.load(sys.stdin); print('UCOT buses:',d['totalBuses'])"
```

**Criterio de éxito**: el dashboard de Cumplimiento muestra ~66 coches UCOT, ~476 CUTCSA, ~43 COME, ~114 COETC. **Sin** banner rojo "Los datos en tiempo real no están disponibles".

Si después del deploy aún ves el banner rojo: hard reload (Ctrl+Shift+Delete en Chrome → "Cached images and files"). El service worker viejo cachea bundle con la URL vieja.

---

## ▶️ P0-B · Fix bug matemático en `calcularCumplimiento` — TODOS los buses dan EN_TIEMPO 100%

### Diagnóstico

El endpoint `/api/autostats/compliance/70` devuelve **66 buses todos `EN_TIEMPO` con `desviacionMin: 0`**, lo cual es estadísticamente imposible (paro UCOT, congestión, etc.) y viola la Regla Anti-Simulación del CLAUDE.md.

**Causa raíz**: en `functions/src/autoStatsCollector.ts:230-231`:

```typescript
const tiempoEsperado = Math.round(duracion * pctCompletado);
desviacionMin = transcurrido - tiempoEsperado;
```

Pero `pctCompletado = transcurrido / duracion`, entonces:
- `tiempoEsperado = duracion * (transcurrido/duracion) = transcurrido`
- `desviacionMin = transcurrido - transcurrido = 0`

**Es matemáticamente siempre 0 por construcción.** La intención era comparar progreso geográfico real vs tiempo programado, pero no hay snap-to-shape implementado todavía. Por eso todos los buses caen en `EN_TIEMPO desviacionMin: 0`.

### Fix exacto a aplicar

Editar `functions/src/autoStatsCollector.ts` cerca de la línea 226-250.

**ANTES** (líneas 226-250):

```typescript
  let desviacionMin: number | null = null;
  let state: ComplianceState;

  // Calcular desviación real en minutos respecto a la progresión esperada
  const tiempoEsperado = Math.round(duracion * pctCompletado);
  desviacionMin = transcurrido - tiempoEsperado;

  if (pctCompletado > 1.2) {
    // Superó ampliamente el tiempo previsto → atrasado estructural
    state = 'ATRASADO';
    desviacionMin = Math.round(nMin - haciaMin);
  } else if (pctCompletado < -0.1) {
    // Salió antes de lo programado
    state = 'ADELANTADO';
    desviacionMin = Math.round(desdeMin - nMin);
  } else if (desviacionMin > 5) {
    // Más de 5 minutos de atraso respecto a la progresión esperada
    state = 'ATRASADO';
  } else if (desviacionMin < -3) {
    state = 'ADELANTADO';
  } else {
    // En ventana normal (±5 min) — incluye paradas en terminales/semáforos
    state = 'EN_TIEMPO';
    desviacionMin = Math.max(0, desviacionMin);
  }
```

**DESPUÉS** (reemplazar todo el bloque por):

```typescript
  // SkillRoute aún no implementa snap-to-shape (progreso geográfico real del bus
  // contra el shape de la ruta). Sin eso, no podemos comparar "% de ruta recorrida"
  // vs "% de tiempo del servicio transcurrido", que es la única forma honesta de
  // calcular OTP en vivo. Por ahora reportamos los casos detectables:
  //   - ATRASADO: bus excedió el horario máximo del servicio (hacia < ahora)
  //   - ADELANTADO: el servicio aún no debería haber salido
  //   - SIN_HORARIO: bus en ruta dentro de la ventana programada → no podemos
  //     afirmar si está EN_TIEMPO sin progreso geográfico. Reportamos honestamente.
  // Cuando se implemente snap-to-shape (backlog post-lunes), volver a habilitar
  // EN_TIEMPO basado en `% recorrido geográfico` vs `% tiempo transcurrido`.
  let desviacionMin: number | null = null;
  let state: ComplianceState;

  if (pctCompletado > 1.2) {
    state = 'ATRASADO';
    desviacionMin = Math.round(nMin - haciaMin);
  } else if (pctCompletado < -0.1) {
    state = 'ADELANTADO';
    desviacionMin = Math.round(desdeMin - nMin);
  } else if (velocidad < 2 && transcurrido > duracion * 0.7) {
    // Bus parado, ya transcurrió >70% del tiempo del servicio → probablemente atascado
    state = 'ATRASADO';
    desviacionMin = Math.round(transcurrido - duracion * 0.7);
  } else {
    // Dentro de la ventana programada, sin métrica geográfica para confirmar:
    // reportar SIN_HORARIO (honesto) en vez de inventar EN_TIEMPO 100%.
    state = 'SIN_HORARIO';
    desviacionMin = null;
  }
```

### Build + deploy

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\functions
npm run build
cd ..
firebase deploy --only functions:autoStatsCollectorTick,functions:autoStatsCollectorNow,functions:intelligenceApi
```

### Verificación

```powershell
# Forzar nueva colecta y leer
curl -sS https://us-central1-ucot-gestor-cloud.cloudfunctions.net/autoStatsCollectorNow -m 90

# Esperar 30 segundos y consultar
Start-Sleep 30
curl -sS "https://skillroute.web.app/api/autostats/compliance/70" | python -c "import json,sys; d=json.load(sys.stdin); s=d['summary']; print('linea | enTiempo | atrasados | adelantados | sinHorario'); [print(f\"{k} | {v['enTiempo']} | {v['atrasados']} | {v['adelantados']} | {v['sinHorario']}\") for k,v in s.items()]"
```

**Criterio de éxito**: ya no aparecen líneas con `enTiempo:5, atrasados:0, adelantados:0, sinHorario:0`. La mayoría debería caer en `sinHorario` (porque no hay snap-to-shape) y algunas en `ATRASADO` o `ADELANTADO` cuando el bus excedió la ventana.

Esto es **mejor** para la demo porque es honesto. Decirle al ingeniero CUTCSA "marcamos SIN_HORARIO cuando no podemos calcular OTP real con datos GPS solos — el OTP real requiere fusionar GPS + shapes que ya tenemos en `corridor_overlap`. Snap-to-shape es backlog v2".

---

## ▶️ P1-C · Filtrar GPS basura (coordenadas imposibles)

### Diagnóstico

En la respuesta actual hay buses con coordenadas imposibles que se escriben a `vehicle_events`:

```json
{ "idBus": "33",  "linea": "306", "lat": -258.02588, "lon": -258.02588 }
{ "idBus": "115", "linea": "329", "lat": -258.02588, "lon": -258.02588 }
```

Latitud válida: -90 a 90. Longitud válida: -180 a 180. Los `-258` rompen mapas y cálculos DRO.

### Fix exacto

Editar `functions/src/autoStatsCollector.ts` línea ~304-307.

**ANTES**:
```typescript
  for (const feat of features) {
    const p = feat.properties;
    if (!p?.codigoBus || !p?.linea) continue;
    const [lon, lat] = feat.geometry.coordinates;
    const velocidad = p.velocidad ?? 0;
    const idBus = String(p.codigoBus);
```

**DESPUÉS**:
```typescript
  for (const feat of features) {
    const p = feat.properties;
    if (!p?.codigoBus || !p?.linea) continue;
    const [lon, lat] = feat.geometry.coordinates;
    // Validar rango GPS antes de procesar — STM a veces devuelve coordenadas
    // sentinela para buses sin fix válido (ej. -258, -258).
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      console.warn(`[AutoStats] GPS inválido descartado: bus ${p.codigoBus} (${lat},${lon})`);
      continue;
    }
    // Montevideo está en lat ∈ [-35.0, -34.5], lon ∈ [-56.5, -55.5]. Filtramos
    // coordenadas que están claramente fuera del país.
    if (lat > -30 || lat < -36 || lon > -53 || lon < -58) {
      console.warn(`[AutoStats] GPS fuera de Uruguay descartado: bus ${p.codigoBus} (${lat},${lon})`);
      continue;
    }
    const velocidad = p.velocidad ?? 0;
    const idBus = String(p.codigoBus);
```

### Build + deploy: junto con P0-B en mismo commit. Verificación:

```powershell
curl -sS "https://skillroute.web.app/api/autostats/compliance/70" | python -c "import json,sys; d=json.load(sys.stdin); bad=[b for b in d['buses'] if abs(b['lat'])>90 or abs(b['lon'])>180]; print('GPS basura:', len(bad))"
```

**Criterio**: salida `GPS basura: 0`.

---

## ▶️ P1-D · Activar cron `stmHorariosScraperTick` (no existe — crearlo)

### Diagnóstico

El archivo `functions/src/stmHorariosScraper.ts` tiene la función `fetchLineSchedule()` que scrapea horarios reales por línea desde STM, pero **no hay cron** que la corra periódicamente. Por eso `horarios_stm` está parcial y muchas líneas caen en `SIN_HORARIO` (ahora más honesto, gracias a P0-B).

Para la demo: queremos llenar `horarios_stm` antes del lunes con TODAS las líneas activas detectadas en `vehicle_events` de los últimos 7 días.

### Implementación

Crear archivo nuevo `functions/src/stmHorariosScraperTick.ts`:

```typescript
/**
 * stmHorariosScraperTick — refresh periódico de horarios STM
 * Cron: cada 24h. Scrapea horarios de todas las líneas que aparecen en
 * vehicle_events los últimos 7 días, las que tienen horarios desactualizados,
 * y las nuevas detectadas.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { fetchLineSchedule } from './stmHorariosScraper';

async function refreshAllSchedules(): Promise<{ refreshed: number; failed: number; lineas: string[] }> {
  const db = getFirestore();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Líneas vistas en GPS los últimos 7 días
  const snap = await db.collection('vehicle_events')
    .where('timestampGPS', '>=', since)
    .select('linea')
    .limit(50000)
    .get();

  const lineasActivas = new Set<string>();
  snap.docs.forEach(d => {
    const l = d.data().linea;
    if (l && typeof l === 'string') lineasActivas.add(l);
  });

  const result = { refreshed: 0, failed: 0, lineas: [] as string[] };

  // Limitar a 50 líneas por tick para no exceder timeout
  const lineasArr = Array.from(lineasActivas).slice(0, 50);

  for (const linea of lineasArr) {
    try {
      const horario = await fetchLineSchedule(linea);
      if (horario) {
        await db.collection('horarios_stm').doc(linea).set({
          ...horario,
          linea,
          actualizadoEn: FieldValue.serverTimestamp(),
          fuente: 'stmHorariosScraperTick',
        }, { merge: true });
        result.refreshed++;
        result.lineas.push(linea);
      } else {
        result.failed++;
      }
    } catch (e: any) {
      console.warn(`[stmHorariosScraper] ${linea} falló:`, e?.message);
      result.failed++;
    }
  }

  return result;
}

export const stmHorariosScraperTick = onSchedule(
  { schedule: 'every 24 hours', timeZone: 'America/Montevideo', timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const r = await refreshAllSchedules();
    console.log('[stmHorariosScraperTick]', JSON.stringify(r));
  }
);

export const stmHorariosScraperNow = onRequest(
  { timeoutSeconds: 540, memory: '512MiB' },
  async (_req, res) => {
    try {
      const r = await refreshAllSchedules();
      res.json({ ok: true, ...r });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message });
    }
  }
);
```

Agregar en `functions/src/index.ts` (cerca de los demás exports, ej. después de `autoStatsCollectorTick`):

```typescript
export { stmHorariosScraperTick, stmHorariosScraperNow } from './stmHorariosScraperTick';
```

### Build + deploy + ejecución manual antes del lunes

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\functions
npm run build
cd ..
firebase deploy --only functions:stmHorariosScraperTick,functions:stmHorariosScraperNow

# Forzar ejecución inmediata para llenar horarios antes del lunes
curl -sS https://us-central1-ucot-gestor-cloud.cloudfunctions.net/stmHorariosScraperNow -m 540
```

### Verificación

```powershell
# Contar líneas con horarios después del refresh
curl -sS "https://skillroute.web.app/api/autostats/agencies" | python -c "import json,sys; d=json.load(sys.stdin); print('agencias:',len(d['agencies'])); [print(a['name'], 'rutas:', len(a['routes'])) for a in d['agencies']]"
```

**Criterio**: después de correr el manual, `horarios_stm` debe tener al menos 50 documentos (uno por línea activa).

---

## ▶️ P1-E · Crear `dailyOtpAggregator` — para que `otp_daily` se llene automáticamente

### Diagnóstico

`historicMetrics.ts` exporta endpoints HTTP `historicOtp` y `historicBunching`, pero **no hay cron que escriba a las colecciones que esos endpoints leen** (`otp_daily`, `bunching_daily`). Por eso los gráficos históricos en el dashboard muestran datos vacíos o sintéticos.

### Implementación

Crear `functions/src/dailyAggregator.ts`:

```typescript
/**
 * dailyAggregator — snapshot diario de KPIs operativos
 * Corre cada noche a las 23:55 y agrega:
 *   - otp_daily/{fecha}_{empresa}_{linea}      → cumplimiento por línea
 *   - bunching_daily/{fecha}_{empresa}_{linea} → eventos de aglomeración
 *   - seatkm_daily/{fecha}_{empresa}_{linea}   → seat-km producidos
 *
 * Estas colecciones alimentan dashboards históricos, pitch a CUTCSA,
 * y futuros reportes regulatorios.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const AGENCIES = { '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT' } as const;

interface DailyOtpResult { date: string; agencyId: string; empresa: string; linea: string;
  totalEventos: number; busesUnicos: number; pctEnTiempo: number; pctAtrasado: number;
  pctAdelantado: number; pctSinHorario: number; desviacionMediaMin: number | null;
  velocidadMedia: number; }

async function aggregateDate(date: string): Promise<{ written: number }> {
  const db = getFirestore();
  const start = `${date}T00:00:00.000Z`;
  const end   = `${date}T23:59:59.999Z`;
  let written = 0;

  for (const [agencyId, empresa] of Object.entries(AGENCIES)) {
    const snap = await db.collection('vehicle_events')
      .where('agencyId', '==', agencyId)
      .where('timestampGPS', '>=', start)
      .where('timestampGPS', '<=', end)
      .limit(50000)
      .get();

    if (snap.empty) continue;

    // Agrupar por línea
    const porLinea = new Map<string, any[]>();
    snap.docs.forEach(d => {
      const ev = d.data();
      const arr = porLinea.get(ev.linea) ?? [];
      arr.push(ev);
      porLinea.set(ev.linea, arr);
    });

    for (const [linea, eventos] of porLinea) {
      const total = eventos.length;
      const enTiempo = eventos.filter(e => e.estadoCumplimiento === 'EN_TIEMPO').length;
      const atrasado = eventos.filter(e => e.estadoCumplimiento === 'ATRASADO').length;
      const adelantado = eventos.filter(e => e.estadoCumplimiento === 'ADELANTADO').length;
      const sinHorario = eventos.filter(e => e.estadoCumplimiento === 'SIN_HORARIO').length;
      const busesUnicos = new Set(eventos.map(e => e.idBus)).size;

      const desviaciones = eventos.map(e => e.desviacionMin).filter((v: any) => typeof v === 'number') as number[];
      const velocidades = eventos.map(e => e.velocidad).filter((v: any) => v > 0) as number[];

      const result: DailyOtpResult = {
        date, agencyId, empresa, linea,
        totalEventos: total,
        busesUnicos,
        pctEnTiempo: Math.round((enTiempo / total) * 100),
        pctAtrasado: Math.round((atrasado / total) * 100),
        pctAdelantado: Math.round((adelantado / total) * 100),
        pctSinHorario: Math.round((sinHorario / total) * 100),
        desviacionMediaMin: desviaciones.length
          ? Math.round(desviaciones.reduce((a, b) => a + b, 0) / desviaciones.length * 10) / 10
          : null,
        velocidadMedia: velocidades.length
          ? Math.round(velocidades.reduce((a, b) => a + b, 0) / velocidades.length)
          : 0,
      };

      const docId = `${date}_${empresa}_${linea}`;
      await db.collection('otp_daily').doc(docId).set({
        ...result,
        actualizadoEn: FieldValue.serverTimestamp(),
      });
      written++;
    }
  }

  return { written };
}

export const dailyOtpAggregatorTick = onSchedule(
  { schedule: '55 23 * * *', timeZone: 'America/Montevideo', timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await aggregateDate(today);
    console.log('[dailyOtpAggregator]', today, JSON.stringify(r));
  }
);

// Útil para hacer backfill antes de la demo
export const dailyOtpAggregatorNow = onRequest(
  { timeoutSeconds: 540, memory: '512MiB' },
  async (req, res) => {
    try {
      const date = (req.query.date as string) ?? new Date().toISOString().slice(0, 10);
      const r = await aggregateDate(date);
      res.json({ ok: true, date, ...r });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message });
    }
  }
);
```

Agregar en `functions/src/index.ts`:

```typescript
export { dailyOtpAggregatorTick, dailyOtpAggregatorNow } from './dailyAggregator';
```

### Build + deploy + backfill

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\functions
npm run build
cd ..
firebase deploy --only functions:dailyOtpAggregatorTick,functions:dailyOtpAggregatorNow

# Backfill últimos 7 días para llenar gráficos históricos antes del lunes
$today = Get-Date
0..6 | ForEach-Object {
  $d = $today.AddDays(-$_).ToString("yyyy-MM-dd")
  Write-Host "Aggregating $d..."
  curl -sS "https://us-central1-ucot-gestor-cloud.cloudfunctions.net/dailyOtpAggregatorNow?date=$d" -m 540
  Write-Host ""
}
```

### Verificación

```powershell
curl -sS "https://us-central1-ucot-gestor-cloud.cloudfunctions.net/historicOtp?empresa=UCOT&dias=7"
```

**Criterio**: respuesta con datos diarios poblados, no array vacío.

---

## ▶️ P2-F · Verificación funcional módulo por módulo (Code con browser MCP)

Una vez todo P0+P1 deployado, recorrer el dashboard y dejar capturas en `docs/CAPTURAS_PRELANZAMIENTO_2026_05_02/`.

Browser MCP (Code lo tiene). Login como SUPERADMIN. Para cada URL:
1. Cargar página, esperar 5s.
2. Capturar screenshot.
3. Validar criterio.
4. Si falla, escribir "## NOTA DE JONATHAN" arriba de `SESION_ACTUAL.md` con qué pasa.

| URL | Criterio de éxito |
|---|---|
| `/dashboard` | Sin "Cargando estado operacional…" persistente. Contador de buses real (~700 total). Alertas con detalle (línea + rival + distancia). |
| `/dashboard/traffic/diagnostico-cumplimiento` | UCOT/CUTCSA/COME/COETC tabs funcionan. Datos reales por línea. **No** todos en 100% (debe ser distribución variada o SIN_HORARIO honesto). |
| `/dashboard/traffic/posicion-flota` | Mapa con buses en posiciones reales de Uruguay (sin marcadores en lat -258). |
| `/dashboard/traffic/shadow-radar` | Pares DRO con tiering T1/T2/T3. Alertas en vivo cuando hay pisada. |
| `/dashboard/super-admin/gantt-red` | Gantt funciona con UCOT vs CUTCSA. |
| `/dashboard/admin/subsidios-mtop` | Datos cargados (sin badge "Datos Estimados" si ya hay data real). |
| `/dashboard/traffic/ceo-dashboard-v7` | Métricas Salud Red, OTP, Aglomeración, Cobertura, Riesgo — ningún 0/0. |
| `/dashboard/admin/motor-consecuencias` | (Después de P2-G) Stream de cascadas en vivo. |

Para cada captura, agregar al bridge:

```powershell
python C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\cowork-tools\bridge\bridge_push.py `
  --from code --to cowork `
  --status DONE `
  --topic "Verificacion funcional <modulo>" `
  --body "URL: <url> | OK: <criterio cumplido> | Captura: docs/CAPTURAS_PRELANZAMIENTO/<file>.png"
```

---

## ▶️ P2-G · Vista visible "Motor de Consecuencias" mínima

### Por qué importa para la demo

El usuario pidió específicamente esto: que se VEA que el sistema está interconectado. Hoy `consequenceTriggers.ts` ya escribe a `consequence_events`, pero **no hay UI** para mostrarlas. Una página simple que renderice el feed convierte una abstracción en algo que el ingeniero CUTCSA puede ver durante la presentación.

### Implementación

Crear `frontend/src/pages/admin/MotorConsecuencias.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface ConsequenceEvent {
  id: string;
  evento: any;
  cascada: any[];
  sourceCollection: string;
  sourceDocId: string;
  empresaId: string;
  timestamp: any;
}

export default function MotorConsecuencias() {
  const [events, setEvents] = useState<ConsequenceEvent[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('todas');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'consequence_events'),
      orderBy('timestamp', 'desc'),
      limit(100),
    );
    const unsub = onSnapshot(q, (snap) => {
      const items: ConsequenceEvent[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setEvents(items);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtrados = filtroEmpresa === 'todas'
    ? events
    : events.filter(e => e.empresaId === filtroEmpresa);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Motor de Consecuencias</h1>
          <p className="text-slate-400 text-sm mt-1">
            Feed en vivo de eventos del sistema y sus cascadas. Cada vez que algo
            cambia en RRHH, flota, tráfico o listero, el motor se dispara y
            calcula el impacto en otros módulos.
          </p>
        </div>
        <select
          value={filtroEmpresa}
          onChange={(e) => setFiltroEmpresa(e.target.value)}
          className="bg-slate-800 text-white px-3 py-2 rounded border border-slate-700"
        >
          <option value="todas">Todas las empresas</option>
          <option value="UCOT">UCOT</option>
          <option value="CUTCSA">CUTCSA</option>
          <option value="COME">COME</option>
          <option value="COETC">COETC</option>
        </select>
      </div>

      {loading && <div className="text-slate-400">Cargando eventos…</div>}

      {!loading && filtrados.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center">
          <div className="text-slate-300 font-medium mb-2">
            Aún no se registraron cascadas
          </div>
          <div className="text-slate-500 text-sm">
            El motor escucha cambios en <code>licencias_personal</code>,{' '}
            <code>daily_shifts</code>, <code>vehicle_events</code> y{' '}
            <code>otp_daily</code>. Cuando algo pase, las consecuencias
            aparecerán acá automáticamente.
          </div>
        </div>
      )}

      <div className="space-y-3">
        {filtrados.map(ev => (
          <div key={ev.id} className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-white font-medium">
                  {ev.evento?.tipo ?? 'Evento'}
                </div>
                <div className="text-slate-400 text-xs mt-1">
                  Origen: <code>{ev.sourceCollection}/{ev.sourceDocId}</code>
                </div>
              </div>
              <span className="text-xs text-slate-500">
                {ev.timestamp?.toDate?.().toLocaleString('es-UY') ?? ''}
              </span>
            </div>

            {Array.isArray(ev.cascada) && ev.cascada.length > 0 && (
              <div className="border-l-2 border-blue-500 pl-3 ml-1 space-y-2">
                {ev.cascada.map((c: any, i: number) => (
                  <div key={i} className="text-sm">
                    <span className="text-blue-400">→</span>{' '}
                    <span className="text-slate-200">{c.descripcion ?? JSON.stringify(c)}</span>
                    {c.severidad && (
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                        c.severidad === 'CRITICA' ? 'bg-red-900 text-red-200' :
                        c.severidad === 'ALTA' ? 'bg-orange-900 text-orange-200' :
                        'bg-slate-800 text-slate-300'
                      }`}>{c.severidad}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

Agregar la ruta en `frontend/src/App.tsx` (donde están las demás rutas SUPERADMIN). Buscar un patrón como `/dashboard/super-admin/...` y replicar.

Agregar entrada al sidebar en `frontend/src/components/Sidebar.tsx` bajo "INTELIGENCIA COMPETITIVA" o "ADMINISTRACIÓN" — un ítem nuevo "Motor de Consecuencias" con icono `Zap` de lucide-react.

> ⚠️ Sidebar y App.tsx son archivos críticos compartidos según CLAUDE.md §10 — Code los edita, no Cowork. Cuidado con cambios grandes; preferir Edits puntuales de 5-10 líneas.

### Verificación

Browser MCP visita `/dashboard/admin/motor-consecuencias`. Si está vacío, mostrar el estado vacío informativo. Si hay cascadas, mostrarlas.

Para forzar al menos un evento de prueba (opcional, solo si está vacío y la demo lo requiere):

```powershell
# Marcar un conductor como ausente vía Firestore (manual desde Firebase Console)
# o crear un evento de prueba con curl al endpoint /api/consequencePreview
curl -sS -X POST "https://us-central1-ucot-gestor-cloud.cloudfunctions.net/consequencePreview" `
  -H "Content-Type: application/json" `
  -d '{"tipo":"AUSENCIA_CONDUCTOR","empresaId":"UCOT","conductorId":"prueba-001","lineaId":"306","fecha":"2026-05-02"}'
```

---

## ▶️ Commit final + push

Después de validar P0+P1+P2, un solo commit con mensaje claro:

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot

git add frontend/.env.production
git add frontend/src/pages/LoginScreen.tsx
git add frontend/src/layouts/DashboardLayout.tsx
git add frontend/src/pages/traffic/GanttRedMetropolitana.tsx
git add frontend/src/components/traffic/DesvioEditor.tsx
git add frontend/src/pages/admin/SubsidiosMTOP.tsx
git add frontend/src/pages/fleet/MantenimientoPredictivo.tsx
git add frontend/src/pages/traffic/PLPorOperador.tsx
git add scripts/ingestGtfsShapes.js
git add functions/src/autoStatsCollector.ts
git add functions/src/stmHorariosScraperTick.ts
git add functions/src/dailyAggregator.ts
git add functions/src/index.ts
git add frontend/src/pages/admin/MotorConsecuencias.tsx
git add frontend/src/App.tsx
git add frontend/src/components/Sidebar.tsx
git add docs/DIAGNOSTICO_2026_05_02_SISTEMA_DESCONECTADO.md
git add docs/ORDEN_MAESTRA_CODE_2026_05_02.md
git add docs/SESION_ACTUAL.md
git add docs/HISTORIAL_SESIONES.md
git add docs/CAPTURAS_PRELANZAMIENTO_2026_05_02

git commit -m "feat(pre-demo): fix URL backend + OTP honesto + cron horarios + agregador histórico + Motor de Consecuencias UI

P0:
- frontend/.env.production: VITE_API_URL → skillroute.web.app/api (root cause stats vacías)
- autoStatsCollector: fix bug matemático desviacionMin=0 por construcción.
  Sin snap-to-shape, reportar SIN_HORARIO honesto en vez de inventar EN_TIEMPO 100%.
- autoStatsCollector: filtrar GPS basura (lat/lon imposibles, fuera de Uruguay)

P1:
- stmHorariosScraperTick: cron 24h + endpoint manual para llenar horarios_stm
- dailyAggregator: cron 23:55 + backfill manual para llenar otp_daily, base de gráficos históricos

P2:
- MotorConsecuencias.tsx: vista en vivo de cascadas en consequence_events
- Sidebar + App.tsx: ruta nueva /dashboard/admin/motor-consecuencias

Sin regresión: tests + tsc + integrity script verde antes del push."

git push origin main
```

---

## 🛡️ Antes de pushear — chequeos obligatorios (Regla §11)

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot

# 1. TypeScript limpio en frontend y functions
cd frontend
npx tsc --noEmit --skipLibCheck
cd ..\functions
npx tsc --noEmit --skipLibCheck
cd ..

# 2. Tests
cd frontend
npm test -- --run
cd ..

# 3. Build limpio
cd frontend
npm run build
cd ..\functions
npm run build
cd ..

# 4. Integrity script (NULs reales — solo válido en Windows nativo)
bash scripts/check_integrity.sh

# 5. Verificación profiláctica de NULs en frontend (Windows nativo)
cd frontend\src
python -c "
import os
total = 0
for root, dirs, files in os.walk('.'):
    if 'node_modules' in root: continue
    for f in files:
        if f.endswith(('.ts', '.tsx')):
            p = os.path.join(root, f)
            n = open(p, 'rb').read().count(b'\x00')
            if n: print(p, n); total += n
print('Total NULs:', total)
"
cd ..\..
```

Si **cualquiera** falla: NO pushear. Escribir "## NOTA DE JONATHAN" arriba de `docs/SESION_ACTUAL.md` describiendo qué falló y avisar a Jonathan.

---

## 📦 Deploy final

Después del push:

```powershell
firebase deploy --only hosting:skillroute,functions:autoStatsCollectorTick,functions:autoStatsCollectorNow,functions:intelligenceApi,functions:stmHorariosScraperTick,functions:stmHorariosScraperNow,functions:dailyOtpAggregatorTick,functions:dailyOtpAggregatorNow
```

---

## 📋 Backfill de datos antes del lunes (CRÍTICO)

```powershell
# 1. Forzar nueva colecta GPS con la lógica corregida
curl -sS https://us-central1-ucot-gestor-cloud.cloudfunctions.net/autoStatsCollectorNow -m 90

# 2. Llenar horarios_stm
curl -sS https://us-central1-ucot-gestor-cloud.cloudfunctions.net/stmHorariosScraperNow -m 540

# 3. Backfill últimos 7 días en otp_daily
$today = Get-Date
0..6 | ForEach-Object {
  $d = $today.AddDays(-$_).ToString("yyyy-MM-dd")
  curl -sS "https://us-central1-ucot-gestor-cloud.cloudfunctions.net/dailyOtpAggregatorNow?date=$d" -m 540
}
```

---

## ✅ Definition of Done para esta sesión

- [ ] `frontend/.env.production` apunta a `skillroute.web.app/api`
- [ ] Build + deploy del hosting `skillroute` exitoso
- [ ] `autoStatsCollector.ts` con fix matemático (no más `desviacionMin = 0` siempre)
- [ ] `autoStatsCollector.ts` con filtro GPS válido
- [ ] `stmHorariosScraperTick.ts` y `dailyAggregator.ts` creados, deployados, y backfilleados
- [ ] `MotorConsecuencias.tsx` accesible en `/dashboard/admin/motor-consecuencias`
- [ ] Sidebar tiene entrada "Motor de Consecuencias"
- [ ] `tsc --noEmit` con 0 errores nuevos
- [ ] `npm test` con exit 0 (4 fallos pre-existentes de regresionOLS son OK)
- [ ] `npm run build` limpio
- [ ] `scripts/check_integrity.sh` exit 0
- [ ] Verificación funcional módulo por módulo: capturas en `docs/CAPTURAS_PRELANZAMIENTO_2026_05_02/`
- [ ] Commit pusheado a main
- [ ] Bridge actualizado con DONE
- [ ] `docs/SESION_ACTUAL.md` reescrito reflejando estado post-sprint

Si algún ítem no se puede cerrar antes del lunes, dejarlo como **NOTA DE JONATHAN** arriba de `SESION_ACTUAL.md` con explicación de por qué y workaround.

---

## 🎯 Mensaje a transmitir en la demo (script para Jonathan)

> "SkillRoute escucha en vivo a los 4 operadores del sistema metropolitano: ~700 buses con GPS cada 15 minutos. El motor agrega los datos por línea y por empresa, los cruza con los horarios STM, y dispara cascadas cuando algo cambia: una ausencia, un atraso estructural, una pisada de rival. Lo que ven en pantalla es la red completa hablándose entre módulos. La diferencia con un CAD/AVL tradicional es que SkillRoute no muestra solo los buses propios — muestra el ecosistema, y dónde tu operación se cruza con la de los rivales."

---

**Cualquier pregunta o bloqueo: bridge → push status BLOCKED → Cowork toma.**
