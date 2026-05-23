/**
 * stmHorarios.routes.ts (FASE 5.17 — 2026-05-16)
 *
 * Horarios teóricos STM por punto de control (tabla stm_horarios_control,
 * fuente oficial IMM diaria). Cubre hábil/sábado/FESTIVO — el regulador
 * independiente del GTFS (sin OAuth) y la base para validar el cartón UCOT
 * y los domingos que antes no resolvíamos.
 */
import { Router, Request, Response } from 'express';
import { verifyAuth } from '../middleware/auth';
import sqlDb from '../config/database';
import logger from '../config/logger';

const router = Router();
router.use(verifyAuth);

/** GET /api/stm-horarios/meta — estado del snapshot ingestado. */
router.get('/meta', async (_req: Request, res: Response) => {
  try {
    const ing = await sqlDb('stm_horarios_control_ingestados')
      .orderBy('snapshot_fecha', 'desc')
      .first();
    const porTipo = await sqlDb('stm_horarios_control')
      .select('tipo_dia')
      .count<{ tipo_dia: string; count: string }[]>('* as count')
      .groupBy('tipo_dia');
    res.json({ ok: true, snapshot: ing ?? null, porTipoDia: porTipo });
  } catch (err) {
    logger.error('[stm-horarios/meta]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * GET /api/stm-horarios/control?linea=&tipo_dia=&codigo_punto=&limit=
 * Horarios por punto de control filtrables. tipo_dia: habil|sabado|festivo.
 */
router.get('/control', async (req: Request, res: Response) => {
  try {
    // `linea` filtra por el número PÚBLICO de línea (columna `linea`),
    // que es como piensa el usuario; `cod_linea` es el código interno STM.
    const { linea, cod_linea, tipo_dia, codigo_punto } = req.query as Record<string, string>;
    const limit = Math.min(Number(req.query.limit) || 2000, 20000);
    let q = sqlDb('stm_horarios_control')
      .select(
        'cod_linea',
        'linea',
        'sublinea',
        'variante',
        'codigo_minuta',
        'tipo_dia',
        'codigo_punto',
        'hora',
        'fecha_desde',
      )
      .orderBy([{ column: 'cod_linea' }, { column: 'codigo_punto' }, { column: 'hora' }])
      .limit(limit);
    if (linea) q = q.where('linea', String(linea));
    if (cod_linea) q = q.where('cod_linea', String(cod_linea));
    if (tipo_dia) q = q.where('tipo_dia', String(tipo_dia));
    if (codigo_punto) q = q.where('codigo_punto', String(codigo_punto));
    const rows = await q;
    res.json({ ok: true, total: rows.length, horarios: rows });
  } catch (err) {
    logger.error('[stm-horarios/control]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
