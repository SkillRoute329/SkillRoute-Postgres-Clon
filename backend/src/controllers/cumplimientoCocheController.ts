/**
 * cumplimientoCocheController — Detalle de eventos de cumplimiento por
 * coche y fecha (FASE 5.38, 2026-05-22).
 *
 *   GET /api/cumplimiento/coche/:idBus/eventos
 *     ?fecha=YYYY-MM-DD              (default: hoy)
 *     &estados=ATRASADO,ADELANTADO   (default: todos los problemáticos)
 *     &limit=N                       (default 500, max 5000)
 *
 * Antes el Panel Cumplimiento mostraba sólo "Coche X tuvo -6 min promedio"
 * sin permitir ver QUÉ atraso específico, en QUÉ línea, a QUÉ hora ni en
 * QUÉ parada. Sin esto no se puede hacer diagnóstico operativo del
 * conductor ni del bus. Este endpoint expone los eventos individuales
 * del coche para esa fecha, con desviación, parada y línea reales.
 *
 * Fuente: `vehicle_events` (raw GPS con `estado_cumplimiento` + `desviacion_min`
 * ya calculados por el poller IMM).
 */

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';

const ESTADOS_PROBLEMATICOS_DEFAULT = ['ATRASADO', 'ADELANTADO', 'FUERA_DE_SERVICIO'];

interface EventoRow {
  id: number;
  id_bus: string;
  linea: string | null;
  agency_id: string;
  estado_cumplimiento: string | null;
  desviacion_min: number | null;
  proxima_parada: string | null;
  sentido: string | null;
  destino: string | null;
  velocidad: number | null;
  timestamp_gps: Date;
}

export async function getCocheEventos(req: Request, res: Response): Promise<void> {
  try {
    const idBus = String(req.params.idBus ?? '').trim();
    if (!idBus) {
      res.status(400).json({ ok: false, error: 'Falta idBus' });
      return;
    }
    const fechaParam = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaParam)) {
      res.status(400).json({ ok: false, error: 'Formato esperado: fecha=YYYY-MM-DD' });
      return;
    }
    const limit = Math.min(5000, Math.max(1, parseInt((req.query.limit as string) ?? '500', 10)));
    const estadosParam = (req.query.estados as string) || '';
    const estados = estadosParam
      ? estadosParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      : ESTADOS_PROBLEMATICOS_DEFAULT;
    const incluirTodos = estadosParam.toLowerCase() === 'todos';

    let q = sqlDb('vehicle_events')
      .select(
        'id',
        'id_bus',
        'linea',
        'agency_id',
        'estado_cumplimiento',
        'desviacion_min',
        'proxima_parada',
        'sentido',
        'destino',
        'velocidad',
        'timestamp_gps',
      )
      .where('id_bus', idBus)
      .andWhereRaw('DATE(timestamp_gps AT TIME ZONE \'America/Montevideo\') = ?', [fechaParam])
      .orderBy('timestamp_gps', 'asc')
      .limit(limit);

    if (!incluirTodos && estados.length > 0) {
      q = q.whereIn('estado_cumplimiento', estados);
    }

    const rows: EventoRow[] = await q;

    // Resumen por línea: cuántos eventos problemáticos, desviación máxima.
    const porLinea = new Map<string, { eventos: number; desviacionMaxMin: number; ultimaParada: string | null; estadoMasFrecuente: string }>();
    const estadoCounter = new Map<string, Map<string, number>>(); // linea → estado → count

    for (const ev of rows) {
      const linea = ev.linea ?? '—';
      const agg = porLinea.get(linea) ?? { eventos: 0, desviacionMaxMin: 0, ultimaParada: null, estadoMasFrecuente: '' };
      agg.eventos += 1;
      const dv = Math.abs(Number(ev.desviacion_min ?? 0));
      if (dv > agg.desviacionMaxMin) agg.desviacionMaxMin = dv;
      if (ev.proxima_parada) agg.ultimaParada = ev.proxima_parada;
      porLinea.set(linea, agg);

      const map = estadoCounter.get(linea) ?? new Map<string, number>();
      const e = ev.estado_cumplimiento ?? '?';
      map.set(e, (map.get(e) ?? 0) + 1);
      estadoCounter.set(linea, map);
    }
    // Resolver estado más frecuente por línea
    for (const [linea, map] of estadoCounter.entries()) {
      let best = ''; let bestN = 0;
      for (const [e, n] of map.entries()) if (n > bestN) { best = e; bestN = n; }
      const agg = porLinea.get(linea);
      if (agg) agg.estadoMasFrecuente = best;
    }
    const resumenPorLinea = Array.from(porLinea.entries()).map(([linea, v]) => ({
      linea,
      eventos: v.eventos,
      desviacionMaxMin: Math.round(v.desviacionMaxMin * 10) / 10,
      estadoMasFrecuente: v.estadoMasFrecuente,
      ultimaParada: v.ultimaParada,
    })).sort((a, b) => b.eventos - a.eventos);

    res.json({
      ok: true,
      idBus,
      fecha: fechaParam,
      estados: incluirTodos ? 'todos' : estados,
      total: rows.length,
      resumenPorLinea,
      eventos: rows.map((r) => ({
        id: r.id,
        timestamp: r.timestamp_gps instanceof Date ? r.timestamp_gps.toISOString() : String(r.timestamp_gps),
        linea: r.linea,
        agencyId: r.agency_id,
        sentido: r.sentido,
        destino: r.destino,
        proximaParada: r.proxima_parada,
        estado: r.estado_cumplimiento,
        desviacionMin: r.desviacion_min,
        velocidad: r.velocidad,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[cumplimiento/coche/eventos]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error consultando eventos del coche', eventos: [] });
  }
}
