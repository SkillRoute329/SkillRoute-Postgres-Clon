# TransformaFacil 2.0 — Memoria del Proyecto
> Leer este archivo al inicio de cada sesión para no desperdiciar créditos re-explicando el contexto.

---

## ¿Qué es este proyecto?
Sistema ERP de gestión integral de transporte público para **UCOT** (Uruguay).  
Nombre del sistema: **TransformaFacil 2.0** / **GestionUcot**  
Propósito: Análisis competitivo, gestión de flota, KPIs, pronósticos de ingresos, agentes digitales.

## Stack Técnico
| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Backend | Express.js + TypeScript (puerto 3002) |
| Base de datos | Firebase Firestore (NoSQL) |
| Auth | JWT + Firebase Auth |
| Real-time | Socket.io |
| Deploy | Firebase Hosting + Docker |
| Cloud Functions | Firebase Functions (Node 20) |
| Mobile | Capacitor (Android) + Electron (Desktop) |

## Rutas Clave del Proyecto
```
/sessions/nifty-admiring-mccarthy/mnt/GestionUcot/
├── backend/src/
│   ├── services/        ← Lógica de negocio (11 servicios)
│   ├── controllers/     ← HTTP handlers (8 controladores)
│   ├── routes/          ← API endpoints (~40 rutas)
│   └── index.ts         ← Punto de entrada backend
├── frontend/src/
│   ├── pages/           ← 31+ vistas
│   ├── components/      ← 50+ componentes
│   └── services/        ← Llamadas al backend
├── functions/src/       ← Firebase Cloud Functions
├── firestore.rules      ← Reglas de seguridad (RBAC hardcodeado, ver sección Seguridad)
├── firestore.indexes.json
└── CLAUDE.md            ← Este archivo
```

## Estado Actual del Sistema (Abril 2026)
- **Completitud general:** ~60-65%
- **Código base:** 85% completo (606 archivos, 124K líneas)
- **Funcionalidad real:** ~50% operativa

## Problemas Críticos Conocidos

### ✅ SEGURIDAD — Firestore RBAC (resuelto en commit 97093ce6, 2026-04-12)
Las reglas ya tienen RBAC por rol (`isAdminNorm`, `isTrafficOrAdmin`, etc.) más
fallback default seguro. Los `allow true` mencionados en versiones previas de
este archivo NO existen. Pendiente menor: verificar deploy a Firebase y añadir
reglas explícitas para colecciones del frontend con naming inconsistente
(`vehicles` vs `vehiculos`, `lines` vs `lineas`).

### 🟡 DATOS — Ingesta GPS real funcionando, scraper de horarios pendiente
**Lo que funciona (2026-04-17):**
- `backend/src/services/immRealtimeService.ts` — cliente del endpoint público
  `POST https://www.montevideo.gub.uy/buses/rest/stm-online` que devuelve
  GeoJSON con TODOS los buses operando (~300+ buses en cualquier momento).
- `backend/src/services/competitorsIngestionService.ts` — agrega por empresa
  (10=COETC, 20=COME, 50=CUTCSA, 70=UCOT), excluye UCOT y materializa la
  colección Firestore `competidores` con datos reales. Snapshot de auditoría
  en `stm_snapshots`.
- Endpoint `POST /api/competition/sync-from-stm` (admin) dispara la ingesta.
- Smoke test confirmado: 312 buses en <500ms.

**Pendiente:**
- Scraper JSF de `https://www.montevideo.gub.uy/app/stm/horarios/` para
  obtener horarios y paradas de cada línea (requiere mantener jsessionid +
  ViewState entre POSTs).
- Scheduler/Cloud Function para refresh periódico (cada 5-10 min).
- En `competitionService.ts`, los métodos de análisis (`recorrido`, `horarios`,
  `frecuencia`) quedarán vacíos hasta que el scraper JSF llene esos campos.

### 🟡 FUNCIONALIDAD INCOMPLETA
- Socket.io integrado pero listeners faltantes en frontend (real-time no funciona)
- Mapas existentes pero desconectados del análisis de competencia
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

Página de horarios (JSF, requiere sesión):
  https://www.montevideo.gub.uy/app/stm/horarios/
  El HTML inicial trae lista completa de líneas (~140) en un <select>.
  Para horarios por línea hay que hacer POST con jsessionid + ViewState.
  → scraper aún no implementado
```

**No usar (devuelven 403/bloqueado):**
```
api.montevideo.gub.uy/api/publictransport/  → 403 (requiere auth)
catalogodatos.gub.uy                          → WAF bloquea acceso programático
```

## Módulos del Sistema
| Módulo | Archivo principal | Estado |
|--------|-----------------|--------|
| Dashboard CEO | `CEODashboard.tsx` | 🟡 Parcial |
| Análisis Competencia | `CompetitorIntelligencePage.tsx` + `competitionService.ts` + `competitorsIngestionService.ts` | 🟡 Identidad/empresa real (vía GPS STM); horarios/paradas pendientes |
| Gestión Cartones | `CartonManager.tsx` + `cartonService.ts` | 🟡 Funcional |
| Pronósticos | `EconomicProjectionsPage.tsx` + `forecastService.ts` | 🟡 Sin datos reales |
| Flota | `FleetMonitorModule.tsx` + `fleetService.ts` | 🟡 Básico |
| Agentes Digitales | `DigitalAgentsModule.tsx` | 🔴 Incompleto |
| Integración STM | `stmService.ts` + `stmPublicDataScraper.ts` | 🟡 Preparado |
| Seguridad | `firestore.rules` | 🟢 RBAC OK; verificar deploy + cubrir naming inconsistente |

## Glosario del Proyecto
| Término | Significado |
|---------|-------------|
| UCOT | Unión de Cooperativas de Omnibus del Transporte (operador) |
| STM | Sistema de Transporte Metropolitano (regulador Montevideo) |
| IMM | Intendencia Municipal de Montevideo |
| MTOP | Ministerio de Transporte y Obras Públicas (Uruguay) |
| Cartón | Hoja de ruta diaria de un conductor (horarios + paradas) |
| Boletín | Documento oficial con tiempos de tránsito entre paradas |
| Variante | Recorrido alternativo de una misma línea (ej: 300a, 300b) |
| Sentido | Dirección del recorrido (ida / vuelta) |
| Servicio | Un viaje programado en una línea |
| Desvío | Modificación temporal de recorrido por obra o incidente |
| Shadow | Rastreo de posición de vehículos de competencia |

## Prioridades Actuales (Abril 2026)
1. ~~Conectar datos reales desde IMM~~ — ✅ Capa GPS lista (2026-04-17). Falta scraper JSF de horarios.
2. ~~Corregir reglas Firestore~~ — ✅ Hechas (commit 97093ce6). Verificar deploy + cubrir colecciones huérfanas.
3. Schedule/Cloud Function para refresh periódico de `competidores`
4. Scraper JSF para horarios reales por línea
5. Completar listeners Socket.io en frontend (real-time)
6. Generar APK Android
7. Tests automatizados

## Notas de Contexto
- El desarrollador trabaja con Claude varias veces al día
- Los archivos Excel internos de UCOT no están disponibles aún; se trabaja con datos públicos
- El objetivo es un sistema de nivel internacional (estándares UITP, GTFS)
- Prioridad: funcionalidad real antes que features nuevas
