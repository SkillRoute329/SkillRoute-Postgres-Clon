# Política OTP Unificada — SkillRoute

**Vigencia:** 2026-05-04 → presente
**Aplica a:** todos los módulos que calculen, persistan o muestren cumplimiento (OTP).
**Origen:** `docs/ORDEN_CODE_POLITICA_OTP_UNIFICADA_2026_05_04.md` (post-demo CUTCSA, 5 inconsistencias detectadas en QA cross-módulos).

---

## Reglas canónicas

| Regla | Valor canónico | Fuente |
|---|---|---|
| Tolerancia EN_TIEMPO | **±4 min** | TCRP 165 / IMM Uruguay (`autoStatsCollector.SNAP_TOL_MIN`) |
| Definición EN_TIEMPO | `estado === 'EN_TIEMPO'` **OR** `\|desv\| ≤ 4` | Cualquiera de las dos condiciones cuenta como en tiempo. |
| Atrasado estricto | `estado === 'ATRASADO'` **AND** `desv > +4` | No se solapa con EN_TIEMPO. |
| Adelantado estricto | `estado === 'ADELANTADO'` **AND** `desv < -4` | No se solapa con EN_TIEMPO. |
| Denominador OTP | `enTiempo + atrasado + adelantado` | Excluye `SIN_HORARIO` y `FUERA_DE_SERVICIO` — son "no medibles", no incumplimiento. |
| FUERA_DE_SERVICIO | Descartar SIEMPRE en cálculos de OTP | Se preserva en `vehicle_events` para auditoría, pero ningún % lo cuenta. |
| SIN_HORARIO | Excluir del denominador OTP | Se reporta aparte como `pctSinHorario`. |
| Sentido | Lectura del evento (`sentido`) | Único módulo autorizado a calcular sentido: `autoStatsCollector.ts`. |
| `confianzaSentido` | Persistir y respetar | Eventos con `confianzaSentido = ZERO` tienen `sentido = null`. |

---

## Módulos que tocan OTP

| Módulo | Rol | Archivo |
|---|---|---|
| `autoStatsCollector` | **Escritor** — clasifica cada evento GPS y persiste `estadoCumplimiento` + `desviacionMin` | `functions/src/autoStatsCollector.ts` |
| `etapaStatsTick` | **Agregador** — OTP por parada cada 30 min | `functions/src/etapaStatsTick.ts` |
| `otpEngine` | **Agregador en vivo** — `bus_delays` + `otp_summary` por línea cada 10 min | `functions/src/otpEngine.ts` |
| `vehicleStatsTick` | **Agregador** — OTP diario por coche | `functions/src/vehicleStatsTick.ts` |
| `conductorStatsTick` | **Agregador** — OTP diario por conductor | `functions/src/conductorStatsTick.ts` |
| `marketPenetration` | **Agregador** — share por línea (excluye FUERA_DE_SERVICIO) | `functions/src/marketPenetration.ts` |
| `/api/autostats/compliance/:agencyId` | **Lector** — resumen línea+sentido | `functions/src/api/autostats.ts` |
| `CumplimientoPorLineaPro` | **Lector frontend** — fila resumen + matriz | `frontend/src/pages/traffic/CumplimientoPorLineaPro.tsx` |
| `auditoriaService` | **Lector frontend** — auditoría detallada | `frontend/src/services/auditoriaService.ts` |
| `SalidaTimelineModal` | **Lector frontend** — timeline por viaje | `frontend/src/components/...` |

---

## Checklist para módulos nuevos que agreguen OTP

Si agregás un módulo que **calcule, agregue o muestre OTP**, validá ANTES de mergear:

- [ ] Tolerancia EN_TIEMPO = **4 min**, no 3 ni 5.
- [ ] EN_TIEMPO se cuenta con la condición compuesta (`estado === 'EN_TIEMPO'` OR `|desv| ≤ 4`), no solo el estado.
- [ ] FUERA_DE_SERVICIO se filtra **antes** del agregado, no después.
- [ ] SIN_HORARIO no entra en el denominador del % cumplimiento.
- [ ] Adelantados se cuentan como NO en tiempo (no se suman al numerador con enTiempo).
- [ ] Si el módulo lee `sentido`, usa el valor persistido — **no lo recalcula**.
- [ ] Si el módulo es agregador, el comentario referencia este doc.
- [ ] Tests cubren los casos límite: `desv = 4` (EN_TIEMPO), `desv = 5` (ATRASADO), `estado = ATRASADO + desv = 2` (EN_TIEMPO por compuesta).
