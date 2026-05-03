# Módulo: Motor de Consecuencias

## En el negocio

Cuando ocurre un evento operativo (un conductor falta, un bus se avería, el OTP de una línea cae por debajo del umbral), hay una cadena de efectos: el subsidio se recalcula, el turno queda sin cobertura, el nómina del conductor cambia, el regulador puede aplicar una multa.

El Motor de Consecuencias automatiza esa cadena. En lugar de que el gerente tenga que calcular manualmente qué impacto tuvo la ausencia del conductor 342 en el subsidio de la línea 405 de hoy, el sistema lo calcula y lo muestra en tiempo real.

Esto es lo que diferencia a SkillRoute de un sistema de gestión básico: la inteligencia operativa automática con consecuencias reales en dinero, subsidio y regulación.

## Arquitectura del módulo

```
EVENTO OPERATIVO (trigger automático Firestore)
───────────────────────────────────────────────
  → Se crea doc en licencias_personal (conductor con licencia)
  → O se crea doc en daily_shifts (turno nuevo)
  → O OTP cae bajo umbral en otp_daily
  → O vehicle_events registra anomalía

consequenceTriggers.ts (Firestore trigger onDocumentCreated/Updated)
  └─ Detecta el evento
  └─ Lee: datos relacionados (licencias, turnos, OTP, vehículos)
  └─ Llama: consequenceEngine.ts (lógica pura)
  └─ Aplica: reglas de la empresa (rules/ucot.ts)
  └─ Escribe: consequence_events (el resultado completo de la cascada)
              alertas_regulacion (alertas críticas/advertencias)
              subsidy_ledger (impacto en subsidio)
              daily_shifts (salario calculado)

FRONTEND (MotorConsecuencias.tsx)
──────────────────────────────────
  → Muestra el feed de consecuencias en tiempo real
  → Simulador: POST /api/consequencePreview → devuelve cascada sin grabar
  → Disponible en: /dashboard/super-admin/motor-consecuencias
```

## Tipos de evento que disparan consecuencias

| Evento | Trigger | Consecuencias generadas |
|---|---|---|
| Conductor ausente (licencia) | onDocumentCreated `licencias_personal` | Turno sin conductor → buscar reemplazo → nómina ajustada → OTP esperado de la línea cae |
| Turno creado | onDocumentCreated `daily_shifts` | Subsidio esperado calculado → salario asignado |
| OTP bajo umbral | onDocumentCreated `otp_daily` | Alerta regulatoria → riesgo de descuento subsidio |
| Anomalía GPS | onDocumentUpdated `vehicle_events` | Alerta operativa según umbrales de parametros_sistema |

## Reglas de empresa (rules/)

Las reglas definen los umbrales y consecuencias específicas de cada operador:
- `functions/src/rules/ucot.ts` — reglas UCOT (umbrales subsidio, tipo licencias, etc.)
- `functions/src/rules/index.ts` — router de reglas por empresa

Para agregar un nuevo operador: crear `rules/cutcsa.ts` con los mismos tipos que `ucot.ts`.

## Colecciones involucradas

| Colección | Rol | Quién la llena | Quién la lee |
|---|---|---|---|
| `licencias_personal` | Dispara el motor | LicenciasService (frontend) | consequenceTriggers (trigger) |
| `daily_shifts` | Dispara el motor + recibe salario calculado | ShiftService (frontend) | consequenceTriggers (trigger + update) |
| `otp_daily` | Dispara motor si OTP bajo | consequenceTriggers (a su vez) | consequenceTriggers (trigger) |
| `vehicle_events` | Dispara motor si anomalía | autoStatsCollector | consequenceTriggers (trigger) |
| `consequence_events` | Resultado completo de la cascada | consequenceTriggers | Frontend MotorConsecuencias, auditoría |
| `alertas_regulacion` | Alertas críticas del motor | consequenceTriggers, shadowDispatcher | Frontend, gtfsRealtime, historicMetrics |
| `subsidy_ledger` | Impacto en subsidio por evento | consequenceTriggers | Frontend finanzas |

## Consecuencias de tocar partes del módulo

| Si tocás... | Se rompe... |
|---|---|
| Schema de `consequence_events` | Frontend MotorConsecuencias deja de renderizar cascadas |
| `consequenceEngine.ts` (lógica pura) | Todas las consecuencias se calculan mal — verificar con simulador antes de commitear |
| `rules/ucot.ts` | Reglas UCOT incorrectas — subsidio calculado mal |
| Schema de `licencias_personal` | El trigger no dispara correctamente |
| `consequenceTriggers.ts` | Ninguna consecuencia se propaga automáticamente |
| Rewrite `/api/consequencePreview` en firebase.json | El simulador del frontend da "Cannot POST" — mover el rewrite ANTES de `/api/**` |

## Archivos del módulo

| Archivo | Ubicación | Rol |
|---|---|---|
| consequenceEngine.ts | functions/src/ | Lógica pura de cascadas |
| consequenceTriggers.ts | functions/src/ | Triggers Firestore + escritura |
| rules/ucot.ts | functions/src/rules/ | Reglas específicas UCOT |
| rules/index.ts | functions/src/rules/ | Router de reglas por empresa |
| MotorConsecuencias.tsx | frontend/src/pages/traffic/ | UI — feed + simulador |

## Estado

| Componente | Estado |
|---|---|
| consequenceEngine (lógica) | ✅ Activo |
| consequenceTriggers (Firestore triggers) | ✅ Activo |
| Reglas UCOT | ✅ Activo |
| MotorConsecuencias.tsx (UI) | ✅ Funcional |
| Simulador (/api/consequencePreview) | ✅ Funcional post-fix rewrite (2026-05-02) — 7 efectos devueltos |
| Reglas CUTCSA/COME/COETC | ❌ Pendiente — solo UCOT implementado |
