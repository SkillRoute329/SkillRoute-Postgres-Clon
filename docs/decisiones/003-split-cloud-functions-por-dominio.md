# ADR 003 — División de `intelligenceApi.ts` por dominio

- **Estado**: aceptado
- **Fecha**: 2026-04-24
- **Decisor**: Jonathan (producto) + agente de análisis arquitectónico
- **Vinculado a**: `docs/CONVENCIONES.md` §2, §5, `ARQUITECTURA_OBJETIVO.md` §4 Fase C

## Contexto

`functions/src/intelligenceApi.ts` es una Cloud Function monolítica de **~2.400 líneas** que concentra:

- Cálculo de radios de competencia (GPS)
- Elasticidades de demanda (TRL593 Balcombe)
- Gestión de cartones de servicio
- Forecast económico (OLS + IVA)
- Disrupciones operativas
- Parámetros operativos (lectura desde Firestore)
- Health checks y endpoints utilitarios
- Autenticación y middleware

Problemas observados:
- **Truncamiento recurrente**: el archivo ya fue cortado a mitad de expresión en 3 sesiones distintas cuando se editó con `Edit` de strings largos o `>>` heredocs. Tuvimos que reparar con Python atómico y el guardrail `check_integrity.sh`.
- **Carga de contexto**: cualquier edición —por mínima que sea— hace que un agente de IA cargue 2.400 líneas. El 95% no se usa para esa edición. Coste de tokens desproporcionado.
- **Acoplamiento invisible**: funciones de dominios distintos comparten helpers locales. Tocar uno puede romper otro.
- **Deploy de gran superficie**: cualquier cambio deploya la función entera. Mayor ventana de regresión.
- **Merge conflicts** frecuentes cuando dos tareas tocan el mismo archivo aunque sean de dominios distintos.

## Decisión

Dividir `intelligenceApi.ts` en archivos por dominio dentro de `functions/src/api/`, manteniendo `intelligenceApi.ts` como **fachada re-exportadora** durante la transición.

### Estructura objetivo

```
functions/src/
├── index.ts                 ← cero lógica, solo export de handlers
├── api/
│   ├── index.ts             ← reexport de handlers por dominio
│   ├── competidores.ts      ← radios, GPS, shadow
│   ├── cartones.ts          ← cartones de servicio
│   ├── disruptions.ts       ← gestión de disrupciones
│   ├── forecast.ts          ← proyecciones económicas (OLS, IVA)
│   ├── parametros.ts        ← lectura/escritura de parámetros operativos
│   └── shared/
│       ├── middleware.ts    ← auth, validación, error handling
│       └── helpers.ts       ← utilidades comunes <100 líneas
├── engines/                 ← lógica de negocio pura (sin I/O)
│   ├── otp.ts
│   ├── ewt.ts
│   ├── bunching.ts
│   ├── forecast/ols.ts
│   └── forecast/iva.ts
└── ...
```

### Regla operativa

- **Ningún archivo en `functions/src/api/` supera 400 líneas**. Si se acerca, dividir por subdominio.
- **`engines/` no hace I/O**: no toca Firestore ni HTTP, solo funciones puras. Facilita tests unitarios.
- **`api/*.ts` orquesta**: valida input, llama a engines, lee/escribe Firestore, retorna.

### Proceso de migración (incremental)

No refactor masivo en una sesión — riesgo alto de regresión.

1. Identificar grupos de funciones por dominio (grep por prefijos: `radio*`, `carton*`, `disruption*`, `forecast*`).
2. Crear archivo destino vacío (`functions/src/api/competidores.ts`).
3. Mover funciones en **bloques pequeños (<100 líneas)** con Python atómico (`os.replace(tmp, path)`).
4. Mantener `intelligenceApi.ts` re-exportando — los imports externos siguen funcionando.
5. Ejecutar `npm run build` + `bash scripts/check_integrity.sh` después de cada bloque.
6. Cuando un dominio queda 100% migrado, actualizar los callers externos a importar directo del nuevo archivo.
7. Al final, `intelligenceApi.ts` queda vacío → borrar.

## Consecuencias

**Positivas**
- Cada edición carga ~300-400 líneas, no 2.400. **~6× reducción de tokens por edición**.
- Truncamientos desaparecen: archivos pequeños son inmunes al patrón observado.
- Merge conflicts bajan: cada dominio vive en su archivo.
- Tests unitarios posibles sobre `engines/` (funciones puras).
- Deploys parciales a futuro (Firebase permite desplegar funciones individuales).

**Negativas / riesgos**
- Durante la transición convive la fachada vieja con los archivos nuevos. Hay que ser disciplinado en no agregar lógica en `intelligenceApi.ts`.
- Si se divide mal (corte por tipo de función en vez de por dominio), se acopla peor. Dividir por **dominio**, no por "todos los handlers HTTP acá, todos los triggers allá".

## Alternativas consideradas

1. **Dejar el monolito pero agregar comentarios de sección** — descartado: no resuelve el problema de tokens ni de truncamiento. Cosmético.
2. **Mover a microservicios separados (varios proyectos Firebase)** — descartado: sobre-ingeniería para el tamaño actual. Operacionalmente costoso. Evaluable a futuro si el tráfico justifica aislamiento.
3. **Dividir por tipo de endpoint (uno por método HTTP, o uno por trigger)** — descartado: mantiene el acoplamiento por dominio. Nuestro problema no es "muchos endpoints" sino "muchos dominios mezclados".

## Cómo verificar que se respeta

- Regla §5 de `docs/CONVENCIONES.md`: Cloud Function handler ≤400 líneas.
- `scripts/check_integrity.sh` incluye exports críticos esperados en `functions/src/index.ts` — al dividir, actualizar esa lista.
- Cada PR que toque `functions/src/` se chequea contra el tamaño máximo.

## Relación con otros hotspots

Los mismos principios aplican a otros archivos grandes identificados (ver `ARQUITECTURA_OBJETIVO.md` §1.1):

- `scheduleComplianceEngine.ts` (~540) → `engines/scheduleCompliance/{otp,ewt,bunching,crossMidnight}.ts`
- `gtfsRealtime.ts` (~500) → `publishers/gtfsRealtime/{vehiclePositions,tripUpdates,serviceAlerts}.ts`
- `ExcelParserV2.ts` (744) → `features/excel-import/parsers/{boletines,horarios,paradas,flota}.ts`

Cada uno se divide cuando haya motivo real para tocarlo (scout rule). Este ADR aplica el patrón general.
