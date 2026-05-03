# ADR 004 — Unificación de colecciones Firestore duplicadas

- **Estado**: aceptado — plan listo, ejecución pendiente de ventana de deploy coordinada
- **Fecha**: 2026-04-24
- **Decisor**: Jonathan (producto) + agente de análisis arquitectónico
- **Vinculado a**: ADR 001 (idioma), `scripts/migrations/` (código de migración)

## Contexto

El análisis arquitectónico reveló **4 pares de colecciones Firestore duplicadas**, cada una con datos parciales escritos por distintas sesiones que eligieron nombres distintos:

| Colección A (ES) | Colección B (EN) | Uso actual |
|-----------------|------------------|-----------|
| `vehiculos` | `vehicles` | Ambas escritas; lectura UI a veces A, a veces B |
| `lineas` | `lines` | Similar |
| `personal` | `users` | `personal` = datos HR; `users` = duplicado con flag `fromExcel` |
| `competidores` | `competitors` | Mayormente en `competidores` (scheduler nuevo) |

Y además:
- `cartones_de_servicio` vs `servicios_ucot` vs `cartones` — tres nombres para el mismo concepto según analysis.

Consecuencias en producción:
- Seeds escriben en ambas para "estar seguros" (ver `registerAdminSeedRoutes`).
- UI queries a veces fallan porque el documento está en la otra.
- Reglas `firestore.rules` duplicadas por seguridad.
- Costos mayores: cada escritura cuesta el doble.

## Decisión

Unificar aplicando la regla de ADR 001: **español para dominio UCOT, inglés para infraestructura**.

### Plan de unificación

| De | A | Razón | Riesgo |
|----|----|-------|--------|
| `vehicles` | `vehiculos` | Dominio UCOT (ES) | Medio — muchos consumidores |
| `lines` | `lineas` | Dominio UCOT (ES) | Medio |
| `personal` | **mantener `personal`** (ES, dominio HR UCOT) | Decisión tomada: es recurso humano de la empresa | Bajo |
| `users` | **mantener `users`** pero solo para cuentas Auth/SSO | Infra (EN) — cuentas de acceso, distinto de personal | Bajo |
| `competitors` | `competidores` | Dominio transporte (ES) | Bajo |
| `servicios_ucot` + `cartones_de_servicio` + `cartones` | `cartones` | Más corto, término original del negocio | **Alto** |

### Separación conceptual personal / users

- **`personal`**: empleados UCOT (conductor, guarda, administrativo...). Datos de RRHH: legajo, cargo, rol operativo, teléfono, estadoHoy.
- **`users`**: cuentas de acceso a la app (email, providerId, roles). Un empleado puede o no tener cuenta `users`.

Esta separación es deliberada, NO es duplicación. El link entre ambos se hace por `internalNumber`.

### Colecciones infra que se quedan en inglés

`users`, `sessions`, `audit_logs`, `feature_flags`, `system_config`, `system_status` — no se tocan.

## Estrategia de migración (por fases de riesgo creciente)

### Fase E.1 — `competitors` → `competidores` (bajo riesgo, ~1 hora)

**Estado actual**: scheduler nuevo escribe en `competidores` (correcto). `competitors` solo tiene datos viejos.

1. Backfill: copiar docs de `competitors` → `competidores` con merge (idempotente).
2. Verificar lectura UI sigue funcionando.
3. Esperar 24h.
4. Borrar `competitors`.

Script: `scripts/migrations/001-competitors-to-competidores.ts`.

### Fase E.2 — `vehicles` + `lines` → `vehiculos` + `lineas` (riesgo medio, ~1 día)

**Estado actual**: seeds escriben en ambas. Lecturas UI mezcladas.

1. Deployar código que lee de ambas (fallback) pero escribe SOLO en ES.
2. Script de migración: copiar diff `vehicles → vehiculos` y `lines → lineas` con merge.
3. Verificar 1 semana — logs de fallback muestran cero lecturas de la versión EN.
4. Remover fallback del código.
5. Borrar colecciones EN.

Scripts: `scripts/migrations/002-vehicles-to-vehiculos.ts`, `003-lines-to-lineas.ts`.

### Fase E.3 — Triple unificación cartones (alto riesgo, ~3-5 días de ventana)

**Estado actual** (verificado en `ANALISIS_CARTONES.md`):
- `servicios_ucot` — cartones cargados desde el seed (693 servicios hábiles + 180 sábado).
- `cartones_de_servicio` — colección legacy de frontend antiguo.
- `cartones` — nombre corto que aparece en algunas queries nuevas.

1. Elegir `cartones` como destino (nombre corto, natural, ES).
2. Deployar código que lee de las 3 con prioridad (cartones → servicios_ucot → cartones_de_servicio).
3. Script de migración: unificar docs con resolución de conflictos por `servicio + linea + temporada`.
4. Actualizar 42 archivos que hacen referencias a las colecciones viejas (grep los conocemos).
5. Verificar cada pantalla que usa cartones (CartonManager, consultas API, etc).
6. Esperar 2 semanas.
7. Borrar colecciones viejas.

Scripts: `scripts/migrations/004-unify-cartones.ts`.

## Consecuencias

**Positivas**
- Reducción de ~40% en escrituras de Firestore (ya no se duplica personal/vehicles).
- Una sola source of truth por concepto — queries más simples.
- Rules más simples y estrictas.
- Consistencia con ADR 001.

**Negativas / riesgos**
- Ventana de deploy coordinado para E.2 y E.3.
- Potencial incidente si algún consumer se olvida.
- Costo humano de verificación por pantalla.

**Mitigaciones**
- Los scripts son idempotentes (merge:true siempre).
- Dual-read durante la transición — cero ventana de downtime.
- Logs específicos de "lectura cayó a fallback" para detectar consumers olvidados.
- Pre-deploy `scripts/check_integrity.sh`.
- Rollback: revertir el flag que activa escritura solo en destino.

## Alternativas consideradas

1. **Hacer nada, convivir con duplicación** — descartado: el costo de escrituras y la confusión de queries crecen con el tiempo.
2. **Borrar directo sin migración** — descartado: riesgo inaceptable. Hay datos únicos en cada lado.
3. **Unificar hacia EN** — descartado por ADR 001 (español para dominio).

## Cómo verificar que se respeta

- Después de E.3, `firestore.rules` no debe mencionar las colecciones antiguas.
- Grep del código no debe hacer referencia a `vehicles`, `lines`, `competitors`, `servicios_ucot`, `cartones_de_servicio`.
- Nueva ESLint rule (Fase F): leer colecciones solo desde `shared/firestore/collections.ts`.
