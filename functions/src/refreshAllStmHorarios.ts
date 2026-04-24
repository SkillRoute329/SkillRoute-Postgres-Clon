/**
 * refreshAllStmHorarios.ts
 * ========================
 * Raspa TODOS los horarios del catálogo STM (todas las empresas, todas las líneas)
 * y los guarda en Firestore `horarios_stm/{lineaId}`.
 *
 * Estructura guardada (idéntica a horarios_oficiales para compatibilidad):
 *   horarios_stm/{lineaId}
 *   {
 *     linea: '300',
 *     dias: {
 *       'Hábiles':  { variantes, salidasTodas, frecuenciaDominanteMin },
 *       'Sábados':  { ... },
 *       'Domingos': { ... }
 *     },
 *     scrapedAt: ISO string
 *   }
 *
 * La colección es la fuente de verdad para el compliance engine:
 * - salidasTodas[i].desde  = hora salida del origen    (HH:MM)
 * - salidasTodas[i].hacia  = hora llegada al destino   (HH:MM)
 * - salidasTodas[i].origen / destino = nombre de terminal
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import axios from 'axios';

const db = admin.firestore();
const COLLECTION = 'horarios_stm';
const BASE_URL = 'https://www.montevideo.gub.uy/app/stm/horarios/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36';
const TIPOS_DIA = ['Hábiles', 'Sábados', 'Domingos'] as const;

// ── Tipos locales (idénticos al scraper original) ──────────────────────────

interface SalidaHorario { desde: string; hacia: string; origen: string; destino: string }
interface VarianteSummary { origen: string; destino: string; frecuenciaMin: number; horaInicio: string; horaFin: string }
interface DiaHorario { variantes: VarianteSummary[]; salidasTodas: SalidaHorario[]; frecuenciaDominanteMin: number }
interface LineaHorario { linea: string; dias: Record<string, DiaHorario>; scrapedAt: string }

// ── Helpers HTTP / Sesión JSF ──────────────────────────────────────────────

function buildClient() {
  return axios.create({
    timeout: 20000,
    headers: { 'User-Agent': UA, Referer: BASE_URL, Origin: 'https://www.montevideo.gub.uy' },
    validateStatus: (s) => s >= 200 && s < 400,
  });
}

function extractCookies(sc: string[] | undefined): string {
  return (sc ?? []).map(c => c.split(';')[0]).filter(Boolean).join('; ');
}

function extractViewState(html: string): string | null {
  const m = html.match(/<update id="[^"]*ViewState[^"]*"><!\[CDATA\[([^\]]+)\]\]><\/update>/)
    ?? html.match(/javax\.faces\.ViewState[^>]*value="([^"]+)"/);
  return m ? m[1] ?? null : null;
}

function toMin(t: string): number | null {
  const m = t.match(/^(\d{2}):(\d{2})$/);
  return m ? +m[1]! * 60 + +m[2]! : null;
}

function freqAvg(salidas: { desde: string }[]): number {
  const mins = salidas.map(s => toMin(s.desde)).filter((v): v is number => v !== null).sort((a,b)=>a-b);
  if (mins.length < 2) return 0;
  let gap = 0;
  for (let i = 1; i < mins.length; i++) gap += mins[i]! - mins[i-1]!;
  return Math.round(gap / (mins.length - 1));
}

interface Session { client: ReturnType<typeof buildClient>; cookie: string; viewState: string }

async function startSession(): Promise<{ session: Session; catalogo: {token: string; numero: string}[] }> {
  const client = buildClient();
  const res = await client.get(BASE_URL, { headers: { Accept: 'text/html' } });
  const html = res.data as string;
  const cookie = extractCookies(res.headers['set-cookie'] as string[] | undefined);
  const viewState = extractViewState(html);
  if (!cookie || !viewState) throw new Error('STM: no cookie/ViewState en GET inicial');

  // Extraer catálogo de líneas del HTML inicial
  const re = /<option value="(class uy\.gub\.imm\.stm\.core\.stm20\.dto\.LineaDTO@[^"]+)"[^>]*>([^<]+)<\/option>/g;
  const catalogo: {token: string; numero: string}[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && m[2]) catalogo.push({ token: m[1], numero: m[2].trim() });
  }

  return { session: { client, cookie, viewState }, catalogo };
}

async function postAjax(session: Session, params: Record<string, string>): Promise<string> {
  const res = await session.client.post(BASE_URL, new URLSearchParams(params).toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: 'application/xml, text/xml, */*; q=0.01',
      'Faces-Request': 'partial/ajax',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: session.cookie,
    },
  });
  const xml = res.data as string;
  const newVs = extractViewState(xml);
  if (newVs) session.viewState = newVs;
  const c = extractCookies(res.headers['set-cookie'] as string[] | undefined);
  if (c) session.cookie = c;
  return xml;
}

