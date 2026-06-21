"use strict";
/**
 * vehicleHistoryService.ts
 *
 * FASE 2.4 (2026-05-10): Migrado de Firestore (`vehicle_events`, `system_status`)
 * a PostgreSQL local. Tablas en `schema_fase2.sql`. TTL 30 días gestionado por
 * la columna `expires_at` + función `vehicle_events_purge()`.
 *
 * Política de datos (regla -2):
 *   - Eventos persistidos provienen de scheduleComplianceEngine (datos GPS reales).
 *   - Si la DB no responde, las funciones de lectura devuelven [] (no inventar).
 *
 * Escalabilidad (regla -4):
 *   - vehicle_events tiene índices por id_bus, agency_id, linea, geom GIST.
 *   - Inserts en batch (BATCH_SIZE=400). Limit explícito en todas las queries.
 *   - Cuando la tabla supere los 50M registros, particionar por mes (ver
 *     local-skillroute-postgres-mgmt/SKILL.md operación 5).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveComplianceSnapshot = saveComplianceSnapshot;
exports.getVehicleHistory = getVehicleHistory;
exports.getVehicleSummary = getVehicleSummary;
exports.getActiveBusesSnapshot = getActiveBusesSnapshot;
exports.getLastKnownBusesSnapshot = getLastKnownBusesSnapshot;
exports.getLineSummaryHistory = getLineSummaryHistory;
exports.getEndpointHealth = getEndpointHealth;
exports.setEndpointHealth = setEndpointHealth;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const TABLE = 'vehicle_events';
const TTL_DAYS = 30;
function rowToEvent(r) {
    return {
        idBus: r.id_bus,
        agencyId: r.agency_id,
        empresa: r.empresa,
        linea: r.linea,
        lat: r.lat,
        lon: r.lon,
        velocidad: r.velocidad,
        estadoCumplimiento: r.estado_cumplimiento,
        desviacionMin: r.desviacion_min,
        tripId: r.trip_id,
        proximaParada: r.proxima_parada,
        timestampGPS: typeof r.timestamp_gps === 'string'
            ? r.timestamp_gps
            : r.timestamp_gps.toISOString(),
        createdAt: r.created_at,
        expiresAt: r.expires_at,
    };
}
/** Guarda un batch de eventos de cumplimiento en Postgres (batches de 400) */
async function saveComplianceSnapshot(results) {
    if (results.length === 0)
        return;
    const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
    const BATCH_SIZE = 400;
    try {
        for (let i = 0; i < results.length; i += BATCH_SIZE) {
            const batch = results.slice(i, i + BATCH_SIZE).map((r) => ({
                id_bus: r.idBus,
                agency_id: r.agencyId,
                empresa: r.empresa,
                linea: r.linea,
                lat: r.lat,
                lon: r.lon,
                // PostGIS geom: ST_SetSRID(ST_MakePoint(lon, lat), 4326)
                geom: database_1.default.raw('ST_SetSRID(ST_MakePoint(?, ?), 4326)', [r.lon, r.lat]),
                velocidad: r.velocidad,
                estado_cumplimiento: r.estadoCumplimiento,
                desviacion_min: r.desviacionMin,
                trip_id: r.tripActivo?.trip_id ?? null,
                proxima_parada: r.proximaParadaControl?.name ?? null,
                timestamp_gps: r.timestampGPS,
                expires_at: expiresAt,
                // FASE 5.14: destino del feed IMM + sentido IDA/VUELTA derivado.
                destino: r.destino ?? null,
                sentido: r.sentido ?? null,
            }));
            await (0, database_1.default)(TABLE).insert(batch);
        }
        logger_1.default.info(`[VehicleHistory] Guardados ${results.length} eventos en Postgres`);
        // ─── FASE 5.15 (2026-05-14): SINCRONIZACIÓN AUTOMÁTICA CON FLOTA (User Request)
        // Cualquier coche UCOT reconocido y activo en calle se auto-registra/sincroniza en flota
        const ucotBuses = results.filter((r) => r.agencyId === '70');
        if (ucotBuses.length > 0) {
            const uniqueBusesMap = new Map();
            for (const b of ucotBuses) {
                uniqueBusesMap.set(b.idBus, b);
            }
            for (const [idBus, bus] of uniqueBusesMap.entries()) {
                await (0, database_1.default)('vehiculos')
                    .insert({
                    id: idBus,
                    agency_id: '70',
                    internal_number: idBus,
                    data_jsonb: JSON.stringify({
                        coche: idBus,
                        cocheId: idBus,
                        empresa: 70,
                        agencyId: 70,
                        marca: 'Volare / Marcopolo (Auto)',
                        status: 'activo',
                        source: 'GPS_COMPLIANCE_SYNC',
                        lineaActiva: bus.linea,
                        lastSeenGPS: bus.timestampGPS,
                        velocidadActual: bus.velocidad,
                        estadoCumplimientoActual: bus.estadoCumplimiento,
                        desviacionMinActual: bus.desviacionMin,
                        tripActivo: bus.tripActivo?.trip_id ?? null,
                        updatedAt: new Date().toISOString()
                    }),
                    created_at: new Date()
                })
                    .onConflict('id')
                    .merge({
                    data_jsonb: database_1.default.raw("vehiculos.data_jsonb || ?::jsonb", [JSON.stringify({
                            lineaActiva: bus.linea,
                            lastSeenGPS: bus.timestampGPS,
                            velocidadActual: bus.velocidad,
                            estadoCumplimientoActual: bus.estadoCumplimiento,
                            desviacionMinActual: bus.desviacionMin,
                            tripActivo: bus.tripActivo?.trip_id ?? null,
                            status: 'activo',
                            updatedAt: new Date().toISOString()
                        })])
                });
            }
            logger_1.default.info(`[VehicleHistory] Auto-sincronizados ${uniqueBusesMap.size} coches UCOT en Inventario de Flota y Mantenimiento`);
        }
    }
    catch (error) {
        logger_1.default.error('[VehicleHistory] Error guardando snapshot de compliance', { error: String(error) });
        // No re-throw — esto es telemetría, no debe romper el pipeline GPS.
    }
}
/**
 * Historial de un coche específico (últimos N días).
 *
 * FASE 5.14 (2026-05-13): si se pasa agencyId, filtra también por agency_id.
 * Sin este filtro, dos operadores con el mismo codigoBus (ej. UCOT 46 y
 * CUTCSA 46) producen un historial mezclado, lo que rompe la auditoría IMM
 * porque los datos no coinciden con los del operador.
 *
 * El parámetro `idBus` acepta tanto el formato crudo (`46`) — que es como
 * vehicle_events almacena el codigoBus — como el formato prefijado
 * (`70_46`) que usa bus_last_pos. Si llega prefijado, se separa y se usa
 * agency_id derivado del prefijo cuando el parámetro explícito no viene.
 */
