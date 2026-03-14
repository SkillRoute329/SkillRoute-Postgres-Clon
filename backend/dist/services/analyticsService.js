"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsService = void 0;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
// Servicio de análisis de ingresos y viabilidad - Semana 5
class AnalyticsService {
    constructor() {
        // Costos estimados (pesos/km)
        this.COSTO_COMBUSTIBLE_POR_KM = 12;
        this.COSTO_CONDUCTOR_POR_HORA = 250;
        this.COSTO_MANTENIMIENTO_DIARIO = 800;
        this.COSTO_SEGURO_DIARIO = 500;
    }
    /**
     * Valida viabilidad de un cartón de servicio
     */
    async validarCartoon(cartoonId) {
        try {
            const cartoonDoc = await database_1.db.collection('cartones').doc(cartoonId).get();
            if (!cartoonDoc.exists) {
                throw new Error(`Cartón ${cartoonId} no encontrado`);
            }
            const cartoon = cartoonDoc.data();
            // Obtener datos de línea
            const lineaDoc = await database_1.db.collection('lineas').doc(cartoon.lineaId).get();
            const lineaData = lineaDoc.data();
            // Obtener historial de boletaje
            const registros = await this.obtenerHistoricoBoletaje(cartoon.lineaId, 30 // últimos 30 días
            );
            // Calcular métricas
            const pasajerosEstimados = this.estimarPasajeros(cartoon, registros);
            const ingresosEstimados = pasajerosEstimados * 56; // 56 pesos por boleto
            const costosEstimados = this.calcularCostosOperacionales(cartoon, lineaData);
            const margenEstimado = ingresosEstimados - costosEstimados;
            const porcentajeMargen = (margenEstimado / ingresosEstimados) * 100;
            // Determinar viabilidad
            const nivelViabilidad = this.determinarNivelViabilidad(margenEstimado);
            const puntajeViabilidad = this.calcularPuntajeViabilidad(margenEstimado, porcentajeMargen);
            // Detectar alertas
            const alertas = this.detectarAlertasCartoon(cartoon, pasajerosEstimados, margenEstimado, registros);
            // Generar recomendaciones
            const recomendaciones = this.generarRecomendacionesCartoon(cartoon, margenEstimado, alertas, registros);
            return {
                id: `viability-${cartoonId}`,
                cartoonId,
                lineaId: cartoon.lineaId,
                numeroLinea: cartoon.numeroLinea,
                horarioInicio: cartoon.horarioInicio,
                horarioFin: cartoon.horarioFin,
                viajesPorDia: cartoon.viajesPorDia,
                pasajerosEstimados,
                ingresosEstimados,
                ingresosEstimadosMes: ingresosEstimados * 22, // 22 días hábiles
                costosEstimados,
                costosEstimadosMes: costosEstimados * 22,
                margenEstimado,
                margenEstimadoMes: margenEstimado * 22,
                porcentajeMargen,
                esViable: margenEstimado > 0,
                puntajeViabilidad,
                nivelViabilidad,
                alertas,
                factoresRiesgo: this.analizarFactoresRiesgo(cartoon, registros),
                recomendaciones,
                calculadoEn: new Date()
            };
        }
        catch (error) {
            logger_1.logger.error(`Error validando cartón: ${error}`);
            throw error;
        }
    }
    /**
     * Detecta cartones marginales o no viables
     */
    async detectarCartonesMarginales(operador) {
        try {
            const cartonesSnapshot = await database_1.db
                .collection('cartones')
                .where('operador', '==', operador)
                .where('activo', '==', true)
                .get();
            const viabilidades = await Promise.all(cartonesSnapshot.docs.map(doc => this.validarCartoon(doc.id)));
            // Retornar solo los marginales o no viables
            return viabilidades.filter(v => v.nivelViabilidad === 'marginal' || v.nivelViabilidad === 'no-viable');
        }
        catch (error) {
            logger_1.logger.error(`Error detectando cartones marginales: ${error}`);
            throw error;
        }
    }
    /**
     * Obtiene datos históricos de una línea
     */
    async obtenerDatosLinea(lineaId, diasHistorico = 30) {
        try {
            const registros = await this.obtenerHistoricoBoletaje(lineaId, diasHistorico);
            const boletesTotalVendidos = registros.reduce((sum, r) => sum + r.boletosVendidos, 0);
            const ingresosTotal = registros.reduce((sum, r) => sum + r.ingresos, 0);
            const pasajerosTotalTransportados = registros.reduce((sum, r) => sum + r.pasajeros, 0);
            const boletosPorDia = boletesTotalVendidos / diasHistorico;
            const ingresosPorDia = ingresosTotal / diasHistorico;
            // Calcular desviación estándar
            const promedio = boletosPorDia;
            const desviaciones = registros.map(r => Math.pow(r.boletosVendidos - promedio, 2));
            const desviacionEstandar = Math.sqrt(desviaciones.reduce((a, b) => a + b) / registros.length);
            const coeficienteVariacion = desviacionEstandar / promedio;
            // Boletaje por hora
            const boletajePorHora = this.agruparBoletajePorHora(registros);
            // Calcular tendencia
            const primeraSemana = registros.slice(0, 7).reduce((sum, r) => sum + r.boletosVendidos, 0) / 7;
            const ultimaSemana = registros.slice(-7).reduce((sum, r) => sum + r.boletosVendidos, 0) / 7;
            const crecimientoMensual = ((ultimaSemana - primeraSemana) / primeraSemana) * 100;
            const lineaDoc = await database_1.db.collection('lineas').doc(lineaId).get();
            const lineaData = lineaDoc.data();
            return {
                lineaId,
                numeroLinea: lineaData.numero,
                operador: lineaData.operador,
                periodo: {
                    inicio: new Date(Date.now() - diasHistorico * 24 * 60 * 60 * 1000),
                    fin: new Date()
                },
                boletesTotalVendidos,
                ingresosTotal,
                pasajerosTotalTransportados,
                boletosPorDia,
                ingresosPorDia,
                pasajerosPorDia: pasajerosTotalTransportados / diasHistorico,
                desviacionEstandar,
                coeficienteVariacion,
                boletajePorHora,
                crecimientoMensual,
                tendencia: crecimientoMensual > 5 ? 'creciente' : crecimientoMensual < -5 ? 'decreciente' : 'estable'
            };
        }
        catch (error) {
            logger_1.logger.error(`Error obteniendo datos de línea: ${error}`);
            throw error;
        }
    }
    /**
     * Identifica líneas en riesgo (que están perdiendo pasajeros)
     */
    async identificarLineasEnRiesgo(operador) {
        try {
            const lineasSnapshot = await database_1.db
                .collection('lineas')
                .where('operador', '==', operador)
                .get();
            const lineasEnRiesgo = [];
            for (const lineaDoc of lineasSnapshot.docs) {
                const datosActuales = await this.obtenerDatosLinea(lineaDoc.id, 30);
                const datosAnterior = await this.obtenerDatosLinea(lineaDoc.id, 60); // 60 a 30 días atrás
                // Comparar con período anterior
                const periodoActual = 30;
                const periodoPasado = 30;
                const boletosActual = datosActuales.boletesTotalVendidos / periodoActual;
                const boletosPasado = datosAnterior.boletesTotalVendidos / periodoPasado;
                const caida = ((boletosPasado - boletosActual) / boletosPasado) * 100;
                if (caida > 10) {
                    // Más de 10% caída
                    lineasEnRiesgo.push({
                        lineaId: lineaDoc.id,
                        numeroLinea: datosActuales.numeroLinea,
                        caida,
                        causaProbable: 'Requiere análisis de competencia',
                        pasajerosEnRiesgo: Math.round(boletosActual * caida / 100),
                        ingresoEnRiesgo: Math.round(boletosActual * caida / 100 * 56 * 22),
                        recomendacionesUrgentes: [
                            'Revisar cambios de competencia',
                            'Analizar patrones de demanda',
                            'Considerar ajustes de horario'
                        ]
                    });
                }
            }
            return lineasEnRiesgo.sort((a, b) => b.caida - a.caida);
        }
        catch (error) {
            logger_1.logger.error(`Error identificando líneas en riesgo: ${error}`);
            throw error;
        }
    }
    // ============ FUNCIONES AUXILIARES ============
    estimarPasajeros(cartoon, registros) {
        if (registros.length === 0) {
            // Estimación por defecto si no hay historial
            return 350;
        }
        const promedioRegistros = registros.reduce((sum, r) => sum + r.boletosVendidos, 0) / registros.length;
        // Ajustar por número de viajes
        const viajePorDiaPromedio = 10;
        return Math.round((promedioRegistros * cartoon.viajesPorDia) / viajePorDiaPromedio);
    }
    calcularCostosOperacionales(cartoon, lineaData) {
        // Costos diarios
        const horasTrabajo = this.calcularHorasTrabajo(cartoon.horarioInicio, cartoon.horarioFin);
        const costoConductor = this.COSTO_CONDUCTOR_POR_HORA * horasTrabajo;
        const costoFijo = this.COSTO_MANTENIMIENTO_DIARIO + this.COSTO_SEGURO_DIARIO;
        // Costo de combustible (estimado por km)
        const kmDiarios = (lineaData.kmRecorrido || 50) * cartoon.viajesPorDia;
        const costoCombustible = kmDiarios * this.COSTO_COMBUSTIBLE_POR_KM;
        return costoConductor + costoFijo + costoCombustible;
    }
    calcularHorasTrabajo(inicio, fin) {
        const [hI, mI] = inicio.split(':').map(Number);
        const [hF, mF] = fin.split(':').map(Number);
        return (hF - hI) + (mF - mI) / 60;
    }
    determinarNivelViabilidad(margen) {
        if (margen > 5000)
            return 'muy-viable';
        if (margen > 2000)
            return 'viable';
        if (margen > 0)
            return 'marginal';
        return 'no-viable';
    }
    calcularPuntajeViabilidad(margen, porcentajeMargen) {
        let puntaje = 50;
        // Ajustar por margen
        if (margen > 5000)
            puntaje += 30;
        else if (margen > 2000)
            puntaje += 20;
        else if (margen > 0)
            puntaje += 5;
        else
            puntaje -= 30;
        // Ajustar por porcentaje
        if (porcentajeMargen > 30)
            puntaje += 15;
        else if (porcentajeMargen > 15)
            puntaje += 5;
        return Math.min(100, Math.max(0, puntaje));
    }
    detectarAlertasCartoon(cartoon, pasajeros, margen, registros) {
        const alertas = [];
        if (margen <= 0) {
            alertas.push({
                id: `alert-no-viable`,
                tipo: 'no-viable',
                titulo: 'Cartón NO VIABLE',
                mensaje: 'Este cartón genera pérdida financiera',
                severidad: 'critica',
                impacto: Math.abs(margen),
                recomendacion: 'Considera cancelar o fusionar este cartón'
            });
        }
        else if (margen < 2000) {
            alertas.push({
                id: `alert-marginal`,
                tipo: 'marginal',
                titulo: 'Cartón MARGINAL',
                mensaje: 'Este cartón está en la frontera de viabilidad',
                severidad: 'alta',
                impacto: 2000 - margen,
                recomendacion: 'Monitorea de cerca. Pequeños cambios en demanda afectan viabilidad'
            });
        }
        // Alerta de baja ocupación
        if (pasajeros < 250) {
            alertas.push({
                id: `alert-baja-ocupacion`,
                tipo: 'baja-ocupacion',
                titulo: 'Ocupación Baja',
                mensaje: `Solo ${pasajeros} pasajeros/día estimados`,
                severidad: 'media',
                impacto: (350 - pasajeros) * 56,
                recomendacion: 'Considera aumentar frecuencia en horas pico o reducir servicios en valles'
            });
        }
        return alertas;
    }
    generarRecomendacionesCartoon(cartoon, margen, alertas, registros) {
        const recomendaciones = [];
        if (margen < 2000) {
            recomendaciones.push({
                id: 'rec-aumento-freq',
                tipo: 'aumento-frecuencia',
                titulo: 'Aumenta frecuencia en horas pico',
                descripcion: 'Identifica horas de mayor demanda y aumenta salidas',
                accion: 'Consulta datos históricos de ocupación por hora',
                impactoEstimado: 1500,
                probabilidadExito: 65,
                complejidad: 'baja'
            });
        }
        if (alertas.some(a => a.tipo === 'no-viable')) {
            recomendaciones.push({
                id: 'rec-cancelacion',
                tipo: 'cancelacion',
                titulo: 'Considera cancelar este cartón',
                descripcion: 'Este cartón está generando pérdidas',
                accion: 'Reasigna recursos a líneas más rentables',
                impactoEstimado: Math.abs(margen) * 22, // Ahorro mensual
                probabilidadExito: 100,
                complejidad: 'media'
            });
        }
        return recomendaciones;
    }
    analizarFactoresRiesgo(cartoon, registros) {
        const factores = [];
        const ocupacionPromedio = registros.length > 0
            ? registros.reduce((sum, r) => sum + r.ocupacionPromedio, 0) / registros.length
            : 50;
        if (ocupacionPromedio < 50) {
            factores.push({
                nombre: 'Ocupación Baja',
                descripcion: 'Bus menos lleno de lo óptimo',
                impacto: 'alto',
                valorActual: ocupacionPromedio,
                valorOptimo: 80,
                brecha: 80 - ocupacionPromedio
            });
        }
        return factores;
    }
    async obtenerHistoricoBoletaje(lineaId, dias) {
        const fechaInicio = new Date();
        fechaInicio.setDate(fechaInicio.getDate() - dias);
        const snapshot = await database_1.db
            .collection('boletaje')
            .where('lineaId', '==', lineaId)
            .where('fecha', '>=', fechaInicio)
            .orderBy('fecha', 'desc')
            .get();
        return snapshot.docs.map(doc => doc.data());
    }
    agruparBoletajePorHora(registros) {
        const agrupado = {};
        registros.forEach(r => {
            const hora = r.horaInicio || '00:00';
            agrupado[hora] = (agrupado[hora] || 0) + r.boletosVendidos;
        });
        return Object.entries(agrupado)
            .map(([hora, boletos]) => ({ hora, boletos: boletos / registros.length }))
            .sort((a, b) => a.hora.localeCompare(b.hora));
    }
}
exports.analyticsService = new AnalyticsService();
