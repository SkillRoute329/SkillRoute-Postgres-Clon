# GTFS-Realtime Publisher — SkillRoute / UCOT

**Versión:** 1.0.0
**Standard:** GTFS-Realtime 2.0 (https://gtfs.org/realtime/)
**Creado:** 2026-04-23 (Fase 1 #5)

---

## Por qué existe

Publicar un feed GTFS-Realtime propio es la **tabla de entrada** para que SkillRoute se integre con:

- **Google Maps Transit** — el más grande consumidor GTFS-RT del mundo
- **Moovit** (propiedad de Intel)
- **Citymapper**
- **Transit App** (Canadá, EE.UU., Londres)
- **Apple Maps Transit** (donde esté habilitado)
- Cualquier sistema MaaS (Mobility-as-a-Service) regional

Con esto SkillRoute deja de ser "un sistema interno UCOT" y pasa a ser una fuente de datos que el mundo puede consumir. Es también requisito técnico implícito para cualquier acuerdo con operadores internacionales (Trapeze, INIT, Swiftly) que interoperan por estos estándares.

---

## Endpoints expuestos

Después de deploy (`firebase deploy --only functions:gtfsRealtime`):

| Endpoint | Método | Content-Type | Propósito |
|---|---|---|---|
| `/gtfsRealtime/vehicle-positions.pb` | GET | `application/x-protobuf` | Feed principal (producción) |
| `/gtfsRealtime/vehicle-positions.json` | GET | `application/json` | Debug humano |
| `/gtfsRealtime/feed-info` | GET | `application/json` | Metadata del publisher |
| `/gtfsRealtime/health` | GET | `application/json` | Readiness check |

**URL base en producción:**
```
https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsRealtime
```

### Query params soportados

- `?agency=ucot` — filtrar solo vehículos UCOT (también `cutcsa`, `coetc`, `come`). Sin filtro → todas las empresas.

### Cache

Respuestas incluyen `Cache-Control: public, max-age=15`. El cache in-memory del publisher se refresca cada 15 s. GTFS-RT spec recomienda ventana de refresh 15-30 s.

---

## Prueba rápida

### Feed info (humano)

```bash
curl https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsRealtime/feed-info
```

### Protobuf → decodificar a JSON con la CLI oficial

```bash
# Instalar protoc + el .proto de GTFS-RT una sola vez:
curl -sL https://raw.githubusercontent.com/google/transit/master/gtfs-realtime/proto/gtfs-realtime.proto -o gtfs-realtime.proto

# Decodificar feed:
curl -s https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsRealtime/vehicle-positions.pb \
  | protoc --decode=transit_realtime.FeedMessage gtfs-realtime.proto
```

### Debug directo en JSON (no-protobuf, solo inspección)

```bash
curl https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsRealtime/vehicle-positions.json | jq '.feed.entity | length'
```

### Python + gtfs-realtime-bindings

```python
import requests
from google.transit import gtfs_realtime_pb2

r = requests.get('https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsRealtime/vehicle-positions.pb')
feed = gtfs_realtime_pb2.FeedMessage()
feed.ParseFromString(r.content)
for e in feed.entity[:5]:
    v = e.vehicle
    print(v.vehicle.id, v.trip.route_id, v.position.latitude, v.position.longitude)
```

---

## Mapeo IMM → GTFS-RT

| Campo IMM (STM Montevideo) | Campo GTFS-RT | Notas |
|---|---|---|
| `codigoEmpresa` | `entity.vehicle.vehicle.id` (prefijo) + `trip.agency_id` implícito | 10=COETC, 20=COME, 50=CUTCSA, 70=UCOT |
| `codigoBus` | `entity.vehicle.vehicle.id` (sufijo) | ID único interno del bus |
| `linea` | `trip.route_id` | Numeración STM (ej. "300", "CA1") |
| `sublinea + variante + destino` | `trip.trip_id` (aproximado) | Ver limitaciones abajo |
| `velocidad` (km/h) | `position.speed` (m/s) | Conversión automática ×0.277778 |
| `geometry.coordinates[lat,lng]` | `position.latitude`, `position.longitude` | WGS84 |
| (hora del fetch) | `vehicle.timestamp`, `header.timestamp` | Unix epoch seconds |
| (constante) | `header.gtfs_realtime_version = "2.0"` | |
| (constante) | `header.incrementality = FULL_DATASET` | Siempre full snapshot, no diffs |
| (constante) | `trip.schedule_relationship = SCHEDULED` | |
| (constante) | `vehicle.current_status = IN_TRANSIT_TO` | |

---

## Limitaciones reconocidas (v1.0)

Estas son las deudas técnicas del feed actual. Se resuelven en próximas fases:

### 1. `trip.trip_id` es aproximado

IMM expone `sublinea + variante + destino` pero no el `trip_id` oficial del GTFS-static. Nuestro `trip_id` se construye como `linea|sublinea|variante`. Los consumidores que cruzan con GTFS-static oficial del STM deben mapear por `route_id + headsign`, no por `trip_id`.

**Cierre futuro:** cuando publiquemos GTFS-static propio con `trips.txt` coherente, este campo será directo.

### 2. Sin `TripUpdates`

Solo publicamos VehiclePositions. TripUpdates (ETAs y delays por parada) requiere schedule interno por `trip_id` + predicciones de llegada, aún no implementado.

**Cierre futuro:** una vez tengamos el scraper JSF horarios completo (ya existe como `refreshAllStmHorariosTick`) + motor de predicción ETA, agregamos `/trip-updates.pb`.

### 3. Sin `ServiceAlerts`

No publicamos alertas de servicio (desvíos, suspensiones). La colección `alertas_regulacion` existe internamente pero no está mapeada a GTFS-RT Alert entities.

**Cierre futuro:** endpoint `/service-alerts.pb` que lee `alertas_regulacion` + `desvios_activos` y las serializa.

### 4. Sin GTFS-static emitido por nosotros

Un feed GTFS-RT sin su GTFS-static hermano es consumible pero incompleto — los consumidores necesitan stops, routes, trips y shapes estáticos para contextualizar. Hoy asumimos que los consumidores cruzan con el GTFS-static que publica el STM o que cargan el suyo propio.

**Cierre futuro:** publicar `gtfs-static.zip` (stops.txt, routes.txt, trips.txt, stop_times.txt, shapes.txt, agency.txt, calendar.txt) generado desde nuestros datos de `lineas_ucot` + `paradas_stm`.

### 5. Sin autenticación / rate-limiting

Endpoint público. Si algún consumidor abusa (cientos de requests por segundo), el publisher golpea la IMM directamente por cache miss.

**Cierre futuro:** firebase-functions rate limit por IP + API key opcional para consumidores serios.

---

## Cómo registrar en plataformas externas

### Google Maps Transit Partner

1. Ir a https://maps.google.com/transit y solicitar acceso como agency.
2. Proveer:
   - URL del feed GTFS-RT: `https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsRealtime/vehicle-positions.pb`
   - URL del GTFS-static: pendiente (ver limitación #4)
   - Área de cobertura: Montevideo, Uruguay
   - Contacto técnico
3. Google revisa y aprueba (~ 2-4 semanas).

### Moovit — Agency Partner Program

Similar pero más directo: formulario en https://moovit.com/business-solutions/.

### Transit App

https://transitapp.com/operators — acepta feeds GTFS-RT directamente.

---

## Arquitectura interna

```
┌────────────────────────────────────────────────────┐
│ Google Maps, Moovit, Citymapper, Transit App       │
│     └─ GET /vehicle-positions.pb cada 15-30s       │
└──────────────────────┬─────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────┐
│ Cloud Function: gtfsRealtime                       │
│  ├─ Cache in-memory (15s TTL)                      │
│  ├─ fetchAllBuses() → STM snapshot                 │
│  ├─ buildFeedMessage() → FeedMessage protobuf      │
│  └─ res.send(Buffer) con Content-Type protobuf     │
└──────────────────────┬─────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────┐
│ STM Montevideo (IMM)                               │
│  POST /buses/rest/stm-online  { empresa: "-1" }    │
│  Returns: GeoJSON con ~300+ buses de 4 empresas    │
└────────────────────────────────────────────────────┘
```

El publisher es stateless (nada persistido en Firestore). Los buses vienen directo de IMM cada 15s con cache in-memory. Si la función se reinicia (cold start), el próximo request golpea IMM.

---

## Observabilidad

### Métricas incluidas en respuesta

Headers HTTP en `/vehicle-positions.pb`:
- `X-Feed-Entities`: cantidad de VehiclePosition en el feed
- `X-Gtfs-Realtime-Version`: `2.0`
- `Cache-Control`: `public, max-age=15`

### Logs en Cloud Logging

Todo error logea con prefijo `[gtfsRealtime <endpoint>] Error:`. Filtrar en Firebase Console → Functions → Logs → `gtfsRealtime`.

### Alerta recomendada

Cuando `X-Feed-Entities` cae < 50 durante > 5 minutos → probable fallo IMM o cache obsoleto. Configurar en Cloud Monitoring.

---

## Archivos relevantes

- `functions/src/gtfsRealtime.ts` — implementación
- `functions/src/index.ts` — export de la Cloud Function
- `functions/package.json` — dep `gtfs-realtime-bindings ^1.1.1`
- `GTFS_RT_PUBLISHER.md` — este documento

---

## Spec reference

- GTFS-Realtime 2.0: https://gtfs.org/realtime/reference/
- Proto file: https://github.com/google/transit/blob/master/gtfs-realtime/proto/gtfs-realtime.proto
- Best practices Google: https://developers.google.com/transit/gtfs-realtime
- Best practices UITP: https://www.uitp.org/publications
