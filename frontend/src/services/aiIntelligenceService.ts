/**
 * Servicio de Inteligencia Táctica UCOT - Agencia Multi-Agente
 * v6.0: Multi-Model Router — gemma3:4b (fast) + llama3.1:8b (heavy) + Claude (cloud)
 */
import { ScheduleService } from './scheduleService';
import { AIRouter } from './aiRouter';

export interface AgentStatus {
  lineId: string;
  lastAnalysis: string;
  threatLevel: 'CRITICAL' | 'WARN' | 'SAFE';
  lastRival?: string;
  lastDistance?: number;
  lastSpeed?: number;
  lastCorridor?: string;
  lastDestino?: string;
  lastRivalDirection?: string;
  lastVariantCode?: string;
  lastScheduleAdvantage?: number;
  updatedAt: number;
  stats: {
    totalScans: number;
    criticalIncidents: number;
    warnIncidents: number;
    safeScans: number;
    scheduleDisadvantages: number;
    lastDetectedRivals: Set<string>;
  };
}

export class AIIntelligenceService {
  private static agentRegistry: Record<string, AgentStatus> = {};
  private static isThinking = false;

  private static getAgent(lineId: string): AgentStatus {
    if (!this.agentRegistry[lineId]) {
      this.agentRegistry[lineId] = {
        lineId,
        lastAnalysis: '🛰️ AGENTE ASIGNADO. ESCANEANDO CORREDOR...',
        threatLevel: 'SAFE',
        updatedAt: Date.now(),
        stats: {
          totalScans: 0,
          criticalIncidents: 0,
          warnIncidents: 0,
          safeScans: 0,
          scheduleDisadvantages: 0,
          lastDetectedRivals: new Set(),
        },
      };
    }
    return this.agentRegistry[lineId];
  }

  static getAgentInsight(lineId: string): string {
    return this.getAgent(lineId).lastAnalysis;
  }

  static getAllAgentsStats(): Record<string, AgentStatus> {
    return this.agentRegistry;
  }

  static async processCommand(data: {
    lineId: string;
    threat: Record<string, unknown> | null;
    ucotFound: boolean;
    corridor?: string;
    destino?: string;
    variantCode?: string;
    rivals?: string[];
  }): Promise<void> {
    const agent = this.getAgent(data.lineId);

    // Actualizar contexto del corredor + variante
    agent.lastCorridor = data.corridor || agent.lastCorridor;
    agent.lastDestino = data.destino || agent.lastDestino;
    agent.lastVariantCode = data.variantCode || agent.lastVariantCode;

    // Calcular ventaja horaria
    if (agent.lastVariantCode && data.rivals?.length) {
      const adv = ScheduleService.getScheduleAdvantage(agent.lastVariantCode, data.rivals[0]);
      agent.lastScheduleAdvantage = adv.ventajaMin;
    }

    if (!data.ucotFound) {
      agent.lastAnalysis = `📡 [AGENTE ${data.lineId}]: BUSCANDO SEÑAL GPS DE LA UNIDAD...`;
      agent.threatLevel = 'SAFE';
      return;
    }

    const threat = data.threat || {};
    const newThreatLevel = (threat.threatLevel as string) || 'SAFE';
    const currentDist = Number(threat.distance || 0);

    // Detectar cambio significativo de situación
    const criticalChange =
      newThreatLevel !== agent.threatLevel ||
      (newThreatLevel === 'CRITICAL' && Math.abs(currentDist - (agent.lastDistance || 0)) > 150);

    agent.threatLevel = newThreatLevel as 'CRITICAL' | 'WARN' | 'SAFE';
    agent.lastDistance = currentDist;
    agent.lastRival = threat.competitorLine as string;
    agent.lastRivalDirection = threat.rivalDirection as string;

    // Update statistics
    agent.stats.totalScans++;
    if (newThreatLevel === 'CRITICAL') agent.stats.criticalIncidents++;
    else if (newThreatLevel === 'WARN') agent.stats.warnIncidents++;
    else agent.stats.safeScans++;

    if (agent.lastScheduleAdvantage !== undefined && agent.lastScheduleAdvantage < 0) {
      agent.stats.scheduleDisadvantages++;
    }

    if (threat.competitorLine) {
      agent.stats.lastDetectedRivals.add(threat.competitorLine as string);
    }

    if (criticalChange && !this.isThinking) {
      this.requestCommanderAI(agent, threat).catch(() => {});
    }

    // Respuesta rápida con contexto de corredor
    if (!this.isThinking || !agent.lastAnalysis.startsWith('🧠')) {
      agent.lastAnalysis = this.getFastTacticalResponse(data.lineId, threat, data.corridor);
    }
  }

