"use strict";
/**
 * AlertGenerator.ts
 * Genera alertas estandarizadas con formato: recorrido, sentido, tiempo, acciones
 */
Object.defineProperty(exports, "__esModule", { value: true });
class AlertGenerator {
    /**
     * Genera alerta genérica
     */
    static generate(ecosystem, alertData) {
        const timestamp = new Date().toISOString();
        const alertId = `ALERTA_${ecosystem.lineId}_${timestamp.replace(/[^0-9]/g, '')}`;
        return {
            alerta_id: alertId,
            linea: ecosystem.lineId,
            linea_nombre: ecosystem.lineNombre,
            tipo: alertData.tipo || 'ALERTA_GENERAL',
            recorrido: alertData.recorrido || 'No especificado',
            sentido: alertData.sentido || 'desconocido',
            tiempo_minutos: alertData.tiempo_minutos || null,
            timestamp: timestamp,
            mensaje: alertData.mensaje || 'Alerta generada',
            acciones_recomendadas: alertData.acciones || [],
            severidad: this._calculateSeverity(alertData),
            fuente: alertData.fuente || 'sistema'
        };
    }
    /**
     * Genera alerta desde análisis de línea propia
     */
    static generateFromAnalysis(ecosystem, analyzer, analysisData) {
        const tiempoDesv = analysisData.tiempo_desviacion || 0;
        const frecuenciaReal = analysisData.frecuencia_real || null;
        const frecuenciaTeórica = analysisData.frecuencia_teorica || null;
        let tipo = 'ALERTA_DESEMPEÑO';
        let acciones = [];
        // Determinar tipo de alerta según desviación
        if (Math.abs(tiempoDesv) > 10) {
            tipo = 'ALERTA_RETRASO_CRÍTICO';
            acciones = [
                'Acelerar próximas unidades',
                'Revisar causa de retraso en paradas',
                'Comunicar a central de información'
            ];
        }
        else if (Math.abs(tiempoDesv) > 5) {
            tipo = 'ALERTA_RETRASO';
            acciones = [
                'Monitorear tendencia',
                'Ajustar velocidad comercial si es posible'
            ];
        }
        // Alerta de frecuencia
        if (frecuenciaReal && frecuenciaTeórica) {
            const diferencia = frecuenciaReal - frecuenciaTeórica;
            if (diferencia > 2) {
                tipo = 'ALERTA_FRECUENCIA_BAJA';
                acciones.push('Inyectar unidad adicional en terminal');
            }
        }
        return {
            alerta_id: `ALERTA_ANAL_${ecosystem.lineId}_${Date.now()}`,
            linea: ecosystem.lineId,
            linea_nombre: ecosystem.lineNombre,
            tipo: tipo,
            recorrido: analyzer.destinationNombre,
            sentido: analyzer.sentido,
            tiempo_minutos: tiempoDesv,
            timestamp: new Date().toISOString(),
            mensaje: `Análisis de línea ${ecosystem.lineId} - ${analyzer.destinationNombre}: desviación de ${tiempoDesv} minutos`,
            metricas: {
                tiempo_promedio_recorrido: analysisData.tiempo_promedio || null,
                desviacion_observada: tiempoDesv,
                frecuencia_teorica: frecuenciaTeórica,
                frecuencia_real: frecuenciaReal,
                tasa_puntualidad: analysisData.tasa_puntualidad || null
            },
            acciones_recomendadas: acciones,
            severidad: this._calculateSeverityFromMetrics(analysisData),
            fuente: 'own_analyzer'
        };
    }
    /**
     * Genera alerta desde monitoreo de competencia
     */
    static generateFromCompetitor(ecosystem, monitor, competitorData) {
        const tipo = this._classifyCompetitorAlert(competitorData);
        const acciones = this._generateCompetitorActions(monitor, competitorData);
        let tiempo = null;
        if (competitorData.tiempo_ventaja) {
            tiempo = competitorData.tiempo_ventaja;
        }
        return {
            alerta_id: `ALERTA_RIVAL_${ecosystem.lineId}_${Date.now()}`,
            linea: ecosystem.lineId,
            linea_nombre: ecosystem.lineNombre,
            tipo: tipo,
            recorrido: competitorData.recorrido || monitor.corredoresCompartidos[0] || 'Corredor compartido',
            sentido: competitorData.sentido || 'ambos',
            tiempo_minutos: tiempo,
            timestamp: new Date().toISOString(),
            mensaje: `Detección de ${monitor.competitorNombre} en corredor ${competitorData.recorrido || 'compartido'}: ${this._getCompetitorMessage(competitorData)}`,
            competidor: {
                id: monitor.competitorId,
                nombre: monitor.competitorNombre,
                empresa: monitor.competitorEmpresa,
                codigo_stm: monitor.codigoStm
            },
            analisis: {
                tipo_evento: competitorData.tipo_evento || 'detección',
                distancia_metros: competitorData.distancia_metros || null,
                tiempo_ventaja_minutos: competitorData.tiempo_ventaja || null,
                frecuencia_rival: competitorData.frecuencia_rival || null,
                unidades_detectadas: competitorData.unidades_detectadas || null
            },
            acciones_recomendadas: acciones,
            severidad: this._calculateCompetitorSeverity(competitorData),
            fuente: 'competitor_monitor'
        };
    }
    /**
     * Clasifica tipo de alerta basado en evento de competidor
     */
    static _classifyCompetitorAlert(competitorData) {
        const evento = competitorData.tipo_evento?.toLowerCase() || '';
        if (evento.includes('adelantado') || evento.includes('adelanta')) {
            return 'ALERTA_RIVAL_ADELANTADO';
        }
        if (evento.includes('frecuencia') || evento.includes('aumento')) {
            return 'ALERTA_RIVAL_FRECUENCIA_AUMENTADA';
        }
        if (evento.includes('roto') || evento.includes('parado')) {
            return 'ALERTA_OPORTUNIDAD_PASAJERO';
        }
        if (evento.includes('ruta')) {
            return 'ALERTA_RIVAL_CAMBIO_RUTA';
        }
        return 'ADVERTENCIA_COMPETENCIA';
    }
    /**
     * Genera acciones recomendadas basadas en tipo de evento
     */
    static _generateCompetitorActions(monitor, competitorData) {
        const acciones = [];
        const evento = competitorData.tipo_evento?.toLowerCase() || '';
        if (evento.includes('adelantado') && (competitorData.tiempo_ventaja || 0) > 5) {
            acciones.push('Inyectar servicio directo en próxima terminal');
            acciones.push('Aumentar velocidad comercial en corredor');
            acciones.push('Notificar a planchistas de oportunidad de pasajeros');
        }
        if (evento.includes('frecuencia') || (competitorData.unidades_detectadas || 0) > 2) {
            acciones.push('Aumentar frecuencia de despacho desde terminal');
            acciones.push('Revisar capacidad disponible de coches');
            acciones.push('Considerar servicio especial semi-directo');
        }
        if (evento.includes('roto') || evento.includes('parado')) {
            acciones.push('OPORTUNIDAD: Captura alta de pasajeros esperados');
            acciones.push('Informar a conductores de próximas unidades');
            acciones.push('Priorizar salida de servicios');
        }
        if (evento.includes('ruta') || evento.includes('cambio')) {
            acciones.push('Revisar motivo de cambio de ruta del rival');
            acciones.push('Evaluar impacto en flujos de pasajeros');
            acciones.push('Mantener monitoreo cercano');
        }
        if (acciones.length === 0) {
            acciones.push('Mantener monitoreo de comportamiento del rival');
        }
        return acciones;
    }
    /**
     * Mensaje descriptivo del evento de competidor
     */
    static _getCompetitorMessage(competitorData) {
        const evento = competitorData.tipo_evento?.toLowerCase() || 'detectado';
        if (evento.includes('adelantado')) {
            return `${competitorData.tiempo_ventaja || '?'} minutos adelantado`;
        }
        if (evento.includes('frecuencia')) {
            return `Frecuencia aumentada (${competitorData.unidades_detectadas || '2'} unidades agrupadas)`;
        }
        if (evento.includes('roto')) {
            return `Unidad fuera de servicio → OPORTUNIDAD`;
        }
        if (evento.includes('ruta')) {
            return `Cambio de ruta detectado`;
        }
        return evento;
    }
    /**
     * Calcula severidad según datos
     */
    static _calculateSeverity(alertData) {
        if (!alertData.tiempo_minutos)
            return 'MEDIA';
        const tiempo = Math.abs(alertData.tiempo_minutos);
        if (tiempo > 15)
            return 'CRÍTICA';
        if (tiempo > 8)
            return 'ALTA';
        if (tiempo > 3)
            return 'MEDIA';
        return 'BAJA';
    }
    /**
     * Calcula severidad desde métricas de análisis
     */
    static _calculateSeverityFromMetrics(analysisData) {
        const desv = Math.abs(analysisData.tiempo_desviacion || 0);
        const tasaPuntualidad = analysisData.tasa_puntualidad || 100;
        if (desv > 15 || tasaPuntualidad < 50)
            return 'CRÍTICA';
        if (desv > 8 || tasaPuntualidad < 70)
            return 'ALTA';
        if (desv > 3 || tasaPuntualidad < 85)
            return 'MEDIA';
        return 'BAJA';
    }
    /**
     * Calcula severidad de alerta de competencia
     */
    static _calculateCompetitorSeverity(competitorData) {
        const tiempo = competitorData.tiempo_ventaja || 0;
        const unidades = competitorData.unidades_detectadas || 0;
        const evento = competitorData.tipo_evento?.toLowerCase() || '';
        if (evento.includes('roto'))
            return 'CRÍTICA'; // Oportunidad crítica
        if (tiempo > 10 || unidades > 3)
            return 'ALTA';
        if (tiempo > 5 || unidades > 1)
            return 'MEDIA';
        return 'BAJA';
    }
}
exports.default = AlertGenerator;
