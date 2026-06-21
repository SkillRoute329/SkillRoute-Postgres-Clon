"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generarRecomendaciones = generarRecomendaciones;
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
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const lineaUcot_1 = require("../utils/lineaUcot");
const OPERADOR = { '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT' };
const TOL = 4; // política OTP única ±4 min IMM
let _mapaProp = null;
let _mapaPropMes = null;
async function getMapaPropagacion() {
    const mesRow = (await (0, database_1.default)('stm_transbordos_mensual').max('mes as m').first());
    const mes = mesRow?.m ? new Date(mesRow.m).toISOString().slice(0, 10) : null;
    if (_mapaProp && _mapaPropMes === mes)
        return { mes, mapa: _mapaProp };
    const mapa = new Map();
    if (mes) {
        const rows = (await (0, database_1.default)('stm_transbordos_mensual')
            .where('mes', mesRow.m)
            .select('linea_origen', 'linea_destino')
            .sum({ tb: 'transbordos' })
            .groupBy('linea_origen', 'linea_destino'));
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
async function porOperador(agencyId, fecha) {
    const recs = [];
    const { mapa: mapaProp } = await getMapaPropagacion();
    const opName = OPERADOR[agencyId] ?? agencyId;
    // 1. Coches que NO salieron (cartón asignado sin GPS) — crítico.
    const noSalio = (await database_1.default.raw(`SELECT cc.vehiculo_id, cc.service_number,
            CASE WHEN cc.line = chr(63) THEN NULL ELSE cc.line END AS line
       FROM cartones_completados cc
      WHERE cc.agency_id = ?
        AND COALESCE((cc.data_jsonb ->> 'timestamp')::timestamptz::date, cc.updated_at::date) = ?::date
        AND cc.vehiculo_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM mv_fleet_ranking_diario m
           WHERE m.agency_id = ? AND m.fecha = ?::date
             AND m.id_bus = cc.vehiculo_id AND m.total >= 30)
      LIMIT 50`, [agencyId, fecha, agencyId, fecha])).rows;
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
    const atraso = (await database_1.default.raw(`SELECT unnest(lineas) AS linea,
            count(DISTINCT id_bus) AS coches,
            round(avg(desv_media_sum)::numeric,1) AS desv_medio,
            sum(atrasado) AS atrasados, sum(en_tiempo)+sum(atrasado)+sum(adelantado) AS evaluables
       FROM mv_fleet_ranking_diario
      WHERE agency_id = ? AND fecha = ?::date
      GROUP BY 1
     HAVING count(DISTINCT id_bus) >= 2 AND avg(desv_media_sum) > ?
      ORDER BY avg(desv_media_sum) DESC
      LIMIT 12`, [agencyId, fecha, TOL])).rows;
    for (const a of atraso) {
        const d = Number(a.desv_medio);
        // Propagación de red (OD real): ¿esta línea alimenta a otras?
        let prop;
        for (const [o, p] of mapaProp) {
            if ((0, lineaUcot_1.mismaLinea)(o, a.linea)) {
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
    const cob = (await database_1.default.raw(`SELECT unnest(lineas) AS linea, sum(sin_horario) sh, sum(total) tot
       FROM mv_fleet_ranking_diario
      WHERE agency_id = ? AND fecha = ?::date
      GROUP BY 1
     HAVING sum(total) > 200 AND sum(sin_horario)::numeric/NULLIF(sum(total),0) > 0.5
      ORDER BY sum(sin_horario)::numeric/NULLIF(sum(total),0) DESC
      LIMIT 8`, [agencyId, fecha])).rows;
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
async function global(fecha) {
    const recs = [];
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
    const ov = (await database_1.default.raw(`SELECT agency_a, agency_b, linea_a, linea_b,
            GREATEST(pct_a_in_b, COALESCE(pct_b_in_a,0)) AS pct, shared_km, tier
       FROM corridor_overlap
      WHERE agency_a <> agency_b
        AND GREATEST(pct_a_in_b, COALESCE(pct_b_in_a,0)) >= 50
        AND shared_km >= 2
      ORDER BY shared_km DESC, pct DESC
      LIMIT 12`)).rows;
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
    const mesRow = (await (0, database_1.default)('mv_stm_linea_resumen').max('mes as m').first());
    if (mesRow?.m) {
        // Demanda STM por línea (mes más reciente, franja de servicio).
        const dem = (await database_1.default.raw(`SELECT cod_empresa, dsc_linea, sum(validaciones) val
         FROM mv_stm_linea_resumen
        WHERE mes = ? AND hora BETWEEN 6 AND 21
        GROUP BY 1,2
       HAVING sum(validaciones) > 5000
        ORDER BY val DESC
        LIMIT 60`, [mesRow.m])).rows;
        // Oferta GPS de HOY por línea — desde la MV chica (10k filas, <100ms),
        // NO escaneando vehicle_events (28M, timeout). lineas[] por coche/día.
        const sup = (await database_1.default.raw(`SELECT l AS linea, sum(total) eventos
         FROM mv_fleet_ranking_diario, unnest(lineas) AS l
        WHERE fecha = ?::date
        GROUP BY 1`, [fecha])).rows;
        const supRows = sup.map((s) => ({ linea: String(s.linea), ev: Number(s.eventos) }));
        const ofertaDe = (lin) => supRows.filter((s) => (0, lineaUcot_1.mismaLinea)(s.linea, lin)).reduce((a, s) => a + s.ev, 0);
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
async function generarRecomendaciones(fecha, agencyIds = ['70', '50', '20', '10']) {
    const recs = [];
    for (const a of agencyIds) {
        try {
            recs.push(...(await porOperador(a, fecha)));
        }
        catch (e) {
            logger_1.default.error(`[recomendaciones] operador ${a}`, { err: String(e) });
        }
    }
    try {
        recs.push(...(await global(fecha)));
    }
    catch (e) {
        logger_1.default.error('[recomendaciones] global', { err: String(e) });
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
