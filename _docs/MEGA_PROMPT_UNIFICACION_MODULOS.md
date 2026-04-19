# 🚌 MEGA ORDEN DE CONSTRUCCIÓN Y UNIFICACIÓN — TransformaFacil 2.0
## Módulo Unificado: Inteligencia de Operaciones + Análisis Competitivo en Tiempo Real

---

## 0. CONTEXTO VERIFICADO DEL PROYECTO (LEER ANTES DE TOCAR CUALQUIER ARCHIVO)

**Stack técnico:**
- Frontend: React 19 + Vite, puerto 3005
- Backend: Express 4.19 + TypeScript, puerto 3002
- Bridge Server: `backend/src/bridge-server.ts`, puerto 3099
- Base de datos: Firebase Firestore + Firebase Hosting
- Mapas: Leaflet (react-leaflet)
- Fuente de datos pública: `https://www.montevideo.gub.uy/app/stm/horarios/`
- Proyecto Firebase: `ucot-gestor-cloud`

**Fuente de verdad UCOT:**
- Archivo: `frontend/src/data/ucot_master_intelligence_2026.json`
- Contiene exactamente **21 líneas UCOT** verificadas:
  `221, 300, 306, 316, 317, 328, 329, 330, 370, 371, 379, 396, CE1, DM1, L-12, L-13, L-31, L-32, L-33, XA1, XA2`
- Wrapper de acceso: `frontend/src/data/ucotMaster.ts` → `getMaster()`, `getMasterLineas()`, `getMasterServicios()`

---

## 1. ESTADO ACTUAL VERIFICADO — PROBLEMAS CONFIRMADOS EN CÓDIGO

### Problema 1: LINE_INSPECTOR_CONFIGS — 5 IDs fantasma + 12 líneas sin cobertura
**Archivo:** `frontend/src/services/LineInspectorAgent.ts`
**Hecho:** `LINE_INSPECTOR_CONFIGS` tiene 14 configuraciones. De ellas:
- 5 IDs **NO EXISTEN** en `ucot_master_intelligence_2026.json`: `'17'`, `'71'`, `'79'`, `'11A'`, `'8SR'`
- Solo 9 de 21 líneas UCOT reales tienen inspector configurado (42% de cobertura)
- 12 líneas sin inspector: `317, 371, 379, CE1, DM1, L-12, L-13, L-31, L-32, L-33, XA1, XA2`

### Problema 2: Datos de competencia hardcodeados (estáticos)
**Archivo:** `frontend/src/services/LineInspectorAgent.ts`
**Hecho:** El campo `rivalesVerificados` de cada `LineInspectorConfig` contiene datos manuales de Cutcsa (28 menciones), Copsa (8), Rubricay (2), Gómez (1), Dinata (1). **No viene de ninguna fuente en tiempo real.**

### Problema 3: competitionService.ts usa Firestore estático
**Archivo:** `backend/src/services/competitionService.ts`
**Hecho:** Usa `db.collection('competidores')` y `db.collection('lineas')` — datos guardados manualmente en Firebase. No consulta la IMM ni el STM.

### Problema 4: stmPublicDataScraper.ts existe pero está desconectado
**Archivo:** `backend/src/services/stmPublicDataScraper.ts` (578 líneas)
**Hecho:** El scraper ya implementa `obtenerLineasUCOT()`, `analizarCompetenciaLinea()`, `analizarTodasLasLineas()` y tipos correctos (`Parada`, `Horario`, `SentidoViaje`, `LineaUCOT`, `CompetidorDetectado`, `ReporteCompetenciaCompleto`). El Bridge Server ya lo importa en `bridge-server.ts` y lo expone en los endpoints `/api/lines/ucot`, `/api/analysis/{linea}`, `/api/intelligence/{linea}`, `/api/all-analysis`. **El problema es que el frontend NO usa estos endpoints para competencia.**

### Problema 5: Tres módulos hacen lo mismo inconsistentemente
- `FleetMonitorModule.tsx` → mapa Leaflet, lee `viajes_activos` Firestore → "0 unidades detectadas"
- `DigitalAgentsModule.tsx` → agentes por línea, lee master JSON + LINE_INSPECTOR_CONFIGS
- `CompetitorIntelligencePage.tsx` → dashboard competitivo, lee Bridge Server `localhost:3099`
**Resultado:** Tres fuentes, tres interfaces, datos contradictorios.

