# Reglas Específicas del Proyecto SkillRoute

## 1. Ejecución Autónoma de Comandos de Reseteo
Como Agente IA, tienes la **obligación estricta** de ejecutar el comando `npm run reset` (o `npm run clean`) de forma autónoma antes de aplicar o validar cambios importantes en el código. 

**Motivo:** Esto previene errores de "falsos positivos" o cambios que no se reflejan debido a procesos zombies de Node.js, bloqueos en los puertos 3006/5432, o cachés persistentes (como la de Vite).
**Regla:** NO debes pedirle al usuario que ejecute este comando. DEBES ejecutarlo tú mismo (el Agente) usando la herramienta `run_command` (por ejemplo, `npm run reset` o invocando `limpieza.ps1` directamente) siempre que se realicen cambios arquitectónicos, de configuración o cuando se reporten discrepancias entre el código y lo que se visualiza, para evitar cualquier fallo humano o error de sintaxis en la ejecución por parte del operador.
