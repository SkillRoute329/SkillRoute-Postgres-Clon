/**
 * documentParser.ts
 * Parser inteligente de documentos para el Listero UCOT.
 * Soporta: texto pegado, .txt, .csv, .xlsx/.xls, .docx, .pdf (texto extraíble)
 *
 * Normaliza automáticamente:
 * - Números de coche: "Coche 4", "N°4", "04", "4." → "4"
 * - Servicios: "1.079", "1079", "Noc 1048", "Paraliza", "P", "PAR" → forma canónica
 * - Apellidos: distancia Levenshtein para sugerencias de corrección
 */

import * as XLSX from 'xlsx';
import Fuse from 'fuse.js';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface ParsedDistribucion {
  cocheInternalNumber: string;
  servicio: string;          // "1079", "Paraliza", "Noc 1048", etc.
  esParaliza: boolean;
  esNocturno: boolean;
  raw: string;               // línea original tal cual
  warnings: string[];        // advertencias (formato raro, etc.)
}

export interface ParseResult {
  distribuciones: ParsedDistribucion[];
  errors: string[];
  tipoDia?: 'habil' | 'sabado' | 'domingo' | 'festivo';
  totalLineas: number;
  lineasIgnoradas: number;
}

export interface PersonaParsed {
  interno: string;
  apellido: string;
  turno?: 1 | 2 | 3;
  raw: string;
  warnings: string[];
}

export interface PersonaParseResult {
  personas: PersonaParsed[];
  duplicados: { interno: string; apellidos: string[] }[];
  errors: string[];
  totalLineas: number;
  lineasIgnoradas: number;
}

// ─── NORMALIZADORES ───────────────────────────────────────────────────────────

/** Normaliza número de coche: elimina prefijos, ceros iniciales */
function normalizarCoche(raw: string): string {
  return raw
    .replace(/^(coche|n[°º]?|num\.?|número\.?|unidad)/i, '')
    .replace(/[.\-_]/g, '')
    .trim()
    .replace(/^0+(\d)/, '$1'); // "04" → "4"
}

/** Normaliza servicio: "1.079" → "1079", "noc 1048" → "Noc 1048", variantes de paraliza */
function normalizarServicio(raw: string): { servicio: string; esParaliza: boolean; esNocturno: boolean } {
  const s = raw.trim();

  // Paraliza
  if (/^(par(aliza)?\.?|p\.?|libre|descanso|franco|mant\.?|mantenimiento)$/i.test(s)) {
    return { servicio: 'Paraliza', esParaliza: true, esNocturno: false };
  }

  // Nocturno: "Noc 1048", "N 1048", "noc1048"
  const nocMatch = s.match(/^(noc\.?|nocturno|n\.)\s*(\d{4,5})/i);
  if (nocMatch) {
    return { servicio: `Noc ${nocMatch[2]}`, esParaliza: false, esNocturno: true };
  }

  // Número puro con puntos: "1.079" → "1079"
  const numMatch = s.replace(/\./g, '').match(/^\d{4,5}$/);
  if (numMatch) {
    return { servicio: s.replace(/\./g, ''), esParaliza: false, esNocturno: false };
  }

  // Número directo
  if (/^\d{4,5}$/.test(s)) {
    return { servicio: s, esParaliza: false, esNocturno: false };
  }

  return { servicio: s, esParaliza: false, esNocturno: false };
}

// ─── DISTANCIA LEVENSHTEIN ────────────────────────────────────────────────────

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

/** Sugiere el apellido más cercano en el padrón */
export function sugerirApellido(apellido: string, padron: string[]): string | null {
  const norm = apellido.toUpperCase();
  let best: string | null = null;
  let bestDist = 3; // umbral máximo
  for (const p of padron) {
    const d = levenshtein(norm, p.toUpperCase());
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

/** Búsqueda fuzzy sobre el padrón usando Fuse.js */
export function crearBuscadorApellidos(padron: { interno: string; apellido: string }[]) {
  return new Fuse(padron, {
    keys: ['apellido', 'interno'],
    threshold: 0.35,
    includeScore: true,
  });
}

// ─── PARSER DE TEXTO PLANO (informe de tránsito) ──────────────────────────────

/**
 * Parsea texto del informe de tránsito.
 * Formatos aceptados (flexible):
 *   "4 1000"
 *   "Coche 4 - Servicio 1000"
 *   "4 Paraliza"
 *   "4    Noc 1048"
 *   "4, 1000"
 *   Tablas: "4\t1000\tFERREIRA"  (ignora columnas extra)
 */
export function parseTextoInforme(texto: string): ParseResult {
  const lineas = texto.split(/\r?\n/);
  const distribuciones: ParsedDistribucion[] = [];
  const errors: string[] = [];
  let ignoradas = 0;

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (!linea || linea.startsWith('#') || linea.startsWith('//')) continue;

    // Separadores: espacio, tab, coma, guion, punto y coma
    const parts = linea.split(/[\s\t,;]+/).filter(Boolean);
    if (parts.length < 2) { ignoradas++; continue; }

    // Primer token = coche, resto = servicio
    let cocheRaw = parts[0];
    // Si empieza con texto no numérico (ej "Coche"), saltar y tomar el siguiente
    if (!/^\d/.test(cocheRaw) && parts.length > 2) {
      cocheRaw = parts[1];
    }

    const coche = normalizarCoche(cocheRaw);
    if (!/^\d+$/.test(coche)) { ignoradas++; continue; }

    // Servicio: puede ser "Noc 1048" (2 tokens) o "1048" (1 token)
    const servicioRaw = parts
      .slice(parts.indexOf(cocheRaw) + 1)
      .slice(0, /^(noc\.?|nocturno)/i.test(parts[parts.indexOf(cocheRaw) + 1] ?? '') ? 2 : 1)
      .join(' ');

    const { servicio, esParaliza, esNocturno } = normalizarServicio(servicioRaw);
    const warnings: string[] = [];

    if (!servicio) { ignoradas++; continue; }
    if (cocheRaw !== coche) warnings.push(`Coche normalizado: "${cocheRaw}" → "${coche}"`);

    distribuciones.push({ cocheInternalNumber: coche, servicio, esParaliza, esNocturno, raw: linea, warnings });
  }

  return {
    distribuciones,
    errors,
    totalLineas: lineas.length,
    lineasIgnoradas: ignoradas,
  };
}

// ─── PARSER DE XLSX ───────────────────────────────────────────────────────────

export async function parseXLSXInforme(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];

  // Detectar columnas coche/servicio automáticamente
  let colCoche = 0, colServicio = 1;
  const header = (rows[0] ?? []).map((c) => String(c).toLowerCase());
  const cIdx = header.findIndex((h) => /coche|unidad|bus|vehicle/.test(h));
  const sIdx = header.findIndex((h) => /servicio|service|carton|turno/.test(h));
  if (cIdx >= 0) colCoche = cIdx;
  if (sIdx >= 0) colServicio = sIdx;

  const texto = rows
    .slice(1)
    .filter((r) => r[colCoche] && r[colServicio])
    .map((r) => `${r[colCoche]} ${r[colServicio]}`)
    .join('\n');

  return parseTextoInforme(texto);
}

