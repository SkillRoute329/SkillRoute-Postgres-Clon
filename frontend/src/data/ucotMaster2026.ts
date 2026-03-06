/**
 * Fuente de verdad UCOT 2026. Todo nace de ucot_master_2026.json (gen_ucot_master_2026.py).
 */
import master2026Raw from './ucot_master_2026.json';

export interface Metadatos2026 {
  empresa: string;
  temporada: string;
  flota: number;
  servicios?: number;
  flota_total?: number;
}

export interface Categoria2026 {
  coches: string[];
  tipo?: string;
  descripcion?: string;
  lineas?: string[];
}

export interface MapeoOperativoEntry {
  coche: string;
  linea: string;
  puntos?: string[];
}

interface MapeoInicialItem {
  coche: string;
  servicio: string;
  linea: string;
}

interface RawMaster {
  metadatos?: {
    empresa?: string;
    temporada?: string;
    flota?: number;
    servicios?: number;
    flota_total?: number;
  };
  categorias?: Record<string, Categoria2026 & { descripcion?: string }>;
  mapeo_operativo?: Record<string, MapeoOperativoEntry>;
  mapeo_inicial?: MapeoInicialItem[];
}

const raw = master2026Raw as unknown as RawMaster;

/** Normaliza metadatos (flota_total -> flota). */
const metadatos: Metadatos2026 = {
  empresa: raw.metadatos?.empresa ?? 'UCOT',
  temporada: raw.metadatos?.temporada ?? 'VERANO 2026',
  flota: raw.metadatos?.flota ?? raw.metadatos?.flota_total ?? 137,
  servicios: raw.metadatos?.servicios ?? 163,
};

/** Normaliza categorías (descripcion -> tipo). */
const categorias: Record<string, Categoria2026> = {};
for (const [k, v] of Object.entries(raw.categorias ?? {})) {
  categorias[k] = {
    ...v,
    tipo: v?.tipo ?? (v as Categoria2026 & { descripcion?: string })?.descripcion,
  };
}

/** Construye mapeo_operativo desde mapeo_inicial si no existe. */
function buildMapeoOperativo(): Record<string, MapeoOperativoEntry> {
  if (raw.mapeo_operativo && Object.keys(raw.mapeo_operativo).length > 0) {
    return raw.mapeo_operativo;
  }
  const out: Record<string, MapeoOperativoEntry> = {};
  for (const item of raw.mapeo_inicial ?? []) {
    out[String(item.servicio)] = {
      coche: item.coche,
      linea: item.linea,
      puntos: [],
    };
  }
  return out;
}

const mapeo_operativo = buildMapeoOperativo();

const data = {
  metadatos,
  categorias,
  mapeo_operativo,
};

export function getMaster2026() {
  return data;
}

export function getCochesByCategoria(categoriaId: string): string[] {
  return data.categorias?.[categoriaId]?.coches ?? [];
}

export function getCategoriaByCocheId(cocheId: string): string | null {
  const id = String(cocheId).trim();
  for (const [catId, cat] of Object.entries(data.categorias ?? {})) {
    if (cat.coches?.some((c) => String(c).trim() === id)) return catId;
  }
  return null;
}

export function getCategoriaReemplazoParaAveria(cocheId: string): string | null {
  return getCategoriaByCocheId(cocheId);
}

export function getMapeoOperativo(servicioId: string): MapeoOperativoEntry | null {
  return data.mapeo_operativo?.[String(servicioId)] ?? null;
}

export function getMapeoOperativoByCoche(
  cocheId: string,
): Array<{ servicioId: string; entry: MapeoOperativoEntry }> {
  const id = String(cocheId).trim();
  const out: Array<{ servicioId: string; entry: MapeoOperativoEntry }> = [];
  for (const [servicioId, entry] of Object.entries(data.mapeo_operativo ?? {})) {
    if (entry?.coche && String(entry.coche).trim() === id) out.push({ servicioId, entry });
  }
  return out;
}
