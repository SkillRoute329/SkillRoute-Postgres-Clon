"use strict";
/**
 * Rutas de Analytics - Sprints 3-4
 * Análisis de tiempos de viaje (Run Times) y tiempos de parada (Stop Dwells)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const etapaStats_routes_1 = require("./etapaStats.routes");
const router = (0, express_1.Router)();
router.use(auth_1.verifyAuth);
router.get('/health', (req, res) => {
    res.json({ status: 'analytics service ok' });
});
/**
 * GET /api/analytics/run-times/:agencyId/:linea
 * Agrega y calcula tiempos de viaje en tiempo real entre etapas consecutivas
 */
router.get('/run-times/:agencyId/:linea', async (req, res) => {
    try {
        const { agencyId, linea } = req.params;
        const days = Math.min(30, Math.max(1, parseInt(req.query.days || '3', 10)));
        const sentidoRaw = String(req.query.sentido || '').toUpperCase();
        const sentido = sentidoRaw === 'IDA' ? 'IDA' : sentidoRaw === 'VUELTA' ? 'VUELTA' : 'IDA'; // default a IDA
        // 1. Obtener etapas principales de la línea
        const { etapas } = (0, etapaStats_routes_1.getEtapasPrincipales)(agencyId, linea, 0.3);
        if (etapas.size === 0) {
            res.json({ ok: true, segments: [], bottlenecks: [], mensaje: 'Sin schedule para esta línea' });
            return;
        }
        // Convertir a array ordenado cronológicamente
        const etapasOrdenadas = Array.from(etapas.values()).sort((a, b) => a.sortKey - b.sortKey);
        // 2. Obtener eventos con trip_id y proxima_parada asignados
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const rows = await (0, database_1.default)('vehicle_events')
            .where('agency_id', agencyId)
            .where('linea', linea)
            .where('created_at', '>=', since)
            .whereNotNull('trip_id')
            .whereNotNull('proxima_parada')
            .where('sentido', sentido)
            .select('trip_id', 'proxima_parada', 'timestamp_gps')
            .orderBy('trip_id')
            .orderBy('timestamp_gps', 'asc');
        // 3. Agrupar pings de GPS por trip_id
        const tripsEvents = {};
        for (const r of rows) {
            const tId = r.trip_id;
            const stopNameNorm = (0, etapaStats_routes_1.norm)(r.proxima_parada);
            const ts = new Date(r.timestamp_gps).getTime();
            // Match tolerante por tokens con etapas principales
            let matchedEtapaKey = null;
            if (etapas.has(stopNameNorm)) {
                matchedEtapaKey = stopNameNorm;
            }
            else {
                const tokens = stopNameNorm.split(' ').filter(t => t.length >= 4);
                for (const principalKey of etapas.keys()) {
                    const pTokens = principalKey.split(' ').filter(t => t.length >= 4);
                    let shared = 0;
                    for (const t of tokens)
                        if (pTokens.includes(t))
                            shared++;
                    if (shared >= 2) {
                        matchedEtapaKey = principalKey;
                        break;
                    }
                }
            }
            if (matchedEtapaKey) {
                if (!tripsEvents[tId])
                    tripsEvents[tId] = {};
                // Registrar primer pase (mínimo timestamp)
                if (tripsEvents[tId][matchedEtapaKey] === undefined) {
                    tripsEvents[tId][matchedEtapaKey] = ts;
                }
            }
        }
        // 4. Calcular duraciones por segmento
        const segmentsAccumulator = {};
        for (const tId of Object.keys(tripsEvents)) {
            const stopTimes = tripsEvents[tId];
            for (let i = 0; i < etapasOrdenadas.length - 1; i++) {
                const stopA = etapasOrdenadas[i];
                const stopB = etapasOrdenadas[i + 1];
                const keyA = (0, etapaStats_routes_1.norm)(stopA.nombre);
                const keyB = (0, etapaStats_routes_1.norm)(stopB.nombre);
                const timeA = stopTimes[keyA];
                const timeB = stopTimes[keyB];
                if (timeA !== undefined && timeB !== undefined && timeB > timeA) {
                    const durationMinutes = (timeB - timeA) / 1000 / 60;
                    // Filtrar outliers/ruido
                    if (durationMinutes > 0 && durationMinutes < 60) {
                        const segKey = `${stopA.nombre} ➔ ${stopB.nombre}`;
                        if (!segmentsAccumulator[segKey])
                            segmentsAccumulator[segKey] = [];
                        segmentsAccumulator[segKey].push(durationMinutes);
                    }
                }
            }
        }
        // 5. Comparación y Detección de Cuellos de Botella (Bottlenecks)
        const segments = [];
        for (let i = 0; i < etapasOrdenadas.length - 1; i++) {
            const stopA = etapasOrdenadas[i];
            const stopB = etapasOrdenadas[i + 1];
            const segKey = `${stopA.nombre} ➔ ${stopB.nombre}`;
            // Duración teórica (schedule)
            const parseArrivalMins = (arrStr) => {
                const [h, m] = arrStr.split(':').map(Number);
                return h * 60 + (m || 0);
            };
            const minsA = parseArrivalMins(stopA.arrival);
            const minsB = parseArrivalMins(stopB.arrival);
            let scheduledMins = minsB - minsA;
            if (scheduledMins < 0)
                scheduledMins += 1440; // Cruce medianoche
            const actualDurations = segmentsAccumulator[segKey] || [];
            const sampleCount = actualDurations.length;
            const avgRealMinutes = sampleCount
                ? actualDurations.reduce((sum, val) => sum + val, 0) / sampleCount
                : scheduledMins;
            const avgDelayMinutes = Math.max(-30, Math.min(30, avgRealMinutes - scheduledMins));
            const isBottleneck = avgRealMinutes > 1.25 * scheduledMins && avgDelayMinutes > 1.5;
            segments.push({
                fromStop: stopA.nombre,
                toStop: stopB.nombre,
                avgScheduledMinutes: Number(scheduledMins.toFixed(1)),
                avgRealMinutes: Number(avgRealMinutes.toFixed(1)),
                avgDelayMinutes: Number(avgDelayMinutes.toFixed(1)),
                isBottleneck,
                sampleCount
            });
        }
        const bottlenecks = segments
            .filter(s => s.isBottleneck)
            .sort((a, b) => b.avgDelayMinutes - a.avgDelayMinutes);
        res.json({
            ok: true,
            agencyId,
            linea,
            sentido,
            days,
            segments,
            bottlenecks,
        });
    }
    catch (err) {
        logger_1.default.error('[analytics/run-times]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error calculando run-times' });
    }
});
/**
 * GET /api/analytics/stop-dwell/:agencyId/:linea
 * Agrega y estima los tiempos de detención (dwell times) en paradas
 */
