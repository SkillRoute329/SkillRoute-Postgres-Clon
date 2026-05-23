/**
 * cartonOficial.ts (FASE 5.22 — 2026-05-17)
 *
 * FUENTE OFICIAL Y VALIDADA del cartón UCOT: el Excel real
 *   "Cartones habiles desde el 2 de marzo.xls"
 * (autor interno UCOT, una hoja por servicio). Reemplaza al artefacto
 * heurístico servicios_habiles.json, que tenía errores comprobados
 * (p.ej. asignaba el servicio 1020 a la línea 306 cuando 1020 es de la
 * 370 — el XLS oficial lo confirma; la 306 tiene "1020N", otra hoja).
 *
 * Estructura de cada hoja (nombre de hoja = Nº de servicio):
 *   fila 0: rótulos  ["Línea", ... "U.C.O.T." ... "Servicio N°" ...]
 *   fila 1: [LÍNEA, ... régimen ... , Nº SERVICIO, ...]
 *   fila 2: etapas del recorrido (paradas) + "ESPERAS" + etapas de vuelta
 *   filas 4..: vueltas — horas por etapa (col 0 = hora de salida)
 *   resto  : notas / turnos / totales
 *
 * Sólo se exponen datos verificables contra esta fuente. Nada inventado.
 */
import path from 'path';
import fs from 'fs';
import logger from '../config/logger';
// SheetJS ya está en node_modules del backend.
import * as XLSX from 'xlsx';

// Ruta oficial pasada por el operador. Configurable por env si se moviera.
const XLS_PATH =
  process.env.CARTON_XLS_PATH ||
  'C:/Users/Usuario/Desktop/Cartones habiles desde el 2 de marzo.xls';

export interface CartonServicio {
  servicio: string; // id de servicio (nombre de hoja; puede tener sufijo, ej "1020N")
  linea: string; // LÍNEA oficial (fila 1, col 0)
  regimen: string | null; // ej "HABIL INVIERNO 2026 UCOT"
  primeraEtapa: string | null; // origen real del servicio (1ª etapa)
  primeraHora: string | null; // hora de la 1ª salida
  ultimaEtapa: string | null; // última etapa del recorrido
  etapas: string[]; // recorrido (paradas) según cartón
}

interface CartonIndex {
  porServicio: Map<string, CartonServicio>;
  porLinea: Map<string, string[]>; // linea -> [servicios]
  cargadoEn: string;
  archivo: string;
  totalServicios: number;
}

let _idx: CartonIndex | null = null;

const norm = (v: unknown): string => String(v ?? '').trim();
const esHora = (s: string): boolean => /^\d{1,2}:\d{2}$/.test(s.trim());

/** Carga (una vez) y parsea el XLS oficial. Si falla, índice vacío honesto. */
export function cartonIndex(): CartonIndex {
  if (_idx) return _idx;
  const vacio: CartonIndex = {
    porServicio: new Map(),
    porLinea: new Map(),
    cargadoEn: new Date().toISOString(),
    archivo: XLS_PATH,
    totalServicios: 0,
  };
  if (!fs.existsSync(XLS_PATH)) {
    logger.error(`[cartonOficial] XLS oficial no encontrado: ${XLS_PATH}`);
    _idx = vacio;
    return _idx;
  }
  try {
    const wb = XLSX.readFile(XLS_PATH, { cellDates: false });
    const porServicio = new Map<string, CartonServicio>();
    const porLinea = new Map<string, string[]>();

    for (const hoja of wb.SheetNames) {
      const sh = wb.Sheets[hoja];
      if (!sh) continue;
      const r = XLSX.utils.sheet_to_json<string[]>(sh, {
        header: 1,
        defval: '',
        raw: false,
      });
      const fila1 = (r[1] as unknown as string[]) || [];
      const linea = norm(fila1[0]);
      if (!linea || !/^[0-9A-Za-z]+$/.test(linea)) continue; // hoja no-cartón
      const regimen = norm(fila1[5]) || null;

      // Etapas: fila índice 2, nombres no vacíos, sin la columna "ESPERAS".
      const filaEtapas = (r[2] as unknown as string[]) || [];
      const etapas = filaEtapas
        .map(norm)
        .filter((c) => c && c.toUpperCase() !== 'ESPERAS' && !esHora(c));

      // 1ª salida: primera fila de datos con hora en col 0.
      let primeraEtapa: string | null = etapas[0] ?? null;
      let primeraHora: string | null = null;
      for (let i = 3; i < r.length; i++) {
        const c0 = norm((r[i] as unknown as string[])?.[0]);
        if (esHora(c0)) {
          primeraHora = c0;
          break;
        }
      }
      const ultimaEtapa = etapas.length ? etapas[etapas.length - 1] : null;

      const servicio = norm(hoja);
      const cs: CartonServicio = {
        servicio,
        linea,
        regimen,
        primeraEtapa,
        primeraHora,
        ultimaEtapa,
        etapas,
      };
      porServicio.set(servicio, cs);
      const arr = porLinea.get(linea) ?? [];
      arr.push(servicio);
      porLinea.set(linea, arr);
    }

    _idx = {
      porServicio,
      porLinea,
      cargadoEn: new Date().toISOString(),
      archivo: XLS_PATH,
      totalServicios: porServicio.size,
    };
    logger.info(
      `[cartonOficial] XLS oficial cargado: ${_idx.totalServicios} servicios, ` +
        `${porLinea.size} líneas (${path.basename(XLS_PATH)})`,
    );
    return _idx;
  } catch (e) {
    logger.error('[cartonOficial] error parseando XLS', { err: String(e) });
    _idx = vacio;
    return _idx;
  }
}

/** Servicios oficiales de una línea (según el cartón XLS validado). */
export function serviciosOficialesDeLinea(linea: string): CartonServicio[] {
  const idx = cartonIndex();
  const svs = idx.porLinea.get(String(linea).trim()) ?? [];
  return svs
    .map((s) => idx.porServicio.get(s)!)
    .filter(Boolean)
    .sort((a, b) => (a.primeraHora ?? '').localeCompare(b.primeraHora ?? ''));
}

/** Línea oficial de un servicio, o null si no está en el cartón. */
export function lineaOficialDeServicio(servicio: string): string | null {
  return cartonIndex().porServicio.get(String(servicio).trim())?.linea ?? null;
}

/** Metadatos de carga (para la nota de fuentes / auditoría). */
export function cartonMeta(): { archivo: string; totalServicios: number; cargadoEn: string } {
  const i = cartonIndex();
  return { archivo: i.archivo, totalServicios: i.totalServicios, cargadoEn: i.cargadoEn };
}
