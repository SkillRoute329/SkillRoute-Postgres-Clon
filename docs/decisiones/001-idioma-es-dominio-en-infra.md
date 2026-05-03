# ADR 001 — Idioma: español para dominio, inglés para infraestructura

- **Estado**: aceptado
- **Fecha**: 2026-04-24
- **Decisor**: Jonathan (producto) + agente de análisis arquitectónico
- **Vinculado a**: `docs/CONVENCIONES.md` §4, `ARQUITECTURA_OBJETIVO.md` §3.1

## Contexto

En el código del proyecto conviven nombres en español y en inglés sin regla clara:

- Colecciones Firestore: `personal` (ES) vs `users` (EN); `vehiculos` vs `vehicles`; `lineas` vs `lines`; `competidores` vs `competitors`. A veces existen las dos y se escribe en ambas.
- Rutas UI: 95% `kebab-case` en inglés (`/traffic/shadow-radar`), pero aparece `/admin/parametros-operativos` en español rompiendo la convención.
- Dentro de un mismo archivo: `const vehiculos: Vehicle[]` con variables en ES y tipos en EN.
- Comentarios mezclados (algunos en ES, otros en EN) sin criterio.

Consecuencias observadas:
- Agentes de IA y desarrolladores humanos pierden tiempo decidiendo cada vez en qué idioma nombrar algo.
- Hay colecciones duplicadas en Firestore porque cada sesión eligió un idioma distinto.
- Grep de referencias requiere buscar en los dos idiomas.

## Decisión

**Español para el dominio de transporte de Uruguay. Inglés para infraestructura y conceptos genéricos.**

Regla operativa: si Jonathan o un operador UCOT diría el término en español en una reunión, va en español. Si es un concepto de ingeniería de software genérico, va en inglés.

| Contexto | Idioma | Ejemplo |
|----------|--------|---------|
| Colecciones Firestore de dominio | **ES** | `competidores`, `cartones_de_servicio`, `lineas`, `vehiculos`, `paradas`, `desvios_reportados` |
| Colecciones Firestore de infra | **EN** | `users`, `sessions`, `audit_logs`, `feature_flags` |
| Nombres de tipo TypeScript | **Mixto OK** | `type Competidor = { linea: string; codigoEmpresa: number }` |
| Funciones/variables de código | **EN** salvo conceptos UCOT | `getParameter()`, `parseCarton()`, `calculateOTP()` |
| Rutas UI | **EN** | `/admin/operating-parameters` (renombrar `/admin/parametros-operativos`) |
| Mensajes UI visibles al usuario final | **ES** | "Guardado correctamente" |
| Comentarios en código | **ES** | `// cruce de medianoche` |
| Mensajes de commit | **ES** | `fix: corregir IVA en forecast` |

### Conceptos UCOT que siempre van en español

Sin equivalente en inglés preciso y usados por autoridades/operadores del rubro:

`cartón`, `boletín`, `variante`, `regulador`, `desvío`, `inspector`, `delegación`, `pasajero`, `STM`, `UCOT`, `IMM`.

## Consecuencias

**Positivas**
- Una sola regla para responder "¿en qué idioma lo escribo?". Baja la carga cognitiva.
- Nombres más cercanos al negocio para el dominio (Jonathan y el equipo UCOT piensan en ES).
- Consolidación eventual de colecciones Firestore duplicadas (ver Fase E en ARQUITECTURA_OBJETIVO.md).
- Interfaces de infra siguen legibles globalmente (ej. `users`, `audit_logs`).

**Negativas / riesgos**
- La migración de colecciones existentes (`vehicles` → `vehiculos`, `lines` → `lineas`) requiere ventana coordinada y dual-read durante la transición.
- Puede haber fricción inicial con devs acostumbrados a "inglés siempre".

## Alternativas consideradas

1. **Inglés para todo** — descartado: conceptos como `cartón`, `boletín`, `variante` no tienen traducción estable. Traducirlos produce nombres como `ServiceCard`, `RouteVariant` que alejan el código del vocabulario del usuario y del regulador.
2. **Español para todo** — descartado: conceptos genéricos (`users`, `audit_logs`, `feature_flags`) son estándar global; traducirlos rompe la expectativa de cualquier dev externo que entre al proyecto.
3. **Sin regla / caso por caso** — estado actual, descartado por las consecuencias observadas.

## Cómo verificar que se respeta

- ESLint rule custom (Fase F) que prohíbe colecciones Firestore fuera de `shared/firestore/collections.ts`.
- Revisión en code review: cualquier archivo nuevo se chequea contra §4 de `docs/CONVENCIONES.md`.
- Para código legacy: scout rule — al tocar un archivo, si viola la regla, corregir en esa misma edición.
