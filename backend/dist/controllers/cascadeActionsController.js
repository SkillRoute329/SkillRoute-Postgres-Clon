"use strict";
/**
 * cascadeActionsController — Acciones sobre eventos y cooldowns del motor
 * (FASE 5.35, 2026-05-22).
 *
 *   POST /api/cascade/events/:id/atender    → marca el evento como atendido
 *                                              (data_jsonb.atendido + por + ts)
 *                                              y opcionalmente limpia el cooldown
 *                                              relacionado para re-disparo inmediato.
 *
 *   POST /api/cascade/cooldown/clear        → limpia uno o varios cooldowns por
 *                                              { entity_type, entity_id, evento_tipo }.
 *                                              Body acepta array.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.atenderEvento = atenderEvento;
exports.clearCooldown = clearCooldown;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const socketBus_1 = require("../services/socketBus");
async function atenderEvento(req, res) {
    try {
        const id = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
            res.status(400).json({ ok: false, error: 'Id inválido' });
            return;
        }
        const body = (req.body ?? {});
        const user = req.user;
        const row = await (0, database_1.default)('logs_auditoria').where('id', id).andWhere('accion', 'consequencePreview').first();
        if (!row) {
            res.status(404).json({ ok: false, error: 'Evento no encontrado' });
            return;
        }
        const existing = (row.detalles_jsonb ?? {});
        const atencion = {
            atendido: true,
            atendidoPor: user?.fullName ?? user?.id ?? 'desconocido',
            atendidoEn: new Date().toISOString(),
            comentario: body.comentario ?? null,
        };
        const merged = { ...existing, atencion };
        await (0, database_1.default)('logs_auditoria').where('id', id).update({ detalles_jsonb: merged });
        // Opcional: liberar el cooldown asociado para que pueda re-disparar.
        let cooldownsLiberados = 0;
        if (body.liberarCooldown) {
            const ev = existing.evento ?? {};
            const linea = String(ev.lineaId ?? ev.linea ?? '');
            const agency = String(ev.agencyId ?? ev.empresaId ?? '');
            const coche = String(ev.cocheId ?? '');
            if (linea) {
                const key = `${agency || 'NA'}:${linea}`;
                cooldownsLiberados += await (0, database_1.default)('cascade_cooldowns')
                    .where('entity_id', key)
                    .delete();
            }
            if (coche) {
                cooldownsLiberados += await (0, database_1.default)('cascade_cooldowns')
                    .where('entity_type', 'coche')
                    .andWhere('entity_id', coche)
                    .delete();
            }
        }
        (0, socketBus_1.busEmit)('bus:cascade:atendido', { id, atencion, cooldownsLiberados });
        res.json({ ok: true, id, atencion, cooldownsLiberados });
    }
    catch (err) {
        logger_1.default.error('[cascade/atender]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error marcando atendido' });
    }
}
async function clearCooldown(req, res) {
    try {
        const body = (req.body ?? {});
        const items = Array.isArray(body.items) && body.items.length > 0
            ? body.items
            : body.entity_type && body.entity_id
                ? [{ entity_type: body.entity_type, entity_id: body.entity_id, evento_tipo: body.evento_tipo }]
                : [];
        if (items.length === 0) {
            res.status(400).json({ ok: false, error: 'Falta { entity_type, entity_id [, evento_tipo] } o items[]' });
            return;
        }
        let deleted = 0;
        for (const it of items) {
            let q = (0, database_1.default)('cascade_cooldowns')
                .where('entity_type', it.entity_type)
                .andWhere('entity_id', it.entity_id);
            if (it.evento_tipo)
                q = q.andWhere('evento_tipo', it.evento_tipo);
            deleted += await q.delete();
        }
        (0, socketBus_1.busEmit)('bus:cascade:cooldown-cleared', { items, deleted });
        res.json({ ok: true, deleted });
    }
    catch (err) {
        logger_1.default.error('[cascade/cooldown/clear]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error limpiando cooldown' });
    }
}