async function getVehicleHistory(idBus, days = 7, agencyId) {
    try {
        let rawId = idBus;
        let agency = agencyId;
        const m = /^(\d+)_(.+)$/.exec(idBus);
        if (m) {
            if (!agency)
                agency = m[1];
            rawId = m[2];
        }
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const q = (0, database_1.default)(TABLE)
            .where('id_bus', rawId)
            .where('created_at', '>=', since)
            .orderBy('created_at', 'desc')
            .limit(500);
        if (agency)
            q.where('agency_id', agency);
        const rows = await q;
        return rows.map(rowToEvent);
    }
    catch (error) {
        logger_1.default.error(`[VehicleHistory] Error getVehicleHistory(${idBus})`, { error: String(error) });
        return [];
    }
}
/** Resumen estadístico de un coche */
async function getVehicleSummary(idBus, days = 30, agencyId) {
    const events = await getVehicleHistory(idBus, days, agencyId);
    if (events.length === 0)
        return null;
    const empresa = events[0].empresa;
    const lineas = [...new Set(events.map((e) => e.linea))];
    const velocidades = events.map((e) => e.velocidad).filter((v) => v > 0);
    const velMedia = velocidades.length > 0
        ? Math.round(velocidades.reduce((a, b) => a + b, 0) / velocidades.length)
        : 0;
    const enTiempo = events.filter((e) => e.estadoCumplimiento === 'EN_TIEMPO').length;
    const atrasado = events.filter((e) => e.estadoCumplimiento === 'ATRASADO').length;
    const adelantado = events.filter((e) => e.estadoCumplimiento === 'ADELANTADO').length;
    const sinHorario = events.filter((e) => e.estadoCumplimiento === 'SIN_HORARIO' ||
        e.estadoCumplimiento === 'FUERA_DE_SERVICIO').length;
    const conSchedule = enTiempo + atrasado + adelantado;
    const desviaciones = events
        .map((e) => e.desviacionMin)
        .filter((d) => d !== null);
    const desvMedia = desviaciones.length > 0
        ? Math.round(desviaciones.reduce((a, b) => a + b, 0) / desviaciones.length)
        : null;
    const timestamps = events.map((e) => e.timestampGPS).sort();
    return {
        idBus,
        empresa,
        lineasOperadas: lineas,
        totalEventos: events.length,
        velocidadMedia: velMedia,
        pctEnTiempo: conSchedule > 0 ? Math.round((enTiempo / conSchedule) * 100) : 0,
        pctAtrasado: conSchedule > 0 ? Math.round((atrasado / conSchedule) * 100) : 0,
        pctAdelantado: conSchedule > 0 ? Math.round((adelantado / conSchedule) * 100) : 0,
        pctSinHorario: events.length > 0 ? Math.round((sinHorario / events.length) * 100) : 0,
        ultimaActividad: timestamps[timestamps.length - 1] ?? null,
        primeraActividad: timestamps[0] ?? null,
        desviacionMediaMin: desvMedia,
    };
}
/** Buses activos en tiempo real agrupados por línea (últimos 3 min) */
async function getActiveBusesSnapshot(agencyId) {
    try {
        const since = new Date(Date.now() - 3 * 60 * 1000);
        const rows = await (0, database_1.default)(TABLE)
            .where('agency_id', agencyId)
            .where('created_at', '>=', since)
            .orderBy('created_at', 'desc')
            .limit(200);
        const seen = new Set();
        const buses = [];
        for (const r of rows) {
            if (seen.has(r.id_bus))
                continue;
            seen.add(r.id_bus);
            buses.push({
                idBus: r.id_bus,
                linea: r.linea,
                velocidad: r.velocidad,
                estadoCumplimiento: r.estado_cumplimiento,
                lat: r.lat,
                lon: r.lon,
            });
        }
        return buses;
    }
    catch (error) {
        logger_1.default.error(`[VehicleHistory] Error getActiveBusesSnapshot(${agencyId})`, { error: String(error) });
        return [];
    }
}
/** Último snapshot conocido de Postgres (fallback cuando GPS está caído). */
async function getLastKnownBusesSnapshot(agencyId, hoursBack = 24) {
    const windows = [hoursBack, 48, 7 * 24, 30 * 24].filter((h) => h >= hoursBack);
    for (const hours of windows) {
        try {
            const since = new Date(Date.now() - hours * 60 * 60 * 1000);
            const rows = await (0, database_1.default)(TABLE)
                .where('agency_id', agencyId)
                .where('created_at', '>=', since)
                .orderBy('created_at', 'desc')
                .limit(500);
            if (rows.length === 0)
                continue;
            const seen = new Set();
            const buses = [];
            let latestTs = null;
            for (const r of rows) {
                if (seen.has(r.id_bus))
                    continue;
                seen.add(r.id_bus);
                const tsStr = typeof r.timestamp_gps === 'string'
                    ? r.timestamp_gps
                    : r.timestamp_gps.toISOString();
                buses.push({
                    idBus: r.id_bus,
                    linea: r.linea,
                    velocidad: r.velocidad,
                    estadoCumplimiento: r.estado_cumplimiento,
                    lat: r.lat,
                    lon: r.lon,
                    desviacionMin: r.desviacion_min,
                    timestampGPS: tsStr,
                });
                if (!latestTs || tsStr > latestTs)
                    latestTs = tsStr;
            }
            if (buses.length > 0) {
                return { buses, dataTimestamp: latestTs, hoursBack: hours };
            }
        }
        catch (error) {
            logger_1.default.error(`[VehicleHistory] Error getLastKnownBusesSnapshot ventana=${hours}h`, { error: String(error) });
        }
    }
    return { buses: [], dataTimestamp: null, hoursBack };
}
/** Resumen agregado por línea para los últimos N días */
async function getLineSummaryHistory(agencyId, days = 7) {
    try {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const rows = await (0, database_1.default)(TABLE)
            .where('agency_id', agencyId)
            .where('created_at', '>=', since)
            .orderBy('created_at', 'desc')
            .limit(5000);
        const byLine = {};
        for (const r of rows) {
            if (!byLine[r.linea]) {
                byLine[r.linea] = {
                    buses: new Set(),
                    eventos: 0,
                    enTiempo: 0,
                    atrasado: 0,
                    adelantado: 0,
                    sinHorario: 0,
                    desviaciones: [],
                    velocidades: [],
                    ultimaActividad: null,
                };
            }
            const l = byLine[r.linea];
            l.buses.add(r.id_bus);
            l.eventos++;
            const ts = typeof r.timestamp_gps === 'string' ? r.timestamp_gps : r.timestamp_gps.toISOString();
            if (r.estado_cumplimiento === 'EN_TIEMPO')
                l.enTiempo++;
            else if (r.estado_cumplimiento === 'ATRASADO')
                l.atrasado++;
            else if (r.estado_cumplimiento === 'ADELANTADO')
                l.adelantado++;
            else
                l.sinHorario++;
            if (r.desviacion_min != null)
                l.desviaciones.push(r.desviacion_min);
            if (r.velocidad > 0)
                l.velocidades.push(r.velocidad);
            if (!l.ultimaActividad || ts > l.ultimaActividad)
                l.ultimaActividad = ts;
        }
        return Object.entries(byLine)
            .map(([linea, l]) => {
            const conSchedule = l.enTiempo + l.atrasado + l.adelantado;
            const desv = l.desviaciones.length > 0
                ? Math.round(l.desviaciones.reduce((a, b) => a + b, 0) / l.desviaciones.length)
                : null;
            const vel = l.velocidades.length > 0
                ? Math.round(l.velocidades.reduce((a, b) => a + b, 0) / l.velocidades.length)
                : 0;
            return {
                linea,
                totalEventos: l.eventos,
                busesUnicos: l.buses.size,
                pctEnTiempo: conSchedule > 0 ? Math.round((l.enTiempo / conSchedule) * 100) : 0,
                pctAtrasado: conSchedule > 0 ? Math.round((l.atrasado / conSchedule) * 100) : 0,
                pctAdelantado: conSchedule > 0 ? Math.round((l.adelantado / conSchedule) * 100) : 0,
                pctSinHorario: l.eventos > 0 ? Math.round((l.sinHorario / l.eventos) * 100) : 0,
                desviacionMediaMin: desv,
                velocidadMedia: vel,
                ultimaActividad: l.ultimaActividad,
            };
        })
            .sort((a, b) => b.totalEventos - a.totalEventos);
    }
    catch (error) {
        logger_1.default.error(`[VehicleHistory] Error getLineSummaryHistory(${agencyId})`, { error: String(error) });
        return [];
    }
}
/** Lee el estado del endpoint GPS desde tabla system_status */
async function getEndpointHealth() {
    try {
        const row = await (0, database_1.default)('system_status')
            .where('key', 'stm_gps')
            .first();
        if (!row) {
            return {
                status: 'UNKNOWN',
                lastCheck: null,
                downSince: null,
                upSince: null,
                consecutiveFailures: 0,
                lastSuccessfulCollection: null,
            };
        }
        const d = row.value_jsonb;
        const toISO = (v) => {
            if (!v)
                return null;
            if (typeof v === 'string')
                return v;
            if (v instanceof Date)
                return v.toISOString();
            if (v?.toDate)
                return v.toDate().toISOString();
            return null;
        };
        return {
            status: d.status ?? 'UNKNOWN',
            lastCheck: toISO(d.lastCheck),
            downSince: toISO(d.downSince),
            upSince: toISO(d.upSince),
            consecutiveFailures: d.consecutiveFailures ?? 0,
            lastSuccessfulCollection: toISO(d.lastSuccessfulCollection),
        };
    }
    catch (error) {
        logger_1.default.error('[VehicleHistory] Error getEndpointHealth', { error: String(error) });
        return {
            status: 'UNKNOWN',
            lastCheck: null,
            downSince: null,
            upSince: null,
            consecutiveFailures: 0,
            lastSuccessfulCollection: null,
        };
    }
}
/** Helper para que autoStatsCollector u otros writers actualicen el health */
async function setEndpointHealth(key, value) {
    try {
        await (0, database_1.default)('system_status')
            .insert({
            key,
            value_jsonb: JSON.stringify(value),
        })
            .onConflict('key')
            .merge({
            value_jsonb: JSON.stringify(value),
            updated_at: new Date(),
        });
    }
    catch (error) {
        logger_1.default.error(`[VehicleHistory] Error setEndpointHealth(${key})`, { error: String(error) });
    }
}
