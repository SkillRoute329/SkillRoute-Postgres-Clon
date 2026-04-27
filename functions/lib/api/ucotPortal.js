"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUcotPortalRoutes = registerUcotPortalRoutes;
/**
 * /api/ucot/* — proxy autenticado al portal interno UCOT
 *
 * Credenciales en Firestore: system_config/ucot_portal { url, user, pass }
 * Nunca se exponen en respuestas al cliente.
 *
 * Extraído de `intelligenceApi.ts` el 2026-04-24 como parte de la división
 * por dominio (ADR 003).
 */
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const getDb = () => admin.firestore();
// Sesión JSF cacheada en memoria (se reusa mientras la Cloud Function esté viva)
let _ucotSession = null;
async function _ucotGetCreds() {
    const doc = await getDb().collection('system_config').doc('ucot_portal').get();
    if (!doc.exists)
        throw new Error('UCOT portal no configurado');
    return doc.data();
}
async function _ucotLogin(url, user, pass) {
    var _a, _b, _c;
    const loginPage = await axios_1.default.get(`${url}/faces/login.xhtml`, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 12000 });
    const vsMatch = loginPage.data.match(/name="javax\.faces\.ViewState"[^>]+value="([^"]+)"/);
    const vs = vsMatch ? vsMatch[1] : '';
    const rawCookies = (_a = loginPage.headers['set-cookie']) !== null && _a !== void 0 ? _a : [];
    const jsid = (_c = (_b = rawCookies.find(c => c.startsWith('JSESSIONID='))) === null || _b === void 0 ? void 0 : _b.split(';')[0]) !== null && _c !== void 0 ? _c : '';
    const form = new URLSearchParams({
        'j_idt8': 'j_idt8', 'j_idt8:usuario': user, 'j_idt8:password': pass,
        'j_idt8:ingresar': 'j_idt8:ingresar',
        'javax.faces.partial.ajax': 'true', 'javax.faces.source': 'j_idt8:ingresar',
        'javax.faces.partial.execute': '@all', 'javax.faces.partial.render': '@all',
        'javax.faces.ViewState': vs,
    });
    await axios_1.default.post(`${url}/faces/login.xhtml`, form.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded', 'Faces-Request': 'partial/ajax', 'Cookie': jsid },
        timeout: 15000, validateStatus: () => true, maxRedirects: 0,
    });
    return jsid;
}
async function _ucotFetch(path) {
    var _a, _b;
    const creds = await _ucotGetCreds();
    if (!_ucotSession)
        _ucotSession = await _ucotLogin(creds.url, creds.user, creds.pass);
    try {
        const resp = await axios_1.default.get(`${creds.url}${path}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': _ucotSession }, timeout: 12000, responseType: 'arraybuffer' });
        if (resp.status === 302 || ((_b = (_a = resp.config) === null || _a === void 0 ? void 0 : _a.url) === null || _b === void 0 ? void 0 : _b.includes('login'))) {
            _ucotSession = await _ucotLogin(creds.url, creds.user, creds.pass);
            return (await axios_1.default.get(`${creds.url}${path}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': _ucotSession }, timeout: 12000, responseType: 'arraybuffer' })).data;
        }
        return resp.data;
    }
    catch (e) {
        _ucotSession = null;
        throw e;
    }
}
async function _ucotPost(path, formData) {
    const creds = await _ucotGetCreds();
    if (!_ucotSession)
        _ucotSession = await _ucotLogin(creds.url, creds.user, creds.pass);
    const form = new URLSearchParams(formData);
    const resp = await axios_1.default.post(`${creds.url}${path}`, form.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded', 'Faces-Request': 'partial/ajax', 'Cookie': _ucotSession },
        timeout: 15000, validateStatus: () => true,
    });
    return resp.data;
}
/**
 * Registra las rutas /api/ucot/* en la app Express provista.
 */
