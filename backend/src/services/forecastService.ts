import { db } from '../config/database';
import { logger } from '../config/logger';
import {
  PronosticoIngreso,
  SimulacionResultado,
  CambioHorario,
  RegistroBoletaje,
  ProyeccionCrecimiento,
  DemandaZona,
  ComparacionOperador
} from '../types/analytics';

// Servicio de pronósticos e ingresos - Semana 6-7
//
// AUTONOMIA-PARCIAL (2026-05-13): este servicio aún consulta Firestore para
// las colecciones `lineas` y `boletaje` que no existen en el schema Postgres
// del clon. Las consultas están envueltas en try/catch para que si Firestore
// no es alcanzable (offline) las pantallas muestren estado vacío honesto en
// vez de crash. Migración a Postgres queda pendiente: requiere crear tabla
// boletaje y pipeline de ingesta.

class ForecastService {
  /**
   * Genera pronóstico de ingresos con diferentes escenarios
   */
  async pronosticarIngresos(lineaId: string): Promise<PronosticoIngreso> {
    try {
      // Obtener datos históricos
      const registrosUltimos30 = await this.obtenerHistoricoBoletaje(lineaId, 30);
      const pasajerosActuales = registrosUltimos30.reduce((sum, r) => sum + r.boletosVendidos, 0) / 30;
      const ingresosActuales = pasajerosActuales * 56;

      // Escenarios de simulación
      const escenarios = [
        {
          nombre: 'Actual',
          pasajerosProyectados: Math.round(pasajerosActuales),
          ingresosProyectados: Math.round(ingresosActuales),
          cambioVsActual: 0,
          impacto: 0,
          confianza: 95
        },
        {
          nombre: 'Adelanto 15 min',
          pasajerosProyectados: Math.round(pasajerosActuales * 1.15), // +15%
          ingresosProyectados: Math.round(ingresosActuales * 1.15),
          cambioVsActual: 15,
          impacto: Math.round((ingresosActuales * 1.15 - ingresosActuales) * 22), // Impacto mensual
          confianza: 72
        },
        {
          nombre: 'Adelanto 30 min',
          pasajerosProyectados: Math.round(pasajerosActuales * 1.25), // +25%
          ingresosProyectados: Math.round(ingresosActuales * 1.25),
          cambioVsActual: 25,
          impacto: Math.round((ingresosActuales * 1.25 - ingresosActuales) * 22),
          confianza: 65
        },
        {
          nombre: 'Aumento frecuencia',
          pasajerosProyectados: Math.round(pasajerosActuales * 1.20), // +20%
          ingresosProyectados: Math.round(ingresosActuales * 1.20),
          cambioVsActual: 20,
          impacto: Math.round((ingresosActuales * 1.20 - ingresosActuales) * 22),
          confianza: 68
        },
        {
          nombre: 'Respuesta a competencia',
          pasajerosProyectados: Math.round(pasajerosActuales * 0.85), // -15% (peor escenario)
          ingresosProyectados: Math.round(ingresosActuales * 0.85),
          cambioVsActual: -15,
          impacto: Math.round((ingresosActuales * 0.85 - ingresosActuales) * 22),
          confianza: 80
        },
        {
          nombre: 'Cambio de ruta',
          pasajerosProyectados: Math.round(pasajerosActuales * 1.30), // +30%
          ingresosProyectados: Math.round(ingresosActuales * 1.30),
          cambioVsActual: 30,
          impacto: Math.round((ingresosActuales * 1.30 - ingresosActuales) * 22),
          confianza: 55
        }
      ];

      const lineaDoc = await db.collection('lineas').doc(lineaId).get();
      const lineaData = lineaDoc.data() as any;

      return {
        id: `forecast-${lineaId}`,
        lineaId,
        numeroLinea: lineaData.numero,
        pasajerosActuales: Math.round(pasajerosActuales),
        ingresosActuales: Math.round(ingresosActuales),
        escenarios,
        historicoUltimos30Dias: registrosUltimos30,
        tendencia: this.calcularTendencia(registrosUltimos30),
        analisisEn: new Date()
      };
    } catch (error) {
      logger.warn(`[AUTONOMIA-PARCIAL] Pronóstico ingresos no disponible: ${(error as any)?.message ?? error}`);
      return {
        id: `forecast-${lineaId}`,
        lineaId,
        numeroLinea: 0,
        pasajerosActuales: 0,
        ingresosActuales: 0,
        escenarios: [],
        historicoUltimos30Dias: [],
        tendencia: 'estable',
        analisisEn: new Date()
      };
    }
  }

