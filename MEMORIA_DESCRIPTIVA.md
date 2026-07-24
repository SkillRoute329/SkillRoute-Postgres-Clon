# Memoria Descriptiva (Contexto del Sistema)
> **Última Actualización:** 2026-07-24 (Configuración de Autostart y Hard Reset)

## 1. Visión General (El Negocio)
- **Proyecto:** Centro de Gestión de Transporte Metropolitano (SkillRoute).
- **Propósito:** Gestionar y auditar la flota de transporte, ubicaciones (GPS) y rutas (GTFS) usando datos públicos, con grado de auditoría gubernamental.
- **Estado Actual:** El sistema alcanzó la madurez y estabilidad tras la integración completa hasta la **FASE 7**. Se encuentra en estado CONGELADO funcional. Prohibido hacer cambios estructurales al código.

## 2. Arquitectura (El Código)
- **Frontend:** React + Vite + TypeScript. Preparado para empaquetado móvil con Capacitor (Android/iOS).
- **Backend:** Node.js + Express. Arquitectura resiliente multi-fase (Fase 1 completada con manejadores anti-crash `unhandledRejection`).
- **Base de Datos:** PostgreSQL con extensión PostGIS para geolocalización. Completamente migrado desde Firestore (Fase 2).

## 3. Infraestructura y Despliegue (DevOps)
- **Entorno Local:** Orquestado completamente en Docker (`docker-compose up -d`).
- **Migraciones:** Gestión estricta a través de herramientas de código. Quedan prohibidos los volcados manuales `.sql`.
- **Compilación Móvil:** Android soportado localmente (vía `android-cli`), iOS reservado para la nube (GitHub Actions).

## 4. Auditoría y Trazabilidad (Datos)
- **Ley de Transparencia:** Prohibido usar datos estáticos simulando ser telemetría en tiempo real.
- Todo dato debe contener un sello de origen (`source`) y tiempo en **UTC**.
- **Motor de Cumplimiento y Consecuencias:** (Fase 5 y 7 activas). Mapeo estricto del GTFS, simulación, detección automática de Bunching y Análisis Competitivo Operativo.

## 5. Tareas Pendientes y Estado (Roadmap / To-Do)
1. **[HECHO]** Sistema anti-crash de Node.js (Escudo Anti-Apagones) implementado en `index.ts` para garantizar resiliencia total durante desconexiones a internet prolongadas (unhandledRejection/uncaughtException).
2. **[HECHO]** Bypass en Frontend (DashboardOperacional) con `useLiveOperations()` para alimentar los mapas en vivo saltándose el Poller backend en caso de fallo, sin dañar la integridad de los Context.
3. **[HECHO]** Despliegue completo de Schedulers autónomos (Conteo Vehicular, Cartones UCOT, Horarios STM, GTFS oficial).
4. **[HECHO]** Fases 5.31 a 5.38 (Motor de consecuencias automático) evaluando velocidad anómala, baja cobertura GPS e incumplimiento de intervalos.
5. **[HECHO]** Análisis Predictivo de Puntos Calientes (Hotspots) e Inteligencia Competitiva interactiva basada 100% en tabla `gtfs.stops`. Código compilando limpiamente sin errores sintácticos.
6. **[HECHO]** Configuración de Autostart de Servidores (VBScript modo servicio) e integración del flujo "Hard Reset" (Limpieza Extrema Automática) mediante el script `npm run reset` para invalidación de cachés y terminación de procesos.
7. **[ACTUAL]** Preservar la versión actual sin realizar más modificaciones a las directivas de control y la UI recuperada para presentación de mañana.
