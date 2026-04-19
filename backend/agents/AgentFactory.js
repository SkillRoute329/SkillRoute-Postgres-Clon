/**
 * AgentFactory.js
 * Crea automáticamente ecosistemas completos de agentes por línea
 * - Orquestador táctico
 * - Agentes de análisis propio
 * - Sub-agentes de competencia
 */

const COMPANY_CODES = {
  COME: 20,
  COETC: 30,
  CUTCSA: 50,
  UCOT: 70
};

class AgentFactory {
  /**
   * Crea un ecosistema completo de agentes para una línea
   * @param {Object} lineConfig - Configuración de la línea
   * @returns {Object} Ecosistema con orquestador, agentes propios y de competencia
   */
  static async createLineEcosystem(lineConfig) {
    const lineId = lineConfig.id;

    // 1. Crear orquestador principal
    const orchestrator = this.createOrchestrator(lineConfig);

    // 2. Crear agentes de análisis de línea propia
    const ownAgents = lineConfig.destinos.map(dest =>
      this.createOwnAnalyzer(lineId, dest, lineConfig.horarios_tipos)
    );

    // 3. Crear sub-agentes de competencia
    const competitorAgents = lineConfig.competidores.map(comp =>
      this.createCompetitorMonitor(lineId, comp, lineConfig.datos_publicos)
    );

    return {
      lineId: lineId,
      lineNombre: lineConfig.nombre,
      orchestrator,
      ownAgents,
      competitorAgents,
      createdAt: new Date().toISOString(),
      status: 'active',
      totalAgents: 1 + ownAgents.length + competitorAgents.length
    };
  }

  /**
   * Crea el orquestador táctico de la línea
   */
  static createOrchestrator(lineConfig) {
    return {
      id: `orquestador-${lineConfig.id}`,
      type: 'orchestrator',
      lineId: lineConfig.id,
      lineNombre: lineConfig.nombre,
      puertos: {
        principal: lineConfig.orquestador_puerto,
        api_rest: lineConfig.orquestador_puerto + 1000
      },
      responsibilities: [
        'Coordinar análisis de línea propia',
        'Monitorear datos de competencia en tiempo real',
        'Generar alertas tácticas (recorrido, sentido, tiempo)',
        'Tomar decisiones de despacho y frecuencia',
        'Consolidar información de todos los agentes'
      ],
      dataInputs: {
        propios: ['gps_real_tiempo', 'horarios_stm_oficial', 'desempeño_linea'],
        competencia: ['gps_competidores', 'horarios_rivales', 'frecuencia_rivales']
      },
      outputFormat: {
        alertType: 'ALERTA_RECORRIDO | ALERTA_FRECUENCIA | ALERTA_OPORTUNIDAD',
        incluye: ['recorrido', 'sentido', 'tiempo_minutos', 'acciones_recomendadas']
      }
    };
  }

  /**
   * Crea agentes especializados en análisis de la línea propia
   */
  static createOwnAnalyzer(lineId, destination, horariostipos) {
    return {
      id: `analizador-${lineId}-${destination.id}`,
      type: 'own_line_analyzer',
      lineId: lineId,
      destinationId: destination.id,
      destinationNombre: destination.nombre,
      sentido: destination.sentido,
      paradas: destination.paradas_clave || [],
      horariosTipos: horariostipos,
      responsibilities: [
        'Evaluar horarios teóricos vs realizados',
        'Analizar recorrido real (GPS actualizado)',
        'Detectar desviaciones de ruta',
        'Calcular frecuencia real (headway observado)',
        'Identificar cuellos de botella',
        'Medir OTP (On-Time Performance)'
      ],
      dataSources: {
        horarios: 'GTFS local + horarios_publicos_stm',
        gps: 'montevideo.gub.uy/buses/rest/stm-online (codigo_empresa=70)',
        historico: 'Firestore colección: linea_{lineId}_desempeño'
      },
      metricas: [
        'tiempo_promedio_recorrido',
        'desviacion_estandar',
        'tasa_puntualidad',
        'headway_promedio',
        'velocidad_comercial'
      ]
    };
  }

  /**
   * Crea sub-agentes para monitorear y comparar con competidores
   */
  static createCompetitorMonitor(lineId, competitor, datosPublicos) {
    const companyCode = COMPANY_CODES[competitor.empresa] || null;

    return {
      id: `monitor-${lineId}-vs-${competitor.empresa.toLowerCase()}`,
      type: 'competitor_monitor',
      lineId: lineId,
      competitorId: competitor.id,
      competitorNombre: competitor.nombre,
      competitorEmpresa: competitor.empresa,
      codigoStm: companyCode,
      corredoresCompartidos: competitor.corredores_compartidos || [],
      responsibilities: [
        'Monitorear posicionamiento GPS rival en tiempo real',
        'Detectar cambios significativos en frecuencia',
        'Comparar horarios teóricos vs realizados del rival',
        'Calcular distancia y tiempo entre coches propios y rivales',
        'Generar alertas de "oportunidad de pasajero"',
        'Detectar patrones de comportamiento competitivo'
      ],
      dataSources: {
        gps: `montevideo.gub.uy/buses/rest/stm-online (codigo_empresa=${companyCode})`,
        horarios: datosPublicos.horarios_endpoint,
        gtfs: datosPublicos.gtfs_feed
      },
      alertTriggersEjemplos: [
        'Rival adelantado por >5 minutos (oportunidad de captura)',
        'Rival con 2+ unidades concentradas (frecuencia aumentada)',
        'Rival sin movimiento >10 minutos (coche roto o parado)',
        'Rival en corredor no habitual (cambio de ruta táctico)'
      ],
      outputFormat: {
        alerta_id: 'ALERTA_RIVAL_YYYYMMDDThhmmss',
        incluye: [
          'linea_propia',
          'empresa_rival',
          'tipo_evento',
          'localizacion',
          'analisis',
          'sugerencia_reaccion',
          'timestamp'
        ]
      }
    };
  }

  /**
   * Retorna el código STM de una empresa
   */
  static getCompanyCode(empresa) {
    return COMPANY_CODES[empresa] || null;
  }

  /**
   * Retorna todos los códigos disponibles
   */
  static getAllCompanyCodes() {
    return COMPANY_CODES;
  }
}

module.exports = AgentFactory;