  /**
   * Simula impacto de cambios de horario
   */
  async simuladorHorarios(
    lineaId: string,
    cambios: CambioHorario[]
  ): Promise<SimulacionResultado> {
    try {
      const registros = await this.obtenerHistoricoBoletaje(lineaId, 30);
      const pasajerosActuales = registros.reduce((sum, r) => sum + r.boletosVendidos, 0) / 30;
      const ingresosActuales = pasajerosActuales * 56;

      // Calcular impacto de cambios
      let multiplicadorImpacto = 1.0;
      const descripcionCambios: string[] = [];

      for (const cambio of cambios) {
        const [horaActualStr] = cambio.horarioActual.split(':');
        const [horaNewStr] = cambio.horarioNuevo.split(':');
        const horaActual = parseInt(horaActualStr);
        const horaNueva = parseInt(horaNewStr);

        const diferencia = horaNueva - horaActual;

        // Lógica de impacto basada en diferencia horaria
        if (diferencia < 0) {
          // Adelanto (positivo para atrapar más pasajeros)
          const minutosAdelanto = Math.abs(diferencia * 60);
          multiplicadorImpacto *= 1 + (minutosAdelanto / 60) * 0.05; // ~5% por cada hora adelantada
          descripcionCambios.push(`Adelanto ${minutosAdelanto} minutos`);
        } else if (diferencia > 0) {
          // Atraso (negativo, pierde pasajeros)
          const minutosAtraso = diferencia * 60;
          multiplicadorImpacto *= 1 - (minutosAtraso / 60) * 0.08; // ~8% por cada hora atrasada
          descripcionCambios.push(`Atraso ${minutosAtraso} minutos`);
        }
      }

      const pasajerosNuevo = Math.round(pasajerosActuales * multiplicadorImpacto);
      const ingresosNuevo = Math.round(pasajerosNuevo * 56);

      // Evaluar riesgo
      let riesgo: 'bajo' | 'medio' | 'alto' = 'bajo';
      if (multiplicadorImpacto < 0.95) riesgo = 'alto';
      else if (multiplicadorImpacto < 1.0) riesgo = 'medio';

      return {
        id: `simulation-${lineaId}-${Date.now()}`,
        lineaId,
        cambios,
        resultados: {
          escenarioActual: {
            pasajeros: Math.round(pasajerosActuales),
            ingresos: Math.round(ingresosActuales)
          },
          escenarioNuevo: {
            pasajeros: pasajerosNuevo,
            ingresos: ingresosNuevo,
            cambioAbsoluto: Math.round(ingresosNuevo - ingresosActuales),
            cambioRelativo: Math.round(((ingresosNuevo - ingresosActuales) / ingresosActuales) * 100)
          },
          impactoTotal: Math.round((ingresosNuevo - ingresosActuales) * 22) // Impacto mensual
        },
        riesgo,
        recomendacion: this.generarRecomendacionSimulacion(
          multiplicadorImpacto,
          riesgo,
          descripcionCambios
        )
      };
    } catch (error) {
      logger.warn(`[AUTONOMIA-PARCIAL] Simulador horarios no disponible: ${(error as any)?.message ?? error}`);
      return {
        id: `simulation-${lineaId}-${Date.now()}`,
        lineaId,
        cambios,
        resultados: {
          escenarioActual: { pasajeros: 0, ingresos: 0 },
          escenarioNuevo: { pasajeros: 0, ingresos: 0, cambioAbsoluto: 0, cambioRelativo: 0 },
          impactoTotal: 0
        },
        riesgo: 'bajo',
        recomendacion: 'Sin datos históricos de boletaje. Integración pendiente.'
      };
    }
  }

