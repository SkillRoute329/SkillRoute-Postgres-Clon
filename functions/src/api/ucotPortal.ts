/**
 * /api/ucot/* — proxy autenticado al portal interno UCOT
 *
 * Credenciales en Firestore: system_config/ucot_portal { url, user, pass }
 * Nunca se exponen en respuestas al cliente.
 *
 * Extraído de `intelligenceApi.ts` el 2026-04-24 como parte de la división
 * por dominio (ADR 003).
 */
import * as admin from 'firebase-admin';
import type { Express } from 'express';
import axios from 'axios';

const getDb = () => admin.firestore();

// Sesión JSF cacheada en memoria (se reusa mientras la Cloud Function esté viva)
let _ucotSession: string | null = null;

async function _ucotGetCreds() {
  const doc = await getDb().collection('system_config').doc('ucot_portal').get();
  if (!doc.exists) throw new Error('UCOT portal no configurado');
  return doc.data() as { url: string; user: string; pass: string };
}

async function _ucotLogin(url: string, user: string, pass: string): Promise<string> {
  const loginPage = await axios.get(`${url}/faces/login.xhtml`, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 12000 });
  const vsMatch = (loginPage.data as string).match(/name="javax\.faces\.ViewState"[^>]+value="([^"]+)"/);
  const vs = vsMatch ? vsMatch[1] : '';
  const rawCookies: string[] = (loginPage.headers['set-cookie'] as string[]) ?? [];
  const jsid = rawCookies.find(c => c.startsWith('JSESSIONID='))?.split(';')[0] ?? '';

  const form = new URLSearchParams({
    'j_idt8': 'j_idt8', 'j_idt8:usuario': user, 'j_idt8:password': pass,
    'j_idt8:ingresar': 'j_idt8:ingresar',
    'javax.faces.partial.ajax': 'true', 'javax.faces.source': 'j_idt8:ingresar',
    'javax.faces.partial.execute': '@all', 'javax.faces.partial.render': '@all',
    'javax.faces.ViewState': vs,
  });
  await axios.post(`${url}/faces/login.xhtml`, form.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded', 'Faces-Request': 'partial/ajax', 'Cookie': jsid },
    timeout: 15000, validateStatus: () => true, maxRedirects: 0,
  });
  return jsid;
}

async function _ucotFetch(path: string): Promise<any> {
  const creds = await _ucotGetCreds();
  if (!_ucotSession) _ucotSession = await _ucotLogin(creds.url, creds.user, creds.pass);
  try {
    const resp = await axios.get(`${creds.url}${path}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': _ucotSession }, timeout: 12000, responseType: 'arraybuffer' });
    if (resp.status === 302 || (resp.config as any)?.url?.includes('login')) {
      _ucotSession = await _ucotLogin(creds.url, creds.user, creds.pass);
      return (await axios.get(`${creds.url}${path}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': _ucotSession }, timeout: 12000, responseType: 'arraybuffer' })).data;
    }
    return resp.data;
  } catch (e) { _ucotSession = null; throw e; }
}

async function _ucotPost(path: string, formData: Record<string, string>): Promise<string> {
  const creds = await _ucotGetCreds();
  if (!_ucotSession) _ucotSession = await _ucotLogin(creds.url, creds.user, creds.pass);
  const form = new URLSearchParams(formData);
  const resp = await axios.post(`${creds.url}${path}`, form.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded', 'Faces-Request': 'partial/ajax', 'Cookie': _ucotSession },
    timeout: 15000, validateStatus: () => true,
  });
  return resp.data as string;
}

/**
 * Registra las rutas /api/ucot/* en la app Express provista.
 */
