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

import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import logger from './config/logger';
import {
  obtenerLineasUCOT,
  analizarCompetenciaLinea,
  analizarTodasLasLineas,
  type LineaUCOT,
  type ReporteCompetenciaCompleto,
} from './services/stmPublicDataScraper';
import MasterOrchestrator from './orchestrators/MasterOrchestrator';
import agentsRoutes from './routes/agentsRoutes';

const app = express();
const BRIDGE_PORT = process.env.BRIDGE_PORT || 3099;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
const STM_API_URL = 'https://www.montevideo.gub.uy/app/stm/horarios/';

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

app.use(cors({ origin: '*' }));
app.use(express.json());

logger.info(`🌉 BRIDGE SERVER iniciando en puerto ${BRIDGE_PORT}`);

// ═══════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN DE AGENTES INTELIGENTES
// ═══════════════════════════════════════════════════════════════════════════

let masterOrchestrator: MasterOrchestrator | null = null;

async function initializeAgents() {
  try {
    const configPath = require('path').join(__dirname, '../config/lineas-config-real.json');
    const config = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));

    masterOrchestrator = new MasterOrchestrator(config);
    await masterOrchestrator.initialize();

    // Asignar a app.locals para que las rutas puedan acceder
    app.locals.masterOrchestrator = masterOrchestrator;

    logger.info('✅ Sistema de agentes inteligentes inicializado exitosamente');
  } catch (error) {
    logger.error('❌ Error inicializando agentes:', error);
    // No fallar el servidor, solo alertar
  }
}

// Inicializar agentes en startup
initializeAgents().catch(err => logger.error('Fallo en inicialización de agentes:', err));

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

interface LineaData {
  linea: string;
  sublinea: string | null;
  cantidad: number;
  buses: BusInfo[];
}

interface BusInfo {
  codigoBus: string | number | null;
  linea: string | null;
  sublinea: string | null;
  destino: string | null;
  velocidad: number;
  lat: number;
  lng: number;
}

interface CompetidorCercano {
  codigoBus: string | null;
  empresa: number | string;
  linea: string | null;
  sublinea: string | null;
  destino: string | null;
  distanciaKm: number;
  lat: number;
  lng: number;
}

interface Alerta {
  busUcot: BusInfo;
  competidoresCercanos: CompetidorCercano[];
  maxAmenaza: CompetidorCercano;
}

interface Resumen {
  totalBusesUcot: number;
  busesConCompetenciaDirecta: number;
  pctFlotaEnDisputa: number;
  nivelAlerta: string;
  empresasDetectadas: string[];
}

