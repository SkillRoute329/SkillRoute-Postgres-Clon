/**
 * cartones.routes.ts (FASE 5.6 — 2026-05-13)
 *
 * Endpoints para ingesta masiva de cartones de servicio UCOT (provistos por
 * agente Antigravity) y para la TRIANGULACIÓN de cumplimiento que cruza:
 *
 *   1. IMM-GTFS (horario regulador oficial)
 *   2. Cartón UCOT (horario interno comprometido del operador)
 *   3. GPS real (lo que efectivamente pasó el coche)
 *
 * La triangulación es el diferencial técnico de SkillRoute para la auditoría
 * IMM: ningún operador puede demostrar las 3 capas comparadas en vivo. Mide:
 *   - Compromiso del operador respecto al regulador (cartón vs IMM)
 *   - Cumplimiento del operador a su propio compromiso (real vs cartón)
 *   - Cumplimiento al regulador (real vs IMM)
 */

import { Router, Request, Response } from 'express';
import { verifyAuth } from '../middleware/auth';
import sqlDb from '../config/database';
import logger from '../config/logger';
import {
  compararServicioCoche,
  lineaDeServicio,
  tipoDiaDeFecha,
} from '../services/comparacionServicioService';
import { snapshotHistorial } from '../services/cartonesHistorialService';
import { mismaLinea } from '../utils/lineaUcot';
import { cartonIndex, cartonMeta } from '../services/cartonOficial';

const router = Router();
router.use(verifyAuth);

/**
 * POST /api/cartones/bulk
 * Bulk upsert de cartones. Body:
 *   { cartones: [ { id, agency_id, service_number, line, vehiculo_id?, conductor_id?, data_jsonb }, ... ] }
 *
 * Idempotente: si un id ya existe, hace UPDATE de los campos.
 * Diseñado para que Antigravity (u otro agente) entregue 100-1000 cartones
 * en una sola request sin sobrecargar el endpoint REST genérico.
 *
 * Validación: cada cartón debe tener id, agency_id, line. data_jsonb es libre
 * (Antigravity arma el shape: paradas, viajes, tiempos, etc.).
 */
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const cartones = (req.body?.cartones ?? []) as any[];
    if (!Array.isArray(cartones) || cartones.length === 0) {
      res.status(400).json({ ok: false, error: 'Falta cartones[] en body' });
      return;
    }
    if (cartones.length > 5000) {
      res.status(400).json({ ok: false, error: 'Máximo 5000 cartones por request. Hacer múltiples llamadas.' });
      return;
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const c of cartones) {
      if (!c.id || !c.agency_id || !c.line) {
        skipped++;
        errors.push({ id: c.id ?? 'sin-id', error: 'Falta id/agency_id/line' });
        continue;
      }
      try {
        const existing = await sqlDb('cartones_completados').where('id', c.id).first();
        const row = {
          id: c.id,
          agency_id: c.agency_id,
          service_number: c.service_number ?? null,
          line: c.line,
          vehiculo_id: c.vehiculo_id ?? null,
          conductor_id: c.conductor_id ?? null,
          data_jsonb: typeof c.data_jsonb === 'string' ? c.data_jsonb : JSON.stringify(c.data_jsonb ?? {}),
          updated_by: c.updated_by ?? 'antigravity-bulk',
        };
        if (existing) {
          await sqlDb('cartones_completados').where('id', c.id).update(row);
          updated++;
        } else {
          await sqlDb('cartones_completados').insert(row);
          inserted++;
        }
      } catch (err) {
        errors.push({ id: c.id, error: (err as Error).message });
      }
    }

    res.json({
      ok: true,
      total: cartones.length,
      inserted,
      updated,
      skipped,
      errores: errors.length,
      detalleErrores: errors.slice(0, 20),
    });
  } catch (err) {
    logger.error('[cartones/bulk]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error en bulk upsert' });
  }
});

/**
 * GET /api/cartones/oficiales        — lista de servicios del XLS oficial UCOT
 * GET /api/cartones/oficiales/:id    — un servicio (por número de servicio)
 *
 * FASE 5.27 (2026-05-19): el frontend (CartonManager, DistribucionDiaria) lo
 * pedía y daba 404. La fuente real es el XLS "Cartones habiles desde el 2
 * de marzo.xls" parseado en cartonOficial.ts. Devolvemos el shape esperado
 * por el front: { cartones: [{ id, linea, ... }], meta }.
 */
router.get('/oficiales', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(5000, Math.max(1, parseInt((req.query.limit as string) ?? '5000', 10)));
    const idx = cartonIndex();
    const cartones: Array<Record<string, unknown>> = [];
    idx.porServicio.forEach((s) => {
      cartones.push({
        id: s.servicio,
        servicio: s.servicio,
        linea: s.linea,
        regimen: s.regimen,
        primeraEtapa: s.primeraEtapa,
        primeraHora: s.primeraHora,
        ultimaEtapa: s.ultimaEtapa,
        etapas: s.etapas,
        source: 'oficial',
      });
    });
    cartones.sort((a, b) =>
      String(a.linea).localeCompare(String(b.linea), undefined, { numeric: true }) ||
      String(a.id).localeCompare(String(b.id), undefined, { numeric: true }),
    );
    res.json({
      ok: true,
      total: cartones.length,
      cartones: cartones.slice(0, limit),
      meta: cartonMeta(),
    });
  } catch (err) {
    logger.error('[cartones/oficiales]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error leyendo cartón oficial', cartones: [] });
  }
});

router.get('/oficiales/:id', (req: Request, res: Response) => {
  try {
    const sId = String(req.params.id).trim();
    const idx = cartonIndex();
    const s = idx.porServicio.get(sId);
    if (!s) {
      res.status(404).json({ ok: false, error: 'Servicio no encontrado en cartón oficial', servicio: sId });
      return;
    }
    res.json({
      ok: true,
      cartones: [{
        id: s.servicio,
        servicio: s.servicio,
        linea: s.linea,
        regimen: s.regimen,
        primeraEtapa: s.primeraEtapa,
        primeraHora: s.primeraHora,
        ultimaEtapa: s.ultimaEtapa,
        etapas: s.etapas,
        source: 'oficial',
      }],
      meta: cartonMeta(),
    });
  } catch (err) {
    logger.error('[cartones/oficiales/:id]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error leyendo cartón oficial' });
  }
});

