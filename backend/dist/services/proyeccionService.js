"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.proyectarDemanda = proyectarDemanda;
/**
 * proyeccionService — PROYECCIÓN PREDICTIVA (FASE 5.18).
 *
 * El centro de comando observó que el sistema es "defensivo, no proyectivo:
 * no proyecta ni diario ni a corto/mediano plazo". Esto lo resuelve:
 * pronostica la DEMANDA esperada por línea/franja para una fecha objetivo
 * usando el histórico real STM (6 meses, mv_stm_linea_resumen) segmentado
 * por tipo de día (dow), con TENDENCIA mes a mes, y emite alertas
 * anticipadas donde la demanda esperada es alta y creciente.
 *
 * No es el promedio trivial ±2% anterior: usa el patrón real por día de
 * semana y la pendiente de los últimos meses. 100% datos reales STM.
 */
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
const OPERADOR = { '10': 'COETC', '20': 'COME', '50': 'CUTCSA', '70': 'UCOT' };
function tipoDia(dow) {
    if (dow === 0)
        return 'festivo';
    if (dow === 6)
        return 'sabado';
    return 'habil';
}
/**
 * Proyecta demanda para `fechaObjetivo`. Usa el histórico STM del mismo
 * tipo de día (dow) y la tendencia (regresión simple sobre el promedio
 * mensual) para proyectar al mes siguiente al último disponible.
 */
async function proyectarDemanda(fechaObjetivo, agencyId) {
    const d = new Date(`${fechaObjetivo}T12:00:00-03:00`);
    const dow = d.getDay();
    const td = tipoDia(dow);
    // Meses disponibles (orden cronológico) para calcular tendencia.
    const mesesRows = (await (0, database_1.default)('mv_stm_linea_resumen')
        .distinct('mes')
        .orderBy('mes', 'asc'));
    // pg devuelve `mes` como Date (timestamptz). NO stringificar (String(Date)
    // produce "...GMT-0300..." que Postgres rechaza). Se pasa el valor crudo
    // como binding — node-postgres lo bindea correcto a timestamptz.
    const meses = mesesRows.map((r) => r.mes);
    if (meses.length === 0) {
        return {
            ok: true,
            fechaObjetivo,
            tipoDia: td,
            baseHistorica: { meses: 0, desde: null, hasta: null },
            generadoEn: new Date().toISOString(),
            resumen: { lineasProyectadas: 0, alertasAnticipadas: 0 },
            proyeccion: [],
        };
    }
    const ultimoMes = meses[meses.length - 1];
    const primerMes = meses[0];
    // Demanda media por (operador, línea, hora) para ESTE tipo de día,
    // separando último mes vs el resto para estimar tendencia.
    const dows = td === 'habil' ? [1, 2, 3, 4, 5] : td === 'sabado' ? [6] : [0];
    const params = [...dows];
    const filtroOp = agencyId ? 'AND cod_empresa = ?' : '';
    if (agencyId)
        params.push(Number(agencyId));
    const rows = (await database_1.default.raw(`WITH base AS (
       SELECT cod_empresa, dsc_linea, hora, mes, sum(validaciones) v
         FROM mv_stm_linea_resumen
        WHERE dow IN (${dows.map(() => '?').join(',')})
          AND hora BETWEEN 5 AND 23
          ${filtroOp}
        GROUP BY 1,2,3,4
     )
     SELECT cod_empresa, dsc_linea, hora,
            round(avg(v)::numeric,0)                                   AS prom_hist,
            round(avg(v) FILTER (WHERE mes = ?)::numeric,0)            AS prom_ultimo,
            round(avg(v) FILTER (WHERE mes = ?)::numeric,0)            AS prom_primero
       FROM base
      GROUP BY 1,2,3
     HAVING avg(v) >= 50
      ORDER BY prom_ultimo DESC NULLS LAST
      LIMIT 300`, [...params, ultimoMes, primerMes])).rows;
    const nMeses = meses.length;
    const proyeccion = [];
    for (const r of rows) {
        const hist = Number(r.prom_hist) || 0;
        const ult = r.prom_ultimo != null ? Number(r.prom_ultimo) : hist;
        const pri = r.prom_primero != null ? Number(r.prom_primero) : hist;
        // Tendencia: variación total repartida entre meses → % mensual.
        const tendPctMes = pri > 0 && nMeses > 1 ? Math.round(((ult - pri) / pri / (nMeses - 1)) * 1000) / 10 : 0;
        // Proyección = último mes extrapolado un mes hacia adelante por la tendencia.
        const esperada = Math.max(0, Math.round(ult * (1 + tendPctMes / 100)));
        proyeccion.push({
            operador: OPERADOR[String(r.cod_empresa)] ?? String(r.cod_empresa),
            linea: r.dsc_linea,
            hora: r.hora,
            demandaEsperada: esperada,
            promedioHistorico: hist,
            tendenciaPctMes: tendPctMes,
            señal: 'ESTABLE',
            accionAnticipada: null,
        });
    }
    // Umbral de "alta demanda" = percentil 85 de la demanda esperada del
    // conjunto (la demanda de transporte es estable mes a mes; el valor
    // predictivo accionable es la magnitud ABSOLUTA que habrá que cubrir,
    // no solo la tendencia). Genera acciones preparatorias concretas.
    const ordenadas = proyeccion.map((p) => p.demandaEsperada).sort((a, b) => a - b);
    const cutoffAlta = ordenadas.length
        ? ordenadas[Math.floor(ordenadas.length * 0.85)] ?? 0
        : 0;
    for (const p of proyeccion) {
        const hh = String(p.hora).padStart(2, '0');
        const alta = p.demandaEsperada >= cutoffAlta && p.demandaEsperada > 0;
        if (alta && p.tendenciaPctMes > 3) {
            p.señal = 'CRECIENTE_ALTA';
            p.accionAnticipada = `Asegurar y reforzar oferta en línea ${p.linea} franja ${hh}h: demanda esperada ALTA (${p.demandaEsperada}) y creciendo ${p.tendenciaPctMes}%/mes. Programar capacidad ANTES de saturar.`;
        }
        else if (alta) {
            p.señal = 'CRECIENTE';
            p.accionAnticipada = `Garantizar oferta en línea ${p.linea} franja ${hh}h: demanda esperada ALTA (${p.demandaEsperada}, ${td}). Es de las franjas críticas del sistema — no debe quedar sin cobertura.`;
        }
        else if (p.tendenciaPctMes < -8) {
            p.señal = 'DECRECIENTE';
            p.accionAnticipada = `Línea ${p.linea} ${hh}h: demanda en caída sostenida (${p.tendenciaPctMes}%/mes) — evaluar reasignar esa oferta a corredores con déficit.`;
        }
        else if (p.tendenciaPctMes > 3) {
            p.señal = 'CRECIENTE';
        }
        else if (p.tendenciaPctMes < -3) {
            p.señal = 'DECRECIENTE';
        }
    }
    const alertas = proyeccion.filter((p) => p.accionAnticipada).length;
    logger_1.default.info(`[proyeccion] ${fechaObjetivo} (${td}): ${proyeccion.length} líneas, ${alertas} alertas anticipadas`);
    return {
        ok: true,
        fechaObjetivo,
        tipoDia: td,
        baseHistorica: {
            meses: nMeses,
            desde: new Date(primerMes).toISOString().slice(0, 7),
            hasta: new Date(ultimoMes).toISOString().slice(0, 7),
        },
        generadoEn: new Date().toISOString(),
        resumen: { lineasProyectadas: proyeccion.length, alertasAnticipadas: alertas },
        proyeccion,
    };
}
