# Plan de Readecuación Integral - Gestión de Transporte UCOT

Este documento detalla el plan de implementación para escalar la aplicación "Gestión UCOT" para gestionar 250 ómnibus, 1200 usuarios y flujos de trabajo complejos de mantenimiento y personal.

## Fase 1: Base de Datos y Estructura de Flota (Prerrequisito)

- [ ] **Expansión de Modelo `Vehicle`**:
  - Agregar campos: Marca, Modelo, Año, Características (Aire Acondicionado, Rampa, etc.).
  - Agregar Estado: Operativo, Taller, Paralizado (Denuncia/Servicio).
- [ ] **Modelo de Asignación de Personal**:
  - Definir tipos de chofer: `FIJO` (Coche asignado) vs `LISTA` (Relevo/Rotativo).
  - Relación `User` <-> `Vehicle` para choferes fijos.
  - Esquemas de Rotación: Semanal, Quincenal (15x15).
- [ ] **Nuevo Módulo: Reportes de Mantenimiento (Denuncias)**:
  - Modelo `MaintenanceReport`.
  - Estados: `ENVIADO`, `RECIBIDO`, `EN_PROCESO`, `PROGRAMADO`, `DESCARTADO`, `FINALIZADO`.
  - Relación con Áreas (Departamentos).
  - Historial de actualizaciones (`MaintenanceLog`) con fotos y detalles.

## Fase 2: Gestión de Flota Avanzada

- [ ] CRUD de Vehículos expandido en Frontend.
- [ ] Visualización de Estado de Flota (Dashboard Operativo).

## Fase 3: Módulo de Mantenimiento y Denuncias

- [ ] **Backend**: Controladores y Rutas para `MaintenanceReport`.
- [ ] **Frontend - Chofer**: Pantalla "Nueva Denuncia" (Foto, Descripción, Prioridad).
- [ ] **Frontend - Jefe de Área**: Tablero Kanban o Lista para gestionar denuncias recibidas.
  - Acciones: Cambiar estado, Agregar nota de reparación, Subir foto de "Solencionado".
- [ ] **Integración**: Alertas automáticas al Área correspondiente cuando se crea una denuncia.

## Fase 4: Gestión de Personal y Rotaciones

- [ ] Lógica de reasignación automática:
  - Cuando un coche pasa a "Taller", sus choferes fijos pasan temporalmente a "Lista".
- [ ] Vistas de asignación de turnos para "Personal de Lista".

## Fase 5: Pruebas Integrales

- [ ] Simulación de flujo completo: Chofer reporta rotura -> Coche a taller -> Chofer a lista -> Taller repara -> Coche activo -> Chofer vuelve.

---

**Estado Actual**: Iniciando Fase 1 (Modificación de Schema).
