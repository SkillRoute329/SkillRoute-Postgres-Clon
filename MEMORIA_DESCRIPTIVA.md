# Memoria Descriptiva (Contexto del Sistema)
> **Última Actualización:** 2026-07-22

## 1. Visión General (El Negocio)
- **Proyecto:** Centro de Gestión de Transporte Metropolitano (SkillRoute).
- **Propósito:** Gestionar y auditar la flota de transporte, ubicaciones (GPS) y rutas (GTFS) usando datos públicos, con grado de auditoría gubernamental.
- **Estado Actual:** El repositorio ha sido "blindado" metodológicamente. Se configuró el Sextágono de Calidad y se instauraron 6 Leyes universales de desarrollo.

## 2. Arquitectura (El Código)
- **Frontend:** React + Vite + TypeScript. Preparado para empaquetado móvil con Capacitor (Android/iOS).
- **Backend:** Node.js + Express. Arquitectura modular (MVC - Model, View, Controller).
- **Base de Datos:** PostgreSQL con extensión PostGIS para geolocalización. (Conexión principal mediante Docker).

## 3. Infraestructura y Despliegue (DevOps)
- **Entorno Local:** Orquestado completamente en Docker (`docker-compose up -d`).
- **Migraciones:** Gestión estricta a través de herramientas de código. Quedan prohibidos los volcados manuales `.sql`.
- **Compilación Móvil:** Android soportado localmente (vía `android-cli`), iOS reservado para la nube (GitHub Actions).

## 4. Auditoría y Trazabilidad (Datos)
- **Ley de Transparencia:** Prohibido usar datos estáticos simulando ser telemetría en tiempo real.
- Todo dato debe contener un sello de origen (`source`) y tiempo en **UTC**.

## 5. Tareas Pendientes (Roadmap / To-Do)
1. **[HECHO]** Limpiar el backend de scripts temporales. Se archivaron ~40 scripts basura en `/archived_scripts` (Frontend/Backend) sin borrar lógica operativa (Cero Regresiones).
2. **[HECHO]** Escribir la primera suite de pruebas automatizadas (TDD) instalando Vitest/Supertest en el backend.
3. **[HECHO]** Adaptar el script de carga de demostración (Seed) para etiquetar los datos simulados y cumplir la Ley 5 de Transparencia.
4. Eliminar `extract_gtfs.js` y crear API real en vivo para mapas (Post-Presentación).
