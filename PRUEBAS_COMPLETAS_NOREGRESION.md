# Pruebas completas – Orden de no regresión

**Objetivo:** Probar cada botón y cada función; prohibido dejar botones/funciones sin probar.

---

## Estado de la sesión

- **Dashboard:** Cargó correctamente con usuario "Super" (sesión iniciada).
- **Menú:** Abrir/Cerrar menú probado ✅ (el botón cambia a "Cerrar menú").
- **Matriz de Servicio** (`/dashboard/traffic/service-matrix`): Cargó; historial Cloud (archivo matriz), Eliminar, Subir a la nube (XLSX), botones de líneas (300a, 300b, … 221b). **Probado:** clic en **300a** ✅; aparece "+ Reportar Novedad".
- **Control Inspectores:** Navegación por enlace OK; luego la pestaña mostró error de red (chrome-error). Conviene repetir con el servidor local en marcha.

---

## Checklist obligatorio (no dejar sin probar)

### Cabecera (en todas las pantallas)

- [ ] **Abrir menú** / Cerrar menú
- [ ] **EN LÍNEA** (panel System Guard)
- [ ] **Notificaciones** (panel mensajes Listero/Chofer)
- [ ] **INICIAR TURNO** (flujo check-in)
- [ ] **Cerrar Sesión**

### Por ruta – botones y funciones a probar

| Ruta                           | Controles a probar                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vista General** `/dashboard` | INICIAR TURNO, bloques Estado operación, Cumplimiento, Líneas, Coches activos, Evolución atrasos, Mi Estado, Alertas vía                                          |
| **Matriz de Servicio**         | Historial (seleccionar archivo), Eliminar, Subir a la nube (XLSX), cada botón de línea (300a … 221b), + Reportar Novedad                                          |
| **Control Inspectores**        | Combobox Línea, Cargar, Estadísticas (link)                                                                                                                       |
| **Captura Inspector (Móvil)**  | Combos Línea, Servicio, Punto de control, Marcar Pasada                                                                                                           |
| **Gestor de Cartones**         | Filtros temporada/tipo día, carga por línea, botones por cartón, acciones (editar/ver)                                                                            |
| **Lista Diaria (Listero)**     | Combos/filtros, Asignar, ASIGNAR SUPLENTE, simulaciones por servicio, acciones por fila                                                                           |
| **Navegador UCOT**             | Buscar línea, Filtros compañía/línea/recorrido, Iniciar Viaje, Actualizar datos, Agregar desvío, Zoom in/out                                                      |
| **Monitoreo de Flota**         | Zoom in/out, capas mapa (si hay)                                                                                                                                  |
| **Estadísticas Inspectores**   | Filtros, gráficos, exportar (si hay)                                                                                                                              |
| **Analítica de Servicio**      | Fecha, combobox, gráficos                                                                                                                                         |
| **Coches / Inventario**        | Búsqueda, filtros, botones por vehículo, alta/edición                                                                                                             |
| **Mantenimiento**              | Nueva Denuncia, Todos/Enviado/En Proceso/Finalizado, Resolver/Cerrar Ticket por denuncia                                                                          |
| **Alertas de Vía**             | Listado/panel de alertas (si hay botones)                                                                                                                         |
| **Gestión de Personal (RRHH)** | Usuarios, Estructura y Cargos, Descuentos y Retenciones, Exportar/Importar RRHH, Buscar, Exportar/Importar Excel, Nuevo Empleado, filas tabla, Anterior/Siguiente |
| **Centro de Talento**          | Buscar, cada botón de conductor                                                                                                                                   |
| **Motor de Rotación**          | Combos Coche/Conductor/Servicio, Fecha, Asignar y Guardar, lista personal coche fijo, carga R-xxx.xls                                                             |
| **Fichas Médicas/CI**          | Exportar, Importar (XLSX), Nuevo Empleado, tabla empleados                                                                                                        |
| **Estado del Sistema**         | ACTUALIZAR SISTEMA AHORA, paneles diagnóstico                                                                                                                     |
| **Ingesta de Datos**           | DESCARGAR PLANTILLA, Sincronizar, Reporte PDF, Limpiar Simulación, área de drop, análisis por tipo                                                                |
| **Parámetros del Sistema**     | Margen tolerancia (spinbutton), Guardar                                                                                                                           |
| **Bolsa de Trabajo**           | Filtro línea/coche, (tomar turno si hay ofertas)                                                                                                                  |
| **Mi Cuenta**                  | Descargar PDF, filtro Historial (Este Mes)                                                                                                                        |

---

## Cómo ejecutar las pruebas (sin regresión)

1. Tener **localhost:5173** en marcha y **sesión iniciada**.
2. Recorrer cada ruta de la tabla (menú o URL directa).
3. En cada pantalla: **snapshot** → listar todos los `button`/`link`/`combobox`/`textbox` → **hacer clic** (o rellenar/select) en cada uno y anotar:
   - OK (respuesta esperada)
   - Error (mensaje o pantalla)
   - N/A (deshabilitado o no aplica)
4. Probar **Cerrar Sesión** al final y comprobar redirección a login.
5. Actualizar este documento con el resultado (OK/Error) por control.

---

## Regresiones detectadas (actualizar aquí)

- Ninguna anotada aún. (Tras repetir pruebas con servidor estable, rellenar.)