/**
 * GET /api/cartones/count?agency_id=70
 * Conteo rápido de cartones por agencia y línea.
 */
router.get('/count', async (req: Request, res: Response) => {
  try {
    const agencyId = req.query.agency_id as string | undefined;
    const q = sqlDb('cartones_completados')
      .select('agency_id', 'line', sqlDb.raw('COUNT(*) AS cnt'))
      .groupBy('agency_id', 'line')
      .orderBy([{ column: 'agency_id' }, { column: 'cnt', order: 'desc' }]);
    if (agencyId) q.where('agency_id', agencyId);
    const rows = await q;
    res.json({ ok: true, total: rows.length, breakdown: rows });
  } catch (err) {
    logger.error('[cartones/count]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error en count' });
  }
});

/**
 * GET /api/cartones/triangulacion?linea=300&sentido=IDA&fecha=2026-05-13&service_number=15
 *
 * Devuelve la triangulación de cumplimiento para un servicio específico:
 *   - Horario IMM-GTFS (de gtfs.stop_times)
 *   - Horario cartón UCOT (de cartones_completados.data_jsonb)
 *   - Horario real GPS (de vehicle_events agrupado por parada cercana)
 *
 * Si aún no hay cartones cargados para el servicio, devuelve con un flag
 * indicando que falta esa capa, pero entrega las otras dos (IMM y GPS).
 */
router.get('/triangulacion', async (req: Request, res: Response) => {
  try {
    const linea = (req.query.linea as string) || '';
    const sentido = ((req.query.sentido as string) || 'IDA').toUpperCase();
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);
    const serviceNumber = req.query.service_number as string | undefined;
    const agencyId = (req.query.agency_id as string) || '70';

    if (!linea) {
      res.status(400).json({ ok: false, error: 'Falta query param: linea' });
      return;
    }

    // 1. Buscar cartón UCOT para este servicio (si existe)
    let carton: any = null;
    if (serviceNumber) {
      const cartonRow = await sqlDb('cartones_completados')
        .where('agency_id', agencyId)
        .where('line', linea)
        .where('service_number', serviceNumber)
        .first();
      carton = cartonRow?.data_jsonb ?? null;
    } else {
      // Cualquier cartón de referencia para esta línea+sentido
      const cartonRow = await sqlDb('cartones_completados')
        .whereRaw(`(agency_id = ? OR agency_id IS NULL)`, [agencyId])
        .where('id', 'like', `%${linea}_${sentido === 'IDA' ? 'ida' : 'vuelta'}%`)
        .first();
      carton = cartonRow?.data_jsonb ?? null;
    }

    // 2. Obtener horario IMM-GTFS para esta línea + sentido + fecha (un trip representativo)
    const dirId = sentido === 'IDA' ? 0 : 1;
    const tripQ = await sqlDb.raw(`
      SELECT t.trip_id, st.arrival_time, st.stop_sequence, s.stop_name, s.stop_lat, s.stop_lon
      FROM gtfs.trips t
      JOIN gtfs.routes r ON t.route_id = r.route_id
      JOIN gtfs.stop_times st ON t.trip_id = st.trip_id
      JOIN gtfs.stops s ON st.stop_id = s.stop_id
      WHERE r.route_short_name = ? AND t.direction_id = ?
      ORDER BY t.trip_id, st.stop_sequence ASC
      LIMIT 100
    `, [linea, dirId]);
    const tripStops = (tripQ.rows as any[]).filter((r) => r.stop_name);
    const horarioImm = tripStops.map((r) => ({
      seq: r.stop_sequence,
      parada: r.stop_name,
      tiempo: r.arrival_time,
      lat: Number(r.stop_lat),
      lon: Number(r.stop_lon),
    }));

    // 3. Obtener tiempos reales GPS — eventos del coche cerca de cada parada control
    //    de la línea + sentido + fecha.
    const eventsQ = await sqlDb('vehicle_events')
      .where('agency_id', agencyId)
      .where('linea', linea)
      .whereRaw(`DATE(created_at) = ?`, [fecha])
      .orderBy('created_at', 'asc')
      .select('id_bus', 'lat', 'lon', 'velocidad', 'timestamp_gps', 'estado_cumplimiento', 'desviacion_min', 'trip_id', 'proxima_parada')
      .limit(2000);
    const eventos = eventsQ as any[];

    res.json({
      ok: true,
      meta: {
        linea, sentido, fecha, service_number: serviceNumber ?? null, agency_id: agencyId,
        generado_en: new Date().toISOString(),
      },
      capas: {
        imm_gtfs: {
          disponible: horarioImm.length > 0,
          paradas: horarioImm.length,
          horario: horarioImm,
        },
        carton_ucot: {
          disponible: carton !== null,
          data: carton,
          nota: carton ? null : 'Cartón pendiente de carga por agente Antigravity. Cargar via POST /api/cartones/bulk.',
        },
        gps_real: {
          disponible: eventos.length > 0,
          eventos_totales: eventos.length,
          buses_distintos: [...new Set(eventos.map((e) => e.id_bus))].length,
          muestra: eventos.slice(0, 10),
        },
      },
      analisis: {
        triangulacion_completa: horarioImm.length > 0 && carton !== null && eventos.length > 0,
        capas_faltantes: [
          horarioImm.length === 0 ? 'imm_gtfs' : null,
          carton === null ? 'carton_ucot' : null,
          eventos.length === 0 ? 'gps_real' : null,
        ].filter(Boolean),
      },
    });
  } catch (err) {
    logger.error('[cartones/triangulacion]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error en triangulación', detalle: String(err) });
  }
});

/**
 * GET /api/cartones/coche/:idBus?fecha=YYYY-MM-DD&agency_id=70
 *
 * Para un coche específico, devuelve:
 *   1. El cartón asignado para esa fecha (vehiculo_id = idBus)
 *   2. Eventos GPS del coche durante ese día (de vehicle_events)
 *   3. Comparativa parada-por-parada: tiempo cartón vs tiempo real GPS
 *
 * Permite responder: "¿cumplió el coche con su cartón asignado hoy?"
 * "¿en qué paradas se atrasó o adelantó?"
 */
