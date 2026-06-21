"use strict";
/**
 * scheduleComplianceEngine.ts
 * Motor de cumplimiento automático — compara posición GPS en tiempo real
 * contra la malla horaria GTFS oficial (invierno 2026).
 *
 * No requiere inspectores. Funciona para UCOT, CUTCSA, COETC, COME.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRoutesForAgency = getRoutesForAgency;
exports.getAvailableAgencies = getAvailableAgencies;
exports.getActiveTripsNow = getActiveTripsNow;
exports.analyzeComplianceForAgency = analyzeComplianceForAgency;
exports.summarizeByRoute = summarizeByRoute;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const immRealtimeService_1 = require("./immRealtimeService");
const logger_1 = require("../config/logger");
// ── Carga de datos GTFS (una sola vez en memoria) ─────────────────────────
const DATA_DIR = path.join(__dirname, '../data/gtfs');
let _scheduleIndex = null;
let _stopsGeo = null;
function getScheduleIndex() {
    if (!_scheduleIndex) {
        _scheduleIndex = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'schedule_index.json'), 'utf8'));
        logger_1.logger.info('[ComplianceEngine] schedule_index.json cargado en memoria');
    }
    return _scheduleIndex;
}
function getStopsGeo() {
    if (!_stopsGeo) {
        _stopsGeo = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stops_geo.json'), 'utf8'));
    }
    return _stopsGeo;
}
// ── Helpers ────────────────────────────────────────────────────────────────
/** Distancia en km entre dos coordenadas (Haversine simplificado) */
function distKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
/** Convierte "HH:MM:SS" a minutos desde medianoche */
function toMin(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}
/** Día de la semana → tipo de horario */
function getDayType(date) {
    const dow = date.getDay(); // 0=dom, 6=sab
    if (dow === 0)
        return 'domingos';
    if (dow === 6)
        return 'sabados';
    return 'habiles';
}
/** Obtiene hora operativa y tipo de día, manejando el cruce de medianoche operativo (antes de 04:00 AM) */
function getOperationalTimeAndDay(date) {
    const adjustedDate = new Date(date);
    let nowMin = date.getHours() * 60 + date.getMinutes();
    if (date.getHours() < 4) {
        // Es antes de las 4:00 AM, operativamente es el día anterior
        adjustedDate.setDate(adjustedDate.getDate() - 1);
        nowMin += 1440; // Rango de 24h a 28h
    }
    const dayType = getDayType(adjustedDate);
    return { nowMin, dayType };
}
// ── API pública ────────────────────────────────────────────────────────────
/** Devuelve todas las líneas y viajes disponibles para una empresa */
function getRoutesForAgency(agencyId) {
    const idx = getScheduleIndex();
    return idx[agencyId]?.routes ?? null;
}
/** Lista de empresas disponibles en el GTFS */
function getAvailableAgencies() {
    const idx = getScheduleIndex();
    return Object.entries(idx).map(([id, ag]) => ({
        id,
        name: ag.agency_name,
        routes: Object.keys(ag.routes),
    }));
}
/** Viajes activos ahora mismo para una línea + empresa + día */
function getActiveTripsNow(agencyId, routeShort, now = new Date()) {
    const idx = getScheduleIndex();
    const route = idx[agencyId]?.routes[routeShort];
    if (!route)
        return [];
    const { nowMin, dayType } = getOperationalTimeAndDay(now);
    return route[dayType].filter(t => {
        if (!t.departure || !t.arrival)
            return false;
        const dep = toMin(t.departure);
        let arr = toMin(t.arrival);
        if (arr < dep) {
            arr += 1440; // Cruce de medianoche
        }
        return nowMin >= dep && nowMin <= arr;
    });
}
/**
 * Analiza cumplimiento de todos los buses de una empresa en tiempo real.
 * Descarga GPS del STM y cruza contra la malla GTFS.
 */
