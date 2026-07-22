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
1. Escribir la primera suite de pruebas automatizadas (TDD) para el core del backend.
2. Limpiar el backend de scripts temporales (ej. `extract_gtfs.js`) e implementar verdaderos WebSockets o APIs de consumo en tiempo real para las coordenadas.

---
> **Nota para Agentes IA:** Es obligatorio actualizar este documento al finalizar cualquier tarea mayor para mantener la persistencia de la memoria.