router.get('/coche/:idBus', async (req: Request, res: Response) => {
  try {
    const idBus = req.params.idBus;
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);
    const agencyId = (req.query.agency_id as string) || '70';

    // 1. Cartón asignado al coche para la fecha
    const carton = await sqlDb('cartones_completados')
      .where('agency_id', agencyId)
      .where('vehiculo_id', idBus)
      .whereRaw("COALESCE((data_jsonb ->> 'timestamp')::timestamptz::date, updated_at::date) = ?::date", [fecha])
      .first();

    // 2. Eventos GPS del coche en esa fecha
    const eventos = await sqlDb('vehicle_events')
      .where('id_bus', idBus)
      .where('agency_id', agencyId)
      .whereRaw(`DATE(created_at) = ?`, [fecha])
      .orderBy('created_at', 'asc')
      .select('linea', 'lat', 'lon', 'velocidad', 'timestamp_gps', 'estado_cumplimiento', 'desviacion_min', 'trip_id', 'proxima_parada', 'created_at')
      .limit(3000);

    // 3. Resumen del día por línea
    const resumenPorLinea: Record<string, any> = {};
    for (const ev of eventos) {
      const k = String(ev.linea ?? 'sin_linea');
      if (!resumenPorLinea[k]) {
        resumenPorLinea[k] = { linea: k, eventos: 0, en_tiempo: 0, atrasado: 0, adelantado: 0, sin_horario: 0, desviacion_media_min: 0, suma_desv: 0, n_desv: 0 };
      }
      const r = resumenPorLinea[k];
      r.eventos++;
      if (ev.estado_cumplimiento === 'EN_TIEMPO') r.en_tiempo++;
      else if (ev.estado_cumplimiento === 'ATRASADO') r.atrasado++;
      else if (ev.estado_cumplimiento === 'ADELANTADO') r.adelantado++;
      else r.sin_horario++;
      if (typeof ev.desviacion_min === 'number') {
        r.suma_desv += ev.desviacion_min;
        r.n_desv++;
      }
    }
    Object.values(resumenPorLinea).forEach((r: any) => {
      r.desviacion_media_min = r.n_desv > 0 ? Number((r.suma_desv / r.n_desv).toFixed(2)) : null;
      const clasificados = r.en_tiempo + r.atrasado + r.adelantado;
      r.pct_cumplimiento = clasificados > 0 ? Number(((r.en_tiempo / clasificados) * 100).toFixed(1)) : 0;
      delete r.suma_desv;
      delete r.n_desv;
    });

    res.json({
      ok: true,
      meta: { idBus, fecha, agency_id: agencyId },
      asignacion: {
        carton_asignado: carton ? {
          id: carton.id,
          servicio: carton.service_number,
          linea: carton.line,
          conductor_id: carton.conductor_id,
          data: carton.data_jsonb,
        } : null,
        nota: carton ? null : 'Sin cartón asignado para este coche en esta fecha. Antigravity debe cargarlo vía POST /api/cartones/bulk con vehiculo_id.',
      },
      operacion: {
        eventos_totales: eventos.length,
        primera_actividad: eventos[0]?.timestamp_gps ?? null,
        ultima_actividad: eventos[eventos.length - 1]?.timestamp_gps ?? null,
        lineas_operadas: Object.keys(resumenPorLinea),
        resumen_por_linea: Object.values(resumenPorLinea),
      },
      gps_eventos: eventos.slice(0, 100),
    });
  } catch (err) {
    logger.error('[cartones/coche]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error en consulta por coche', detalle: String(err) });
  }
});

/**
 * GET /api/cartones/ajustes-sugeridos/:linea?sentido=IDA&agency_id=70&dias=7
 *
 * Analiza eventos GPS de los últimos N días para una línea+sentido y detecta
 * paradas con desviación SISTEMÁTICA respecto al horario programado IMM.
 *
 * Output: lista de "paradas problemáticas" — aquellas donde la mayoría de los
 * buses pasan con desviación > 2 min de manera consistente. Estas son
 * candidatas a AJUSTE DE CARTÓN.
 */
