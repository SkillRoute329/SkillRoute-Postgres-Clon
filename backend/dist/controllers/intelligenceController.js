"use strict";
/**
 * intelligenceController — endpoints de inteligencia operativa (FASE 5.28, 2026-05-19)
 *
 * Antes 404. Agrupa los endpoints de inteligencia que no caen en un módulo
 * propio: rotación del día y briefing de inteligencia por línea.
 *
 *   GET /api/rotacion/:fecha       → coches del día (DistribucionDiaria)
 *   GET /api/inteligencia/:linea   → briefing por línea (DigitalAgentsModule)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRotacionDiaria = getRotacionDiaria;
exports.getInteligenciaPorLinea = getInteligenciaPorLinea;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
// ─── /api/rotacion/:fecha ─────────────────────────────────────────────────
//
// Lee `cartones_historial` (lo que capturó el watcher diario UCOT). Devuelve
// shape esperado por DistribucionDiaria.tsx:
//   { ok, fecha, meta: { totalCoches, archivo }, coches: [{coche, servicio, horaSalida, linea}] }
async function getRotacionDiaria(req, res) {
    try {
        const fecha = String(req.params.fecha ?? '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            res.status(400).json({ ok: false, error: 'Formato esperado: YYYY-MM-DD' });
            return;
        }
        const rows = await (0, database_1.default)('cartones_historial')
            .select('vehiculo_id', 'service_number', 'line', 'service_manana')
            .where('fecha', fecha)
            .orderBy(['line', 'vehiculo_id']);
        const coches = rows.map((r) => ({
            coche: r.vehiculo_id,
            servicio: r.service_number ?? '',
            servicioManana: r.service_manana ?? undefined,
            horaSalida: '', // cartones_historial no guarda horario; se obtiene del cartón oficial vía /api/cartones/oficiales/:id
            linea: r.line ?? '',
        }));
        res.json({
            ok: true,
            fecha,
            meta: {
                totalCoches: coches.length,
                archivo: 'cartones_historial (watcher UCOT diario)',
            },
            coches,
        });
    }
    catch (err) {
        logger_1.default.error('[rotacion/diaria]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error leyendo rotación', coches: [] });
    }
}
// ─── /api/inteligencia/:linea ─────────────────────────────────────────────
//
// Briefing por línea: cuántos buses propios circulan ahora, cuántos
// competidores hay en la misma línea/corredor, qué servicios oficiales
// existen, y métricas básicas. DigitalAgentsModule consume esto.
async function getInteligenciaPorLinea(req, res) {
    try {
        const linea = String(req.params.linea ?? '').trim();
        if (!linea) {
            res.status(400).json({ ok: false, error: 'Falta línea' });
            return;
        }
        const buses = await (0, database_1.default)('bus_last_pos')
            .select('id_bus', 'agency_id', 'lat', 'lon', 'timestamp_gps', 'velocidad', 'estado_cumplimiento')
            .where('linea', linea)
            .andWhere('timestamp_gps', '>=', database_1.default.raw("NOW() - INTERVAL '60 minutes'"));
        const porOperador = {};
        let propios = 0;
        let competidores = 0;
        for (const b of buses) {
            const op = b.agency_id ?? 'NA';
            porOperador[op] = (porOperador[op] ?? 0) + 1;
            // Convención UCOT (70). El resto = competidores en el corredor.
            if (op === '70')
                propios++;
            else
                competidores++;
        }
        // Buses con estado_cumplimiento problemático en la última hora
        const enRiesgo = buses.filter((b) => ['ATRASADO', 'ADELANTADO', 'BUNCHING'].includes(String(b.estado_cumplimiento ?? '').toUpperCase())).length;
        // Promedio de velocidad observada (km/h)
        const velocidades = buses.map((b) => Number(b.velocidad ?? 0)).filter((v) => Number.isFinite(v));
        const velocidadMedia = velocidades.length ? velocidades.reduce((s, v) => s + v, 0) / velocidades.length : null;
        res.json({
            ok: true,
            linea,
            ventana: 'últimos 60 min (bus_last_pos)',
            buses: {
                total: buses.length,
                propios,
                competidores,
                porOperador,
            },
            desempeno: {
                velocidadMedia,
                enRiesgo, // buses con estado ATRASADO/ADELANTADO/BUNCHING
                porcentajeEnRiesgo: buses.length ? (enRiesgo / buses.length) * 100 : 0,
            },
            timestamp: new Date().toISOString(),
            fuente: 'bus_last_pos (poller IMM en vivo)',
        });
    }
    catch (err) {
        logger_1.default.error('[inteligencia/linea]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error armando briefing' });
    }
}
