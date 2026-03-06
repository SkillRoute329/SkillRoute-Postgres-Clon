# Firestore Schema - TransForma 2.0 (Phase 2 - Production)

## 1. Core Inventory

### `vehicles` (Collection)

El inventario físico de la flota.

- `id` (String): Número Interno del coche (ej: "95", "101"). Clave primaria natural.
- `internalNumber` (String): Mismo que ID. redundancia útil.
- `plate` (String): Matrícula (ej: "STU 1234").
- `brand` (String): Marca (ej: "Mercedes Benz").
- `model` (String): Modelo (ej: "OH 1618").
- `capacity` (Number): Pasajeros (ej: 42).
- `status` (String): 'ACTIVE' | 'MAINTENANCE' | 'BLOCKED'.
- `activeIncidents` (Number): Contador de incidencias abiertas.
- `photos` (Array<Object>):
  - `url` (String): URL de Storage.
  - `type` (String): 'FRONT' | 'BACK' | 'DOCS'.
  - `uploadedAt`: ISO Date.
- `documents` (Array<Object>): Libretas, Seguros.

### `lines` (Collection)

Esqueleto de la red de transporte.

- `id` (String): Número de línea (ej: "300", "306").
- `origin` (String).
- `destination` (String).
- `stops` (Subcollection): Paradas ordenadas.

### `lineas/{id}/servicios` (Subcollection)

Datos "Ingestados" de los Cartones (Matrices de Tiempo).

- `id` (String): Número de servicio (ej: "6011").
- `linea` (String).
- `horarios` (Array<Object>): Array de viajes del servicio.
- `paradas_oficiales` (Array<String>).

## 2. Operations

### `shifts` (Collection)

Asignaciones dinámicas (Turnos diarios).

- `date`: "YYYY-MM-DD".
- `serviceId`: Ref a `servicios`.
- `vehicleId`: Ref a `vehicles`.
- `driverId`: Ref a `users`.
- `guardId`: Ref a `users`.

### `road_alerts` (Collection)

Alertas Waze Corporativo.

- `status`: 'ACTIVE' | 'RESOLVED'.
- `location`: Geopoint.
- `type`: 'ACCIDENT' | 'TRAFFIC'.

## 3. Maintenance

### `incidents` (Collection)

Reportes de fallas. Relacionado con vehículos.

- `vehicleId` (String).
- `reportedBy` (String).
- `severity` (String): 'BLOCKING' (Impide asignación) | 'MINOR'.
- `description` (String).
- `status` (String): 'OPEN' | 'IN_PROGRESS' | 'CLOSED'.