router.get('/ajustes-sugeridos/:linea', async (req: Request, res: Response) => {
  try {
    const linea = req.params.linea;
    const sentido = ((req.query.sentido as string) || 'IDA').toUpperCase();
    const agencyId = (req.query.agency_id as string) || '70';
    const dias = Math.min(30, Math.max(1, parseInt((req.query.dias as string) || '7', 10)));

    // Eventos GPS clasificados (no SIN_HORARIO) para esta línea en últimos N días
    const stats = await sqlDb('vehicle_events')
      .where('agency_id', agencyId)
      .where('linea', linea)
      .where('created_at', '>', sqlDb.raw(`NOW() - INTERVAL '${dias} days'`))
      .whereIn('estado_cumplimiento', ['EN_TIEMPO', 'ATRASADO', 'ADELANTADO'])
      .whereNotNull('proxima_parada')
      .select(
        'proxima_parada',
        sqlDb.raw('COUNT(*) AS muestras'),
        sqlDb.raw('AVG(desviacion_min) AS desv_media'),
        sqlDb.raw('STDDEV(desviacion_min) AS desv_std'),
        sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ATRASADO') AS atrasados"),
        sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'ADELANTADO') AS adelantados"),
        sqlDb.raw("COUNT(*) FILTER (WHERE estado_cumplimiento = 'EN_TIEMPO') AS en_tiempo"),
      )
      .groupBy('proxima_parada')
      .havingRaw('COUNT(*) >= 20') // mínimo 20 muestras para significancia
      .orderByRaw('ABS(AVG(desviacion_min)) DESC')
      .limit(50);

    const paradas = stats.map((s: any) => {
      const desvMedia = Number(s.desv_media ?? 0);
      const muestras = Number(s.muestras ?? 0);
      const atrasados = Number(s.atrasados ?? 0);
      const adelantados = Number(s.adelantados ?? 0);
      const enTiempo = Number(s.en_tiempo ?? 0);
      const desvAbs = Math.abs(desvMedia);
      let severidad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA' = 'BAJA';
      if (desvAbs >= 5) severidad = 'CRITICA';
      else if (desvAbs >= 3) severidad = 'ALTA';
      else if (desvAbs >= 2) severidad = 'MEDIA';
      return {
        parada: s.proxima_parada,
        muestras,
        desviacion_media_min: Number(desvMedia.toFixed(2)),
        desviacion_std_min: s.desv_std ? Number(Number(s.desv_std).toFixed(2)) : null,
        distribucion: { en_tiempo: enTiempo, atrasados, adelantados },
        pct_cumplimiento: Number(((enTiempo / muestras) * 100).toFixed(1)),
        severidad,
        sugerencia: desvMedia > 2 ? `Adelantar horario programado de esta parada en ${Math.round(desvAbs)} min (los buses llegan sistemáticamente tarde).`
          : desvMedia < -2 ? `Retrasar horario programado de esta parada en ${Math.round(desvAbs)} min (los buses llegan sistemáticamente temprano).`
          : 'Sin ajuste sugerido (desviación dentro de la tolerancia ±2 min).',
      };
    });

    const paradasProblematicas = paradas.filter((p) => p.severidad !== 'BAJA');

    res.json({
      ok: true,
      meta: { linea, sentido, agency_id: agencyId, dias_analizados: dias },
      total_paradas_analizadas: paradas.length,
      paradas_problematicas: paradasProblematicas.length,
      desglose_severidad: {
        CRITICA: paradas.filter((p) => p.severidad === 'CRITICA').length,
        ALTA: paradas.filter((p) => p.severidad === 'ALTA').length,
        MEDIA: paradas.filter((p) => p.severidad === 'MEDIA').length,
        BAJA: paradas.filter((p) => p.severidad === 'BAJA').length,
      },
      paradas,
      recomendacion_general: paradasProblematicas.length > 5
        ? 'CARTÓN REQUIERE AJUSTE: hay múltiples paradas con desviación sistemática. Recalibrar tiempos programados.'
        : paradasProblematicas.length > 0
        ? 'CARTÓN AJUSTAR PUNTUAL: paradas específicas con desviación.'
        : 'CARTÓN EN BUEN ESTADO: desviaciones dentro de tolerancia.',
    });
  } catch (err) {
    logger.error('[cartones/ajustes-sugeridos]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error en análisis de ajustes', detalle: String(err) });
  }
});

/**
 * GET /api/cartones/comparativa-etapas/:idBus?fecha=YYYY-MM-DD&agency_id=70
 *
 * Para un coche+fecha, devuelve la comparativa ETAPA POR ETAPA entre:
 *   - Tiempo comprometido por el cartón UCOT (paradas-etapas con horario)
 *   - Tiempo real GPS (cuándo el coche pasó cerca de cada parada-etapa)
 *
 * Auto-detecta qué viaje del cartón está activo en cada momento del día.
 *
 * El cartón UCOT tiene N viajes/día (típicamente 3-6). Cada viaje atraviesa
 * M paradas-etapas con su horario comprometido. Este endpoint muestra:
 *   - Cuál viaje del cartón corresponde a cada ventana de GPS observada
 *   - Por etapa: tiempo cartón | tiempo GPS real | desviación min
 *   - Acumulado de desviación por viaje
 *   - Resumen: % etapas cumplidas (±tolerancia min)
 *
 * IMPORTANTE: usa las paradas DEL CARTÓN, no todas las paradas GTFS. Esa es
 * la regla operativa correcta (el cartón define las etapas que cuentan).
 */