// ─── PARSER DE DOCX ──────────────────────────────────────────────────────────

export async function parseDOCXInforme(file: File): Promise<ParseResult> {
  const mammoth = await import('mammoth');
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return parseTextoInforme(result.value);
}

// ─── PARSER DE TXT / CSV ─────────────────────────────────────────────────────

export async function parseTXTInforme(file: File): Promise<ParseResult> {
  const text = await file.text();
  return parseTextoInforme(text);
}

// ─── PARSER UNIVERSAL (por extensión) ─────────────────────────────────────────

export async function parseDocumentoInforme(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'xlsx' || ext === 'xls') return parseXLSXInforme(file);
  if (ext === 'docx') return parseDOCXInforme(file);
  return parseTXTInforme(file); // txt, csv, o texto pegado
}

// ─── PARSER DE LISTA DE PERSONAL ─────────────────────────────────────────────

/**
 * Parsea planilla de personal.
 * Formatos:
 *   "121 FERREIRA T1"
 *   "121 FERREIRA 1"
 *   "121  FERREIRA"
 *   "FERREIRA, 121"
 */
export function parsePersonalTexto(texto: string, padron?: { interno: string; apellido: string }[]): PersonaParseResult {
  const lineas = texto.split(/\r?\n/);
  const personas: PersonaParsed[] = [];
  const errors: string[] = [];
  const internosVistos = new Map<string, string[]>();
  let ignoradas = 0;

  const fuse = padron ? crearBuscadorApellidos(padron) : null;

  for (const linea of lineas) {
    const raw = linea.trim();
    if (!raw || raw.startsWith('#')) { ignoradas++; continue; }

    const parts = raw.split(/[\s\t,;]+/).filter(Boolean);
    if (parts.length < 2) { ignoradas++; continue; }

    // Detectar si empieza con número (interno) o con apellido
    let interno: string, apellidoRaw: string, turnoRaw: string | undefined;
    if (/^\d+$/.test(parts[0])) {
      interno = parts[0];
      apellidoRaw = parts[1];
      turnoRaw = parts[2];
    } else if (/^\d+$/.test(parts[parts.length - 1])) {
      interno = parts[parts.length - 1];
      apellidoRaw = parts.slice(0, -1).join(' ');
      turnoRaw = undefined;
    } else {
      ignoradas++; continue;
    }

    const apellido = apellidoRaw.toUpperCase().trim();
    const turno = turnoRaw ? (parseInt(turnoRaw.replace(/[^123]/g, '')) as 1 | 2 | 3) || undefined : undefined;
    const warnings: string[] = [];

    // Sugerir corrección si hay padrón y hay diferencia
    if (fuse) {
      const results = fuse.search(apellido);
      if (results.length > 0 && results[0].score! > 0.05) {
        const suggestion = results[0].item;
        if (suggestion.interno !== interno) {
          warnings.push(`¿Quisiste decir "${suggestion.apellido}" (int. ${suggestion.interno})?`);
        }
      }
    }

    // Registrar para detección de duplicados
    const arr = internosVistos.get(interno) ?? [];
    arr.push(apellido);
    internosVistos.set(interno, arr);

    personas.push({ interno, apellido, turno, raw, warnings });
  }

  // Detectar duplicados
  const duplicados = [...internosVistos.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([interno, apellidos]) => ({ interno, apellidos }));

  if (duplicados.length > 0) {
    errors.push(`${duplicados.length} interno(s) duplicados: ${duplicados.map((d) => `${d.interno} (${d.apellidos.join('/')})`).join(', ')}`);
  }

  return { personas, duplicados, errors, totalLineas: lineas.length, lineasIgnoradas: ignoradas };
}

export async function parsePersonalDocumento(file: File, padron?: { interno: string; apellido: string }[]): Promise<PersonaParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  let texto = '';
  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
    texto = rows.map((r) => r.join('\t')).join('\n');
  } else if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    texto = result.value;
  } else {
    texto = await file.text();
  }
  return parsePersonalTexto(texto, padron);
}
