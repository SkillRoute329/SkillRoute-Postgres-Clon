/**
 * recomendacionesService — MOTOR DE RECOMENDACIONES (FASE 5.18).
 *
 * El centro de comando observó que el sistema "solo muestra datos que ya
 * tienen y no recomienda nada, ni por operador ni globalmente". Esto lo
 * resuelve: genera ACCIONES concretas, ranqueadas por prioridad, con la
 * EVIDENCIA real que las sustenta (sin fabricar números). Dos ámbitos:
 *
 *  - OPERADOR: lo que cada operador debería corregir hoy (no salió,
 *    atraso sistemático, cobertura GPS baja).
 *  - GLOBAL (cross-operador): lo que NINGÚN operador puede ver solo —
 *    déficit de oferta vs demanda real STM por corredor/franja, y
 *    solapamiento entre operadores distintos (corridor_overlap real)
 *    que exige coordinar frecuencias. Este es el diferencial del centro.
 *
 * Fuentes 100% reales: mv_fleet_ranking_diario (GPS), cartones_completados
 * (rotación), mv_stm_linea_resumen (demanda STM oficial), corridor_overlap
 * (DRO geométrico real). NADA hardcodeado.
 */
import sqlDb from '../config/database';
import logger from '../config/logger';
import { mismaLinea } from '../utils/lineaUcot';

const OPERADOR: Record<string, string> = { '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT' };

export interface Recomendacion {
  ambito: 'OPERADOR' | 'GLOBAL';
  tipo: string;
  prioridad: number; // 1..5 (5 = crítica)
  operador: string | null;
  linea: string | null;
  titulo: string;
  evidencia: Record<string, unknown>;
  accion: string;
}

const TOL = 4; // política OTP única ±4 min IMM

/**
 * FASE 5.20 — propagación de red: por cada línea, cuántos transbordos/mes
 * salen de ella hacia otras (matriz OD real STM, id_viaje). Una recomendación
 * sobre una línea HUB no es aislada: impacta a esos pasajeros. Se carga 1×
 * (la tabla del mes es chica) y se cachea por proceso.
 */
type PropRed = { total: number; top: Array<{ linea: string; tb: number }> };
let _mapaProp: Map<string, PropRed> | null = null;
let _mapaPropMes: string | null = null;

async function getMapaPropagacion(): Promise<{ mes: string | null; mapa: Map<string, PropRed> }> {
  const mesRow = (await sqlDb('stm_transbordos_mensual').max('mes as m').first()) as
    | { m: string }
    | undefined;
  const mes = mesRow?.m ? new Date(mesRow.m).toISOString().slice(0, 10) : null;
  if (_mapaProp && _mapaPropMes === mes) return { mes, mapa: _mapaProp };
  const mapa = new Map<string, PropRed>();
  if (mes) {
    const rows = (await sqlDb('stm_transbordos_mensual')
      .where('mes', mesRow!.m)
      .select('linea_origen', 'linea_destino')
      .sum({ tb: 'transbordos' })
      .groupBy('linea_origen', 'linea_destino')) as Array<{
      linea_origen: string;
      linea_destino: string;
      tb: string;
    }>;
    for (const r of rows) {
      const o = String(r.linea_origen);
      const n = Number(r.tb);
      const e = mapa.get(o) ?? { total: 0, top: [] };
      e.total += n;
      e.top.push({ linea: String(r.linea_destino), tb: n });
      mapa.set(o, e);
    }
    for (const e of mapa.values()) {
      e.top.sort((a, b) => b.tb - a.tb);
      e.top = e.top.slice(0, 4);
    }
  }
  _mapaProp = mapa;
  _mapaPropMes = mes;
  return { mes, mapa };
}

