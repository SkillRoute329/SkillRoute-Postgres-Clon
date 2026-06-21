"use strict";
/**
 * STM PUBLIC DATA SCRAPER
 * ═══════════════════════════════════════════════════════════════════════════
 * Extrae datos de líneas UCOT desde múltiples fuentes:
 * 1. API oficial STM (si está disponible)
 * 2. Scraping HTML horarios STM
 * 3. Master JSON local — backend/config/ucot-lines-master.json (21 líneas reales)
 *
 * FUENTE DE VERDAD LOCAL:
 * backend/config/ucot-lines-master.json contiene las 21 líneas UCOT verificadas
 * con sus paradas reales extraídas de los Cartones de Servicio 2026.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerLineasUCOT = obtenerLineasUCOT;
exports.analizarCompetenciaLinea = analizarCompetenciaLinea;
exports.analizarTodasLasLineas = analizarTodasLasLineas;
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = __importDefault(require("../config/logger"));
const database_1 = __importDefault(require("../config/database"));
// ═══════════════════════════════════════════════════════════════════════════
// CLIENTE HTTP
// ═══════════════════════════════════════════════════════════════════════════
const STM_API_URL = 'https://www.montevideo.gub.uy/api/stm';
const STM_HORARIOS_URL = 'https://www.montevideo.gub.uy/app/stm/horarios/';
const httpClient = axios_1.default.create({
    timeout: 10000,
    headers: {
        'User-Agent': 'TransformaFacil/2.0 (Jefe de Transito)',
    },
});
// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Convierte "HH:MM" a minutos desde medianoche
 */
function horaAMinutos(hora) {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
}
/**
 * Calcula minutos entre dos horarios
 */
function calcularIntervaloMinutos(hora1, hora2) {
    const m1 = horaAMinutos(hora1);
    const m2 = horaAMinutos(hora2);
    return Math.abs(m2 - m1);
}
/**
 * Calcula frecuencia promedio de una línea basada en horarios
 */
function calcularFrecuenciaPromedio(horarios) {
    if (horarios.length < 2)
        return 0;
    const intervalos = [];
    for (let i = 1; i < horarios.length; i++) {
        const intervalo = horarios[i].minutos - horarios[i - 1].minutos;
        if (intervalo > 0) {
            intervalos.push(intervalo);
        }
    }
    if (intervalos.length === 0)
        return 0;
    const suma = intervalos.reduce((a, b) => a + b, 0);
    return Math.round(suma / intervalos.length);
}
/**
 * Clasifica tipo de competencia
 */
function clasificarCompetencia(paradasCompartidas, totalParadas, sentidoOpuesto) {
    const porcentaje = (paradasCompartidas / totalParadas) * 100;
    if (sentidoOpuesto) {
        return porcentaje > 30 ? 'INVERSA' : 'NULA';
    }
    if (porcentaje > 70)
        return 'DIRECTA';
    if (porcentaje > 30)
        return 'PARCIAL';
    return 'NULA';
}
/**
 * Calcula nivel de amenaza
 */
function calcularAmenaza(tipoCompetencia, porcentajeSolapamiento, frecuenciaCompetidor) {
    if (tipoCompetencia === 'DIRECTA' && porcentajeSolapamiento > 80) {
        return frecuenciaCompetidor < 15 ? 'CRITICA' : 'ALTA';
    }
    if (tipoCompetencia === 'DIRECTA')
        return 'ALTA';
    if (tipoCompetencia === 'PARCIAL')
        return 'MEDIA';
    if (tipoCompetencia === 'INVERSA')
        return 'BAJA';
    return 'BAJA';
}
// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES DE SCRAPING
// ═══════════════════════════════════════════════════════════════════════════
/**
 * OPCIÓN 1: Intenta obtener desde API oficial STM
 */
