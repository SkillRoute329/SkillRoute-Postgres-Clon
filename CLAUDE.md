# TransformaFacil 2.0 — Memoria del Proyecto
> Leer este archivo al inicio de cada sesión para no desperdiciar créditos re-explicando el contexto.

---

## 🤖 Comportamientos automáticos del agente (OBLIGATORIOS)

Estas instrucciones se aplican **automáticamente** al inicio de cualquier sesión donde se toque código. No requieren que el usuario las pida.

### 1. Chequeo de hotspots al empezar

Si la tarea implica **editar varios archivos o refactorizar**, la primera acción debe ser:

```bash
bash scripts/hotspots.sh
```

La salida lista archivos que superan los límites de `docs/CONVENCIONES.md` §5. **Cualquier archivo >400 líneas que se vaya a editar más de una vez en esta sesión DEBE dividirse ANTES** (patrón de ADR 003). Dividir primero baja el consumo de tokens ~6× en las ediciones siguientes.

### 2. Scout rule al tocar un archivo grande

Si se va a **editar un archivo >400 líneas** (aunque sea una sola vez), considerar si se puede dejar más chico en la misma edición extrayendo un subdominio. Regla: dejar el archivo como máximo igual de grande, nunca más grande.

### 3. Lectura parcial, no total

Al abrir un archivo grande (>500 líneas), usar `Read` con `offset` + `limit` para leer solo la sección relevante. Nunca releer el archivo completo si ya está en contexto.

### 4. Python atómico para cambios grandes

Si un cambio afecta >50 líneas de un archivo >500 líneas, usar Python con `os.replace(tmp, path)` en lugar de `Edit` de string largo. Los Edit grandes sobre archivos grandes tienen historial de truncamiento (ver patrón en CLAUDE.md).

### 5. Verificar después de cada cambio estructural

Después de mover código entre archivos:

```bash
cd functions && npx tsc --noEmit 2>&1 | grep -E "^src/.*error TS"
cd ../frontend && npx tsc --noEmit 2>&1 | grep -E "^src/.*error TS"
```

Si hay errores, arreglar ANTES de seguir. No acumular deuda.

### 6. Chequeo de integridad antes de terminar

Antes de decir "listo" al usuario, correr:

```bash
bash scripts/check_integrity.sh
```

Si exit != 0, avisar y no terminar.

### 7. Verificación funcional SIEMPRE es responsabilidad del agente (DIRECTRIZ 2026-04-24)

Jonathan no hace pruebas manuales. Después de cualquier cambio desplegado o
deployable, el agente verifica por sí mismo usando las herramientas
disponibles:

- **Cambios frontend**: Claude in Chrome navega al componente afectado,
  extrae el DOM/consola, confirma que renderiza datos reales y que los
  indicadores críticos (tiers, contadores, badges) muestran lo esperado.
- **Cambios backend**: `curl` al endpoint HTTP nuevo o modificado,
  verificación del JSON de respuesta, conteo de docs afectados en Firestore
  si aplica.
- **Cambios de datos/schema**: query de lectura sobre la colección tocada
  para confirmar que los docs tienen la forma esperada.
- **Regresiones**: si el cambio toca un archivo que ya tenía uso en producción
  (ej. ShadowRadar), verificar que la funcionalidad previa sigue andando, no
  sólo la nueva.

No se acepta "probalo vos y avisame". Si una herramienta no está disponible
(Chrome MCP desconectado, sin acceso a Firestore, etc.), decirlo explícito
y buscar alternativa (web_fetch, shell, etc.). Pasarle el testing al
usuario sólo es aceptable cuando:
(a) la verificación requiere credenciales que el agente no puede usar
    (ej. login humano con 2FA);
(b) es una acción irreversible que prefiero que el usuario autorice
    (deploy de producción con efectos financieros, por ejemplo).

En esos casos, ejecutar todo lo verificable automáticamente antes de
pedir la acción humana. Incluir en el reporte qué se verificó y qué queda
pendiente por su intervención específica.

---

## 📘 Documentos que debe leer el agente antes de tocar código

Si la tarea implica crear, mover, renombrar o reorganizar archivos, **leer primero**:

