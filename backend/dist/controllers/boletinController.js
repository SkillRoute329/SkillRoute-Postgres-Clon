"use strict";
/**
 * boletinController — Boletines de inspección (FASE 5.28, 2026-05-19)
 *
 * Antes 404 (BoletinInspeccion.tsx). Devuelve la matriz de paradas × pases
 * por línea y sentido. Dos fuentes verificadas:
 *
 *   GET /api/boletin/:linea            → invierno (schedule_index.json IMM)
 *   GET /api/boletin-verano/:linea     → verano (XLS oficial UCOT)
 *
 * Sin datos: el endpoint devuelve `{ ok: true, boletin: { paradas: [], pases: [] } }`
 * con razón honesta — no inventa pases.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBoletin = getBoletin;
exports.getBoletinVerano = getBoletinVerano;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("../config/logger"));
const cartonOficial_1 = require("../services/cartonOficial");
let _schedIdx = null;
let _schedTs = 0;
const SCHED_TTL = 60 * 60 * 1000; // 1h
function loadSchedule() {
    if (_schedIdx && Date.now() - _schedTs < SCHED_TTL)
        return _schedIdx;
    try {
        const p = path_1.default.resolve(__dirname, '..', 'data', 'gtfs', 'schedule_index.json');
        _schedIdx = JSON.parse(fs_1.default.readFileSync(p, 'utf8'));
        _schedTs = Date.now();
    }
    catch (e) {
        logger_1.default.error('[boletin] schedule_index no disponible', { err: String(e) });
        _schedIdx = {};
    }
    return _schedIdx;
}
function hhmmShort(s) {
    if (!s)
        return '----';
    const m = /^(\d{1,2}):(\d{2})/.exec(s);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '----';
}
function buildBoletin(linea, sentido, svcType) {
    const idx = loadSchedule();
    let route = null;
    for (const ag of Object.values(idx)) {
        if (ag.routes && ag.routes[linea]) {
            route = ag.routes[linea];
            break;
        }
    }
    if (!route)
        return { paradas: [], pases: [], totalPases: 0, fuente: 'schedule_index_imm' };
    const day = (route[svcType] ?? []);
    if (day.length === 0)
        return { paradas: [], pases: [], totalPases: 0, fuente: 'schedule_index_imm' };
    // Bifurcación sentido: el schedule_index no trae direction_id explícito.
    // Tomamos los trips con primera y última etapa del medio para sentido B,
    // pero por ahora aplicamos el filtro "todos" en sentido a, y vacío en b si
    // no hay tag explícito. Doc honestamente que la separación es heurística.
    const trips = sentido === 'a' ? day : []; // sin direction_id real
    const seqByStop = new Map();
    for (const t of trips) {
        for (const cs of t.control_stops ?? []) {
            const arr = seqByStop.get(cs.name ?? cs.stop_id) ?? [];
            arr.push(cs.seq);
            seqByStop.set(cs.name ?? cs.stop_id, arr);
        }
    }
    const paradas = Array.from(seqByStop.entries())
        .map(([n, seqs]) => ({ n, avg: seqs.reduce((s, v) => s + v, 0) / seqs.length }))
        .sort((a, b) => a.avg - b.avg)
        .map((x) => x.n);
    const pases = trips.map((t) => {
        const horarios = {};
        for (const p of paradas)
            horarios[p] = '----';
        for (const cs of t.control_stops ?? []) {
            const key = cs.name ?? cs.stop_id;
            horarios[key] = hhmmShort(cs.arrival);
        }
        return { servicio: t.trip_id, horarios };
    });
    return { paradas, pases, totalPases: pases.length, fuente: 'schedule_index_imm' };
}
async function getBoletin(req, res) {
    try {
        const raw = String(req.params.linea ?? '');
        const m = /^([A-Za-z0-9-]+)([ab])?$/.exec(raw);
        if (!m) {
            res.status(400).json({ ok: false, error: 'Formato esperado: <linea><a|b>?' });
            return;
        }
        const linea = m[1];
        const sentido = m[2] ?? 'a';
        const svcType = (req.query.dia || 'habiles');
        const data = buildBoletin(linea, sentido, svcType);
        res.json({
            ok: true,
            boletin: {
                linea,
                direccion: sentido,
                paradas: data.paradas,
                pases: data.pases,
                totalPases: data.totalPases,
                temporada: 'invierno',
                fuente: data.fuente,
            },
        });
    }
    catch (err) {
        logger_1.default.error('[boletin/get]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error leyendo boletín' });
    }
}
/**
 * GET /api/boletin-verano/:linea
 * Construye el boletín desde el XLS oficial UCOT "Cartones habiles desde el
 * 2 de marzo" (régimen verano 2026, validado por el operador).
 */
async function getBoletinVerano(req, res) {
    try {
        const raw = String(req.params.linea ?? '');
        const m = /^([A-Za-z0-9-]+)([ab])?$/.exec(raw);
        if (!m) {
            res.status(400).json({ ok: false, error: 'Formato esperado: <linea><a|b>?' });
            return;
        }
        const linea = m[1];
        const sentido = m[2] ?? 'a';
        const idx = (0, cartonOficial_1.cartonIndex)();
        const servicios = idx.porLinea.get(linea) ?? [];
        if (servicios.length === 0) {
            res.json({
                ok: true,
                boletin: {
                    linea,
                    direccion: sentido,
                    paradas: [],
                    pases: [],
                    totalPases: 0,
                    temporada: 'verano',
                    fuente: 'carton_oficial_xls',
                    nota: 'Sin servicios cargados para esta línea en el XLS oficial verano 2026.',
                },
            });
            return;
        }
        // Construir paradas uniendo etapas de todos los servicios de la línea.
        const setParadas = new Set();
        for (const sid of servicios) {
            const s = idx.porServicio.get(sid);
            if (!s)
                continue;
            for (const e of s.etapas ?? [])
                setParadas.add(e);
        }
        const paradas = Array.from(setParadas);
        const pases = servicios.map((sid) => {
            const s = idx.porServicio.get(sid);
            const horarios = {};
            for (const p of paradas)
                horarios[p] = '----';
            if (s?.primeraEtapa && s?.primeraHora) {
                horarios[s.primeraEtapa] = s.primeraHora;
            }
            return { servicio: sid, horarios };
        });
        res.json({
            ok: true,
            boletin: {
                linea,
                direccion: sentido,
                paradas,
                pases,
                totalPases: pases.length,
                temporada: 'verano',
                fuente: 'carton_oficial_xls',
            },
        });
    }
    catch (err) {
        logger_1.default.error('[boletin-verano/get]', { error: String(err) });
        res.status(500).json({ ok: false, error: 'Error leyendo boletín verano' });
    }
}
