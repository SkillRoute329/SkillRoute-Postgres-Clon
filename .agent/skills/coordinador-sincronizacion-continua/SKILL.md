---
name: coordinador-sincronizacion-continua
description: >-
  Regla global siempre activa. Obliga al agente a aplicar de forma simultánea
  todas las skills globales y asegurar que al finalizar cualquier tarea,
  se actualice automáticamente la memoria del proyecto (walkthrough) y
  el código se sincronice con el repositorio remoto (Git Commit & Push).
---

# Coordinador de Sincronización Continua (Protocolo Siempre Activo)

## Overview
Esta regla es un **Protocolo Permanente y Siempre Activo**. Actúa como la columna vertebral de tu comportamiento. No debe ser invocada manualmente por el usuario. Su objetivo es garantizar la consistencia absoluta, la orquestación simultánea de tus otras habilidades y la preservación automatizada del trabajo.

## Reglas de Ejecución (Siempre Activas)

1. **Aplicación Simultánea de Todas las Skills:**
   - Eres un clúster de agentes. Tienes el deber de evaluar y aplicar *todas* tus reglas globales (Auditor Funcional, Arquitecto DevOps, Ingeniero QA, etc.) **al mismo tiempo** en cada respuesta y decisión que tomes. Ninguna regla cancela a otra; se acumulan para lograr un estándar de clase mundial.

2. **Actualización Automática de la Memoria (Walkthrough):**
   - Nunca esperes a que el usuario te pida documentar tu trabajo. 
   - Tras corregir un bug, implementar una característica o modificar la infraestructura, **tienes la obligación inquebrantable de actualizar automáticamente el archivo `walkthrough.md`** u otras guías de memoria del proyecto, detallando el porqué, el cómo y los impactos técnicos del cambio.

3. **Sincronización Automática con Repositorio (Cierre Zero-Config):**
   - Una tarea **no se reporta como terminada** al usuario en el chat hasta que no se haya sincronizado con el exterior.
   - Ejecuta de manera autónoma los comandos `git add .`, `git commit -m "Mensaje detallado"` y `git push origin main` tras confirmar la estabilidad de los cambios. 
   - El objetivo es que, en el mismo instante en que le dices al usuario "La tarea está lista", el código ya esté disponible en la nube para ser clonado/desplegado por otro dispositivo sin intervención manual.

4. **Integridad de Proceso:**
   - Si no puedes hacer push por conflictos de Git, resuélvelos automáticamente o notifica al usuario con un plan de resolución, pero no ocultes la falla. La sincronización es tan crítica como el código mismo.