1. **`docs/CONVENCIONES.md`** — reglas operativas cortas (dónde va cada tipo de código, sufijos, idioma, límites de tamaño). Consulta rápida <30s.
2. **`ARQUITECTURA_OBJETIVO.md`** — estructura objetivo completa, plan de migración, inventario de limpieza. Leer cuando haya que decidir refactors.

Estas reglas son vinculantes para código nuevo. Convertir código legacy es incremental (scout rule, no refactor masivo).

---

## Reglas de Eficiencia (OBLIGATORIAS — aplicar siempre sin que el usuario las pida)

### Modelo según complejidad
- **Haiku**: CSS, textos UI, renombrar variables, cambios de una línea
- **Sonnet**: lógica de negocio, bugs, integraciones, componentes React
- **Opus**: arquitectura, decisiones críticas de seguridad, razonamiento complejo multi-archivo

### No releer archivos ya leídos
Si un archivo ya fue leído en esta sesión, usar el contenido del contexto. Solo releer si el archivo fue editado después de la última lectura.

### Siempre referenciar archivo:línea
Cada cambio debe indicar el archivo exacto y número de línea. Nunca describir un cambio sin apuntar la ubicación precisa.

### Backend de producción = functions/src/
El backend real es `functions/src/intelligenceApi.ts` (Firebase Cloud Functions), NO `backend/src/`. Siempre modificar el correcto. Después de editar `functions/src/*.ts` se debe compilar con `cd functions && npm run build` antes de deployar.

### Compactar proactivamente
Cuando el contexto supera 10 archivos abiertos o la sesión lleva más de 30 minutos de trabajo intenso, sugerir `/compact` antes de continuar con una nueva tarea.

### Respuestas concisas
- Máximo 2-3 oraciones de contexto antes de actuar
- No explicar lo que se va a hacer, hacerlo directamente
- No resumir al final lo que se acaba de hacer

### OBLIGATORIO antes de cada deploy: `bash scripts/check_integrity.sh`
Este script detecta patrones de truncamiento que vienen ocurriendo al editar archivos grandes. Chequea bytes null, exports críticos en `functions/src/index.ts`, y corre `tsc --noEmit` en frontend y functions. Exit 0 = OK para deploy. No desplegar si marca problema.

### Patrón de truncamiento observado
Archivos grandes editados con `Edit` de strings largos o `>>` heredocs a veces quedan truncados a mitad de expresión. Ya ocurrió en `intelligenceApi.ts`, `index.ts`, `gtfsRealtime.ts`, `scheduleComplianceEngine.ts`, `forecastService.ts`, `competitionService.ts`, `ShadowRadar.tsx`.

**Mitigaciones aplicables en orden de preferencia:**
1. **Python atómico con `os.replace(tmp, path)`** — escritura a temporal + rename atómico. Lo más seguro para cambios grandes.
2. **Edits múltiples pequeños** (1-20 líneas cada uno) en lugar de un Edit gigante. Verificar con `tsc --noEmit` después de cada uno.
3. **Correr `scripts/check_integrity.sh`** al final para capturar cualquier truncamiento residual (bytes null, exports faltantes).
4. Si un archivo queda corrupto, limpiar bytes null con `python3 -c "open('file','wb').write(open('file','rb').read().replace(b'\x00', b''))"` y reaplicar cambios faltantes con Edit o append verificado.

---

## ¿Qué es este proyecto?
Sistema ERP + inteligencia de mercado para el **sistema metropolitano de transporte público de Uruguay** (Montevideo + área metropolitana).
Nombre: **SkillRoute** (antes TransformaFacil 2.0) / **GestionUcot** (nombre heredado del repo, no del producto).
Propósito: Análisis competitivo cross-operador, gestión de flota, KPIs, pronósticos de ingresos, agentes digitales.

## 🎯 Alcance del producto (DIRECTRIZ 2026-04-24)
**SkillRoute NO es un producto para UCOT. Es un producto para TODO el sistema metropolitano de Uruguay.**