### Problema 6: Referencias a cartones de servicio que deben eliminarse
**Archivo:** `frontend/src/pages/traffic/DigitalAgentsModule.tsx`, línea 4 (comentario):
```
// 4. CartonService (Firestore) → cartones complementarios
```
Y en la interfaz `ServicioActivo` hay campos derivados de lógica de cartones. La instrucción del usuario es: **CERO cartones, datos exclusivamente de IMM/STM pública.**

---

## 2. ARQUITECTURA DEL NUEVO MÓDULO UNIFICADO

### Nombre del nuevo módulo: `UnifiedOperationsModule`
### Ruta: `/dashboard/traffic/operations`
### Archivo principal: `frontend/src/pages/traffic/UnifiedOperationsModule.tsx`

El módulo tiene **tres paneles integrados** que comparten estado y datos:

```
┌─────────────────────────────────────────────────────────────────────┐
│  PANEL SUPERIOR — Selector de Línea + Status del Sistema            │
│  [Dropdown 21 líneas] [Estado Bridge] [Última actualización]        │
├────────────────────────┬────────────────────────────────────────────┤
│  PANEL IZQUIERDO       │  PANEL DERECHO — MAPA LEAFLET              │
│  Agente Digital        │                                            │
│  ─────────────────     │  Capas visibles (toggles):                 │
│  • Servicios activos   │  ☑ Recorrido UCOT (azul)                   │
│  • Horarios IMM        │  ☑ Recorridos competidores (rojo)          │
│  • Frecuencia real     │  ☑ Zona de solapamiento (naranja fill)     │
│  • Estado operacional  │  ☑ Posiciones GPS en tiempo real (íconos)  │
│  ─────────────────     │  ☑ Paradas clave (marcadores)              │
│  Inteligencia          │                                            │
│  Competitiva           │  Leyenda:                                  │
│  ─────────────────     │  🔵 Bus UCOT  🔴 Bus rival  🟠 Solapamiento│
│  • Lista competidores  │                                            │
│  • Score amenaza       │                                            │
│  • Recomendaciones     │                                            │
│  tácticas              │                                            │
└────────────────────────┴────────────────────────────────────────────┘
```

---

## 3. ARCHIVOS A CREAR (NUEVOS)

### 3.1 `frontend/src/services/IMMDataService.ts`
**Propósito:** Único punto de acceso a datos IMM/STM públicos vía Bridge Server.
**Debe implementar:**

```typescript
// Interfaz de retorno mínima para cada función
interface IMMLineData {
  lineaId: string;
  nombre: string;
  empresa: string;
  sentidoIda: {
    origen: string;
    destino: string;
    paradas: Array<{ numero: number; nombre: string; lat?: number; lng?: number }>;
    horarios: Array<{ hora: string; tipoDia: 'HABIL' | 'SABADO' | 'DOMINGO' }>;
  };
  sentidoVuelta: {
    origen: string;
    destino: string;
    paradas: Array<{ numero: number; nombre: string; lat?: number; lng?: number }>;
    horarios: Array<{ hora: string; tipoDia: 'HABIL' | 'SABADO' | 'DOMINGO' }>;
  };
  frecuenciaProgramadaMin: number;
  frecuenciaCalculadaMin?: number;
}

interface IMMCompetitorReport {
  lineaUCOT: string;
  timestamp: string;
  competidores: Array<{
    linea: string;
    empresa: string;
    solapamientoKm: number;
    porcentajeRecorridoCompartido: number;
    paradasCompartidas: number;
    tipoCompetencia: 'DIRECTA' | 'PARCIAL' | 'NULA' | 'INVERSA';
    amenaza: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
    // Coordenadas del tramo solapado (para dibujar en el mapa)
    tramoSolapado?: Array<{ lat: number; lng: number }>;
  }>;
  scoreRiesgoTotal: number; // 0-100
  posicionCompetitiva: 'LIDER' | 'COMPETITIVA' | 'VULNERABLE' | 'CRITICA';
  recomendaciones: string[];
}

interface IMMGPSPosition {
  codigoInterno: string;
  lineaId: string;
  empresa: string;
  lat: number;
  lng: number;
  velocidad: number;
  timestamp: string;
}

// FUNCIONES REQUERIDAS:

// Obtiene datos de UNA línea (UCOT o competidor) desde Bridge Server
async function getLineData(lineaId: string): Promise<IMMLineData>

// Obtiene datos de TODAS las líneas UCOT (las 21)
async function getAllUCOTLines(): Promise<IMMLineData[]>

// Obtiene análisis de competencia COMPLETO para una línea UCOT
async function getCompetitionReport(lineaUCOTId: string): Promise<IMMCompetitorReport>

// Obtiene posiciones GPS en tiempo real de UCOT + competidores
async function getRealtimePositions(lineaId?: string): Promise<IMMGPSPosition[]>

// Obtiene el recorrido geográfico (polyline) de una línea
async function getLineRoute(lineaId: string, sentido: 'IDA' | 'VUELTA'): Promise<Array<{ lat: number; lng: number }>>

// Calcula el polígono de solapamiento entre dos recorridos
function calculateOverlapPolygon(
  routeA: Array<{ lat: number; lng: number }>,
  routeB: Array<{ lat: number; lng: number }>,
  thresholdMeters: number
): Array<{ lat: number; lng: number }>

// Determina qué servicios están activos ahora mismo según horarios IMM
function getActiveServicesNow(lineData: IMMLineData): {
  enCurso: boolean;
  proximoViaje: string | null;
  frecuenciaActualMin: number;
  tipoDiaHoy: 'HABIL' | 'SABADO' | 'DOMINGO';
}
```

