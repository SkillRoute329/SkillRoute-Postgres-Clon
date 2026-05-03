# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

**Última actualización:** 2026-05-03 — Sesión OCR Distribuciones + Rendimiento Conductores

> 🎯 **ARQUITECTURA**: Sistema metropolitano completo — COETC (10), COME (20), CUTCSA (50), UCOT (70). Jonathan es super-admin con visión de todos los operadores.

---

## ✅ MÓDULOS COMPLETADOS EN ESTA SESIÓN

| Módulo | Descripción | Estado |
|---|---|---|
| OCR Distribuciones | 8.097 registros cargados en `distribuciones_diarias` (31 fechas, marzo-abril 2026) | ✅ En Firestore |
| conductor_stats | 68 conductores UCOT con OTP real del 29-abr en `conductor_stats` | ✅ En Firestore |
| conductorStatsTick | Cloud Function cron 23:30 — cruza vehicle_events × distribuciones diariamente | ✅ Compilado |
| API conductor-ranking | `GET /api/autostats/conductor-ranking/:agencyId` — lee `conductor_stats` | ✅ Código listo |
| RendimientoConductores | Nueva UI tab "Rendimiento Conductores" en MapaFlotaHub | ✅ Código listo |

### Detalles técnicos del cruce conductor-stats
- **Colección fuente 1**: `distribuciones_diarias/{fecha}/registros` — qué conductor manejó qué coche
- **Colección fuente 2**: `vehicle_events` — GPS real IMM, estadoCumplimiento por evento
- **Clave de join**: `String(coche) === idBus`
- **Colección destino**: `conductor_stats/{agencyId}_{interno}` (ej: `70_5`)
- **Estructura**: `{interno, nombre, diasActivos, totalEventos, pctEnTiempo, pctAtrasado, pctAdelantado, pctSinHorario, velocidadMedia, desviacionMediaMin, cochesOperados, lineasOperadas, ultimaActividad, historial[{fecha, coche, turno, servicio, pctEnTiempo, ...}]}`
- **Acumulación**: merge incremental por día — el cron diario agrega el día de hoy sin borrar historial anterior
- **Backfill realizado**: 29-abr-2026 (único día con solapamiento distribuciones × vehicle_events disponible)

### Por qué solo 29-abr en el backfill
- `vehicle_events` tiene datos de abr-25 a may-3 (TTL ~10 días en la práctica)
- `distribuciones_diarias` tiene registros tipo A (conductores) en: 10-mar, 7-20 abr, 29-abr
- Único solapamiento histórico posible: **29 de abril** (93 coches asignados × 7440 eventos GPS = 68 conductores cruzados)
- **A partir de esta noche**: el cron `conductorStatsTick` acumula automáticamente cada noche a las 23:30

### Scripts y archivos creados/modificados
| Archivo | Tipo | Descripción |
|---|---|---|
| `scripts/cross_reference_conductor_stats.py` | NUEVO | Backfill manual: cruza Firestore por fechas |
| `scripts/load_distribuciones_firestore.py` | MODIFICADO | Fix ADC auth + print ASCII |
| `functions/src/conductorStatsTick.ts` | NUEVO | Cloud Function cron diario 23:30 |
| `functions/src/api/autostats.ts` | MODIFICADO | Nuevo endpoint `GET /conductor-ranking/:agencyId` |
| `frontend/src/services/autoStatsService.ts` | MODIFICADO | Tipos `ConductorSummary` + `fetchConductorRanking()` |
| `frontend/src/pages/traffic/RendimientoConductores.tsx` | NUEVO | UI tabla conductores con historial expandible |
| `frontend/src/pages/traffic/MapaFlotaHub.tsx` | MODIFICADO | 4ta tab "Rendimiento Conductores" |
| `functions/src/index.ts` | MODIFICADO | Export `conductorStatsTick` |
| `firestore.indexes.json` | MODIFICADO | 2 índices para `conductor_stats` |

---

## 📋 PRÓXIMO PASO INMEDIATO

### 1. Commit + deploy (0 errores TypeScript, build limpio)

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot

git add functions/src/conductorStatsTick.ts
git add functions/src/api/autostats.ts
git add functions/src/index.ts
git add functions/lib/
git add frontend/src/pages/traffic/RendimientoConductores.tsx
git add frontend/src/pages/traffic/MapaFlotaHub.tsx
git add frontend/src/services/autoStatsService.ts
git add scripts/cross_reference_conductor_stats.py
git add scripts/load_distribuciones_firestore.py
git add scripts/merge_distribuciones.py
git add firestore.indexes.json
git add docs/

git commit -m "feat(conductor-stats): OTP real por conductor — cruce distribuciones x GPS

- Cloud Function conductorStatsTick (cron 23:30 Mvd): cruza vehicle_events
  del dia con distribuciones_diarias para atribuir OTP a cada conductor
- Endpoint GET /api/autostats/conductor-ranking/:agencyId lee conductor_stats
- UI RendimientoConductores: tabla con OTP%, velocidad, desvio, historial por dia
- Script backfill cross_reference_conductor_stats.py: 68 conductores UCOT cargados
- 8097 registros OCR cargados en distribuciones_diarias (31 fechas)"

git push
```

### 2. Deploy Cloud Function + indexes
```powershell
firebase deploy --only functions
firebase deploy --only firestore:indexes
```

### 3. Verificación visual (browser logueado en skillroute.web.app)
- URL: `https://skillroute.web.app/dashboard/traffic/flota-hub`
- Tab: **"Rendimiento Conductores"**
- Confirmar: ¿aparecen los 68 conductores con OTP%, días activos, coches operados?
- Confirmar: ¿se puede expandir una fila para ver el historial del 29-abr?
- Confirmar: ¿el selector UCOT funciona? Las otras empresas muestran "Sin datos" (normal)

---

## 🔄 Estado de los datos en Firestore

| Colección | Documentos | Último dato |
|---|---|---|
| `distribuciones_diarias` | 31 raíz + subcolecciones | 29-abr-2026 |
| `distribuciones_diarias/{fecha}/registros` | 3.274 registros tipo A | — |
| `conductor_stats` | 68 conductores UCOT | 29-abr-2026 |
| `vehicle_events` | TTL ~10 días, cron cada 15min | Vivo |

**Cómo crecer `conductor_stats`:**
1. Cargar nuevas planillas de distribución (OCR) para fechas recientes
2. El cron `conductorStatsTick` cruza automáticamente a las 23:30 cada noche
3. O correr manualmente: `python scripts/cross_reference_conductor_stats.py --days=14`

---

## 🏗️ ARQUITECTURA MULTI-EMPRESA (DIRECTRIZ PERMANENTE)

| Empresa | Código | Datos disponibles |
|---|---|---|
| COETC | 10 | GPS live, GTFS shapes (38), rutas STM, vehicle_events |
| COME | 20 | GPS live, GTFS shapes (22), rutas STM, vehicle_events |
| CUTCSA | 50 | GPS live, GTFS shapes (186), rutas STM, vehicle_events |
| UCOT | 70 | GPS live, GTFS shapes (28), rutas STM + datos internos (691 empleados, 257 coches, cartones, distribuciones, **68 conductores con OTP real**) |

---

## 🐛 Bugs conocidos no críticos

- `serviceAccountKey.json` en `backend_legacy/` tiene JWT inválido — usar ADC de gcloud para scripts Python (`gcloud auth application-default login`)
- 6 shapes GTFS con empresa "STM" (agencyId no reconocido en `AGENCY_CODE_MAP`)
- `persistentMultipleTabManager` Firebase auth: causa cold-start lento (timeout 10s como workaround)
- `otp_summary` puede estar vacío si `otpEngine` no corrió para todos los operadores

---

## 📦 Backlog priorizado

1. **Deploy + verificación visual** — commit + push + firebase deploy + abrir tab "Rendimiento Conductores"
2. **Cargar más distribuciones** — OCR de planillas de mayo para que `conductorStatsTick` tenga datos a cruzar cada noche
3. **M5** — Selector "TODAS" para super-admin (vista comparativa 4 empresas)
4. **M6** — Verificar que `otpEngine` escribe en `otp_summary` para los 4 operadores
5. **Clasificación de coches** — IMM GPS no da motor/tipo. Necesita fuente externa
6. **M7** — Verificar que `droMatrix` sigue corriendo correctamente post-cambio GTFS shapes