/** Recomendaciones por operador a partir de la operación real del día. */
async function porOperador(agencyId: string, fecha: string): Promise<Recomendacion[]> {
  const recs: Recomendacion[] = [];
  const { mapa: mapaProp } = await getMapaPropagacion();
  const opName = OPERADOR[agencyId] ?? agencyId;

  // 1. Coches que NO salieron (cartón asignado sin GPS) — crítico.
  const noSalio = (await sqlDb.raw(
    `SELECT cc.vehiculo_id, cc.service_number,
            CASE WHEN cc.line = chr(63) THEN NULL ELSE cc.line END AS line
       FROM cartones_completados cc
      WHERE cc.agency_id = ?
        AND cc.updated_at::date = ?::date
        AND cc.vehiculo_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM mv_fleet_ranking_diario m
           WHERE m.agency_id = ? AND m.fecha = ?::date
             AND m.id_bus = cc.vehiculo_id AND m.total >= 30)
      LIMIT 50`,
    [agencyId, fecha, agencyId, fecha],
  )).rows as Array<{ vehiculo_id: string; service_number: string; line: string | null }>;
  if (noSalio.length > 0) {
    recs.push({
      ambito: 'OPERADOR',
      tipo: 'COCHES_NO_SALIERON',
      prioridad: 5,
      operador: opName,
      linea: null,
      titulo: `${noSalio.length} coche(s) con servicio asignado sin operación GPS`,
      evidencia: { coches: noSalio.slice(0, 15).map((r) => ({ coche: r.vehiculo_id, servicio: r.service_number, linea: r.line })) },
      accion: `Cubrir esos servicios con coches de reserva o reasignar. Verificar causa (mecánica/energía/personal) por coche.`,
    });
  }

  // 2. Atraso sistemático por línea (desvío medio > tolerancia, ≥2 coches).
  const atraso = (await sqlDb.raw(
    `SELECT unnest(lineas) AS linea,
            count(DISTINCT id_bus) AS coches,
            round(avg(desv_media_sum)::numeric,1) AS desv_medio,
            sum(atrasado) AS atrasados, sum(en_tiempo)+sum(atrasado)+sum(adelantado) AS evaluables
       FROM mv_fleet_ranking_diario
      WHERE agency_id = ? AND fecha = ?::date
      GROUP BY 1
     HAVING count(DISTINCT id_bus) >= 2 AND avg(desv_media_sum) > ?
      ORDER BY avg(desv_media_sum) DESC
      LIMIT 12`,
    [agencyId, fecha, TOL],
  )).rows as Array<{ linea: string; coches: string; desv_medio: string; atrasados: string; evaluables: string }>;
  for (const a of atraso) {
    const d = Number(a.desv_medio);
    // Propagación de red (OD real): ¿esta línea alimenta a otras?
    let prop: PropRed | undefined;
    for (const [o, p] of mapaProp) {
      if (mismaLinea(o, a.linea)) {
        prop = p;
        break;
      }
    }
    const esHub = !!prop && prop.total >= 50000;
    const prioridad = esHub ? 5 : d > 8 ? 4 : 3;
    const accionRed = prop
      ? ` Atención RED: la línea ${a.linea} alimenta ${prop.total.toLocaleString()} transbordos/mes hacia ${prop.top
          .map((t) => t.linea)
          .join(', ')} — su atraso se propaga a esos pasajeros (no es un problema aislado).`
      : '';
    recs.push({
      ambito: 'OPERADOR',
      tipo: 'ATRASO_SISTEMATICO_LINEA',
      prioridad,
      operador: opName,
      linea: a.linea,
      titulo: `Línea ${a.linea}: atraso sistemático +${d} min en ${a.coches} coches${esHub ? ' (HUB de red)' : ''}`,
      evidencia: {
        desvioMedioVsImmMin: d,
        coches: Number(a.coches),
        atrasados: Number(a.atrasados),
        evaluables: Number(a.evaluables),
        transbordosMesQueAlimenta: prop?.total ?? 0,
        propagaA: prop?.top ?? [],
      },
      accion: `Adelantar salidas de terminal y/o reforzar frecuencia en la franja afectada; revisar tiempos de ESPERA del cartón en línea ${a.linea}.${accionRed}`,
    });
  }

  // 3. Cobertura GPS baja (mucho SIN_HORARIO) — no auditable para IMM.
  const cob = (await sqlDb.raw(
    `SELECT unnest(lineas) AS linea, sum(sin_horario) sh, sum(total) tot
       FROM mv_fleet_ranking_diario
      WHERE agency_id = ? AND fecha = ?::date
      GROUP BY 1
     HAVING sum(total) > 200 AND sum(sin_horario)::numeric/NULLIF(sum(total),0) > 0.5
      ORDER BY sum(sin_horario)::numeric/NULLIF(sum(total),0) DESC
      LIMIT 8`,
    [agencyId, fecha],
  )).rows as Array<{ linea: string; sh: string; tot: string }>;
  for (const c of cob) {
    const pct = Math.round((Number(c.sh) / Number(c.tot)) * 100);
    recs.push({
      ambito: 'OPERADOR',
      tipo: 'COBERTURA_GPS_BAJA',
      prioridad: 2,
      operador: opName,
      linea: c.linea,
      titulo: `Línea ${c.linea}: ${pct}% de eventos sin horario (no auditable)`,
      evidencia: { pctSinHorario: pct, sinHorario: Number(c.sh), total: Number(c.tot) },
      accion: `Auditar AVL/sentido en línea ${c.linea}: ${pct}% de la operación no es medible vs IMM (sin match de horario).`,
    });
  }
  return recs;
}