**Configuración:**
```typescript
const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3099';
// Endpoints del Bridge Server que YA existen:
// GET /api/lines/ucot
// GET /api/analysis/{linea}
// GET /api/intelligence/{linea}
// GET /api/all-analysis
// GET /api/positions (CREAR si no existe)
```

**Cache:** Implementar cache en memoria con TTL de 5 minutos para no sobrecargar el Bridge Server. Las posiciones GPS tienen TTL de 30 segundos.

---

### 3.2 `frontend/src/pages/traffic/UnifiedOperationsModule.tsx`
**Propósito:** Módulo unificado que reemplaza `FleetMonitorModule.tsx`, `DigitalAgentsModule.tsx` y `CompetitorIntelligencePage.tsx`.

**Estado del componente (useState/useReducer):**
```typescript
interface UnifiedState {
  // Línea seleccionada
  selectedLineId: string | null;           // null = vista general de toda la flota

  // Datos IMM cargados
  ucotLines: IMMLineData[];                // Las 21 líneas UCOT
  selectedLineData: IMMLineData | null;    // Datos de la línea seleccionada
  competitorReport: IMMCompetitorReport | null;
  realtimePositions: IMMGPSPosition[];

  // Estado UI del mapa
  mapLayers: {
    showUCOTRoute: boolean;
    showCompetitorRoutes: boolean;
    showOverlapZones: boolean;
    showGPSPositions: boolean;
    showStops: boolean;
  };

  // Estado de carga
  loading: {
    lines: boolean;
    competition: boolean;
    positions: boolean;
  };
  error: string | null;
  lastUpdate: Date | null;
  bridgeStatus: 'connected' | 'disconnected' | 'checking';
}
```

**Hooks requeridos:**
- `useIMMData(lineId)` → maneja carga, cache y polling de datos IMM
- `useRealtimePositions(lineId?, intervalMs = 30000)` → polling de posiciones GPS
- `useMapLayers()` → estado de capas del mapa con persistencia en localStorage

**Estructura del render:**

```tsx
return (
  <div className="unified-ops-module h-full flex flex-col">
    {/* Barra superior */}
    <TopBar
      lines={ucotLines}           // Dropdown con 21 líneas
      selectedLine={selectedLineId}
      onLineSelect={setSelectedLineId}
      bridgeStatus={bridgeStatus}
      lastUpdate={lastUpdate}
      onRefresh={handleRefresh}
    />

    <div className="flex flex-1 overflow-hidden">
      {/* Panel izquierdo: agente + inteligencia */}
      <LeftPanel
        lineData={selectedLineData}
        competitorReport={competitorReport}
        positions={realtimePositions}
        loading={loading}
      />

      {/* Panel derecho: mapa */}
      <MapPanel
        lineData={selectedLineData}
        competitorReport={competitorReport}
        positions={realtimePositions}
        layers={mapLayers}
        onLayerToggle={toggleLayer}
      />
    </div>
  </div>
);
```