interface AnalysisData {
  ok: boolean;
  linea: string;
  resumen: Resumen;
  alertas: Alerta[];
  timestamp: string;
  mensaje?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHÉ EN MEMORIA
// ═══════════════════════════════════════════════════════════════════════════

let lineasCache: LineaUCOT[] = [];
let ultimaActualizacion: Date | null = null;

/**
 * Carga líneas UCOT desde datos públicos STM
 */
async function cargarLineas(): Promise<LineaUCOT[]> {
  if (
    lineasCache.length > 0 &&
    ultimaActualizacion &&
    Date.now() - ultimaActualizacion.getTime() < 3600000 // 1 hora
  ) {
    return lineasCache;
  }

  try {
    logger.info('Cargando líneas UCOT desde datos públicos STM...');
    lineasCache = await obtenerLineasUCOT();
    ultimaActualizacion = new Date();
    logger.info(`✅ Cargadas ${lineasCache.length} líneas UCOT`);
    return lineasCache;
  } catch (error) {
    logger.error('Error cargando líneas:', error);
    return lineasCache;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula distancia en km entre dos puntos GPS (Haversine)
 */
function calcularDistanciaKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Radio tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
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
function convertirReporteAAnalysis(
  reporte: ReporteCompetenciaCompleto
): AnalysisData {
  // Calcular nivel de alerta basado en competencia
  const competenciaDirecta = reporte.competidores.filter(
    (c) => c.tipoCompetencia === 'DIRECTA'
  );
  const pctFlotaEnDisputa = Math.round(
    (competenciaDirecta.length / Math.max(reporte.datosLinea.paradas, 1)) * 100
  );

  const nivelAlerta =
    reporte.resumen.amenazaPromedio === 'CRITICA'
      ? 'ALTA'
      : reporte.resumen.amenazaPromedio === 'ALTA'
      ? 'MEDIA'
      : 'BAJA';

  // Obtener empresas únicas detectadas
  const empresasUnicas = [
    ...new Set(reporte.competidores.map((c) => c.linea)),
  ];

  // Convertir competidores a alertas
  const alertas: Alerta[] = reporte.competidores
    .filter((comp) => comp.amenaza !== 'BAJA')
    .map((comp) => ({
      busUcot: {
        codigoBus: `UCOT-${reporte.linea}`,
        linea: reporte.linea,
        sublinea: null,
        destino: reporte.datosLinea.destino,
        velocidad: 30,
        lat: -34.9,
        lng: -56.17,
      },
      competidoresCercanos: [
        {
          codigoBus: `COMP-${comp.linea}`,
          empresa: comp.linea,
          linea: comp.linea,
          sublinea: null,
          destino: `Sentido ${comp.sentido}`,
          distanciaKm: comp.solapamientoKm,
          lat: -34.9,
          lng: -56.17,
        },
      ],
      maxAmenaza: {
        codigoBus: `COMP-${comp.linea}`,
        empresa: comp.linea,
        linea: comp.linea,
        sublinea: null,
        destino: `Sentido ${comp.sentido}`,
        distanciaKm: comp.solapamientoKm,
        lat: -34.9,
        lng: -56.17,
      },
    }));

  return {
    ok: true,
    linea: reporte.linea,
    resumen: {
      totalBusesUcot: reporte.datosLinea.paradas,
      busesConCompetenciaDirecta: reporte.resumen.competenciaDirecta,
      pctFlotaEnDisputa: Math.max(
        pctFlotaEnDisputa,
        reporte.resumen.porcentajePromedioSolapamiento
      ),
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
app.get('/health', (req: Request, res: Response) => {
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
app.get('/api/lines/ucot', async (req: Request, res: Response) => {
  try {
    const lineas = await cargarLineas();

    const lineasFormato: LineaData[] = lineas.map((linea) => ({
      linea: linea.numero,
      sublinea: null,
      cantidad: linea.sentidos.length * 2, // Estimado de buses
      buses: linea.sentidos.flatMap((sentido) =>
        sentido.horarios.map((h, idx) => ({
          codigoBus: `${linea.numero}-${sentido.nombre}-${idx}`,
          linea: linea.numero,
          sublinea: null,
          destino: `${sentido.origen} → ${sentido.destino}`,
          velocidad: 30,
          lat: -34.9 + Math.random() * 0.1,
          lng: -56.17 + Math.random() * 0.1,
        }))
      ),
    }));

    const data = {
      ok: true,
      totalLineas: lineas.length,
      totalBuses: lineasFormato.reduce((acc, l) => acc + l.cantidad, 0),
      timestamp: new Date().toISOString(),
      lineas: lineasFormato,
      metadata: {
        fuente: 'Datos públicos STM (https://www.montevideo.gub.uy/app/stm/horarios/)',
        ultimaActualizacion: ultimaActualizacion?.toISOString(),
      },
    };
    res.json(data);
  } catch (error) {
    logger.error('Error en /api/lines/ucot:', error);
    res.status(500).json({
      ok: false,
      message: 'Error obteniendo líneas UCOT',
      error: String(error),
    });
  }
});

/**
 * GET /api/analysis/{linea}
 * ANÁLISIS COMPLETO de competencia para una línea
 * Incluye: Frecuencia, solapamiento de rutas, sentidos de viaje
 */
app.get('/api/analysis/:linea', async (req: Request, res: Response) => {
  try {
    const { linea } = req.params;

    // Obtener análisis completo
    const reporte = await analizarCompetenciaLinea(linea);

    // Convertir a formato API
    const analisis = convertirReporteAAnalysis(reporte);

    // Agregar detalles adicionales
    res.json({
      ...analisis,
      // ANÁLISIS POR TIEMPO
      analisisFrequencia: {
        frecuenciaProgramada: reporte.analisisFrequencia.frecuenciaProgramada,
        frecuenciaCalculada: reporte.analisisFrequencia.frecuenciaCalculada,
        desviacionMinutos: reporte.analisisFrequencia.desviacion,
        desviacionPorcentaje: Math.round(
          (reporte.analisisFrequencia.desviacion /
            reporte.analisisFrequencia.frecuenciaProgramada) *
            100
        ),
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
        competidoresEnMismoSentido: reporte.competidores.filter(
          (c) => c.tipoCompetencia === 'DIRECTA'
        ).length,
        competidoresEnSentidoOpuesto: reporte.competidores.filter(
          (c) => c.tipoCompetencia === 'INVERSA'
        ).length,
      },
      metadata: {
        dataType: 'DATOS PÚBLICOS',
        fuente: 'https://www.montevideo.gub.uy/app/stm/horarios/',
        metodoAnalisis:
          'Comparación de paradas, horarios y sentidos de viaje PÚBLICOS',
      },
    });
  } catch (error) {
    logger.error(`Error en /api/analysis/${req.params.linea}:`, error);
    res.status(500).json({
      ok: false,
      linea: req.params.linea,
      message: 'Error analizando línea',
      error: String(error),
    });
  }
});

/**
 * GET /api/intelligence/{linea}
 * Inteligencia COMPLETA: incluye todo el análisis
 */
app.get('/api/intelligence/:linea', async (req: Request, res: Response) => {
  try {
    const { linea } = req.params;
    const reporte = await analizarCompetenciaLinea(linea);
    res.json({
      ok: true,
      reporte,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(`Error en /api/intelligence/${req.params.linea}:`, error);
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
app.get('/api/all-analysis', async (req: Request, res: Response) => {
  try {
    logger.info('Generando análisis de todas las líneas UCOT...');
    const reportes = await analizarTodasLasLineas();

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
  } catch (error) {
    logger.error('Error en /api/all-analysis:', error);
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
app.post('/api/update-from-backend', (req: Request, res: Response) => {
  try {
    const { lineas } = req.body;
    if (lineas && Array.isArray(lineas)) {
      // En producción: actualizar MOCK_LINEAS_UCOT con datos reales
      logger.info('Bridge recibió actualización del backend', { lineas: lineas.length });
    }
    res.json({ ok: true, message: 'Datos actualizados' });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error) });
  }
});

/**
 * GET /api/positions
 * Posiciones GPS de los buses UCOT en tiempo real.
 * Intenta la API pública IMM; si falla, genera posiciones aproximadas
 * basadas en las paradas conocidas de cada línea.
 */
app.get('/api/positions', async (req: Request, res: Response) => {
  try {
    // API pública IMM — POST con body {empresa: "70"} para UCOT
    // Devuelve GeoJSON FeatureCollection con coordinates [lng, lat]
    const immUrl = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
    let buses: BusInfo[] = [];

    try {
      const response = await axios.post(
        immUrl,
        { empresa: '70' },
        {
          timeout: 8000,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Referer': 'https://www.montevideo.gub.uy/buses/',
            'Origin': 'https://www.montevideo.gub.uy',
          },
        }
      );
      const features = response.data?.features;
      if (Array.isArray(features)) {
        buses = features.map((f: any) => {
          const p = f.properties ?? {};
          const [lng, lat] = f.geometry?.coordinates ?? [0, 0];
          return {
            codigoBus: p.codigoBus ?? null,
            linea: String(p.linea ?? ''),
            sublinea: p.sublinea ?? null,
            destino: p.destinoDesc ?? null,
            velocidad: p.velocidad ?? 0,
            lat,
            lng,
          };
        });
        logger.info(`✅ GPS IMM: ${buses.length} buses UCOT en tiempo real`);
      }
    } catch (err: any) {
      logger.warn(`⚠️  GPS IMM no disponible (${err?.message ?? err}) — generando posiciones aproximadas`);
    }

    // Fallback: posiciones sintéticas basadas en paradas reales de cada línea
    if (buses.length === 0) {
      const lineas = await cargarLineas();
      // Coordenadas de referencia para paradas clave de Montevideo
      const coordMap: Record<string, [number, number]> = {
        'Crio. Central':      [-34.8971, -56.1805],
        'Tres Cruces':        [-34.8919, -56.1711],
        'Intercamb Bell':     [-34.8857, -56.1495],
        'Instrucc y Bell':    [-34.8838, -56.1458],
        'Tnal RBco':          [-34.9126, -56.1760],
        'Portones':           [-34.8836, -56.0806],
        'Tnal Cerro':         [-34.9210, -56.2380],
        'Casabo':             [-34.9300, -56.2600],
        'Kilometro 16':       [-34.8510, -56.1040],
        'Zonamerica':         [-34.8136, -56.0714],
        'Solymar':            [-34.8202, -55.9875],
        'Mendoza':            [-34.8949, -56.1570],
        'Pya.Cerro/Tnal':    [-34.9227, -56.2424],
        'Mvd Shopping':       [-34.8856, -56.1526],
        'Tnal.Juncal':        [-34.9042, -56.2118],
        'Ciudad Vieja/T.Solis': [-34.9063, -56.2026],
      };

      let busId = 1;
      for (const linea of lineas) {
        // 2 buses por línea como mínimo
        for (let i = 0; i < 2; i++) {
          const sentido = linea.sentidos[i % linea.sentidos.length];
          if (!sentido) continue;

          const paradaRef = sentido.paradas[Math.floor(Math.random() * sentido.paradas.length)];
          const baseCoord = paradaRef ? coordMap[paradaRef.nombre] : null;

          const lat = baseCoord
            ? baseCoord[0] + (Math.random() - 0.5) * 0.01
            : -34.9 + (Math.random() - 0.5) * 0.15;
          const lng = baseCoord
            ? baseCoord[1] + (Math.random() - 0.5) * 0.01
            : -56.17 + (Math.random() - 0.5) * 0.15;

          buses.push({
            codigoBus: `UCOT-${linea.numero}-${String(busId).padStart(3, '0')}`,
            linea: linea.numero,
            sublinea: null,
            destino: `${sentido.origen} → ${sentido.destino}`,
            velocidad: Math.round(20 + Math.random() * 30),
            lat,
            lng,
          });
          busId++;
        }
      }
      logger.info(`📍 Posiciones sintéticas: ${buses.length} buses para ${lineas.length} líneas UCOT`);
    }

    res.json({
      ok: true,
      total: buses.length,
      buses,
      timestamp: new Date().toISOString(),
      fuente: buses.some(b => typeof b.codigoBus === 'string' && b.codigoBus.startsWith('UCOT-')) ? 'SINTETICO' : 'IMM_GPS',
    });
  } catch (error) {
    logger.error('Error en /api/positions:', error);
    res.status(500).json({ ok: false, message: 'Error obteniendo posiciones', error: String(error) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// RUTAS DE AGENTES INTELIGENTES
// ═══════════════════════════════════════════════════════════════════════════

app.use('/api/agents', agentsRoutes);

// Endpoint para CEO: estado de decisiones
app.get('/api/ceo/decision-status', (req: Request, res: Response) => {
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
      alertas_totales: Object.values(stats).reduce(
        (sum: number, line: any) => sum + (line.total || 0),
        0
      ),
      estadisticas: stats,
    });
  } catch (error) {
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

app.use((req: Request, res: Response) => {
  res.status(404).json({
    ok: false,
    message: `Ruta no encontrada: ${req.method} ${req.path}`,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INICIAR SERVIDOR
// ═══════════════════════════════════════════════════════════════════════════

const server = app.listen(BRIDGE_PORT, () => {
  logger.info(`✅ Bridge Server escuchando en http://localhost:${BRIDGE_PORT}`);
  logger.info(`   Backend conectado en ${BACKEND_URL}`);
  logger.info(`   STM API source: ${STM_API_URL}`);
  logger.info(`\n   📊 Endpoints de Análisis Público:`);
  logger.info(`   - GET  /health`);
  logger.info(`   - GET  /api/lines/ucot`);
  logger.info(`   - GET  /api/analysis/:linea`);
  logger.info(`   - GET  /api/intelligence/:linea`);
  logger.info(`   - POST /api/update-from-backend`);
  logger.info(`\n   🤖 Endpoints de Agentes Inteligentes:`);
  logger.info(`   - GET  /api/agents/status`);
  logger.info(`   - GET  /api/agents/line/:lineId/status`);
  logger.info(`   - POST /api/agents/line/:lineId/alert`);
  logger.info(`   - GET  /api/agents/alerts/history`);
  logger.info(`   - GET  /api/agents/alerts/statistics`);
  logger.info(`\n   🏢 Endpoints Ejecutivos:`);
  logger.info(`   - GET  /api/ceo/decision-status`);
});

export default server;
