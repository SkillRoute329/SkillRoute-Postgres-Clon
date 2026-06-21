"use strict";
/**
 * alertasMantenimientoController — Caducidad y purga de alertas viejas
 * (FASE 5.38, 2026-05-22).
 *
 * Problema reportado: `alertas_regulacion` tiene cientos de alertas sin
 * atender de hace +200h porque no había mecanismo de caducidad. El
 * frontend las sigue mostrando.
 *
 * Solución:
 *   POST /api/cascade/alertas/purgar
 *     body: { antiguedadHoras?: 24, dryRun?: false }
 *
 *   Marca como `atendida=true` con `accion_tomada='auto:caducada'` las
 *   alertas regulación que llevan >antiguedadHoras sin atención humana.
 *   Igualmente desactiva alertas de tráfico (activa=false) viejas.
 *
 * Lo expone manualmente para admins (botón en UI) y también lo corre el
 * scheduler `alertasCaducidadScheduler` cada 4h.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.purgarAlertasViejas = purgarAlertasViejas;
exports.correrPurgaProgramada = correrPurgaProgramada;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const socketBus_1 = require("../services/socketBus");
async function purgarAlertasViejas(req, res) {
    try {
        const body = (req.body ?? {});
        const horas = Math.max(1, Math.min(8760, Number(body.antiguedadHoras ?? 24)));
        const dryRun = Boolean(body.dryRun);
        const cutoff = `NOW() - INTERVAL '${horas} hours'`;
        // 1. alertas_regulacion sin atender más viejas que el cutoff
        // FASE 5.38 (2026-05-22) — bug fix: alertas_regulacion tiene 959K filas
        // con `atendida IS NULL`. Antes `WHERE atendida=false` las ignoraba y
        // nunca se purgaban (la vista eventos_desvio las mostraba como "no
        // resueltas" via COALESCE). Ahora NULL = "no atendida".
        const regCount = await (0, database_1.default)('alertas_regulacion')
            .where((b) => b.where('atendida', false).orWhereNull('atendida'))
            .andWhere('created_at', '<', database_1.default.raw(cutoff))
            .count({ count: '*' })
            .first();
        // 2. alertas_trafico activas más viejas que el cutoff (sin expira_en o ya vencidas)
        const trafCount = await (0, database_1.default)('alertas_trafico')
            .where('activa', true)
            .andWhere('creado_en', '<', database_1.default.raw(cutoff))
            .count({ count: '*' })
            .first();
        // 3. Eventos del motor sin atención manual (FASE 5.39)
        const motorCount = await (0, database_1.default)('logs_auditoria')
            .where('accion', 'consequencePreview')
            .andWhere('timestamp', '<', database_1.default.raw(cutoff))
            .andWhereRaw("(detalles_jsonb #>> '{atencion,atendido}') IS NULL")
            .count({ count: '*' })
            .first();
        if (dryRun) {
            res.json({
                ok: true,
                dryRun: true,
                antiguedadHoras: horas,
                afectaria: {
                    regulacion: Number(regCount?.count ?? 0),
                    trafico: Number(trafCount?.count ?? 0),
                    motor: Number(motorCount?.count ?? 0),
                },
            });
            return;
        }
        // Aplicar purga real (incluye atendida IS NULL — ver fix arriba).
        const regUpd = await (0, database_1.default)('alertas_regulacion')
            .where((b) => b.where('atendida', false).orWhereNull('atendida'))
            .andWhere('created_at', '<', database_1.default.raw(cutoff))
            .update({
            atendida: true,
            accion_tomada: `auto:caducada · >${horas}h sin atención`,
        });
        const trafUpd = await (0, database_1.default)('alertas_trafico')
            .where('activa', true)
            .andWhere('creado_en', '<', database_1.default.raw(cutoff))
            .update({ activa: false });
        // FASE 5.39 (2026-05-22) — también caducar eventos del motor de
        // consecuencias para que el reporte IMM pueda distinguir intervenidos
        // vs auto-cerrados.
        const motorRows = await (0, database_1.default)('logs_auditoria')
            .select('id', 'detalles_jsonb')
            .where('accion', 'consequencePreview')
            .andWhere('timestamp', '<', database_1.default.raw(cutoff))
            .andWhereRaw("(detalles_jsonb #>> '{atencion,atendido}') IS NULL")
            .limit(5000);
        let motorUpd = 0;
        for (const r of motorRows) {
            const existing = (r.detalles_jsonb ?? {});
            const merged = {
                ...existing,
                atencion: {
                    atendido: true,
                    atendidoPor: `auto:caducada-${horas}h`,
                    atendidoEn: new Date().toISOString(),
                    comentario: null,
                },
            };
            try {
                await (0, database_1.default)('logs_auditoria').where('id', r.id).update({ detalles_jsonb: merged });
                motorUpd++;
            }
            catch { /* tolerar fallos individuales */ }
        }
        (0, socketBus_1.busEmit)('bus:alertas:purgadas', { antiguedadHoras: horas, regulacion: regUpd, trafico: trafUpd, motor: motorUpd });
        logger_1.default.info(`[alertas/purgar] >${horas}h · regulacion=${regUpd} trafico=${trafUpd} motor=${motorUpd}`);
        res.json({
            ok: true,
            antiguedadHoras: horas,
            purgadas: {
                regulacion: regUpd,
                trafico: trafUpd,
                motor: motorUpd,
            },
        });
    }
    catch (err) {
        logger_1.default.error('[alertas/purgar]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error purgando alertas viejas' });
    }
}
// Función reutilizable para uso desde el scheduler.
async function correrPurgaProgramada(antiguedadHoras) {
    const cutoff = `NOW() - INTERVAL '${antiguedadHoras} hours'`;
    // FASE 5.38 (2026-05-22) — incluir atendida=NULL como "no atendida".
    const regUpd = await (0, database_1.default)('alertas_regulacion')
        .where((b) => b.where('atendida', false).orWhereNull('atendida'))
        .andWhere('created_at', '<', database_1.default.raw(cutoff))
        .update({
        atendida: true,
        accion_tomada: `auto:caducada · >${antiguedadHoras}h sin atención`,
    });
    const trafUpd = await (0, database_1.default)('alertas_trafico')
        .where('activa', true)
        .andWhere('creado_en', '<', database_1.default.raw(cutoff))
        .update({ activa: false });
    // FASE 5.39 (2026-05-22) — auto-caducar eventos del motor de consecuencias
    // (`logs_auditoria` con accion='consequencePreview') que llevan
    // >antiguedadHoras sin atención. Marca jsonb.atencion con
    // atendidoPor='auto:caducada-Nh' para que el reporte IMM pueda
    // distinguir entre eventos intervenidos por operador vs auto-cerrados.
    // Procesamos en lotes de 5000 para no saturar.
    let motorUpd = 0;
    try {
        const motorRows = await (0, database_1.default)('logs_auditoria')
            .select('id', 'detalles_jsonb')
            .where('accion', 'consequencePreview')
            .andWhere('timestamp', '<', database_1.default.raw(cutoff))
            .andWhereRaw("(detalles_jsonb #>> '{atencion,atendido}') IS NULL")
            .limit(5000);
        for (const r of motorRows) {
            const existing = (r.detalles_jsonb ?? {});
            const merged = {
                ...existing,
                atencion: {
                    atendido: true,
                    atendidoPor: `auto:caducada-${antiguedadHoras}h`,
                    atendidoEn: new Date().toISOString(),
                    comentario: null,
                },
            };
            try {
                await (0, database_1.default)('logs_auditoria').where('id', r.id).update({ detalles_jsonb: merged });
                motorUpd++;
            }
            catch { /* tolerar UPDATEs fallidos */ }
        }
    }
    catch (e) {
        logger_1.default.warn('[alertasCaducidad] motor purga error', { err: String(e).slice(0, 100) });
    }
    if (regUpd > 0 || trafUpd > 0 || motorUpd > 0) {
        (0, socketBus_1.busEmit)('bus:alertas:purgadas', { antiguedadHoras, regulacion: regUpd, trafico: trafUpd, motor: motorUpd, automatico: true });
    }
    return { regulacion: regUpd, trafico: trafUpd, motor: motorUpd };
}
