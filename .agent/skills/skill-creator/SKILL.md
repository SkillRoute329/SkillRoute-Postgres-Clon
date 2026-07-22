---
name: skill-creator
description: >-
  Crea nuevas habilidades (skills) genéricas desde cero a partir de una idea del usuario. 
  A diferencia de workflow-skill-creator, esta habilidad se usa cuando el usuario quiere construir
  una habilidad completamente nueva que no se basa en un flujo de trabajo pasado, sino en un concepto
  o una serie de requerimientos nuevos.
---

# Skill Creator (Creador Genérico de Habilidades)

Esta habilidad te proporciona un marco estructurado para guiar al usuario en la creación de una nueva Skill desde cero.

## Fase 1: Recolección de Requisitos
Debes conversar con el usuario para definir:
1. **Propósito:** ¿Qué problema resuelve esta habilidad?
2. **Entradas y Salidas:** ¿Qué datos recibe y qué produce?
3. **Herramientas/APIs:** ¿Interactúa con alguna API externa o requiere scripts en Python/Node?
4. **Manejo de errores:** ¿Qué debe hacer si falla?

*Realiza preguntas de una en una o en pequeños bloques para no abrumar al usuario.*

## Fase 2: Diseño de la Habilidad
Una vez que tengas clara la idea, elabora un documento de diseño (Artifact) que incluya:
- Nombre y descripción (YAML frontmatter).
- Estructura de archivos (SKILL.md, scripts adicionales).
- Dependencias necesarias.
- Plan de implementación.

*Pide aprobación al usuario antes de escribir código.*

## Fase 3: Implementación
Sigue estas reglas al implementar:
1. **SKILL.md:** Debe contener el bloque YAML inicial, Overview, Dependencias, Quick Start, y detallar los comandos o flujos.
2. **Ubicación:** Las habilidades locales deben ir en `.agent/skills/{nombre-de-habilidad}/SKILL.md` (o la ruta global que prefiera el usuario).
3. **Scripts Auxiliares:** Si requiere programación, crea scripts de CLI. Usa `uv run` si es Python o herramientas estándar de Node si es JS.
4. **Salida a Archivos:** Todo resultado largo de los scripts debe guardarse en archivos temporales, no imprimirse masivamente en consola.

## Fase 4: Validación
Pide al usuario que pruebe la nueva habilidad usando un prompt natural. Ajusta cualquier bug que surja durante la prueba.
