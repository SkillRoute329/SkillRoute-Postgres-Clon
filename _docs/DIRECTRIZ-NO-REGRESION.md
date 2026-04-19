# DIRECTRIZ DE NO REGRESIÓN — TransformaFacil 2.0
**Establecido:** 9 Abril 2026  
**Estado:** CRÍTICO — Vinculante para todos los sprints futuros  
**Versión:** 1.0

---

## ORDEN DE PRIORIDADES INAMOVIBLE

El sistema está en **PRODUCCIÓN con 3 bloqueos críticos**. Este documento establece el orden de corrección y las reglas que NO se pueden violar.

### Ranking de Severidad

| Rango | Problema | Plazo | Responsable | Estado |
|-------|----------|-------|-------------|--------|
| **🔴 P0** | Firestore: 6 colecciones públicas (`allow true`) | **Inmediato (3h)** | Backend | Pendiente |
| **🔴 P0** | Socket.io: 0 listeners implementados (real-time no funciona) | **Inmediato (8h)** | Backend + Frontend | Pendiente |
| **🔴 P0** | Agentes digitales: Solo 7/21 líneas (67% faltante) | **Semana 1 (12h)** | Backend | Pendiente |

---

## REGLAS DE NO REGRESIÓN

### Regla #1: Seguridad es inviolable
```
❌ NUNCA hacer:
  - Dejar colecciones Firestore con "allow true"
  - Pushear código con OWASP A01/A03 (Broken Access Control / Injection)
  - Pasar production sin RBAC completado
  - Usar datos públicos sin validación de fuente

✅ DEBE ocurrir:
  - Todas las colecciones requieren: request.auth != null
  - Role-based access control (RBAC) en cada GET/POST/DELETE
  - JWT con expiry ≤ 15 minutos
  - Antes de cualquier nueva feature
```

### Regla #2: Real-time debe estar funcional
```
❌ NUNCA hacer:
  - Pushear cambios a Firestore sin que Socket.io lo refleje en UI
  - Tener "estándares de actualización" > 5 segundos
  - Permitir que usuarios vean datos "congelados" sin F5

✅ DEBE ocurrir:
  - Cada cambio en Firestore = actualización en UI en < 2 segundos
  - Listeners implementados en: Dashboard, Maps, Alerts, Cartones, Fleet, OTP
  - Tests de real-time con cobertura ≥ 80%
```

### Regla #3: Datos reales, nunca hardcodeado
```
❌ NUNCA hacer:
  - Hardcodear números de línea (300, 306, 316...) en el código
  - Usar datos de prueba en producción
  - Omitir sincronización con API IMM/STM
  - Tener sistemas paralelos (uno con datos reales, otro con hardcoded)

✅ DEBE ocurrir:
  - Todas las 21+ líneas UCOT vienen de base de datos real
  - Agentes digitales configurados para TODAS las líneas, no solo 7
  - API IMM sincronizada cada 5 minutos
  - Antes de completar cualquier análisis (competencia, pronósticos, etc.)
```

### Regla #4: Feature completitud
```
❌ NUNCA hacer:
  - Marcar módulo como "completado" si tiene <70% funcionalidad
  - Pushear código con porcentajes incompletos (50%, 30%)
  - Dejar listeners "preparados" pero no implementados
  - Aprox. que "luego se termina"

✅ DEBE ocurrir:
  - Cada feature: 100% funcional o 0% (en rama separate)
  - Tests pasan antes de merge a main
  - Documentación actualizada simultáneamente con código
  - Code review por 2+ personas para P0
```

---

## PLAN DE CORRECCIÓN INMEDIATO (NO SE PUEDE SALTAR)

### Semana 1 (23 horas en paralelo)
**Ejecutar en paralelo, no secuencial:**