  /**
   * Estima pasajeros por horario específico
   */
  async estimarPasajerosPorHorario(lineaId: string, horario: string): Promise<number> {
    try {
      const registros = await this.obtenerHistoricoBoletaje(lineaId, 30);

      // Filtrar registros por horario similar
      const registrosPorHora = registros.filter(r => {
        if (!r.horaInicio) return false;
        const [hReq] = horario.split(':');
        const [hReg] = r.horaInicio.split(':');
        return Math.abs(parseInt(hReg) - parseInt(hReq)) <= 1; // Dentro de 1 hora
      });

      if (registrosPorHora.length === 0) {
        // Si no hay datos específicos, retornar promedio
        return Math.round(
          registros.reduce((sum, r) => sum + r.boletosVendidos, 0) / registros.length
        );
      }

      return Math.round(
        registrosPorHora.reduce((sum, r) => sum + r.boletosVendidos, 0) / registrosPorHora.length
      );
    } catch (error) {
      logger.warn(`[AUTONOMIA-PARCIAL] Estimación pasajeros no disponible: ${(error as any)?.message ?? error}`);
      return 0;
    }
  }

  /**
   * Calcula demanda por zona geográfica
   */
  async calcularDemandaPorZona(zona: string): Promise<DemandaZona> {
    try {
      // Obtener todas las líneas que operan en la zona
      const lineasSnapshot = await db.collection('lineas').where('zona', '==', zona).get();

      let boletajeTotalMes = 0;
      const lineasOperando = lineasSnapshot.size;

      for (const lineaDoc of lineasSnapshot.docs) {
        const registros = await this.obtenerHistoricoBoletaje(lineaDoc.id, 30);
        const boletajeMes = registros.reduce((sum, r) => sum + r.boletosVendidos, 0);
        boletajeTotalMes += boletajeMes;
      }

      const boletosPorDia = boletajeTotalMes / 30;

      // Analizar tendencia
      const primeraSemana = boletajeTotalMes / 4;
      const ultimaSemana = boletajeTotalMes / 4; // Simplificado
      const crecimiento = ((ultimaSemana - primeraSemana) / primeraSemana) * 100;

      return {
        zona,
        boletajeTotalMes,
        boletosPorDia,
        lineasOperando,
        competenciaPresente: lineasOperando > 2,
        tendencia: crecimiento > 5 ? 'creciente' : crecimiento < -5 ? 'decreciente' : 'estable'
      };
    } catch (error) {
      logger.warn(`[AUTONOMIA-PARCIAL] Demanda por zona no disponible: ${(error as any)?.message ?? error}`);
      return {
        zona,
        boletajeTotalMes: 0,
        boletosPorDia: 0,
        lineasOperando: 0,
        competenciaPresente: false,
        tendencia: 'estable'
      };
    }
  }

  /**
   * Identifica horarios de alta demanda
   */
  async identificarHorariosAlta(lineaId: string): Promise<{ hora: string; demanda: number }[]> {
    try {
      const registros = await this.obtenerHistoricoBoletaje(lineaId, 30);

      // Agrupar por hora
      const demandaPorHora: { [key: string]: number } = {};

      registros.forEach(r => {
        if (r.horaInicio) {
          const hora = r.horaInicio;
          demandaPorHora[hora] = (demandaPorHora[hora] || 0) + r.boletosVendidos;
        }
      });

      // Convertir a array y ordenar por demanda
      const horariosOrdenados = Object.entries(demandaPorHora)
        .map(([hora, demanda]) => ({
          hora,
          demanda: Math.round(demanda / registros.length)
        }))
        .sort((a, b) => b.demanda - a.demanda);

      // Retornar top 5 horarios con alta demanda
      const promedioGeneral = horariosOrdenados.reduce((sum, h) => sum + h.demanda, 0) / horariosOrdenados.length;

      return horariosOrdenados
        .filter(h => h.demanda > promedioGeneral)
        .slice(0, 5);
    } catch (error) {
      logger.warn(`[AUTONOMIA-PARCIAL] Horarios alta demanda no disponibles: ${(error as any)?.message ?? error}`);
      return [];
    }
  }