/** Recomendaciones GLOBALES cross-operador — el diferencial del centro. */
async function global(fecha: string): Promise<Recomendacion[]> {
  const recs: Recomendacion[] = [];

  // 3-bis. LÍNEAS-HUB de la red (matriz OD real): las que más alimentan
  // transbordos al sistema. Son críticas — proteger su regularidad tiene
  // efecto multiplicador. Ningún operador ve esto solo.
  const { mes: propMes, mapa: mapaProp } = await getMapaPropagacion();
  if (propMes && mapaProp.size > 0) {
    const hubs = [...mapaProp.entries()]
      .map(([linea, p]) => ({ linea, total: p.total, top: p.top }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
    for (const h of hubs) {
      recs.push({
        ambito: 'GLOBAL',
        tipo: 'LINEA_HUB_RED',
        prioridad: h.total >= 200000 ? 5 : 4,
        operador: null,
        linea: h.linea,
        titulo: `Línea ${h.linea} es HUB de red: ${h.total.toLocaleString()} transbordos/mes`,
        evidencia: {
          transbordosMes: h.total,
          alimentaA: h.top,
          mes: propMes.slice(0, 7),
        },
        accion: `Priorizar la regularidad de la línea ${h.linea}: alimenta ${h.total.toLocaleString()} transbordos/mes hacia ${h.top
          .map((t) => t.linea)
          .join(', ')}. Una falla acá degrada el viaje de muchos más pasajeros que su propia demanda directa — efecto multiplicador en la red.`,
      });
    }
  }

  // 4. Solapamiento entre operadores DISTINTOS (corridor_overlap real):
  //    competencia destructiva / headway descoordinado en un corredor.
  const ov = (await sqlDb.raw(
    `SELECT agency_a, agency_b, linea_a, linea_b,
            GREATEST(pct_a_in_b, COALESCE(pct_b_in_a,0)) AS pct, shared_km, tier
       FROM corridor_overlap
      WHERE agency_a <> agency_b
        AND GREATEST(pct_a_in_b, COALESCE(pct_b_in_a,0)) >= 50
        AND shared_km >= 2
      ORDER BY shared_km DESC, pct DESC
      LIMIT 12`,
  )).rows as Array<{ agency_a: string; agency_b: string; linea_a: string; linea_b: string; pct: string; shared_km: string; tier: string }>;
  for (const o of ov) {
    const pct = Math.round(Number(o.pct));
    const km = Number(o.shared_km);
    recs.push({
      ambito: 'GLOBAL',
      tipo: 'SOLAPAMIENTO_CROSS_OPERADOR',
      prioridad: pct >= 75 ? 4 : 3,
      operador: `${OPERADOR[o.agency_a] ?? o.agency_a} ↔ ${OPERADOR[o.agency_b] ?? o.agency_b}`,
      linea: `${o.linea_a} / ${o.linea_b}`,
      titulo: `Línea ${o.linea_a} (${OPERADOR[o.agency_a] ?? o.agency_a}) y ${o.linea_b} (${OPERADOR[o.agency_b] ?? o.agency_b}) comparten ${km.toFixed(1)} km (${pct}%)`,
      evidencia: { pctSolapamiento: pct, sharedKm: km, tier: o.tier, geometriaReal: true },
      accion: `Coordinar frecuencias entre ${OPERADOR[o.agency_a] ?? o.agency_a} y ${OPERADOR[o.agency_b] ?? o.agency_b} en el corredor compartido: alternar salidas para no superponer (evitar bunching inter-operador y vacío de servicio). Decisión que solo el centro unificado puede tomar.`,
    });
  }

  // 5. Déficit oferta vs demanda real STM por línea/franja (cross-operador):
  //    demanda STM alta (mes más reciente) con poca oferta GPS hoy.
  const mesRow = (await sqlDb('mv_stm_linea_resumen').max('mes as m').first()) as { m: string } | undefined;
  if (mesRow?.m) {
    // Demanda STM por línea (mes más reciente, franja de servicio).
    const dem = (await sqlDb.raw(
      `SELECT cod_empresa, dsc_linea, sum(validaciones) val
         FROM mv_stm_linea_resumen
        WHERE mes = ? AND hora BETWEEN 6 AND 21
        GROUP BY 1,2
       HAVING sum(validaciones) > 5000
        ORDER BY val DESC
        LIMIT 60`,
      [mesRow.m],
    )).rows as Array<{ cod_empresa: number; dsc_linea: string; val: string }>;

    // Oferta GPS de HOY por línea — desde la MV chica (10k filas, <100ms),
    // NO escaneando vehicle_events (28M, timeout). lineas[] por coche/día.
    const sup = (await sqlDb.raw(
      `SELECT l AS linea, sum(total) eventos
         FROM mv_fleet_ranking_diario, unnest(lineas) AS l
        WHERE fecha = ?::date
        GROUP BY 1`,
      [fecha],
    )).rows as Array<{ linea: string; eventos: string }>;
    const supRows = sup.map((s) => ({ linea: String(s.linea), ev: Number(s.eventos) }));
    const ofertaDe = (lin: string): number =>
      supRows.filter((s) => mismaLinea(s.linea, lin)).reduce((a, s) => a + s.ev, 0);

    const deficits = dem
      .map((d) => ({ ...d, val: Number(d.val), eventos: ofertaDe(d.dsc_linea) }))
      // demanda STM alta y oferta GPS de hoy nula/escasa para esa línea
      .filter((d) => d.eventos < 200)
      .slice(0, 10);
    for (const d of deficits) {
      recs.push({
        ambito: 'GLOBAL',
        tipo: 'DEFICIT_OFERTA_DEMANDA',
        prioridad: d.val > 50000 ? 5 : 4,
        operador: OPERADOR[String(d.cod_empresa)] ?? String(d.cod_empresa),
        linea: d.dsc_linea,
        titulo: `Línea ${d.dsc_linea}: demanda STM alta (${d.val.toLocaleString()} validaciones/mes) con oferta GPS casi nula hoy`,
        evidencia: {
          demandaValidacionesMes: d.val,
          eventosGpsHoy: d.eventos,
          mesDemanda: new Date(mesRow.m).toISOString().slice(0, 7),
        },
        accion: `Verificar y reforzar la línea ${d.dsc_linea}: la demanda histórica STM es de las más altas del sistema y hoy casi no registra operación GPS. Posible servicio caído o pérdida masiva de pasaje (revisar también si es problema de captura AVL).`,
      });
    }
  }
  return recs;
}

export interface RecomendacionesResultado {
  ok: boolean;
  fecha: string;
  generadoEn: string;
  resumen: { total: number; criticas: number; porOperador: number; globales: number };
  recomendaciones: Recomendacion[];
}

export async function generarRecomendaciones(
  fecha: string,
  agencyIds: string[] = ['70', '50', '20', '10'],
): Promise<RecomendacionesResultado> {
  const recs: Recomendacion[] = [];
  for (const a of agencyIds) {
    try {
      recs.push(...(await porOperador(a, fecha)));
    } catch (e) {
      logger.error(`[recomendaciones] operador ${a}`, { err: String(e) });
    }
  }
  try {
    recs.push(...(await global(fecha)));
  } catch (e) {
    logger.error('[recomendaciones] global', { err: String(e) });
  }
  recs.sort((x, y) => y.prioridad - x.prioridad);
  return {
    ok: true,
    fecha,
    generadoEn: new Date().toISOString(),
    resumen: {
      total: recs.length,
      criticas: recs.filter((r) => r.prioridad >= 4).length,
      porOperador: recs.filter((r) => r.ambito === 'OPERADOR').length,
      globales: recs.filter((r) => r.ambito === 'GLOBAL').length,
    },
    recomendaciones: recs,
  };
}
