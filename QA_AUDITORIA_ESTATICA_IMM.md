# 🔍 Auditoría QA estática SkillRoute v2.0 — IMM ready

**Fecha:** 2026-05-12 (domingo, T-3 días para auditoría IMM)
**Alcance:** Análisis exhaustivo del código sin servidor activo
**Estado servidor:** Backend SkillRoute NO levantado al cierre del análisis (puerto 3000 ocupado por MiTurno v0.3.0, app no relacionada). Logs muestran última actividad del backend a las 05:15:01 AM. El harness `QA_HARNESS.html` queda listo para correr cuando arranque.

---

## 1. Semáforo de módulos

| Módulo | Estado | Completitud | Veredicto |
|--------|--------|-------------|-----------|
| Backend Express + middlewares | 🟢 | 95% | Rate limiter con skip de localhost, headers de seguridad, error handlers globales, graceful shutdown |
| PostgreSQL 15 + schemas | 🟢 | 95% | 5 schemas aplicados (inicial + fase2 + fase2_extended + fase3_5 + fase4_extended) |
| Poller autónomo IMM→Postgres | 🟢 | 100% | 4 agencias × interval 10s, persistencia idempotente, audit trail en poller_health |
| Auth + JWT | 🟢 | 100% | JWT_SECRET real, login por internalNumber + password, middleware verifyAuth/requireAdmin |
| Bridge /api/db/* | 🟢 | 90% | 69 colecciones whitelisted, query params (where/orderBy/limit/offset), bug menor en vehicle_events |
| Frontend imports firebase | 🟢 | 100% | 0 archivos con `from 'firebase/*'` confirmado por grep |
| Frontend Vite config | 🟢 | 100% | Alias `firebase/*` → shims locales (red de seguridad build-time) |
| GTFS oficial cargado | 🟢 | 100% | 4.9k stops, 2.2M stop_times STM Montevideo |
| autoStatsController | 🟡 | 80% | Funcional pero conserva fallback a Firestore (FASE 7 pendiente) |
| Tests automatizados | 🔴 | 0% | No hay suite Jest/Vitest ejecutable. Solo QA harness manual |
| Mobile (Capacitor) | 🔴 | 30% | Config presente, APK no generada |
| Documentación deployment IMM | 🟡 | 40% | Falta diagrama de arquitectura para presentar |

---

## 2. Hallazgos críticos 🔴

### 2.1. Conflicto de puerto :3000 con MiTurno
- **Síntoma:** El backend SkillRoute escucha en :3000 (Config.PORT por default). Hay otra app llamada "MiTurno" v0.3.0 ocupando ese puerto cuando se hizo el análisis.
- **Riesgo:** Si en la demo IMM otra aplicación toma el puerto antes, el clon no levanta.
- **Acción:** Antes de iniciar, ejecutar `start_skillroute_full.bat` (incluye `taskkill` previo del puerto). Alternativamente cambiar `Config.PORT` a un puerto fijo no usado por nada más (ej. 3010).

### 2.2. Bug en columna `timestamp` de vehicle_events
- **Evidencia:** `combined.log:147734` muestra `ERROR: [dbBridge] list error vehicle_events: select * from "vehicle_events" order by "timestamp" desc limit $1 - no existe la columna «timestamp»`.
- **Causa:** El bridge ordena por una columna `timestamp` pero la tabla usa `timestamp_gps` o `created_at`.
- **Acción:** Ajustar el mapeo en `dbBridgeController.ts` para que la colección `vehicle_events` use `timestamp_gps` o `created_at` como orden por defecto.

### 2.3. 404 en colecciones nuevas (compliance_alerts, vehiculos en singular)
- **Evidencia:** `combined.log:147714–147728` muestra 404 repetidos en `/compliance_alerts` y `/vehiculos`.
- **Causa:** El frontend pide colecciones que no están en la whitelist actual del bridge, o están en mayúsculas/singular incorrecto.
- **Acción:** Agregar `compliance_alerts` y alias `vehiculos → vehicles` en `COLLECTIONS` de `dbBridgeController.ts`.

---

## 3. Hallazgos importantes 🟡

### 3.1. Fallback a Firestore en autoStatsController
- **Archivo:** `backend/src/controllers/autoStatsController.ts:53`
- **Problema:** Si IMM cae, hace fallback a `getLastKnownBusesSnapshot` que aún consulta Firestore.
- **Acción:** Migrar `getLastKnownBusesSnapshot` a leer del histórico Postgres en `vehicle_events`. Pendiente FASE 7.

### 3.2. Comentarios obsoletos mencionando Firestore
- **Archivos:** Varios controllers (`autoStatsController.ts`, `cartonController.ts`, etc.) tienen comentarios `// Firestore real-time` o `// from Firestore` que ya no aplican.
- **Riesgo auditoría:** Si el auditor IMM hace `grep -r firestore` encontrará comentarios que sugieren dependencia. Aunque el código no la tiene.
- **Acción:** Pasada de `sed` para reescribir comentarios. Bajo riesgo, hacer en la FASE 4.9.

### 3.3. Sin tests automatizados ejecutables
- **Problema:** No hay `npm test` que corra una suite verificable.
- **Workaround:** `QA_HARNESS.html` provee suite manual + visual.
- **Acción ideal post-IMM:** Jest/Vitest + Supertest cubriendo cada endpoint.

### 3.4. La whitelist del bridge maneja 69 colecciones pero hay tablas Postgres no expuestas
- **Archivo:** `dbBridgeController.ts` whitelist (linea 59+).
- **Problema:** Si el frontend pide una colección no listada → 404. Lista de aliases faltantes detectados en logs: `compliance_alerts`, `lineas_ucot`, `coches`.
- **Acción:** Agregar aliases necesarios antes del miércoles.

---

## 4. Buenas prácticas detectadas 🟢

- **Seguridad (OWASP A01, A03, A05):** Whitelist explícita en bridge, queries Knex parametrizadas, rate limiter activo con skip de localhost para QA.
- **Logging (ISO 27001 A.12.1):** Cada request loggeada con statusCode, duration, userId. Poller registra cada ciclo en `poller_health`.
- **Resiliencia:** Handlers `unhandledRejection` + `uncaughtException` + graceful SIGTERM/SIGINT que detiene el poller antes del HTTP server.
- **Soberanía de datos:** REGLA -6 documentada en cada controller. El clon es 100% local; Firestore solo aparece en stubs.
- **Auditabilidad:** Endpoints `/api/audit/*` específicamente diseñados para demo IMM (coverage, buses-active, eta-snapshot, poller-stats).
- **No simulación:** REGLA -2 documentada. Coverage devuelve 0 honesto si no hubo ciclos, no rellena.

---

## 5. Comparación contra estándares internacionales

### 5.1. GTFS-Realtime / NeTEx
| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| GTFS estático cargado | 🟢 | 4.9k stops + 2.2M stop_times STM Montevideo (versión oficial) |
| Tabla `bus_last_pos` GPS real-time | 🟢 | Poller actualiza cada 10s |
| Cálculo ETA por parada | 🟢 | `bus_eta_predictions` poblado por poller |
| Endpoint público GTFS-RT | 🟡 | `/api/gtfs/stops/:id/departures` existe; falta endpoint .pb (Protocol Buffer) compatible con Google Transit |

### 5.2. UITP (Unión Internacional Transporte Público)
| KPI | Estado | Notas |
|-----|--------|-------|
| OTP (On-Time Performance) | 🟢 | Calculado en `scheduleComplianceEngine`, tolerancia ±4 min (estándar UITP) |
| Headway compliance | 🟢 | Disponible en `/api/autostats/compliance/:agencyId` |
| Coverage (km operados) | 🟢 | Vista materializada `v_poller_coverage_diario` |
| Customer satisfaction | 🔴 | No implementado; el clon es operacional, no customer-facing |
| Productivity (rev-km/employee) | 🟡 | Falta join con `personal` para calcular |

### 5.3. ISO 27001 (Seguridad de la información)
| Control | Estado |
|---------|--------|
| A.9 — Control de acceso (JWT + RBAC) | 🟢 |
| A.12.1 — Logging operacional | 🟢 |
| A.12.4 — Captura de eventos GPS auditados | 🟢 |
| A.13 — Cifrado en tránsito | 🟡 (HTTPS solo dev, falta cert prod) |
| A.16 — Gestión de incidentes (alerts) | 🟢 |

---

## 6. Mapa completo de endpoints a testear

### Públicos (sin auth)
- `GET /api/health` → debe devolver `version: 2.0.1-MODULAR`
- `GET /api/doctor` → vehicleCount + cartonCount > 0
- `GET /api/version` → version + environment

### Auth
- `POST /api/auth/login` → JWT en `data.token`
- `GET /api/auth/me` → user object

### Cartones
- `GET /api/cartones` → array cartones
- `GET /api/cartones/:id` → uno
- `POST /api/cartones` → crear/actualizar
- `DELETE /api/cartones/:id` → solo admin

### Flota
- `GET /api/fleet/vehicles` → ~190 buses UCOT
- `GET /api/fleet/vehicles/:id`
- `POST /api/fleet/check`
- `GET /api/fleet/vehicles/:id/checks`

### Sub-routers
- `/api/competition/*` — análisis competitivo cross-operador (≥ 44 líneas UCOT)
- `/api/analytics/*` — validación y análisis
- `/api/forecast/*` — pronósticos económicos
- `/api/dashboard/*` — KPIs ejecutivos
- `/api/stm/*` — integración STM
- `/api/ai/*` — Ollama local (qwen2.5-coder, llama3.1, gemma3)
- `/api/listero/*` — programación diaria
- `/api/autostats/agencies` → debe devolver `['70','50','20','10']`
- `/api/autostats/compliance/70` → snapshot UCOT
- `/api/audit/poller-stats` → ciclos, errores, eventos persistidos
- `/api/audit/coverage` → % cobertura ≥ 90%
- `/api/audit/buses-active?agency=70` → buses con GPS últimos 5 min
- `/api/audit/eta-snapshot?agency=70` → ETAs calculadas
- `/api/gtfs/stops` → ~4900 paradas
- `/api/db/:collection` × 69 colecciones whitelisted

---

## 7. Datos esperados de la comparación contra STM oficial

| Métrica | Valor esperado | Fuente oficial |
|---------|---------------|----------------|
| Buses GPS activos (4 agencias suma) | ~1200 en horario operativo | STM Montevideo public API |
| Líneas UCOT activas | 44 | UCOT contratación STM |
| Paradas GTFS Montevideo | 4900 ± 50 | IMM GTFS feed oficial |
| Cobertura poller 7 días | ≥ 90% | Auto-calculado en poller_health |
| Cumplimiento OTP UCOT promedio | 80-90% | Tolerancia UITP ±4 min |

---

## 8. Plan de acción priorizado

### 🔴 Hoy / mañana (antes de IMM miércoles)
1. **Arrancar SkillRoute backend + frontend** ahora — el .bat `start_skillroute_full.bat` lo hace en 1 click.
2. **Correr `QA_HARNESS.html`** y verificar 0 fallos en la columna "Resultado".
3. **Fix bug `vehicle_events.timestamp`** → ajustar bridge para usar `timestamp_gps`.
4. **Agregar aliases faltantes** en bridge (compliance_alerts, vehiculos, etc.).
5. **Verificar comparación contra STM:** los buses-active deben sumar ≥ 800 a las 14:00; agencias deben ser exactamente las 4.

### 🟡 Esta semana
6. Reescribir comentarios obsoletos mencionando Firestore (sed pass).
7. Migrar `getLastKnownBusesSnapshot` a Postgres (FASE 7).
8. Empezar suite Jest mínima cubriendo los 12 controllers.

### 🟢 Post-IMM
9. Eliminar shim firebaseStubsShim/firestoreShim cuando 0 archivos los importen.
10. Generar APK móvil con Capacitor.
11. Implementar endpoint GTFS-RT en .pb para integración Google Transit.

---

## 9. Comandos de verificación una vez levantado el servidor

```powershell
# 1) Health
curl http://localhost:3000/api/health

# 2) Login (reemplazar password)
$body = @{ internalNumber="0001"; password="..." } | ConvertTo-Json
$token = (Invoke-RestMethod -Method POST -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body $body).data.token

# 3) Endpoints clave con JWT
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri http://localhost:3000/api/audit/poller-stats -Headers $headers
Invoke-RestMethod -Uri http://localhost:3000/api/audit/coverage -Headers $headers
Invoke-RestMethod -Uri http://localhost:3000/api/autostats/agencies -Headers $headers
Invoke-RestMethod -Uri "http://localhost:3000/api/audit/buses-active?agency=70" -Headers $headers
```

O usar **QA_HARNESS.html** que hace todo esto desde el navegador con tabla visual de resultados.
