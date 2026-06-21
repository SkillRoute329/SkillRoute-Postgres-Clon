"use strict";
/**
 * comparacionServicioService.ts (FASE 5.17 — 2026-05-16)
 *
 * Comparación de 3 columnas, POR VUELTA, para un coche UCOT:
 *
 *   1. IMM oficial    — salida regulada más cercana (GTFS)
 *   2. Servicio UCOT  — el cartón/minuta estructurado (documento ya parseado:
 *                       servicios_habiles.json / servicios_sabado.json)
 *   3. GPS real       — lo que efectivamente operó el coche (vehicle_events)
 *
 * Flujo (el que el usuario instruyó a Antigravity, simplificado):
 *   coche --(rotación scrapeada)--> nº de servicio  (cartones_completados)
 *   nº de servicio --(documento)--> horarios por vuelta
 *   coche --(vehicle_events)------> operación real (desvío vs IMM ya calculado)
 *
 * Por qué POR VUELTA y no por etapa: las etapas del cartón usan nomenclatura
 * interna UCOT ("Crio. Central", "Portones Tnal") que NO cruza por nombre con
 * los stops IMM del GPS (`proxima_parada`). Sí es robusto y operativamente
 * significativo comparar el ciclo de cada vuelta: ¿salió a la hora del
 * servicio comprometido? ¿con qué desvío respecto al regulador IMM operó?
 * (La precisión etapa-a-etapa requiere un gazetteer etapa-UCOT→geo: pendiente.)
 *
 * NO inventa datos: si una capa falta, se marca. UCOT-first (agency 70).
 * Festivos (domingo): no hay documento → se informa.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tipoDiaDeFecha = tipoDiaDeFecha;
exports.lineaDeServicio = lineaDeServicio;
exports.compararServicioCoche = compararServicioCoche;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const database_1 = __importDefault(require("../config/database"));
const logger_1 = __importDefault(require("../config/logger"));
// Mismo patrón que scheduleComplianceEngine: el build copia src/data → dist/data.
const UCOT_DATA_DIR = path_1.default.join(__dirname, '../data/ucot');
function loadServiciosFile(name) {
    try {
        return JSON.parse(fs_1.default.readFileSync(path_1.default.join(UCOT_DATA_DIR, name), 'utf8'));
    }
    catch (e) {
        // servicios_festivo.json es OPCIONAL (aún no lo tenemos). Un archivo
        // ausente NO es un fallo: log informativo, no error.
        if (e?.code === 'ENOENT') {
            logger_1.default.info(`[comparacion] documento opcional ausente: ${name} (se omite, sin horarios estructurados para ese tipo de día)`);
        }
        else {
            logger_1.default.error(`[comparacion] no se pudo cargar ${name}`, { err: String(e) });
        }
        return [];
    }
}
const serviciosHabiles = loadServiciosFile('servicios_habiles.json');
const serviciosSabado = loadServiciosFile('servicios_sabado.json');
// Domingo: la web de UCOT lo da como FESTIVO. El doc puede no existir aún
// (sólo tenemos hábil+sábado); loadServiciosFile devuelve [] sin romper.
const serviciosFestivo = loadServiciosFile('servicios_festivo.json');
const HABILES = serviciosHabiles;
const SABADO = serviciosSabado;
const FESTIVO = serviciosFestivo;
const idxHabiles = new Map(HABILES.map((s) => [String(s.servicioNum), s]));
const idxSabado = new Map(SABADO.map((s) => [String(s.servicioNum), s]));
const idxFestivo = new Map(FESTIVO.map((s) => [String(s.servicioNum), s]));
/** "HH:MM" → minutos desde 00:00. Partes inválidas = 0 (nunca NaN). */
function hhmmAMin(hhmm) {
    const [h, m] = String(hhmm ?? '').trim().split(':');
    return (Number(h) || 0) * 60 + (Number(m) || 0);
}
/** minutos desde 00:00 → "HH:MM" (acepta >24h del cartón, ej. 25:10). */
function minAHHMM(min) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function tipoDiaDeFecha(fechaISO) {
    // Mediodía en -03:00 para evitar drift de zona horaria.
    const d = new Date(`${fechaISO}T12:00:00-03:00`);
    const dow = d.getDay(); // 0 = domingo, 6 = sábado
    if (dow === 0)
        return 'festivo';
    if (dow === 6)
        return 'sabado';
    return 'habil';
}
/**
 * Línea oficial asignada al servicio, según el documento estructurado de
 * UCOT (servicios_habiles/sabado/festivo). Es la fuente CONFIABLE de la
 * línea del cartón: NO depende del frágil scrape del visor PDF (que hoy
 * falla y deja line='?'). Devuelve null si el servicio no está en el doc.
 */
