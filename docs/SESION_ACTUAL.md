# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

**Última actualización:** 2026-05-02 (tarde) — Sprint Pre-Demo completado por Claude Code

> 🎯 **PRESENTACIÓN LUNES 2026-05-04 (probable CUTCSA)**. Sprint Pre-Demo ejecutado. P0+P1+P2 completos y en producción.

---

## ✅ SPRINT PRE-DEMO 2026-05-02 — COMPLETADO

### Lo que se ejecutó esta sesión

| Item | Detalle | Estado |
|---|---|---|
| **P0-A: Fix VITE_API_URL** | `frontend/.env.production` → `skillroute.web.app/api`. Build + deploy hosting | ✅ En prod |
| **P0-B: Fix bug OTP tautológico** | `autoStatsCollector.ts:226-249` — eliminada fórmula `desviacionMin=0` siempre. Ahora reporta `SIN_HORARIO` honesto (63/67 buses UCOT vs 62 EN_TIEMPO falsos) | ✅ En prod |
| **P1-C: Filtro GPS basura** | `autoStatsCollector.ts:303-313` — descarta coordenadas fuera del rango Uruguay (`lat -30/-36, lon -53/-58`). Los sentinela `-258` de STM ya no se graban | ✅ En prod |
| **Fix rewrite firebase.json** | `/api/consequencePreview` movido ANTES de `/api/**`. Sin esto el Motor de Consecuencias no podía simular desde el frontend | ✅ En prod |
| **Deploy functions** | `autoStatsCollectorTick`, `autoStatsCollectorNow`, `intelligenceApi` actualizados | ✅ En prod |

### Descubrimientos clave (lo que Cowork no sabía)

El programa YA TENÍA implementados todos los módulos que Cowork proponía crear:
- `refreshAllStmHorariosTick/Now` — cron de horarios STM (P1-D era duplicado)
- `scheduleAdherence.ts` — agregador diario OTP en `auto_stats_diarios` (P1-E era duplicado)
- `otpEngine.ts` — motor OTP con snap-to-stop usando GPS real de la API IMM
- `MotorConsecuencias.tsx` — componente ya existía en `pages/traffic/`
- `consequenceTriggers.ts` — triggers Firestore ya activos
- Sidebar y App.tsx ya tenían la ruta `/dashboard/super-admin/motor-consecuencias`

### Estado APIs verificadas en producción

| Endpoint | Estado | Nota |
|---|---|---|
| `/api/autostats/health` | ✅ UP desde 2026-04-26 | 0 fallos consecutivos |
| `/api/autostats/compliance/70` | ✅ 67 buses: 63 SIN_HORARIO, 3 EN_TIEMPO, 1 ATRASADO | OTP honesto post-fix |
| `/api/consequencePreview` (POST) | ✅ 7 efectos: RRHH/NOMINA/OPERACIONES/OTP/SUBSIDIO/FINANZAS×2 | Rewrite corregido |
| `autoStatsCollectorNow` | ✅ 745 buses (COETC:104, COME:43, CUTCSA:531, UCOT:67) | Fix GPS activo |

---

## 📋 PRÓXIMO PASO INMEDIATO

**Verificación visual (Jonathan debe confirmar en browser logueado):**

Ir a `https://skillroute.web.app` (Ctrl+Shift+R para limpiar cache) y verificar:

1. **Dashboard principal** `/dashboard`
   - ¿Aparecen alertas con línea + rival + distancia (no solo "RIVAL_PISANDO_TURNO")?
   - ¿El contador de buses muestra ~700 total sin "datos no disponibles"?

2. **Cumplimiento** `/dashboard/traffic/diagnostico-cumplimiento`
   - ¿Tab UCOT ya NO muestra 100% en tiempo? (debe mostrar SIN_HORARIO o distribución variada)
   - ¿Tab CUTCSA, COME, COETC funcionan?

3. **Motor de Consecuencias** `/dashboard/super-admin/motor-consecuencias`
   - ¿El formulario carga?
   - Click "Simular" con CONDUCTOR_AUSENTE → ¿aparece la cascada de efectos (RRHH, Nómina, OTP, etc.)?

4. **CEO Dashboard** `/dashboard/traffic/ceo-dashboard-v7`
   - ¿Carga sin "Error en Módulo"?

5. **Gantt Red** `/dashboard/super-admin/gantt-red`
   - ¿Funciona el Gantt UCOT vs CUTCSA?

**Mensaje de commit listo para ejecutar (si verificación OK):**

```
feat(pre-demo): fix OTP honesto + GPS filtro + rewrite consequencePreview

P0:
- frontend/.env.production: VITE_API_URL → skillroute.web.app/api (root cause stats vacías)
- autoStatsCollector.ts: fix bug matemático desviacionMin=0 por tautología.
  Sin snap-to-shape: reportar SIN_HORARIO honesto vs inventar EN_TIEMPO 100%.
  Verificado: 63/67 buses UCOT ahora SIN_HORARIO, 3 EN_TIEMPO reales, 1 ATRASADO

P1:
- autoStatsCollector.ts: filtrar GPS fuera de Uruguay (sentinela -258 de STM descartado)

Fix crítico:
- firebase.json: mover /api/consequencePreview ANTES de /api/** en rewrites.
  Sin esto, Motor de Consecuencias daba Cannot POST desde el frontend.

Adaptaciones vs ORDEN_MAESTRA original:
- stmHorariosScraperTick: YA EXISTÍA como refreshAllStmHorariosTick (no duplicado)
- dailyAggregator: YA EXISTÍA como scheduleAdherence + historicMetrics (no duplicado)
- MotorConsecuencias.tsx: YA EXISTÍA completo con simulador + triggers
- App.tsx + Sidebar: ya tenían la ruta super-admin/motor-consecuencias

NULs: 0, tsc: 0 errores, build: limpio
```

---

## 📋 Backlog post-lunes (no urgente)

1. **Snap-to-shape OTP real** — usar `otpEngine.ts` (ya existe con snap-to-stop) para reemplazar el SIN_HORARIO transitorio con OTP real. `otpEngine` usa `getBusesEnriquecidosInternal` + paradas GTFS.
2. **Refactor 11 URLs hardcodeadas** a `us-central1-ucot-gestor-cloud.cloudfunctions.net` (colección P3)
3. **Backfill `auto_stats_diarios`** últimos 7 días: `curl .../computeAdherenceNow?date=YYYY-MM-DD&agencyId=70`
4. **Bus GPS basura persistente** — 1 bus (de eventos viejos). Desaparece solo en el próximo ciclo.

---

## Bugs conocidos no críticos

- 1 bus con GPS viejo inválido en `vehicle_events` — desaparece en el próximo ciclo del cron (5 min)
- `regresionOLS.test.ts`: 4 tests fallan — pre-existente, no bloqueante
- `refreshAllStmHorariosNow` timeout en 30s (tarda >30s en scrapear todas las líneas) — el cron diario corre en su schedule normal
- `historicOtp` endpoint requiere `agencyId` sin `empresa` — documentado
