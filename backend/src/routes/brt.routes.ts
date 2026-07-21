import { Router, Request, Response } from 'express';
import { verifyAuth } from '../middleware/auth';
import sqlDb from '../config/database';
import logger from '../config/logger';

const router = Router();
// router.use(verifyAuth); // Comentado temporalmente si el frontend no envía token consistentemente o ajustarlo según necesidad. Para producción, descomentar.

// --- CONFIGURACIÓN FINANCIERA ---

/** GET /api/brt/config */
router.get('/config', async (_req: Request, res: Response) => {
  try {
    const config = await sqlDb('brt_financial_config').where('id', 1).first();
    if (!config) {
      return res.status(404).json({ ok: false, error: 'Configuración no encontrada' });
    }
    res.json({ ok: true, data: config });
  } catch (err) {
    logger.error('[brt/config GET]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** PUT /api/brt/config */
router.put('/config', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    await sqlDb('brt_financial_config').where('id', 1).update({
      tarifa_actual_uyus: data.tarifa_actual_uyus,
      costo_dia_actual_uyus: data.costo_dia_actual_uyus,
      tarifa_km_brt_uyus: data.tarifa_km_brt_uyus,
      km_promedio_dia: data.km_promedio_dia,
      pasajeros_prom_dia: data.pasajeros_prom_dia,
      captacion_empresa: data.captacion_empresa,
      brt_bonus_nocturno: data.brt_bonus_nocturno,
      brt_riesgo_kpi_min: data.brt_riesgo_kpi_min,
      brt_costo_dia: data.brt_costo_dia,
      updated_at: sqlDb.fn.now()
    });
    const updated = await sqlDb('brt_financial_config').where('id', 1).first();
    res.json({ ok: true, data: updated });
  } catch (err) {
    logger.error('[brt/config PUT]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// --- ESCENARIOS (SIMULADOR) ---

/** GET /api/brt/scenarios */
router.get('/scenarios', async (_req: Request, res: Response) => {
  try {
    const scenarios = await sqlDb('brt_scenarios').orderBy('created_at', 'asc');
    res.json({ ok: true, data: scenarios });
  } catch (err) {
    logger.error('[brt/scenarios GET]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** POST /api/brt/scenarios */
router.post('/scenarios', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const newId = `sc_${Date.now()}`;
    
    await sqlDb('brt_scenarios').insert({
      id: newId,
      titulo: data.titulo,
      tramo: data.tramo,
      descripcion: data.descripcion,
      pasajeros_desplazados: data.pasajeros_desplazados || 0,
      lineas_afectadas: JSON.stringify(data.lineas_afectadas || []),
      duracion_est_meses: data.duracion_est_meses || 1,
      impacto_passenger_min: data.impacto_passenger_min || 0,
      costo_adicional_dia: data.costo_adicional_dia || 0,
      plan_desvio: JSON.stringify(data.plan_desvio || [])
    });
    
    const created = await sqlDb('brt_scenarios').where('id', newId).first();
    res.json({ ok: true, data: created });
  } catch (err) {
    logger.error('[brt/scenarios POST]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** DELETE /api/brt/scenarios/:id */
router.delete('/scenarios/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await sqlDb('brt_scenarios').where('id', id).delete();
    res.json({ ok: true, deleted: id });
  } catch (err) {
    logger.error('[brt/scenarios DELETE]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