  /**
   * Proyecta crecimiento futuro
   */
  async proyectarCrecimiento(lineaId: string, meses: number): Promise<ProyeccionCrecimiento> {
    try {
      const registros = await this.obtenerHistoricoBoletaje(lineaId, 90); // Últimos 90 días

      // Calcular tasa de crecimiento histórica
      const primerMes = registros
        .filter(r => {
          const dias = (Date.now() - r.fecha.getTime()) / (1000 * 60 * 60 * 24);
          return dias > 60 && dias <= 90;
        })
        .reduce((sum, r) => sum + r.boletosVendidos, 0) / 30;

      const ultimoMes = registros
        .filter(r => {
          const dias = (Date.now() - r.fecha.getTime()) / (1000 * 60 * 60 * 24);
          return dias <= 30;
        })
        .reduce((sum, r) => sum + r.boletosVendidos, 0) / 30;

      const tasaCrecimientoMensual = ((ultimoMes - primerMes) / primerMes) * 100;

      // Proyectar hacia el futuro
      const proyecciones = [];
      let boletosActuales = ultimoMes;

      for (let i = 1; i <= meses; i++) {
        boletosActuales = boletosActuales * (1 + tasaCrecimientoMensual / 100);
        const fecha = new Date();
        fecha.setMonth(fecha.getMonth() + i);

        proyecciones.push({
          mes: i,
          fecha,
          boletosProyectados: Math.round(boletosActuales),
          ingresoProyectado: Math.round(boletosActuales * 56 * 22) // 22 días hábiles
        });
      }

      return {
        lineaId,
        mesesProjectados: meses,
        proyecciones,
        tasaCrecimientoMensual,
        confianza: Math.max(40, 90 - Math.abs(tasaCrecimientoMensual) * 2) // Mayor volatilidad = menor confianza
      };
    } catch (error) {
      logger.warn(`[AUTONOMIA-PARCIAL] Proyección crecimiento no disponible: ${(error as any)?.message ?? error}`);
      return {
        lineaId,
        mesesProjectados: meses,
        proyecciones: [],
        tasaCrecimientoMensual: 0,
        confianza: 0
      };
    }
  }

  /**
   * Compara operador con promedio de zona
   */
  async compararUCOTVsPromedio(lineaId: string): Promise<ComparacionOperador> {
    try {
      const registrosUCOT = await this.obtenerHistoricoBoletaje(lineaId, 30);
      const boletosPorDiaUCOT = registrosUCOT.reduce((sum, r) => sum + r.boletosVendidos, 0) / 30;
      const ingresosPorDiaUCOT = boletosPorDiaUCOT * 56;

      // Obtener información de la línea
      const lineaDoc = await db.collection('lineas').doc(lineaId).get();
      const lineaData = lineaDoc.data() as any;

      // Simular datos de competencia (en producción, obtener datos reales)
      const promedioZona = boletosPorDiaUCOT * 0.95; // Asumir que UCOT está 5% arriba
      const ingresosPorDiaPromedio = promedioZona * 56;

      const diferenciaVsPromedio = ((boletosPorDiaUCOT - promedioZona) / promedioZona) * 100;

      return {
        lineaId,
        numeroLinea: lineaData.numero,
        operadorUCOT: {
          boletosPorDia: Math.round(boletosPorDiaUCOT),
          ingresosPorDia: Math.round(ingresosPorDiaUCOT)
        },
        promedioZona: {
          boletosPorDia: Math.round(promedioZona),
          ingresosPorDia: Math.round(ingresosPorDiaPromedio)
        },
        diferenciaVsPromedio,
        posicion: diferenciaVsPromedio > 0 ? 1 : 2,
        clasificacion: diferenciaVsPromedio > 10 ? 'arriba-promedio' : diferenciaVsPromedio < -10 ? 'debajo-promedio' : 'promedio',
        tendencia: 'estable',
        recomendaciones: this.generarRecomendacionesBenchmark(diferenciaVsPromedio)
      };
    } catch (error) {
      logger.warn(`[AUTONOMIA-PARCIAL] Comparación operador no disponible: ${(error as any)?.message ?? error}`);
      return {
        lineaId,
        numeroLinea: 0,
        operadorUCOT: { boletosPorDia: 0, ingresosPorDia: 0 },
        promedioZona: { boletosPorDia: 0, ingresosPorDia: 0 },
        diferenciaVsPromedio: 0,
        posicion: 0,
        clasificacion: 'promedio',
        tendencia: 'estable',
        recomendaciones: []
      };
    }
  }

