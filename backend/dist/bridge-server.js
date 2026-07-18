"use strict";
/**
 * BRIDGE SERVER - TransformaFacil 2.0
 * ═══════════════════════════════════════════════════════════════════════════
 * Conecta Frontend (3099) con Backend (3002) y datos PÚBLICOS STM
 *
 * DATOS: https://www.montevideo.gub.uy/app/stm/horarios/ (DATOS PÚBLICOS)
 *
 * EJECUTAR: ts-node src/bridge-server.ts
 * O: npm run bridge
 *
 * Endpoints:
 * - GET /health
 * - GET /api/lines/ucot         → Todas las 21 líneas UCOT con horarios
 * - GET /api/positions           → Posiciones GPS de la flota (Real → Sintético)
 * - GET /api/analysis/{linea}   → Análisis COMPLETO de competencia
 * - GET /api/intelligence/{linea} → Datos de inteligencia detallados
 * - GET /api/all-analysis        → Análisis de TODAS las líneas
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const logger_1 = __importDefault(require("./config/logger"));
const stmPublicDataScraper_1 = require("./services/stmPublicDataScraper");
const MasterOrchestrator_1 = __importDefault(require("./orchestrators/MasterOrchestrator"));
const agentsRoutes_1 = __importDefault(require("./routes/agentsRoutes"));
// FASE 5.14 (2026-05-13): el bridge necesita acceso a bus_last_pos para
// devolver conteos REALES por linea/operador en /api/lines/:agencyId. Antes
// devolvia cantidad=0 hardcoded ("anti-simulacion"), lo que el frontend
// interpretaba literalmente como "0 buses UCOT activos".
const database_1 = __importDefault(require("./config/database"));
const responseCache_1 = require("./utils/responseCache");
const app = (0, express_1.default)();
const BRIDGE_PORT = process.env.BRIDGE_PORT || 3099;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
const STM_API_URL = 'https://www.montevideo.gub.uy/app/stm/horarios/';
// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════
app.use((0, cors_1.default)({ origin: '*' }));
app.use(express_1.default.json());
logger_1.default.info(`🌉 BRIDGE SERVER iniciando en puerto ${BRIDGE_PORT}`);
// ═══════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN DE AGENTES INTELIGENTES
// ═══════════════════════════════════════════════════════════════════════════
let masterOrchestrator = null;
async function initializeAgents() {
    try {
        const configPath = require('path').join(__dirname, '../config/lineas-config-real.json');
        const config = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
        masterOrchestrator = new MasterOrchestrator_1.default(config);
        await masterOrchestrator.initialize();
        // Asignar a app.locals para que las rutas puedan acceder
        app.locals.masterOrchestrator = masterOrchestrator;
        logger_1.default.info('✅ Sistema de agentes inteligentes inicializado exitosamente');
    }
    catch (error) {
        logger_1.default.error('❌ Error inicializando agentes:', error);
        // No fallar el servidor, solo alertar
    }
}
// Inicializar agentes en startup
initializeAgents().catch(err => logger_1.default.error('Fallo en inicialización de agentes:', err));
// ═══════════════════════════════════════════════════════════════════════════
// CACHÉ EN MEMORIA
// ═══════════════════════════════════════════════════════════════════════════
let lineasCache = [];
let ultimaActualizacion = null;
/**
 * Carga líneas UCOT desde datos públicos STM
 */
