# ADR 002 — Estructura feature-first en el frontend

- **Estado**: aceptado
- **Fecha**: 2026-04-24
- **Decisor**: Jonathan (producto) + agente de análisis arquitectónico
- **Vinculado a**: `docs/CONVENCIONES.md` §2, `ARQUITECTURA_OBJETIVO.md` §2.1

## Contexto

Hoy el frontend está organizado por **tipo de archivo** (estructura "layer-first"):

```
frontend/src/
├── pages/
├── components/
├── services/
├── hooks/
├── utils/
└── ...
```

Consecuencias observadas:
- Para tocar una feature (p. ej. "disrupciones") hay que abrir archivos en 5-6 carpetas distintas.
- Las páginas crecen mucho: `ShadowRadar.tsx` (~650 líneas), `EconomicProjectionsPage.tsx` (~580), `CEODashboard.tsx` (~480). Todo el estado, componentes inline y lógica conviven en un solo archivo porque "sacarlo" obliga a pensar dónde va.
- Agentes de IA cargan 2.400 líneas (`intelligenceApi.ts`) para tocar una función. El 80% del contexto no se usa.
- Componentes "casi iguales" se duplican porque nadie ve que ya existía uno similar en otra carpeta.
- Imports cruzados salvajes: cualquier archivo puede importar cualquier otro, lo que crea acoplamiento invisible.

## Decisión

Migrar a **estructura feature-first**:

```
frontend/src/
├── app/                 ← entry, router, providers
├── pages/               ← solo shells de ruta (<250 líneas)
├── features/            ← ⭐ código cohesivo por dominio
│   ├── disruptions/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── schemas/
│   │   ├── engine/
│   │   ├── __tests__/
│   │   └── index.ts     ← API pública
│   ├── competidores/
│   ├── cartones/
│   └── ...
├── shared/              ← reutilizable entre features
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   └── lib/
├── config/              ← parametros-operativos, feature-flags
└── schemas/             ← Zod schemas compartidos
```

### Reglas derivadas

1. **Una feature = una carpeta**. Todo lo cohesivo vive junto.
2. **`index.ts` es la API pública** de la feature. Solo lo exportado desde ahí puede importarse desde otra feature. Lo interno se queda interno.
3. **Orden de preferencia para código nuevo**: primero dentro de la feature. Si una segunda feature lo necesita, subir a `shared/`. Nunca "preventivamente".
4. **Páginas quedan como shells finos**: orquestan componentes de features pero no contienen lógica de negocio.
5. **`shared/` es reutilizable genuinamente**, no "por si acaso". Si algo solo lo usa una feature, no pertenece a `shared/`.

### Features iniciales a migrar (en orden de prioridad)

| Orden | Feature | Razón |
|-------|---------|-------|
| 1 | `disruptions` | Recién creada, casi lista para mover |
| 2 | `parametros-economicos` | Aislada, baja dependencia cruzada |
| 3 | `competidores` | Alto valor de negocio, vale limpiarla |
| 4 | `cartones` | Compleja, lleva tiempo — hacerla cuando haya ventana |
| 5 | `shadow-radar` | Última porque tiene más dependencias |

## Consecuencias

**Positivas**
- Los archivos a tocar para una feature quedan en una sola carpeta. Reduce ~70% el contexto que carga un agente de IA.
- El `index.ts` actúa como contrato: si alguien intenta importar algo no exportado, se rompe el TypeScript y queda visible el acoplamiento.
- Las páginas se vuelven pequeñas automáticamente (el trabajo pesado migra a la feature).
- Buscar "¿dónde está X?" pasa a ser "¿en qué feature vive?" — una sola pregunta.
- Cuando una feature ya no se usa, se borra la carpeta entera — sin cazar referencias sueltas.

**Negativas / riesgos**
- Requiere refactor progresivo; no hay retorno inmediato en la migración de código legacy.
- Decidir si algo va en la feature o en `shared/` puede ser ambiguo al inicio. Regla: empezar siempre en la feature.
- Puede haber tentación de crear features granulares que en realidad son una sola. Gobernar con revisión.

## Alternativas consideradas

1. **Quedarse con layer-first** — descartado: produjo las consecuencias del contexto.
2. **Monorepo con paquetes separados (`@ucot/disruptions`, `@ucot/cartones`)** — descartado para esta fase: sobre-ingeniería para el tamaño actual del equipo (una persona + agentes). Evaluable a futuro si el proyecto crece a 3+ devs full time.
3. **Domain-driven design estricto (bounded contexts)** — descartado: el proyecto no justifica la ceremonia. Feature-first es el 80% del beneficio al 20% del costo.

## Cómo verificar que se respeta

- Al crear código nuevo: checklist §8 de `docs/CONVENCIONES.md`.
- ESLint rule futura: prohibir imports `import { x } from '@/features/A/internal-thing'` — solo `import { publicApi } from '@/features/A'`.
- En code review: preguntar "¿por qué esto está en `shared/` y no en la feature?" cuando aplique.