function findTipoDiaToken(html: string, label: string): string | null {
  const re = new RegExp(`value="(class uy\\.gub\\.imm\\.stm\\.core\\.stm20\\.dto\\.TipoDiaDTO[^"]+)"[^>]*>${label}\\s*<`);
  const m = html.match(re);
  return m ? m[1] ?? null : null;
}

function parseTablas(html: string): SalidaHorario[] {
  const tables = html.match(/<table[\s\S]*?<\/table>/g) ?? [];
  const grupos = new Map<string, { origen: string; destino: string; salidas: {desde: string; hacia: string}[] }>();
  for (const t of tables) {
    if (/class="stm-datalist-header"/.test(t)) continue;
    const labels = [...t.matchAll(/<label[^>]*>([^<]+)<\/label>/g)].map(m => (m[1]??'').trim());
    if (labels.length < 2) continue;
    const origen = labels[0]!; const destino = labels[1]!;
    const filas = [...t.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => m[1] ?? '');
    const salidas: {desde: string; hacia: string}[] = [];
    for (const f of filas) {
      const tds = [...f.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => (m[1]??'').trim());
      if (tds[0] && tds[1] && /^\d{2}:\d{2}$/.test(tds[0]) && /^\d{2}:\d{2}$/.test(tds[1]))
        salidas.push({ desde: tds[0], hacia: tds[1] });
    }
    if (!salidas.length) continue;
    const key = `${origen}||${destino}`;
    let g = grupos.get(key);
    if (!g) { g = { origen, destino, salidas: [] }; grupos.set(key, g); }
    g.salidas.push(...salidas);
  }
  const result: SalidaHorario[] = [];
  for (const g of grupos.values()) {
    for (const s of g.salidas) result.push({ ...s, origen: g.origen, destino: g.destino });
  }
  return result.sort((a, b) => a.desde.localeCompare(b.desde));
}

// ── Scrape de una línea ────────────────────────────────────────────────────