function lineaDeServicio(serviceNumber, tipoDia) {
    if (!serviceNumber)
        return null;
    const k = String(serviceNumber);
    const doc = tipoDia === 'habil'
        ? idxHabiles.get(k)
        : tipoDia === 'sabado'
            ? idxSabado.get(k)
            : idxFestivo.get(k);
    const l = doc?.linea?.trim();
    return l ? l : null;
}
/** Resuelve el nº de servicio que el coche está realizando (rotación scrapeada). */
async function resolverServicio(coche, agencyId) {
    const row = await (0, database_1.default)('cartones_completados')
        .where('agency_id', agencyId)
        .where('vehiculo_id', String(coche))
        .orderBy('updated_at', 'desc')
        .first();
    if (!row)
        return { serviceNumber: null, servicioManana: null, line: null, updatedAt: null };
    const jb = (row.data_jsonb ?? {});
    const man = jb.servicioManana;
    return {
        serviceNumber: row.service_number && /^\d+$/.test(String(row.service_number)) ? String(row.service_number) : null,
        servicioManana: man && /^\d+$/.test(String(man)) ? String(man) : null,
        line: row.line && row.line !== '?' ? String(row.line) : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
}
/** Salidas IMM-GTFS (minutos desde 00:00) de la línea, ambos sentidos. */
async function salidasImm(linea) {
    try {
        const q = await database_1.default.raw(`SELECT MIN(st.arrival_time) AS dep
         FROM gtfs.trips t
         JOIN gtfs.routes r ON t.route_id = r.route_id
         JOIN gtfs.stop_times st ON t.trip_id = st.trip_id
        WHERE r.route_short_name = ?
        GROUP BY t.trip_id`, [linea]);
        return q.rows
            .map((r) => (r.dep ? hhmmAMin(String(r.dep).slice(0, 5)) : null))
            .filter((x) => x != null)
            .sort((a, b) => a - b);
    }
    catch (e) {
        logger_1.default.warn('[comparacion] salidasImm falló', { linea, err: String(e) });
        return [];
    }
}
function immMasCercana(salidas, objetivo) {
    if (salidas.length === 0)
        return null;
    let best = salidas[0];
    let bestD = Math.abs(best - objetivo);
    for (const s of salidas) {
        const d = Math.abs(s - objetivo);
        if (d < bestD) {
            bestD = d;
            best = s;
        }
    }
    return best;
}
/** Eventos GPS del coche en la fecha (toda la jornada, una sola query). */
async function eventosGpsDia(coche, agencyId, fecha) {
    // En vehicle_events el id_bus UCOT es el nº de coche CRUDO ("168"), no
    // "70_168" (ese formato es solo de bus_last_pos). Verificado contra la DB
    // 2026-05-16. Aceptamos ambos por robustez ante cambios de formato.
    const rows = (await (0, database_1.default)('vehicle_events')
        .where('agency_id', agencyId)
        .whereIn('id_bus', [String(coche), `${agencyId}_${coche}`])
        .whereRaw("timestamp_gps >= ? AND timestamp_gps < (?::date + interval '1 day')", [fecha, fecha])
        .orderBy('timestamp_gps', 'asc')
        .select('timestamp_gps', 'desviacion_min', 'estado_cumplimiento')
        .limit(20000));
    return rows.map((r) => {
        const t = new Date(r.timestamp_gps);
        const hhmm = t.toLocaleTimeString('es-UY', {
            timeZone: 'America/Montevideo',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
        return {
            min: hhmmAMin(hhmm),
            desv: r.desviacion_min != null ? Number(r.desviacion_min) : null,
            estado: r.estado_cumplimiento ?? null,
        };
    });
}
const TOLERANCIA_MIN = 4; // política OTP unificada IMM / TCRP 165
/** Normaliza nombre de etapa para detectar el giro (etapa repetida = ESPERA). */
function normEtapa(s) {
    return String(s ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}
/**
 * Aplana las vueltas del cartón en TRAMOS ordenados.
 *
 * Estructura real del cartón (confirmada con el usuario): cada vuelta es
 * origen → destino; al llegar al destino hay ESPERAS programadas y ese
 * destino pasa a ser el inicio del próximo tramo (sentido inverso), y así
 * sucesivamente. El giro se detecta donde una etapa aparece DOS veces
 * consecutivas con horas distintas (llegada y salida tras la ESPERA).
 */
function aplanarTramos(doc) {
    const tramos = [];
    for (const v of doc.vueltas ?? []) {
        const ps = (v.paradas ?? []).filter((p) => normEtapa(p.etapa) !== 'esperas');
        if (ps.length < 2)
            continue;
        let start = 0;
        let nTramo = 0;
        for (let i = 0; i < ps.length - 1; i++) {
            if (normEtapa(ps[i].etapa) === normEtapa(ps[i + 1].etapa)) {
                // ps[i] = llegada al destino; ps[i+1] = salida tras la ESPERA.
                nTramo++;
                tramos.push({
                    vuelta: v.vuelta,
                    tramoEnVuelta: nTramo,
                    origen: ps[start].etapa,
                    destino: ps[i].etapa,
                    salidaMin: hhmmAMin(ps[start].hora),
                    llegadaMin: hhmmAMin(ps[i].hora),
                });
                start = i + 1;
            }
        }
        // Último tramo de la vuelta (hasta la última parada).
        if (start < ps.length - 1) {
            nTramo++;
            tramos.push({
                vuelta: v.vuelta,
                tramoEnVuelta: nTramo,
                origen: ps[start].etapa,
                destino: ps[ps.length - 1].etapa,
                salidaMin: hhmmAMin(ps[start].hora),
                llegadaMin: hhmmAMin(ps[ps.length - 1].hora),
            });
        }
    }
    return tramos;
}
function clasificar(difGpsVsCarton, tieneCarton, hayGps) {
    if (!tieneCarton)
        return 'SIN_CARTON';
    if (!hayGps || difGpsVsCarton == null)
        return 'SIN_GPS';
    if (difGpsVsCarton > TOLERANCIA_MIN)
        return 'ATRASADO';
    if (difGpsVsCarton < -TOLERANCIA_MIN)
        return 'ADELANTADO';
    return 'EN_TIEMPO';
}
function sugerir(f) {
    if (f.estado === 'SIN_CARTON')
        return 'Servicio sin horario en documento UCOT — verificar minuta o re-scrapear rotación.';
    if (f.estado === 'SIN_GPS')
        return `Sin GPS en la franja del tramo ${f.origen} → ${f.destino} — coche fuera de servicio, no salió, o GPS apagado.`;
    if (f.estado === 'ATRASADO' && f.difGpsVsCartonMin != null)
        return `Salió de ${f.origen} ${f.difGpsVsCartonMin} min tarde vs el servicio — adelantar salida de terminal / revisar relevo o respeto de la ESPERA.`;
    if (f.estado === 'ADELANTADO' && f.difGpsVsCartonMin != null)
        return `Salió de ${f.origen} ${Math.abs(f.difGpsVsCartonMin)} min adelantado — riesgo de dejar pasaje; ajustar a la hora del servicio.`;
    const avisos = [];
    if (f.difCartonVsImmMin != null && Math.abs(f.difCartonVsImmMin) > TOLERANCIA_MIN)
        avisos.push(`el servicio UCOT difiere ${f.difCartonVsImmMin} min de la salida IMM más cercana`);
    if (f.desvioMedioVsImmMin != null && Math.abs(f.desvioMedioVsImmMin) > TOLERANCIA_MIN)
        avisos.push(`desvío medio vs IMM de ${f.desvioMedioVsImmMin} min en el tramo`);
    return avisos.length ? `Cumplió la salida de su cartón, pero ${avisos.join(' y ')}.` : null;
}
async function compararServicioCoche(coche, fecha, agencyId = '70') {
    const notas = [];
    const tipoDia = tipoDiaDeFecha(fecha);
    const { serviceNumber, servicioManana, line, updatedAt } = await resolverServicio(coche, agencyId);
    if (!serviceNumber)
        notas.push('No hay servicio resuelto para este coche en cartones_completados (rotación no scrapeada o coche sin asignación ese día).');
    let doc;
    if (serviceNumber) {
        if (tipoDia === 'habil')
            doc = idxHabiles.get(serviceNumber);
        else if (tipoDia === 'sabado')
            doc = idxSabado.get(serviceNumber);
        else
            doc = idxFestivo.get(serviceNumber); // domingo = festivo en la web UCOT
        if (!doc) {
            const etiqueta = tipoDia === 'habil' ? 'hábil' : tipoDia === 'sabado' ? 'sábado' : 'festivo';
            if (tipoDia === 'festivo' && idxFestivo.size === 0)
                notas.push('Día festivo (domingo): aún no hay documento de servicios festivos cargado ' +
                    '(servicios_festivo.json). El mapeo coche→servicio sí se captura; faltan los horarios estructurados.');
            else
                notas.push(`Servicio ${serviceNumber} no está en el documento ${etiqueta} (snapshot parcial).`);
        }
    }
    const lineaEfectiva = doc?.linea?.trim() || line || null;
    const instruccionSalida = (doc?.instrucciones ?? []).find((x) => /saca coche/i.test(x))?.trim() ?? null;
    const salidas = lineaEfectiva ? await salidasImm(lineaEfectiva) : [];
    const eventos = await eventosGpsDia(coche, agencyId, fecha);
    if (salidas.length === 0)
        notas.push('Sin salidas IMM-GTFS para la línea (línea no resuelta o sin GTFS).');
    if (eventos.length === 0)
        notas.push('Sin eventos GPS del coche en la fecha.');
    const filas = [];
    const tramos = doc ? aplanarTramos(doc) : [];
    for (let ti = 0; ti < tramos.length; ti++) {
        const t = tramos[ti];
        const sig = tramos[ti + 1];
        // ESPERA programada en el destino = hueco hasta la salida del próximo tramo.
        const esperaProg = sig && sig.salidaMin >= t.llegadaMin ? sig.salidaMin - t.llegadaMin : null;
        // Ventana del tramo (con colchón) para agregar GPS.
        const enVentana = eventos.filter((e) => e.min >= t.salidaMin - 30 && e.min <= t.llegadaMin + 30);
        // Franja de la SALIDA comprometida: el desvío del motor (vs IMM, ya
        // validado por scheduleComplianceEngine) alrededor de la hora del cartón.
        // No fabricamos una "hora de salida real" — sin geocerca de terminal sería
        // poco fiable; usamos la señal de cumplimiento que sí está validada.
        const enSalida = eventos.filter((e) => e.min >= t.salidaMin - 10 && e.min <= t.salidaMin + 25);
        const desvsSalida = enSalida.map((e) => e.desv).filter((d) => d != null);
        const desvioInicioVsImm = desvsSalida.length > 0
            ? Math.round((desvsSalida.reduce((a, b) => a + b, 0) / desvsSalida.length) * 10) / 10
            : null;
        const desvs = enVentana.map((e) => e.desv).filter((d) => d != null);
        const desvioMedio = desvs.length > 0 ? Math.round((desvs.reduce((a, b) => a + b, 0) / desvs.length) * 10) / 10 : null;
        const desvioMax = desvs.length > 0 ? desvs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : null;
        // Estado predominante del motor en el tramo (EN_TIEMPO/ATRASADO/…).
        const estados = enVentana.map((e) => e.estado).filter((s) => !!s);
        const estadoMotor = estados.length > 0
            ? [...estados.reduce((m, s) => m.set(s, (m.get(s) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1])[0][0]
            : null;
        const immSalidaMin = immMasCercana(salidas, t.salidaMin);
        const difCartonVsImm = immSalidaMin != null ? t.salidaMin - immSalidaMin : null;
        // GPS vs cartón = desvío(vs IMM) − (cartón − IMM). Ambos relativos a IMM,
        // así que la resta es matemáticamente sólida (no inventa una salida).
        const difGpsVsCarton = desvioInicioVsImm != null && difCartonVsImm != null
            ? Math.round((desvioInicioVsImm - difCartonVsImm) * 10) / 10
            : null;
        const hayGps = enVentana.length > 0;
        const estado = clasificar(difGpsVsCarton, true, hayGps);
        const sinCorr = {
            vuelta: t.vuelta,
            tramoEnVuelta: t.tramoEnVuelta,
            origen: t.origen,
            destino: t.destino,
            immSalida: immSalidaMin != null ? minAHHMM(immSalidaMin) : null,
            cartonSalida: minAHHMM(t.salidaMin),
            cartonLlegada: minAHHMM(t.llegadaMin),
            esperaProgMin: esperaProg,
            desvioInicioVsImmMin: desvioInicioVsImm,
            estadoMotorPredominante: estadoMotor,
            desvioMedioVsImmMin: desvioMedio,
            desvioMaxVsImmMin: desvioMax,
            puntosGps: enVentana.length,
            difCartonVsImmMin: difCartonVsImm,
            difGpsVsCartonMin: difGpsVsCarton,
            estado,
        };
        filas.push({ ...sinCorr, correccion: sugerir(sinCorr) });
    }
    // Sin cartón pero con datos: una fila informativa para no ocultar IMM/GPS.
    if (filas.length === 0 && (salidas.length > 0 || eventos.length > 0)) {
        const sinCorr = {
            vuelta: 0,
            tramoEnVuelta: 0,
            origen: '—',
            destino: '—',
            immSalida: salidas.length ? minAHHMM(salidas[0]) : null,
            cartonSalida: null,
            cartonLlegada: null,
            esperaProgMin: null,
            desvioInicioVsImmMin: null,
            estadoMotorPredominante: null,
            desvioMedioVsImmMin: null,
            desvioMaxVsImmMin: null,
            puntosGps: eventos.length,
            difCartonVsImmMin: null,
            difGpsVsCartonMin: null,
            estado: 'SIN_CARTON',
        };
        filas.push({ ...sinCorr, correccion: sugerir(sinCorr) });
    }
    const resumen = {
        tramos: filas.length,
        enTiempo: filas.filter((f) => f.estado === 'EN_TIEMPO').length,
        atrasado: filas.filter((f) => f.estado === 'ATRASADO').length,
        adelantado: filas.filter((f) => f.estado === 'ADELANTADO').length,
        sinGps: filas.filter((f) => f.estado === 'SIN_GPS').length,
        sinCarton: filas.filter((f) => f.estado === 'SIN_CARTON').length,
        cumplimientoSalidaPct: null,
    };
    const evaluables = resumen.enTiempo + resumen.atrasado + resumen.adelantado;
    resumen.cumplimientoSalidaPct =
        evaluables > 0 ? Math.round((resumen.enTiempo / evaluables) * 100) : null;
    return {
        ok: true,
        meta: {
            coche: String(coche),
            agencyId,
            fecha,
            tipoDia,
            serviceNumber,
            servicioManana,
            linea: lineaEfectiva,
            instruccionSalida,
            rotacionActualizada: updatedAt,
            generadoEn: new Date().toISOString(),
        },
        capas: {
            immDisponible: salidas.length > 0,
            cartonDisponible: (doc?.vueltas?.length ?? 0) > 0,
            gpsDisponible: eventos.length > 0,
            notas,
        },
        resumen,
        filas,
    };
}
