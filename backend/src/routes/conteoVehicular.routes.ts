/**
 * conteoVehicular.routes.ts (FASE 5.17) — conteo vehicular IMM por avenida.
 * Contexto de tráfico para explicar atrasos GPS en la auditoría.
 */
import { Router, Request, Response } from 'express';
import { verifyAuth } from '../middleware/auth';
import sqlDb from '../config/database';
import logger from '../config/logger';

const router = Router();
router.use(verifyAuth);

router.get('/meta', async (_req: Request, res: Response) => {
  try {
    const ing = await sqlDb('conteo_vehicular_ingestados').orderBy('mes', 'desc');
    res.json({ ok: true, ingestados: ing });
  } catch (err) {
    logger.error('[conteo/meta]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** GET /api/conteo-vehicular?avenida=&fecha=&hora= — volumen por avenida/hora. */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { avenida, fecha, hora } = req.query as Record<string, string>;
    let q = sqlDb('conteo_vehicular')
      .select('dsc_avenida', 'fecha', 'hora')
      .avg('volumen_hora_prom as vol_prom')
      .max('volumen_hora_max as vol_max')
      .sum('muestras as muestras')
      .groupBy('dsc_avenida', 'fecha', 'hora')
      .orderBy([{ column: 'fecha' }, { column: 'hora' }])
      .limit(Math.min(Number(req.query.limit) || 1000, 10000));
    if (avenida) q = q.where('dsc_avenida', 'ilike', `%${avenida}%`);
    if (fecha) q = q.where('fecha', String(fecha));
    if (hora) q = q.where('hora', Number(hora));
    const rows = await q;
    res.json({ ok: true, total: rows.length, conteo: rows });
  } catch (err) {
    logger.error('[conteo]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** GET /api/conteo-vehicular/velocidad/meta — snapshots de velocidad. */
router.get('/velocidad/meta', async (_req: Request, res: Response) => {
  try {
    const ing = await sqlDb('velocidad_vehicular_ingestados').orderBy('mes', 'desc');
    res.json({ ok: true, ingestados: ing });
  } catch (err) {
    logger.error('[velocidad/meta]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * GET /api/conteo-vehicular/velocidad?avenida=&fecha=&hora=
 * Velocidad comercial real por avenida/hora — contexto y predicción de
 * atrasos de buses (velocidad baja en una avenida → atraso esperado).
 */
router.get('/velocidad', async (req: Request, res: Response) => {
  try {
    const { avenida, fecha, hora } = req.query as Record<string, string>;
    let q = sqlDb('velocidad_vehicular')
      .select('dsc_avenida', 'fecha', 'hora')
      .avg('velocidad_prom as vel_prom')
      .min('velocidad_min as vel_min')
      .sum('muestras as muestras')
      .groupBy('dsc_avenida', 'fecha', 'hora')
      .orderBy([{ column: 'fecha' }, { column: 'hora' }])
      .limit(Math.min(Number(req.query.limit) || 1000, 10000));
    if (avenida) q = q.where('dsc_avenida', 'ilike', `%${avenida}%`);
    if (fecha) q = q.where('fecha', String(fecha));
    if (hora) q = q.where('hora', Number(hora));
    const rows = await q;
    res.json({ ok: true, total: rows.length, velocidad: rows });
  } catch (err) {
    logger.error('[velocidad]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