**Sub-componente: `LeftPanel`**

Tiene dos secciones que colapsan/expanden:

**Sección 1 — Agente Digital de Línea:**
```
[Ícono Bot] AGENTE DIGITAL — LÍNEA {id}
─────────────────────────────────────────
Estado: ● OPERANDO / ○ FUERA DE SERVICIO  (calculado desde horarios IMM actuales)
Tipo de día: HÁBIL / SÁBADO / DOMINGO      (calculado desde fecha actual)

SERVICIOS ACTIVOS AHORA:
  ┌─────────────────────────────────────────┐
  │ Servicio {numero} — IDA                 │
  │ {origen} → {destino}                   │
  │ Próxima salida: {HH:MM}                 │
  │ Frecuencia: cada {N} min                │
  └─────────────────────────────────────────┘
  (repetir para cada servicio activo)

PRÓXIMAS SALIDAS (IDA):
  {HH:MM}  {HH:MM}  {HH:MM}  {HH:MM}

PRÓXIMAS SALIDAS (VUELTA):
  {HH:MM}  {HH:MM}  {HH:MM}  {HH:MM}

UNIDADES EN RUTA: {N detectadas vía GPS}
  (o mensaje "Sin datos GPS — verificar conexión IMM" si no hay posiciones)
```

**Sección 2 — Inteligencia Competitiva:**
```
[Ícono Shield] INTELIGENCIA COMPETITIVA
─────────────────────────────────────────
Posición: [LÍDER | COMPETITIVA | VULNERABLE | CRÍTICA]  (badge colorido)
Score de riesgo: {N}/100

COMPETIDORES EN CORREDOR ({total}):

  ⚠️ {empresa} Línea {id}           AMENAZA: CRÍTICA
     Solapamiento: {N}%  |  Tipo: DIRECTA
     [Ver en mapa]

  🟡 {empresa} Línea {id}           AMENAZA: ALTA
     Solapamiento: {N}%  |  Tipo: PARCIAL
     [Ver en mapa]

  (... todos los competidores del reporte)

RECOMENDACIONES TÁCTICAS:
  1. {recomendacion_1}
  2. {recomendacion_2}
  (...)
```

**REGLA CRÍTICA para LeftPanel:** Si `competitorReport` tiene 0 competidores, mostrar:
```
"Sin datos de competencia disponibles — Bridge Server desconectado o sin datos IMM para esta línea"
```
**NUNCA mostrar datos hardcodeados si el Bridge Server no responde.**

---

**Sub-componente: `MapPanel`**

Usa `react-leaflet`. Capas en orden de z-index (de abajo hacia arriba):

1. **TileLayer** — OpenStreetMap estándar
2. **Capa: Recorridos competidores** (z=400)
   - `Polyline` color `#ef4444` (rojo) por cada competidor detectado
   - Grosor 3px, opacidad 0.7
   - Popup al hacer click: nombre del competidor, empresa, % solapamiento
3. **Capa: Recorrido UCOT** (z=500)
   - `Polyline` color `#3b82f6` (azul) para IDA
   - `Polyline` color `#60a5fa` (azul claro) para VUELTA
   - Grosor 4px
4. **Capa: Zonas de solapamiento** (z=450)
   - `Polygon` color `#f97316` (naranja) con `fillOpacity: 0.3`
   - Se calculan dinámicamente con `calculateOverlapPolygon()` para cada competidor
   - Solo mostrar solapamientos con tipo `DIRECTA` o `PARCIAL`
5. **Capa: Posiciones GPS** (z=600)
   - Buses UCOT: ícono circular azul `🔵` con número de línea
   - Buses competidores: ícono circular rojo `🔴` con empresa abreviada
   - Popup: código interno, línea, velocidad, timestamp
6. **Capa: Paradas clave** (z=550)
   - `CircleMarker` pequeño amarillo para paradas de alta demanda
   - Solo mostrar si zoom > 13

**Controles del mapa:**
```
Panel de capas (top-right):
  ☑ Ruta UCOT
  ☑ Rutas competidores
  ☑ Zonas de solapamiento
  ☑ GPS en tiempo real
  ☐ Paradas
```

---

## 4. ARCHIVOS A MODIFICAR

### 4.1 `frontend/src/services/LineInspectorAgent.ts` — REFACTORIZAR COMPLETAMENTE

