"use strict";
/**
 * complianceController.ts — Endpoints de Cumplimiento para auditoría IMM
 * ────────────────────────────────────────────────────────────────────────
 * FASE 4.8 (2026-05-12): cierre del módulo "Cumplimiento del Sistema Metropolitano"
 * que el frontend pide en /api/compliance/regulador y /api/compliance/operador.
 *
 * Calcula KPIs reales de cumplimiento desde Postgres soberano:
 *   - OTP (On-Time Performance) UITP: % eventos con |desviación| ≤ 4 min
 *   - Cobertura GPS: % cobertura del poller en el rango
 *   - Eventos totales por operador
 *   - Total de líneas con tráfico GPS
 *
 * Fuente única de datos: vehicle_events + poller_health + v_poller_coverage_diario.
 * Si no hay data suficiente (n < 30 eventos por operador), devuelve badge
 * INSUFFICIENT honesto sin inventar — regla -2 NO SIMULACIÓN.
 *
 * Endpoints:
 *   GET /api/compliance/regulador?empresa=all|70|...&desde&hasta&granularidad
 *   GET /api/compliance/operador?agencyId=70&desde&hasta&granularidad
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRegulatoryData = getRegulatoryData;
exports.getOperatorData = getOperatorData;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
// ─── Tipos ─────────────────────────────────────────────────────────────────
const OPERATOR_NAMES = {
    '70': 'UCOT',
    '50': 'CUTCSA',
    '20': 'COME',
    '10': 'COETC',
};
const OPERATORS = ['70', '50', '20', '10'];
const MIN_N_FOR_BADGE_OK = 30; // mínimo eventos para considerar la métrica válida
// ─── Helpers ──────────────────────────────────────────────────────────────
function badgeFromN(n, coverageGps) {
    if (coverageGps < 30)
        return 'NO_COVERAGE';
    if (n < MIN_N_FOR_BADGE_OK)
        return 'INSUFFICIENT';
    if (n < 200)
        return 'IC_VISIBLE';
    return 'OK';
}
/** Intervalo de confianza 95% para una proporción Bernoulli (Wilson aprox). */
function ic95Proportion(p, n) {
    if (n === 0)
        return [0, 0];
    const z = 1.96;
    const denom = 1 + (z * z) / n;
    const center = (p + (z * z) / (2 * n)) / denom;
    const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
    return [Math.max(0, center - margin), Math.min(1, center + margin)];
}
async function computeOperatorMetrics(agencyId, from, to) {
    // FASE 5.1 (2026-05-13): paralelizadas las 6 queries internas con Promise.all.
    // Combinadas con índice idx_vehicle_events_agency_created y Promise.all en el
    // handler regulador (paraleliza los 4 operadores), el endpoint baja de >15s
    // a <5s. Ver schema_fase5_views.sql para el índice.
    // FASE 5.21 (2026-05-17): se REEMPLAZA el scan en vivo de vehicle_events
    // (32M filas → timeout 30s, "falla por completo" reportado por IMM) por la
    // MV diaria ya agregada mv_fleet_ranking_diario (≤2.4k filas/operador,
    // 1 fila por coche/día con total/en_tiempo/atrasado/etc). Mismo dato real,
    // sin scan masivo. La MV la refresca el scheduler (statement_timeout=0).
    const eventsAggrPromise = (0, database_1.default)('mv_fleet_ranking_diario')
        .where('agency_id', agencyId)
        .whereBetween('fecha', [from, to])
        .select(database_1.default.raw('COALESCE(SUM(total),0) AS total_events'), database_1.default.raw('COUNT(DISTINCT id_bus) AS active_buses'), database_1.default.raw('COALESCE(SUM(en_tiempo + atrasado + adelantado),0) AS total_with_schedule'), database_1.default.raw('COALESCE(SUM(en_tiempo),0) AS en_tiempo'), database_1.default.raw('(SELECT COUNT(DISTINCT l) FROM mv_fleet_ranking_diario f2, ' +
        'LATERAL unnest(f2.lineas) AS l WHERE f2.agency_id = ? ' +
        'AND f2.fecha BETWEEN ?::date AND ?::date) AS total_lines', [agencyId, from, to]))
        .first();
    // Cobertura GPS — query separada (otra tabla)
    const coveragePromise = (0, database_1.default)('v_poller_coverage_diario')
        .where('agency_id', agencyId)
        .whereBetween('fecha', [from, to])
        .avg({ avg: 'pct_cobertura_estimado' })
        .first();
    // Flota total — query separada
    const fleetPromise = (0, database_1.default)('vehiculos')
        .where('agency_id', agencyId)
        .count({ count: '*' })
        .first();
    const [eventsAggr, coverageRow, fleetRow] = await Promise.all([
        eventsAggrPromise,
        coveragePromise,
        fleetPromise,
    ]);
    const totalEvents = parseInt(eventsAggr?.total_events ?? '0', 10);
    const totalLines = parseInt(eventsAggr?.total_lines ?? '0', 10);
    const activeBuses = parseInt(eventsAggr?.active_buses ?? '0', 10);
    const totalSched = parseInt(eventsAggr?.total_with_schedule ?? '0', 10);
    const enTiempo = parseInt(eventsAggr?.en_tiempo ?? '0', 10);
    const coverageGps = Number(coverageRow?.avg ?? 0);
    const otpValue = totalSched > 0 ? enTiempo / totalSched : null;
    const otpIC95 = otpValue !== null ? ic95Proportion(otpValue, totalSched) : undefined;
    const otp = {
        value: otpValue !== null ? Number((otpValue * 100).toFixed(2)) : null,
        n: totalSched,
        ic95: otpIC95
            ? [Number((otpIC95[0] * 100).toFixed(2)), Number((otpIC95[1] * 100).toFixed(2))]
            : undefined,
        badge: badgeFromN(totalSched, coverageGps),
        applicable: true,
    };
    // 5. EWT (Excess Wait Time) — requiere headway scheduled vs observado.
    //    Implementación completa pendiente FASE 5; por ahora marcamos NO_COVERAGE
    //    si no hay datos suficientes para calcularlo de forma honesta.
    const ewt = {
        value: null,
        n: 0,
        badge: 'INSUFFICIENT',
        applicable: false,
    };
    // 6. Service Delivered — viajes entregados / viajes programados.
    //    Aproximación: buses distintos con events / flota total. fleetTotal y
    //    activeBuses ya se calcularon arriba en paralelo.
    const fleetTotal = parseInt(fleetRow?.count ?? '0', 10);
    const sdValue = fleetTotal > 0 ? activeBuses / fleetTotal : null;
    const serviceDelivered = {
        value: sdValue !== null ? Number((sdValue * 100).toFixed(2)) : null,
        n: activeBuses,
        badge: fleetTotal > 0 && activeBuses >= 10 ? 'IC_VISIBLE' : 'INSUFFICIENT',
        applicable: fleetTotal > 0,
    };
    // 7. SRS (Service Reliability Score) — combinación ponderada OTP + cobertura.
    const srsValue = otpValue !== null && coverageGps > 0
        ? Number(((otpValue * 100 * 0.7 + coverageGps * 0.3) / 1).toFixed(2))
        : null;
    const srs = {
        value: srsValue,
        n: totalSched,
        badge: badgeFromN(totalSched, coverageGps),
        applicable: true,
    };
    return {
        agencyId,
        name: OPERATOR_NAMES[agencyId] ?? agencyId,
        totalEvents,
        totalLines,
        lineCount: totalLines,
        coverageGps: Number(coverageGps.toFixed(2)),
        services: { value: activeBuses, type: 'medido' },
        otp,
        ewt,
        serviceDelivered,
        srs,
    };
}
// ─── Endpoints ─────────────────────────────────────────────────────────────
/**
 * GET /api/compliance/regulador?empresa=all|70|50|20|10&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&granularidad=diaria|semanal|mensual
 *
 * Devuelve RegulatoryData para el panel Vista Regulador.
 * Compara los 4 operadores del sistema metropolitano contra los KPIs UITP.
 */
