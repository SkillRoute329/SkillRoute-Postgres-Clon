/**
 * STM Horarios Scraper Service
 * Scraper de https://www.montevideo.gub.uy/app/stm/horarios/ — la única fuente
 * pública de los horarios reales de TODAS las líneas de Montevideo (UCOT y
 * competencia).
 *
 * Es una app PrimeFaces JSF: requiere mantener `JSESSIONID` cookie +
 * `javax.faces.ViewState` entre POSTs Ajax. El flujo es:
 *   1. GET inicial → cookie + ViewState + select de líneas
 *   2. POST select linea → actualiza form (server bind)
 *   3. POST select tipoDia (Ahora|Hábiles|Sábados|Domingos) → idem
 *   4. POST btnConsultar → devuelve HTML con N tablas (1 por variante de recorrido)
 *
 * Cada variante en la respuesta es una tabla con:
 *   - Row 1: <label>Origen</label>...<label>Destino</label>
 *   - Row 2..K: <td>HH:MM</td><td>HH:MM</td>  (salidas pareadas Desde/Hacia)
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../config/logger';

const BASE_URL = 'https://www.montevideo.gub.uy/app/stm/horarios/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

export type TipoDia = 'Ahora' | 'Hábiles' | 'Sábados' | 'Domingos';

export interface LineaCatalogo {
  numero: string; // "300", "100", "CA1" — string porque hay líneas con letras
  token: string; // "class uy.gub.imm.stm.core.stm20.dto.LineaDTO@159"
}

export interface SalidaHorario {
  desde: string; // HH:MM
  hacia: string; // HH:MM
}

export interface VarianteHorario {
  origen: string;
  destino: string;
  salidas: SalidaHorario[];
}

export interface HorarioLinea {
  linea: string;
  tipoDia: TipoDia;
  variantes: VarianteHorario[];
  totalSalidas: number;
  scrapedAt: string;
}

interface Session {
  client: AxiosInstance;
  cookie: string; // "JSESSIONID=...; otra=..."
  viewState: string;
}

function buildClient(): AxiosInstance {
  return axios.create({
    timeout: 20000,
    // Maxredirect 0: la app no redirige; cualquier 3xx es señal de session bust
    headers: {
      'User-Agent': UA,
      Referer: BASE_URL,
      Origin: 'https://www.montevideo.gub.uy',
    },
    // Permite leer cookies del response sin que axios pierda el header set-cookie
    validateStatus: (s) => s >= 200 && s < 400,
  });
}

function extractCookies(setCookie: string[] | undefined): string {
  if (!setCookie || setCookie.length === 0) return '';
  return setCookie
    .map((c) => c.split(';')[0])
    .filter((c): c is string => Boolean(c))
    .join('; ');
}

function extractViewState(html: string): string | null {
  const m1 = html.match(
    /<update id="[^"]*ViewState[^"]*"><!\[CDATA\[([^\]]+)\]\]><\/update>/
  );
  if (m1) return m1[1] ?? null;
  const m2 = html.match(/javax\.faces\.ViewState[^>]*value="([^"]+)"/);
  return m2 ? m2[1] ?? null : null;
}

function extractLineaCatalogo(html: string): LineaCatalogo[] {
  // <option value="class uy.gub.imm.stm.core.stm20.dto.LineaDTO@123" data-escape="true">300</option>
  const out: LineaCatalogo[] = [];
  const re =
    /<option value="(class uy\.gub\.imm\.stm\.core\.stm20\.dto\.LineaDTO@[^"]+)"[^>]*>([^<]+)<\/option>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!m[1] || !m[2]) continue;
    out.push({ token: m[1], numero: m[2].trim() });
  }
  return out;
}

function findTipoDiaToken(html: string, label: TipoDia): string | null {
  const re = new RegExp(
    `value="(class uy\\.gub\\.imm\\.stm\\.core\\.stm20\\.dto\\.TipoDiaDTO[^"]+)"[^>]*>${label}\\s*<`
  );
  const m = html.match(re);
  return m ? m[1] ?? null : null;
}

/**
 * Parsea la respuesta de btnConsultar.
 *
 * Estructura real del HTML: cada <table> en la respuesta es UN viaje (una salida)
 * de la datalist de PrimeFaces, no una variante completa. Cada tabla tiene:
 *   - Fila 1: <label>Origen</label> ... <label>Destino</label>
 *   - Fila 2: <td>HH:MM (desde)</td><td>HH:MM (hacia)</td><td>botón detalle</td>
 *
 * Agrupamos las salidas por par (origen, destino) para reconstruir las variantes.
 * Para línea 300 hábiles: ~223 tablas → 12 pares O→D únicos.
 */