```
Agente #1 (Sonnet — 4h):
  TAREA: Corregir firestore.rules
  - Reemplazar 6 colecciones públicas
  - Implementar RBAC: admin, ceo, traffic_manager, driver, analyst
  - Tests: verificar que anon no puede leer/escribir
  - PR: /transport-security

Agente #2 (Sonnet — 10h):
  TAREA: Implementar Socket.io listeners (8 componentes)
  - Dashboard (real-time KPIs)
  - ServiceMatrix (cambios en cartones)
  - FleetMonitor (posiciones GPS)
  - OTPDashboard (alertas de puntualidad)
  - IncidentCenter (nuevas incidencias)
  - CartonManager (ediciones en vivo)
  - AlertPanel (nuevas alertas)
  - MapComponent (vehículos en tiempo real)
  - PR: /socket-real-time

Agente #3 (Sonnet — 9h):
  TAREA: Completar agentes digitales
  - Configurar líneas faltantes: 221, 317, 371, 379 (+ 6 más)
  - Backend: routing automático en AgentFactory
  - Frontend: DigitalAgentsModule soporta todas las 21
  - Tests: cada línea responde en < 500ms
  - PR: /agents-complete

Agente #4 (Haiku — 1h):
  TAREA: Auditoría de seguridad post-cambios
  - Verificar ninguna colección tiene "allow true"
  - Verificar JWT expiry ≤ 15 min
  - Verificar APIs requieren autenticación
  - Generar reporte
```

### Semana 2 (16 horas)
1. **API STM real** (6h) — conectar datos públicos, no hardcoding
2. **Tests & Coverage** (4h) — mínimo 60% en módulos críticos
3. **APK Android** (4h) — generar build sin errores
4. **Documentación** (2h) — actualizar README y runbooks

---

## MÉTRICAS DE ÉXITO (Deben alcanzarse)

| Métrica | Antes | Objetivo | Deadline |
|---------|-------|----------|----------|
| Colecciones públicas | 6 | **0** | Semana 1 |
| Real-time latency | N/A (no existe) | **< 2s** | Semana 1 |
| Agentes configurados | 7/21 | **21/21 (100%)** | Semana 1 |
| Security tests | 0 | **≥ 10** | Semana 1 |
| Líneas en análisis competencia | 7 | **21** | Semana 2 |
| Test coverage | 0% | **≥ 60%** | Semana 2 |

---

## LO QUE NO CAMBIA

❌ **PROHIBIDO:**
- Agregar features nuevas hasta que P0 esté done
- Usar modelos viejos (ej: competitionService.ts con datos falsos)
- Pushear sin que los 3 cambios pasen tests
- Ignorar reglas OWASP
- Trabajar sin RBAC implementado

✅ **PERMITIDO:**
- Escribir tests mientras se implementa
- Refactor de código legacy en paralelo
- Documentación incremental
- Code reviews rigurosas (esto SIGUE siendo estándar)

---

## FIRMA DIGITAL

**Orden establecida por:** Claude (Equipo de Agentes)  
**Validado por:** Diagnóstico en vivo 9/Abril/2026  
**Estado:** **ACTIVO — Vinculante hasta corrección completa**

```
Hash de validación: TransformaFacil-2.0-P0-20260409
Última revisión: 9 Abril 2026 20:50 UTC
Próxima revisión: 16 Abril 2026 (Semana 2)
```

---

## CÓMO INVOCAR ESTA DIRECTRIZ

En cualquier PR, commit o decision futura, referenciar:
```
"Esta decisión viola DIRECTRIZ-NO-REGRESION.md Regla #[N]"
```

Ejemplo:
```
❌ RECHAZADO: PR que agrega feature nueva sin completar Socket.io
   Violación: DIRECTRIZ-NO-REGRESION.md Regla #2 (Real-time debe estar funcional)
```

---

## PROCESO DE ACTUALIZACIÓN

Esta directriz se puede actualizar SOLO si:
1. Los 3 bloqueos P0 están completamente corregidos ✅
2. Hay consenso del equipo
3. Se crea issue en GitHub: `Update DIRECTRIZ-NO-REGRESION.md`
4. Se documenta el motivo de cambio

Hasta entonces: **INAMOVIBLE**.
