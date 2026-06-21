"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * comando.routes.ts (FASE 5.18) — Inteligencia del Centro de Comando.
 *
 * Endpoints que convierten el sistema de descriptivo (muestra datos) a
 * PRESCRIPTIVO (recomienda acciones) y PREDICTIVO (proyecta). Es el
 * diferencial que el centro de comando marcó como ausente.
 */
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const logger_1 = __importDefault(require("../config/logger"));
const recomendacionesService_1 = require("../services/recomendacionesService");
const proyeccionService_1 = require("../services/proyeccionService");
const simuladorService_1 = require("../services/simuladorService");
const diagnosticoLineaService_1 = require("../services/diagnosticoLineaService");
const fugaParadasService_1 = require("../services/fugaParadasService");
const database_1 = __importDefault(require("../config/database"));
const router = (0, express_1.Router)();
router.use(auth_1.verifyAuth);
/**
 * GET /api/comando/frecuencias-gtfs
 * Frecuencia PROGRAMADA (headway, min) por línea, derivada del GTFS oficial
 * IMM (gtfs.stop_times en la 1ª parada de cada trip). Reemplaza el inexistente
 * `horarios_stm` del que dependía "Espacio entre buses" (daba todo NO_MEDIBLE).
 * Cacheada en proceso (el GTFS cambia ~mensual).
 */
