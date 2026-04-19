/**
 * STM Horarios Scraper (Cloud Function edition)
 * Scrapea https://www.montevideo.gub.uy/app/stm/horarios/ (PrimeFaces JSF).
 * Mantiene JSESSIONID + ViewState entre POSTs Ajax.
 *
 * Portado desde backend/src/services/stmHorariosScraperService.ts eliminando
 * la dependencia de logger y dejando todo self-contained.
 */

import axios, { AxiosInstance } from 'axios';

const BASE_URL = 'https://www.montevideo.gub.uy/app/stm/horarios/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

export type TipoDia = 'Ahora' | 'Hábiles' | 'Sábados' | 'Domingos';

export interface LineaCatalogo {
  numero: string;
  token: string;
}

export interface SalidaHorario {
  desde: string;
  hacia: string;
}

export interface VarianteHorario {
  origen: string;
  destino: string;
  salidas: SalidaHorario[];
  frecuenciaMin: number;
  horaInicio: string;
  horaFin: string;
}

export interface HorarioLinea {
  linea: string;
  tipoDia: TipoDia;
  variantes: VarianteHorario[];
  totalSalidas: number;
  frecuenciaDominanteMin: number;
  scrapedAt: string;
}

interface Session {
  client: AxiosInstance;
  cookie: string;
  viewState: string;
}

function buildClient(): AxiosInstance {
  return axios.create({
    timeout: 20000,
    headers: {
      'User-Agent': UA,
      Referer: BASE_URL,
      Origin: 'https://www.montevideo.gub.uy',
    },
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

function hhmmToMin(s: string): number | null {
  const m = s.match(/^(\d{2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function freqAvgMin(salidas: SalidaHorario[]): number {
  if (salidas.length < 2) return 0;
  const mins = salidas
    .map((s) => hhmmToMin(s.desde))
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);
  if (mins.length < 2) return 0;
  let gap = 0;
  for (let i = 1; i < mins.length; i++) gap += mins[i]! - mins[i - 1]!;
  return Math.round(gap / (mins.length - 1));
}

function parseHorariosHTML(html: string): VarianteHorario[] {
  const tables = html.match(/<table[\s\S]*?<\/table>/g) ?? [];
  const grupos = new Map<string, { origen: string; destino: string; salidas: SalidaHorario[] }>();

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

  const variantes: VarianteHorario[] = [];
  for (const g of grupos.values()) {
    g.salidas.sort((a, b) => a.desde.localeCompare(b.desde));
    variantes.push({
      origen: g.origen,
      destino: g.destino,
      salidas: g.salidas,
      frecuenciaMin: freqAvgMin(g.salidas),
      horaInicio: g.salidas[0]?.desde ?? '',
      horaFin: g.salidas[g.salidas.length - 1]?.desde ?? '',
    });
  }
  variantes.sort((a, b) => b.salidas.length - a.salidas.length);
  return variantes;
}

async function startSession(): Promise<{ session: Session; html: string }> {
  const client = buildClient();
  const res = await client.get(BASE_URL, { headers: { Accept: 'text/html' } });
  const html = res.data as string;
  const cookie = extractCookies(res.headers['set-cookie'] as string[] | undefined);
  if (!cookie) throw new Error('STM horarios: sin cookie en GET inicial');
  const viewState = extractViewState(html);
  if (!viewState) throw new Error('STM horarios: ViewState no encontrado');
  return { session: { client, cookie, viewState }, html };
}

async function postAjax(session: Session, params: Record<string, string>): Promise<string> {
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
  const refreshed = extractCookies(res.headers['set-cookie'] as string[] | undefined);
  if (refreshed) session.cookie = refreshed;
  return xml;
}

export async function fetchLineSchedule(
  lineaNumero: string,
  tipoDia: TipoDia = 'Hábiles'
): Promise<HorarioLinea> {
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
export function frecuenciaProgramadaParaHora(
  horario: HorarioLinea,
  hhmm: string,
  ventanaMin = 60
): number | null {
  const target = hhmmToMin(hhmm);
  if (target === null) return null;
  const half = ventanaMin / 2;
  let count = 0;
  for (const v of horario.variantes) {
    for (const s of v.salidas) {
      const m = hhmmToMin(s.desde);
      if (m === null) continue;
      if (m >= target - half && m <= target + half) count++;
    }
  }
  if (count < 2) {
    // Fallback: frecuencia dominante global
    return horario.frecuenciaDominanteMin > 0 ? horario.frecuenciaDominanteMin : null;
  }
  return Math.round(ventanaMin / count);
}