function registerUcotPortalRoutes(app) {
    // GET /api/ucot/gps?coche=0 — posiciones de todos los coches UCOT
    app.get('/api/ucot/gps', async (req, res) => {
        var _a;
        try {
            const coche = (_a = req.query.coche) !== null && _a !== void 0 ? _a : '0';
            const raw = await _ucotFetch(`/getXY?coche=${coche}`);
            const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
            const buses = text.split(';').filter(Boolean).map(entry => {
                var _a;
                const p = entry.split(',');
                return { idBus: p[0], lat: parseFloat(p[1]), lon: parseFloat(p[2]), velocidad: parseFloat(p[3] || '0'), servicio: ((_a = p[4]) === null || _a === void 0 ? void 0 : _a.trim()) || null, cartel: p[5] || '', parado: p[6] === '1', rumbo: parseFloat(p[7] || '0') };
            }).filter(b => !isNaN(b.lat) && !isNaN(b.lon));
            res.json({ ok: true, buses, total: buses.length, timestamp: new Date().toISOString() });
        }
        catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });
    // GET /api/ucot/rotacion/:coche — servicio asignado al coche hoy y próximos días
    app.get('/api/ucot/rotacion/:coche', async (req, res) => {
        try {
            const { coche } = req.params;
            const creds = await _ucotGetCreds();
            if (!_ucotSession)
                _ucotSession = await _ucotLogin(creds.url, creds.user, creds.pass);
            const page = await axios_1.default.get(`${creds.url}/faces/site/rotacion.xhtml`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': _ucotSession }, timeout: 12000 });
            const vsMatch = page.data.match(/name="javax\.faces\.ViewState"[^>]+value="([^"]+)"/);
            const vs = vsMatch ? vsMatch[1] : '';
            const xml = await _ucotPost('/faces/site/rotacion.xhtml', {
                'j_idt38': 'j_idt38', 'j_idt38:coche': coche, 'j_idt38:j_idt43': 'j_idt38:j_idt43',
                'javax.faces.partial.ajax': 'true', 'javax.faces.source': 'j_idt38:j_idt43',
                'javax.faces.partial.execute': '@all', 'javax.faces.partial.render': 'dtservicios',
                'javax.faces.ViewState': vs,
            });
            const servicios = [];
            const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([\d-]+)<\/td>[\s\S]*?<td[^>]*>(\d+)<\/td>[\s\S]*?<\/tr>/g;
            let m;
            while ((m = rowRegex.exec(xml)) !== null) {
                servicios.push({ fecha: m[1], servicio: m[2] });
            }
            res.json({ ok: true, coche, servicios });
        }
        catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });
    // GET /api/ucot/carton/:servicio?minuta=HABILES — PDF del cartón (proxy autenticado)
    app.get('/api/ucot/carton/:servicio', async (req, res) => {
        var _a;
        try {
            const { servicio } = req.params;
            const minuta = (_a = req.query.minuta) !== null && _a !== void 0 ? _a : 'HABILES';
            const creds = await _ucotGetCreds();
            if (!_ucotSession)
                _ucotSession = await _ucotLogin(creds.url, creds.user, creds.pass);
            const page = await axios_1.default.get(`${creds.url}/faces/site/carton.xhtml`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': _ucotSession }, timeout: 12000 });
            const vsMatch = page.data.match(/name="javax\.faces\.ViewState"[^>]+value="([^"]+)"/);
            const vs = vsMatch ? vsMatch[1] : '';
            const xml = await _ucotPost('/faces/site/carton.xhtml', {
                'f3': 'f3', 'f3:minuta_focus': '', 'f3:minuta_input': minuta, 'f3:servicio': servicio,
                'f3:j_idt44': 'f3:j_idt44',
                'javax.faces.partial.ajax': 'true', 'javax.faces.source': 'f3:j_idt44',
                'javax.faces.partial.execute': '@all', 'javax.faces.partial.render': '@all',
                'javax.faces.ViewState': vs,
            });
            const pdfMatch = xml.match(/file=([^#"&]+)/);
            if (!pdfMatch)
                return res.status(404).json({ ok: false, error: 'Cartón no encontrado' });
            const pdfPath = decodeURIComponent(pdfMatch[1]);
            const pdfResp = await axios_1.default.get(`${creds.url}${pdfPath}`, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': _ucotSession },
                responseType: 'arraybuffer', timeout: 20000,
            });
            res.set('Content-Type', 'application/pdf');
            res.set('Content-Disposition', `inline; filename="carton_${servicio}.pdf"`);
            res.set('Cache-Control', 'private, max-age=300');
            res.send(Buffer.from(pdfResp.data));
        }
        catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });
}