**ELIMINAR:**
- Todo el contenido del objeto `LINE_INSPECTOR_CONFIGS` (todas las claves: `'17'`, `'71'`, `'79'`, `'300'`, `'306'`, `'316'`, `'328'`, `'329'`, `'330'`, `'370'`, `'396'`, `'11A'`, `'221'`, `'8SR'`)
- El campo `rivalesVerificados` de la interfaz `LineInspectorConfig`
- Las 5 entradas fantasma: `'17'`, `'71'`, `'79'`, `'11A'`, `'8SR'`

**REEMPLAZAR `LINE_INSPECTOR_CONFIGS` por:**
Una función `buildInspectorConfig(lineaId: string, lineData: IMMLineData): LineInspectorConfig` que genera la config dinámicamente desde datos IMM en lugar de datos hardcodeados.

**Las 21 líneas deben generarse desde el master JSON**, no hardcodeadas:
```typescript
export function buildAllInspectorConfigs(
  masterLineas: MasterLinea[],
  immData: Map<string, IMMLineData>
): Record<string, LineInspectorConfig> {
  const configs: Record<string, LineInspectorConfig> = {};
  for (const linea of masterLineas) {
    const imm = immData.get(linea.id);
    if (imm) {
      configs[linea.id] = buildInspectorConfig(linea.id, imm);
    }
  }
  return configs;
}
```

**MANTENER:**
- Todas las interfaces: `FrequencyBand`, `RivalVerificado`, `AlertaHeadway`, `MetricaRecaudacion`, `InspectorReport`, `LineInspectorConfig`
- La interfaz `LineInspectorConfig` pero sin el campo `rivalesVerificados` (los rivales vienen del `IMMCompetitorReport`)
- La función `getLineInspector(lineId: string)` — adaptar para recibir `IMMLineData` como parámetro
- La lógica de `generateReport()` — adaptar para recibir `IMMCompetitorReport` en lugar de `rivalesVerificados`

---

### 4.2 `frontend/src/pages/traffic/DigitalAgentsModule.tsx` — DEPRECAR

Este archivo se convierte en un wrapper que simplemente redirige a `UnifiedOperationsModule`:
```tsx
// DigitalAgentsModule.tsx — DEPRECADO
// Este módulo fue unificado en UnifiedOperationsModule
// Mantener solo para compatibilidad de rutas existentes
import { Navigate } from 'react-router-dom';
export default function DigitalAgentsModule() {
  return <Navigate to="/dashboard/traffic/operations" replace />;
}
```

---

### 4.3 `frontend/src/pages/traffic/FleetMonitorModule.tsx` — DEPRECAR

Igual que `DigitalAgentsModule.tsx`:
```tsx
// FleetMonitorModule.tsx — DEPRECADO
// Este módulo fue unificado en UnifiedOperationsModule
import { Navigate } from 'react-router-dom';
export default function FleetMonitorModule() {
  return <Navigate to="/dashboard/traffic/operations" replace />;
}
```

---

### 4.4 `frontend/src/pages/traffic/CompetitorIntelligencePage.tsx` — DEPRECAR

```tsx
// CompetitorIntelligencePage.tsx — DEPRECADO
// Este módulo fue unificado en UnifiedOperationsModule
import { Navigate } from 'react-router-dom';
export default function CompetitorIntelligencePage() {
  return <Navigate to="/dashboard/traffic/operations" replace />;
}
```

---

### 4.5 `backend/src/bridge-server.ts` — AGREGAR ENDPOINT GPS

Agregar el siguiente endpoint que actualmente falta:

```typescript
// GET /api/positions — Posiciones GPS en tiempo real de UCOT + competidores
// Consultado por el frontend cada 30 segundos
app.get('/api/positions', async (req: Request, res: Response) => {
  try {
    const lineaFilter = req.query.linea as string | undefined;

    // Intentar obtener desde API IMM real
    const posiciones = await obtenerPosicionesIMM(lineaFilter);
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      total: posiciones.length,
      posiciones
    });
  } catch (error) {
    // Si IMM no responde, retornar array vacío con indicador de error
    // NUNCA retornar posiciones falsas
    res.json({
      ok: false,
      timestamp: new Date().toISOString(),
      total: 0,
      posiciones: [],
      error: 'IMM GPS data not available'
    });
  }
});
```

