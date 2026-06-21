"use strict";
/**
 * Competitors Ingestion Service
 * Toma snapshots GPS del endpoint público IMM/STM y materializa la colección
 * Firestore `competidores` con datos REALES de las empresas competidoras de UCOT.
 *
 * Estrategia:
 *   1. fetchBusesLive("-1") → todas las empresas operando ahora
 *   2. Agrupar por empresa (excluir UCOT, código 70)
 *   3. Para cada empresa: upsert documento con sus líneas observadas
 *   4. Cada línea es construida con la info disponible del snapshot:
 *      - numeroLinea, operador, sublineas (variantes IDA/VUELTA), destinos
 *      - recorrido = [] hasta tener scraper de horarios JSF
 *      - horarios = [] idem
 *      - frecuencia = estimación cruda (ver más abajo) o 0
 *      - activa = busesActivos > 0
 *
 * Nota: la frecuencia REAL viene del scraper JSF de stm/horarios. Esto es la
 * primera capa: identidad y estado operativo en vivo.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestCompetitorsFromSTM = ingestCompetitorsFromSTM;
exports.enrichCompetidorWithSchedules = enrichCompetidorWithSchedules;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const immRealtimeService_1 = require("./immRealtimeService");
const stmHorariosScraperService_1 = require("./stmHorariosScraperService");
const COMPETIDORES_COLLECTION = 'competidores';
const SNAPSHOT_COLLECTION = 'stm_snapshots';
/**
 * Construye un Competidor (formato Firestore) desde una EmpresaLive.
 */
function empresaLiveToCompetidor(emp, ahora) {
    const lineas = Array.from(emp.lineas.values()).map((l) => {
        // Estimar destino principal (el más frecuente entre las posiciones)
        const sublineasArr = Array.from(l.sublineas);
        const destinosArr = Array.from(l.destinos);
        const linea = {
            id: `${emp.codigo}-${l.numero}`,
            numeroLinea: parseInt(l.numero, 10) || 0,
            operador: emp.nombre,
            recorrido: [], // Pendiente: scraper JSF de stm/horarios
            horarios: [], // Pendiente
            frecuencia: 0, // Pendiente: derivar de horarios reales
            historico: [],
            activa: l.busesActivos > 0,
        };
        // Persistimos metadata extra del snapshot en campos no tipados
        // (Firestore acepta extras; el tipo TS solo es para el código que lo lee)
        linea.numeroLineaTexto = l.numero;
        linea.sublineas = sublineasArr;
        linea.destinos = destinosArr;
        linea.variantes = Array.from(l.variantes);
        linea.tipoLineaDesc = l.tipoLineaDesc ?? null;
        linea.busesActivosUltimoSnapshot = l.busesActivos;
        return linea;
    });
    return {
        id: `emp-${emp.codigo}`,
        nombre: emp.nombre,
        color: undefined,
        lineas,
        ultimaActualizacion: ahora,
        createdAt: ahora,
    };
}
/**
 * Ejecuta una ingesta completa: pulls live data, agrupa, upsert en Firestore.
 * Crea también un documento de auditoría en `stm_snapshots`.
 */
