/**
 * MOTOR DE INTELIGENCIA COMPETITIVA
 * ═══════════════════════════════════════════════════════════════════════════
 * Analiza competencia basado en:
 * - Horarios públicos de todas las líneas
 * - Posicionamiento real de unidades (IMM/GPS)
 * - Frecuencia de paso actual
 * - Ocupación estimada
 *
 * Genera reportes automáticos para agentes de tránsito
 */

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface CompetidorDetectado {
  codigoBus: string;
  empresa: string;
  linea: string;
  distanciaKm: number;
  tiempoAlcance: string; // ej: "2.5 minutos"
  velocidad: number; // km/h
  ocupacionEstimada: number | null; // % — null cuando IMM no publica ocupación
  amenaza: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
}

export interface AnalisisFrequencia {
  frecuenciaActualMinutos: number;
  frecuenciaProgramadaMinutos: number;
  desviacion: number; // %
  cumplimiento: number; // % de puntualidad
  intervaloPromedio: string;
  proximoPaseEstimado: string;
}

export interface AlertaCompetencia {
  tipo: 'INVASOR' | 'COMPETIDOR_CERCANO' | 'PERDIDA_FRECUENCIA' | 'RETARDO';
  severidad: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
  descripcion: string;
  accion_recomendada: string;
  timestamp: string;
}

export interface RecomendacionTactica {
  tipo: 'REFUERZO' | 'DESVIO' | 'AJUSTE_HORARIO' | 'MONITOREO' | 'OPERACIONAL';
  prioridad: 'URGENTE' | 'ALTA' | 'NORMAL' | 'BAJA';
  titulo: string;
  descripcion: string;
  impacto_revenue: number; // % estimado
  complejidad: 'BAJA' | 'MEDIA' | 'ALTA';
  tiempo_implementacion: string; // ej: "15 minutos"
}

export interface ReporteInteligenciaCompetitiva {
  linea: string;
  timestamp: string;

  // Resumen ejecutivo
  resumen: {
    estado: 'CRITICO' | 'ALERTA' | 'NORMAL' | 'OPTIMO';
    amenaza_nivel: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
    flota_en_disputa: number; // %
    ingresos_en_riesgo: number; // $ estimado
  };

  // Análisis detallado
  analisis: {
    frecuencia: AnalisisFrequencia;
    competencia_directa: CompetidorDetectado[];
    invasores: CompetidorDetectado[];
    servicios_afectados: number;
  };

  // Alertas en tiempo real
  alertas: AlertaCompetencia[];

  // Recomendaciones automáticas
  recomendaciones: RecomendacionTactica[];

