# Protocolo de Auditoría Funcional (QA Checklist)

Este workflow es de uso obligatorio para el agente antes de presentar cualquier refactorización, feature o corrección al usuario. No se puede omitir bajo ninguna circunstancia.

### FASE 1: Verificación de Código y Entorno
- [ ] El código compila correctamente sin errores (ej. `npm run build` ejecutado y exitoso).
- [ ] No existen dependencias circulares ni errores de tipado (TypeScript).
- [ ] El servidor (backend/frontend) levantó exitosamente.

### FASE 2: Verificación de Telemetría e Infraestructura
- [ ] Los cronjobs, scrapers o pollers necesarios para que la función opere están **activos** y **corriendo**.
- [ ] Se revisaron los logs de Docker o del backend para detectar excepciones silenciosas o errores de `ENOENT` / `ECONNREFUSED`.
- [ ] La base de datos tiene las tablas, columnas y datos requeridos (no se asume, se consulta mediante SQL).

### FASE 3: Verificación Extremo a Extremo (E2E)
- [ ] Los datos fluyen desde la base de datos hasta la interfaz de usuario.
- [ ] **Prohibido:** Los KPIs o paneles visuales no muestran "0", "N/A" o vacíos a causa de falta de ingesta.
- [ ] Cualquier anomalía visual ha sido rastreada hasta su origen y corregida.

**Declaración de Cumplimiento:**
Solo tras marcar todas las casillas de este archivo internamente, el agente está autorizado a reportar la tarea como finalizada al usuario.
