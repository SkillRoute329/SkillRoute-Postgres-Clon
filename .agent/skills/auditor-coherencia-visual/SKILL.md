---
name: auditor-coherencia-visual
description: >-
  Regla global siempre activa. Obliga al agente a corroborar estrictamente que todas las 
  funcionalidades desarrolladas tengan un reflejo visual e interactivo explícito en el 
  programa (por ejemplo: que no exista una función sin un botón que la dispare, ni un botón
  huérfano sin su panel correspondiente).
---

# Auditor de Coherencia Visual y Funcional (Protocolo Siempre Activo)

## Overview
Esta no es una habilidad que el usuario deba invocar manualmente. Es un **Protocolo Permanente y Siempre Activo**. A partir de ahora, asumes la responsabilidad absoluta de asegurar que el código subyacente y la interfaz gráfica del usuario (UI) se encuentren perfectamente sincronizados.

## Reglas de Ejecución (Siempre Activas)

1. **Simetría Interfaz-Lógica (Cero Funciones Ocultas):**
   - Si creas una función, un endpoint o un módulo lógico en el sistema, estás obligado a proporcionar un mecanismo visual (un botón, un interruptor, un atajo de teclado documentado en UI) para que el usuario pueda activarlo o visualizarlo.
   - Está prohibido desarrollar lógica "invisible" que el usuario no tenga cómo accionar (a menos que se te indique explícitamente que es un daemon o servicio de background autónomo).

2. **Simetría Lógica-Interfaz (Cero Botones Huérfanos):**
   - Si introduces un botón, pestaña o panel en la interfaz, debes asegurarte de que dicho elemento de UI esté conectado correctamente a su función subyacente o, como mínimo, conectado de forma visible a un estado renderizado de la aplicación.
   - Está prohibido declarar un panel (ej. en un `switch` o `if`) y olvidar añadir el botón que permite navegar a dicho panel en los menús selectores.

3. **Verificación Estricta antes de Sincronizar (El Deber de Corroborar):**
   - Antes de dar por terminado un trabajo, ejecutar un `git push` o avisar al usuario que la tarea está lista, debes realizar un escrutinio exhaustivo del flujo:
     - "¿Cómo llega el usuario a esta pantalla?"
     - "¿Añadí el botón de acceso en el Header o Sidebar?"
     - "¿El evento `onClick` del botón realmente está disparando el bloque o tab correspondiente?"
   - Si alguna de estas respuestas es negativa, la tarea no está terminada y debes repararlo.

4. **Cumplimiento de Procedimientos Pactados:**
   - Todo código escrito debe pasar por la supervisión de las demás habilidades de la arquitectura del proyecto (Zero-Config, QA, Escalabilidad y Sincronización Continua). Esta regla de Coherencia Visual no anula los demás estándares de calidad, se suma a ellos para garantizar un producto impecable y usable de principio a fin.
