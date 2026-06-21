"use strict";
/**
 * cascadeFeedController — Historial del bus de propagación (FASE 5.31, 2026-05-21)
 *
 * GET /api/cascade/feed?since=<ISO>&limit=50
 *
 * Devuelve los últimos eventos del motor de consecuencias persistidos en
 * `logs_auditoria` (accion='consequencePreview'). Permite que el widget
 * `PropagacionLiveWidget` arranque con el feed reciente al recargar la
 * pantalla, en lugar de empezar vacío hasta que entre el próximo evento
 * por socket.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCascadeFeed = getCascadeFeed;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
async function getCascadeFeed(req, res) {
    try {
        const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit ?? '30', 10)));
        const since = req.query.since;
        const until = req.query.until;
        const agencyId = req.query.agency_id;
        const tipo = req.query.tipo;
        // FASE 5.39 (2026-05-22): excluir eventos que fueron marcados como
        // atendidos automáticamente por timeout. El reporte IMM lo activa por
        // default — sólo cuentan los eventos con atención real o aún abiertos.
        const excludeCaducadas = req.query.excludeCaducadas === '1' || req.query.excludeCaducadas === 'true';
        let q = (0, database_1.default)('logs_auditoria')
            .select('id', 'recurso', 'detalles_jsonb', 'timestamp')
            .where('accion', 'consequencePreview')
            .orderBy('timestamp', 'desc')
            .limit(limit);
        if (since) {
            const sinceDate = new Date(since);
            if (!isNaN(sinceDate.getTime())) {
                q = q.andWhere('timestamp', '>=', sinceDate);
            }
        }
        if (until) {
            const untilDate = new Date(until);
            if (!isNaN(untilDate.getTime())) {
                q = q.andWhere('timestamp', '<=', untilDate);
            }
        }
        if (tipo) {
            q = q.andWhere('recurso', tipo);
        }
        // FASE 5.34 (2026-05-22): filtro por agencia/operador.
        // El agencyId del operador puede venir en evento.empresaId (numérico, 70/50/20/10)
        // o evento.agencyId. Filtramos con JSONB exists.
        if (agencyId) {
            const aid = String(agencyId);
            q = q.andWhere((b) => {
                b.whereRaw("detalles_jsonb #>> '{evento,empresaId}' = ?", [aid])
                    .orWhereRaw("detalles_jsonb #>> '{evento,agencyId}' = ?", [aid])
                    .orWhereRaw("detalles_jsonb #>> '{evento,agency_id}' = ?", [aid]);
            });
        }
        // FASE 5.39: excluir caducados automáticos. Las atenciones reales tienen
        // `atencion.atendidoPor` = un user real (no 'auto:caducada' como accion).
        if (excludeCaducadas) {
            q = q.andWhere((b) => {
                b.whereRaw("(detalles_jsonb #>> '{atencion,atendido}') IS NULL")
                    .orWhereRaw("(detalles_jsonb #>> '{atencion,atendidoPor}') NOT LIKE 'auto:%'");
            });
        }
        const rows = await q;
        const includeEfectos = req.query.efectos === '1' || req.query.detail === '1';
        const events = rows.map((r) => {
            const j = r.detalles_jsonb ?? {};
            const evento = j.evento ?? {};
            const resumen = j.resumen ?? {};
            const out = {
                id: r.id,
                ts: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
                tipo: r.recurso,
                evento,
                totalEfectos: j.totalEfectos ?? 0,
                resumen,
                titulo: `Cascada: ${(r.recurso ?? '?').replace(/_/g, ' ').toLowerCase()}`,
                severidad: resumen.severidadGlobal ?? 'info',
            };
            // FASE 5.33 (2026-05-22): incluir efectos completos solo si se pide
            // (?efectos=1 o ?detail=1) — el feed normal mantiene payload chico.
            if (includeEfectos) {
                out.efectos = j.efectos ?? [];
            }
            return out;
        });
        // Doble envolvado para compat con apiClient (que espera {ok,data:...} para
        // poder acceder via res.data) Y con consumidores que ya lo leen plano.
        res.json({
            ok: true,
            total: events.length,
            events,
            data: { events, total: events.length },
            timestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        logger_1.default.error('[cascade/feed]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error leyendo feed', events: [] });
    }
}
