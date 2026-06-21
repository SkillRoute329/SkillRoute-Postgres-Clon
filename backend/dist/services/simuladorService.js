"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.simularEscenarioLinea = simularEscenarioLinea;
/**
 * simuladorService — SIMULADOR DE ESCENARIOS OPERATIVOS (FASE 5.19).
 *
 * Movimiento #2 de la estrategia: competir con el modelado internacional
 * pero con DATO MEDIDO local, no estimado. Es un ESTIMADOR DE IMPACTO
 * TRANSPARENTE, NO un modelo de equilibrio de red tipo Visum/Aimsun (no se
 * promete eso). Cada número es trazable a una medición real + una fórmula
 * explícita y documentada:
 *
 *   baseline (medido):
 *     paxDia[h]      = pasajeros STM reales del mes / días de ese tipo
 *     vehHora[h]     = nº de coches GPS distintos operando esa hora (real)
 *     headway[h]     = 60 / vehHora[h]                     (min)
 *     capacidadOfr   = vehHora[h] * capacidadBus (supuesto declarado)
 *     factorOcup[h]  = paxDia[h] / capacidadOfr
 *     esperaMed[h]   = headway[h] / 2          (llegadas uniformes, estándar)
 *     paxNoAtend[h]  = max(0, paxDia[h] - capacidadOfr)
 *
 *   escenario: se altera la oferta (Δ% coches o headway objetivo o Δ
 *   capacidad) y se recalcula. Se reporta baseline vs escenario + veredicto.
 *
 * Único supuesto: capacidadBus (default 90, configurable) — declarado.
 * Todo lo demás es medición real (STM oficial + GPS).
 */
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const lineaUcot_1 = require("../utils/lineaUcot");
const DIAS_TIPO = { habil: 22, sabado: 4, festivo: 4 };
async function simularEscenarioLinea(linea, tipoDia, escenario, agencyId) {
    const cap = escenario.capacidadBus && escenario.capacidadBus > 0 ? escenario.capacidadBus : 90;
    const diasTipo = DIAS_TIPO[tipoDia] ?? 22;
    // Demanda real por hora (mes más reciente, MV rápida).
    const mesRow = (await (0, database_1.default)('mv_stm_demanda_linea_hora').max('mes as m').first());
    const mes = mesRow?.m ?? null;
    const demRows = mes
        ? (await (0, database_1.default)('mv_stm_demanda_linea_hora')
            .where({ mes, dsc_linea: String(linea), tipo_dia: tipoDia })
            .select('hora', 'pasajeros', 'cod_empresa'))
        : [];
    const paxMes = new Map();
    let codEmp = null;
    for (const r of demRows) {
        paxMes.set(Number(r.hora), Number(r.pasajeros));
        codEmp = r.cod_empresa;
    }
    // Oferta real: coches GPS distintos por hora, promedio sobre días del
    // mismo tipo en las últimas 3 semanas (medición real de la operación).
    // Oferta real desde MV mv_oferta_linea_hora (28d, por linea/dow/hora,
    // promedio de coches distintos por día). Escanear vehicle_events en vivo
    // tardaba ~18s; la MV responde instantánea. Patrón de MV del proyecto.
    const dows = tipoDia === 'habil' ? [1, 2, 3, 4, 5] : tipoDia === 'sabado' ? [6] : [0];
    const lineasGps = agencyId === '70' && /^\d{1,2}$/.test(String(linea))
        ? [String(linea), `3${linea}`]
        : [String(linea)];
    let vehRows = [];
    try {
        vehRows = (await (0, database_1.default)('mv_oferta_linea_hora')
            .whereIn('linea', lineasGps)
            .whereIn('dow', dows)
            .select('hora')
            .avg({ veh_hora_prom: 'veh_hora_prom' })
            .groupBy('hora'));
    }
    catch (e) {
        logger_1.default.warn('[simulador] oferta MV no disponible', { linea, err: String(e) });
    }
    const vehHora = new Map();
    for (const r of vehRows)
        vehHora.set(Number(r.hora), Number(r.veh_hora_prom) || 0);
    const filas = [];
    for (let h = 5; h <= 23; h++) {
        const paxDia = Math.round((paxMes.get(h) ?? 0) / diasTipo);
        const vBase = Math.round((vehHora.get(h) ?? 0) * 10) / 10;
        if (paxDia === 0 && vBase === 0)
            continue;
        // Escenario sobre la oferta.
        let vEsc = vBase;
        if (escenario.headwayObjetivoMin && escenario.headwayObjetivoMin > 0) {
            vEsc = Math.round((60 / escenario.headwayObjetivoMin) * 10) / 10;
        }
        else if (escenario.deltaVehiculosPct != null) {
            vEsc = Math.round(vBase * (1 + escenario.deltaVehiculosPct / 100) * 10) / 10;
        }
        const hwBase = vBase > 0 ? Math.round((60 / vBase) * 10) / 10 : 0;
        const hwEsc = vEsc > 0 ? Math.round((60 / vEsc) * 10) / 10 : 0;
        const capBase = vBase * cap;
        const capEsc = vEsc * cap;
        filas.push({
            hora: h,
            paxDia,
            vehHoraBase: vBase,
            headwayBaseMin: hwBase,
            factorOcupBase: capBase > 0 ? Math.round((paxDia / capBase) * 100) / 100 : 0,
            esperaBaseMin: hwBase > 0 ? Math.round((hwBase / 2) * 10) / 10 : 0,
            paxNoAtendBase: Math.max(0, paxDia - Math.round(capBase)),
            vehHoraEsc: vEsc,
            headwayEscMin: hwEsc,
            factorOcupEsc: capEsc > 0 ? Math.round((paxDia / capEsc) * 100) / 100 : 0,
            esperaEscMin: hwEsc > 0 ? Math.round((hwEsc / 2) * 10) / 10 : 0,
            paxNoAtendEsc: Math.max(0, paxDia - Math.round(capEsc)),
        });
    }
    const sum = (f) => filas.reduce((a, x) => a + f(x), 0);
    const avg = (f) => filas.length ? Math.round((sum(f) / filas.length) * 100) / 100 : 0;
    const noBase = sum((x) => x.paxNoAtendBase);
    const noEsc = sum((x) => x.paxNoAtendEsc);
    const resumen = {
        paxNoAtendidoBaseDia: noBase,
        paxNoAtendidoEscDia: noEsc,
        deltaPaxAtendidos: noBase - noEsc,
        factorOcupMedioBase: avg((x) => x.factorOcupBase),
        factorOcupMedioEsc: avg((x) => x.factorOcupEsc),
        esperaMediaBaseMin: avg((x) => x.esperaBaseMin),
        esperaMediaEscMin: avg((x) => x.esperaEscMin),
        vehiculosDiaBase: Math.round(sum((x) => x.vehHoraBase)),
        vehiculosDiaEsc: Math.round(sum((x) => x.vehHoraEsc)),
    };
    let veredicto;
    if (filas.length === 0) {
        veredicto = `Sin datos suficientes para línea ${linea} (${tipoDia}): falta demanda STM o GPS.`;
    }
    else if (resumen.deltaPaxAtendidos > 0) {
        veredicto = `El escenario atendería ${resumen.deltaPaxAtendidos.toLocaleString()} pasajeros/día hoy NO cubiertos (factor de ocupación medio ${resumen.factorOcupMedioBase}→${resumen.factorOcupMedioEsc}, espera ${resumen.esperaMediaBaseMin}→${resumen.esperaMediaEscMin} min). Requiere ${resumen.vehiculosDiaEsc - resumen.vehiculosDiaBase} coche-hora/día adicionales.`;
    }
    else if (resumen.deltaPaxAtendidos < 0) {
        veredicto = `El escenario DEJARÍA sin atender ${Math.abs(resumen.deltaPaxAtendidos).toLocaleString()} pasajeros/día adicionales — no recomendado salvo reasignar esa oferta a un corredor con déficit.`;
    }
    else {
        veredicto = `Sin cambio en pasaje atendido; el escenario afecta principalmente la espera media (${resumen.esperaMediaBaseMin}→${resumen.esperaMediaEscMin} min).`;
    }
    // ── EFECTO RED (matriz OD real STM) ───────────────────────────────────
    const odMesRow = (await (0, database_1.default)('stm_transbordos_mensual').max('mes as m').first());
    const odMes = odMesRow?.m ?? null;
    const efectoRed = {
        mes: odMes ? new Date(odMes).toISOString().slice(0, 7) : null,
        transfTotalMes: 0,
        alimentanEstaLinea: [],
        estaLineaAlimenta: [],
        nota: 'Transbordos reales (cadena de id_viaje del documento STM). Un cambio en esta línea NO es aislado: propaga a estas líneas conectadas.',
    };
    if (odMes) {
        try {
            // Pares OD del mes; se cruza la línea con mismaLinea (prefijo UCOT).
            const pares = (await (0, database_1.default)('stm_transbordos_mensual')
                .where('mes', odMes)
                .select('linea_origen', 'linea_destino')
                .sum({ tb: 'transbordos' })
                .groupBy('linea_origen', 'linea_destino'));
            const entran = new Map();
            const salen = new Map();
            let tot = 0;
            for (const p of pares) {
                const o = String(p.linea_origen);
                const d = String(p.linea_destino);
                const n = Number(p.tb);
                if ((0, lineaUcot_1.mismaLinea)(d, String(linea)) && !(0, lineaUcot_1.mismaLinea)(o, String(linea))) {
                    entran.set(o, (entran.get(o) ?? 0) + n);
                    tot += n;
                }
                if ((0, lineaUcot_1.mismaLinea)(o, String(linea)) && !(0, lineaUcot_1.mismaLinea)(d, String(linea))) {
                    salen.set(d, (salen.get(d) ?? 0) + n);
                    tot += n;
                }
            }
            const top = (m) => [...m.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([l, t]) => ({ linea: l, transbordos: t }));
            efectoRed.transfTotalMes = tot;
            efectoRed.alimentanEstaLinea = top(entran);
            efectoRed.estaLineaAlimenta = top(salen);
        }
        catch (e) {
            logger_1.default.warn('[simulador] efectoRed OD no disponible', { linea, err: String(e) });
        }
    }
    return {
        ok: true,
        linea: String(linea),
        operador: codEmp != null
            ? { 10: 'COETC', 20: 'COME', 50: 'CUTCSA', 70: 'UCOT' }[codEmp] ??
                String(codEmp)
            : null,
        tipoDia,
        mesDemanda: mes ? new Date(mes).toISOString().slice(0, 7) : null,
        capacidadBusSupuesto: cap,
        escenario,
        supuestos: [
            `Capacidad por coche = ${cap} pax (supuesto declarado, configurable).`,
            `Demanda = pasajeros STM oficiales del mes ${mes ? new Date(mes).toISOString().slice(0, 7) : '?'} / ${diasTipo} días tipo "${tipoDia}".`,
            'Oferta = coches GPS distintos por hora (promedio real últimas 3 semanas, mismo tipo de día).',
            'Espera media = headway/2 (llegadas uniformes, estándar de transporte).',
            'Es un estimador de impacto transparente, NO un modelo de equilibrio de red.',
        ],
        filas,
        resumen,
        efectoRed,
        veredicto,
    };
}