Implementar `obtenerPosicionesIMM()` en `stmPublicDataScraper.ts`:
```typescript
export async function obtenerPosicionesIMM(lineaId?: string): Promise<Array<{
  codigoInterno: string;
  lineaId: string;
  empresa: string;
  lat: number;
  lng: number;
  velocidad: number;
  timestamp: string;
}>>
```

La función debe consultar el endpoint público de posicionamiento de la IMM/STM de Montevideo. Si el endpoint no está disponible o no retorna datos, retornar array vacío — **NUNCA datos simulados.**

---

### 4.6 `backend/src/services/stmPublicDataScraper.ts` — AGREGAR FUNCIÓN GPS

Agregar al final del archivo (sin modificar las funciones existentes):

```typescript
/**
 * Obtiene posiciones GPS en tiempo real desde IMM
 * Endpoint público STM: https://www.montevideo.gub.uy/app/stm/
 * Retorna array vacío si el servicio no está disponible
 */
export async function obtenerPosicionesIMM(lineaId?: string): Promise<IMMGPSEntry[]> {
  // Implementar consulta al endpoint GPS de IMM
  // Si no hay endpoint disponible, retornar []
  // NUNCA lanzar excepción — siempre retornar array (vacío si falla)
}

export interface IMMGPSEntry {
  codigoInterno: string;
  lineaId: string;
  empresa: string;
  lat: number;
  lng: number;
  velocidad: number;
  timestamp: string;
}
```

---

### 4.7 Router del frontend — AGREGAR RUTA

En el archivo de rutas del frontend (buscar en `frontend/src/App.tsx` o `frontend/src/router/` o similar):

Agregar la ruta:
```tsx
<Route path="/dashboard/traffic/operations" element={<UnifiedOperationsModule />} />
```

---

### 4.8 Navegación lateral — ACTUALIZAR

En el sidebar/navbar del dashboard, reemplazar los tres accesos separados:
- "Monitoreo de Flota" → ahora apunta a `/dashboard/traffic/operations`
- "Agentes Digitales" → ahora apunta a `/dashboard/traffic/operations`
- "Inteligencia Competitiva" → ahora apunta a `/dashboard/traffic/operations`

Por un único ítem:
```
🚌 Operaciones en Tiempo Real    /dashboard/traffic/operations
```

---

## 5. ARCHIVOS A ELIMINAR (contenido que debe desaparecer del código)

### 5.1 En `frontend/src/services/LineInspectorAgent.ts`:
Eliminar COMPLETAMENTE las definiciones hardcodeadas de:
- Toda la data del objeto `LINE_INSPECTOR_CONFIGS` (los datos de rutas, frecuencias y rivalesVerificados para IDs: 17, 71, 79, 300, 306, 316, 328, 329, 330, 370, 396, 11A, 221, 8SR)

### 5.2 En `frontend/src/pages/traffic/DigitalAgentsModule.tsx`:
- Eliminar el comentario de la línea 4: `// 4. CartonService (Firestore) → cartones complementarios`
- Eliminar la interfaz `ServicioActivo` (reemplazada por `IMMLineData`)
- Eliminar la función `analizarServiciosActivos()` (reemplazada por `getActiveServicesNow()` en `IMMDataService.ts`)

### 5.3 En `backend/src/services/competitionService.ts`:
- Reemplazar las llamadas a `db.collection('competidores')` y `db.collection('lineas')` con llamadas al `stmPublicDataScraper`
- El servicio debe actuar como proxy/adaptador entre las rutas de competencia del backend y el scraper STM

---

## 6. REGLAS ABSOLUTAS — NO NEGOCIABLES

1. **CERO cartones de servicio.** La palabra "cartón" no debe aparecer en ningún archivo nuevo ni modificado en contexto funcional. Solo puede aparecer en comentarios que digan "DEPRECADO".

2. **CERO datos hardcodeados de competidores.** El objeto `rivalesVerificados` debe ser eliminado de todos los `LineInspectorConfig`. Los datos de competencia vienen EXCLUSIVAMENTE del Bridge Server que consulta datos públicos de la IMM/STM.

3. **CERO IDs fantasma.** Los IDs `'17'`, `'71'`, `'79'`, `'11A'`, `'8SR'` deben eliminarse de todo el sistema. No existen en el master JSON y no deben existir en ningún config.

