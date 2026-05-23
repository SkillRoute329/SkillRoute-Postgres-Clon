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

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';

interface KpiPorOperador {
  agencyId: string;
  nombre: string;
  buses: { total: number; enTiempo: number; atrasado: number; fds: number };
  motor: {
    eventos: number;
    criticos: number;
    porTipo: Record<string, number>;
    impactoNomina: number;
    impactoSubsidio: number;
  };
  catalogo: {
    lineas: number;
  };
  topLineas: Array<{ linea: string; eventos: number; criticos: number }>;
}

const AGENCIAS: Array<{ id: string; nombre: string }> = [
  { id: '70', nombre: 'UCOT' },
  { id: '50', nombre: 'CUTCSA' },
  { id: '20', nombre: 'COME' },
  { id: '10', nombre: 'COETC' },
];

export async function getOperadoresKpis(req: Request, res: Response): Promise<void> {
  try {
    const since = req.query.since as string | undefined;
    const until = req.query.until as string | undefined;

    const sinceDate = since && !isNaN(Date.parse(since)) ? new Date(since) : new Date(Date.now() - 24 * 3600 * 1000);
    const untilDate = until && !isNaN(Date.parse(until)) ? new Date(until) : new Date();

    const result: KpiPorOperador[] = [];

    for (const ag of AGENCIAS) {
      // Buses en vivo y desempeño
      const busesRow = await sqlDb('bus_last_pos')
        .where('agency_id', ag.id)
        .andWhere('timestamp_gps', '>=', sqlDb.raw("NOW() - INTERVAL '15 minutes'"))
        .select(
          sqlDb.raw('COUNT(*)::int AS total'),
          sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'EN_TIEMPO')::int AS en_tiempo"),
          sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ATRASADO')::int AS atrasado"),
          sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'FUERA_DE_SERVICIO')::int AS fds"),
        )
        .first();

      // Eventos del motor en el rango filtrado por agencia (vía JSONB)
      const eventosRows: Array<{ recurso: string; severidad: string; impacto_nomina: number; impacto_subsidio: number; linea: string }> = (await sqlDb.raw(
        `SELECT recurso,
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
            )`,
        [sinceDate, untilDate, ag.id, ag.id, ag.id],
      )).rows;

      const porTipo: Record<string, number> = {};
      let criticos = 0;
      let impactoNomina = 0;
      let impactoSubsidio = 0;
      const lineaCount = new Map<string, { eventos: number; criticos: number }>();
      for (const r of eventosRows) {
        porTipo[r.recurso] = (porTipo[r.recurso] ?? 0) + 1;
        if (r.severidad === 'critico') criticos++;
        impactoNomina += Number(r.impacto_nomina) || 0;
        impactoSubsidio += Number(r.impacto_subsidio) || 0;
        const l = String(r.linea ?? '?');
        const e = lineaCount.get(l) ?? { eventos: 0, criticos: 0 };
        e.eventos += 1;
        if (r.severidad === 'critico') e.criticos += 1;
        lineaCount.set(l, e);
      }
      const topLineas = Array.from(lineaCount.entries())
        .map(([linea, v]) => ({ linea, ...v }))
        .sort((a, b) => b.eventos - a.eventos)
        .slice(0, 5);

      // Catálogo: líneas distintas operadas por el operador (desde bus_last_pos
      // recientes — refleja la operación real, no el catálogo nominal).
      const lineasCountRow = await sqlDb('bus_last_pos')
        .where('agency_id', ag.id)
        .andWhere('timestamp_gps', '>=', sqlDb.raw("NOW() - INTERVAL '24 hours'"))
        .countDistinct<{ count: string }>({ count: 'linea' })
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
  } catch (err) {
    logger.error('[operadores/kpis]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error consultando KPIs por operador', operadores: [] });
  }
}