router.get('/comparativa-etapas/:idBus', async (req: Request, res: Response) => {
  try {
    const idBus = req.params.idBus;
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);
    const agencyId = (req.query.agency_id as string) || '70';
    const tolerancia = Math.max(1, parseInt((req.query.tolerancia as string) || '4', 10));

    // 1. Cartón asignado al coche
    const cartonRow = await sqlDb('cartones_completados')
      .where('agency_id', agencyId)
      .where('vehiculo_id', idBus)
      .whereRaw("COALESCE((data_jsonb ->> 'timestamp')::timestamptz::date, updated_at::date) = ?::date", [fecha])
      .first();
    if (!cartonRow) {
      res.json({
        ok: true,
        meta: { idBus, fecha, agency_id: agencyId, tolerancia_min: tolerancia },
        comparativa: {
          carton_asignado: false,
          mensaje: 'Sin cartón asignado para este coche. Antigravity debe cargarlo vía POST /api/cartones/bulk.',
        },
      });
      return;
    }

    const cartonData = (cartonRow.data_jsonb ?? {}) as Record<string, unknown>;
    const parsed = (cartonData.parsed ?? {}) as Record<string, unknown>;
    const paradas = (parsed.paradas as string[]) ?? [];
    const viajes = (parsed.viajes as unknown[][]) ?? [];

    // 2. Eventos GPS del coche en esa fecha
    const eventos = await sqlDb('vehicle_events')
      .where('id_bus', idBus)
      .where('agency_id', agencyId)
      .whereRaw(`DATE(created_at) = ?`, [fecha])
      .orderBy('timestamp_gps', 'asc')
      .select('lat', 'lon', 'velocidad', 'timestamp_gps', 'proxima_parada', 'estado_cumplimiento', 'desviacion_min')
      .limit(5000);

    // 3. Comparativa por viaje
    // Cada viaje del cartón es un array como ["08:28","08:48",...,"14"] donde
    // los HH:MM son tiempos de paso por etapas y los numeros sueltos son
    // duraciones de espera. Pareamos solo los HH:MM con paradas[].
    const hhmmRe = /^\d{1,2}:\d{2}$/;
    const viajesComparados = viajes.map((viaje, vIdx) => {
      const tiempos = viaje.filter((c) => typeof c === 'string' && hhmmRe.test(c as string)) as string[];
      // El número de tiempos define cuántas etapas tiene este viaje
      const etapasViaje = paradas.slice(0, tiempos.length);

      const etapas = tiempos.map((tCarton, eIdx) => {
        const paradaNombre = etapasViaje[eIdx] ?? `etapa_${eIdx + 1}`;
        // Buscar evento GPS cercano a esta hora en esta parada
        // Heurística: convertir tCarton a Date del día fecha
        const [hh, mm] = tCarton.split(':').map(Number);
        const tCartonMin = hh * 60 + mm;

        // Buscar evento más cercano: misma parada (string match aprox) y
        // tiempo más cercano (ventana ±60 min)
        let mejorEvento: any = null;
        let mejorDiff = Infinity;
        for (const e of eventos) {
          const ts = new Date(e.timestamp_gps);
          const eMin = ts.getHours() * 60 + ts.getMinutes();
          const diff = Math.abs(eMin - tCartonMin);
          if (diff > 60) continue; // fuera de ventana
          // match suave por nombre de parada
          const pNorm = String(paradaNombre).toLowerCase();
          const eNorm = String(e.proxima_parada ?? '').toLowerCase();
          const matchParada = eNorm && pNorm.length > 3 &&
            (eNorm.includes(pNorm.split(' ')[0]) || pNorm.includes(eNorm.split(' ')[0]));
          if (!matchParada && diff > 15) continue; // sin match parada, ventana más chica
          if (diff < mejorDiff) {
            mejorDiff = diff;
            mejorEvento = e;
          }
        }

        if (mejorEvento) {
          const tsReal = new Date(mejorEvento.timestamp_gps);
          const realHHMM = `${String(tsReal.getHours()).padStart(2, '0')}:${String(tsReal.getMinutes()).padStart(2, '0')}`;
          const realMin = tsReal.getHours() * 60 + tsReal.getMinutes();
          const desv = realMin - tCartonMin; // + = atrasado
          const clasificacion = Math.abs(desv) <= tolerancia ? 'EN_TIEMPO'
            : desv > 0 ? 'ATRASADO' : 'ADELANTADO';
          return {
            etapa: eIdx + 1,
            parada: paradaNombre,
            tiempo_carton: tCarton,
            tiempo_real_gps: realHHMM,
            desviacion_min: desv,
            clasificacion,
            parada_gps_real: mejorEvento.proxima_parada ?? null,
            velocidad_kmh: mejorEvento.velocidad ?? null,
          };
        }
        return {
          etapa: eIdx + 1,
          parada: paradaNombre,
          tiempo_carton: tCarton,
          tiempo_real_gps: null,
          desviacion_min: null,
          clasificacion: 'SIN_REGISTRO',
          parada_gps_real: null,
          velocidad_kmh: null,
        };
      });

      // Resumen del viaje
      const conRegistro = etapas.filter((e) => e.desviacion_min !== null);
      const enTiempo = conRegistro.filter((e) => e.clasificacion === 'EN_TIEMPO').length;
      const atrasadas = conRegistro.filter((e) => e.clasificacion === 'ATRASADO').length;
      const adelantadas = conRegistro.filter((e) => e.clasificacion === 'ADELANTADO').length;
      const desvAcum = conRegistro.reduce((s, e) => s + (e.desviacion_min ?? 0), 0);
      const desvMedia = conRegistro.length > 0 ? Number((desvAcum / conRegistro.length).toFixed(1)) : null;
      const pctCumplimiento = conRegistro.length > 0
        ? Number(((enTiempo / conRegistro.length) * 100).toFixed(1))
        : 0;

      return {
        viaje_numero: vIdx + 1,
        hora_inicio: tiempos[0] ?? null,
        hora_fin: tiempos[tiempos.length - 1] ?? null,
        total_etapas: etapas.length,
        etapas,
        resumen: {
          en_tiempo: enTiempo,
          atrasadas,
          adelantadas,
          sin_registro: etapas.length - conRegistro.length,
          desviacion_media_min: desvMedia,
          pct_cumplimiento: pctCumplimiento,
          alerta_acumulada: desvAcum > 15
            ? 'ATRASO ACUMULATIVO IMPORTANTE: revisar tramo crítico'
            : desvAcum < -15
            ? 'ADELANTO ACUMULATIVO: revisar si saltea paradas'
            : null,
        },
      };
    });

    // 4. Resumen del día
    const todasEtapas = viajesComparados.flatMap((v) => v.etapas);
    const totalConRegistro = todasEtapas.filter((e) => e.desviacion_min !== null);
    const totalEnTiempo = totalConRegistro.filter((e) => e.clasificacion === 'EN_TIEMPO').length;

    res.json({
      ok: true,
      meta: { idBus, fecha, agency_id: agencyId, tolerancia_min: tolerancia },
      carton: {
        id: cartonRow.id,
        servicio: cartonRow.service_number,
        linea: cartonRow.line,
        total_paradas: paradas.length,
        total_viajes: viajes.length,
      },
      operacion: {
        eventos_gps_totales: eventos.length,
        primer_ping: eventos[0]?.timestamp_gps ?? null,
        ultimo_ping: eventos[eventos.length - 1]?.timestamp_gps ?? null,
      },
      resumen_dia: {
        total_etapas_comprometidas: todasEtapas.length,
        etapas_con_registro_gps: totalConRegistro.length,
        etapas_en_tiempo: totalEnTiempo,
        pct_cumplimiento_global: totalConRegistro.length > 0
          ? Number(((totalEnTiempo / totalConRegistro.length) * 100).toFixed(1))
          : 0,
      },
      viajes: viajesComparados,
    });
  } catch (err) {
    logger.error('[cartones/comparativa-etapas]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error en comparativa por etapas', detalle: String(err) });
  }
});

/**
 * FASE 5.14 (2026-05-13)
 * GET /api/cartones/coches-en-servicio-hoy?agency=70
 *
 * Cruza `bus_last_pos` (coches con GPS activo en los ultimos 5 min) contra
 * `cartones_completados` (servicios asignados por Antigravity / scraping
 * portal UCOT) para producir la fotografia operativa del dia: qué coche
 * esta circulando, qué linea reporta el feed IMM, qué cartón le toca y si
 * coincide o si esta operando una linea distinta a la asignada.
 *
 * Regla de mapeo IMM <-> UCOT (validada por Jonathan 2026-05-13):
 *   - lineas con 3 digitos (>=100): mismo codigo en IMM y UCOT
 *   - lineas con 1-2 digitos: UCOT prefija con "3" (IMM 17 = UCOT 317)
 */