  // ============ FUNCIONES AUXILIARES ============

  private async obtenerHistoricoBoletaje(
    lineaId: string,
    dias: number
  ): Promise<RegistroBoletaje[]> {
    const fechaInicio = new Date();
    fechaInicio.setDate(fechaInicio.getDate() - dias);

    try {
      const snapshot = await db
        .collection('boletaje')
        .where('lineaId', '==', lineaId)
        .where('fecha', '>=', fechaInicio)
        .orderBy('fecha', 'desc')
        .get();

      return snapshot.docs.map(doc => doc.data() as RegistroBoletaje);
    } catch (error) {
      logger.warn(`[AUTONOMIA-PARCIAL] Histórico boletaje no disponible (Firestore?): ${(error as any)?.message ?? error}`);
      return [];
    }
  }

  private calcularTendencia(
    registros: RegistroBoletaje[]
  ): 'creciente' | 'estable' | 'decreciente' {
    if (registros.length < 10) return 'estable';

    const primeraSemana = registros
      .slice(-7)
      .reduce((sum, r) => sum + r.boletosVendidos, 0) / 7;
    const ultimaSemana = registros
      .slice(0, 7)
      .reduce((sum, r) => sum + r.boletosVendidos, 0) / 7;

    const cambio = ((ultimaSemana - primeraSemana) / primeraSemana) * 100;

    if (cambio > 5) return 'creciente';
    if (cambio < -5) return 'decreciente';
    return 'estable';
  }

  private generarRecomendacionSimulacion(
    multiplicador: number,
    riesgo: string,
    cambios: string[]
  ): string {
    if (riesgo === 'alto') {
      return `⚠️ RIESGO ALTO: ${cambios.join(', ')}. Esto reduciría ingresos. NO RECOMENDADO sin análisis adicional.`;
    }

    if (multiplicador > 1.2) {
      return `✅ EXCELENTE: ${cambios.join(', ')}. Impacto positivo muy alto. RECOMENDADO implementar.`;
    }

    if (multiplicador > 1.1) {
      return `✓ BUENO: ${cambios.join(', ')}. Impacto positivo. Considera implementar.`;
    }

    if (multiplicador > 1.0) {
      return `→ NEUTRAL: ${cambios.join(', ')}. Cambio mínimo. Monitorea resultados.`;
    }

    return `✗ NEGATIVO: ${cambios.join(', ')}. Reducción de ingresos. NO RECOMENDADO.`;
  }

  private generarRecomendacionesBenchmark(diferencia: number): string[] {
    const recomendaciones: string[] = [];

    if (diferencia > 15) {
      recomendaciones.push('Estás muy por encima del promedio. Mantén estándares altos.');
      recomendaciones.push('Analiza qué estás haciendo bien vs competencia.');
    } else if (diferencia > 5) {
      recomendaciones.push('Por encima del promedio. Busca oportunidades de crecimiento.');
    } else if (diferencia < -15) {
      recomendaciones.push('Significativamente por debajo del promedio. Acción urgente requerida.');
      recomendaciones.push('Revisa análisis de competencia y considera cambios de horario.');
    } else if (diferencia < -5) {
      recomendaciones.push('Por debajo del promedio. Mejora necesaria.');
      recomendaciones.push('Aumenta frecuencia en horas pico.');
    }

    return recomendaciones;
  }
}

export const forecastService = new ForecastService();
