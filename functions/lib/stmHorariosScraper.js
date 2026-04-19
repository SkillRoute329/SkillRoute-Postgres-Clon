"use strict";
/**
 * STM Horarios Scraper (Cloud Function edition)
 * Scrapea https://www.montevideo.gub.uy/app/stm/horarios/ (PrimeFaces JSF).
 * Mantiene JSESSIONID + ViewState entre POSTs Ajax.
 *
 * Portado desde backend/src/services/stmHorariosScraperService.ts eliminando
 * la dependencia de logger y dejando todo self-contained.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchLineSchedule = fetchLineSchedule;
exports.frecuenciaProgramadaParaHora = frecuenciaProgramadaParaHora;
const axios_1 = __importDefault(require("axios"));
const BASE_URL = 'https://www.montevideo.gub.uy/app/stm/horarios/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
function buildClient() {
    return axios_1.default.create({
        timeout: 20000,
        headers: {
            'User-Agent': UA,
            Referer: BASE_URL,
            Origin: 'https://www.montevideo.gub.uy',
        },
        validateStatus: (s) => s >= 200 && s < 400,
    });
}
function extractCookies(setCookie) {
    if (!setCookie || setCookie.length === 0)
        return '';
    return setCookie
        .map((c) => c.split(';')[0])
        .filter((c) => Boolean(c))
        .join('; ');
}
function extractViewState(html) {
    var _a, _b;
    const m1 = html.match(/<update id="[^"]*ViewState[^"]*"><!\[CDATA\[([^\]]+)\]\]><\/update>/);
    if (m1)
        return (_a = m1[1]) !== null && _a !== void 0 ? _a : null;
    const m2 = html.match(/javax\.faces\.ViewState[^>]*value="([^"]+)"/);
    return m2 ? (_b = m2[1]) !== null && _b !== void 0 ? _b : null : null;
}
function extractLineaCatalogo(html) {
    const out = [];
    const re = /<option value="(class uy\.gub\.imm\.stm\.core\.stm20\.dto\.LineaDTO@[^"]+)"[^>]*>([^<]+)<\/option>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        if (!m[1] || !m[2])
            continue;
        out.push({ token: m[1], numero: m[2].trim() });
    }
    return out;
}
function findTipoDiaToken(html, label) {
    var _a;
    const re = new RegExp(`value="(class uy\\.gub\\.imm\\.stm\\.core\\.stm20\\.dto\\.TipoDiaDTO[^"]+)"[^>]*>${label}\\s*<`);
    const m = html.match(re);
    return m ? (_a = m[1]) !== null && _a !== void 0 ? _a : null : null;
}
function hhmmToMin(s) {
    const m = s.match(/^(\d{2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function freqAvgMin(salidas) {
    if (salidas.length < 2)
        return 0;
    const mins = salidas
        .map((s) => hhmmToMin(s.desde))
        .filter((m) => m !== null)
        .sort((a, b) => a - b);
    if (mins.length < 2)
        return 0;
    let gap = 0;
    for (let i = 1; i < mins.length; i++)
        gap += mins[i] - mins[i - 1];
    return Math.round(gap / (mins.length - 1));
}
function parseHorariosHTML(html) {
    var _a, _b, _c, _d, _e;
    const tables = (_a = html.match(/<table[\s\S]*?<\/table>/g)) !== null && _a !== void 0 ? _a : [];
    const grupos = new Map();
    for (const t of tables) {
        if (/class="stm-datalist-header"/.test(t))
            continue;
        const labels = [...t.matchAll(/<label[^>]*>([^<]+)<\/label>/g)].map((m) => { var _a; return ((_a = m[1]) !== null && _a !== void 0 ? _a : '').trim(); });
        if (labels.length < 2)
            continue;
        const origen = labels[0];
        const destino = labels[1];
        const filas = [...t.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => { var _a; return (_a = m[1]) !== null && _a !== void 0 ? _a : ''; });
        const salidasEnTabla = [];
        for (const fila of filas) {
            const tds = [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => { var _a; return ((_a = m[1]) !== null && _a !== void 0 ? _a : '').trim(); });
            const t1 = tds[0];
            const t2 = tds[1];
            if (t1 && t2 && /^\d{2}:\d{2}$/.test(t1) && /^\d{2}:\d{2}$/.test(t2)) {
                salidasEnTabla.push({ desde: t1, hacia: t2 });
            }
        }
        if (salidasEnTabla.length === 0)
            continue;
        const key = `${origen}||${destino}`;
        let g = grupos.get(key);
        if (!g) {
            g = { origen, destino, salidas: [] };
            grupos.set(key, g);
        }
        g.salidas.push(...salidasEnTabla);
    }
    const variantes = [];
    for (const g of grupos.values()) {
        g.salidas.sort((a, b) => a.desde.localeCompare(b.desde));
        variantes.push({
            origen: g.origen,
            destino: g.destino,
            salidas: g.salidas,
            frecuenciaMin: freqAvgMin(g.salidas),
            horaInicio: (_c = (_b = g.salidas[0]) === null || _b === void 0 ? void 0 : _b.desde) !== null && _c !== void 0 ? _c : '',
            horaFin: (_e = (_d = g.salidas[g.salidas.length - 1]) === null || _d === void 0 ? void 0 : _d.desde) !== null && _e !== void 0 ? _e : '',
        });
    }
    variantes.sort((a, b) => b.salidas.length - a.salidas.length);
    return variantes;
}
async function startSession() {
    const client = buildClient();
    const res = await client.get(BASE_URL, { headers: { Accept: 'text/html' } });
    const html = res.data;
    const cookie = extractCookies(res.headers['set-cookie']);
    if (!cookie)
        throw new Error('STM horarios: sin cookie en GET inicial');
    const viewState = extractViewState(html);
    if (!viewState)
        throw new Error('STM horarios: ViewState no encontrado');
    return { session: { client, cookie, viewState }, html };
}
async function postAjax(session, params) {
    const body = new URLSearchParams(params).toString();
    const res = await session.client.post(BASE_URL, body, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            Accept: 'application/xml, text/xml, */*; q=0.01',
            'Faces-Request': 'partial/ajax',
            'X-Requested-With': 'XMLHttpRequest',
            Cookie: session.cookie,
        },
    });
    const xml = res.data;
    const newVs = extractViewState(xml);
    if (newVs)
        session.viewState = newVs;
    const refreshed = extractCookies(res.headers['set-cookie']);
    if (refreshed)
        session.cookie = refreshed;
    return xml;
}
async function fetchLineSchedule(lineaNumero, tipoDia = 'Hábiles') {
    const { session, html: initialHtml } = await startSession();
    const catalogo = extractLineaCatalogo(initialHtml);
    const linea = catalogo.find((l) => l.numero === lineaNumero);
    if (!linea) {
        throw new Error(`STM horarios: línea "${lineaNumero}" no está en el catálogo STM`);
    }
    const r1 = await postAjax(session, {
        'javax.faces.partial.ajax': 'true',
        'javax.faces.source': 'j_idt26:slLinea',
        'javax.faces.partial.execute': 'j_idt26:slLinea',
        'javax.faces.partial.render': 'j_idt26',
        'javax.faces.behavior.event': 'change',
        'javax.faces.partial.event': 'change',
        j_idt26: 'j_idt26',
        'j_idt26:slLinea_focus': '',
        'j_idt26:slLinea_input': linea.token,
        'javax.faces.ViewState': session.viewState,
    });
    const tipoToken = findTipoDiaToken(r1, tipoDia);
    if (!tipoToken) {
        throw new Error(`STM horarios: tipoDia "${tipoDia}" no disponible para línea ${lineaNumero}`);
    }
    await postAjax(session, {
        'javax.faces.partial.ajax': 'true',
        'javax.faces.source': 'j_idt26:j_idt36',
        'javax.faces.partial.execute': 'j_idt26:j_idt36',
        'javax.faces.partial.render': 'j_idt26',
        'javax.faces.behavior.event': 'change',
        'javax.faces.partial.event': 'change',
        j_idt26: 'j_idt26',
        'j_idt26:slLinea_focus': '',
        'j_idt26:slLinea_input': linea.token,
        'j_idt26:j_idt36_focus': '',
        'j_idt26:j_idt36_input': tipoToken,
        'javax.faces.ViewState': session.viewState,
    });
    const result = await postAjax(session, {
        'javax.faces.partial.ajax': 'true',
        'javax.faces.source': 'j_idt26:btnConsultar',
        'javax.faces.partial.execute': '@all',
        'javax.faces.partial.render': 'j_idt26',
        'j_idt26:btnConsultar': 'j_idt26:btnConsultar',
        j_idt26: 'j_idt26',
        'j_idt26:slLinea_focus': '',
        'j_idt26:slLinea_input': linea.token,
        'j_idt26:j_idt36_focus': '',
        'j_idt26:j_idt36_input': tipoToken,
        'javax.faces.ViewState': session.viewState,
    });
    const variantes = parseHorariosHTML(result);
    const totalSalidas = variantes.reduce((s, v) => s + v.salidas.length, 0);
    const dominante = variantes[0];
    const frecuenciaDominanteMin = dominante ? dominante.frecuenciaMin : 0;
    return {
        linea: lineaNumero,
        tipoDia,
        variantes,
        totalSalidas,
        frecuenciaDominanteMin,
        scrapedAt: new Date().toISOString(),
    };
}
/**
 * Estima frecuencia programada para UNA hora y tipoDia específico
 * contando cuántas salidas hay en la ventana [hora-30, hora+30].
 * Si hay N salidas en 60min → frecuencia ≈ 60/N minutos.
 */
function frecuenciaProgramadaParaHora(horario, hhmm, ventanaMin = 60) {
    const target = hhmmToMin(hhmm);
    if (target === null)
        return null;
    const half = ventanaMin / 2;
    let count = 0;
    for (const v of horario.variantes) {
        for (const s of v.salidas) {
            const m = hhmmToMin(s.desde);
            if (m === null)
                continue;
            if (m >= target - half && m <= target + half)
                count++;
        }
    }
    if (count < 2) {
        // Fallback: frecuencia dominante global
        return horario.frecuenciaDominanteMin > 0 ? horario.frecuenciaDominanteMin : null;
    }
    return Math.round(ventanaMin / count);
}
