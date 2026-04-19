# Esquema de Datos - Fase 3 (Control & Matriz)

## 3.1. Subcolección `controls`

Ubicación: `lineas/{lineId}/servicios/{serviceId}/controls/{stopKey}`

- `stopKey`: Nombre/ID sanitizado de la parada (para acceso directo).
- `stopName`: Nombre legible.
- `timestamp`: Fecha/Hora real del control (ISO String).
- `inspectorId`: UID del inspector.
- `inspectorName`: Nombre para auditoría rápida.
- `type`: 'CHECK' | 'MODIFICATION' | 'START' | 'END'.
- `load`: 'POCO' | 'ASIENTOS' | 'LLENO' | 'EXPLOTADO'.
- `timeDelta` (Number): Minutos de adelanto (+) o atraso (-) aplicados/detectados.
- `reason` (String): Justificación obligatoria si hubo cambio de horario.

## 3.2. Actualización en Documento Padre (`servicios/{serviceId}`)

Para KPIs rápidos sin leer subcolecciones:

- `status`: 'SCHEDULED' | 'ON_ROUTE' | 'COMPLETED'.
- `currentDelay` (Number): Retraso acumulado actual (minutos).
- `lastControl`: Timestamp del último control.
- `nextStop`: Nombre de la siguiente parada estimada.