async function scrapeLinea(
  session: Session, token: string, lineaNum: string,
): Promise<LineaHorario | null> {
  const dias: Record<string, DiaHorario> = {};

  for (const tipoDia of TIPOS_DIA) {
    try {
      // Seleccionar línea
      const r1 = await postAjax(session, {
        'javax.faces.partial.ajax': 'true',
        'javax.faces.source': 'j_idt26:slLinea',
        'javax.faces.partial.execute': 'j_idt26:slLinea',
        'javax.faces.partial.render': 'j_idt26',
        'javax.faces.behavior.event': 'change',
        'javax.faces.partial.event': 'change',
        j_idt26: 'j_idt26',
        'j_idt26:slLinea_focus': '',
        'j_idt26:slLinea_input': token,
        'javax.faces.ViewState': session.viewState,
      });

      const tipoToken = findTipoDiaToken(r1, tipoDia);
      if (!tipoToken) continue;

      // Seleccionar tipo de día
      await postAjax(session, {
        'javax.faces.partial.ajax': 'true',
        'javax.faces.source': 'j_idt26:j_idt36',
        'javax.faces.partial.execute': 'j_idt26:j_idt36',
        'javax.faces.partial.render': 'j_idt26',
        'javax.faces.behavior.event': 'change',
        'javax.faces.partial.event': 'change',
        j_idt26: 'j_idt26',
        'j_idt26:slLinea_focus': '',
        'j_idt26:slLinea_input': token,
        'j_idt26:j_idt36_focus': '',
        'j_idt26:j_idt36_input': tipoToken,
        'javax.faces.ViewState': session.viewState,
      });

      // Consultar horarios
      const result = await postAjax(session, {
        'javax.faces.partial.ajax': 'true',
        'javax.faces.source': 'j_idt26:btnConsultar',
        'javax.faces.partial.execute': '@all',
        'javax.faces.partial.render': 'j_idt26',
        'j_idt26:btnConsultar': 'j_idt26:btnConsultar',
        j_idt26: 'j_idt26',
        'j_idt26:slLinea_focus': '',
        'j_idt26:slLinea_input': token,
        'j_idt26:j_idt36_focus': '',
        'j_idt26:j_idt36_input': tipoToken,
        'javax.faces.ViewState': session.viewState,
      });

      const salidasTodas = parseTablas(result);
      if (!salidasTodas.length) continue;

      // Agrupar variantes (origen→destino únicos)
      const varMap = new Map<string, { origen: string; destino: string; salidas: {desde: string}[] }>();
      for (const s of salidasTodas) {
        const k = `${s.origen}||${s.destino}`;
        let v = varMap.get(k);
        if (!v) { v = { origen: s.origen, destino: s.destino, salidas: [] }; varMap.set(k, v); }
        v.salidas.push({ desde: s.desde });
      }

      const variantes: VarianteSummary[] = [...varMap.values()].map(v => ({
        origen: v.origen, destino: v.destino,
        frecuenciaMin: freqAvg(v.salidas),
        horaInicio: v.salidas[0]?.desde ?? '',
        horaFin: v.salidas[v.salidas.length - 1]?.desde ?? '',
      })).sort((a, b) => b.frecuenciaMin - a.frecuenciaMin === 0 ? 0 : a.frecuenciaMin - b.frecuenciaMin);

      const freqDominante = variantes[0]?.frecuenciaMin ?? 0;

      dias[tipoDia] = { variantes, salidasTodas, frecuenciaDominanteMin: freqDominante };

      await new Promise(r => setTimeout(r, 400)); // rate-limit
    } catch {
      // tipoDia no disponible para esta línea → skip
    }
  }

  if (!Object.keys(dias).length) return null;
  return { linea: lineaNum, dias, scrapedAt: new Date().toISOString() };
}

// ── Función principal ──────────────────────────────────────────────────────

async function refreshAll(startIdx = 0): Promise<{ processed: number; saved: number; errors: number; nextStart: number }> {
  const { session, catalogo } = await startSession();
  console.log(`[HorariosAll] Catálogo STM: ${catalogo.length} líneas`);

  // Procesar en lotes de 8 con una sola sesión (secuencial para no romper JSF)
  const BATCH = 40; // cuántas líneas por invocación
  const slice = catalogo.slice(startIdx, startIdx + BATCH);

  let saved = 0; let errors = 0;
  for (const linea of slice) {
    try {
      const horario = await scrapeLinea(session, linea.token, linea.numero);
      if (horario) {
        await db.collection(COLLECTION).doc(linea.numero).set({
          ...horario,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        saved++;
        console.log(`[HorariosAll] ✓ ${linea.numero}`);
      }
    } catch (err: any) {
      console.error(`[HorariosAll] ✗ ${linea.numero}: ${err?.message}`);
      errors++;
    }
  }

  return { processed: slice.length, saved, errors, nextStart: startIdx + BATCH };
}

// ── Exports ────────────────────────────────────────────────────────────────

/** HTTP: raspar batch de líneas. ?start=0 para empezar, usar nextStart para continuar. */
export const refreshAllStmHorariosNow = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    try {
      const start = parseInt((req.query.start as string) ?? '0', 10);
      const result = await refreshAll(start);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

/** Cron diario 04:15 — actualiza primer lote (las más usadas están primero en el catálogo) */
export const refreshAllStmHorariosTick = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .pubsub.schedule('15 4 * * *')
  .timeZone('America/Montevideo')
  .onRun(async () => {
    try {
      await refreshAll(0);
    } catch (err: any) {
      console.error('[HorariosAll] Error cron:', err?.message);
    }
    return null;
  });