router.get('/coches-en-servicio-hoy', async (req: Request, res: Response) => {
  try {
    const agency = String((req.query.agency as string) || '70');
    // FASE 5.14: cache 15s — bus_last_pos refresca cada 10s y este endpoint
    // se llama desde el panel de operativa diaria cada 30s automáticamente.
    const cm = await import('../utils/responseCache');
    const cacheKey = `cartones:enservicio:${agency}`;
    const hit = cm.cacheGet<unknown>(cacheKey);
    if (hit) { res.json(hit); return; }
    const rows = await sqlDb('bus_last_pos as b')
      .leftJoin('cartones_completados as c', function () {
        this.on('c.agency_id', '=', 'b.agency_id')
          .andOn(sqlDb.raw("c.vehiculo_id = regexp_replace(b.id_bus, '^[0-9]+_', '')"))
          .andOn(sqlDb.raw("COALESCE((c.data_jsonb ->> 'timestamp')::timestamptz::date, c.updated_at::date) = b.updated_at::date"));
      })
      .where('b.agency_id', agency)
      .where('b.updated_at', '>', sqlDb.raw("NOW() - INTERVAL '5 minutes'"))
      .select(
        sqlDb.raw("regexp_replace(b.id_bus, '^[0-9]+_', '') AS coche"),
        'b.linea AS imm_linea',
        'b.velocidad',
        'b.estado_cumplimiento',
        'b.lat',
        'b.lon',
        'b.updated_at',
        'c.service_number',
        'c.line AS ucot_linea',
        'c.conductor_id',
      );

    const items = (rows as Array<{
      coche: string; imm_linea: string; velocidad: number; estado_cumplimiento: string;
      lat: number; lon: number; updated_at: string | Date;
      service_number: string | null; ucot_linea: string | null; conductor_id: string | null;
    }>).map((r) => {
      let estadoCruce: 'match_directo' | 'match_prefijo_ucot' | 'no_match' | 'sin_carton';
      if (!r.ucot_linea) estadoCruce = 'sin_carton';
      else if (r.ucot_linea === r.imm_linea) estadoCruce = 'match_directo';
      else if ('3' + r.imm_linea === r.ucot_linea) estadoCruce = 'match_prefijo_ucot';
      else estadoCruce = 'no_match';
      return {
        coche: r.coche,
        immLinea: r.imm_linea,
        ucotLinea: r.ucot_linea,
        servicio: r.service_number,
        conductorId: r.conductor_id,
        velocidad: r.velocidad,
        estadoCumplimiento: r.estado_cumplimiento,
        lat: r.lat,
        lon: r.lon,
        updatedAt: typeof r.updated_at === 'string' ? r.updated_at : r.updated_at.toISOString(),
        estadoCruce,
      };
    });

    // Resumen
    const resumen = items.reduce(
      (acc, it) => {
        acc.total++;
        acc[it.estadoCruce]++;
        return acc;
      },
      { total: 0, match_directo: 0, match_prefijo_ucot: 0, no_match: 0, sin_carton: 0 } as Record<string, number>,
    );

    const payload = {
      ok: true,
      agency,
      fuente: 'bus_last_pos (poller IMM stm-online 10s) ⋈ cartones_completados (Antigravity)',
      generadoEn: new Date().toISOString(),
      resumen,
      items: items.sort((a, b) => {
        const order = { no_match: 0, sin_carton: 1, match_prefijo_ucot: 2, match_directo: 3 } as Record<string, number>;
        return (order[a.estadoCruce] - order[b.estadoCruce]) || Number(a.coche) - Number(b.coche);
      }),
    };
    cm.cacheSet(cacheKey, payload, 15_000);
    res.json(payload);
  } catch (err) {
    logger.error('[cartones/coches-en-servicio-hoy]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error generando cruce', detalle: String(err) });
  }
});

/**
 * GET /api/cartones/comparacion/:coche?fecha=YYYY-MM-DD&agency_id=70
 *
 * Comparación de 3 columnas para un coche UCOT, usando el documento de
 * servicios YA estructurado (servicios_habiles/sabado) en vez del data_jsonb
 * crudo. Resuelve coche → nº de servicio (rotación scrapeada) → horarios por
 * etapa, y los cruza contra IMM-GTFS y las pasadas GPS reales. Marca las
 * diferencias y sugiere correcciones. UCOT-first (agency_id 70 por defecto).
 */
router.get('/comparacion/:coche', async (req: Request, res: Response) => {
  try {
    const coche = String(req.params.coche).trim();
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);
    const agencyId = (req.query.agency_id as string) || '70';
    if (!coche) {
      res.status(400).json({ ok: false, error: 'Falta :coche' });
      return;
    }
    const out = await compararServicioCoche(coche, fecha, agencyId);
    res.json(out);
  } catch (err) {
    logger.error('[cartones/comparacion]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error en comparación', detalle: String(err) });
  }
});

/**
 * GET /api/cartones/panel-cumplimiento?fecha=YYYY-MM-DD&agency_id=70
 *
 * PANEL DE COMANDO: escanea TODA la flota del día en UNA query (MV rápida)
 * y devuelve, RANQUEADO por severidad, lo que tiene problemas — sin que el
 * usuario tenga que buscar coche por coche. Cruza GPS (mv_fleet_ranking_
 * diario) ↔ cartón asignado (cartones_completados) con la política OTP
 * única ±4 min IMM. Clasifica cada coche:
 *   NO_SALIO     — tenía cartón asignado pero no hay GPS del día
 *   SIN_CARTON   — operó (GPS) pero sin servicio asignado scrapeado
 *   ATRASADO     — desvío medio vs IMM > +4 min
 *   ADELANTADO   — desvío medio vs IMM < -4 min
 *   BAJA_COBERTURA — mayoría de eventos SIN_HORARIO (no auditable)
 *   OK
 */