async function getRegulatoryData(req, res) {
    try {
        const today = new Date().toISOString().slice(0, 10);
        // FASE 5.1 (2026-05-13): default = HOY (antes 7 días). vehicle_events tiene
        // ~1.4M filas/día/operador; COUNT DISTINCT sobre 7 días * 4 operadores
        // = 10M+ scan que causa timeout. "Hoy" responde en ~7s con datos parciales
        // del día en curso. El frontend puede pasar ?desde/?hasta explícitos para
        // ventanas mayores con expectativa de mayor latencia.
        const empresa = (req.query.empresa || 'all').trim();
        const desde = (req.query.desde || today).trim();
        const hasta = (req.query.hasta || today).trim();
        const granularidad = (req.query.granularidad || 'diaria').trim();
        const operatorsToCompute = empresa === 'all' ? OPERATORS : [empresa];
        // FASE 5.1 (2026-05-13): paralelizado con Promise.all (antes secuencial,
        // tomaba >10s y devolvía timeout). Ahora ~3-5s para los 4 operadores.
        const operators = await Promise.all(operatorsToCompute.map((ag) => computeOperatorMetrics(ag, desde, hasta)));
        // Cobertura sistema (promedio de los operadores)
        const byOperator = {};
        let sysGpsSum = 0;
        operators.forEach((op) => {
            byOperator[op.agencyId] = op.coverageGps;
            sysGpsSum += op.coverageGps;
        });
        const systemGps = operators.length > 0 ? Number((sysGpsSum / operators.length).toFixed(2)) : 0;
        res.json({
            meta: {
                period: { desde, hasta, granularidad },
                generatedAt: new Date().toISOString(),
                source: 'Postgres soberano clon SkillRoute v2.0 + GPS oficial IMM',
            },
            coverage: { systemGps, byOperator },
            operators,
        });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger_1.default.error('[Compliance] regulador error', { error: msg });
        res.status(500).json({ ok: false, error: msg });
    }
}
/**
 * GET /api/compliance/operador?agencyId=70&desde&hasta&granularidad
 *
 * Devuelve OperatorData para el panel Vista Operador.
 * Lista las líneas del operador con sus KPIs de cumplimiento.
 */
