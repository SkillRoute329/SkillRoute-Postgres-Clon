/**
 * fugaParadasService.ts (FASE 5.25 — 2026-05-18)
 *
 * ANÁLISIS PRIMARIO DE FUGA A NIVEL PARADA — sólo data IMM oficial, sin
 * cartón. Para cada línea del operador, INTERANUAL (mismo mes año anterior)
 * y por DÍA HÁBIL, detecta las paradas donde el operador PERDIÓ pasaje y, en
 * esa MISMA parada, qué línea de OTRO operador CRECIÓ — el "quién se llevó
 * el pasaje y dónde", con nombre/calle de la parada (gtfs.stops).
 *
 * Lee el agregado compacto mv_stm_parada_mes (182k filas, verificado offline
 * contra el crudo) — nunca escanea las 66M filas en el request.
 */
import sqlDb from '../config/database';
import logger from '../config/logger';

const EMPRESAS: Record<string, string> = {
  '70': 'UCOT',
  '50': 'CUTCSA',
  '20': 'COME',
  '10': 'COETC',
};

const diasHabilesEnMes = (iso: string): number => {
  const [y, m] = iso.split('-').map(Number);
  let n = 0;
  const d = new Date(Date.UTC(y, m - 1, 1));
  while (d.getUTCMonth() === m - 1) {
    const wd = d.getUTCDay();
    if (wd >= 1 && wd <= 5) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
};
const mesAnioAnterior = (iso: string): string => {
  const [y, m] = iso.split('-').map(Number);
  return `${y - 1}-${String(m).padStart(2, '0')}-01`;
};

export interface ParadaFuga {
  codigoParada: string;
  calle: string | null;
  lat: number | null;
  lon: number | null;
  ucotValDiaActual: number;
  ucotValDiaComparado: number;
  ucotDeltaDiaHabil: number; // negativo = perdió
  rival: {
    linea: string;
    operador: string;
    empresa: string;
    valDiaActual: number;
    valDiaComparado: number;
    deltaDiaHabil: number; // positivo = creció
  } | null;
}
export interface LineaFuga {
  linea: string;
  nombre: string;
  paradasAnalizadas: number;
  paradasConFuga: number;
  fugaTotalValDiaHabil: number; // suma de lo perdido en paradas con rival creciente
  topParadas: ParadaFuga[];
}

export async function generarFugaParadas(op = '70'): Promise<{
  ok: boolean;
  operador: string;
  empresa: string;
  mesAnalizado: string | null;
  mesComparado: string | null;
  baseComparacion: 'INTERANUAL' | 'NINGUNA';
  generadoEn: string;
  totalLineas: number;
  lineas: LineaFuga[];
  nota: string;
}> {
  const ce = Number(op);

  // Meses disponibles (del agregado verificado) y par interanual.
  const mesesRows = (await sqlDb('mv_stm_parada_mes')
    .where('cod_empresa', ce)
    .distinct('mes')
    .orderBy('mes', 'asc')) as Array<{ mes: string | Date }>;
  const mesesISO = mesesRows.map((r) => new Date(r.mes).toISOString().slice(0, 10));
  const mesAct = mesesISO.length ? mesesISO[mesesISO.length - 1] : null;
  const mesYoY = mesAct ? mesAnioAnterior(mesAct) : null;
  const hayYoY = !!(mesYoY && mesesISO.includes(mesYoY));
  const base: 'INTERANUAL' | 'NINGUNA' = hayYoY ? 'INTERANUAL' : 'NINGUNA';

  const vacio = {
    ok: true,
    operador: op,
    empresa: EMPRESAS[op] ?? `Operador ${op}`,
    mesAnalizado: mesAct,
    mesComparado: hayYoY ? mesYoY : null,
    baseComparacion: base,
    generadoEn: new Date().toISOString(),
    totalLineas: 0,
    lineas: [] as LineaFuga[],
    nota:
      'Fuente: STM oficial IMM (mv_stm_parada_mes, agregado verificado offline ' +
      'vs crudo) + gtfs.stops (nombre/calle/coords). Interanual, por día ' +
      'hábil. Sin cartón ni datos simulados.',
  };
  if (!mesAct || !hayYoY || !mesYoY) {
    vacio.nota +=
      ' NO hay base interanual (falta el mismo mes del año anterior) — sin ' +
      'comparación a nivel parada para no inducir sesgo estacional.';
    return vacio;
  }

  const dhAct = diasHabilesEnMes(mesAct);
  const dhYoY = diasHabilesEnMes(mesYoY);

  // (1) Paradas del operador con su día hábil mesAct y mesYoY.
  const ucotQ = await sqlDb.raw(
    `SELECT dsc_linea, codigo_parada,
            MAX(habil) FILTER (WHERE mes = '${mesAct}')  AS h_act,
            MAX(habil) FILTER (WHERE mes = '${mesYoY}')  AS h_yoy
       FROM mv_stm_parada_mes
      WHERE cod_empresa = ${ce} AND mes IN ('${mesAct}','${mesYoY}')
      GROUP BY dsc_linea, codigo_parada`,
  );
  const ucotRows = (ucotQ.rows ?? ucotQ) as Array<{
    dsc_linea: string;
    codigo_parada: string;
    h_act: string | null;
    h_yoy: string | null;
  }>;
  if (ucotRows.length === 0) return vacio;

  // Paradas que toca el operador (para acotar el cruce competidor).
  const paradas = [...new Set(ucotRows.map((r) => String(r.codigo_parada)))].filter((p) =>
    /^[0-9A-Za-z._-]{1,20}$/.test(p),
  );
  const paradasIn = paradas.length ? paradas.map((p) => `'${p}'`).join(',') : `'__none__'`;

  // (2) Competidores (otro operador) en ESAS paradas, interanual.
  const rivQ = await sqlDb.raw(
    `SELECT cod_empresa, dsc_linea, codigo_parada,
            MAX(habil) FILTER (WHERE mes = '${mesAct}') AS h_act,
            MAX(habil) FILTER (WHERE mes = '${mesYoY}') AS h_yoy
       FROM mv_stm_parada_mes
      WHERE cod_empresa <> ${ce}
        AND mes IN ('${mesAct}','${mesYoY}')
        AND codigo_parada IN (${paradasIn})
      GROUP BY cod_empresa, dsc_linea, codigo_parada`,
  );
  const rivRows = (rivQ.rows ?? rivQ) as Array<{
    cod_empresa: number;
    dsc_linea: string;
    codigo_parada: string;
    h_act: string | null;
    h_yoy: string | null;
  }>;
  // Mejor rival creciente por parada (mayor crecimiento día hábil).
  const rivalPorParada = new Map<
    string,
    { linea: string; operador: string; empresa: string; vAct: number; vYoY: number; d: number }
  >();
  for (const r of rivRows) {
    const vAct = Math.round(Number(r.h_act ?? 0) / dhAct);
    const vYoY = Math.round(Number(r.h_yoy ?? 0) / dhYoY);
    const d = vAct - vYoY;
    if (d <= 0) continue; // sólo rivales que CRECIERON
    const k = String(r.codigo_parada);
    const cur = rivalPorParada.get(k);
    if (!cur || d > cur.d) {
      rivalPorParada.set(k, {
        linea: String(r.dsc_linea),
        operador: String(r.cod_empresa),
        empresa: EMPRESAS[String(r.cod_empresa)] ?? `Op ${r.cod_empresa}`,
        vAct,
        vYoY,
        d,
      });
    }
  }

  // (3) Nombre/calle/coords de las paradas (gtfs.stops oficial).
  const stopsQ = await sqlDb.raw(
    `SELECT stop_code, MAX(stop_name) AS nom,
            AVG(stop_lat) AS lat, AVG(stop_lon) AS lon
       FROM gtfs.stops
      WHERE stop_code IN (${paradasIn})
      GROUP BY stop_code`,
  );
  const stopMeta = new Map<string, { nom: string | null; lat: number | null; lon: number | null }>();
  for (const s of (stopsQ.rows ?? stopsQ) as Array<{
    stop_code: string;
    nom: string | null;
    lat: number | null;
    lon: number | null;
  }>) {
    stopMeta.set(String(s.stop_code), {
      nom: s.nom ?? null,
      lat: s.lat != null ? Number(s.lat) : null,
      lon: s.lon != null ? Number(s.lon) : null,
    });
  }

  // (4) Nombre canónico de la línea (route_long_name más frecuente).
  const nmQ = await sqlDb.raw(
    `SELECT linea, nombre FROM (
       SELECT r.route_short_name AS linea, r.route_long_name AS nombre,
              ROW_NUMBER() OVER (PARTITION BY r.route_short_name
                                 ORDER BY COUNT(*) DESC) rn
         FROM gtfs.routes r JOIN gtfs.trips t ON t.route_id=r.route_id
        GROUP BY r.route_short_name, r.route_long_name
     ) z WHERE rn = 1`,
  );
  const tc = (s: string) =>
    String(s || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  const nombreLinea = new Map<string, string>();
  for (const r of (nmQ.rows ?? nmQ) as Array<{ linea: string; nombre: string }>) {
    const parts = String(r.nombre || '')
      .split(/\s*--\s*|\s+-\s+|\s*-\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
    nombreLinea.set(
      String(r.linea),
      parts.length >= 2 ? `${tc(parts[0])} → ${tc(parts[parts.length - 1])}` : tc(r.nombre),
    );
  }

  // (5) Armar por línea: paradas donde el operador perdió y un rival creció.
  const porLinea = new Map<string, ParadaFuga[]>();
  const analizadasPorLinea = new Map<string, number>();
  for (const r of ucotRows) {
    const linea = String(r.dsc_linea);
    analizadasPorLinea.set(linea, (analizadasPorLinea.get(linea) ?? 0) + 1);
    const vAct = Math.round(Number(r.h_act ?? 0) / dhAct);
    const vYoY = Math.round(Number(r.h_yoy ?? 0) / dhYoY);
    const dUcot = vAct - vYoY;
    if (dUcot >= 0) continue; // sólo paradas donde el operador PERDIÓ
    const k = String(r.codigo_parada);
    const riv = rivalPorParada.get(k) ?? null;
    if (!riv) continue; // sólo si hay rival que creció en esa misma parada
    const sm = stopMeta.get(k);
    const arr = porLinea.get(linea) ?? [];
    arr.push({
      codigoParada: k,
      calle: sm?.nom ?? null,
      lat: sm?.lat ?? null,
      lon: sm?.lon ?? null,
      ucotValDiaActual: vAct,
      ucotValDiaComparado: vYoY,
      ucotDeltaDiaHabil: dUcot,
      rival: {
        linea: riv.linea,
        operador: riv.operador,
        empresa: riv.empresa,
        valDiaActual: riv.vAct,
        valDiaComparado: riv.vYoY,
        deltaDiaHabil: riv.d,
      },
    });
    porLinea.set(linea, arr);
  }

  const lineas: LineaFuga[] = [];
  for (const [linea, ps] of porLinea) {
    ps.sort((a, b) => a.ucotDeltaDiaHabil - b.ucotDeltaDiaHabil); // más perdido primero
    lineas.push({
      linea,
      nombre: nombreLinea.get(linea) ?? `Línea ${linea}`,
      paradasAnalizadas: analizadasPorLinea.get(linea) ?? ps.length,
      paradasConFuga: ps.length,
      fugaTotalValDiaHabil: ps.reduce((s, p) => s + p.ucotDeltaDiaHabil, 0),
      topParadas: ps.slice(0, 10),
    });
  }
  lineas.sort((a, b) => a.fugaTotalValDiaHabil - b.fugaTotalValDiaHabil);

  logger.info(
    `[fugaParadas] op ${op}: ${lineas.length} líneas con fuga de parada, ` +
      `${mesAct} vs ${mesYoY}`,
  );

  return {
    ok: true,
    operador: op,
    empresa: EMPRESAS[op] ?? `Operador ${op}`,
    mesAnalizado: mesAct,
    mesComparado: mesYoY,
    baseComparacion: base,
    generadoEn: new Date().toISOString(),
    totalLineas: lineas.length,
    lineas,
    nota:
      'Fuente: STM oficial IMM (mv_stm_parada_mes, agregado verificado ' +
      'offline vs crudo) + gtfs.stops (calle/coords). Interanual ' +
      `${mesAct} vs ${mesYoY}, por día hábil. Una parada entra sólo si el ` +
      'operador perdió Y una línea de otro operador creció en esa MISMA ' +
      'parada. Sin cartón ni datos simulados.',
  };
}