async function ingestCompetitorsFromSTM() {
    const started = Date.now();
    const ahora = new Date();
    const collection = await (0, immRealtimeService_1.fetchBusesLive)(immRealtimeService_1.EMPRESA_CODES.TODAS);
    const totalBusesObservados = collection.features?.length ?? 0;
    const grouped = (0, immRealtimeService_1.agruparPorEmpresa)(collection);
    const procesadas = [];
    let competidoresUpsert = 0;
    // Batch para escrituras eficientes
    const batch = database_1.db.batch();
    for (const [codigo, emp] of grouped.entries()) {
        const omitida = String(codigo) === immRealtimeService_1.EMPRESA_CODES.UCOT; // No es competidor
        procesadas.push({
            codigo,
            nombre: emp.nombre,
            buses: emp.totalBuses,
            lineas: emp.lineas.size,
            omitida,
        });
        if (omitida)
            continue;
        const competidor = empresaLiveToCompetidor(emp, ahora);
        const ref = database_1.db.collection(COMPETIDORES_COLLECTION).doc(competidor.id);
        // Preservamos createdAt si ya existe — solo actualizamos
        const existing = await ref.get();
        const dataToWrite = {
            ...competidor,
            ultimaActualizacion: ahora,
        };
        if (existing.exists) {
            const existingData = existing.data();
            if (existingData?.createdAt) {
                dataToWrite.createdAt = existingData.createdAt;
            }
        }
        batch.set(ref, dataToWrite, { merge: true });
        competidoresUpsert += 1;
    }
    // Snapshot de auditoría
    const snapshotRef = database_1.db.collection(SNAPSHOT_COLLECTION).doc();
    batch.set(snapshotRef, {
        timestamp: ahora,
        totalBuses: totalBusesObservados,
        porEmpresa: procesadas,
        fuente: 'POST /buses/rest/stm-online',
    });
    await batch.commit();
    const duracionMs = Date.now() - started;
    const result = {
        timestampISO: ahora.toISOString(),
        totalBusesObservados,
        empresasProcesadas: procesadas,
        competidoresUpsert,
        duracionMs,
    };
    logger_1.logger.info(`[competitorsIngestion] OK ${totalBusesObservados} buses, ${competidoresUpsert} competidores upsert en ${duracionMs}ms`);
    return result;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Enriquece un Competidor con horarios reales por línea, scrapeando
 * `montevideo.gub.uy/app/stm/horarios/` para cada `numeroLinea`.
 *
 * No reemplaza el doc completo: solo actualiza `lineas[].horarios` y
 * `lineas[].frecuencia`, preservando todo lo demás (snapshots GPS, metadata).
 *
 * Costo: ~5 round-trips × ~400ms × N líneas. Para CUTCSA (~80 líneas) son
 * ~3min. Por eso es opt-in y por competidor.
 */
async function enrichCompetidorWithSchedules(competidorId, options = {}) {
    const tiposDia = options.tiposDia ?? ['Hábiles'];
    const pauseMs = options.pauseMs ?? 250;
    const started = Date.now();
    const ref = database_1.db.collection(COMPETIDORES_COLLECTION).doc(competidorId);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new Error(`Competidor "${competidorId}" no existe`);
    }
    const data = snap.data();
    let lineas = Array.isArray(data.lineas) ? data.lineas : [];
    if (options.maxLineas)
        lineas = lineas.slice(0, options.maxLineas);
    const detalle = [];
    const lineasActualizadas = [];
    for (const linea of lineas) {
        // El número guardado en el doc es number (parseInt); el scraper indexa por
        // string ("300", "CA1"), así que probamos primero el numeroLineaTexto extra
        // y caemos al numeroLinea numérico.
        const numeroTexto = linea.numeroLineaTexto ?? String(linea.numeroLinea);
        const horariosTotales = [];
        let frecuenciaDominante = 0;
        let totalSalidas = 0;
        let fallo = null;
        try {
            for (const tipoDia of tiposDia) {
                const h = await (0, stmHorariosScraperService_1.fetchLineSchedule)(numeroTexto, tipoDia);
                horariosTotales.push(...(0, stmHorariosScraperService_1.horarioLineaToBlocks)(h));
                totalSalidas += h.totalSalidas;
                // La frecuencia dominante usamos la del primer tipo (Hábiles típicamente)
                if (frecuenciaDominante === 0)
                    frecuenciaDominante = (0, stmHorariosScraperService_1.frecuenciaLineaDominante)(h);
                if (pauseMs > 0)
                    await sleep(pauseMs);
            }
        }
        catch (err) {
            fallo = err?.message ?? String(err);
            logger_1.logger.warn(`[competitorsIngestion] enrich falló linea=${numeroTexto}: ${fallo}`);
        }
        if (fallo) {
            detalle.push({ numeroLinea: linea.numeroLinea, ok: false, error: fallo });
            lineasActualizadas.push(linea); // mantener tal cual
            continue;
        }
        const lineaNueva = {
            ...linea,
            horarios: horariosTotales, // HorarioBlock es estructuralmente más rico
            frecuencia: frecuenciaDominante,
        };
        lineasActualizadas.push(lineaNueva);
        detalle.push({
            numeroLinea: linea.numeroLinea,
            ok: true,
            variantes: horariosTotales.length,
            totalSalidas,
            frecuenciaMinutos: frecuenciaDominante,
        });
    }
    const enriquecidas = detalle.filter((d) => d.ok).length;
    const fallidas = detalle.length - enriquecidas;
    await ref.set({
        lineas: lineasActualizadas,
        ultimaActualizacion: new Date(),
        ultimaEnrichmentHorarios: new Date(),
    }, { merge: true });
    const duracionMs = Date.now() - started;
    logger_1.logger.info(`[competitorsIngestion] enrich ${competidorId} ${enriquecidas}/${detalle.length} en ${duracionMs}ms`);
    return {
        competidorId,
        nombre: data.nombre,
        totalLineas: detalle.length,
        enriquecidas,
        fallidas,
        duracionMs,
        detalle,
    };
}
exports.default = { ingestCompetitorsFromSTM, enrichCompetidorWithSchedules };
