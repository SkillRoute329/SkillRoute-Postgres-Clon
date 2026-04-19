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

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../config/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface Parada {
  numero: number;
  nombre: string;
  lat?: number;
  lng?: number;
}

export interface Horario {
  hora: string;      // "07:30"
  minutos: number;   // 450
  tipoDia: 'HABIL' | 'SABADO' | 'DOMINGO';
}

export interface SentidoViaje {
  nombre: 'IDA' | 'VUELTA';
  origen: string;
  destino: string;
  paradas: Parada[];
  horarios: Horario[];
}

export interface LineaUCOT {
  numero: string;
  nombre: string;
  empresa: string; // "UCOT"
  sentidos: SentidoViaje[];
  frecuenciaProgramada: number; // minutos
  frecuenciaReal?: number; // minutos (calculado)
}

export interface CompetidorDetectado {
  linea: string;
  sentido: 'IDA' | 'VUELTA';
  solapamientoKm: number;
  porcentajeRecorridoCompartido: number;
  paradasCompartidas: number;
  tipoCompetencia: 'DIRECTA' | 'PARCIAL' | 'NULA' | 'INVERSA';
  amenaza: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
}

export interface ReporteCompetenciaCompleto {
  linea: string;
  timestamp: string;
  datosLinea: {
    nombre: string;
    origen: string;
    destino: string;
    paradas: number;
  };
  analisisFrequencia: {
    frecuenciaProgramada: number;
    frecuenciaCalculada: number;
    desviacion: number;
  };
  competidores: CompetidorDetectado[];
  resumen: {
    totalCompetidores: boolean;
    competenciaDirecta: number;
    competenciaParcial: number;
    amenazaPromedio: string;
    porcentajePromedioSolapamiento: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTE HTTP
// ═══════════════════════════════════════════════════════════════════════════

const STM_API_URL = 'https://www.montevideo.gub.uy/api/stm';
const STM_HORARIOS_URL = 'https://www.montevideo.gub.uy/app/stm/horarios/';

const httpClient = axios.create({
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
function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Calcula minutos entre dos horarios
 */
function calcularIntervaloMinutos(hora1: string, hora2: string): number {
  const m1 = horaAMinutos(hora1);
  const m2 = horaAMinutos(hora2);
  return Math.abs(m2 - m1);
}

/**
 * Calcula frecuencia promedio de una línea basada en horarios
 */
function calcularFrecuenciaPromedio(horarios: Horario[]): number {
  if (horarios.length < 2) return 0;

  const intervalos: number[] = [];
  for (let i = 1; i < horarios.length; i++) {
    const intervalo = horarios[i].minutos - horarios[i - 1].minutos;
    if (intervalo > 0) {
      intervalos.push(intervalo);
    }
  }

  if (intervalos.length === 0) return 0;
  const suma = intervalos.reduce((a, b) => a + b, 0);
  return Math.round(suma / intervalos.length);
}

/**
 * Clasifica tipo de competencia
 */
function clasificarCompetencia(
  paradasCompartidas: number,
  totalParadas: number,
  sentidoOpuesto: boolean
): 'DIRECTA' | 'PARCIAL' | 'NULA' | 'INVERSA' {
  const porcentaje = (paradasCompartidas / totalParadas) * 100;

  if (sentidoOpuesto) {
    return porcentaje > 30 ? 'INVERSA' : 'NULA';
  }

  if (porcentaje > 70) return 'DIRECTA';
  if (porcentaje > 30) return 'PARCIAL';
  return 'NULA';
}

/**
 * Calcula nivel de amenaza
 */
function calcularAmenaza(
  tipoCompetencia: string,
  porcentajeSolapamiento: number,
  frecuenciaCompetidor: number
): 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' {
  if (tipoCompetencia === 'DIRECTA' && porcentajeSolapamiento > 80) {
    return frecuenciaCompetidor < 15 ? 'CRITICA' : 'ALTA';
  }

  if (tipoCompetencia === 'DIRECTA') return 'ALTA';
  if (tipoCompetencia === 'PARCIAL') return 'MEDIA';
  if (tipoCompetencia === 'INVERSA') return 'BAJA';

  return 'BAJA';
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES DE SCRAPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * OPCIÓN 1: Intenta obtener desde API oficial STM
 */
async function obtenerLineasDesdeAPI(): Promise<LineaUCOT[]> {
  try {
    logger.info('Intentando obtener líneas desde API oficial STM...');

    const response = await httpClient.get(`${STM_API_URL}/lineas`);
    const lineas = response.data;

    logger.info(`✅ API STM respondió con ${lineas.length} líneas`);
    return lineas;
  } catch (error) {
    logger.warn('❌ API oficial STM no disponible, intentando scraping HTML...');
    return [];
  }
}

/**
 * OPCIÓN 2: Scrappea datos de horarios públicos HTML
 */
async function obtenerLineasDesdeHTML(): Promise<LineaUCOT[]> {
  try {
    logger.info('Scrapeando datos públicos de horarios STM (HTML)...');

    const response = await httpClient.get(STM_HORARIOS_URL);
    const html = response.data;

    // Buscar patrones en HTML
    // Ejemplo: buscar líneas mencionadas en el HTML
    const patronLineas = /línea\s+(\d+)/gi;
    const lineasEncontradas = new Set<string>();

    let match;
    while ((match = patronLineas.exec(html)) !== null) {
      lineasEncontradas.add(match[1]);
    }

    logger.info(
      `Encontradas ${lineasEncontradas.size} líneas potenciales en HTML`
    );

    // Convertir a objetos LineaUCOT
    const lineas: LineaUCOT[] = Array.from(lineasEncontradas).map((num) => ({
      numero: num,
      nombre: `Línea ${num}`,
      empresa: 'UCOT',
      sentidos: [],
      frecuenciaProgramada: 15,
    }));

    return lineas;
  } catch (error) {
    logger.warn('❌ Error scrapeando HTML:', error);
    return [];
  }
}

/**
 * OPCIÓN 3: Lee las 21 líneas UCOT reales desde el master JSON local
 * Fuente: backend/config/ucot-lines-master.json (generado desde Cartones de Servicio 2026)
 */
function obtenerLineasUCOTDesdeMaster(): LineaUCOT[] {
  try {
    const masterPath = path.join(__dirname, '../../config/ucot-lines-master.json');
    const raw = fs.readFileSync(masterPath, 'utf-8');
    const master = JSON.parse(raw) as {
      lineas: Array<{
        id: string;
        nombre: string;
        empresa: string;
        frecuenciaProgramada: number;
        paradas: string[];
      }>;
    };

    const lineas: LineaUCOT[] = master.lineas.map((l) => {
      const paradas: Parada[] = l.paradas.map((nombre, idx) => ({
        numero: idx + 1,
        nombre,
      }));

      const paradaInicio = paradas[0]?.nombre ?? 'Terminal';
      const paradaFin = paradas[paradas.length - 1]?.nombre ?? 'Terminal';

      // Generar horarios sintéticos basados en frecuencia programada
      // (serán reemplazados por datos reales de la API STM cuando esté disponible)
      const freq = l.frecuenciaProgramada || 15;
      const horariosIDA: Horario[] = [];
      const horariosVUELTA: Horario[] = [];
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

    logger.info(`✅ Cargadas ${lineas.length} líneas UCOT desde master JSON local`);
    return lineas;
  } catch (error) {
    logger.error('❌ No se pudo leer ucot-lines-master.json, usando fallback mínimo:', error);
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
export async function obtenerLineasUCOT(): Promise<LineaUCOT[]> {
  try {
    // Intentar en orden de preferencia
    const desdeAPI = await obtenerLineasDesdeAPI();
    if (desdeAPI.length > 0) return desdeAPI;

    const desdeHTML = await obtenerLineasDesdeHTML();
    if (desdeHTML.length > 0) return desdeHTML;

    // Fallback: leer las 21 líneas UCOT reales desde el master JSON local
    return obtenerLineasUCOTDesdeMaster();
  } catch (error) {
    logger.error('Error obteniendo líneas UCOT:', error);
    // Último recurso: datos del master local
    return obtenerLineasUCOTDesdeMaster();
  }
}

/**
 * Calcula paradas compartidas entre dos líneas
 */
function calcularParadasCompartidas(
  paradas1: Parada[],
  paradas2: Parada[]
): Parada[] {
  const nombres1 = paradas1.map((p) => p.nombre.toLowerCase());
  return paradas2.filter((p) => nombres1.includes(p.nombre.toLowerCase()));
}

/**
 * ANÁLISIS PRINCIPAL: Detecta competencia para una línea específica
 */
export async function analizarCompetenciaLinea(
  numeroLinea: string
): Promise<ReporteCompetenciaCompleto> {
  const timestamp = new Date().toISOString();

  try {
    // 1. Obtener todas las líneas UCOT
    const todasLasLineas = await obtenerLineasUCOT();

    // 2. Encontrar la línea a analizar
    const lineaTarget = todasLasLineas.find((l) => l.numero === numeroLinea);
    if (!lineaTarget) {
      throw new Error(`Línea ${numeroLinea} no encontrada`);
    }

    // 3. Calcular frecuencia de cada sentido
    lineaTarget.sentidos.forEach((sentido) => {
      sentido.horarios.forEach((h) => {
        h.minutos = horaAMinutos(h.hora);
      });
      sentido.horarios.sort((a, b) => a.minutos - b.minutos);
    });

    // 4. Analizar competencia con todas las demás líneas
    const competidores: CompetidorDetectado[] = [];

    for (const otraLinea of todasLasLineas) {
      if (otraLinea.numero === numeroLinea) continue; // No comparar consigo misma

      for (const sentidoTarget of lineaTarget.sentidos) {
        for (const sentidoOtro of otraLinea.sentidos) {
          // Detectar paradas compartidas
          const paradasCompartidas = calcularParadasCompartidas(
            sentidoTarget.paradas,
            sentidoOtro.paradas
          );

          if (paradasCompartidas.length === 0) continue; // Sin solapamiento

          // Calcular métricas
          const porcentajeSolapamiento =
            (paradasCompartidas.length / sentidoTarget.paradas.length) * 100;

          const sentidoOpuesto =
            sentidoTarget.nombre !== sentidoOtro.nombre ||
            sentidoTarget.origen !== sentidoOtro.origen;

          const tipoCompetencia = clasificarCompetencia(
            paradasCompartidas.length,
            sentidoTarget.paradas.length,
            sentidoOpuesto
          );

          const frecuenciaOtra = calcularFrecuenciaPromedio(sentidoOtro.horarios);

          const amenaza = calcularAmenaza(
            tipoCompetencia,
            porcentajeSolapamiento,
            frecuenciaOtra
          );

          competidores.push({
            linea: otraLinea.numero,
            sentido: sentidoOtro.nombre,
            solapamientoKm: paradasCompartidas.length * 2, // Aproximado: 2km por parada
            porcentajeRecorridoCompartido: Math.round(porcentajeSolapamiento),
            paradasCompartidas: paradasCompartidas.length,
            tipoCompetencia,
            amenaza,
          });
        }
      }
    }

    // 5. Calcular resumen
    const competenciaDirecta = competidores.filter(
      (c) => c.tipoCompetencia === 'DIRECTA'
    ).length;
    const competenciaParcial = competidores.filter(
      (c) => c.tipoCompetencia === 'PARCIAL'
    ).length;
    const porcentajePromedio = Math.round(
      competidores.reduce((sum, c) => sum + c.porcentajeRecorridoCompartido, 0) /
        Math.max(competidores.length, 1)
    );

    return {
      linea: numeroLinea,
      timestamp,
      datosLinea: {
        nombre: lineaTarget.nombre,
        origen: lineaTarget.sentidos[0]?.origen || 'Desconocido',
        destino: lineaTarget.sentidos[0]?.destino || 'Desconocido',
        paradas: lineaTarget.sentidos[0]?.paradas.length || 0,
      },
      analisisFrequencia: {
        frecuenciaProgramada: lineaTarget.frecuenciaProgramada,
        frecuenciaCalculada: calcularFrecuenciaPromedio(
          lineaTarget.sentidos[0]?.horarios || []
        ),
        desviacion:
          calcularFrecuenciaPromedio(lineaTarget.sentidos[0]?.horarios || []) -
          lineaTarget.frecuenciaProgramada,
      },
      competidores: competidores.sort((a, b) => {
        const ordenAmenaza = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
        return (
          ordenAmenaza[a.amenaza] - ordenAmenaza[b.amenaza]
        );
      }),
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
  } catch (error) {
    logger.error(`Error analizando línea ${numeroLinea}:`, error);
    throw error;
  }
}

/**
 * Obtiene análisis de TODAS las líneas UCOT simultáneamente
 */
export async function analizarTodasLasLineas(): Promise<
  ReporteCompetenciaCompleto[]
> {
  const lineas = await obtenerLineasUCOT();
  const reportes = await Promise.all(
    lineas.map((l) => analizarCompetenciaLinea(l.numero))
  );
  return reportes;
}

export default {
  obtenerLineasUCOT,
  analizarCompetenciaLinea,
  analizarTodasLasLineas,
  horaAMinutos,
  calcularFrecuenciaPromedio,
};
