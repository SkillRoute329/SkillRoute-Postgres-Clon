# TransformaFacil 2.0 — Memoria del Proyecto
> Leer este archivo al inicio de cada sesión para no desperdiciar créditos re-explicando el contexto.

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

---

## ¿Qué es este proyecto?
Sistema ERP de gestión integral de transporte público para **UCOT** (Uruguay).  
Nombre del sistema: **SkillRoute** (antes TransformaFacil 2.0) / **GestionUcot**  
Propósito: Análisis competitivo, gestión de flota, KPIs, pronósticos de ingresos, agentes digitales.  
**Plataforma multi-empresa** — no solo UCOT, se venderá a cualquier operador de transporte.

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

### 🔴 ShadowRadar — datos estáticos (pendiente fix)
`/dashboard/traffic/shadow-radar` muestra datos estáticos.
- `viajes_activos` está vacío (no hay app mobile corriendo)
- `shadowDispatcher` requiere `cartones_de_servicio` activos — sin ellos no genera alertas
- Fix pendiente: usar `vehicle_events` (agencyId=70, últimos 8 min) como fuente UCOT y STM para rivales

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
| Gestión Cartones | `CartonManager.tsx` + `cartonService.ts` | 🟡 Funcional |
| Pronósticos | `EconomicProjectionsPage.tsx` + `forecastService.ts` | 🟡 Sin datos reales |
| Flota | `FleetMonitorModule.tsx` + `fleetService.ts` | 🟡 Básico |
| ShadowRadar | `ShadowRadar.tsx` | 🔴 Datos estáticos — fix pendiente |
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

## Prioridades Actuales (Abril 2026)
1. ~~Conectar datos reales desde IMM~~ — ✅ GPS lista. Falta scraper JSF horarios.
2. ~~Corregir reglas Firestore~~ — ✅ Hechas (commit 97093ce6).
3. **🔴 Fix ShadowRadar** — datos estáticos, crítico para presentación
4. Schedule/Cloud Function refresh periódico `competidores`
5. Scraper JSF horarios reales por línea
6. Completar listeners Socket.io frontend
7. Generar APK Android

## Notas de Contexto
- El desarrollador trabaja con Claude varias veces al día con créditos limitados
- Presentación del proyecto próximamente — priorizar lo visible y funcional
- El objetivo es un sistema de nivel internacional (estándares UITP, GTFS)
- Prioridad: funcionalidad real antes que features nuevas
