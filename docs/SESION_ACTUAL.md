# SESION ACTUAL — estado vivo

---
## ESTADO ACTUAL — 2026-06-15 (Corrección sistemática de cartones y panel de cumplimiento)

### Credenciales del clon
- internalNumber: `329`
- password: `Skill329`
- rol: SUPERADMIN

### Servicios corriendo (verificado 2026-06-15)
- Backend Express `:3001` UP, administrado por PM2 (`skillroute-backend`)
- Bridge `:3099` UP, administrado por PM2 (`skillroute-bridge`)
- Frontend Vite `:3006` UP
- Postgres local `skillroute_master` en puerto 5432 (last write activo)
- Cobertura GPS real de UCOT: 146 buses activos en las últimas 2 horas

### Cambios hechos esta sesión (2026-06-15)

**Corrección sistemática del Panel de Cumplimiento:**
- **Resolución de discrepancias de fechas:** Se identificó que el backend filtraba los cartones por su fecha de actualización física en base de datos (`updated_at::date = fecha`), en lugar de usar la fecha operativa real en la que el cartón fue planificado. Debido a que el watcher de cartones (`watch_cartones_antigravity.js`) re-procesaba y subía archivos JSON históricos (ej. 23 de mayo) y el disparador de base de datos actualizaba `updated_at` a la fecha actual, el panel mezclaba datos antiguos con el servicio en vivo de hoy, mostrando coches como `NO_SALIO` incorrectamente.
- **Filtros por fecha operativa real:** Modificados los siguientes endpoints en [cartones.routes.ts](file:///c:/SkillRoute_Master/repo/backend/src/routes/cartones.routes.ts):
  - `GET /panel-cumplimiento`
  - `GET /coche/:idBus`
  - `GET /comparativa-etapas/:idBus`
  - `GET /sustituciones`
  Ahora utilizan la fecha de generación operativa almacenada dentro del JSONB: `COALESCE((data_jsonb ->> 'timestamp')::timestamptz::date, updated_at::date) = ?::date`.
- **Restricción del Left Join en coches en servicio:** Modificado el endpoint `/coches-en-servicio-hoy` en [cartones.routes.ts](file:///c:/SkillRoute_Master/repo/backend/src/routes/cartones.routes.ts) para restringir la asociación de buses activos de hoy con cartones correspondientes únicamente al día de hoy (`b.updated_at::date = ?::date`), evitando la multiplicación innecesaria y el cruce de datos históricos.
- **Historial y Recomendaciones:** 
  - Corregido [cartonesHistorialService.ts](file:///c:/SkillRoute_Master/repo/backend/src/services/cartonesHistorialService.ts) (`snapshotHistorial`) para guardar la fecha real de servicio.
  - Corregido [recomendacionesService.ts](file:///c:/SkillRoute_Master/repo/backend/src/services/recomendacionesService.ts) (`porOperador`) para buscar servicios de no-salida según la fecha operativa del JSONB.

**Limpieza Profunda y Eliminación de Duplicados:**
- **Remoción de endpoints redundantes:** Eliminadas las rutas muertas `/api/positions` y `/api/inteligencia/:linea` del archivo [bridge-server.ts](file:///c:/SkillRoute_Master/repo/backend/src/bridge-server.ts), las cuales son cubiertas directamente por el backend central en el puerto `:3001` a través del proxy de Vite.

### Verificaciones realizadas (2026-06-15)
- **Compilación TypeScript:** Ejecutada compilación limpia con `npx tsc --noEmit` en el backend sin errores.
- **Suite de Pruebas Funcionales:** Ejecutada la suite de pruebas mediante `run_qa_suite.ps1` con éxito absoluto (**29 de 29 pruebas pasadas**).
- **Procesamiento de Cartones en vivo:** El endpoint `/api/cartones/panel-cumplimiento` redujo los registros cargados de UCOT de 496 a 107 y bajó a **0** los buses con fallas falsas de `noSalieron` tras corregir el desajuste de fechas.
- **Servicios PM2:** Reiniciados y monitoreados con éxito.
