"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardService = void 0;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const competitionService_1 = require("./competitionService");
const analyticsService_1 = require("./analyticsService");
// Servicio de Dashboard Ejecutivo - Semana 8-9
class DashboardService {
    /**
     * Genera dashboard ejecutivo completo
     */
    async generarDashboardEjecutivo(operador) {
        try {
            const fecha = new Date();
            // Obtener todos los datos necesarios en paralelo
            const [lineas, metricas, competencia, cartonesMarginales, lineasEnRiesgo, pronósticos] = await Promise.all([
                this.obtenerEstadoLineas(operador),
                this.calcularMetricas(operador),
                this.obtenerResumenCompetitivo(operador),
                analyticsService_1.analyticsService.detectarCartonesMarginales(operador),
                analyticsService_1.analyticsService.identificarLineasEnRiesgo(operador),
                this.calcularProyecciones(operador)
            ]);
            // Calcular salud operacional
            const salud = this.calcularSaludOperacional(lineas, cartonesMarginales.length);
            // Generar recomendaciones
            const recomendaciones = this.generarRecomendaciones(lineas, competencia, lineasEnRiesgo, pronósticos);
            // Filtrar alertas críticas
            const alertas_criticas = lineas
                .flatMap(l => l.alertas)
                .filter(a => a.severidad === 'critica')
                .slice(0, 5);
            // Generar resumen texto
            const resumen_texto = this.generarResumenEjecutivo(metricas, salud, competencia, recomendaciones);
            return {
                id: `dashboard-${operador}-${fecha.getTime()}`,
                operador,
                fecha,
                salud_operacional: salud,
                metricas,
                lineas,
                resumen_competitivo: competencia,
                proyecciones: pronósticos,
                recomendaciones,
                alertas_criticas,
                resumen_texto
            };
        }
        catch (error) {
            logger_1.logger.error(`Error generando dashboard: ${error}`);
            throw error;
        }
    }
    /**
     * Obtiene estado actual de todas las líneas
     */
    async obtenerEstadoLineas(operador) {
        try {
            const lineasSnapshot = await database_1.db
                .collection('lineas')
                .where('operador', '==', operador)
                .get();
            const estados = [];
            for (const lineaDoc of lineasSnapshot.docs) {
                const lineaData = lineaDoc.data();
                // Obtener análisis de competencia
                const analisisCompetencia = await competitionService_1.competitionService.analizarCompetitividad(lineaDoc.id);
                // Obtener viabilidad de cartones
                const cartonesSnapshot = await database_1.db
                    .collection('cartones')
                    .where('lineaId', '==', lineaDoc.id)
                    .get();
                let cartonesMarginal = 0;
                for (const cartoonDoc of cartonesSnapshot.docs) {
                    const viabilidad = await analyticsService_1.analyticsService.validarCartoon(cartoonDoc.id);
                    if (viabilidad.nivelViabilidad === 'marginal' || viabilidad.nivelViabilidad === 'no-viable') {
                        cartonesMarginal++;
                    }
                }
                // Generar estado de línea
                const estado = {
                    lineaId: lineaDoc.id,
                    numeroLinea: lineaData.numero,
                    estado: 'operativa',
                    ingresos: 19600, // Simplificado - en producción usar datos reales
                    pasajeros: 350,
                    cumplimiento: 95,
                    ocupacion: 75,
                    competencia: [],
                    alertas: this.generarAlertasLinea(lineaData.numero, analisisCompetencia, cartonesMarginal),
                    recomendacion: this.generarRecomendacionLinea(analisisCompetencia, cartonesMarginal)
                };
                estados.push(estado);
            }
            return estados;
        }
        catch (error) {
            logger_1.logger.error(`Error obteniendo estado de líneas: ${error}`);
            throw error;
        }
    }
    /**
     * Calcula métricas principales
     */
    async calcularMetricas(operador) {
        try {
            const lineasSnapshot = await database_1.db
                .collection('lineas')
                .where('operador', '==', operador)
                .get();
            let ingresosTotales = 0;
            let pasajerosTotales = 0;
            const lineasActivas = lineasSnapshot.size;
            // Simplificado - en producción usar datos reales de boletaje
            for (const lineaDoc of lineasSnapshot.docs) {
                ingresosTotales += 431200; // 19600 * 22 días hábiles
                pasajerosTotales += 7700; // 350 * 22 días hábiles
            }
            return {
                periodo: {
                    inicio: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                    fin: new Date()
                },
                operador,
                ingresosTotales: {
                    nombre: 'Ingresos Totales',
                    valor: ingresosTotales,
                    unidad: 'pesos',
                    cambioVsAnterior: 5.2,
                    tendencia: 'creciente',
                    objetivo: ingresosTotales * 1.1,
                    porcentajeAlcanzado: 95,
                    alerta: false,
                    color: 'green'
                },
                pasajerosTotales: {
                    nombre: 'Pasajeros Totales',
                    valor: pasajerosTotales,
                    unidad: 'pasajeros',
                    cambioVsAnterior: 3.8,
                    tendencia: 'creciente',
                    objetivo: pasajerosTotales * 1.1,
                    porcentajeAlcanzado: 92,
                    alerta: false,
                    color: 'blue'
                },
                lineasActivas: {
                    nombre: 'Líneas Activas',
                    valor: lineasActivas,
                    unidad: 'líneas',
                    cambioVsAnterior: 0,
                    tendencia: 'estable',
                    objetivo: lineasActivas,
                    porcentajeAlcanzado: 100,
                    alerta: false,
                    color: 'blue'
                },
                ocupacionPromedio: {
                    nombre: 'Ocupación Promedio',
                    valor: 78,
                    unidad: '%',
                    cambioVsAnterior: 2.1,
                    tendencia: 'creciente',
                    objetivo: 85,
                    porcentajeAlcanzado: 92,
                    alerta: false,
                    color: 'green'
                },
                cumplimientoHorario: {
                    nombre: 'Cumplimiento Horario',
                    valor: 94,
                    unidad: '%',
                    cambioVsAnterior: -0.5,
                    tendencia: 'estable',
                    objetivo: 96,
                    porcentajeAlcanzado: 98,
                    alerta: false,
                    color: 'blue'
                },
                lineasEnRiesgo: 2,
                cartonesMarginales: 3,
                conflictosCompetencia: 5
            };
        }
        catch (error) {
            logger_1.logger.error(`Error calculando métricas: ${error}`);
            throw error;
        }
    }
    /**
     * Obtiene resumen de competencia
     */
    async obtenerResumenCompetitivo(operador) {
        try {
            const lineasSnapshot = await database_1.db
                .collection('lineas')
                .where('operador', '==', operador)
                .get();
            let amenazas = 0;
            let oportunidades = 0;
            const lineasCompetidas = new Set();
            for (const lineaDoc of lineasSnapshot.docs) {
                const analisis = await competitionService_1.competitionService.analizarCompetitividad(lineaDoc.id);
                if (analisis.conflictosActivos.length > 0) {
                    amenazas += analisis.conflictosActivos.length;
                    lineasCompetidas.add(lineaDoc.id);
                }
            }
            oportunidades = 3; // Simplificado
            return {
                amenazasActivas: amenazas,
                oportunidadesIdentificadas: oportunidades,
                cambiosCompetenciaUltimaSemana: 2,
                competidorMasPeligroso: 'Cutcsa',
                lineasMasCompetidas: Array.from(lineasCompetidas),
                recomendacionesDefensivas: [
                    'Monitorea Línea 3 (adelanto de Cutcsa)',
                    'Considera aumentar frecuencia en horas pico',
                    'Responde rápido a cambios de competencia'
                ]
            };
        }
        catch (error) {
            logger_1.logger.error(`Error obteniendo resumen competitivo: ${error}`);
            throw error;
        }
    }
    /**
     * Calcula proyecciones de ingresos
     */
    async calcularProyecciones(operador) {
        return [
            {
                periodo: 'Este mes',
                ingresosProyectados: 9500000,
                ingresosActuales: 9100000,
                cambioEsperado: 4.4,
                confianza: 92,
                principales_drivers: ['Demanda creciente', 'Menor presión de competencia']
            },
            {
                periodo: 'Próximo mes',
                ingresosProyectados: 9800000,
                ingresosActuales: 9500000,
                cambioEsperado: 3.2,
                confianza: 78,
                principales_drivers: ['Adelanto de Línea 3', 'Estabilidad operacional']
            },
            {
                periodo: 'Próximos 3 meses',
                ingresosProyectados: 10500000,
                ingresosActuales: 9500000,
                cambioEsperado: 10.5,
                confianza: 65,
                principales_drivers: ['Crecimiento de demanda', 'Nuevos cartones']
            }
        ];
    }
    /**
     * Genera recomendaciones ejecutivas
     */
    generarRecomendaciones(lineas, competencia, lineasEnRiesgo, proyecciones) {
        const recomendaciones = [];
        // Recomendación 1: Responder a competencia
        if (competencia.amenazasActivas > 0) {
            recomendaciones.push({
                id: 'rec-competencia-1',
                titulo: 'Responder a movimientos de competencia',
                descripcion: `Se detectaron ${competencia.amenazasActivas} conflictos de horario. Líneas afectadas: ${competencia.lineasMasCompetidas.join(', ')}`,
                impacto: 150000,
                urgencia: 'alta',
                accion_sugerida: 'Ejecuta simulador de horarios para adelantar servicios. Implementa en 24 horas.',
                lineasAfectadas: competencia.lineasMasCompetidas,
                probabilidadExito: 78,
                tiempoImplementacion: '1 día'
            });
        }
        // Recomendación 2: Optimizar cartones marginales
        const cartonesMarginales = lineas.filter(l => l.estado === 'marginal' || l.estado === 'riesgo');
        if (cartonesMarginales.length > 0) {
            recomendaciones.push({
                id: 'rec-cartones-1',
                titulo: 'Optimizar cartones marginales',
                descripcion: `${cartonesMarginales.length} líneas están en zona marginal. Oportunidad: aumentar frecuencia en horas pico.`,
                impacto: 100000,
                urgencia: 'media',
                accion_sugerida: 'Identifica horas pico con dashboard. Aumenta buses en esos horarios.',
                lineasAfectadas: cartonesMarginales.map(l => l.numeroLinea),
                probabilidadExito: 72,
                tiempoImplementacion: '3 días'
            });
        }
        // Recomendación 3: Aprovechar oportunidades de crecimiento
        recomendaciones.push({
            id: 'rec-crecimiento-1',
            titulo: 'Aprovechar demanda creciente',
            descripcion: 'Proyecciones muestran crecimiento de 3-10% en próximos 3 meses.',
            impacto: 250000,
            urgencia: 'media',
            accion_sugerida: 'Planifica compra de buses adicionales. Timeline: orden en mes 1, entrega mes 3.',
            lineasAfectadas: [],
            probabilidadExito: 85,
            tiempoImplementacion: '3 meses'
        });
        return recomendaciones.slice(0, 5);
    }
    /**
     * Calcula salud operacional general
     */
    calcularSaludOperacional(lineas, cartonesNoViables) {
        const lineasOperativas = lineas.filter(l => l.estado === 'operativa').length;
        const lineasEnRiesgo = lineas.filter(l => l.estado === 'riesgo').length;
        const lineasCriticas = lineas.filter(l => l.estado === 'critica').length;
        const porcentajeOperativas = (lineasOperativas / lineas.length) * 100;
        const porcentajeEnRiesgo = (lineasEnRiesgo / lineas.length) * 100;
        const porcentajeNoViables = cartonesNoViables > 0 ? 15 : 0;
        const indiceGeneral = Math.round(porcentajeOperativas * 0.5 - porcentajeEnRiesgo * 0.3 - porcentajeNoViables * 0.2);
        let estado;
        if (indiceGeneral >= 80)
            estado = 'excelente';
        else if (indiceGeneral >= 60)
            estado = 'bueno';
        else if (indiceGeneral >= 40)
            estado = 'regular';
        else
            estado = 'critico';
        return {
            porcentajeLineasOperativas: Math.round(porcentajeOperativas),
            porcentajeLineasEnRiesgo: Math.round(porcentajeEnRiesgo),
            porcentajeCartonesNoViables: porcentajeNoViables,
            indiceGeneral,
            estado,
            recomendacion_urgente: lineasCriticas > 0
                ? `${lineasCriticas} línea(s) en estado crítico. Requiere acción inmediata.`
                : undefined
        };
    }
    /**
     * Genera alertas para una línea
     */
    generarAlertasLinea(numeroLinea, analisisCompetencia, cartonesMarginales) {
        const alertas = [];
        if (analisisCompetencia.pasajerosEnRiesgoTotal > 100) {
            alertas.push({
                tipo: 'competencia',
                severidad: 'alta',
                mensaje: `${analisisCompetencia.pasajerosEnRiesgoTotal} pasajeros en riesgo por conflictos de horario`,
                accion_recomendada: 'Usa simulador para adelantar horarios'
            });
        }
        if (cartonesMarginales > 0) {
            alertas.push({
                tipo: 'marginal',
                severidad: 'media',
                mensaje: `${cartonesMarginales} cartón(es) marginal(es)`,
                accion_recomendada: 'Optimiza frecuencia en horas pico'
            });
        }
        return alertas;
    }
    /**
     * Determina estado de línea
     */
    determinarEstadoLinea(pasajerosEnRiesgo, cartonesMarginales) {
        if (pasajerosEnRiesgo > 200 || cartonesMarginales > 2)
            return 'critica';
        if (pasajerosEnRiesgo > 100 || cartonesMarginales > 0)
            return 'riesgo';
        if (cartonesMarginales > 0)
            return 'marginal';
        return 'operativa';
    }
    /**
     * Genera recomendación para línea
     */
    generarRecomendacionLinea(analisisCompetencia, cartonesMarginales) {
        if (cartonesMarginales > 0) {
            return 'Optimiza frecuencia. Identifica horas pico con herramienta de pronóstico.';
        }
        if (analisisCompetencia.pasajerosEnRiesgoTotal > 100) {
            return 'Compite con adelanto de horario. Usa simulador para medir impacto.';
        }
        return 'Línea operando normalmente. Monitorea competencia.';
    }
    /**
     * Genera resumen ejecutivo en texto
     */
    generarResumenEjecutivo(metricas, salud, competencia, recomendaciones) {
        return `
RESUMEN EJECUTIVO

Salud General: ${salud.estado.toUpperCase()} (Score: ${salud.indiceGeneral}/100)

Ingresos: $${(metricas.ingresosTotales.valor / 1000000).toFixed(1)}M (+${metricas.ingresosTotales.cambioVsAnterior}% vs mes anterior)
Pasajeros: ${(metricas.pasajerosTotales.valor / 1000).toFixed(0)}K (+${metricas.pasajerosTotales.cambioVsAnterior}% vs mes anterior)
Ocupación: ${metricas.ocupacionPromedio.valor}% (Objetivo: ${metricas.ocupacionPromedio.objetivo}%)

Líneas Operativas: ${salud.porcentajeLineasOperativas}%
Líneas en Riesgo: ${salud.porcentajeLineasEnRiesgo}%
Cartones No Viables: ${salud.porcentajeCartonesNoViables}%

Amenazas Competitivas: ${competencia.amenazasActivas} conflictos de horario
Competidor más peligroso: ${competencia.competidorMasPeligroso}

ACCIONES PRIORITARIAS:
${recomendaciones.slice(0, 3).map((r, i) => `${i + 1}. ${r.titulo} (Impacto: $${r.impacto / 1000}K/mes, Urgencia: ${r.urgencia})`).join('\n')}

${salud.recomendacion_urgente ? `⚠️ CRÍTICO: ${salud.recomendacion_urgente}` : ''}
`;
    }
}
exports.dashboardService = new DashboardService();