function parseHorariosHTML(html: string): VarianteHorario[] {
  const tables = html.match(/<table[\s\S]*?<\/table>/g) ?? [];

  const grupos = new Map<string, VarianteHorario>();

  for (const t of tables) {
    if (/class="stm-datalist-header"/.test(t)) continue;

    const labels = [...t.matchAll(/<label[^>]*>([^<]+)<\/label>/g)].map((m) =>
      (m[1] ?? '').trim()
    );
    if (labels.length < 2) continue;
    const origen = labels[0]!;
    const destino = labels[1]!;

    const filas = [...t.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1] ?? '');
    const salidasEnTabla: SalidaHorario[] = [];
    for (const fila of filas) {
      const tds = [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
        (m[1] ?? '').trim()
      );
      const t1 = tds[0];
      const t2 = tds[1];
      if (t1 && t2 && /^\d{2}:\d{2}$/.test(t1) && /^\d{2}:\d{2}$/.test(t2)) {
        salidasEnTabla.push({ desde: t1, hacia: t2 });
      }
    }
    if (salidasEnTabla.length === 0) continue;

    const key = `${origen}||${destino}`;
    let g = grupos.get(key);
    if (!g) {
      g = { origen, destino, salidas: [] };
      grupos.set(key, g);
    }
    g.salidas.push(...salidasEnTabla);
  }

  // Ordenar salidas dentro de cada variante por hora de partida
  const variantes = Array.from(grupos.values());
  for (const v of variantes) {
    v.salidas.sort((a, b) => a.desde.localeCompare(b.desde));
  }
  // Ordenar variantes por número de salidas desc (la principal primero)
  variantes.sort((a, b) => b.salidas.length - a.salidas.length);
  return variantes;
}

async function startSession(): Promise<{ session: Session; html: string }> {
  const client = buildClient();
  const res = await client.get(BASE_URL, { headers: { Accept: 'text/html' } });
  const html = res.data as string;
  const cookie = extractCookies(res.headers['set-cookie'] as string[] | undefined);
  if (!cookie) throw new Error('STM horarios: no se recibió cookie en GET inicial');
  const viewState = extractViewState(html);
  if (!viewState) throw new Error('STM horarios: ViewState no encontrado en GET inicial');
  return { session: { client, cookie, viewState }, html };
}

async function postAjax(
  session: Session,
  params: Record<string, string>
): Promise<string> {
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
  const xml = res.data as string;
  const newVs = extractViewState(xml);
  if (newVs) session.viewState = newVs;
  // Si el servidor renueva cookie, mantenerla
  const refreshed = extractCookies(res.headers['set-cookie'] as string[] | undefined);
  if (refreshed) session.cookie = refreshed;
  return xml;
}

/**
 * Devuelve el catálogo de líneas disponibles (~141 entradas).
 * Una sola llamada GET — barata.
 */
export async function fetchLineCatalog(): Promise<LineaCatalogo[]> {
  const { html } = await startSession();
  // Filtrar el placeholder "Seleccione una línea ..."
  return extractLineaCatalogo(html).filter((l) => !/Seleccione/i.test(l.numero));
}

/**
 * Scrapea horarios de UNA línea para UN tipo de día. ~5 POSTs, ~1-2s.
 * NO reutiliza sesión entre líneas (cada línea abre su propia sesión, más simple).
 */
export async function fetchLineSchedule(
  lineaNumero: string,
  tipoDia: TipoDia = 'Hábiles'
): Promise<HorarioLinea> {
  const started = Date.now();
  const { session, html: initialHtml } = await startSession();

  const catalogo = extractLineaCatalogo(initialHtml);
  const linea = catalogo.find((l) => l.numero === lineaNumero);
  if (!linea) {
    throw new Error(`STM horarios: línea "${lineaNumero}" no encontrada en el catálogo`);
  }

  // PASO 1: select linea
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

  // PASO 2: select tipoDia
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

  // PASO 3: btnConsultar
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

  const ms = Date.now() - started;
  logger.info(
    `[stmHorarios] linea=${lineaNumero} tipoDia=${tipoDia} variantes=${variantes.length} salidas=${totalSalidas} ${ms}ms`
  );

  return {
    linea: lineaNumero,
    tipoDia,
    variantes,
    totalSalidas,
    scrapedAt: new Date().toISOString(),
  };
}

export default { fetchLineCatalog, fetchLineSchedule };
