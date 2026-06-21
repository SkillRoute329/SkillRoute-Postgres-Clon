"use strict";
/**
 * operadoresKpiController — KPIs comparativos por operador (FASE 5.36, 2026-05-22).
 *
 *   GET /api/operadores/kpis?since=&until=
 *
 * Cruza los 4 operadores con métricas extraídas de:
 *   - logs_auditoria (motor de consecuencias): eventos, severidad, impacto
 *   - bus_last_pos (GPS): buses en vivo, % en riesgo
 *   - lineas (catálogo): total líneas del operador
 *
 * Devuelve un objeto por operador listo para tabla comparativa.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOperadoresKpis = getOperadoresKpis;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const AGENCIAS = [
    { id: '70', nombre: 'UCOT' },
    { id: '50', nombre: 'CUTCSA' },
    { id: '20', nombre: 'COME' },
    { id: '10', nombre: 'COETC' },
];
async function getOperadoresKpis(req, res) {
    try {
        const since = req.query.since;
        const until = req.query.until;
        const sinceDate = since && !isNaN(Date.parse(since)) ? new Date(since) : new Date(Date.now() - 24 * 3600 * 1000);
        const untilDate = until && !isNaN(Date.parse(until)) ? new Date(until) : new Date();
        const result = [];
        for (const ag of AGENCIAS) {
            // Buses en vivo y desempeño
            const busesRow = await (0, database_1.default)('bus_last_pos')
                .where('agency_id', ag.id)
                .andWhere('timestamp_gps', '>=', database_1.default.raw("NOW() - INTERVAL '15 minutes'"))
                .select(database_1.default.raw('COUNT(*)::int AS total'), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'EN_TIEMPO')::int AS en_tiempo"), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ATRASADO')::int AS atrasado"), database_1.default.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'FUERA_DE_SERVICIO')::int AS fds"))
                .first();
            // Eventos del motor en el rango filtrado por agencia (vía JSONB)
            const eventosRows = (await database_1.default.raw(`SELECT recurso,
                (detalles_jsonb #>> '{resumen,severidadGlobal}') AS severidad,
                COALESCE((detalles_jsonb #>> '{resumen,impactoNomina}')::numeric, 0) AS impacto_nomina,
                COALESCE((detalles_jsonb #>> '{resumen,impactoSubsidio}')::numeric, 0) AS impacto_subsidio,
                COALESCE(detalles_jsonb #>> '{evento,lineaId}', detalles_jsonb #>> '{evento,linea}', '—') AS linea
           FROM logs_auditoria
          WHERE accion = 'consequencePreview'
            AND timestamp >= ?
            AND timestamp <= ?
            AND (
              detalles_jsonb #>> '{evento,empresaId}' = ?
              OR detalles_jsonb #>> '{evento,agencyId}' = ?
              OR detalles_jsonb #>> '{evento,agency_id}' = ?
            )`, [sinceDate, untilDate, ag.id, ag.id, ag.id])).rows;
            const porTipo = {};
            let criticos = 0;
            let impactoNomina = 0;
            let impactoSubsidio = 0;
            const lineaCount = new Map();
            for (const r of eventosRows) {
                porTipo[r.recurso] = (porTipo[r.recurso] ?? 0) + 1;
                if (r.severidad === 'critico')
                    criticos++;
                impactoNomina += Number(r.impacto_nomina) || 0;
                impactoSubsidio += Number(r.impacto_subsidio) || 0;
                const l = String(r.linea ?? '?');
                const e = lineaCount.get(l) ?? { eventos: 0, criticos: 0 };
                e.eventos += 1;
                if (r.severidad === 'critico')
                    e.criticos += 1;
                lineaCount.set(l, e);
            }
            const topLineas = Array.from(lineaCount.entries())
                .map(([linea, v]) => ({ linea, ...v }))
                .sort((a, b) => b.eventos - a.eventos)
                .slice(0, 5);
            // Catálogo: líneas distintas operadas por el operador (desde bus_last_pos
            // recientes — refleja la operación real, no el catálogo nominal).
            const lineasCountRow = await (0, database_1.default)('bus_last_pos')
                .where('agency_id', ag.id)
                .andWhere('timestamp_gps', '>=', database_1.default.raw("NOW() - INTERVAL '24 hours'"))
                .countDistinct({ count: 'linea' })
                .first();
            result.push({
                agencyId: ag.id,
                nombre: ag.nombre,
                buses: {
                    total: Number(busesRow?.total ?? 0),
                    enTiempo: Number(busesRow?.en_tiempo ?? 0),
                    atrasado: Number(busesRow?.atrasado ?? 0),
                    fds: Number(busesRow?.fds ?? 0),
                },
                motor: {
                    eventos: eventosRows.length,
                    criticos,
                    porTipo,
                    impactoNomina,
                    impactoSubsidio,
                },
                catalogo: {
                    lineas: Number(lineasCountRow?.count ?? 0),
                },
                topLineas,
            });
        }
        res.json({
            ok: true,
            data: { operadores: result, since: sinceDate.toISOString(), until: untilDate.toISOString() },
            operadores: result,
            since: sinceDate.toISOString(),
            until: untilDate.toISOString(),
        });
    }
    catch (err) {
        logger_1.default.error('[operadores/kpis]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error consultando KPIs por operador', operadores: [] });
    }
}