- Operadores en scope desde el MVP: **UCOT (70), CUTCSA (50), COME (20), COETC (10)** + cualquier otro operador del sistema metropolitano que se sume.
- Los datos UCOT específicos que ya existen en el repo (cartones, documentos, nóminas, boletines) son **demo / prueba de concepto** — sirvieron para demostrar que con un operador ya funciona. No son el producto final.
- Toda funcionalidad nueva debe ser **cross-operador por diseño**: la empresa propia es una variable, no un hard-code.
- Todo algoritmo nuevo (ej. matriz DRO, HRR, market share por corredor) se calcula para el sistema completo y se presenta filtrable por operador.
- Ninguna mejora puede romper funcionalidad actual. Solo agregar capacidad o corregir. Las features específicas de UCOT que ya existen se preservan como "demo multi-tenant" hasta migrarlas al modelo genérico.
- El pitch a CUTCSA se apoya en esto: el diferenciador es la inteligencia de la red completa, imposible de reproducir por un operador individual.

## Stack Técnico
| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Backend | Express.js + TypeScript (puerto 3002) |
| Base de datos | Firebase Firestore (NoSQL) |
| Auth | JWT + Firebase Auth |
| Real-time | Socket.io |
| Deploy | Firebase Hosting + Docker |
| Cloud Functions | Firebase Functions (Node 20) — **backend de producción real** |
| Mobile | Capacitor (Android) + Electron (Desktop) |

## Rutas Clave del Proyecto
```
GestionUcot/
├── backend/src/          ← backend local (dev/pruebas)
├── frontend/src/
│   ├── pages/            ← 31+ vistas
│   ├── components/       ← 50+ componentes
│   └── services/         ← Llamadas al backend
├── functions/src/
│   └── intelligenceApi.ts ← BACKEND DE PRODUCCIÓN (Firebase Cloud Functions)
├── firestore.rules
├── firestore.indexes.json
└── CLAUDE.md
```

## Estado Actual del Sistema (Abril 2026)
- **Completitud general:** ~60-65%
- **Código base:** 85% completo (606 archivos, 124K líneas)
- **Funcionalidad real:** ~50% operativa

## Problemas Críticos Conocidos

### ✅ SEGURIDAD — Firestore RBAC (resuelto en commit 97093ce6, 2026-04-12)
Las reglas ya tienen RBAC por rol (`isAdminNorm`, `isTrafficOrAdmin`, etc.) más
fallback default seguro. Pendiente menor: verificar deploy a Firebase y añadir
reglas explícitas para colecciones con naming inconsistente
(`vehicles` vs `vehiculos`, `lines` vs `lineas`).

### 🟡 DATOS — Ingesta GPS real funcionando, scraper de horarios pendiente
**Lo que funciona (2026-04-17):**
- `backend/src/services/immRealtimeService.ts` — cliente del endpoint público
  `POST https://www.montevideo.gub.uy/buses/rest/stm-online` que devuelve
  GeoJSON con TODOS los buses operando (~300+ buses en cualquier momento).
- `backend/src/services/competitorsIngestionService.ts` — agrega por empresa
  (10=COETC, 20=COME, 50=CUTCSA, 70=UCOT), excluye UCOT y materializa la
  colección Firestore `competidores` con datos reales.
- Smoke test confirmado: 312 buses en <500ms.

**Pendiente:**
- Scraper JSF de horarios/paradas por línea.
- Scheduler/Cloud Function para refresh periódico.

### 🟢 ShadowRadar — datos live cross-operador (fix 2026-04-24)
Corregidos: TDZ en useEffect, truncamiento de archivo, race condition entre
listeners, filtro estricto de dirección (destino coincidente + heading ≤60°),
buses sin `linea` ahora se descartan en las 3 fuentes (IMM, vehicle_events,
viajes_activos). Plan de evolución: matriz DRO offline + snap-to-shape (MVP),
HRR en vivo (v2), dashboard corredores seat-km (v3). Todo cross-operador desde
el MVP — ver DIRECTRIZ 2026-04-24.

### 🟡 FUNCIONALIDAD INCOMPLETA
- Socket.io integrado pero listeners faltantes en frontend
- Mobile app (Capacitor) configurada pero APK no generada

## Skills Instaladas
| Skill | Para qué usarla |
|-------|----------------|
| `ucot-diagnostics` | Diagnóstico completo del sistema |
| `gtfs-integration` | Estándar GTFS, integración Google Maps/Moovit |
| `transport-kpis-uitp` | KPIs internacionales UITP/benchmarking |
| `transport-security` | Hardening Firestore, RBAC, JWT |
| `transit-forecasting` | Pronósticos de demanda (SARIMA, elasticidades) |
| `ucot-real-data` | Ingesta de datos reales desde Excel e IMM API |
| `notebooklm` | Automatización de Google NotebookLM |
| `equipo-agentes` | Routing automático Haiku/Sonnet/Opus |

