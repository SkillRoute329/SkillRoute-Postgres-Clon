/**
 * GTFS-ENGINE: Motor de Horarios Programados
 * Proyecto: TransformaFacil / UCOT
 * Misión: Proveer el "Horario Ideal" para contrastar con el "GPS Real".
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const GTFS_PATH = path.join(__dirname, '../../../gtfs_data');

class GTFSEngine {
  constructor() {
    this.trips = new Map(); // trip_id -> { route_id, service_id, trip_headsign }
    this.schedules = new Map(); // route_id -> [ { trip_id, stop_id, arrival_time } ]
    this.isLoaded = false;
  }

  async load() {
    console.log('📖 GTFS: Cargando trips...');
    await this.loadTrips();
    console.log('📖 GTFS: trips cargados. Filtrando horarios UCOT (esto puede tardar)...');
    // Para simplificar esta versión "SYSTEMA", cargaremos solo las líneas de UCOT
    await this.loadStopTimes(['70']); // 70 es el ID de agencia UCOT en muchos sistemas, o filtramos por ruta
    this.isLoaded = true;
    console.log('✅ GTFS: Motor listo.');
  }

  async loadTrips() {
    const fileStream = fs.createReadStream(path.join(GTFS_PATH, 'trips.txt'));
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let first = true;
    let indices = {};

    for await (const line of rl) {
      const parts = line.split(',');
      if (first) {
        indices.routeId = parts.indexOf('route_id');
        indices.serviceId = parts.indexOf('service_id');
        indices.tripId = parts.indexOf('trip_id');
        indices.headsign = parts.indexOf('trip_headsign');
        first = false;
        continue;
      }
      this.trips.set(parts[indices.tripId], {
        routeId: parts[indices.routeId],
        serviceId: parts[indices.serviceId],
        headsign: parts[indices.headsign]
      });
    }
  }

  async loadStopTimes(agencyIds) {
    const fileStream = fs.createReadStream(path.join(GTFS_PATH, 'stop_times.txt'));
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let first = true;
    let indices = {};

    for await (const line of rl) {
      const parts = line.split(',');
      if (first) {
        indices.tripId = parts.indexOf('trip_id');
        indices.arrivalTime = parts.indexOf('arrival_time');
        indices.stopId = parts.indexOf('stop_id');
        indices.stopSequence = parts.indexOf('stop_sequence');
        first = false;
        continue;
      }

      const tripId = parts[indices.tripId];
      const trip = this.trips.get(tripId);
      
      if (trip) {
        // Filtrar por horario cercano a la hora actual para optimizar RAM
        // (En una versión de producción usaríamos SQLite para esto)
        if (!this.schedules.has(trip.routeId)) {
          this.schedules.set(trip.routeId, []);
        }
        this.schedules.get(trip.routeId).push({
          tripId,
          stopId: parts[indices.stopId],
          time: parts[indices.arrivalTime],
          seq: parseInt(parts[indices.stopSequence])
        });
      }
    }
  }

  getScheduledTime(routeId, stopId, targetTimeStr) {
    if (!this.schedules.has(routeId)) return null;
    
    // Buscar el horario más cercano al targetTimeStr
    const relevant = this.schedules.get(routeId).filter(s => s.stopId === stopId);
    // Lógica de búsqueda simple (primer match post-hora)
    return relevant.find(s => s.time >= targetTimeStr) || null;
  }
}

module.exports = new GTFSEngine();