4. **Las 21 líneas, todas.** El sistema debe operar sobre las 21 líneas verificadas del master JSON: `221, 300, 306, 316, 317, 328, 329, 330, 370, 371, 379, 396, CE1, DM1, L-12, L-13, L-31, L-32, L-33, XA1, XA2`. Si el Bridge Server no tiene datos para alguna, mostrar "Sin datos IMM disponibles para esta línea" — no inventar datos.

5. **Si el Bridge Server no responde, decirlo claramente.** Mostrar siempre el estado de conexión al Bridge Server. Si está caído: "Bridge Server desconectado — datos en tiempo real no disponibles". NUNCA mostrar datos falsos como si fueran reales.

6. **El mapa DEBE mostrar solapamientos.** La capa de zonas de solapamiento (polígonos naranjas) es una característica requerida, no opcional. Si no hay datos de recorrido geográfico disponibles desde el Bridge Server, mostrar la capa pero vacía con un mensaje explicativo.

7. **Un solo módulo, tres paneles.** No crear archivos separados para "flota", "agentes" y "competencia". Todo vive en `UnifiedOperationsModule.tsx` y sus sub-componentes en la carpeta `frontend/src/pages/traffic/components/unified/`.

8. **TypeScript estricto.** Todos los tipos deben estar definidos. No usar `any` salvo en casos extremadamente justificados con comentario.

---

## 7. CHECKLIST DE VALIDACIÓN (ejecutar al terminar)

El agente debe verificar CADA punto antes de declarar la tarea completa:

### 7.1 Verificación de archivos
- [ ] `frontend/src/services/IMMDataService.ts` — creado, exporta todas las funciones listadas en sección 3.1
- [ ] `frontend/src/pages/traffic/UnifiedOperationsModule.tsx` — creado, renderiza sin errores
- [ ] `frontend/src/pages/traffic/DigitalAgentsModule.tsx` — modificado a wrapper con `<Navigate>`
- [ ] `frontend/src/pages/traffic/FleetMonitorModule.tsx` — modificado a wrapper con `<Navigate>`
- [ ] `frontend/src/pages/traffic/CompetitorIntelligencePage.tsx` — modificado a wrapper con `<Navigate>`

### 7.2 Verificación de eliminaciones
- [ ] Buscar en todo el proyecto: `rivalesVerificados` — no debe aparecer en código nuevo
- [ ] Buscar en todo el proyecto: `LINE_INSPECTOR_CONFIGS` con datos hardcodeados — el objeto debe estar vacío o eliminado
- [ ] Buscar en todo el proyecto: IDs `'17'`, `'71'`, `'79'`, `'11A'`, `'8SR'` en contexto de lineId — no deben existir
- [ ] Buscar en todo el proyecto: `CartonService` en contexto funcional — no debe existir
- [ ] Buscar en todo el proyecto: `db.collection('competidores')` — no debe usarse para análisis competitivo en tiempo real

### 7.3 Verificación de cobertura de líneas
Ejecutar este script de verificación:
```python
import json

# Leer master
with open('frontend/src/data/ucot_master_intelligence_2026.json') as f:
    master = json.load(f)

lineas_master = set(l['id'] for l in master['lineas'])
print(f"Líneas en master: {len(lineas_master)}")
print(f"Deben ser exactamente 21: {lineas_master}")

# Verificar que el nuevo módulo las referencia todas
# (verificación manual en código)
```
Resultado esperado: exactamente 21 líneas.

### 7.4 Verificación del mapa
- [ ] El mapa carga sin errores de consola
- [ ] Los toggles de capas funcionan
- [ ] Al seleccionar una línea UCOT, el mapa centra en su corredor
- [ ] Si hay datos de competidores, se muestran polylines rojas
- [ ] Si hay solapamiento calculado, se muestran polígonos naranjas
- [ ] Si no hay datos GPS, se muestra mensaje "Sin posiciones GPS disponibles" (no mapa vacío sin explicación)

### 7.5 Verificación del panel izquierdo
- [ ] El dropdown muestra las 21 líneas (tomadas de `getMasterLineas()`)
- [ ] Para cada línea seleccionada, se dispara llamada al Bridge Server
- [ ] Los servicios activos se calculan desde horarios IMM (no desde cartones)
- [ ] La sección de competidores muestra datos del Bridge Server o mensaje de error claro
- [ ] Las recomendaciones tácticas son generadas desde datos reales (no strings hardcodeados)

