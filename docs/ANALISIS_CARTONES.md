# Análisis: Unificación de colecciones de cartones

**Fecha:** 2026-04-23
**Tipo:** Solo análisis, sin ejecución.
**Contexto:** Cierre del hallazgo #5 del plan 9.2 del informe de auditoría.

---

## Resumen ejecutivo

**Recomendación: NO consolidar las 3 colecciones.** Cada una tiene un propósito técnico legítimo distinto. Lo que sí conviene hacer es **renombrar** una de ellas para claridad semántica, **documentar el rol** de cada una en `CLAUDE.md`, y **eliminar el uso mezclado** en los hooks que hoy están leyendo colecciones distintas para conceptos parecidos.

El cambio propuesto es de bajo riesgo cuando se hace por fases con dual-write, y no requiere migración de datos masiva.

---

## Qué hace cada colección hoy

| Colección | Rol | Writes | Reads | Ciclo de vida |
|---|---|---|---|---|
| `cartones` | Maestro estático de servicios por línea + paradas teóricas | Admin (seed + edición manual) | Analytics, dashboards, servicios | Persiste indefinidamente |
| `cartones_de_servicio` | **Despacho en vivo** — qué coche corre qué servicio ahora | `shadowDispatcher` (Cloud Function) + Traffic Manager | `useRealtimeCartones` (onSnapshot 60s) + shadowDispatcher | TTL natural por `expire_at` |
| `cartones_completados` | Histórico / referencia de hojas de ruta físicas (Excel) | Admin setup + scripts de ingesta Excel | `CartonManager` modo "físico" | Inmutable, audit trail |

### Diferencia clave

- `cartones` = "qué servicios existen" (estático).
- `cartones_de_servicio` = "qué servicios se están corriendo ahora" (dinámico, vive minutos/horas).
- `cartones_completados` = "cómo fue la hoja de ruta impresa" (referencia histórica).

Son conceptualmente distintos. Son lo que en DDD se llamaría tres agregados diferentes: `Template`, `Assignment` y `AuditRecord`. Colapsarlos rompería el principio de responsabilidad única.

### Por qué NO es un bug que haya tres

Muchos sistemas modernos de transporte (Swiftly, Optibus) tienen al menos esta misma separación — "schedule template" vs "live dispatch" vs "block history". Lo que es legítimamente confuso en SkillRoute es el naming: las tres empiezan con "cartones" y eso hace pensar que es una cosa sola.

---

## Lo que SÍ es problema

1. **Naming inconsistente** — "cartones_de_servicio" no transmite que es despacho en vivo; podría confundirse con "cartones que se usan en servicio".
2. **Hooks que mezclan** — `useRealtimeCartones` escucha `cartones_de_servicio` (despacho) pero el nombre sugiere que escucha todos los cartones.
3. **Sin documentación canonical** — ningún archivo explica qué rol tiene cada una; CLAUDE.md solo las menciona como "naming inconsistente".
4. **Reglas Firestore default** — `cartones_completados` no tiene regla explícita y aplica el default (`allow read if authenticated, write if isAdminNorm`). Convendría hacerlo explícito.

---

## Plan de cambio — 5 fases, reversible en cualquier momento

### Fase A — Documentar el modelo actual (sin código, ~30 min)

Agregar a `CLAUDE.md` una sección nueva:

```markdown
## Modelo de cartones (3 colecciones con roles distintos)

| Colección | Rol | Lecturas | Escrituras |
|---|---|---|---|
| cartones | Template estático por línea/día/temporada | frontend CartonService, backend analytics | admin (seed + edit) |
| cartones_de_servicio | Despacho en vivo (coche asignado a servicio) | useRealtimeCartones (onSnapshot) | shadowDispatcher CF + Traffic |
| cartones_completados | Histórico / referencia Excel | AdminSetup, CartonManager modo físico | scripts de ingesta + admin setup |

Canonical para "¿qué se está corriendo ahora?" = cartones_de_servicio
Canonical para "¿qué servicios existen?" = cartones
Canonical para "¿cómo fue la hoja de ayer?" = cartones_completados
```

**Beneficio inmediato:** cualquier dev o auditor futuro entiende el modelo sin reverse-engineering.
**Riesgo:** cero.

### Fase B — Renombrar `cartones_de_servicio` → `servicios_asignados` (2-3 semanas con dual-write)

El nombre `servicios_asignados` expresa correctamente: un servicio (identificador de ruta programada) que está asignado a un coche y conductor en este momento.

**Paso 1 (día 1)** — agregar regla Firestore para el nuevo nombre, sin quitar la vieja:

```
match /servicios_asignados/{document=**} {
  allow read: if isAuthenticated();
  allow write: if isAdminNorm() || isTrafficOrAdmin();
}
```

**Paso 2 (día 2-3)** — en `shadowDispatcher.ts` y cualquier backend que escriba, dual-write:

```typescript
const data = { ...payload };
await db.collection('cartones_de_servicio').doc(id).set(data, { merge: true });
await db.collection('servicios_asignados').doc(id).set(data, { merge: true }); // alias nuevo
```

**Paso 3 (día 4-10)** — migrar las lecturas una por una del frontend:
- `frontend/src/hooks/useRealtimeCartones.ts` línea 29 — cambiar `cartones_de_servicio` por `servicios_asignados`.
- Re-testear ServiceMatrix, CartonManager, cualquier vista que consuma el hook.
- Si hay regresión, revertir solo ese archivo (los writes siguen yendo a ambas colecciones).

**Paso 4 (día 11-14)** — una vez validado que todas las lecturas ocurren sobre `servicios_asignados`, quitar el dual-write. Los `set` solo van a `servicios_asignados`.

**Paso 5 (día 15)** — purga:
- Exportar snapshot de `cartones_de_servicio` a GCS como backup.
- Dejar la colección vacía durante 7 días para detectar si algún consumidor oculto aún la lee.
- Si ningún error aparece, purgar.

**Reversible en cualquier momento:** mientras dure el dual-write, revertir es solo quitar el `set` al alias nuevo.

### Fase C — Hacer reglas explícitas para `cartones_completados` (5 min)

Agregar a `firestore.rules`:

```
match /cartones_completados/{document=**} {
  allow read: if isAuthenticated();
  allow write: if isAdminNorm();
}
```

Es lo que ya ocurre por la regla default, pero siendo explícita evita el riesgo de que si cambia el default en el futuro, esta colección se rompa.

### Fase D — Renombrar hook para claridad (20 min)

`useRealtimeCartones` es confuso; debería llamarse `useServiciosAsignados` (o `useServicioAsignadoPorLinea`). Cambio mecánico con `rename` del IDE + ajuste de imports.

No bloquea nada. Mientras no se haga, al menos agregar un JSDoc al hook que diga explícitamente qué escucha.

### Fase E — Consolidar `cartones_completados` con `cartones` (OPCIONAL, requiere más análisis)

Esta sí es discutible. `cartones_completados` tiene estructura divergente (tiene `viajes[]` denormalizado por parada, mientras `cartones` tiene `paradas[]` con tiempos). Si se quisiera unificar, habría que decidir un shape común y migrar. Alto riesgo y bajo beneficio (la colección tiene bajo uso).

**Recomendación:** dejar como está. Solo documentar en CLAUDE.md que es "tabla de referencia Excel para impresión" y no tocarla.

---

## Archivos afectados (si se ejecuta Fase B completa)

| Archivo | Cambio |
|---|---|
| `firestore.rules` | Agregar bloque para `servicios_asignados` (aditivo) |
| `functions/src/shadowDispatcher.ts:793` | Query de lectura + dual-write |
| `frontend/src/hooks/useRealtimeCartones.ts:29` | Cambiar `collection(db, 'cartones_de_servicio')` por `'servicios_asignados'` |
| `CLAUDE.md` | Sección nueva "Modelo de cartones" |

**Total:** 4 archivos, cambios mecánicos, ninguno afecta lógica de negocio.

---

## Por qué NO recomiendo consolidar todo en una sola colección

Si alguien sugiere "pongamos todo en `cartones` con un campo `tipo: template | asignado | completado`", hay 4 razones técnicas para rechazarlo:

1. **TTL natural.** Firestore no tiene TTL automático por query; la limpieza pasiva que ofrece `expire_at` en `servicios_asignados` se perdería. La colección crecería sin control.
2. **Costo de lecturas.** El `onSnapshot` de `useRealtimeCartones` paga 1 read por documento que cambia. Si mezclamos templates estáticos (que no cambian) con asignaciones en vivo (que cambian cada 60s), pagamos reads innecesarios por los templates.
3. **Índices.** Los índices compuestos actuales están optimizados por cada shape distinto. Un shape unificado forzaría índices más anchos y más costosos.
4. **Seguridad granular.** Hoy Traffic Manager puede escribir `cartones_de_servicio` pero no `cartones`. Unificar fuerza una regla única, pierde granularidad.

---

## Veredicto y próximo paso recomendado

- **Hacer hoy (0 riesgo):** Fase A (documentar en CLAUDE.md) + Fase C (reglas explícitas para `cartones_completados`).
- **Hacer próxima semana (bajo riesgo):** Fase B (renombrado a `servicios_asignados` con dual-write) + Fase D (renombrar hook).
- **No hacer:** Consolidación total de las 3 en una sola colección.

Esto cierra el ítem #5 del plan 9.2 de la auditoría. El "problema" no era tener 3 colecciones — era que el nombre de una de ellas escondía su rol real y que no estaba documentado en ningún lado.