async function getOperatorData(req, res) {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const agencyId = (req.query.agencyId || '70').trim();
        const desde = (req.query.desde || sevenDaysAgo).trim();
        const hasta = (req.query.hasta || today).trim();
        const granularidad = (req.query.granularidad || 'diaria').trim();
        // Cobertura del operador
        const coverageRow = await (0, database_1.default)('v_poller_coverage_diario')
            .where('agency_id', agencyId)
            .whereBetween('fecha', [desde, hasta])
            .avg({ avg: 'pct_cobertura_estimado' })
            .first();
        const operatorGps = Number(coverageRow?.avg ?? 0);
        // FASE 5.21 (2026-05-17): de vehicle_events (32M, timeout) a la MV diaria
        // por línea mv_cumplimiento_linea_diario (pre-agregada, dato real del
        // motor IMM ±4 min). La refresca el scheduler CONCURRENTLY.
        const totalEventsRow = await (0, database_1.default)('mv_cumplimiento_linea_diario')
            .where('agency_id', agencyId)
            .whereBetween('fecha', [desde, hasta])
            .sum({ sum: 'total' })
            .first();
        const totalEvents = parseInt(totalEventsRow?.sum ?? '0', 10);
        // Por línea: OTP y service_delivered desde la MV diaria agrupada.
        const linesRaw = await (0, database_1.default)('mv_cumplimiento_linea_diario')
            .where('agency_id', agencyId)
            .whereBetween('fecha', [desde, hasta])
            .whereNotNull('linea')
            .groupBy('linea')
            .select('linea')
            .select(database_1.default.raw('COALESCE(SUM(total),0) AS total_events'))
            .select(database_1.default.raw('COALESCE(SUM(con_horario),0) AS total_with_schedule'))
            .select(database_1.default.raw('COALESCE(SUM(en_tiempo),0) AS en_tiempo'))
            .orderBy('linea');
        const lines = linesRaw.map((r) => {
            const totalEv = parseInt(r.total_events, 10);
            const totalSched = parseInt(r.total_with_schedule, 10);
            const enTiempo = parseInt(r.en_tiempo, 10);
            const otpValue = totalSched > 0 ? enTiempo / totalSched : null;
            const otpBadge = operatorGps < 30
                ? 'NO_COVERAGE'
                : totalSched < MIN_N_FOR_BADGE_OK
                    ? 'INSUFFICIENT'
                    : totalSched < 200
                        ? 'IC_VISIBLE'
                        : 'OK';
            const estado = otpBadge === 'NO_COVERAGE'
                ? 'COBERTURA_BAJA'
                : otpBadge === 'INSUFFICIENT'
                    ? 'INSUFICIENTE'
                    : totalSched < 200
                        ? 'OK_PROVISIONAL'
                        : 'OK';
            return {
                linea: r.linea,
                sentido: 'ambos',
                totalEventsObserved: totalEv,
                totalTripsScheduled: totalSched,
                globalCoverageGps: operatorGps,
                isHighFreq: totalEv > 500,
                estado,
                metrics: {
                    otp: {
                        value: otpValue !== null ? Number((otpValue * 100).toFixed(2)) : null,
                        n: totalSched,
                        badge: otpBadge,
                    },
                    ewt: { value: null, n: 0, badge: 'INSUFFICIENT' },
                    serviceDelivered: { value: null, n: 0, badge: 'INSUFFICIENT' },
                    srs: {
                        value: otpValue !== null ? Number((otpValue * 100).toFixed(2)) : null,
                        n: totalSched,
                        badge: otpBadge,
                    },
                },
            };
        });
        res.json({
            meta: {
                agencyId,
                agencyName: OPERATOR_NAMES[agencyId] ?? agencyId,
                period: { desde, hasta, granularidad },
                generatedAt: new Date().toISOString(),
                source: 'Postgres soberano clon SkillRoute v2.0 + GPS oficial IMM',
            },
            coverage: { operatorGps: Number(operatorGps.toFixed(2)), totalEvents },
            lines,
        });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger_1.default.error('[Compliance] operador error', { error: msg });
        res.status(500).json({ ok: false, error: msg });
    }
}