### 7.6 Verificación de build
```bash
cd frontend && npm run build
```
- [ ] Build termina sin errores TypeScript
- [ ] Build termina sin warnings de imports no usados relacionados a módulos deprecados
- [ ] El bundle no incluye datos hardcodeados de `LINE_INSPECTOR_CONFIGS` (verificar que el objeto esté vacío)

### 7.7 Verificación final de consistencia de datos
- [ ] Cuando el Bridge Server está UP: todos los datos mostrados provienen del Bridge Server
- [ ] Cuando el Bridge Server está DOWN: todos los paneles muestran estado de error claro, no datos stale ni hardcodeados
- [ ] La cantidad de líneas UCOT en el dropdown es EXACTAMENTE 21
- [ ] La cantidad de competidores mostrados en el panel corresponde exactamente a lo que retorna el Bridge Server para esa línea

---

## 8. ESTRUCTURA DE CARPETAS A CREAR

```
frontend/src/pages/traffic/
├── UnifiedOperationsModule.tsx          ← NUEVO archivo principal
└── components/
    └── unified/
        ├── TopBar.tsx                   ← Selector de línea + status
        ├── LeftPanel.tsx                ← Panel agente + competencia
        ├── MapPanel.tsx                 ← Mapa Leaflet unificado
        ├── AgentSection.tsx             ← Sub-sección del agente
        ├── CompetitorSection.tsx        ← Sub-sección competencia
        ├── LayerToggle.tsx              ← Control de capas del mapa
        └── StatusBadge.tsx              ← Badge de estado (conectado/desconectado)

frontend/src/services/
└── IMMDataService.ts                    ← NUEVO servicio de datos IMM
```

---

## 9. REFERENCIAS TÉCNICAS ÚTILES

### Bridge Server — Endpoints disponibles (ya implementados):
```
GET  http://localhost:3099/health
GET  http://localhost:3099/api/lines/ucot           ← Lista líneas UCOT con horarios
GET  http://localhost:3099/api/analysis/{linea}     ← Análisis competencia de una línea
GET  http://localhost:3099/api/intelligence/{linea} ← Inteligencia detallada
GET  http://localhost:3099/api/all-analysis         ← Análisis todas las líneas
GET  http://localhost:3099/api/positions            ← A CREAR (sección 4.5)
```

### Variable de entorno del frontend:
```
VITE_BRIDGE_URL=http://localhost:3099
```

### Fuente pública de horarios IMM/STM:
```
https://www.montevideo.gub.uy/app/stm/horarios/
https://www.montevideo.gub.uy/api/stm
```

### Líneas UCOT verificadas (21 total, extraídas del master JSON):
```
221, 300, 306, 316, 317, 328, 329, 330, 370, 371, 379, 396,
CE1, DM1, L-12, L-13, L-31, L-32, L-33, XA1, XA2
```

### Empresas competidoras del STM Montevideo:
```
Cutcsa, COETC, COME, Copsa, Comesa, Dinata, Rubricay, Gómez, Agencia Central
```

---

## 10. ORDEN DE EJECUCIÓN RECOMENDADA

1. Crear `IMMDataService.ts` (base de todo lo demás)
2. Agregar endpoint `/api/positions` en `bridge-server.ts`
3. Agregar `obtenerPosicionesIMM()` en `stmPublicDataScraper.ts`
4. Crear sub-componentes en `components/unified/` (de adentro hacia afuera: `StatusBadge` → `LayerToggle` → `AgentSection` → `CompetitorSection` → `TopBar` → `LeftPanel` → `MapPanel`)
5. Crear `UnifiedOperationsModule.tsx` componiendo los sub-componentes
6. Refactorizar `LineInspectorAgent.ts` (eliminar hardcoding)
7. Deprecar los tres módulos viejos (wrappers con `<Navigate>`)
8. Actualizar router y navegación
9. Ejecutar checklist de validación sección 7
10. `npm run build` — debe terminar sin errores

---

*Generado el 2026-04-07. Basado en análisis verificado del código fuente de TransformaFacil 2.0.*
*Datos verificados con Python cross-reference de ucot_master_intelligence_2026.json vs LINE_INSPECTOR_CONFIGS.*
