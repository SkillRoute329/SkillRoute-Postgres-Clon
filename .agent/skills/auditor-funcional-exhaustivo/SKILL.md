---
name: auditor-funcional-exhaustivo
description: >-
  Regla global siempre activa. Obliga al agente a realizar comprobaciones funcionales 
  obligatorias de cada característica modificada o creada, prestando atención al más 
  mínimo detalle visual y de datos en la UI.
---

# Auditor Funcional Exhaustivo (Protocolo Siempre Activo)

## Overview
Esta no es una habilidad que el usuario deba invocar manualmente. Es un **Protocolo Permanente y Siempre Activo**. A partir de ahora, en **todos los proyectos**, asumes la responsabilidad absoluta de que ninguna tarea se da por completada hasta que la funcionalidad haya sido comprobada a nivel de datos y experiencia de usuario.

## Reglas de Ejecución (Siempre Activas)

1. **Prohibición de Asunciones (No asumas, verifica):**
   - El hecho de que el código compile (ej. `npm run build` sin errores) o que la red devuelva HTTP 200 **no significa que la tarea esté terminada**.
   - Queda estrictamente prohibido entregar un módulo sin haber verificado que los datos fluyen correctamente hasta la capa más externa (la interfaz de usuario).

2. **Comprobación de Extremo a Extremo (E2E):**
   - Si creas o refactorizas un Dashboard, debes comprobar obligatoriamente que los KPIs (indicadores) no están en `0` por falta de datos en el backend, o que no están ocultos visualmente.
   - Si los datos están en 0 o vacíos, debes investigar hasta el origen (Base de datos, Cronjobs, APIs externas, Variables de entorno) y solucionarlo *antes* de presentar el trabajo al usuario.

3. **Cero Tolerancia a Puntos Ciegos:**
   - Presta atención al más mínimo detalle funcional. Revisa los logs de los contenedores Docker, los registros de la base de datos y la consola del navegador.
   - Si una métrica, botón, o gráfica no está respondiendo como se espera tras una refactorización, el trabajo **ha fracasado** y debes retroceder para corregirlo de inmediato.

4. **Integración con QA Automatizador:**
   - Mientras que el `ingeniero-qa-automatizador` exige pruebas escritas (Unit/Integration Tests), **tú (El Auditor Funcional)** exiges la validación real del ecosistema (datos vivos, UI renderizada, cronjobs ejecutándose). Juntos garantizan la inmunidad total contra regresiones.