async function obtenerLineasDesdeAPI() {
    try {
        logger_1.default.info('Intentando obtener líneas desde API oficial STM...');
        const response = await httpClient.get(`${STM_API_URL}/lineas`);
        const lineas = response.data;
        logger_1.default.info(`✅ API STM respondió con ${lineas.length} líneas`);
        return lineas;
    }
    catch (error) {
        logger_1.default.warn('❌ API oficial STM no disponible, intentando scraping HTML...');
        return [];
    }
}
/**
 * OPCIÓN 2: Scrappea datos de horarios públicos HTML
 */
async function obtenerLineasDesdeHTML() {
    try {
        logger_1.default.info('Scrapeando datos públicos de horarios STM (HTML)...');
        const response = await httpClient.get(STM_HORARIOS_URL);
        const html = response.data;
        // Buscar patrones en HTML
        // Ejemplo: buscar líneas mencionadas en el HTML
        const patronLineas = /línea\s+(\d+)/gi;
        const lineasEncontradas = new Set();
        let match;
        while ((match = patronLineas.exec(html)) !== null) {
            lineasEncontradas.add(match[1]);
        }
        logger_1.default.info(`Encontradas ${lineasEncontradas.size} líneas potenciales en HTML`);
        // Convertir a objetos LineaUCOT
        const lineas = Array.from(lineasEncontradas).map((num) => ({
            numero: num,
            nombre: `Línea ${num}`,
            empresa: 'UCOT',
            sentidos: [],
            frecuenciaProgramada: 15,
        }));
        return lineas;
    }
    catch (error) {
        logger_1.default.warn('❌ Error scrapeando HTML:', error);
        return [];
    }
}
/**
 * OPCIÓN 3: Lee las 21 líneas UCOT reales desde el master JSON local
 * Fuente: backend/config/ucot-lines-master.json (generado desde Cartones de Servicio 2026)
 */
