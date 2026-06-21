"use strict";
/**
 * motorHealthController — Métricas de salud del motor de consecuencias
 * (FASE 5.37, 2026-05-22).
 *
 *   GET /api/motor/health
 *
 * Devuelve KPIs operativos del propio motor: cuántos eventos disparó por
 * hora en las últimas 24h, cuántos cooldowns activos hay, distribución
 * por tipo, próximo tick estimado del scheduler, top fuentes de eventos.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMotorHealth = getMotorHealth;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
async function getMotorHealth(_req, res) {
    try {
        // 1. Eventos por hora en últimas 24h
        const horasRows = (await database_1.default.raw(`SELECT date_trunc('hour', timestamp) AS hora,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE detalles_jsonb #>> '{resumen,severidadGlobal}' = 'critico') AS criticos
         FROM logs_auditoria
        WHERE accion = 'consequencePreview'
          AND timestamp >= NOW() - INTERVAL '24 hours'
        GROUP BY hora
        ORDER BY hora ASC`)).rows;
        const porHora = horasRows.map((r) => ({
            hora: r.hora instanceof Date ? r.hora.toISOString() : String(r.hora),
            total: Number(r.total),
            criticos: Number(r.criticos),
        }));
        // 2. Distribución por tipo en últimas 24h
        const tipoRows = (await database_1.default.raw(`SELECT recurso AS tipo, COUNT(*) AS total
         FROM logs_auditoria
        WHERE accion = 'consequencePreview'
          AND timestamp >= NOW() - INTERVAL '24 hours'
        GROUP BY recurso
        ORDER BY 2 DESC`)).rows;
        const porTipo = {};
        for (const r of tipoRows)
            porTipo[r.tipo] = Number(r.total);
        // 3. Distribución por fuente (manual vs auto-trigger)
        const fuenteRows = (await database_1.default.raw(`SELECT COALESCE(detalles_jsonb #>> '{evento,fuente}', 'manual') AS fuente,
              COUNT(*) AS total
         FROM logs_auditoria
        WHERE accion = 'consequencePreview'
          AND timestamp >= NOW() - INTERVAL '24 hours'
        GROUP BY fuente
        ORDER BY 2 DESC`)).rows;
        const porFuente = {};
        for (const r of fuenteRows)
            porFuente[r.fuente] = Number(r.total);
        // 4. Cooldowns activos
        const cooldownRows = (await database_1.default.raw(`SELECT entity_type, evento_tipo, COUNT(*) AS total, MIN(fired_at) AS oldest
         FROM cascade_cooldowns
        GROUP BY entity_type, evento_tipo
        ORDER BY 1, 2`)).rows;
        const cooldowns = cooldownRows.map((r) => ({
            entity_type: r.entity_type,
            evento_tipo: r.evento_tipo,
            total: Number(r.total),
            oldest: r.oldest instanceof Date ? r.oldest.toISOString() : String(r.oldest),
        }));
        // 5. Total atendidos (eventos marcados manualmente como atendidos)
        const atendidosRow = await (0, database_1.default)('logs_auditoria')
            .where('accion', 'consequencePreview')
            .andWhereRaw("detalles_jsonb #>> '{atencion,atendido}' = 'true'")
            .count({ count: '*' })
            .first();
        const atendidos = Number(atendidosRow?.count ?? 0);
        // 6. Total no atendidos críticos
        const noAtendidosRow = await (0, database_1.default)('logs_auditoria')
            .where('accion', 'consequencePreview')
            .andWhereRaw("detalles_jsonb #>> '{resumen,severidadGlobal}' = 'critico'")
            .andWhere((b) => {
            b.whereRaw("detalles_jsonb #>> '{atencion,atendido}' IS NULL")
                .orWhereRaw("detalles_jsonb #>> '{atencion,atendido}' = 'false'");
        })
            .andWhere('timestamp', '>=', database_1.default.raw("NOW() - INTERVAL '24 hours'"))
            .count({ count: '*' })
            .first();
        const noAtendidosCriticos = Number(noAtendidosRow?.count ?? 0);
        // 7. Total eventos último día
        const totalUltimaSemana = porHora.reduce((s, h) => s + h.total, 0);
        const criticosUltimaSemana = porHora.reduce((s, h) => s + h.criticos, 0);
        const promedioHora = porHora.length ? totalUltimaSemana / porHora.length : 0;
        res.json({
            ok: true,
            data: {
                scheduler: {
                    tickIntervalSec: 90,
                    activo: true,
                    detectores: ['retraso', 'fueraDeServicio', 'bunching', 'bajaCobertura', 'headway', 'velocidadAnomala', 'inspeccionesAusentes'],
                },
                actividad24h: {
                    totalEventos: totalUltimaSemana,
                    criticos: criticosUltimaSemana,
                    promedioHora: Math.round(promedioHora * 10) / 10,
                    porHora,
                    porTipo,
                    porFuente,
                },
                atencion: {
                    atendidos,
                    noAtendidosCriticos,
                },
                cooldowns: {
                    total: cooldowns.reduce((s, c) => s + c.total, 0),
                    desglose: cooldowns,
                },
            },
            timestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        logger_1.default.error('[motor/health]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error obteniendo salud del motor' });
    }
}