async function analyzeComplianceForAgency(agencyId) {
    const now = new Date();
    const idx = getScheduleIndex();
    const agData = idx[agencyId];
    if (!agData) {
        logger_1.logger.warn(`[ComplianceEngine] Agency ${agencyId} no encontrada en GTFS`);
        return [];
    }
    const { nowMin, dayType } = getOperationalTimeAndDay(now);
    // Mapear agencyId a código STM
    const codeMap = {
        '10': immRealtimeService_1.EMPRESA_CODES.COETC,
        '20': immRealtimeService_1.EMPRESA_CODES.COME,
        '50': immRealtimeService_1.EMPRESA_CODES.CUTCSA,
        '70': immRealtimeService_1.EMPRESA_CODES.UCOT,
    };
    const stmCode = codeMap[agencyId] ?? agencyId;
    // Obtener posiciones GPS en vivo
    let features;
    try {
        const geoJson = await (0, immRealtimeService_1.fetchBusesLive)(stmCode);
        features = geoJson.features ?? [];
    }
    catch (err) {
        logger_1.logger.error('[ComplianceEngine] Error obteniendo GPS:', err);
        return [];
    }
    const results = [];
    function normName(s) {
        return String(s ?? '')
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[()]/g, ' ')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    function clusterDestinos(linea) {
        const empty = { centroIda: null, centroVuelta: null, nameToSentido: new Map() };
        const route = agData.routes[linea];
        if (!route)
            return empty;
        const trips = route[dayType] ?? [];
        // Recolectar destinos únicos (last control_stop) con coordenadas
        const seen = new Map();
        for (const t of trips) {
            const last = t.control_stops?.[t.control_stops.length - 1];
            if (!last?.name || typeof last.lat !== 'number' || typeof last.lon !== 'number')
                continue;
            if (!seen.has(last.name))
                seen.set(last.name, { lat: last.lat, lon: last.lon });
        }
        if (seen.size === 0)
            return empty;
        if (seen.size === 1) {
            const [name, pos] = seen.entries().next().value;
            const map = new Map();
            map.set(normName(name), 'IDA');
            return { centroIda: pos, centroVuelta: null, nameToSentido: map };
        }
        // Calcular varianza lat vs lon para elegir eje
        const lats = Array.from(seen.values()).map((p) => p.lat);
        const lons = Array.from(seen.values()).map((p) => p.lon);
        const meanLat = lats.reduce((a, b) => a + b, 0) / lats.length;
        const meanLon = lons.reduce((a, b) => a + b, 0) / lons.length;
        const varLat = lats.reduce((s, v) => s + (v - meanLat) ** 2, 0);
        const varLon = lons.reduce((s, v) => s + (v - meanLon) ** 2, 0);
        // Eje de mayor varianza define la separacion. cluster A = lado "menor", cluster B = "mayor"
        const useLat = varLat >= varLon;
        const threshold = useLat ? meanLat : meanLon;
        // Por convencion: cluster con coordenada MENOR = IDA, MAYOR = VUELTA.
        // Esto es arbitrario pero consistente, lo cual es lo que importa.
        const idaPositions = [];
        const vueltaPositions = [];
        const nameToSentido = new Map();
        for (const [name, pos] of seen) {
            const coord = useLat ? pos.lat : pos.lon;
            if (coord <= threshold) {
                idaPositions.push(pos);
                nameToSentido.set(normName(name), 'IDA');
            }
            else {
                vueltaPositions.push(pos);
                nameToSentido.set(normName(name), 'VUELTA');
            }
        }
        const centroide = (arr) => arr.length === 0
            ? null
            : { lat: arr.reduce((s, p) => s + p.lat, 0) / arr.length, lon: arr.reduce((s, p) => s + p.lon, 0) / arr.length };
        return { centroIda: centroide(idaPositions), centroVuelta: centroide(vueltaPositions), nameToSentido };
    }
    const destinoClusterCache = new Map();
    function distSq(a, b) {
        if (!a)
            return Infinity;
        const dLat = a.lat - b.lat;
        const dLon = a.lon - b.lon;
        return dLat * dLat + dLon * dLon;
    }
    const allStopsCache = new Map();
    function getAllStopsForLinea(linea) {
        const cached = allStopsCache.get(linea);
        if (cached)
            return cached;
        const route = agData.routes[linea];
        if (!route) {
            allStopsCache.set(linea, []);
            return [];
        }
        const seen = new Map();
        for (const day of [route.habiles, route.sabados, route.domingos]) {
            for (const t of day ?? []) {
                for (const cs of t.control_stops ?? []) {
                    if (cs.stop_id && typeof cs.lat === 'number' && typeof cs.lon === 'number') {
                        if (!seen.has(cs.stop_id))
                            seen.set(cs.stop_id, cs);
                    }
                }
            }
        }
        const arr = Array.from(seen.values());
        allStopsCache.set(linea, arr);
        return arr;
    }
    function nearestStopOfLinea(linea, lat, lon) {
        const stops = getAllStopsForLinea(linea);
        if (stops.length === 0)
            return null;
        let best = null;
        for (const s of stops) {
            const d = distKm(lat, lon, s.lat, s.lon);
            if (!best || d < best.distKm)
                best = { name: s.name, lat: s.lat, lon: s.lon, distKm: d };
        }
        return best;
    }
    function deriveSentido(linea, trip, destinoFeed, busLat, busLon) {
        let cluster = destinoClusterCache.get(linea);
        if (!cluster) {
            cluster = clusterDestinos(linea);
            destinoClusterCache.set(linea, cluster);
        }
        if (cluster.nameToSentido.size === 0)
            return null;
        // Señal 1: destino final del trip activo (lookup por nombre normalizado)
        const lastStop = trip?.control_stops?.[trip.control_stops.length - 1];
        if (lastStop?.name) {
            const found = cluster.nameToSentido.get(normName(lastStop.name));
            if (found)
                return found;
            // Si tenemos lat/lon del último stop, asignar por proximidad a centroides
            if (typeof lastStop.lat === 'number' && typeof lastStop.lon === 'number') {
                const dIda = distSq(cluster.centroIda, { lat: lastStop.lat, lon: lastStop.lon });
                const dVuelta = distSq(cluster.centroVuelta, { lat: lastStop.lat, lon: lastStop.lon });
                if (dIda < dVuelta)
                    return 'IDA';
                if (dVuelta < dIda)
                    return 'VUELTA';
            }
        }
        // Señal 2: destino del feed IMM (fuzzy)
        if (destinoFeed) {
            const target = normName(destinoFeed);
            const direct = cluster.nameToSentido.get(target);
            if (direct)
                return direct;
            // Substring bidireccional
            let bestSentido = null;
            let bestLen = 0;
            for (const [name, sent] of cluster.nameToSentido) {
                if (name.length < 4)
                    continue;
                const tokens = name.split(' ').filter((t) => t.length >= 4);
                for (const tok of tokens) {
                    if (target.includes(tok) && tok.length > bestLen) {
                        bestLen = tok.length;
                        bestSentido = sent;
                    }
                }
                const targetTokens = target.split(' ').filter((t) => t.length >= 4);
                for (const tok of targetTokens) {
                    if (name.includes(tok) && tok.length > bestLen) {
                        bestLen = tok.length;
                        bestSentido = sent;
                    }
                }
            }
            if (bestSentido)
                return bestSentido;
        }
        // Señal 3: fallback geométrico. Posición del bus vs centroides.
        // Si el bus está más cerca del centroide IDA, probablemente va hacia IDA.
        if (typeof busLat === 'number' && typeof busLon === 'number') {
            const dIda = distSq(cluster.centroIda, { lat: busLat, lon: busLon });
            const dVuelta = distSq(cluster.centroVuelta, { lat: busLat, lon: busLon });
            if (dIda < dVuelta)
                return 'IDA';
            if (dVuelta < dIda)
                return 'VUELTA';
        }
        return null;
    }
    for (const feat of features) {
        const p = feat.properties;
        const [lon, lat] = feat.geometry.coordinates;
        const routeShort = p.linea;
        const route = agData.routes[routeShort];
        const destinoFeed = p.destinoDesc ?? null;
        if (!route) {
            results.push({
                idBus: String(p.codigoBus),
                linea: routeShort,
                empresa: agData.agency_name,
                agencyId,
                lat,
                lon,
                velocidad: p.velocidad ?? 0,
                timestampGPS: now.toISOString(),
                tripActivo: null,
                proximaParadaControl: null,
                minutosParaProximaParada: null,
                desviacionMin: null,
                estadoCumplimiento: 'SIN_HORARIO',
                distanciaParadaKm: null,
                destino: destinoFeed,
                sentido: null,
            });
            continue;
        }
        // FASE 5.3 (2026-05-13): Algoritmo de matching por coherencia espacial.
        //
        // Antes: filter por +/- 5 min y tomar activeTrips[0] (arbitrario).
        // Problema: con 100-200 trips/día por línea, varios pueden estar activos en
        // un mismo instante (un bus saliendo, otro a mitad, otro llegando). Elegir
        // activeTrips[0] significaba asignar un bus a un trip aleatorio.
        //
        // Ahora: el trip activo es aquel cuyo control_stop más cercano está
        // realmente cerca del GPS del bus. Eso identifica qué viaje específico el
        // bus está haciendo, no solo "qué viaje está programado a esta hora".
        //
        // Ventana temporal ampliada a +/- 15 min para capturar servicios de baja
        // frecuencia (CE1, BT1, etc.) que pueden estar entre dos trips.
        const candidateTrips = route[dayType].filter(t => {
            if (!t.departure || !t.arrival)
                return false;
            const dep = toMin(t.departure);
            let arr = toMin(t.arrival);
            if (arr < dep) {
                arr += 1440;
            }
            return nowMin >= dep - 15 && nowMin <= arr + 15;
        });
        let tripActivo = null;
        let mejorDistanciaTrip = Infinity;
        for (const t of candidateTrips) {
            let minDistInTrip = Infinity;
            for (const stop of t.control_stops) {
                if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number')
                    continue;
                const d = distKm(lat, lon, stop.lat, stop.lon);
                if (d < minDistInTrip)
                    minDistInTrip = d;
            }
            // Solo considerar trips cuyo stop más cercano está a <3km del bus.
            // Si está más lejos, el bus probablemente no está haciendo ese trip.
            if (minDistInTrip < mejorDistanciaTrip && minDistInTrip < 3.0) {
                mejorDistanciaTrip = minDistInTrip;
                tripActivo = t;
            }
        }
        if (!tripActivo) {
            // FASE 5.14: incluso sin trip activo, asignar la parada más cercana de
            // la línea para que `proxima_parada` SIEMPRE tenga valor → la auditoria
            // y análisis por etapa pueden agregar por parada aún con buses sin
            // trip detectable (fuera de horario, refuerzo, etc.).
            const near = nearestStopOfLinea(routeShort, lat, lon);
            const proxParadaSinTrip = near
                ? { name: near.name, lat: near.lat, lon: near.lon, arrival: '', stop_id: near.name, seq: 0 }
                : null;
            results.push({
                idBus: String(p.codigoBus),
                linea: routeShort,
                empresa: agData.agency_name,
                agencyId,
                lat,
                lon,
                velocidad: p.velocidad ?? 0,
                timestampGPS: now.toISOString(),
                tripActivo: null,
                proximaParadaControl: proxParadaSinTrip,
                minutosParaProximaParada: null,
                desviacionMin: null,
                estadoCumplimiento: 'FUERA_DE_SERVICIO',
                distanciaParadaKm: near?.distKm ?? null,
                destino: destinoFeed,
                sentido: deriveSentido(routeShort, null, destinoFeed, lat, lon),
            });
            continue;
        }
        // Encontrar próxima parada de control
        let proximaParada = null;
        let minDistKm = Infinity;
        let desviacion = null;
        const depTime = toMin(tripActivo.departure || '00:00');
        const isMidnightTrip = (toMin(tripActivo.arrival || '00:00') < depTime);
        for (const stop of tripActivo.control_stops) {
            if (!stop.lat || !stop.lon)
                continue;
            let stopMin = toMin(stop.arrival);
            if (isMidnightTrip && stopMin < depTime) {
                stopMin += 1440;
            }
            if (stopMin < nowMin - 10)
                continue; // ya pasada hace más de 10 min
            const dist = distKm(lat, lon, stop.lat, stop.lon);
            if (dist < minDistKm) {
                minDistKm = dist;
                proximaParada = stop;
            }
        }
        let estadoCumplimiento = 'EN_TIEMPO';
        let minutosParaProxima = null;
        if (proximaParada) {
            let stopMin = toMin(proximaParada.arrival);
            if (isMidnightTrip && stopMin < depTime) {
                stopMin += 1440;
            }
            minutosParaProxima = stopMin - nowMin;
            // Velocidad actual en km/min
            const velKmMin = (p.velocidad ?? 20) / 60;
            // Tiempo estimado para llegar a la parada (si velocidad > 0)
            const tiempoEstimado = velKmMin > 0 ? minDistKm / velKmMin : null;
            if (tiempoEstimado !== null) {
                // FASE 5.17 (2026-05-16, auditoría comando unificado): POLÍTICA OTP
                // ÚNICA = ventana SIMÉTRICA ±4 min, que es la oficial IMM Montevideo.
                // Antes el motor usaba [-1,+5] (estándar US) mientras la comparación
                // de cartón, la vista SQL legacy y los dashboards usaban otras
                // ventanas → 3 OTP distintos para la misma flota. Unificado a ±4
                // para que cualquier pantalla sea defendible ante IMM.
                //   - desviacion POSITIVA = atrasado (late)
                //   - desviacion NEGATIVA = adelantado (early)
                const raw = tiempoEstimado - minutosParaProxima;
                desviacion = Math.round(raw);
                // CAP de calidad: |desviacion| > 20 min suele significar que el
                // matching trip<->bus es incorrecto (probablemente el bus va en
                // sentido contrario al que se le asigno, o el trip activo no
                // corresponde). En lugar de reportar "+1h 29min ATRASADO" mentiroso,
                // marcamos SIN_HORARIO para no contaminar el OTP de la linea.
                if (Math.abs(desviacion) > 20) {
                    estadoCumplimiento = 'SIN_HORARIO';
                    desviacion = null;
                }
                else if (desviacion > 4) {
                    estadoCumplimiento = 'ATRASADO';
                }
                else if (desviacion < -4) {
                    estadoCumplimiento = 'ADELANTADO';
                }
                else {
                    estadoCumplimiento = 'EN_TIEMPO';
                }
            }
        }
        // FASE 5.14: si por algún motivo no hubo "proximaParada" del trip
        // (todas las paradas con stopMin < nowMin-10), igual asignar la más
        // cercana del recorrido para que el evento sea visible en análisis.
        let proxParadaFinal = proximaParada;
        let distParadaFinal = minDistKm === Infinity ? null : Math.round(minDistKm * 100) / 100;
        if (!proxParadaFinal) {
            const near = nearestStopOfLinea(routeShort, lat, lon);
            if (near) {
                proxParadaFinal = { name: near.name, lat: near.lat, lon: near.lon, arrival: '', stop_id: near.name, seq: 0 };
                distParadaFinal = near.distKm;
            }
        }
        results.push({
            idBus: String(p.codigoBus),
            linea: routeShort,
            empresa: agData.agency_name,
            agencyId,
            lat,
            lon,
            velocidad: p.velocidad ?? 0,
            timestampGPS: now.toISOString(),
            tripActivo,
            proximaParadaControl: proxParadaFinal,
            minutosParaProximaParada: minutosParaProxima,
            desviacionMin: desviacion,
            estadoCumplimiento,
            distanciaParadaKm: distParadaFinal,
            destino: destinoFeed,
            sentido: deriveSentido(routeShort, tripActivo, destinoFeed, lat, lon),
        });
    }
    return results;
}
/** Resumen por línea: cantidad de buses activos, % cumplimiento, alertas */
function summarizeByRoute(results) {
    const byRoute = {};
    for (const r of results) {
        if (!byRoute[r.linea]) {
            byRoute[r.linea] = {
                linea: r.linea, busesActivos: 0,
                enTiempo: 0, atrasados: 0, adelantados: 0, sinHorario: 0, pctCumplimiento: 0,
            };
        }
        const s = byRoute[r.linea];
        s.busesActivos++;
        if (r.estadoCumplimiento === 'EN_TIEMPO')
            s.enTiempo++;
        else if (r.estadoCumplimiento === 'ATRASADO')
            s.atrasados++;
        else if (r.estadoCumplimiento === 'ADELANTADO')
            s.adelantados++;
        else
            s.sinHorario++;
    }
    Object.values(byRoute).forEach(s => {
        const withSchedule = s.enTiempo + s.atrasados + s.adelantados;
        s.pctCumplimiento = withSchedule > 0 ? Math.round((s.enTiempo / withSchedule) * 100) : 0;
    });
    return byRoute;
}
