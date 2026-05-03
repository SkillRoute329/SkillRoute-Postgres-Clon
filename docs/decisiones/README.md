# ADRs — Architectural Decision Records

Decisiones arquitectónicas razonadas del proyecto SkillRoute / GestionUcot.

## Por qué

Cada decisión importante queda escrita para que:
- Las siguientes sesiones (humanas o IA) no revisen la misma discusión.
- Si alguna vez hay que revertir o cambiar algo, el contexto original está disponible.
- El proyecto tenga memoria institucional independiente de quién esté trabajando.

## Cómo leer un ADR

Cada ADR es corto (1-2 páginas) y sigue esta estructura:
- **Contexto** — el problema que motivó la decisión
- **Decisión** — qué se resolvió hacer
- **Consecuencias** — lo bueno y lo malo de haber decidido así
- **Alternativas consideradas** — qué otras opciones hubo y por qué se descartaron
- **Cómo verificar que se respeta** — reglas prácticas de validación

## Cómo escribir uno nuevo

1. Copiar la estructura de un ADR existente.
2. Numerar secuencialmente: `004-nombre-corto.md`.
3. Llenar al menos Contexto, Decisión y Consecuencias.
4. Linkear desde `ARQUITECTURA_OBJETIVO.md` o `docs/CONVENCIONES.md` si aplica.

## Cuándo escribir uno

Si la decisión:
- Afecta a más de una feature o archivo
- Tiene alternativas razonables que fueron descartadas
- Va a generar preguntas del tipo "¿por qué hicimos esto así?" en 3 meses

→ Escribir ADR.

Si es un detalle táctico de implementación (un bug fix, un rename menor), no hace falta ADR — va al commit message.

## Índice

| # | Título | Estado |
|---|--------|--------|
| [001](001-idioma-es-dominio-en-infra.md) | Idioma: español para dominio, inglés para infraestructura | aceptado |
| [002](002-estructura-feature-first.md) | Estructura feature-first en el frontend | aceptado |
| [003](003-split-cloud-functions-por-dominio.md) | División de `intelligenceApi.ts` por dominio | aceptado |
| [004](004-unificacion-colecciones-firestore.md) | Unificación de colecciones Firestore duplicadas | aceptado (ejecución pendiente) |