router.get('/panel-cumplimiento', async (req: Request, res: Response) => {
  try {
    const agencyId = (req.query.agency_id as string) || '70';
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);

    // GPS agregado del día por coche (MV rápida).
    const gps = (await sqlDb('mv_fleet_ranking_diario')
      .where('agency_id', agencyId)
      .whereRaw('fecha = ?::date', [fecha])
      .select(
        'id_bus',
        'total',
        'en_tiempo',
        'atrasado',
        'adelantado',
        'sin_horario',
        'desv_media_sum',
        'lineas',
        'ultima',
      )) as any[];

    // Cartón asignado del día por coche (rotación scrapeada).
    const cartones = (await sqlDb('cartones_completados')
      .where('agency_id', agencyId)
      .whereRaw("COALESCE((data_jsonb ->> 'timestamp')::timestamptz::date, updated_at::date) = ?::date", [fecha])
      .whereNotNull('vehiculo_id')
      .select('vehiculo_id', 'service_number', 'line')) as any[];

    // tipo de día para resolver la línea desde el documento estructurado
    // (fuente confiable; el visor PDF de UCOT hoy falla y deja line='?').
    const tipoDia = tipoDiaDeFecha(fecha);
    const cartonPorCoche = new Map<string, { servicio: string | null; linea: string | null }>();
    for (const c of cartones) {
      const servicio =
        c.service_number && /^\d+$/.test(String(c.service_number))
          ? String(c.service_number)
          : null;
      // Línea del cartón: 1º la scrapeada si vino válida; si no ('?'),
      // se deriva del nº de servicio vía servicios_*.json (real, no PDF).
      const lineaScrape = c.line && c.line !== '?' ? String(c.line) : null;
      cartonPorCoche.set(String(c.vehiculo_id), {
        servicio,
        linea: lineaScrape ?? lineaDeServicio(servicio, tipoDia),
      });
    }
    // Limpia el array de líneas observadas por GPS (IMM): saca vacíos,
    // '0', '?', duplicados y ordena — evita el "hasta 3 líneas erráticas".
    const limpiarLineas = (arr: unknown): string[] => {
      if (!Array.isArray(arr)) return [];
      const set = new Set<string>();
      for (const v of arr) {
        const s = String(v ?? '').trim();
        if (s && s !== '0' && s !== '?' && s.toLowerCase() !== 'null') set.add(s);
      }
      return [...set].sort();
    };
    const gpsPorCoche = new Map<string, (typeof gps)[number]>();
    for (const g of gps) gpsPorCoche.set(String(g.id_bus), g);

    type Estado = 'NO_SALIO' | 'SIN_CARTON' | 'ATRASADO' | 'ADELANTADO' | 'BAJA_COBERTURA' | 'OK';
    const SEV: Record<Estado, number> = {
      NO_SALIO: 5,
      ATRASADO: 4,
      BAJA_COBERTURA: 3,
      ADELANTADO: 2,
      SIN_CARTON: 1,
      OK: 0,
    };
    const filas: any[] = [];
    const coches = new Set<string>([...cartonPorCoche.keys(), ...gpsPorCoche.keys()]);

    for (const coche of coches) {
      const g = gpsPorCoche.get(coche);
      const c = cartonPorCoche.get(coche);
      const total = g ? Number(g.total) : 0;
      const et = g ? Number(g.en_tiempo) : 0;
      const at = g ? Number(g.atrasado) : 0;
      const ad = g ? Number(g.adelantado) : 0;
      const sh = g ? Number(g.sin_horario) : 0;
      const evaluables = et + at + ad;
      const desvMedio = g && g.desv_media_sum != null ? Math.round(Number(g.desv_media_sum) * 10) / 10 : null;
      const pctEnTiempo = evaluables > 0 ? Math.round((et / evaluables) * 100) : null;
      const coberturaPct = total > 0 ? Math.round((evaluables / total) * 100) : 0;

      let estado: Estado = 'OK';
      if (c && (!g || total < 30)) estado = 'NO_SALIO';
      else if (g && !c) estado = 'SIN_CARTON';
      else if (desvMedio != null && desvMedio > 4) estado = 'ATRASADO';
      else if (desvMedio != null && desvMedio < -4) estado = 'ADELANTADO';
      else if (total > 0 && coberturaPct < 40) estado = 'BAJA_COBERTURA';

      if (estado === 'OK') continue; // el panel SOLO lista problemas

      const lineaAsignada = c?.linea ?? null;
      const lineasObservadas = limpiarLineas(g?.lineas);
      filas.push({
        coche,
        servicioAsignado: c?.servicio ?? null,
        lineaAsignada,
        lineasObservadas,
        // backward-compat: la línea autoritativa es la del cartón; si no se
        // conoce, recién ahí se cae a lo observado por GPS (ya limpio).
        lineas: lineaAsignada ? [lineaAsignada] : lineasObservadas,
        estado,
        desvioMedioVsImmMin: desvMedio,
        pctEnTiempo,
        coberturaPct,
        eventosGps: total,
        ultimaActividad: g?.ultima ?? null,
        severidad: SEV[estado],
      });
    }

    filas.sort((a, b) => b.severidad - a.severidad || (b.desvioMedioVsImmMin ?? 0) - (a.desvioMedioVsImmMin ?? 0));

    const resumen = {
      flotaConDatos: coches.size,
      conProblemas: filas.length,
      noSalieron: filas.filter((f) => f.estado === 'NO_SALIO').length,
      atrasados: filas.filter((f) => f.estado === 'ATRASADO').length,
      adelantados: filas.filter((f) => f.estado === 'ADELANTADO').length,
      sinCarton: filas.filter((f) => f.estado === 'SIN_CARTON').length,
      bajaCobertura: filas.filter((f) => f.estado === 'BAJA_COBERTURA').length,
    };

    res.json({ ok: true, fecha, agencyId, politicaOtp: '±4 min (IMM)', resumen, problemas: filas });
  } catch (err) {
    logger.error('[cartones/panel-cumplimiento]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * POST /api/cartones/historial/snapshot — fuerza un snapshot del historial
 * coche→servicio del día (idempotente). Normalmente lo corre el scheduler.
 */
router.post('/historial/snapshot', async (req: Request, res: Response) => {
  try {
    const agencyId = (req.query.agency_id as string) || '70';
    const n = await snapshotHistorial(agencyId);
    res.json({ ok: true, insertadas: n });
  } catch (err) {
    logger.error('[cartones/historial/snapshot]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * GET /api/cartones/distribucion/:coche?agency_id=70
 * Qué servicios suele realizar el coche y cómo le va en cada uno
 * (frecuencia en el historial + desvío medio vs IMM de ese coche los días
 * que hizo ese servicio, del motor de cumplimiento ya validado).
 */
router.get('/distribucion/:coche', async (req: Request, res: Response) => {
  try {
    const coche = String(req.params.coche).trim();
    const agencyId = (req.query.agency_id as string) || '70';
    const dist = await sqlDb.raw(
      `WITH h AS (
         SELECT service_number, line, tipo_dia, fecha
           FROM cartones_historial
          WHERE agency_id = ? AND vehiculo_id = ? AND service_number IS NOT NULL
       ),
       perf AS (
         SELECT h.service_number,
                round(avg(ve.dm)::numeric, 1)  AS desvio_medio,
                count(DISTINCT h.fecha)         AS dias
           FROM h
           LEFT JOIN LATERAL (
             SELECT avg(desviacion_min) dm
               FROM vehicle_events
              WHERE agency_id = ?
                AND id_bus IN (?, ? || '_' || ?)
                AND timestamp_gps >= h.fecha
                AND timestamp_gps <  (h.fecha + interval '1 day')
                AND desviacion_min IS NOT NULL
           ) ve ON true
          GROUP BY h.service_number
       )
       SELECT h.service_number AS servicio,
              max(h.line)      AS linea,
              max(h.tipo_dia)  AS tipo_dia,
              count(DISTINCT h.fecha) AS veces,
              min(h.fecha)     AS primera_fecha,
              max(h.fecha)     AS ultima_fecha,
              p.desvio_medio   AS desvio_medio_vs_imm_min
         FROM h
         LEFT JOIN perf p ON p.service_number = h.service_number
        GROUP BY h.service_number, p.desvio_medio
        ORDER BY veces DESC, servicio`,
      [agencyId, coche, agencyId, coche, agencyId, coche],
    );
    const filas = (dist.rows ?? dist) as any[];
    res.json({
      ok: true,
      coche,
      agencyId,
      serviciosDistintos: filas.length,
      servicios: filas,
    });
  } catch (err) {
    logger.error('[cartones/distribucion]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * GET /api/cartones/sustituciones?fecha=YYYY-MM-DD&agency_id=70
 * Coches que tenían servicio asignado pero NO salieron, y qué coche
 * (no asignado a esa línea) operó esa línea en su lugar.
 */
router.get('/sustituciones', async (req: Request, res: Response) => {
  try {
    const agencyId = (req.query.agency_id as string) || '70';
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);

    // Esperados: del historial del día (fallback: cartones_completados).
    let esperados = (await sqlDb('cartones_historial')
      .where({ agency_id: agencyId, fecha })
      .whereNotNull('service_number')
      .select('vehiculo_id', 'service_number', 'line')) as any[];
    if (esperados.length === 0) {
      esperados = (await sqlDb('cartones_completados')
        .where('agency_id', agencyId)
        .whereRaw("COALESCE((data_jsonb ->> 'timestamp')::timestamptz::date, updated_at::date) = ?::date", [fecha])
        .whereNotNull('vehiculo_id')
        .select('vehiculo_id', 'service_number', { line: 'line' })) as any[];
    }

    // Operación real del día: coche → líneas y nº de puntos GPS.
    const ops = (await sqlDb('vehicle_events')
      .where('agency_id', agencyId)
      .whereRaw("timestamp_gps >= ? AND timestamp_gps < (?::date + interval '1 day')", [fecha, fecha])
      .select('id_bus', 'linea')
      .count('* as pts')
      .groupBy('id_bus', 'linea')) as any[];

    const operoPorCoche = new Map<string, { lineas: Set<string>; pts: number }>();
    for (const o of ops) {
      const coche = String(o.id_bus).replace(new RegExp(`^${agencyId}_`), '');
      const e = operoPorCoche.get(coche) ?? { lineas: new Set<string>(), pts: 0 };
      if (o.linea) e.lineas.add(String(o.linea));
      e.pts += Number(o.pts);
      operoPorCoche.set(coche, e);
    }
    const UMBRAL_PTS = 50; // actividad mínima para considerar "salió"
    const salio = (coche: string) => (operoPorCoche.get(coche)?.pts ?? 0) >= UMBRAL_PTS;

    const noSalieron: any[] = [];
    for (const e of esperados) {
      const coche = String(e.vehiculo_id);
      if (salio(coche)) continue;
      const linea = e.line && e.line !== '?' ? String(e.line) : null;
      // Sustituto: coche que SÍ operó esa línea y no era el esperado en ella.
      // mismaLinea() aplica la equivalencia IMM↔UCOT: el cartón puede decir
      // "317" (interno UCOT) y el GPS "17" (IMM) — es la MISMA línea. Antes
      // se comparaba por igualdad cruda y se perdían estos cruces.
      const esperadosEnLinea = new Set(
        esperados.filter((x) => mismaLinea(String(x.line), linea)).map((x) => String(x.vehiculo_id)),
      );
      const sustitutos: string[] = [];
      if (linea) {
        for (const [c, info] of operoPorCoche) {
          const operoEsaLinea = [...info.lineas].some((l) => mismaLinea(l, linea));
          if (info.pts >= UMBRAL_PTS && operoEsaLinea && !esperadosEnLinea.has(c)) {
            sustitutos.push(c);
          }
        }
      }
      noSalieron.push({
        coche,
        servicioAsignado: e.service_number,
        linea,
        ptsGps: operoPorCoche.get(coche)?.pts ?? 0,
        posiblesSustitutos: sustitutos.slice(0, 5),
      });
    }

    res.json({
      ok: true,
      fecha,
      agencyId,
      esperados: esperados.length,
      noSalieron: noSalieron.length,
      detalle: noSalieron.sort((a, b) => (b.posiblesSustitutos.length - a.posiblesSustitutos.length)),
    });
  } catch (err) {
    logger.error('[cartones/sustituciones]', { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
