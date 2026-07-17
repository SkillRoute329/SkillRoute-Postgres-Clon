# Handover de IA - SkillRoute Postgres Clon
**Fecha:** Julio 2026

Este documento sirve como guía para cualquier Agente de IA que deba retomar el desarrollo, mantenimiento o debuggeo de este proyecto.

## Estado del Proyecto (El Gran Contexto)
Actualmente, el proyecto se encuentra en un entorno **100% autónomo** y ha sido migrado a **PostgreSQL** para evitar conexiones no deseadas a los servidores de producción originales (Google Cloud/Firebase). El usuario valora muchísimo que **nada** intente comunicarse con la nube de Google, ya que en el pasado esto ha generado "alertas operativas" y reportes indeseados (correos).

## Últimos Cambios Importantes Realizados
1. **Desconexión Total de Firebase (Backend):** 
   - Se reemplazó la inicialización de `firebase-admin` en `backend/src/config/firebase.ts` por un *stub* (mock) que intercepta de forma segura todas las llamadas (ej: `aiOrdersService`, `competitionService`). 
   - Si vas a crear nuevos módulos, **no utilices Firebase**. Todos los desarrollos de bases de datos deben enfocarse en PostgreSQL (`knex`).

2. **Consolidación de la UI (Módulo Cumplimiento):**
   - El módulo `CumplimientoHub.tsx` tenía 15 pestañas distintas, generando sobrecarga cognitiva. 
   - Se refactorizó la interfaz agrupándolas en 3 *Dashboards Unificados* (Master Tabs):
     - **Centro de Comando Interactivo:** (`CentroComandoMaster.tsx`) Agrupa alertas de flota, simulador y el motor de IA.
     - **Análisis Integral de Servicio:** (`AnalisisServicioMaster.tsx`) Agrupa la puntualidad OTP, análisis por línea, tiempos de viaje, parada y análisis por etapas.
     - **Auditoría y Flota:** (`AuditoriaFlotaMaster.tsx`) Agrupa el ranking de vehículos, estadísticas individuales (AutoStats), validación externa IMM, Cartón vs GPS y rotaciones.

3. **Consolidación de la UI (Módulo Gestión de Flota):**
   - El módulo `GestionFlotaHub.tsx` tenía 9 pestañas distintas (Inventario, Mantenimiento, etc.).
   - Se refactorizó agrupándolas en 3 *Dashboards Unificados* (Master Tabs) para mejor escalabilidad:
     - **Operaciones de Flota:** (`OperacionesFlotaMaster.tsx`) Inventario, Disponibilidad, Alertas.
     - **Mantenimiento y Taller:** (`MantenimientoMaster.tsx`) Mantenimiento Activo, Predictivo, Órdenes de Trabajo.
     - **Recursos y Confiabilidad:** (`ConfiabilidadRecursosMaster.tsx`) EAM, Combustible, Revisión Vehicular.

## Reglas Críticas para la Próxima IA
1. **Cero Nube Original:** No instales dependencias de Google Cloud ni intentes restaurar Firebase. El clon debe funcionar de manera offline/local respecto a los servicios cloud originales.
2. **Priorizar Integraciones Locales:** Si el sistema necesita almacenar estados complejos o analítica (como las sugerencias de la IA o los eventos de desvío), asegúrate de que usen tablas en PostgreSQL.
3. **Mantenimiento de la UI:** No agregues botones sueltos al menú de navegación a menos que sea una nueva sección principal. Integra las nuevas métricas dentro de los Master Dashboards correspondientes usando el patrón `lazy()` loading y `Suspense`.

## Tareas Pendientes o "Próximos Pasos" Ideales
- **Migración Final de Consultas:** Muchos de los servicios antiguos (`competitionService`, `aiOrdersService`) aún intentan llamar a `db.collection(...)`. Al haber puesto un stub, fallan silenciosamente de forma segura (los catch actúan). Sin embargo, a mediano plazo, estas lógicas deben reescribirse a SQL (`knex`) para reactivar esas funcionalidades de manera autónoma.
- **Validación E2E:** Ejecutar la suite de pruebas E2E completa para verificar que las fusiones de los componentes en la UI no afectaron el flujo de datos.
