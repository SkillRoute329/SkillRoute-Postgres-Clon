"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * stmDemanda.routes.ts — Consultas sobre validaciones STM oficiales IMM.
 *
 * FASE 5.15 (2026-05-14): expone los datos agregados de
 * stm_validaciones_mensual para que el frontend pueda mostrar demanda
 * real (millones de validaciones reales del IMM) y compararla con la
 * actividad GPS del clon.
 *
 * Endpoints:
 *   GET /api/stm-demanda/meses                  — meses ingestados
 *   GET /api/stm-demanda/operadores?mes=YYYY-MM — share por operador
 *   GET /api/stm-demanda/lineas/:op?mes=YYYY-MM&limit=20  — top líneas
 *   GET /api/stm-demanda/linea/:op/:linea       — evolución 6 meses
 *   GET /api/stm-demanda/parada/:codParada      — quién carga esa parada
 *   GET /api/stm-demanda/hora-dow/:op?mes=...   — matriz hora×dow
 */
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const responseCache_1 = require("../utils/responseCache");
const router = (0, express_1.Router)();
router.use(auth_1.verifyAuth);
const OPERADOR_NOMBRE = {
    '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT',
};
/** GET /api/stm-demanda/meses */
router.get('/meses', async (_req, res) => {
    try {
        const payload = await (0, responseCache_1.cached)('stm-demanda:meses', 60000, async () => {
            const rows = await (0, database_1.default)('stm_validaciones_ingestados')
                .select('mes', 'archivo', 'filas_origen', 'filas_agregadas', 'ingested_at')
                .orderBy('mes', 'desc');
            return { ok: true, total: rows.length, meses: rows };
        });
        res.json(payload);
    }
    catch (err) {
        logger_1.default.error('[stm-demanda/meses]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/stm-demanda/operadores?mes=YYYY-MM
 * Share de mercado mensual por operador.
 */
router.get('/operadores', async (req, res) => {
    try {
        const mesParam = String(req.query.mes || '');
        const cacheKey = `stm-demanda:ops:${mesParam}`;
        const payload = await (0, responseCache_1.cached)(cacheKey, 60000, async () => {
            // FASE 5.15: MV mv_stm_operador_mes (24 filas) → instantáneo.
            let q = (0, database_1.default)('mv_stm_operador_mes')
                .select('mes', 'cod_empresa')
                .sum({ total: 'validaciones' })
                .groupBy('mes', 'cod_empresa')
                .orderBy('mes');
            if (mesParam)
                q = q.where('mes', mesParam + '-01');
            const rows = await q;
            const out = rows.map((r) => ({
                mes: r.mes,
                codEmpresa: Number(r.cod_empresa),
                operador: OPERADOR_NOMBRE[String(r.cod_empresa)] ?? String(r.cod_empresa),
                validaciones: Number(r.total),
            }));
            return { ok: true, total: out.length, items: out };
        });
        res.json(payload);
    }
    catch (err) {
        logger_1.default.error('[stm-demanda/operadores]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/stm-demanda/lineas/:op?mes=YYYY-MM&limit=20
 * Top N líneas de un operador en un mes.
 */
router.get('/lineas/:op', async (req, res) => {
    try {
        const op = String(req.params.op);
        const mes = String(req.query.mes || '');
        const limit = Math.min(200, Math.max(5, parseInt(req.query.limit || '20', 10)));
        const cacheKey = `stm-demanda:lineas:${op}:${mes}:${limit}`;
        const payload = await (0, responseCache_1.cached)(cacheKey, 60000, async () => {
            // FASE 5.15: MV mv_stm_linea_resumen (109k filas) → rápido.
            let q = (0, database_1.default)('mv_stm_linea_resumen')
                .select('dsc_linea')
                .sum({ total: 'validaciones' })
                .where('cod_empresa', op)
                .groupBy('dsc_linea')
                .orderBy('total', 'desc')
                .limit(limit);
            if (mes)
                q = q.where('mes', mes + '-01');
            const rows = await q;
            return {
                ok: true,
                operador: OPERADOR_NOMBRE[op] ?? op,
                mes: mes || null,
                items: rows.map((r) => ({ linea: r.dsc_linea, validaciones: Number(r.total) })),
            };
        });
        res.json(payload);
    }
    catch (err) {
        logger_1.default.error('[stm-demanda/lineas]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/stm-demanda/linea/:op/:linea
 * Evolución mensual de UNA línea + perfil hora×dow agregado.
 */
router.get('/linea/:op/:linea', async (req, res) => {
    try {
        const op = String(req.params.op);
        const linea = String(req.params.linea);
        const cacheKey = `stm-demanda:linea:${op}:${linea}`;
        const payload = await (0, responseCache_1.cached)(cacheKey, 60000, async () => {
            // FASE 5.15: usar MV mv_stm_linea_resumen (109k filas) en vez de la
            // tabla cruda (33M filas). Baja de 40s a <300ms.
            const evol = await (0, database_1.default)('mv_stm_linea_resumen')
                .select('mes')
                .sum({ total: 'validaciones' })
                .where({ cod_empresa: op, dsc_linea: linea })
                .groupBy('mes')
                .orderBy('mes');
            const horaDow = await (0, database_1.default)('mv_stm_linea_resumen')
                .select('hora', 'dow')
                .sum({ total: 'validaciones' })
                .where({ cod_empresa: op, dsc_linea: linea })
                .groupBy('hora', 'dow');
            return {
                ok: true,
                operador: OPERADOR_NOMBRE[op] ?? op,
                linea,
                evolucionMensual: evol.map((r) => ({ mes: r.mes, validaciones: Number(r.total) })),
                horaDow: horaDow.map((r) => ({ hora: Number(r.hora), dow: Number(r.dow), validaciones: Number(r.total) })),
            };
        });
        res.json(payload);
    }
    catch (err) {
        logger_1.default.error('[stm-demanda/linea]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/stm-demanda/parada/:codParada
 * Quién carga esa parada por operador en cada mes. CLAVE para detectar
 * dónde un competidor está creciendo a costa de UCOT.
 */
router.get('/parada/:codParada', async (req, res) => {
    try {
        const codParada = String(req.params.codParada);
        const cacheKey = `stm-demanda:parada:${codParada}`;
        const payload = await (0, responseCache_1.cached)(cacheKey, 60000, async () => {
            const rows = await (0, database_1.default)('stm_validaciones_mensual')
                .select('mes', 'cod_empresa')
                .sum({ total: 'validaciones' })
                .where('codigo_parada', codParada)
                .groupBy('mes', 'cod_empresa')
                .orderBy('mes');
            return {
                ok: true,
                codigoParada: codParada,
                items: rows.map((r) => ({
                    mes: r.mes,
                    codEmpresa: Number(r.cod_empresa),
                    operador: OPERADOR_NOMBRE[String(r.cod_empresa)] ?? String(r.cod_empresa),
                    validaciones: Number(r.total),
                })),
            };
        });
        res.json(payload);
    }
    catch (err) {
        logger_1.default.error('[stm-demanda/parada]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * GET /api/stm-demanda/hora-dow/:op?mes=YYYY-MM
 * Matriz hora×dow para un operador → mapa de calor de demanda.
 */
router.get('/hora-dow/:op', async (req, res) => {
    try {
        const op = String(req.params.op);
        const mes = String(req.query.mes || '');
        const cacheKey = `stm-demanda:hora-dow:${op}:${mes}`;
        const payload = await (0, responseCache_1.cached)(cacheKey, 60000, async () => {
            // FASE 5.15: MV (mes,op,linea,hora,dow) sirve también para op-global.
            let q = (0, database_1.default)('mv_stm_linea_resumen')
                .select('hora', 'dow')
                .sum({ total: 'validaciones' })
                .where('cod_empresa', op)
                .groupBy('hora', 'dow');
            if (mes)
                q = q.where('mes', mes + '-01');
            const rows = await q;
            return {
                ok: true,
                operador: OPERADOR_NOMBRE[op] ?? op,
                mes: mes || null,
                items: rows.map((r) => ({ hora: Number(r.hora), dow: Number(r.dow), validaciones: Number(r.total) })),
            };
        });
        res.json(payload);
    }
    catch (err) {
        logger_1.default.error('[stm-demanda/hora-dow]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * FASE 5.15 — Nivel 2: Load factor.
 * GET /api/stm-demanda/load-factor/:op/:linea?mes=YYYY-MM
 * Cruza demanda STM (validaciones por parada-hora) con pasadas GPS reales
 * (vehicle_events.proxima_parada) para producir un proxy del "pasajeros por
 * pasada de bus". Métrica que combina los dos lados.
 *
 * Fórmula:
 *   validaciones_mes / pasadas_GPS_mes  ≈ pasajeros promedio por pasada.
 *
 * Granularidad: por parada+hora. Devuelve top paradas más cargadas.
 */
router.get('/load-factor/:op/:linea', async (req, res) => {
    try {
        const op = String(req.params.op);
        const linea = String(req.params.linea);
        const mes = String(req.query.mes || '');
        const limit = Math.min(100, Math.max(5, parseInt(req.query.limit || '30', 10)));
        const cacheKey = `stm-demanda:lf:${op}:${linea}:${mes}:${limit}`;
        const payload = await (0, responseCache_1.cached)(cacheKey, 60000, async () => {
            // STM por parada+hora
            let q = (0, database_1.default)('stm_validaciones_mensual')
                .select('codigo_parada', 'hora')
                .sum({ total: 'validaciones' })
                .where({ cod_empresa: op, dsc_linea: linea })
                .whereNotNull('codigo_parada')
                .groupBy('codigo_parada', 'hora');
            if (mes)
                q = q.where('mes', mes + '-01');
            const stmRows = await q;
            // GPS por parada (proxima_parada string)+hora, último mes en vehicle_events
            const days = mes ? 30 : 30;
            // FASE 5.17 (auditoría comando unificado): el dataset STM usa códigos
            // IMM ("17"); el GPS de UCOT registra las líneas cortas con prefijo
            // "3" ("317"). Sin esto toda línea UCOT de 1-2 dígitos cruzaba 0
            // pasadas GPS. Se acepta la línea IMM y su variante "3"+linea (misma
            // regla ya validada en cartones.routes.ts).
            const lineasGps = String(op) === '70' && /^\d{1,2}$/.test(String(linea))
                ? [String(linea), `3${linea}`]
                : [String(linea)];
            const gpsRows = await (0, database_1.default)('vehicle_events')
                .select('proxima_parada', database_1.default.raw('EXTRACT(HOUR FROM created_at)::int AS hora'), database_1.default.raw('COUNT(*) AS pasadas'))
                .where('agency_id', op)
                .whereIn('linea', lineasGps)
                .whereNotNull('proxima_parada')
                .where('created_at', '>', database_1.default.raw(`NOW() - INTERVAL '${days} days'`))
                .groupBy('proxima_parada', database_1.default.raw('EXTRACT(HOUR FROM created_at)'));
            return {
                ok: true,
                operador: OPERADOR_NOMBRE[op] ?? op,
                linea,
                mes: mes || null,
                nota: 'STM por codigo_parada numérico; GPS por proxima_parada (nombre). El cruce requiere mapeo stop_id→nombre del schedule_index — por ahora reportamos ambos lados por hora.',
                validacionesPorParadaHora: stmRows.slice(0, limit).map((r) => ({
                    codigoParada: r.codigo_parada,
                    hora: Number(r.hora),
                    validaciones: Number(r.total),
                })),
                pasadasGpsPorParadaHora: gpsRows
                    .slice(0, limit)
                    .map((r) => ({
                    proximaParada: r.proxima_parada,
                    hora: Number(r.hora),
                    pasadasGps: Number(r.pasadas),
                })),
            };
        });
        res.json(payload);
    }
    catch (err) {
        logger_1.default.error('[stm-demanda/load-factor]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * FASE 5.15 (2026-05-14) — mapa global de paradas con composición por
 * operador. Devuelve las top N paradas del mes con desglose UCOT /
 * CUTCSA / COETC / COME y coordenadas. Permite identificar visualmente
 * "corredores en disputa" (paradas con presencia balanceada de varios
 * operadores) vs "monopolios" (una parada con un operador dominante).
 *
 * Query params:
 *   mes=YYYY-MM         (default: último ingestado)
 *   top=N               (default 500; máx 2000 — performance del front)
 *   minViajes=N         (default 100; filtra paradas muy chicas)
 *   conUcot=true|false  (filtro: solo paradas donde UCOT participa)
 */
router.get('/mapa-global', async (req, res) => {
    try {
        const mes = String(req.query.mes || '');
        const top = Math.min(2000, Math.max(20, parseInt(req.query.top || '500', 10)));
        const minViajes = Math.max(0, parseInt(req.query.minViajes || '100', 10));
        const conUcot = String(req.query.conUcot || '').toLowerCase() === 'true';
        const cacheKey = `stm-demanda:mapa-global:${mes}:${top}:${minViajes}:${conUcot}`;
        const payload = await (0, responseCache_1.cached)(cacheKey, 120000, async () => {
            // Si no se pidió mes, usar el último ingestado
            let mesFiltro = mes;
            if (!mesFiltro) {
                const r = await (0, database_1.default)('stm_validaciones_ingestados')
                    .max({ max: 'mes' })
                    .first();
                if (r?.max) {
                    mesFiltro = r.max instanceof Date ? r.max.toISOString().slice(0, 7) : String(r.max).slice(0, 7);
                }
            }
            let q = (0, database_1.default)('stm_validaciones_mensual')
                .select('codigo_parada', 'cod_empresa')
                .sum({ total: 'validaciones' })
                .whereNotNull('codigo_parada')
                .groupBy('codigo_parada', 'cod_empresa');
            if (mesFiltro)
                q = q.where('mes', mesFiltro + '-01');
            const rows = await q;
            const porParada = new Map();
            for (const r of rows) {
                let c = porParada.get(r.codigo_parada);
                if (!c) {
                    c = { ucot: 0, cutcsa: 0, coetc: 0, come: 0 };
                    porParada.set(r.codigo_parada, c);
                }
                const v = Number(r.total);
                if (r.cod_empresa === 70)
                    c.ucot += v;
                else if (r.cod_empresa === 50)
                    c.cutcsa += v;
                else if (r.cod_empresa === 10)
                    c.coetc += v;
                else if (r.cod_empresa === 20)
                    c.come += v;
            }
            // Construir items con cálculos
            const stops = getStopsIndex();
            const items = [];
            for (const [cod, c] of porParada) {
                const total = c.ucot + c.cutcsa + c.come + c.coetc;
                if (total < minViajes)
                    continue;
                if (conUcot && c.ucot === 0)
                    continue;
                // Operador dominante
                const partes = [
                    ['UCOT', c.ucot], ['CUTCSA', c.cutcsa], ['COETC', c.coetc], ['COME', c.come],
                ];
                partes.sort((a, b) => b[1] - a[1]);
                const dominante = partes[0][0];
                const cuotaDominante = total > 0 ? partes[0][1] / total : 0;
                // HHI = Σ (share_i)² . Normalizado en [0,1] donde 1 = monopolio (1²) y 0.25 = 4 operadores iguales.
                const shares = [c.ucot, c.cutcsa, c.coetc, c.come].map((v) => (total > 0 ? v / total : 0));
                const hhi = shares.reduce((s, x) => s + x * x, 0);
                const nOperadores = shares.filter((s) => s > 0).length;
                const stop = stops.get(cod);
                items.push({
                    codigoParada: cod,
                    nombre: stop?.name ?? null,
                    lat: stop?.lat ?? null,
                    lon: stop?.lon ?? null,
                    ucot: c.ucot, cutcsa: c.cutcsa, coetc: c.coetc, come: c.come,
                    total,
                    dominante,
                    cuotaDominante,
                    hhi,
                    nOperadores,
                });
            }
            items.sort((a, b) => b.total - a.total);
            return {
                ok: true,
                mes: mesFiltro || null,
                criterios: { top, minViajes, conUcot },
                totalParadas: items.length,
                items: items.slice(0, top),
            };
        });
        res.json(payload);
    }
    catch (err) {
        logger_1.default.error('[stm-demanda/mapa-global]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * FASE 5.15 (2026-05-14) — paradas de una línea con coordenadas geográficas.
 *
 * GET /api/stm-demanda/paradas-linea/:op/:linea?mes=YYYY-MM
 *
 * Devuelve cada parada de origen donde se validaron viajes de esa línea
 * en el mes solicitado, junto con su lat/lon y nombre tomados del
 * schedule_index.json + stops_geo.json. Sirve para pintar mapa de calor
 * de paradas críticas en el frontend.
 *
 * Para identificar variación, también incluye el mes anterior si está
 * ingestado, así el frontend puede colorear "creció / cayó".
 */
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let stopsIndex = null;
let stopsLoadedAt = 0;
function getStopsIndex() {
    if (stopsIndex && Date.now() - stopsLoadedAt < 60 * 60 * 1000)
        return stopsIndex;
    const idx = new Map();
    try {
        const baseDir = path_1.default.resolve(__dirname, '..', 'data', 'gtfs');
        // stops_geo prefija con "2"; mantenemos ambas claves
        const stopsGeo = JSON.parse(fs_1.default.readFileSync(path_1.default.join(baseDir, 'stops_geo.json'), 'utf8'));
        for (const [id, info] of Object.entries(stopsGeo)) {
            idx.set(id, { name: info.name ?? id, lat: info.lat, lon: info.lon });
            if (id.startsWith('2')) {
                const sinPref = id.slice(1);
                if (!idx.has(sinPref))
                    idx.set(sinPref, { name: info.name ?? sinPref, lat: info.lat, lon: info.lon });
            }
        }
        const sched = JSON.parse(fs_1.default.readFileSync(path_1.default.join(baseDir, 'schedule_index.json'), 'utf8'));
        for (const ag of Object.values(sched)) {
            for (const route of Object.values(ag.routes)) {
                for (const day of [route.habiles, route.sabados, route.domingos]) {
                    if (!day)
                        continue;
                    for (const trip of day) {
                        for (const cs of trip.control_stops ?? []) {
                            if (cs.stop_id && typeof cs.lat === 'number' && typeof cs.lon === 'number' && !idx.has(cs.stop_id)) {
                                idx.set(cs.stop_id, { name: cs.name ?? cs.stop_id, lat: cs.lat, lon: cs.lon });
                            }
                        }
                    }
                }
            }
        }
        stopsIndex = idx;
        stopsLoadedAt = Date.now();
    }
    catch (e) {
        logger_1.default.warn('[stm-demanda] no se pudo cargar stops index', { err: String(e) });
    }
    return idx;
}
router.get('/paradas-linea/:op/:linea', async (req, res) => {
    try {
        const op = String(req.params.op);
        const linea = String(req.params.linea);
        const mes = String(req.query.mes || '');
        const cacheKey = `stm-demanda:paradas-linea:${op}:${linea}:${mes}`;
        const payload = await (0, responseCache_1.cached)(cacheKey, 60000, async () => {
            let q = (0, database_1.default)('stm_validaciones_mensual')
                .select('codigo_parada', 'mes')
                .sum({ total: 'validaciones' })
                .where({ cod_empresa: op, dsc_linea: linea })
                .whereNotNull('codigo_parada')
                .groupBy('codigo_parada', 'mes');
            if (mes) {
                // pedir mes seleccionado + mes anterior
                const [y, m] = mes.split('-').map(Number);
                const prevMes = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
                q = q.whereIn('mes', [`${mes}-01`, `${prevMes}-01`]);
            }
            const rows = await q;
            const stops = getStopsIndex();
            const byCode = new Map();
            // Normalizar mes (puede venir como Date o string ISO)
            function mesYM(v) {
                if (v instanceof Date)
                    return v.toISOString().slice(0, 7);
                if (typeof v === 'string')
                    return v.slice(0, 7);
                return String(v).slice(0, 7);
            }
            for (const r of rows) {
                const cod = r.codigo_parada;
                if (!byCode.has(cod))
                    byCode.set(cod, { actual: 0, previo: 0 });
                const target = mes && mesYM(r.mes) === mes ? 'actual' : 'previo';
                byCode.get(cod)[target] += Number(r.total);
            }
            const items = Array.from(byCode.entries())
                .map(([cod, { actual, previo }]) => {
                const stop = stops.get(cod);
                return {
                    codigoParada: cod,
                    nombre: stop?.name ?? null,
                    lat: stop?.lat ?? null,
                    lon: stop?.lon ?? null,
                    actual,
                    previo,
                    delta: actual - previo,
                    pctCambio: previo > 0 ? ((actual - previo) / previo) * 100 : (actual > 0 ? 100 : 0),
                };
            })
                .filter((x) => x.actual > 0)
                .sort((a, b) => b.actual - a.actual);
            return {
                ok: true,
                operador: OPERADOR_NOMBRE[op] ?? op,
                linea,
                mes: mes || null,
                totalParadas: items.length,
                items,
            };
        });
        res.json(payload);
    }
    catch (err) {
        logger_1.default.error('[stm-demanda/paradas-linea]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * FASE 5.15 — Nivel 3: forecast simple por línea-hora-dow.
 *
 * GET /api/stm-demanda/forecast/:op/:linea?dow=N&hora=H
 * Predice cuántos viajes esperás para esa (línea, día de semana, hora) a
 * partir del histórico mensual de stm_validaciones_mensual.
 *
 * Modelo: promedio de los últimos 3 meses ponderado por proximidad, con
 * factor estacional simple (si el último mes vs hace 3 difiere mucho,
 * extrapola la tendencia).
 *
 * Sin ML, sin lib externa. Suficiente para detectar "esta línea debería
 * tener X buses operando ahora para soportar la demanda".
 */
router.get('/forecast/:op/:linea', async (req, res) => {
    try {
        const op = String(req.params.op);
        const linea = String(req.params.linea);
        const dowParam = req.query.dow != null ? parseInt(req.query.dow, 10) : null;
        const horaParam = req.query.hora != null ? parseInt(req.query.hora, 10) : null;
        const cacheKey = `stm-demanda:forecast:${op}:${linea}:${dowParam ?? 'X'}:${horaParam ?? 'X'}`;
        const payload = await (0, responseCache_1.cached)(cacheKey, 300000, async () => {
            // FASE 5.15: MV mv_stm_linea_resumen.
            let q = (0, database_1.default)('mv_stm_linea_resumen')
                .select('mes', 'hora', 'dow')
                .sum({ total: 'validaciones' })
                .where({ cod_empresa: op, dsc_linea: linea })
                .groupBy('mes', 'hora', 'dow')
                .orderBy('mes', 'desc');
            if (dowParam != null)
                q = q.where('dow', dowParam);
            if (horaParam != null)
                q = q.where('hora', horaParam);
            const rows = await q;
            // Normalizar mes (Date | string) → "YYYY-MM"
            const toYM = (v) => v instanceof Date ? v.toISOString().slice(0, 7) : String(v).slice(0, 7);
            // Agrupar por (hora, dow) y tomar las series mensuales
            const series = new Map();
            for (const r of rows) {
                const key = `${r.hora}|${r.dow}`;
                const arr = series.get(key) ?? [];
                arr.push({ mes: toYM(r.mes), total: Number(r.total) });
                series.set(key, arr);
            }
            const forecast = [];
            for (const [key, items] of series) {
                const [horaStr, dowStr] = key.split('|');
                items.sort((a, b) => a.mes.localeCompare(b.mes));
                const ult = items[items.length - 1];
                const ult3 = items.slice(-3);
                const promUlt3 = ult3.reduce((s, x) => s + x.total, 0) / Math.max(1, ult3.length);
                let tendencia = 'estable';
                if (ult3.length >= 2) {
                    const primero = ult3[0].total;
                    const ultimo = ult3[ult3.length - 1].total;
                    const cambio = primero > 0 ? (ultimo - primero) / primero : 0;
                    if (cambio > 0.05)
                        tendencia = 'subiendo';
                    else if (cambio < -0.05)
                        tendencia = 'bajando';
                }
                // Esperado: promedio + 50 % de la tendencia
                let esperado = promUlt3;
                if (tendencia === 'subiendo' && ult3.length >= 2) {
                    esperado = ult3[ult3.length - 1].total * 1.02;
                }
                else if (tendencia === 'bajando' && ult3.length >= 2) {
                    esperado = ult3[ult3.length - 1].total * 0.98;
                }
                forecast.push({
                    hora: parseInt(horaStr, 10),
                    dow: parseInt(dowStr, 10),
                    ultimoMes: ult?.mes ?? null,
                    promUltimos3: Math.round(promUlt3),
                    tendencia,
                    esperado: Math.round(esperado),
                });
            }
            forecast.sort((a, b) => a.dow - b.dow || a.hora - b.hora);
            return {
                ok: true,
                operador: OPERADOR_NOMBRE[op] ?? op,
                linea,
                nota: 'forecast = promedio últimos 3 meses ajustado por tendencia. Granularidad: hora × día-de-semana.',
                forecast,
            };
        });
        res.json(payload);
    }
    catch (err) {
        logger_1.default.error('[stm-demanda/forecast]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
/**
 * FASE 5.15 — Bonus: ranking competidores en una parada concreta.
 * GET /api/stm-demanda/competidores/:codParada?meses=6
 * Para una parada UCOT, lista las líneas competidoras (no-UCOT) con su
 * volumen comparativo entre el primer y último mes ingestado.
 */
router.get('/competidores/:codParada', async (req, res) => {
    try {
        const codParada = String(req.params.codParada);
        const cacheKey = `stm-demanda:competidores:${codParada}`;
        const payload = await (0, responseCache_1.cached)(cacheKey, 300000, async () => {
            const rows = await (0, database_1.default)('stm_validaciones_mensual')
                .select('mes', 'cod_empresa', 'dsc_linea')
                .sum({ total: 'validaciones' })
                .where('codigo_parada', codParada)
                .groupBy('mes', 'cod_empresa', 'dsc_linea')
                .orderBy('mes');
            const porLinea = new Map();
            for (const r of rows) {
                const key = `${r.cod_empresa}|${r.dsc_linea}`;
                if (!porLinea.has(key)) {
                    porLinea.set(key, {
                        operador: OPERADOR_NOMBRE[String(r.cod_empresa)] ?? String(r.cod_empresa),
                        linea: r.dsc_linea,
                        series: [],
                    });
                }
                porLinea.get(key).series.push({ mes: r.mes, total: Number(r.total) });
            }
            const items = Array.from(porLinea.values()).map((x) => {
                const primer = x.series[0]?.total ?? 0;
                const ult = x.series[x.series.length - 1]?.total ?? 0;
                return {
                    ...x,
                    delta: ult - primer,
                    pctCambio: primer > 0 ? ((ult - primer) / primer) * 100 : 0,
                    ultimoMes: ult,
                };
            });
            items.sort((a, b) => b.ultimoMes - a.ultimoMes);
            return { ok: true, codigoParada: codParada, items };
        });
        res.json(payload);
    }
    catch (err) {
        logger_1.default.error('[stm-demanda/competidores]', { error: String(err) });
        res.status(500).json({ ok: false, error: String(err) });
    }
});
exports.default = router;