export function registerUcotPortalRoutes(app: Express) {
  // GET /api/ucot/gps?coche=0 — posiciones de todos los coches UCOT
  app.get('/api/ucot/gps', async (req, res) => {
    try {
      const coche = (req.query.coche as string) ?? '0';
      const raw = await _ucotFetch(`/getXY?coche=${coche}`);
      const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
      const buses = text.split(';').filter(Boolean).map(entry => {
        const p = entry.split(',');
        return { idBus: p[0], lat: parseFloat(p[1]), lon: parseFloat(p[2]), velocidad: parseFloat(p[3] || '0'), servicio: p[4]?.trim() || null, cartel: p[5] || '', parado: p[6] === '1', rumbo: parseFloat(p[7] || '0') };
      }).filter(b => !isNaN(b.lat) && !isNaN(b.lon));
      res.json({ ok: true, buses, total: buses.length, timestamp: new Date().toISOString() });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // GET /api/ucot/rotacion/:coche — servicio asignado al coche hoy y próximos días
  app.get('/api/ucot/rotacion/:coche', async (req, res) => {
    try {
      const { coche } = req.params;
      const creds = await _ucotGetCreds();
      if (!_ucotSession) _ucotSession = await _ucotLogin(creds.url, creds.user, creds.pass);
      const page = await axios.get(`${creds.url}/faces/site/rotacion.xhtml`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': _ucotSession }, timeout: 12000 });
      const vsMatch = (page.data as string).match(/name="javax\.faces\.ViewState"[^>]+value="([^"]+)"/);
      const vs = vsMatch ? vsMatch[1] : '';

      const xml = await _ucotPost('/faces/site/rotacion.xhtml', {
        'j_idt38': 'j_idt38', 'j_idt38:coche': coche, 'j_idt38:j_idt43': 'j_idt38:j_idt43',
        'javax.faces.partial.ajax': 'true', 'javax.faces.source': 'j_idt38:j_idt43',
        'javax.faces.partial.execute': '@all', 'javax.faces.partial.render': 'dtservicios',
        'javax.faces.ViewState': vs,
      });

      const servicios: Array<{ fecha: string; servicio: string }> = [];
      const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([\d-]+)<\/td>[\s\S]*?<td[^>]*>(\d+)<\/td>[\s\S]*?<\/tr>/g;
      let m;
      while ((m = rowRegex.exec(xml)) !== null) {
        servicios.push({ fecha: m[1], servicio: m[2] });
      }
      res.json({ ok: true, coche, servicios });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // GET /api/ucot/carton/:servicio?minuta=HABILES — PDF del cartón (proxy autenticado)
  app.get('/api/ucot/carton/:servicio', async (req, res) => {
    try {
      const { servicio } = req.params;
      const minuta = (req.query.minuta as string) ?? 'HABILES';
      const creds = await _ucotGetCreds();
      if (!_ucotSession) _ucotSession = await _ucotLogin(creds.url, creds.user, creds.pass);

      const page = await axios.get(`${creds.url}/faces/site/carton.xhtml`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': _ucotSession }, timeout: 12000 });
      const vsMatch = (page.data as string).match(/name="javax\.faces\.ViewState"[^>]+value="([^"]+)"/);
      const vs = vsMatch ? vsMatch[1] : '';

      const xml = await _ucotPost('/faces/site/carton.xhtml', {
        'f3': 'f3', 'f3:minuta_focus': '', 'f3:minuta_input': minuta, 'f3:servicio': servicio,
        'f3:j_idt44': 'f3:j_idt44',
        'javax.faces.partial.ajax': 'true', 'javax.faces.source': 'f3:j_idt44',
        'javax.faces.partial.execute': '@all', 'javax.faces.partial.render': '@all',
        'javax.faces.ViewState': vs,
      });

      const pdfMatch = xml.match(/file=([^#"&]+)/);
      if (!pdfMatch) return res.status(404).json({ ok: false, error: 'Cartón no encontrado' });
      const pdfPath = decodeURIComponent(pdfMatch[1]);

      const pdfResp = await axios.get(`${creds.url}${pdfPath}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': _ucotSession },
        responseType: 'arraybuffer', timeout: 20000,
      });

      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `inline; filename="carton_${servicio}.pdf"`);
      res.set('Cache-Control', 'private, max-age=300');
      res.send(Buffer.from(pdfResp.data));
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });
}
