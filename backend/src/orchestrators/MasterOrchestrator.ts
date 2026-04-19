/**
 * MasterOrchestrator.ts
 * Orquestador maestro que gestiona ecosistemas de agentes para todas las líneas
 * - Inicializa agentes por línea
 * - Recibe eventos de campo
 * - Genera alertas centralizadas
 * - Mantiene estado de líneas y competencia
 */

import AgentFactory from '../agents/AgentFactory';
import AlertGenerator from './AlertGenerator';
import logger from '../config/logger';

interface LineDestination {
  id: string;
  nombre: string;
  sentido: string;
  paradas_clave?: string[];
}

interface Competitor {
  id: string;
  nombre: string;
  empresa: string;
  corredores_compartidos?: string[];
  codigo_stm?: number;
  [key: string]: any;
}

interface LineConfig {
  id: number;
  nombre: string;
  empresa: string;
  destinos: LineDestination[];
  horarios_tipos: any;
  competidores: Competitor[];
  datos_publicos: any;
  orquestador_puerto: number;
  [key: string]: any;
}

interface LineasConfigFile {
  lineas: LineConfig[];
  [key: string]: any;
}

interface Ecosystem {
  lineId: number;
  lineNombre: string;
  status: string;
  totalAgents: number;
  orchestrator: { id: string };
  ownAgents: any[];
  competitorAgents: any[];
}

interface AlertData {
  [key: string]: any;
}

class MasterOrchestrator {
  private lineasConfig: LineasConfigFile;
  private activeEcosystems: Map<number, Ecosystem>;
  private alertHistory: any[];
  private maxAlertHistory: number;

  constructor(lineasConfig: LineasConfigFile) {
    this.lineasConfig = lineasConfig;
    this.activeEcosystems = new Map();
    this.alertHistory = [];
    this.maxAlertHistory = 1000;
  }

  /**
   * Inicializa todos los ecosistemas de agentes basados en config
   */
  async initialize(): Promise<void> {
    logger.info('[MasterOrchestrator] Inicializando ecosistemas...');

    for (const lineaConfig of this.lineasConfig.lineas) {
      try {
        const ecosystem = await AgentFactory.createLineEcosystem(lineaConfig);
        this.activeEcosystems.set(lineaConfig.id, ecosystem);

        logger.info(`✅ Línea ${lineaConfig.id}: ${ecosystem.totalAgents} agentes creados`);
      } catch (error) {
        logger.error(`❌ Error inicializando línea ${lineaConfig.id}:`, error);
      }
    }

    logger.info(`[MasterOrchestrator] Inicialización completada. ${this.activeEcosystems.size} líneas activas.`);
  }

  /**
   * Retorna estado de un ecosistema de línea
   */
  getLineEcosystem(lineId: number): Ecosystem | undefined {
    return this.activeEcosystems.get(lineId);
  }

  /**
   * Retorna estado de todas las líneas
   */
  getAllEcosystems(): any[] {
    const summary = [];
    for (const [lineId, ecosystem] of this.activeEcosystems) {
      summary.push({
        lineId,
        lineNombre: ecosystem.lineNombre,
        status: ecosystem.status,
        totalAgents: ecosystem.totalAgents,
        orchestrator: ecosystem.orchestrator.id,
        ownAgents: ecosystem.ownAgents.length,
        competitorAgents: ecosystem.competitorAgents.length
      });
    }
    return summary;
  }

  /**
   * Procesa una solicitud de alerta desde campo/sistema
   * Consulta a orquestador de línea correspondiente
   */
  async requestAlert(lineId: number, alertData: AlertData): Promise<any> {
    const ecosystem = this.activeEcosystems.get(lineId);
    if (!ecosystem) {
      return { error: `Línea ${lineId} no encontrada` };
    }

    // Generar alerta usando AlertGenerator
    const alert = AlertGenerator.generate(ecosystem, alertData);

    // Guardar en historial
    this._addToHistory(alert);

    return alert;
  }

  /**
   * Genera alerta de análisis de línea propia
   */
  async alertFromOwnAnalysis(lineId: number, analysisData: any): Promise<any> {
    const ecosystem = this.activeEcosystems.get(lineId);
    if (!ecosystem) return { error: 'Línea no encontrada' };

    const analyzer = ecosystem.ownAgents.find((a: any) => a.destinationId === analysisData.destinationId);
    if (!analyzer) return { error: 'Destino/sentido no encontrado' };

    const alert = AlertGenerator.generateFromAnalysis(
      ecosystem,
      analyzer,
      analysisData
    );

    this._addToHistory(alert);
    return alert;
  }

  /**
   * Genera alerta de detección de competencia
   */
  async alertFromCompetitor(lineId: number, competitorData: any): Promise<any> {
    const ecosystem = this.activeEcosystems.get(lineId);
    if (!ecosystem) return { error: 'Línea no encontrada' };

    const monitor = ecosystem.competitorAgents.find(
      (a: any) => a.competitorId === competitorData.competitorId
    );
    if (!monitor) return { error: 'Competidor no monitorado' };

    const alert = AlertGenerator.generateFromCompetitor(
      ecosystem,
      monitor,
      competitorData
    );

    this._addToHistory(alert);
    return alert;
  }

  /**
   * Retorna historial de alertas con filtros opcionales
   */
  getAlertHistory(filters: any = {}): any[] {
    let history = this.alertHistory;

    if (filters.lineId) {
      history = history.filter((a: any) => a.linea === filters.lineId);
    }
    if (filters.tipo) {
      history = history.filter((a: any) => a.tipo === filters.tipo);
    }
    if (filters.sentido) {
      history = history.filter((a: any) => a.sentido === filters.sentido);
    }
    if (filters.horaInicio) {
      const inicio = new Date(filters.horaInicio).getTime();
      history = history.filter((a: any) => new Date(a.timestamp).getTime() >= inicio);
    }

    return history;
  }

  /**
   * Agrega alerta al historial (con límite)
   */
  private _addToHistory(alert: any): void {
    this.alertHistory.push(alert);
    if (this.alertHistory.length > this.maxAlertHistory) {
      this.alertHistory.shift();
    }
  }

  /**
   * Estadísticas de alertas por línea
   */
  getAlertStatistics(): any {
    const stats: any = {};

    for (const alert of this.alertHistory) {
      if (!stats[alert.linea]) {
        stats[alert.linea] = { total: 0, por_tipo: {}, por_sentido: {} };
      }

      stats[alert.linea].total++;
      stats[alert.linea].por_tipo[alert.tipo] = (stats[alert.linea].por_tipo[alert.tipo] || 0) + 1;
      stats[alert.linea].por_sentido[alert.sentido] = (stats[alert.linea].por_sentido[alert.sentido] || 0) + 1;
    }

    return stats;
  }

  /**
   * Limpia historial de alertas (útil para pruebas)
   */
  clearAlertHistory(): void {
    this.alertHistory = [];
  }
}

export default MasterOrchestrator;