function obtenerLineasUCOTDesdeMaster() {
    try {
        const masterPath = path.join(__dirname, '../../config/ucot-lines-master.json');
        const raw = fs.readFileSync(masterPath, 'utf-8');
        const master = JSON.parse(raw);
        const lineas = master.lineas.map((l) => {
            const paradas = l.paradas.map((nombre, idx) => ({
                numero: idx + 1,
                nombre,
            }));
            const paradaInicio = paradas[0]?.nombre ?? 'Terminal';
            const paradaFin = paradas[paradas.length - 1]?.nombre ?? 'Terminal';
            // Generar horarios sintéticos basados en frecuencia programada
            // (serán reemplazados por datos reales de la API STM cuando esté disponible)
            const freq = l.frecuenciaProgramada || 15;
            const horariosIDA = [];
            const horariosVUELTA = [];
            for (let minutos = 5 * 60; minutos <= 23 * 60; minutos += freq) {
                const h = Math.floor(minutos / 60);
                const m = minutos % 60;
                const hora = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                horariosIDA.push({ hora, minutos, tipoDia: 'HABIL' });
                horariosVUELTA.push({ hora, minutos: minutos + Math.round(freq / 2), tipoDia: 'HABIL' });
            }
            return {
                numero: l.id,
                nombre: l.nombre,
                empresa: 'UCOT',
                frecuenciaProgramada: freq,
                sentidos: [
                    {
                        nombre: 'IDA',
                        origen: paradaInicio,
                        destino: paradaFin,
                        paradas,
                        horarios: horariosIDA,
                    },
                    {
                        nombre: 'VUELTA',
                        origen: paradaFin,
                        destino: paradaInicio,
                        paradas: [...paradas].reverse(),
                        horarios: horariosVUELTA,
                    },
                ],
            };
        });
        logger_1.default.info(`✅ Cargadas ${lineas.length} líneas UCOT desde master JSON local`);
        return lineas;
    }
    catch (error) {
        logger_1.default.error('❌ No se pudo leer ucot-lines-master.json, usando fallback mínimo:', error);
        // Fallback mínimo de emergencia — solo para que el servidor no caiga
        return [
            {
                numero: '300',
                nombre: 'Línea 300',
                empresa: 'UCOT',
                frecuenciaProgramada: 15,
                sentidos: [
                    {
                        nombre: 'IDA',
                        origen: 'Cementerio Central',
                        destino: 'Instrucciones',
                        paradas: [{ numero: 1, nombre: 'Cementerio Central' }, { numero: 2, nombre: 'Tres Cruces' }, { numero: 3, nombre: 'Instrucciones' }],
                        horarios: [{ hora: '07:00', minutos: 420, tipoDia: 'HABIL' }],
                    },
                ],
            },
        ];
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL DE OBTENCIÓN
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Obtiene líneas UCOT intentando múltiples fuentes
 */
async function obtenerLineasUCOT() {
    try {
        // Intentar en orden de preferencia
        const desdeAPI = await obtenerLineasDesdeAPI();
        if (desdeAPI.length > 0)
            return desdeAPI;
        const desdeHTML = await obtenerLineasDesdeHTML();
        if (desdeHTML.length > 0)
            return desdeHTML;
        // Fallback: leer las 21 líneas UCOT reales desde el master JSON local
        return obtenerLineasUCOTDesdeMaster();
    }
    catch (error) {
        logger_1.default.error('Error obteniendo líneas UCOT:', error);
        // Último recurso: datos del master local
        return obtenerLineasUCOTDesdeMaster();
    }
}
/**
 * Calcula paradas compartidas entre dos líneas
 */
function calcularParadasCompartidas(paradas1, paradas2) {
    const nombres1 = paradas1.map((p) => p.nombre.toLowerCase());
    return paradas2.filter((p) => nombres1.includes(p.nombre.toLowerCase()));
}
/**
 * ANÁLISIS PRINCIPAL: competencia REAL de una línea.
 *
 * FASE 5.21 (2026-05-17): se ELIMINA el cálculo fabricado que comparaba las
 * líneas UCOT contra sí mismas por igualdad de nombre de parada (daba
 * "competencia BAJA" uniforme y falsa para todas — causa del rechazo IMM).
 * Ahora se computa sobre `corridor_overlap`: solape de recorrido REAL
 * (geometría GTFS, km y % compartido) contra líneas de OTRO operador.
 */
async function analizarCompetenciaLinea(numeroLinea) {
    const timestamp = new Date().toISOString();
    const linea = String(numeroLinea).trim();
    try {
        // 1. Obtener la frecuencia programada real de la configuración de líneas UCOT
        const lineasUcot = await obtenerLineasUCOT();
        const lineaInfo = lineasUcot.find((l) => l.numero === linea);
        const frecuenciaProgramada = lineaInfo?.frecuenciaProgramada ?? 15;
        // 2. Consultar buses UCOT activos en bus_last_pos para calcular desviación y frecuencia real
        const activeUcotBuses = await (0, database_1.default)('bus_last_pos')
            .where('agency_id', '70')
            .where('linea', linea)
            .where('timestamp_gps', '>', database_1.default.raw("NOW() - INTERVAL '20 minutes'"))
            .select('data_jsonb');
        let desviacion = 0;
        let frecuenciaCalculada = 'SIN DATOS';
        if (activeUcotBuses.length > 0) {
            let totalDelay = 0;
            let countWithDelay = 0;
            for (const b of activeUcotBuses) {
                const delay = Number(b.data_jsonb?.desviacionMin);
                if (!isNaN(delay)) {
                    totalDelay += delay;
                    countWithDelay++;
                }
            }
            desviacion = countWithDelay > 0 ? Math.round(totalDelay / countWithDelay) : 0;
            frecuenciaCalculada = Math.max(1, frecuenciaProgramada + desviacion);
        }
        // Solape real cross-operador (same_empresa=false): la línea aparece como
        // lado A o B; tomamos el % de SU recorrido que el rival le disputa.
        const filas = (await (0, database_1.default)('corridor_overlap')
            .where('same_empresa', false)
            .andWhere((b) => b.where('linea_a', linea).orWhere('linea_b', linea))
            .select('linea_a', 'linea_b', 'agency_a', 'agency_b', 'sentido_a', 'sentido_b', 'pct_a_in_b', 'pct_b_in_a', 'shared_km'));
        const competidores = filas.map((r) => {
            const targetEsA = String(r.linea_a) === linea;
            const rivalLinea = targetEsA ? r.linea_b : r.linea_a;
            // % del recorrido de la línea analizada que el rival le solapa.
            const pct = Math.round(Number((targetEsA ? r.pct_a_in_b : r.pct_b_in_a) ?? 0));
            const km = Math.round(Number(r.shared_km ?? 0) * 10) / 10;
            const sentido = (targetEsA ? r.sentido_a : r.sentido_b) === 'VUELTA' ? 'VUELTA' : 'IDA';
            const tipoCompetencia = pct >= 50 ? 'DIRECTA' : pct >= 20 ? 'PARCIAL' : 'NULA';
            const amenaza = pct >= 70 || km >= 8
                ? 'CRITICA'
                : pct >= 45 || km >= 4
                    ? 'ALTA'
                    : pct >= 20 || km >= 1.5
                        ? 'MEDIA'
                        : 'BAJA';
            return {
                linea: `${rivalLinea} (op ${targetEsA ? r.agency_b : r.agency_a})`,
                sentido,
                solapamientoKm: km,
                porcentajeRecorridoCompartido: pct,
                paradasCompartidas: 0, // corridor_overlap es por geometría, no paradas
                tipoCompetencia,
                amenaza,
            };
        });
        competidores.sort((a, b) => {
            const ord = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
            return ord[a.amenaza] - ord[b.amenaza] ||
                b.porcentajeRecorridoCompartido - a.porcentajeRecorridoCompartido;
        });
        const competenciaDirecta = competidores.filter((c) => c.tipoCompetencia === 'DIRECTA').length;
        const competenciaParcial = competidores.filter((c) => c.tipoCompetencia === 'PARCIAL').length;
        const porcentajePromedio = competidores.length
            ? Math.round(competidores.reduce((s, c) => s + c.porcentajeRecorridoCompartido, 0) /
                competidores.length)
            : 0;
        // Metadatos REALES de la línea desde GTFS (nombre/origen-destino).
        const ruta = (await (0, database_1.default)('gtfs.routes')
            .where('route_short_name', linea)
            .select('route_long_name')
            .first());
        const nombre = ruta?.route_long_name?.trim() || `Línea ${linea}`;
        const [origen, destino] = nombre.includes(' - ')
            ? nombre.split(' - ').map((s) => s.trim())
            : [nombre, ''];
        // Auditoría e integridad de datos para cumplir normas ISO
        logger_1.default.info(`[audit] Línea ${linea} analizada. Frecuencia Prog: ${frecuenciaProgramada} min, Real: ${frecuenciaCalculada} min, Desviación: ${desviacion} min. Buses en servicio: ${activeUcotBuses.length}. Competidores: ${competidores.length}`);
        return {
            linea,
            timestamp,
            datosLinea: { nombre, origen, destino: destino || origen, paradas: 0 },
            analisisFrequencia: {
                frecuenciaProgramada,
                frecuenciaCalculada,
                desviacion,
            },
            competidores,
            resumen: {
                totalCompetidores: competidores.length > 0,
                competenciaDirecta,
                competenciaParcial,
                amenazaPromedio: competidores.length
                    ? competidores[0].amenaza
                    : 'NINGUNA',
                porcentajePromedioSolapamiento: porcentajePromedio,
            },
        };
    }
    catch (error) {
        logger_1.default.error(`Error analizando línea ${linea}:`, error);
        throw error;
    }
}
/**
 * Obtiene análisis de TODAS las líneas UCOT simultáneamente
 */
async function analizarTodasLasLineas() {
    const lineas = await obtenerLineasUCOT();
    const reportes = await Promise.all(lineas.map((l) => analizarCompetenciaLinea(l.numero)));
    return reportes;
}
exports.default = {
    obtenerLineasUCOT,
    analizarCompetenciaLinea,
    analizarTodasLasLineas,
    horaAMinutos,
    calcularFrecuenciaPromedio,
};