let _frecCache = null;
router.get('/frecuencias-gtfs', async (_req, res) => {
    try {
        if (_frecCache && Date.now() - _frecCache.at < 6 * 3600000) {
            res.json({ ok: true, fuente: 'GTFS IMM (cache)', frecuencias: _frecCache.data });
            return;
        }
        // headway por (línea, sentido) = span de salidas / (nº trips - 1);
        // la frecuencia de la línea = el menor de ambos sentidos (servicio efectivo).
        const q = await database_1.default.raw(`WITH agg AS (
         SELECT r.route_short_name AS linea, t.direction_id AS dir,
                COUNT(*) AS trips,
                EXTRACT(EPOCH FROM (MAX(st.arrival_time::interval) - MIN(st.arrival_time::interval)))/60.0 AS span_min
           FROM gtfs.routes r
           JOIN gtfs.trips t ON t.route_id = r.route_id
           JOIN gtfs.stop_times st ON st.trip_id = t.trip_id AND st.stop_sequence = 1
          GROUP BY r.route_short_name, t.direction_id
       )
       SELECT linea,
              MIN(CASE WHEN trips > 1 THEN round((span_min/(trips-1))::numeric,1) END) AS headway_min
         FROM agg
        GROUP BY linea`);
        const rows = (q.rows ?? q);
        const data = {};
        for (const r of rows) {
            const h = Number(r.headway_min);
            if (r.linea && h > 0 && h <= 180)
                data[String(r.linea)] = h;
        }
        _frecCache = { at: Date.now(), data };
        res.json({ ok: true, fuente: 'GTFS oficial IMM (gtfs.stop_times)', total: Object.keys(data).length, frecuencias: data });
    }
    catch (err) {
        logger_1.default.error('[comando/frecuencias-gtfs]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/comando/demanda-real?mes=YYYY-MM-01&op=&limit=
 * Demanda REAL por línea/variante con PASAJEROS (no solo validaciones).
 * Fuente: stm_demanda_mensual (documento STM aprovechado completo).
 */
router.get('/demanda-real', async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 500);
        // Lee de la MV agregada (141 filas) — agregar sobre stm_demanda_mensual
        // (6.9M filas) en vivo agotaba el statement_timeout. Patrón ya usado.
        const mesRow = (await (0, database_1.default)('mv_stm_demanda_linea').max('mes as m').first());
        if (!mesRow?.m) {
            res.json({ ok: true, mes: null, nota: 'Aún sin ingesta enriquecida.', lineas: [] });
            return;
        }
        const mes = req.query.mes || mesRow.m;
        let q = (0, database_1.default)('mv_stm_demanda_linea')
            .where('mes', mes)
            .select('cod_empresa', 'dsc_linea', 'pasajeros', 'validaciones', 'variantes')
            .orderBy('pasajeros', 'desc')
            .limit(limit);
        if (req.query.op)
            q = q.where('cod_empresa', Number(req.query.op));
        const rows = await q;
        res.json({ ok: true, mes, fuente: 'STM oficial (pasajeros reales)', total: rows.length, lineas: rows });
    }
    catch (err) {
        logger_1.default.error('[comando/demanda-real]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/comando/od?mes=&linea=&limit=
 * Matriz Origen-Destino / transbordos REAL derivada del STM (id_viaje).
 * Qué línea alimenta a qué línea — insumo de red que ningún operador tiene.
 */
router.get('/od', async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 40, 300);
        const mesRow = (await (0, database_1.default)('stm_transbordos_mensual').max('mes as m').first());
        if (!mesRow?.m) {
            res.json({ ok: true, mes: null, nota: 'Aún sin ingesta enriquecida (OD).', pares: [] });
            return;
        }
        const mes = req.query.mes || mesRow.m;
        let q = (0, database_1.default)('stm_transbordos_mensual')
            .where('mes', mes)
            .select('linea_origen', 'linea_destino', 'cod_empresa_o', 'cod_empresa_d')
            .sum({ transbordos: 'transbordos' })
            .groupBy('linea_origen', 'linea_destino', 'cod_empresa_o', 'cod_empresa_d')
            .orderBy('transbordos', 'desc')
            .limit(limit);
        if (req.query.linea) {
            const l = String(req.query.linea);
            q = q.where((b) => b.where('linea_origen', l).orWhere('linea_destino', l));
        }
        const rows = await q;
        const crossOp = rows.filter((r) => r.cod_empresa_o && r.cod_empresa_d && r.cod_empresa_o !== r.cod_empresa_d).length;
        res.json({
            ok: true,
            mes,
            fuente: 'STM oficial — cadena de id_viaje (matriz OD real)',
            total: rows.length,
            paresCrossOperador: crossOp,
            pares: rows,
        });
    }
    catch (err) {
        logger_1.default.error('[comando/od]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/comando/recomendaciones?fecha=YYYY-MM-DD
 * Acciones concretas ranqueadas (por operador + globales cross-operador),
 * con evidencia real. NO interpreta el usuario: el sistema recomienda.
 */
router.get('/recomendaciones', async (req, res) => {
    try {
        const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
        const ops = (req.query.operadores || '70,50,20,10')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        const out = await (0, recomendacionesService_1.generarRecomendaciones)(fecha, ops);
        res.json(out);
    }
    catch (err) {
        logger_1.default.error('[comando/recomendaciones]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/comando/shape-linea/:linea
 * Geometría REAL de la línea: el shape GTFS oficial IMM más denso de esa
 * route_short_name, como array ordenado [lat,lon]. Reemplaza trazados
 * dibujados a mano (que pasaban sobre edificios / terminaban en la playa).
 */
router.get('/shape-linea/:linea', async (req, res) => {
    try {
        const linea = String(req.params.linea).trim();
        const q = await database_1.default.raw(`WITH best AS (
         SELECT t.shape_id, COUNT(*) AS pts
           FROM gtfs.trips t
           JOIN gtfs.routes r ON r.route_id = t.route_id
          WHERE r.route_short_name = ? AND t.shape_id IS NOT NULL
          GROUP BY t.shape_id
          ORDER BY pts DESC
          LIMIT 1
       )
       SELECT s.shape_pt_lat AS lat, s.shape_pt_lon AS lon
         FROM gtfs.shapes s
         JOIN best b ON b.shape_id = s.shape_id
        ORDER BY s.shape_pt_sequence`, [linea]);
        const rows = (q.rows ?? q);
        const puntos = rows
            .map((r) => [Number(r.lat), Number(r.lon)])
            .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
        res.json({ ok: true, linea, fuente: 'GTFS oficial IMM (gtfs.shapes)', puntos });
    }
    catch (err) {
        logger_1.default.error('[comando/shape-linea]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/comando/fuga-paradas?op=70
 * Análisis primario A NIVEL PARADA (sin cartón): por línea, interanual y
 * por día hábil, las paradas donde el operador perdió pasaje y qué línea de
 * OTRO operador creció en esa MISMA parada (con calle/coords gtfs.stops).
 */
router.get('/fuga-paradas', async (req, res) => {
    try {
        const op = String(req.query.op || '70').trim();
        res.json(await (0, fugaParadasService_1.generarFugaParadas)(op));
    }
    catch (err) {
        logger_1.default.error('[comando/fuga-paradas]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/comando/diagnostico-linea?op=70
 * INFORME ACCIONABLE línea por línea (cliente #1 UCOT): venta de boletos
 * precisa mes a mes, competidor real con su horario, servicio/cartón que
 * cubre la línea y recomendación concreta. Redactado para decisor no técnico.
 */
router.get('/diagnostico-linea', async (req, res) => {
    try {
        const op = String(req.query.op || '70').trim();
        const out = await (0, diagnosticoLineaService_1.generarDiagnosticoLineas)(op);
        res.json(out);
    }
    catch (err) {
        logger_1.default.error('[comando/diagnostico-linea]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/comando/proyeccion?fecha=YYYY-MM-DD&agency_id=70
 * Pronóstico de demanda por línea/franja para la fecha objetivo, con
 * tendencia mes a mes y acciones anticipadas. Predictivo, no defensivo.
 */
router.get('/proyeccion', async (req, res) => {
    try {
        const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const fecha = req.query.fecha || manana;
        const agencyId = req.query.agency_id || undefined;
        const out = await (0, proyeccionService_1.proyectarDemanda)(fecha, agencyId);
        res.json(out);
    }
    catch (err) {
        logger_1.default.error('[comando/proyeccion]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/comando/simulador?linea=&tipo_dia=&op=&deltaVehiculosPct=
 *     &headwayObjetivoMin=&capacidadBus=
 * Estimador de impacto transparente: baseline real (demanda STM + oferta
 * GPS) vs escenario, con fórmulas declaradas. NO es un modelo de red.
 */
router.get('/simulador', async (req, res) => {
    try {
        const linea = String(req.query.linea || '').trim();
        if (!linea) {
            res.status(400).json({ ok: false, error: 'Falta query param: linea' });
            return;
        }
        const tipoDia = ['habil', 'sabado', 'festivo'].includes(req.query.tipo_dia)
            ? req.query.tipo_dia
            : 'habil';
        const esc = {
            deltaVehiculosPct: req.query.deltaVehiculosPct != null ? Number(req.query.deltaVehiculosPct) : undefined,
            headwayObjetivoMin: req.query.headwayObjetivoMin != null ? Number(req.query.headwayObjetivoMin) : undefined,
            capacidadBus: req.query.capacidadBus != null ? Number(req.query.capacidadBus) : undefined,
        };
        const out = await (0, simuladorService_1.simularEscenarioLinea)(linea, tipoDia, esc, req.query.op ? String(req.query.op) : undefined);
        res.json(out);
    }
    catch (err) {
        logger_1.default.error('[comando/simulador]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/comando/trafico-linea/:linea
 * Causalidad de atraso: cruza la velocidad comercial REAL (sensores IMM a
 * ≤150 m del recorrido GTFS real de la línea) por hora y clasifica si el
 * atraso esperado es EXÓGENO (tráfico/congestión, no culpa del operador)
 * u OPERATIVO. Activa el dato de velocidad (antes ingerido sin usar) y da
 * la narrativa defendible ante IMM ("llegó tarde por tráfico, no por mala
 * operación").
 */
router.get('/trafico-linea/:linea', async (req, res) => {
    try {
        const linea = String(req.params.linea).trim();
        const sensores = (await (0, database_1.default)('sensor_linea_prox')
            .where('linea', linea)
            .select('cod_detector'));
        if (sensores.length === 0) {
            res.json({
                ok: true,
                linea,
                nota: 'Sin sensores de velocidad a ≤150 m del recorrido de esta línea.',
                horas: [],
            });
            return;
        }
        const dets = sensores.map((s) => s.cod_detector);
        const filas = (await (0, database_1.default)('velocidad_vehicular')
            .whereIn('cod_detector', dets)
            .select('hora')
            .avg({ vel_prom: 'velocidad_prom' })
            .min({ vel_min: 'velocidad_min' })
            .sum({ muestras: 'muestras' })
            .groupBy('hora')
            .orderBy('hora'));
        const vals = filas.map((f) => Number(f.vel_prom)).filter((v) => v > 0);
        const tipica = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        const horas = filas.map((f) => {
            const vp = Math.round(Number(f.vel_prom) * 10) / 10;
            // Congestión = velocidad de la franja sensiblemente bajo la típica.
            const ratio = tipica > 0 ? vp / tipica : 1;
            const estado = ratio < 0.6 ? 'CONGESTION_SEVERA' : ratio < 0.8 ? 'CONGESTION' : 'FLUIDO';
            return {
                hora: f.hora,
                velPromKmh: vp,
                velMinKmh: Math.round(Number(f.vel_min) * 10) / 10,
                muestras: Number(f.muestras),
                estado,
                causaAtraso: estado === 'FLUIDO'
                    ? 'OPERATIVO'
                    : 'EXOGENO',
            };
        });
        const congest = horas.filter((h) => h.estado !== 'FLUIDO');
        const veredicto = congest.length === 0
            ? `Línea ${linea}: la velocidad comercial es fluida en todas las franjas — un atraso aquí es de causa OPERATIVA (gestionable por el operador).`
            : `Línea ${linea}: ${congest.length} franja(s) con congestión real (velocidad comercial cae a ~${Math.min(...congest.map((h) => h.velPromKmh))} km/h vs típica ${Math.round(tipica * 10) / 10}). El atraso en esas franjas es de origen EXÓGENO (tráfico), no operativo — defendible ante IMM.`;
        res.json({
            ok: true,
            linea,
            sensores: dets.length,
            velocidadTipicaKmh: Math.round(tipica * 10) / 10,
            fuente: 'Velocidad comercial IMM (sensores ≤150 m del recorrido GTFS real)',
            veredicto,
            horas,
        });
    }
    catch (err) {
        logger_1.default.error('[comando/trafico-linea]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
exports.default = router;