## Fuentes de Datos Públicas Disponibles

**Funcionando ahora (verificadas 2026-04-17):**
```
GPS en vivo (POST):  https://www.montevideo.gub.uy/buses/rest/stm-online
  body: {"empresa": "70"}  (10=COETC, 20=COME, 50=CUTCSA, 70=UCOT, -1=todas)
  resp: GeoJSON con linea, sublinea, codigoEmpresa, variante, destinoDesc, lat/lng
  → cliente: backend/src/services/immRealtimeService.ts
```

**No usar (devuelven 403/bloqueado):**
```
api.montevideo.gub.uy/api/publictransport/  → 403
catalogodatos.gub.uy                          → WAF bloquea acceso programático
```

## Módulos del Sistema
| Módulo | Archivo principal | Estado |
|--------|-----------------|--------|
| Dashboard CEO | `CEODashboard.tsx` | 🟡 Parcial |
| Análisis Competencia | `CompetitorIntelligencePage.tsx` + `competitionService.ts` | 🟡 GPS real OK; horarios pendientes |
| Gestión Cartones | `CartonManager.tsx` + `cartonService.ts` | 🟡 Funcional (demo UCOT) |
| Pronósticos | `EconomicProjectionsPage.tsx` + `forecastService.ts` | 🟡 Sin datos reales |
| Flota | `FleetMonitorModule.tsx` + `fleetService.ts` | 🟡 Básico |
| ShadowRadar | `ShadowRadar.tsx` | 🟢 Live cross-operador (2026-04-24) |
| Agentes Digitales | `DigitalAgentsModule.tsx` | 🔴 Incompleto |
| Seguridad | `firestore.rules` | 🟢 RBAC OK |

## Glosario del Proyecto
| Término | Significado |
|---------|-------------|
| UCOT | Unión de Cooperativas de Omnibus del Transporte (operador) |
| STM | Sistema de Transporte Metropolitano (regulador Montevideo) |
| IMM | Intendencia Municipal de Montevideo |
| Cartón | Hoja de ruta diaria de un conductor (horarios + paradas) |
| Boletín | Documento oficial con tiempos de tránsito entre paradas |
| Variante | Recorrido alternativo de una misma línea (ej: 300a, 300b) |
| Shadow | Rastreo de posición de vehículos de competencia |
| DRO | Directional Route Overlap — % de ruta A cubierta por ruta B en mismo sentido (TCRP 195) |
| HRR | Headway-to-Rival Ratio — headway propio / tiempo al próximo rival en el tramo compartido |

## Prioridades Actuales (Abril 2026)
1. ~~Conectar datos reales desde IMM~~ — ✅ GPS lista. Falta scraper JSF horarios.
2. ~~Corregir reglas Firestore~~ — ✅ Hechas (commit 97093ce6).
3. ~~Fix ShadowRadar datos estáticos~~ — ✅ Resuelto (2026-04-24).
4. **🟢 MVP matriz DRO cross-operador** — reemplazar heurística destino/heading actual
5. Schedule/Cloud Function refresh periódico `competidores`
6. Scraper JSF horarios reales por línea
7. v2 HRR en vivo + v3 dashboard seat-km market share
8. Completar listeners Socket.io frontend
9. Generar APK Android

## Notas de Contexto
- Jonathan no es programador — es emprendedor con conocimiento profundo del negocio de transporte
- Presentación inminente a **CUTCSA** (empresa 50, mayor operador de Montevideo)
- CUTCSA tiene departamento tecnológico propio, desarrollan hardware y software internamente
- CUTCSA accede a cámaras de seguridad de todos los buses de Montevideo
- El diferenciador real de SkillRoute: datos cruzados de TODOS los operadores (UCOT+COME+COETC+CUTCSA) — imposible de replicar internamente por cualquier operador individual
- Pitch central: no vendemos software, vendemos inteligencia del mercado completo
- Prioridad absoluta: simulador de ingresos + ROI en reducción de inspectores + gestión de desvíos con notificación a conductores
- El objetivo es un sistema de nivel internacional (estándares UITP, GTFS, TCRP)