  // Métricas de calidad
  metricas: {
    puntualidad_promedio: number; // %
    ocupacion_promedio: number; // %
    velocidad_promedio: number; // km/h
    tiempo_respuesta_datos: number; // ms
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DATOS DE EJEMPLO / CACHÉ
// ═══════════════════════════════════════════════════════════════════════════

const FRECUENCIAS_PROGRAMADAS: Record<string, number> = {
  '17': 15, // Línea 17: cada 15 min
  '71': 12, // Línea 71: cada 12 min
  '79': 20, // Línea 79: cada 20 min
};

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula distancia en km entre dos puntos (Haversine)
 */
function distanciaHaversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
 * Calcula tiempo aproximado de alcance entre dos buses
 */
function calcularTiempoAlcance(distanciaKm: number, velocidadKmh: number): string {
  if (velocidadKmh === 0) return 'Estacionado';
  const minutos = (distanciaKm / velocidadKmh) * 60;
  if (minutos < 1) return '< 1 minuto';
  return `${Math.round(minutos)} minutos`;
}

/**
 * Clasifica amenaza competitiva
 */
function clasificarAmenaza(distanciaKm: number): 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' {
  if (distanciaKm < 0.5) return 'CRITICA';
  if (distanciaKm < 1) return 'ALTA';
  if (distanciaKm < 2) return 'MEDIA';
  return 'BAJA';
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES PRINCIPALES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analiza la frecuencia de una línea comparando programado vs actual
 */
export function analizarFrecuencia(
  linea: string,
  serviciosActivos: number,
  tiempoPromedioPases: number, // minutos
): AnalisisFrequencia {
  const frecuenciaProgramada = FRECUENCIAS_PROGRAMADAS[linea] || 15;
  const desviacion = ((tiempoPromedioPases - frecuenciaProgramada) / frecuenciaProgramada) * 100;

  return {
    frecuenciaActualMinutos: tiempoPromedioPases,
    frecuenciaProgramadaMinutos: frecuenciaProgramada,
    desviacion: Math.round(desviacion * 10) / 10,
    cumplimiento: Math.max(0, 100 - Math.abs(desviacion)),
    intervaloPromedio: `${tiempoPromedioPases} minutos`,
    proximoPaseEstimado: new Date(Date.now() + tiempoPromedioPases * 60000).toLocaleTimeString(),
  };
}

/**
 * Detecta competidores cercanos a los buses de una línea
 * IMPORTANTE: En producción, integrar con IMM API real
 */
export function detectarCompetidores(
  busesUcot: Array<{ lat: number; lng: number; codigoBus: string }>,
  todosLosBuses: Array<{
    lat: number;
    lng: number;
    linea: string;
    empresa: string;
    velocidad: number;
  }>,
  lineaPropia: string,
): CompetidorDetectado[] {
  const competidores: CompetidorDetectado[] = [];

  for (const busUcot of busesUcot) {
    for (const busOtro of todosLosBuses) {
      // No incluir la propia línea
      if (busOtro.linea === lineaPropia && busOtro.empresa === 'UCOT') continue;

      const distancia = distanciaHaversine(busUcot.lat, busUcot.lng, busOtro.lat, busOtro.lng);

      // Solo competidores cercanos (< 3 km)
      if (distancia < 3 && distancia > 0) {
        competidores.push({
          codigoBus: busOtro.linea ? `COMP-${busOtro.linea}` : 'DESCONOCIDO',
          empresa: busOtro.empresa || 'Competidor',
          linea: busOtro.linea || 'Desconocida',
          distanciaKm: Math.round(distancia * 100) / 100,
          tiempoAlcance: calcularTiempoAlcance(distancia, busOtro.velocidad),
          velocidad: busOtro.velocidad,
          ocupacionEstimada: null, // IMM GPS no publica ocupación de pasajeros
          amenaza: clasificarAmenaza(distancia),
        });
      }
    }
  }

  return competidores.sort((a, b) => a.distanciaKm - b.distanciaKm);
}

/**
 * Genera alertas basadas en análisis de competencia
 */
export function generarAlertas(
  linea: string,
  frecuencia: AnalisisFrequencia,
  competidores: CompetidorDetectado[],
): AlertaCompetencia[] {
  const alertas: AlertaCompetencia[] = [];

  // Alerta: Frecuencia degradada
  if (frecuencia.cumplimiento < 80) {
    alertas.push({
      tipo: 'PERDIDA_FRECUENCIA',
      severidad: frecuencia.cumplimiento < 60 ? 'CRITICA' : 'ALTA',
      descripcion: `Frecuencia degradada en línea ${linea}. Actual: ${frecuencia.frecuenciaActualMinutos}min vs Programada: ${frecuencia.frecuenciaProgramadaMinutos}min`,
      accion_recomendada: 'Reforzar línea con unidad de contingencia',
      timestamp: new Date().toISOString(),
    });
  }

  // Alerta: Invasores detectados
  const invasores = competidores.filter((c) => c.amenaza === 'CRITICA');
  if (invasores.length > 0) {
    alertas.push({
      tipo: 'INVASOR',
      severidad: 'CRITICA',
      descripcion: `${invasores.length} bus(es) competidor(es) muy cercano(s) (< 0.5 km)`,
      accion_recomendada: 'Contactar con supervisor de tránsito inmediatamente',
      timestamp: new Date().toISOString(),
    });
  }

  // Alerta: Competencia directa
  const competenciaDirecta = competidores.filter((c) => c.amenaza === 'ALTA');
  if (competenciaDirecta.length > 2) {
    alertas.push({
      tipo: 'COMPETIDOR_CERCANO',
      severidad: 'MEDIA',
      descripcion: `${competenciaDirecta.length} competidor(es) en área de influencia directa`,
      accion_recomendada: 'Monitorear constantemente. Evaluar desvíos estratégicos',
      timestamp: new Date().toISOString(),
    });
  }

  return alertas;
}

/**
 * Genera recomendaciones tácticas automáticas
 */
export function generarRecomendaciones(
  linea: string,
  frecuencia: AnalisisFrequencia,
  competidores: CompetidorDetectado[],
  serviciosActivos: number,
): RecomendacionTactica[] {
  const recomendaciones: RecomendacionTactica[] = [];

  // Recomendación 1: Refuerzo
  if (frecuencia.cumplimiento < 85 && serviciosActivos < 8) {
    recomendaciones.push({
      tipo: 'REFUERZO',
      prioridad: 'URGENTE',
      titulo: `Reforzar línea ${linea} inmediatamente`,
      descripcion: `Frecuencia actual ${frecuencia.frecuenciaActualMinutos}min supera programada. Sumar 1-2 unidades`,
      impacto_revenue: 15,
      complejidad: 'BAJA',
      tiempo_implementacion: '5 minutos',
    });
  }

  // Recomendación 2: Desvío estratégico
  const invasoresAltos = competidores.filter(
    (c) => c.amenaza === 'CRITICA' || c.amenaza === 'ALTA',
  );
  if (invasoresAltos.length > 0) {
    recomendaciones.push({
      tipo: 'DESVIO',
      prioridad: 'ALTA',
      titulo: 'Evaluar desvío estratégico',
      descripcion: `Competidores detectados en ruta. Considerar desvío temporal para evitar coincidencia`,
      impacto_revenue: -5,
      complejidad: 'ALTA',
      tiempo_implementacion: '10 minutos',
    });
  }

  // Recomendación 3: Monitoreo intensivo
  if (competidores.length > 3) {
    recomendaciones.push({
      tipo: 'MONITOREO',
      prioridad: 'NORMAL',
      titulo: 'Monitoreo intensivo recomendado',
      descripcion: `${competidores.length} competidores detectados en zona. Monitoreando cada 2 minutos`,
      impacto_revenue: 0,
      complejidad: 'BAJA',
      tiempo_implementacion: 'Inmediato',
    });
  }

  return recomendaciones;
}

/**
 * FUNCIÓN PRINCIPAL: Genera reporte completo de inteligencia competitiva
 */
export function analizarCompetenciaCompleta(
  linea: string,
  serviciosActivos: number = 6,
  busesUcot: Array<{ lat: number; lng: number; codigoBus: string }> = [],
  todosLosBuses: Array<{
    lat: number;
    lng: number;
    linea: string;
    empresa: string;
    velocidad: number;
  }> = [],
  tiempoPromedioPases: number = 15,
): ReporteInteligenciaCompetitiva {
  const ahora = new Date();

  // 1. Analizar frecuencia
  const frecuencia = analizarFrecuencia(linea, serviciosActivos, tiempoPromedioPases);

  // 2. Detectar competidores
  const competencia = detectarCompetidores(busesUcot, todosLosBuses, linea);
  const invasores = competencia.filter((c) => c.amenaza === 'CRITICA');
  const competidoresCercanos = competencia.filter((c) => c.amenaza === 'ALTA');

  // 3. Generar alertas
  const alertas = generarAlertas(linea, frecuencia, competencia);

  // 4. Generar recomendaciones
  const recomendaciones = generarRecomendaciones(linea, frecuencia, competencia, serviciosActivos);

  // 5. Calcular estado general
  let estado: 'CRITICO' | 'ALERTA' | 'NORMAL' | 'OPTIMO' = 'NORMAL';
  if (invasores.length > 0 || frecuencia.cumplimiento < 60) {
    estado = 'CRITICO';
  } else if (competidoresCercanos.length > 2 || frecuencia.cumplimiento < 80) {
    estado = 'ALERTA';
  } else if (competencia.length === 0 && frecuencia.cumplimiento > 95) {
    estado = 'OPTIMO';
  }

  // 6. Calcular amenaza nivel
  const flotaEnDisputa = (competencia.length / (serviciosActivos || 1)) * 100;
  let amenaza_nivel: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' = 'BAJA';
  if (flotaEnDisputa > 70) amenaza_nivel = 'CRITICA';
  else if (flotaEnDisputa > 40) amenaza_nivel = 'ALTA';
  else if (flotaEnDisputa > 20) amenaza_nivel = 'MEDIA';

  return {
    linea,
    timestamp: ahora.toISOString(),

    resumen: {
      estado,
      amenaza_nivel,
      flota_en_disputa: Math.round(flotaEnDisputa),
      ingresos_en_riesgo: Math.round(flotaEnDisputa * 1500), // $1500 per bus
    },

    analisis: {
      frecuencia,
      competencia_directa: competidoresCercanos,
      invasores,
      servicios_afectados: Math.min(serviciosActivos, competencia.length),
    },

    alertas,

    recomendaciones,

    metricas: {
      puntualidad_promedio: frecuencia.cumplimiento,
      ocupacion_promedio: null,       // pendiente de fuente real (boletaje/STM Card)
      velocidad_promedio: null,       // pendiente de cálculo desde GPS
      tiempo_respuesta_datos: null,   // medir contra endpoint real si se necesita
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRACIÓN CON BRIDGE SERVER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Obtiene análisis completo desde el Bridge Server
 */
function resolverBridgeUrlDefault(): string {
  const env = (typeof import.meta !== 'undefined' ? (import.meta as { env?: { PROD?: boolean; VITE_BRIDGE_URL?: string } }).env : undefined) || {};
  if (env.VITE_BRIDGE_URL) return env.VITE_BRIDGE_URL;
  if (env.PROD) return '';
  return 'http://localhost:3099';
}

export async function obtenerAnalisisDelBridge(
  linea: string,
  bridgeUrl: string = resolverBridgeUrlDefault(),
): Promise<ReporteInteligenciaCompetitiva | null> {
  try {
    const response = await fetch(`${bridgeUrl}/api/analysis/${linea}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn(`Bridge error para línea ${linea}:`, response.statusText);
      return null;
    }

    const data = await response.json();

    // Convertir datos del bridge al formato ReporteInteligenciaCompetitiva
    return {
      linea,
      timestamp: data.timestamp || new Date().toISOString(),

      resumen: {
        estado: data.resumen.nivelAlerta === 'ALTA' ? 'CRITICO' : 'NORMAL',
        amenaza_nivel: data.resumen.nivelAlerta as any,
        flota_en_disputa: data.resumen.pctFlotaEnDisputa,
        ingresos_en_riesgo: data.resumen.pctFlotaEnDisputa * 1500,
      },

      analisis: {
        frecuencia: {
          frecuenciaActualMinutos: 15,
          frecuenciaProgramadaMinutos: 15,
          desviacion: 0,
          cumplimiento: 95,
          intervaloPromedio: '15 minutos',
          proximoPaseEstimado: new Date(Date.now() + 15 * 60000).toLocaleTimeString(),
        },
        competencia_directa:
          data.alertas?.map((a: any) => ({
            codigoBus: a.maxAmenaza?.codigoBus || 'DESCONOCIDO',
            empresa: a.maxAmenaza?.empresa || 'Competidor',
            linea: a.maxAmenaza?.linea || 'Desconocida',
            distanciaKm: a.maxAmenaza?.distanciaKm || 0,
            tiempoAlcance: `${a.maxAmenaza?.distanciaKm || 0} km`,
            velocidad: 30,
            ocupacionEstimada: null,
            amenaza: 'MEDIA',
          })) || [],
        invasores: [],
        servicios_afectados: 0,
      },

      alertas: [],
      recomendaciones: [],

      metricas: {
        puntualidad_promedio: 92,
        ocupacion_promedio: 72,
        velocidad_promedio: 32,
        tiempo_respuesta_datos: 150,
      },
    };
  } catch (error) {
    console.error(`Error obteniendo análisis del Bridge para línea ${linea}:`, error);
    return null;
  }
}

export default {
  analizarFrecuencia,
  detectarCompetidores,
  generarAlertas,
  generarRecomendaciones,
  analizarCompetenciaCompleta,
  obtenerAnalisisDelBridge,
};
