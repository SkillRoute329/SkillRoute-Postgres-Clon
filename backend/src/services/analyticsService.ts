import sqlDb, { db } from '../config/database';
import { logger } from '../config/logger';
import {
  Carton,
  CartoonViabilidad,
  AlertaCartoon,
  DatosLinea,
  PatronTemporal,
  Oportunidad,
  LineaEnRiesgo,
  PronosticoIngreso,
  RegistroBoletaje
} from '../types/analytics';

// Servicio de análisis de ingresos y viabilidad - Semana 5

class AnalyticsService {
  // Costos estimados (pesos/km)
  private readonly COSTO_COMBUSTIBLE_POR_KM = 12;
  private readonly COSTO_CONDUCTOR_POR_HORA = 250;
  private readonly COSTO_MANTENIMIENTO_DIARIO = 800;
  private readonly COSTO_SEGURO_DIARIO = 500;

  /**
   * Helper para obtener un parámetro operativo desde PostgreSQL local
   */
  private async getParametroValor(key: string, defaultValor: number): Promise<number> {
    try {
      const casingMap: Record<string, string> = {
        tarifa_stm_comun_uyu: 'TARIFA_STM',
        iva_transporte: 'IVA_TRANSPORTE',
        pasajeros_promedio_bus_dia: 'PASAJEROS_PROMEDIO_DIA_COCHE',
        factor_competencia_dro: 'FACTOR_COMPETENCIA_CORREDOR',
        pasajeros_por_viaje_promedio: 'PASAJEROS_POR_VIAJE_IND',
      };
      const mappedKey = casingMap[key] || key;
      let row = await sqlDb('parametros_operativos').where('key', mappedKey).first();
      if (!row && mappedKey !== key) {
        row = await sqlDb('parametros_operativos').where('key', key).first();
      }
      if (row && row.value_jsonb && typeof row.value_jsonb.valor === 'number') {
        return row.value_jsonb.valor;
      }
      return defaultValor;
    } catch (e) {
      logger.warn(`Error leyendo parametro ${key} de Postgres, usando default: ${defaultValor}`, { err: String(e) });
      return defaultValor;
    }
  }