  private static async requestCommanderAI(
    agent: AgentStatus,
    threat: Record<string, unknown>,
  ): Promise<void> {
    if (this.isThinking) return;
    this.isThinking = true;

    try {
      const time = new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
      const speedContext = agent.lastSpeed ? `Velocidad actual: ${agent.lastSpeed}km/h.` : '';
      const corridorContext = agent.lastCorridor
        ? `Corredor activo: ${agent.lastCorridor}. Destino: ${agent.lastDestino || 'N/A'}.`
        : '';
      const directionContext = agent.lastRivalDirection
        ? `Posición rival: ${agent.lastRivalDirection === 'AHEAD' ? 'POR DELANTE' : agent.lastRivalDirection === 'BEHIND' ? 'POR DETRÁS' : 'LATERAL'}.`
        : '';

      // Contexto de horarios
      let scheduleContext = '';
      if (agent.lastVariantCode) {
        const nextDep = ScheduleService.getNextDeparture(agent.lastVariantCode);
        if (nextDep) {
          scheduleContext = `Próxima salida UCOT: ${nextDep.hora} desde ${nextDep.terminal} (en ${nextDep.enMinutos}min).`;
        }
        if (agent.lastScheduleAdvantage !== undefined && agent.lastScheduleAdvantage !== 0) {
          scheduleContext +=
            agent.lastScheduleAdvantage > 0
              ? ` UCOT sale ${agent.lastScheduleAdvantage}min ANTES que rival.`
              : ` Rival sale ${Math.abs(agent.lastScheduleAdvantage)}min ANTES que UCOT.`;
        }
      }

      const prompt = `
        CONTEXTO TÁCTICO UCOT (${time}):
        - Línea Operativa: ${agent.lineId}
        - ${corridorContext}
        - Objetivo Rival: ${threat.competitorLine || 'Desconocido'}
        - Distancia: ${threat.distance} metros (${threat.threatLevel})
        - ${directionContext}
        - Recomendación Sistema: ${threat.recommendation}
        ${speedContext}
        - ${scheduleContext}

        TAREA: Actúa como el Comandante de Flota UCOT. Da una orden táctica corta, agresiva y profesional (máx 30 palabras) usando jerga de transporte uruguayo (ej. "pisalo", "aguantá", "está barriendo").
        IMPORTANTE: 
        1. Considerá el destino ${agent.lastDestino || 'desconocido'}.
        2. Si el rival sale *antes* (ventaja horaria rival) o si está POR DELANTE, el agente DEBE avisar expresamente al inspector o jefe de tránsito (ej. "Aviso a Jefatura: Rival adelantado...").
        3. Aconseja al chofer frenar/aguantar si el rival barre por delante, o acelerar si está por detrás.
      `.trim();

      const result = await AIRouter.orchestrate(prompt);

      const agentName = result.agent || 'COMMANDER';
      const dirEmoji =
        agent.lastRivalDirection === 'AHEAD'
          ? '⬆️'
          : agent.lastRivalDirection === 'BEHIND'
            ? '⬇️'
            : '➡️';

      // Formato: 🧠 [AGENTE] MENSAJE
      agent.lastAnalysis = `🧠 ${dirEmoji} [${agentName}]: ${result.text.replace(/^"|"$/g, '')}`;
    } catch (err) {
      console.warn(`[AI-AGENCY] Fallo en Orquestador para Agente ${agent.lineId}:`, err);
      agent.lastAnalysis = this.getFastTacticalResponse(agent.lineId, threat, agent.lastCorridor);
    } finally {
      this.isThinking = false;
    }
  }

  private static getFastTacticalResponse(
    lineId: string,
    threat: Record<string, unknown>,
    corridor?: string,
  ): string {
    const corLabel = corridor || lineId;
    const agent = this.agentRegistry[lineId];

    // Contexto de horario para respuesta rápida
    let scheduleTag = '';
    if (agent?.lastScheduleAdvantage !== undefined && agent.lastScheduleAdvantage !== 0) {
      scheduleTag =
        agent.lastScheduleAdvantage > 0
          ? ` | ⏰ +${agent.lastScheduleAdvantage}min ventaja`
          : ` | ⚠ -${Math.abs(agent.lastScheduleAdvantage)}min desventaja`;
    }

    if (!threat || !threat.detected) {
      return `✅ [AGENTE ${corLabel}]: CORREDOR DESPEJADO${scheduleTag}. VÍA LIBRE.`;
    }

    const rivalDir = threat.rivalDirection as string;
    const dirLabel = rivalDir === 'AHEAD' ? '⬆️ DELANTE' : rivalDir === 'BEHIND' ? '⬇️ DETRÁS' : '';

    if (threat.threatLevel === 'CRITICAL') {
      const isAheadOrAdvantaged =
        rivalDir === 'AHEAD' ||
        (agent?.lastScheduleAdvantage !== undefined && agent.lastScheduleAdvantage < 0);

      if (isAheadOrAdvantaged) {
        return `🚨 [AVISO JEFATURA/INSPECTOR]: ¡Competencia ${threat.competitorLine} con ventaja o por delante a ${threat.distance}m! ORDEN: Retener marcha${scheduleTag}.`;
      }
      return `🚨 [${corLabel}]: ¡${threat.competitorLine} a ${threat.distance}m! PISALE${scheduleTag}.`;
    }

    return `⚠️ [${corLabel}]: RIVAL ${threat.competitorLine} ${dirLabel} a ${threat.distance}m${scheduleTag}. OJO RETROVISOR.`;
  }

  static getGlobalStatus(threats: Array<{ threat?: { threatLevel?: string } }>): string {
    const criticals = threats.filter((t) => t.threat?.threatLevel === 'CRITICAL').length;
    if (criticals > 0) return `🔴 AGENCIA UCOT: ${criticals} CORREDORES CON INTERFERENCIA CRÍTICA.`;
    return `🟢 AGENCIA UCOT: SISTEMA VARIANT+SCHEDULE v5.0 ACTIVO. ANÁLISIS HORARIO OPERATIVO.`;
  }
}