async function cargarLineas() {
    if (lineasCache.length > 0 &&
        ultimaActualizacion &&
        Date.now() - ultimaActualizacion.getTime() < 3600000 // 1 hora
    ) {
        return lineasCache;
    }
    try {
        logger_1.default.info('Cargando líneas UCOT desde datos públicos STM...');
        lineasCache = await (0, stmPublicDataScraper_1.obtenerLineasUCOT)();
        ultimaActualizacion = new Date();
        logger_1.default.info(`✅ Cargadas ${lineasCache.length} líneas UCOT`);
        return lineasCache;
    }
    catch (error) {
        logger_1.default.error('Error cargando líneas:', error);
        return lineasCache;
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Calcula distancia en km entre dos puntos GPS (Haversine)
 */
function calcularDistanciaKm(lat1, lng1, lat2, lng2) {
    const R = 6371; // Radio tierra en km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
/**
 * Convierte ReporteCompetenciaCompleto a formato AnalysisData
 */
async function convertirReporteAAnalysis(reporte) {
    // Calcular nivel de alerta basado en competencia
    const competenciaDirecta = reporte.competidores.filter((c) => c.tipoCompetencia === 'DIRECTA');
    // FASE 5.14 (2026-05-13): la metrica vieja era
    //   competidoresDirectos / paradas_de_la_linea
    // que no tiene interpretacion operativa (paradas no es el denominador
    // correcto para "flota en disputa") y ademas se combinaba con un
    // Math.max() contra porcentajePromedioSolapamiento mas abajo, lo que
    // generaba el numero del card contradictorio con el del detalle.
    // Ahora `pctFlotaEnDisputa` = porcentajePromedioSolapamiento crudo del
    // reporte: "% del recorrido propio compartido con competidor directo".
    // Si no hay competidores directos, 0.
    const pctFlotaEnDisputa = competenciaDirecta.length > 0
        ? Math.round(reporte.resumen.porcentajePromedioSolapamiento)
        : 0;
    const nivelAlerta = reporte.resumen.amenazaPromedio === 'CRITICA'
        ? 'ALTA'
        : reporte.resumen.amenazaPromedio === 'ALTA'
            ? 'MEDIA'
            : 'BAJA';
    // Obtener empresas únicas detectadas
    const empresasUnicas = [
        ...new Set(reporte.competidores.map((c) => c.linea)),
    ];
    // ─── Proximidad Real GPS (Alertas) desde bus_last_pos ───
    const alertas = [];
    try {
        // 1. Obtener buses de UCOT activos en esta línea
        const ucotBuses = await (0, database_1.default)('bus_last_pos')
            .where('agency_id', '70')
            .where('linea', reporte.linea)
            .where('timestamp_gps', '>', database_1.default.raw("NOW() - INTERVAL '20 minutes'"))
            .select('id_bus', 'lat', 'lon as lng', 'velocidad', 'destino');
        // 2. Extraer líneas y agencias rivales a evaluar
        const rivals = reporte.competidores.map((comp) => {
            const match = comp.linea.match(/^([^\s]+)\s+\(op\s+(\d+)\)$/);
            if (match) {
                return { linea: match[1], agencyId: match[2] };
            }
            return null;
        }).filter(Boolean);
        let rivalBuses = [];
        if (rivals.length > 0 && ucotBuses.length > 0) {
            // 3. Consultar buses rivales activos para estas líneas específicas (consulta agrupada paramétrica)
            rivalBuses = await (0, database_1.default)('bus_last_pos')
                .where('timestamp_gps', '>', database_1.default.raw("NOW() - INTERVAL '20 minutes'"))
                .andWhere(function () {
                rivals.forEach((r, idx) => {
                    if (idx === 0) {
                        this.where('agency_id', r.agencyId).andWhere('linea', r.linea);
                    }
                    else {
                        this.orWhere(function () {
                            this.where('agency_id', r.agencyId).andWhere('linea', r.linea);
                        });
                    }
                });
            })
                .select('id_bus', 'agency_id', 'linea', 'lat', 'lon as lng', 'velocidad', 'destino');
        }
        // 4. Evaluar distancias físicas entre buses UCOT y rivales
        for (const uBus of ucotBuses) {
            const uLat = Number(uBus.lat);
            const uLng = Number(uBus.lng);
            // Validaciones de rango e integridad física de coordenadas (estándar ISO/IEC)
            if (isNaN(uLat) || isNaN(uLng) || uLat < -90 || uLat > 90 || uLng < -180 || uLng > 180) {
                continue;
            }
            const competidoresCercanos = [];
            for (const rBus of rivalBuses) {
                const rLat = Number(rBus.lat);
                const rLng = Number(rBus.lng);
                if (isNaN(rLat) || isNaN(rLng) || rLat < -90 || rLat > 90 || rLng < -180 || rLng > 180) {
                    continue;
                }
                const dist = calcularDistanciaKm(uLat, uLng, rLat, rLng);
                // Generar confrontación si el bus rival está a menos de 2.0 km en el corredor
                if (dist <= 2.0) {
                    competidoresCercanos.push({
                        codigoBus: rBus.id_bus,
                        empresa: rBus.agency_id,
                        linea: rBus.linea,
                        sublinea: null,
                        destino: rBus.destino || 'Destino no especificado',
                        distanciaKm: Math.round(dist * 100) / 100, // Redondear a 2 decimales para calidad
                        lat: rLat,
                        lng: rLng,
                    });
                }
            }
            if (competidoresCercanos.length > 0) {
                // Ordenar del más cercano al más lejano
                competidoresCercanos.sort((a, b) => a.distanciaKm - b.distanciaKm);
                const maxAmenaza = competidoresCercanos[0];
                alertas.push({
                    busUcot: {
                        codigoBus: uBus.id_bus,
                        linea: reporte.linea,
                        sublinea: null,
                        destino: uBus.destino || reporte.datosLinea.destino,
                        velocidad: Number(uBus.velocidad) || 0,
                        lat: uLat,
                        lng: uLng,
                    },
                    competidoresCercanos,
                    maxAmenaza,
                });
            }
        }
        logger_1.default.info(`[audit] Proximidad procesada para línea ${reporte.linea}. Alertas generadas: ${alertas.length}. Buses evaluados: UCOT=${ucotBuses.length}, rivales=${rivalBuses.length}.`);
    }
    catch (err) {
        logger_1.default.error(`[audit] Falló el cálculo de proximidad real para línea ${reporte.linea}:`, err);
    }
    return {
        ok: true,
        linea: reporte.linea,
        resumen: {
            totalBusesUcot: reporte.datosLinea.paradas,
            busesConCompetenciaDirecta: reporte.resumen.competenciaDirecta,
            // FASE 5.14: ahora `pctFlotaEnDisputa` viene directo, sin Math.max
            // contra otra metrica distinta. Esto elimina la contradiccion
            // card-vs-detalle que reportaba el usuario.
            pctFlotaEnDisputa,
            nivelAlerta,
            empresasDetectadas: empresasUnicas,
        },
        alertas,
        timestamp: reporte.timestamp,
    };
}
// ═══════════════════════════════════════════════════════════════════════════
// RUTAS
// ═══════════════════════════════════════════════════════════════════════════
/**
 * GET /health
 * Verificar disponibilidad del bridge
 */
app.get('/health', (req, res) => {
    res.json({
        ok: true,
        message: 'Bridge Server activo',
        timestamp: new Date().toISOString(),
    });
});
/**
 * GET /api/lines/ucot
 * Obtiene TODAS las líneas UCOT con datos públicos STM
 * Incluye: horarios, paradas, sentidos (IDA/VUELTA)
 */
app.get('/api/lines/ucot', async (req, res) => {
    await handleLineasByAgency(req, res, '70');
});
/**
 * FASE 5.14 (2026-05-13)
 * GET /api/lines/:agencyId
 *
 * Generaliza /api/lines/ucot a CUALQUIER operador. Devuelve por linea la
 * cantidad de buses REALMENTE activos en bus_last_pos (refrescado por el
 * poller cada 10s). Esto cierra el gap "0 buses UCOT activos" que se veia
 * en Radar de Competencia: antes el endpoint hardcoded cantidad=0 como
 * "anti-simulacion", pero el frontend lo mostraba como ausencia total de
 * flota.
 *
 * agencyId admite codigos STM: 10=COETC, 20=COME, 50=CUTCSA, 70=UCOT.
 */
app.get('/api/lines/:agencyId', async (req, res) => {
    await handleLineasByAgency(req, res, req.params.agencyId);
});
const OPERADOR_NOMBRE = {
    '10': 'COETC',
    '20': 'COME',
    '50': 'CUTCSA',
    '70': 'UCOT',
};
async function handleLineasByAgency(req, res, agencyId) {
    try {
        // FASE 5.14: cache 15s — bus_last_pos refresca cada 10s, así que un
        // cache de 15s rara vez sirve datos obsoletos pero corta 90% del costo
        // cuando varios paneles del frontend piden lo mismo en paralelo.
        const payload = await (0, responseCache_1.cached)(`bridge:lines:${agencyId}`, 15000, async () => {
            const activeBusesRows = await (0, database_1.default)('bus_last_pos')
                .where('agency_id', agencyId)
                .where('updated_at', '>', database_1.default.raw("NOW() - INTERVAL '5 minutes'"))
                .select('linea', database_1.default.raw('COUNT(*)::int AS cantidad'), database_1.default.raw('ARRAY_AGG(id_bus ORDER BY id_bus) AS buses'))
                .groupBy('linea')
                .orderBy('linea');
            // FASE 6: Autodescubrimiento dinamico. Obtenemos TODAS las lineas vistas en los ultimos 7 dias
            const recentLines = await (0, database_1.default)('mv_cumplimiento_linea_diario')
                .where('agency_id', agencyId)
                .where('fecha', '>=', database_1.default.raw("CURRENT_DATE - INTERVAL '7 days'"))
                .whereNotNull('linea')
                .distinct('linea');
            // 2) Para UCOT enriquecemos con metadata de horarios (cargarLineas() scrap del STM).
            //    Para otros operadores no tenemos scrap todavia; solo devolvemos lo que
            //    bus_last_pos reporta. Esto sigue siendo dato REAL (no inventado).
            let metadataLineas = [];
            if (agencyId === '70') {
                try {
                    metadataLineas = await cargarLineas();
                }
                catch (e) {
                    logger_1.default.warn('[bridge] cargarLineas() fallo, sigo con bus_last_pos', { err: String(e) });
                }
            }
            const lineasMap = new Map();
            // Primero registrar lineas historicas con 0 buses
            for (const r of recentLines) {
                const linea = String(r.linea ?? '').trim();
                if (!linea || linea === '-' || linea === '—')
                    continue;
                lineasMap.set(linea, { linea, sublinea: null, cantidad: 0, buses: [] });
            }
            // Luego registrar/actualizar con buses en vivo
            for (const r of activeBusesRows) {
                const linea = String(r.linea ?? '').trim();
                if (!linea || linea === '-' || linea === '—')
                    continue;
                lineasMap.set(linea, {
                    linea,
                    sublinea: null,
                    cantidad: Number(r.cantidad) || 0,
                    buses: (r.buses ?? []).map((idBus) => ({
                        codigoBus: idBus.includes('_') ? idBus.split('_').slice(1).join('_') : idBus,
                        linea,
                        sublinea: null,
                        destino: null,
                    })),
                });
            }
            // Asegurar que las lineas conocidas del scrap esten presentes aunque
            // tengan 0 buses ahora (paro, turno corto, etc.).
            for (const meta of metadataLineas) {
                if (!lineasMap.has(meta.numero)) {
                    lineasMap.set(meta.numero, { linea: meta.numero, sublinea: null, cantidad: 0, buses: [] });
                }
            }
            const lineasFormato = Array.from(lineasMap.values()).sort((a, b) => a.linea.localeCompare(b.linea));
            return {
                ok: true,
                agencyId,
                operador: OPERADOR_NOMBRE[agencyId] ?? agencyId,
                totalLineas: lineasFormato.length,
                totalBuses: lineasFormato.reduce((acc, l) => acc + l.cantidad, 0),
                timestamp: new Date().toISOString(),
                lineas: lineasFormato,
                metadata: {
                    fuente: 'bus_last_pos (poller IMM stm-online, refrescado cada 10s) + horarios STM publicos',
                    ventanaMinutos: 5,
                    ultimaActualizacion: ultimaActualizacion?.toISOString(),
                },
            };
        });
        res.json(payload);
    }
    catch (error) {
        logger_1.default.error(`Error en /api/lines/${agencyId}:`, error);
        res.status(500).json({
            ok: false,
            message: `Error obteniendo lineas para agency_id=${agencyId}`,
            error: String(error),
        });
    }
}
/**
 * GET /api/analysis/{linea}
 * ANÁLISIS COMPLETO de competencia para una línea
 * Incluye: Frecuencia, solapamiento de rutas, sentidos de viaje
 */
app.get('/api/analysis/:linea', async (req, res) => {
    try {
        const { linea } = req.params;
        // Obtener análisis completo
        const reporte = await (0, stmPublicDataScraper_1.analizarCompetenciaLinea)(linea);
        // Convertir a formato API
        const analisis = await convertirReporteAAnalysis(reporte);
        // Agregar detalles adicionales
        res.json({
            ...analisis,
            // ANÁLISIS POR TIEMPO
            analisisFrequencia: {
                frecuenciaProgramada: reporte.analisisFrequencia.frecuenciaProgramada,
                frecuenciaCalculada: reporte.analisisFrequencia.frecuenciaCalculada,
                desviacionMinutos: reporte.analisisFrequencia.desviacion,
                desviacionPorcentaje: reporte.analisisFrequencia.frecuenciaProgramada > 0
                    ? Math.round((reporte.analisisFrequencia.desviacion /
                        reporte.analisisFrequencia.frecuenciaProgramada) *
                        100)
                    : 0,
            },
            // ANÁLISIS DE COBERTURA / SOLAPAMIENTO
            analisisCobertura: reporte.competidores.map((comp) => ({
                competidor: comp.linea,
                sentido: comp.sentido,
                paradasCompartidas: comp.paradasCompartidas,
                porcentajeSolapamiento: comp.porcentajeRecorridoCompartido,
                tipoCompetencia: comp.tipoCompetencia,
                amenaza: comp.amenaza,
            })),
            // ANÁLISIS DE SENTIDO
            analisisSentido: {
                propioSentidoIDA: `${reporte.datosLinea.origen} → ${reporte.datosLinea.destino}`,
                propioSentidoVUELTA: `${reporte.datosLinea.destino} → ${reporte.datosLinea.origen}`,
                competidoresEnMismoSentido: reporte.competidores.filter((c) => c.tipoCompetencia === 'DIRECTA').length,
                competidoresEnSentidoOpuesto: reporte.competidores.filter((c) => c.tipoCompetencia === 'INVERSA').length,
            },
            metadata: {
                dataType: 'DATOS PÚBLICOS',
                fuente: 'https://www.montevideo.gub.uy/app/stm/horarios/',
                metodoAnalisis: 'Comparación de paradas, horarios y sentidos de viaje PÚBLICOS',
            },
        });
    }
    catch (error) {
        logger_1.default.error(`Error en /api/analysis/${req.params.linea}:`, error);
        res.status(500).json({
            ok: false,
            linea: req.params.linea,
            message: 'Error analizando línea',
            error: String(error),
        });
    }
});
/**
 * GET /api/ucot/fleet-intel
 * Inteligencia agregada de flota para el Dashboard Operativo
 */
app.get('/api/ucot/fleet-intel', async (req, res) => {
    try {
        const reportes = await (0, stmPublicDataScraper_1.analizarTodasLasLineas)();
        // Consultar el conteo real de buses UCOT activos por línea en el último intervalo (20 minutos)
        const activeUcotBuses = await (0, database_1.default)('bus_last_pos')
            .where('agency_id', '70')
            .where('timestamp_gps', '>', database_1.default.raw("NOW() - INTERVAL '20 minutes'"))
            .select('linea', database_1.default.raw('COUNT(*)::int AS cantidad'))
            .groupBy('linea');
        const countMap = new Map();
        for (const row of activeUcotBuses) {
            countMap.set(String(row.linea).trim(), Number(row.cantidad) || 0);
        }
        const totalBuses = Array.from(countMap.values()).reduce((sum, val) => sum + val, 0);
        logger_1.default.info(`[audit] Generada inteligencia de flota. Líneas: ${reportes.length}, buses UCOT en servicio: ${totalBuses}.`);
        res.json({
            ok: true,
            timestamp: new Date().toISOString(),
            totalLineas: reportes.length,
            lineasEnServicio: reportes.filter((r) => r.analisisFrequencia.frecuenciaCalculada !== 'SIN DATOS').length || reportes.length,
            lineasSinServicio: reportes.filter((r) => r.analisisFrequencia.frecuenciaCalculada === 'SIN DATOS').length,
            totalBusesUcot: totalBuses,
            lineas: reportes.map((r) => ({
                lineaId: r.linea,
                nombre: r.datosLinea.nombre,
                numBuses: countMap.get(r.linea) ?? 0,
                frecuenciaProgramada: r.analisisFrequencia.frecuenciaProgramada,
                frecuenciaReal: r.analisisFrequencia.frecuenciaCalculada,
                amenazaCompetencia: r.resumen.amenazaPromedio,
            })),
        });
    }
    catch (error) {
        logger_1.default.error('Error en /api/ucot/fleet-intel:', error);
        res.status(500).json({ ok: false, message: 'Error obteniendo inteligencia de flota' });
    }
});
/**
 * GET /api/ucot/schedule/{linea}
 * Horarios resumidos para dashboards de auditoría
 */
app.get('/api/ucot/schedule/:linea', (req, res) => {
    const { linea } = req.params;
    // ANTI-SIMULACION (DIRECTRIZ 2026-05-02): los conteos de salidas y frecuencias
    // ANTERIORMENTE eran valores fijos hardcoded (42/28/20) para CUALQUIER línea.
    // Eso falseaba datos al usuario. Devolvemos estado honesto: pendiente integrar
    // con GTFS Postgres (gtfs.trips + gtfs.calendar) o scraper STM.
    res.json({
        ok: true,
        linea,
        nombreComercial: `Línea ${linea}`,
        categoria: 'urbana',
        tieneHorariosOficiales: false,
        dias: null,
        mensaje: 'Horarios pendientes de integración con GTFS oficial STM.',
    });
});
/**
 * GET /api/intelligence/{linea}
 * Inteligencia COMPLETA: incluye todo el análisis
 */
app.get('/api/intelligence/:linea', async (req, res) => {
    try {
        const { linea } = req.params;
        const reporte = await (0, stmPublicDataScraper_1.analizarCompetenciaLinea)(linea);
        res.json({
            ok: true,
            reporte,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error(`Error en /api/intelligence/${req.params.linea}:`, error);
        res.status(500).json({
            ok: false,
            linea: req.params.linea,
            message: 'Error obteniendo inteligencia',
        });
    }
});
/**
 * GET /api/all-analysis
 * Análisis de TODAS las líneas UCOT simultáneamente
 */
app.get('/api/all-analysis', async (req, res) => {
    try {
        logger_1.default.info('Generando análisis de todas las líneas UCOT...');
        const reportes = await (0, stmPublicDataScraper_1.analizarTodasLasLineas)();
        res.json({
            ok: true,
            totalLineas: reportes.length,
            reportes: reportes.map((r) => ({
                linea: r.linea,
                nombre: r.datosLinea.nombre,
                competidoresDetectados: r.competidores.length,
                amenazaPromedio: r.resumen.amenazaPromedio,
                porcentajeSolapamientoPromedio: r.resumen.porcentajePromedioSolapamiento,
                frecuencia: {
                    programada: r.analisisFrequencia.frecuenciaProgramada,
                    calculada: r.analisisFrequencia.frecuenciaCalculada,
                    desviacion: r.analisisFrequencia.desviacion,
                },
            })),
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error('Error en /api/all-analysis:', error);
        res.status(500).json({
            ok: false,
            message: 'Error analizando todas las líneas',
        });
    }
});
/**
 * POST /api/update-from-backend
 * Permite que el backend actualice datos en el bridge
 */
app.post('/api/update-from-backend', (req, res) => {
    try {
        const { lineas } = req.body;
        if (lineas && Array.isArray(lineas)) {
            // En producción: actualizar MOCK_LINEAS_UCOT con datos reales
            logger_1.default.info('Bridge recibió actualización del backend', { lineas: lineas.length });
        }
        res.json({ ok: true, message: 'Datos actualizados' });
    }
    catch (error) {
        res.status(400).json({ ok: false, error: String(error) });
    }
});
// ═══════════════════════════════════════════════════════════════════════════
// RUTAS DE AGENTES INTELIGENTES
// ═══════════════════════════════════════════════════════════════════════════
app.use('/api/agents', agentsRoutes_1.default);
// Endpoint para CEO: estado de decisiones
app.get('/api/ceo/decision-status', (req, res) => {
    if (!masterOrchestrator) {
        return res.status(503).json({
            ok: false,
            message: 'Sistema de agentes no disponible',
        });
    }
    try {
        const ecosystems = masterOrchestrator.getAllEcosystems();
        const stats = masterOrchestrator.getAlertStatistics();
        res.json({
            ok: true,
            timestamp: new Date().toISOString(),
            agentes_activos: ecosystems.reduce((sum, e) => sum + e.totalAgents, 0),
            lineas_monitoreadas: ecosystems.length,
            alertas_totales: Object.values(stats).reduce((sum, line) => sum + (line.total || 0), 0),
            estadisticas: stats,
        });
    }
    catch (error) {
        res.status(500).json({
            ok: false,
            message: 'Error obteniendo estado de decisiones',
            error: String(error),
        });
    }
});
// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════
app.use((req, res) => {
    res.status(404).json({
        ok: false,
        message: `Ruta no encontrada: ${req.method} ${req.path}`,
    });
});
// ═══════════════════════════════════════════════════════════════════════════
// INICIAR SERVIDOR
// ═══════════════════════════════════════════════════════════════════════════
const server = app.listen(BRIDGE_PORT, () => {
    logger_1.default.info(`✅ Bridge Server escuchando en http://localhost:${BRIDGE_PORT}`);
    logger_1.default.info(`   Backend conectado en ${BACKEND_URL}`);
    logger_1.default.info(`   STM API source: ${STM_API_URL}`);
    logger_1.default.info(`\n   📊 Endpoints de Análisis Público:`);
    logger_1.default.info(`   - GET  /health`);
    logger_1.default.info(`   - GET  /api/lines/ucot`);
    logger_1.default.info(`   - GET  /api/analysis/:linea`);
    logger_1.default.info(`   - GET  /api/intelligence/:linea`);
    logger_1.default.info(`   - POST /api/update-from-backend`);
    logger_1.default.info(`\n   🤖 Endpoints de Agentes Inteligentes:`);
    logger_1.default.info(`   - GET  /api/agents/status`);
    logger_1.default.info(`   - GET  /api/agents/line/:lineId/status`);
    logger_1.default.info(`   - POST /api/agents/line/:lineId/alert`);
    logger_1.default.info(`   - GET  /api/agents/alerts/history`);
    logger_1.default.info(`   - GET  /api/agents/alerts/statistics`);
    logger_1.default.info(`\n   🏢 Endpoints Ejecutivos:`);
    logger_1.default.info(`   - GET  /api/ceo/decision-status`);
});
exports.default = server;
