"use strict";
/**
 * MasterOrchestrator.ts
 * Orquestador maestro que gestiona ecosistemas de agentes para todas las líneas
 * - Inicializa agentes por línea
 * - Recibe eventos de campo
 * - Genera alertas centralizadas
 * - Mantiene estado de líneas y competencia
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AgentFactory_1 = __importDefault(require("../agents/AgentFactory"));
const AlertGenerator_1 = __importDefault(require("./AlertGenerator"));
const logger_1 = __importDefault(require("../config/logger"));
class MasterOrchestrator {
    constructor(lineasConfig) {
        this.lineasConfig = lineasConfig;
        this.activeEcosystems = new Map();
        this.alertHistory = [];
        this.maxAlertHistory = 1000;
    }
    /**
     * Inicializa todos los ecosistemas de agentes basados en config
     */
    async initialize() {
        logger_1.default.info('[MasterOrchestrator] Inicializando ecosistemas...');
        for (const lineaConfig of this.lineasConfig.lineas) {
            try {
                const ecosystem = await AgentFactory_1.default.createLineEcosystem(lineaConfig);
                this.activeEcosystems.set(lineaConfig.id, ecosystem);
                logger_1.default.info(`✅ Línea ${lineaConfig.id}: ${ecosystem.totalAgents} agentes creados`);
            }
            catch (error) {
                logger_1.default.error(`❌ Error inicializando línea ${lineaConfig.id}:`, error);
            }
        }
        logger_1.default.info(`[MasterOrchestrator] Inicialización completada. ${this.activeEcosystems.size} líneas activas.`);
    }
    /**
     * Retorna estado de un ecosistema de línea
     */
    getLineEcosystem(lineId) {
        return this.activeEcosystems.get(lineId);
    }
    /**
     * Retorna estado de todas las líneas
     */
    getAllEcosystems() {
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
    async requestAlert(lineId, alertData) {
        const ecosystem = this.activeEcosystems.get(lineId);
        if (!ecosystem) {
            return { error: `Línea ${lineId} no encontrada` };
        }
        // Generar alerta usando AlertGenerator
        const alert = AlertGenerator_1.default.generate(ecosystem, alertData);
        // Guardar en historial
        this._addToHistory(alert);
        return alert;
    }
    /**
     * Genera alerta de análisis de línea propia
     */
    async alertFromOwnAnalysis(lineId, analysisData) {
        const ecosystem = this.activeEcosystems.get(lineId);
        if (!ecosystem)
            return { error: 'Línea no encontrada' };
        const analyzer = ecosystem.ownAgents.find((a) => a.destinationId === analysisData.destinationId);
        if (!analyzer)
            return { error: 'Destino/sentido no encontrado' };
        const alert = AlertGenerator_1.default.generateFromAnalysis(ecosystem, analyzer, analysisData);
        this._addToHistory(alert);
        return alert;
    }
    /**
     * Genera alerta de detección de competencia
     */
    async alertFromCompetitor(lineId, competitorData) {
        const ecosystem = this.activeEcosystems.get(lineId);
        if (!ecosystem)
            return { error: 'Línea no encontrada' };
        const monitor = ecosystem.competitorAgents.find((a) => a.competitorId === competitorData.competitorId);
        if (!monitor)
            return { error: 'Competidor no monitorado' };
        const alert = AlertGenerator_1.default.generateFromCompetitor(ecosystem, monitor, competitorData);
        this._addToHistory(alert);
        return alert;
    }
    /**
     * Retorna historial de alertas con filtros opcionales
     */
    getAlertHistory(filters = {}) {
        let history = this.alertHistory;
        if (filters.lineId) {
            history = history.filter((a) => a.linea === filters.lineId);
        }
        if (filters.tipo) {
            history = history.filter((a) => a.tipo === filters.tipo);
        }
        if (filters.sentido) {
            history = history.filter((a) => a.sentido === filters.sentido);
        }
        if (filters.horaInicio) {
            const inicio = new Date(filters.horaInicio).getTime();
            history = history.filter((a) => new Date(a.timestamp).getTime() >= inicio);
        }
        return history;
    }
    /**
     * Agrega alerta al historial (con límite)
     */
    _addToHistory(alert) {
        this.alertHistory.push(alert);
        if (this.alertHistory.length > this.maxAlertHistory) {
            this.alertHistory.shift();
        }
    }
    /**
     * Estadísticas de alertas por línea
     */
    getAlertStatistics() {
        const stats = {};
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
    clearAlertHistory() {
        this.alertHistory = [];
    }
}
exports.default = MasterOrchestrator;
