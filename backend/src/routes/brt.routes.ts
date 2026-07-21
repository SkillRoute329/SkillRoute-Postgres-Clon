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

// --- CORREDORES ---

/** GET /api/brt/corredores */
router.get('/corredores', async (_req: Request, res: Response) => {
  try {
    const corredores = await sqlDb('brt_corredores').orderBy('id', 'asc');
    res.json({ ok: true, data: corredores });
  } catch (err) {
    logger.error('[brt/corredores GET]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** PUT /api/brt/corredores/:id */
router.put('/corredores/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    await sqlDb('brt_corredores').where('id', id).update({
      linea_ref: data.linea_ref,
      nombre: data.nombre,
      subtitulo: data.subtitulo,
      color: data.color,
      color_bg: data.color_bg,
      color_text: data.color_text,
      color_border: data.color_border,
      km_troncal: data.km_troncal,
      tiempo_actual_min: data.tiempo_actual_min,
      tiempo_brt_min: data.tiempo_brt_min,
      pasajeros_dia_direccion: data.pasajeros_dia_direccion,
      niveles: typeof data.niveles === 'string' ? data.niveles : JSON.stringify(data.niveles || []),
      paradas: typeof data.paradas === 'string' ? data.paradas : JSON.stringify(data.paradas || []),
      lineas_ucot_afectadas: typeof data.lineas_ucot_afectadas === 'string' ? data.lineas_ucot_afectadas : JSON.stringify(data.lineas_ucot_afectadas || [])
    });
    const updated = await sqlDb('brt_corredores').where('id', id).first();
    res.json({ ok: true, data: updated });
  } catch (err) {
    logger.error('[brt/corredores PUT]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// --- ALIMENTADORAS ---

/** GET /api/brt/alimentadoras */
router.get('/alimentadoras', async (_req: Request, res: Response) => {
  try {
    const alimentadoras = await sqlDb('brt_alimentadoras').orderBy('id', 'asc');
    res.json({ ok: true, data: alimentadoras });
  } catch (err) {
    logger.error('[brt/alimentadoras GET]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** POST /api/brt/alimentadoras */
router.post('/alimentadoras', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const newId = data.id || `AL-${Date.now()}`;
    
    await sqlDb('brt_alimentadoras').insert({
      id: newId,
      nombre: data.nombre,
      descripcion: data.descripcion,
      recorrido: data.recorrido,
      km_estimado: data.km_estimado,
      frecuencia_min: data.frecuencia_min,
      corredor_alimenta: data.corredor_alimenta,
      pasajeros_est_dia: data.pasajeros_est_dia,
      conductores_necesarios: data.conductores_necesarios,
      coches_necesarios: data.coches_necesarios,
      viabilidad: data.viabilidad,
      ingreso_est_dia: data.ingreso_est_dia,
      linea_existente_migracion: data.linea_existente_migracion
    });
    
    const created = await sqlDb('brt_alimentadoras').where('id', newId).first();
    res.json({ ok: true, data: created });
  } catch (err) {
    logger.error('[brt/alimentadoras POST]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** PUT /api/brt/alimentadoras/:id */
router.put('/alimentadoras/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    await sqlDb('brt_alimentadoras').where('id', id).update({
      nombre: data.nombre,
      descripcion: data.descripcion,
      recorrido: data.recorrido,
      km_estimado: data.km_estimado,
      frecuencia_min: data.frecuencia_min,
      corredor_alimenta: data.corredor_alimenta,
      pasajeros_est_dia: data.pasajeros_est_dia,
      conductores_necesarios: data.conductores_necesarios,
      coches_necesarios: data.coches_necesarios,
      viabilidad: data.viabilidad,
      ingreso_est_dia: data.ingreso_est_dia,
      linea_existente_migracion: data.linea_existente_migracion
    });
    const updated = await sqlDb('brt_alimentadoras').where('id', id).first();
    res.json({ ok: true, data: updated });
  } catch (err) {
    logger.error('[brt/alimentadoras PUT]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** DELETE /api/brt/alimentadoras/:id */
router.delete('/alimentadoras/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await sqlDb('brt_alimentadoras').where('id', id).delete();
    res.json({ ok: true, deleted: id });
  } catch (err) {
    logger.error('[brt/alimentadoras DELETE]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// --- OBRAS ---

/** GET /api/brt/obras */
router.get('/obras', async (_req: Request, res: Response) => {
  try {
    const obras = await sqlDb('brt_plan_obras').orderBy('orden', 'asc').orderBy('id', 'asc');
    res.json({ ok: true, data: obras });
  } catch (err) {
    logger.error('[brt/obras GET]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** POST /api/brt/obras */
router.post('/obras', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const inserted = await sqlDb('brt_plan_obras').insert({
      fase: data.fase,
      periodo: data.periodo,
      color: data.color,
      acciones: typeof data.acciones === 'string' ? data.acciones : JSON.stringify(data.acciones || []),
      orden: data.orden
    }).returning('*');
    res.json({ ok: true, data: inserted[0] });
  } catch (err) {
    logger.error('[brt/obras POST]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** PUT /api/brt/obras/:id */
router.put('/obras/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    await sqlDb('brt_plan_obras').where('id', id).update({
      fase: data.fase,
      periodo: data.periodo,
      color: data.color,
      acciones: typeof data.acciones === 'string' ? data.acciones : JSON.stringify(data.acciones || []),
      orden: data.orden
    });
    const updated = await sqlDb('brt_plan_obras').where('id', id).first();
    res.json({ ok: true, data: updated });
  } catch (err) {
    logger.error('[brt/obras PUT]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** DELETE /api/brt/obras/:id */
router.delete('/obras/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await sqlDb('brt_plan_obras').where('id', id).delete();
    res.json({ ok: true, deleted: id });
  } catch (err) {
    logger.error('[brt/obras DELETE]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// --- TIMELINE ---

/** GET /api/brt/timeline */
router.get('/timeline', async (_req: Request, res: Response) => {
  try {
    const timeline = await sqlDb('brt_timeline').orderBy('orden', 'asc').orderBy('id', 'asc');
    res.json({ ok: true, data: timeline });
  } catch (err) {
    logger.error('[brt/timeline GET]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** POST /api/brt/timeline */
router.post('/timeline', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const inserted = await sqlDb('brt_timeline').insert({
      periodo: data.periodo,
      evento: data.evento,
      estado: data.estado,
      detalle: data.detalle,
      orden: data.orden
    }).returning('*');
    res.json({ ok: true, data: inserted[0] });
  } catch (err) {
    logger.error('[brt/timeline POST]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** PUT /api/brt/timeline/:id */
router.put('/timeline/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    await sqlDb('brt_timeline').where('id', id).update({
      periodo: data.periodo,
      evento: data.evento,
      estado: data.estado,
      detalle: data.detalle,
      orden: data.orden
    });
    const updated = await sqlDb('brt_timeline').where('id', id).first();
    res.json({ ok: true, data: updated });
  } catch (err) {
    logger.error('[brt/timeline PUT]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** DELETE /api/brt/timeline/:id */
router.delete('/timeline/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await sqlDb('brt_timeline').where('id', id).delete();
    res.json({ ok: true, deleted: id });
  } catch (err) {
    logger.error('[brt/timeline DELETE]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// --- BENCHMARKS ---

/** GET /api/brt/benchmarks */
router.get('/benchmarks', async (_req: Request, res: Response) => {
  try {
    const benchmarks = await sqlDb('brt_benchmarks').orderBy('id', 'asc');
    res.json({ ok: true, data: benchmarks });
  } catch (err) {
    logger.error('[brt/benchmarks GET]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** POST /api/brt/benchmarks */
router.post('/benchmarks', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const inserted = await sqlDb('brt_benchmarks').insert({
      ciudad: data.ciudad,
      pais: data.pais,
      bandera: data.bandera,
      inicio_op: data.inicio_op,
      km_red: data.km_red,
      pasajeros_dia: data.pasajeros_dia,
      pas_km: data.pas_km,
      costo_km: data.costo_km,
      velocidad_kmh: data.velocidad_kmh,
      tarifa_usd: data.tarifa_usd,
      modelo: data.modelo,
      leccion: data.leccion,
      fortaleza: data.fortaleza,
      riesgo: data.riesgo,
      relevancia_ucot: data.relevancia_ucot,
      color: data.color
    }).returning('*');
    res.json({ ok: true, data: inserted[0] });
  } catch (err) {
    logger.error('[brt/benchmarks POST]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** PUT /api/brt/benchmarks/:id */
router.put('/benchmarks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    await sqlDb('brt_benchmarks').where('id', id).update({
      ciudad: data.ciudad,
      pais: data.pais,
      bandera: data.bandera,
      inicio_op: data.inicio_op,
      km_red: data.km_red,
      pasajeros_dia: data.pasajeros_dia,
      pas_km: data.pas_km,
      costo_km: data.costo_km,
      velocidad_kmh: data.velocidad_kmh,
      tarifa_usd: data.tarifa_usd,
      modelo: data.modelo,
      leccion: data.leccion,
      fortaleza: data.fortaleza,
      riesgo: data.riesgo,
      relevancia_ucot: data.relevancia_ucot,
      color: data.color
    });
    const updated = await sqlDb('brt_benchmarks').where('id', id).first();
    res.json({ ok: true, data: updated });
  } catch (err) {
    logger.error('[brt/benchmarks PUT]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** DELETE /api/brt/benchmarks/:id */
router.delete('/benchmarks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await sqlDb('brt_benchmarks').where('id', id).delete();
    res.json({ ok: true, deleted: id });
  } catch (err) {
    logger.error('[brt/benchmarks DELETE]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// --- PROPUESTA ESTRATÉGICA ---

/** GET /api/brt/propuesta */
router.get('/propuesta', async (_req: Request, res: Response) => {
  try {
    const propuesta = await sqlDb('brt_propuesta_estrategica').where('id', 1).first();
    if (!propuesta) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, data: propuesta });
  } catch (err) {
    logger.error('[brt/propuesta GET]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/** PUT /api/brt/propuesta */
router.put('/propuesta', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    await sqlDb('brt_propuesta_estrategica').where('id', 1).update({
      titulo: data.titulo,
      subtitulo: data.subtitulo,
      ventajas_competitivas: typeof data.ventajas_competitivas === 'string' ? data.ventajas_competitivas : JSON.stringify(data.ventajas_competitivas || []),
      modelo_comercial: typeof data.modelo_comercial === 'string' ? data.modelo_comercial : JSON.stringify(data.modelo_comercial || {}),
      kpis_internacionales: typeof data.kpis_internacionales === 'string' ? data.kpis_internacionales : JSON.stringify(data.kpis_internacionales || []),
      updated_at: sqlDb.fn.now()
    });
    const updated = await sqlDb('brt_propuesta_estrategica').where('id', 1).first();
    res.json({ ok: true, data: updated });
  } catch (err) {
    logger.error('[brt/propuesta PUT]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