  /**
   * Valida viabilidad de un cartón de servicio
   */
  async validarCartoon(cartoonId: string): Promise<CartoonViabilidad> {
    try {
      const cartoonDoc = await db.collection('cartones').doc(cartoonId).get();
      if (!cartoonDoc.exists) {
        throw new Error(`Cartón ${cartoonId} no encontrado`);
      }

      const cartoon = cartoonDoc.data() as Carton;

      // Obtener datos de línea
      const lineaDoc = await db.collection('lineas').doc(cartoon.lineaId).get();
      const lineaData = lineaDoc.data() as any;

      // Obtener historial de boletaje
      const registros = await this.obtenerHistoricoBoletaje(
        cartoon.lineaId,
        30 // últimos 30 días
      );

      const tarifa = await this.getParametroValor('tarifa_stm_comun_uyu', 56);
      const iva = await this.getParametroValor('iva_transporte', 0);
      const diasHabiles = await this.getParametroValor('viajes_dia_habil_promedio', 22);

      // Calcular métricas
      const pasajerosEstimados = this.estimarPasajeros(cartoon, registros);
      const ingresosEstimados = pasajerosEstimados * tarifa * (1 - iva);
      const costosEstimados = this.calcularCostosOperacionales(cartoon, lineaData);

      const margenEstimado = ingresosEstimados - costosEstimados;
      const porcentajeMargen = (margenEstimado / ingresosEstimados) * 100;

      // Determinar viabilidad
      const nivelViabilidad = this.determinarNivelViabilidad(margenEstimado);
      const puntajeViabilidad = this.calcularPuntajeViabilidad(margenEstimado, porcentajeMargen);

      // Detectar alertas
      const alertas = this.detectarAlertasCartoon(
        cartoon,
        pasajerosEstimados,
        margenEstimado,
        registros,
        tarifa
      );

      // Generar recomendaciones
      const recomendaciones = this.generarRecomendacionesCartoon(
        cartoon,
        margenEstimado,
        alertas,
        registros
      );

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
        ingresosEstimadosMes: ingresosEstimados * diasHabiles, // días hábiles parametrizados
        costosEstimados,
        costosEstimadosMes: costosEstimados * diasHabiles,
        margenEstimado,
        margenEstimadoMes: margenEstimado * diasHabiles,
        porcentajeMargen,
        esViable: margenEstimado > 0,
        puntajeViabilidad,
        nivelViabilidad,
        alertas,
        factoresRiesgo: this.analizarFactoresRiesgo(cartoon, registros),
        recomendaciones,
        calculadoEn: new Date()
      };
    } catch (error) {
      logger.error(`Error validando cartón: ${error}`);
      throw error;
    }
  }

  /**
   * Detecta cartones marginales o no viables
   */
  async detectarCartonesMarginales(operador: string): Promise<CartoonViabilidad[]> {
    try {
      const cartonesSnapshot = await db
        .collection('cartones')
        .where('operador', '==', operador)
        .where('activo', '==', true)
        .get();

      const viabilidades = await Promise.all(
        cartonesSnapshot.docs.map(doc => this.validarCartoon(doc.id))
      );

      // Retornar solo los marginales o no viables
      return viabilidades.filter(
        v => v.nivelViabilidad === 'marginal' || v.nivelViabilidad === 'no-viable'
      );
    } catch (error) {
      logger.error(`Error detectando cartones marginales: ${error}`);
      throw error;
    }
  }

  /**
   * Obtiene datos históricos de una línea
   */
  async obtenerDatosLinea(lineaId: string, diasHistorico: number = 30): Promise<DatosLinea> {
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

      const lineaDoc = await db.collection('lineas').doc(lineaId).get();
      const lineaData = lineaDoc.data() as any;

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
    } catch (error) {
      logger.error(`Error obteniendo datos de línea: ${error}`);
      throw error;
    }
  }

  /**
   * Identifica líneas en riesgo (que están perdiendo pasajeros)
   */
  async identificarLineasEnRiesgo(operador: string): Promise<LineaEnRiesgo[]> {
    try {
      const tarifa = await this.getParametroValor('tarifa_stm_comun_uyu', 56);
      const iva = await this.getParametroValor('iva_transporte', 0);
      const diasHabiles = await this.getParametroValor('viajes_dia_habil_promedio', 22);

      const lineasSnapshot = await db
        .collection('lineas')
        .where('operador', '==', operador)
        .get();

      const lineasEnRiesgo: LineaEnRiesgo[] = [];

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
            ingresoEnRiesgo: Math.round(boletosActual * caida / 100 * tarifa * (1 - iva) * diasHabiles),
            recomendacionesUrgentes: [
              'Revisar cambios de competencia',
              'Analizar patrones de demanda',
              'Considerar ajustes de horario'
            ]
          });
        }
      }

      return lineasEnRiesgo.sort((a, b) => b.caida - a.caida);
    } catch (error) {
      logger.error(`Error identificando líneas en riesgo: ${error}`);
      throw error;
    }
  }

  // ============ FUNCIONES AUXILIARES ============

  private estimarPasajeros(cartoon: Carton, registros: RegistroBoletaje[]): number {
    if (registros.length === 0) {
      // Estimación por defecto si no hay historial
      return 350;
    }

    const promedioRegistros = registros.reduce((sum, r) => sum + r.boletosVendidos, 0) / registros.length;

    // Ajustar por número de viajes
    const viajePorDiaPromedio = 10;
    return Math.round((promedioRegistros * cartoon.viajesPorDia) / viajePorDiaPromedio);
  }

  private calcularCostosOperacionales(cartoon: Carton, lineaData: any): number {
    // Costos diarios
    const horasTrabajo = this.calcularHorasTrabajo(cartoon.horarioInicio, cartoon.horarioFin);
    const costoConductor = this.COSTO_CONDUCTOR_POR_HORA * horasTrabajo;
    const costoFijo = this.COSTO_MANTENIMIENTO_DIARIO + this.COSTO_SEGURO_DIARIO;

    // Costo de combustible (estimado por km)
    const kmDiarios = (lineaData.kmRecorrido || 50) * cartoon.viajesPorDia;
    const costoCombustible = kmDiarios * this.COSTO_COMBUSTIBLE_POR_KM;

    return costoConductor + costoFijo + costoCombustible;
  }

  private calcularHorasTrabajo(inicio: string, fin: string): number {
    const [hI, mI] = inicio.split(':').map(Number);
    const [hF, mF] = fin.split(':').map(Number);
    return (hF - hI) + (mF - mI) / 60;
  }

  private determinarNivelViabilidad(margen: number): 'muy-viable' | 'viable' | 'marginal' | 'no-viable' {
    if (margen > 5000) return 'muy-viable';
    if (margen > 2000) return 'viable';
    if (margen > 0) return 'marginal';
    return 'no-viable';
  }

  private calcularPuntajeViabilidad(margen: number, porcentajeMargen: number): number {
    let puntaje = 50;

    // Ajustar por margen
    if (margen > 5000) puntaje += 30;
    else if (margen > 2000) puntaje += 20;
    else if (margen > 0) puntaje += 5;
    else puntaje -= 30;

    // Ajustar por porcentaje
    if (porcentajeMargen > 30) puntaje += 15;
    else if (porcentajeMargen > 15) puntaje += 5;

    return Math.min(100, Math.max(0, puntaje));
  }

  private detectarAlertasCartoon(
    cartoon: Carton,
    pasajeros: number,
    margen: number,
    registros: RegistroBoletaje[],
    tarifa: number
  ): AlertaCartoon[] {
    const alertas: AlertaCartoon[] = [];

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
    } else if (margen < 2000) {
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
        impacto: (350 - pasajeros) * tarifa,
        recomendacion: 'Considera aumentar frecuencia en horas pico o reducir servicios en valles'
      });
    }

    return alertas;
  }

  private generarRecomendacionesCartoon(
    cartoon: Carton,
    margen: number,
    alertas: AlertaCartoon[],
    registros: RegistroBoletaje[]
  ): any[] {
    const recomendaciones: any[] = [];

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

  private analizarFactoresRiesgo(cartoon: Carton, registros: RegistroBoletaje[]): any[] {
    const factores: any[] = [];

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

  private async obtenerHistoricoBoletaje(
    lineaId: string,
    dias: number
  ): Promise<RegistroBoletaje[]> {
    const fechaInicio = new Date();
    fechaInicio.setDate(fechaInicio.getDate() - dias);

    const snapshot = await db
      .collection('boletaje')
      .where('lineaId', '==', lineaId)
      .where('fecha', '>=', fechaInicio)
      .orderBy('fecha', 'desc')
      .get();

    return snapshot.docs.map(doc => doc.data() as RegistroBoletaje);
  }

  private agruparBoletajePorHora(registros: RegistroBoletaje[]): { hora: string; boletos: number }[] {
    const agrupado: { [key: string]: number } = {};

    registros.forEach(r => {
      const hora = r.horaInicio || '00:00';
      agrupado[hora] = (agrupado[hora] || 0) + r.boletosVendidos;
    });

    return Object.entries(agrupado)
      .map(([hora, boletos]) => ({ hora, boletos: boletos / registros.length }))
      .sort((a, b) => a.hora.localeCompare(b.hora));
  }
}

export const analyticsService = new AnalyticsService();