router.get('/stop-dwell/:agencyId/:linea', async (req, res) => {
    try {
        const { agencyId, linea } = req.params;
        const days = Math.min(7, Math.max(1, parseInt(req.query.days || '3', 10)));
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        // Filtrar por velocidad <= 1 km/h (bus detenido)
        const rows = await (0, database_1.default)('vehicle_events')
            .where('agency_id', agencyId)
            .where('linea', linea)
            .where('created_at', '>=', since)
            .where('velocidad', '<=', 1)
            .whereNotNull('proxima_parada')
            .select('id_bus', 'proxima_parada', 'timestamp_gps')
            .orderBy('id_bus')
            .orderBy('proxima_parada')
            .orderBy('timestamp_gps', 'asc');
        const dwellMap = {};
        let currentKey = '';
        let currentSequence = [];
        const flushSequence = (key, seq) => {
            if (seq.length > 0) {
                const start = seq[0];
                const end = seq[seq.length - 1];
                let durationSec = (end - start) / 1000;
                // Si solo hay un ping a velocidad 0, asumimos una base de 15 segundos
                if (durationSec === 0)
                    durationSec = 15;
                // Descartar terminales o fin de línea (ej. > 15 minutos detenidos)
                if (durationSec > 0 && durationSec < 900) {
                    if (!dwellMap[key])
                        dwellMap[key] = [];
                    dwellMap[key].push(durationSec);
                }
            }
        };
        for (const r of rows) {
            const key = r.proxima_parada;
            const ts = new Date(r.timestamp_gps).getTime();
            const busKey = `${r.id_bus}|${key}`;
            if (busKey !== currentKey) {
                if (currentKey) {
                    const stopName = currentKey.split('|')[1];
                    flushSequence(stopName, currentSequence);
                }
                currentKey = busKey;
                currentSequence = [ts];
            }
            else {
                const lastTs = currentSequence[currentSequence.length - 1];
                if (ts - lastTs < 120 * 1000) {
                    currentSequence.push(ts);
                }
                else {
                    const stopName = currentKey.split('|')[1];
                    flushSequence(stopName, currentSequence);
                    currentSequence = [ts];
                }
            }
        }
        if (currentKey && currentSequence.length > 0) {
            const stopName = currentKey.split('|')[1];
            flushSequence(stopName, currentSequence);
        }
        const dwellTimes = Object.entries(dwellMap).map(([stopName, durations]) => {
            const count = durations.length;
            const avgDwellSeconds = count ? durations.reduce((sum, val) => sum + val, 0) / count : 0;
            const maxDwellSeconds = count ? Math.max(...durations) : 0;
            let congestionLevel = 'BAJO';
            if (avgDwellSeconds > 90)
                congestionLevel = 'ALTO';
            else if (avgDwellSeconds > 35)
                congestionLevel = 'MEDIO';
            return {
                stopName,
                avgDwellSeconds: Math.round(avgDwellSeconds),
                maxDwellSeconds: Math.round(maxDwellSeconds),
                sampleCount: count,
                congestionLevel
            };
        }).sort((a, b) => b.avgDwellSeconds - a.avgDwellSeconds);
        res.json({
            ok: true,
            agencyId,
            linea,
            days,
            dwellTimes
        });
    }
    catch (err) {
        logger_1.default.error('[analytics/stop-dwell]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error calculando dwell-times' });
    }
});
exports.default = router;
