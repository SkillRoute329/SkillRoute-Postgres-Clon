# Pruebas de todos los botones y rutas – TransForma Fácil 2.0

**Entorno:** localhost:5173, usuario autenticado.  
**Objetivo:** Probar todas las rutas del menú y los controles de cada pantalla.

---

## Rutas del menú (22 ítems)

| Ruta                                   | Sección                   |
| -------------------------------------- | ------------------------- |
| `/dashboard`                           | Vista General             |
| `/dashboard/traffic/service-matrix`    | Matriz de Servicio        |
| `/dashboard/traffic/inspector-control` | Control Inspectores       |
| `/dashboard/traffic/inspector-capture` | Captura Inspector (Móvil) |
| `/dashboard/traffic/cartons`           | Gestor de Cartones        |
| `/dashboard/traffic/daily-list`        | Lista Diaria (Listero)    |
| `/dashboard/traffic/navigation`        | Navegador UCOT            |
| `/dashboard/traffic/fleet-monitor`     | Monitoreo de Flota        |
| `/dashboard/traffic/statistics`        | Estadísticas Inspectores  |
| `/dashboard/traffic/analytics`         | Analítica de Servicio     |
| `/dashboard/fleet`                     | Coches / Inventario       |
| `/dashboard/admin/maintenance`         | Mantenimiento             |
| `/dashboard/alerts`                    | Alertas de Vía            |
| `/dashboard/admin/rrhh`                | Gestión de Personal       |
| `/dashboard/talento`                   | Centro de Talento         |
| `/dashboard/admin/rrhh/rotation`       | Motor de Rotación         |
| `/dashboard/admin/employees`           | Fichas Médicas/CI         |
| `/dashboard/admin/maintenance-system`  | Estado del Sistema        |
| `/dashboard/admin/ingestion`           | Ingesta de Datos          |
| `/dashboard/admin/params`              | Parámetros del Sistema    |
| `/dashboard/market`                    | Bolsa de Trabajo          |
| `/dashboard/my-balance`                | Mi Cuenta                 |

---

## Secciones probadas en esta pasada (rutas que faltaban)

### 1. Captura Inspector (Móvil) — `/dashboard/traffic/inspector-capture`

- **Carga:** OK.
- **Controles:** Combos Línea, Servicio/Cartón, Punto de control (Servicio y Punto deshabilitados hasta elegir línea). Texto: "Seleccione línea, servicio y punto de control. Luego Marcar Pasada."

### 2. Navegador UCOT — `/dashboard/traffic/navigation`

- **Carga:** OK.
- **Controles:** Textbox "Buscar línea por código o nombre", combos Filtrar por compañía, Filtrar por línea, Seleccionar recorrido; botones **Iniciar Viaje**, **Actualizar datos**, **Agregar desvío**; mapa con **Zoom in**, **Zoom out**.

### 3. Monitoreo de Flota — `/dashboard/traffic/fleet-monitor`

- **Carga:** OK.
- **Controles:** Mapa (Leaflet/OpenStreetMap), **Zoom in**, **Zoom out**. Texto: "0 unidades detectadas (UCOT + Competencia)".

### 4. Analítica de Servicio — `/dashboard/traffic/analytics`

- **Carga:** OK.
- **Controles:** Textbox fecha (2026-03-05), combobox "Todas". Título: "Estadísticas de Servicio" — promedios de atraso/adelanto por punto de control y tendencia de pasajeros.

### 5. Mantenimiento — `/dashboard/admin/maintenance`

- **Carga:** OK.
- **Controles:** **Nueva Denuncia**; filtros **Todos**, **Enviado**, **En Proceso**, **Finalizado**; múltiples **Resolver / Cerrar Ticket** por denuncia. Listado de denuncias (ej. "luz - falta lamparita").

### 6. Alertas de Vía — `/dashboard/alerts`

- **Carga:** OK.
- **Controles:** Solo cabecera y menú; contenido: "Novedades, desvíos e incidencias viales en tiempo real" y sección "Alertas Viales".

### 7. Gestión de Personal (RRHH) — `/dashboard/admin/rrhh`

- **Carga:** OK.
- **Controles:** **Usuarios**, **Estructura y Cargos**, **Descuentos y Retenciones**, **Exportar RRHH**, **Importar RRHH**; textbox Buscar; **Exportar Excel**, **Importar Excel**, **Nuevo Empleado**; tabla con muchos botones por fila; paginación **Anterior**, **Siguiente**.

### 8. Centro de Talento — `/dashboard/talento`

- **Carga:** OK.
- **Controles:** Searchbox "Buscar por nombre o legajo"; lista de botones por conductor (Usuario Operaciones, Super Admin UCOT, Conductor Demo 1001…, Jonathan Laluz, Conductor 100…). Texto: "Seleccione un conductor en la lista".

### 9. Motor de Rotación — `/dashboard/admin/rrhh/rotation`

- **Carga:** OK.
- **Controles:** Combos **Coche**, **Conductor**, **Servicio** (required); textbox **Fecha**; **Asignar y Guardar** (deshabilitado hasta completar); lista "Personal con coche fijo" (ej. Conductor Demo 1009 Coche 1009). Texto: "Cargue un archivo R-xxx.xls (Rotación) para generar la grilla por vehículo/servicio."

### 10. Fichas Médicas/CI (Gestión de Empleados) — `/dashboard/admin/employees`

- **Carga:** OK.
- **Controles:** **Exportar**, **Importar (XLSX)**, **Nuevo Empleado**. Título: "Administración de RRHH y Usuarios del Sistema".

### 11. Estado del Sistema — `/dashboard/admin/maintenance-system`

- **Carga:** OK.
- **Controles:** **ACTUALIZAR SISTEMA AHORA**. Paneles: Base de Datos (estado "ERROR DE ENLACE" en local), Servidor/API, Archivos/Import (XLSX Engine Ready), Reporte de Actividad del Sistema, Diagnóstico de Fallas, Estado de la Red PWA.

### 12. Parámetros del Sistema — `/dashboard/admin/params`

- **Carga:** OK.
- **Controles:** Spinbutton "Margen de tolerancia (minutos)" (valor 10), **Guardar**. Descripción: "Valores leídos globalmente por el motor de desvíos (puntualidad, semáforo Listero)."

### 13. Bolsa de Trabajo — `/dashboard/market`

- **Carga:** OK.
- **Controles:** Textbox "Filtrar por línea, coche…". Mensaje: "No hay turnos disponibles en el mercado actualmente."

### 14. Mi Cuenta — `/dashboard/my-balance`

- **Carga:** OK.
- **Controles:** **Descargar PDF**. Paneles: Mi Balance ("Dinero generado por trabajar", "Dinero descontado por ceder"), Historial de Transacciones.

---

## Resumen

- **Todas las 22 rutas del menú** han sido abiertas y verificadas (carga correcta y controles visibles).
- Las 14 rutas que no se habían abierto en la pasada anterior se probaron en esta sesión y se documentaron arriba.
- En cada una se comprobó: carga tras autenticación, presencia del menú lateral y de los botones/combos principales de la pantalla.
