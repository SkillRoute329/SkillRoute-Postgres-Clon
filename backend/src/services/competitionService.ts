import { db } from '../config/database';
import { logger } from '../config/logger';
import {
  Competidor,
  LineaCompetencia,
  SobreposicionLinea,
  ConflictoHorario,
  CambioHistorico,
  AnalisisCompetitividadLinea,
  ReporteCompetencia,
  ComparacionOperador
} from '../types/competition';

// Servicio de análisis de competencia - Semana 4

class CompetitionService {
  /**
   * Ingresa un nuevo competidor con sus líneas y horarios
   */
  async ingresarCompetidor(datos: Competidor): Promise<void> {
    try {
      const competidorRef = db.collection('competidores').doc(datos.id);
      await competidorRef.set({
        ...datos,
        ultimaActualizacion: new Date(),
        createdAt: new Date()
      });
      logger.info(`Competidor ${datos.nombre} ingresado exitosamente`);
    } catch (error) {
      logger.error(`Error ingresando competidor: ${error}`);
      throw error;
    }
  }

  /**
   * Analiza sobreposición entre línea de UCOT y líneas de competencia
   */
  async analizarSobreposicion(lineaUCOTId: string): Promise<SobreposicionLinea[]> {
    try {
      const sobreposiciones: SobreposicionLinea[] = [];

      // Obtener línea UCOT
      const lineaUCOT = await db.collection('lineas').doc(lineaUCOTId).get();
      if (!lineaUCOT.exists) {
        throw new Error(`Línea UCOT ${lineaUCOTId} no encontrada`);
      }
      const recorridoUCOT = (lineaUCOT.data() as any).recorrido;

      // Obtener todos los competidores
      const competidoresSnapshot = await db.collection('competidores').get();

      for (const competidorDoc of competidoresSnapshot.docs) {
        const competidor = competidorDoc.data() as Competidor;

        // Comparar con cada línea del competidor
        for (const lineaComp of competidor.lineas) {
          const porcentaje = this.calcularPorcentajeSobreposicion(
            recorridoUCOT,
            lineaComp.recorrido
          );

          if (porcentaje > 30) {
            // Sobreposición significativa
            const conflictos = await this.detectarConflictosHorarios(
              lineaUCOTId,
              lineaComp.id,
              competidor.nombre
            );

            const pasajerosEnRiesgo = this.estimarPasajerosEnRiesgo(
              lineaUCOTId,
              porcentaje
            );

            sobreposiciones.push({
              id: `overlap-${lineaUCOTId}-${lineaComp.id}`,
              lineaUCOT: lineaUCOTId,
              numeroLineaUCOT: (lineaUCOT.data() as any).numero,
              lineaCompetencia: lineaComp.id,
              numeroLineaCompetencia: lineaComp.numeroLinea,
              competidor: competidor.nombre,
              porcentajeSobreposicion: porcentaje,
              distanciaPromedio: this.calcularDistanciaPromedio(recorridoUCOT, lineaComp.recorrido),
              pasajerosEnRiesgo,
              nivelesRiesgo: this.determinarNivelRiesgo(porcentaje, conflictos.length),
              conflictosHorarios: conflictos
            });
          }
        }
      }

      return sobreposiciones;
    } catch (error) {
      logger.error(`Error analizando sobreposición: ${error}`);
      throw error;
    }
  }

  /**
   * Detecta conflictos de horarios entre dos líneas
   */
  async detectarConflictosHorarios(
    lineaUCOTId: string,
    lineaCompId: string,
    competidor: string
  ): Promise<ConflictoHorario[]> {
    try {
      const conflictos: ConflictoHorario[] = [];

      const lineaUCOTDoc = await db.collection('lineas').doc(lineaUCOTId).get();
      const lineaCompDoc = await db.collection('lineas').doc(lineaCompId).get();

      if (!lineaUCOTDoc.exists || !lineaCompDoc.exists) return conflictos;

      const horariosUCOT = (lineaUCOTDoc.data() as any).horarios || [];
      const horariosComp = (lineaCompDoc.data() as any).horarios || [];

      for (const horarioUCOT of horariosUCOT) {
        for (const horarioComp of horariosComp) {
          const diferenciaMinutos = this.calcularDiferenciaHorarios(
            horarioUCOT.horaInicio,
            horarioComp.horaInicio
          );

          if (Math.abs(diferenciaMinutos) < 30) {
            // Conflicto si están dentro de 30 minutos
            const pasajerosEnRiesgo = this.estimarPasajerosEnRiesgoHorario(
              lineaUCOTId,
              horarioUCOT.horaInicio,
              Math.abs(diferenciaMinutos)
            );

            conflictos.push({
              id: `conflict-${lineaUCOTId}-${horarioUCOT.horaInicio}`,
              lineaUCOT: lineaUCOTId,
              lineaCompetencia: lineaCompId,
              competidor,
              horarioUCOT: horarioUCOT.horaInicio,
              horarioCompetencia: horarioComp.horaInicio,
              diferenciaminutos: diferenciaMinutos,
              tipo: diferenciaMinutos < 0 ? 'adelanto-competencia' : 'adelanto-ucot',
              pasajerosEnRiesgo,
              frecuencia: 'diaria',
              prioridad: this.determinarPrioridad(Math.abs(diferenciaMinutos), pasajerosEnRiesgo)
            });
          }
        }
      }

      return conflictos;
    } catch (error) {
      logger.error(`Error detectando conflictos: ${error}`);
      throw error;
    }
  }

  /**
   * Genera análisis de competitividad para una línea UCOT
   */
  async analizarCompetitividad(lineaId: string): Promise<AnalisisCompetitividadLinea> {
    try {
      const sobreposiciones = await this.analizarSobreposicion(lineaId);
      const lineaDoc = await db.collection('lineas').doc(lineaId).get();
      const lineaData = lineaDoc.data() as any;

      const conflictosActivos = sobreposiciones.flatMap(s => s.conflictosHorarios);
      const competidoresPresentes = Array.from(
        new Set(sobreposiciones.map(s => s.competidor))
      ) as string[];

      const pasajerosEnRiesgoTotal = sobreposiciones.reduce(
        (sum, s) => sum + s.pasajerosEnRiesgo,
        0
      );

      const recomendaciones = this.generarRecomendacionesCompetencia(
        sobreposiciones,
        conflictosActivos
      );

      return {
        lineaId,
        numeroLinea: lineaData.numero,
        competidoresPresentes: competidoresPresentes as any,
        gradoCompetencia: this.determinarGradoCompetencia(sobreposiciones.length),
        sobreposiciones,
        conflictosActivos,
        pasajerosEnRiesgoTotal,
        recomendaciones
      };
    } catch (error) {
      logger.error(`Error analizando competitividad: ${error}`);
      throw error;
    }
  }

  /**
   * Genera reporte completo de competencia para el operador
   */
  async generarReporteCompetencia(
    operador: string,
    fechaInicio: Date,
    fechaFin: Date
  ): Promise<ReporteCompetencia> {
    try {
      // Obtener todas las líneas de UCOT
      const lineasSnapshot = await db
        .collection('lineas')
        .where('operador', '==', operador)
        .get();

      const analisisLineas = await Promise.all(
        lineasSnapshot.docs.map(doc => this.analizarCompetitividad(doc.id))
      );

      const sobreposicionesTop = analisisLineas
        .flatMap(a => a.sobreposiciones)
        .sort((a, b) => b.pasajerosEnRiesgo - a.pasajerosEnRiesgo)
        .slice(0, 10);

      const conflictosActivos = analisisLineas.flatMap(a => a.conflictosActivos);

      const cambiosSnapshot = await db
        .collection('cambios_historicos')
        .where('fecha', '>=', fechaInicio)
        .where('fecha', '<=', fechaFin)
        .get();

      const cambiosDetectados = cambiosSnapshot.docs.map(doc => doc.data() as CambioHistorico);

      const recomendacionesUrgentes = analisisLineas
        .flatMap(a => a.recomendaciones)
        .sort((a, b) => (a.riesgo === 'alto' ? -1 : 1))
        .slice(0, 5);

      return {
        periodo: { inicio: fechaInicio, fin: fechaFin },
        totalLineasUCOT: lineasSnapshot.size,
        lineasConCompetencia: analisisLineas.filter(a => a.sobreposiciones.length > 0).length,
        competidoresActivos: Array.from(
          new Set(sobreposicionesTop.map(s => s.competidor))
        ) as any,
        cambiosDetectados,
        sobreposicionesTop,
        conflictosActivos,
        pasajerosEnRiesgo: analisisLineas.reduce(
          (sum, a) => sum + a.pasajerosEnRiesgoTotal,
          0
        ),
        recomendacionesUrgentes
      };
    } catch (error) {
      logger.error(`Error generando reporte: ${error}`);
      throw error;
    }
  }

  // ============ FUNCIONES AUXILIARES ============

  private calcularPorcentajeSobreposicion(
    recorrido1: any[],
    recorrido2: any[]
  ): number {
    // Calcula qué porcentaje del recorrido 1 se superpone con recorrido 2
    // Simplificado: compara zonas geográficas
    const zona1 = new Set(recorrido1.map((p: any) => Math.round(p.latitude * 10)));
    const zona2 = new Set(recorrido2.map((p: any) => Math.round(p.latitude * 10)));

    const interseccion = [...zona1].filter(z => zona2.has(z)).length;
    return (interseccion / zona1.size) * 100;
  }

  private calcularDistanciaPromedio(recorrido1: any[], recorrido2: any[]): number {
    // Calcula distancia promedio entre recorridos
    let sumaDistancias = 0;
    let contador = 0;

    for (const parada1 of recorrido1) {
      for (const parada2 of recorrido2) {
        const distancia = this.calcularDistanciaHaversine(
          parada1.latitude,
          parada1.longitude,
          parada2.latitude,
          parada2.longitude
        );
        if (distancia < 500) {
          // Solo contar si están cerca
          sumaDistancias += distancia;
          contador++;
        }
      }
    }

    return contador > 0 ? sumaDistancias / contador : 10000;
  }

  private calcularDistanciaHaversine(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Radio terrestre en metros
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private calcularDiferenciaHorarios(hora1: string, hora2: string): number {
    const [h1, m1] = hora1.split(':').map(Number);
    const [h2, m2] = hora2.split(':').map(Number);
    return (h2 - h1) * 60 + (m2 - m1);
  }

  private estimarPasajerosEnRiesgo(lineaId: string, porcentajeSobreposicion: number): number {
    // Estimación simplificada basada en datos históricos
    // En producción: consultar datos reales de STM
    const pasajerosPromedioDiarios = 350; // Promedio para líneas de Montevideo
    return Math.round((pasajerosPromedioDiarios * porcentajeSobreposicion) / 100 * 0.3);
  }

  private estimarPasajerosEnRiesgoHorario(
    lineaId: string,
    horario: string,
    diferenciaMinutos: number
  ): number {
    // Cuanto mayor sea la diferencia, menos riesgo (menos competencia directa)
    const riesgoBase = Math.max(0, 30 - diferenciaMinutos) / 30;
    return Math.round(150 * riesgoBase);
  }

  private determinarNivelRiesgo(
    porcentajeSobreposicion: number,
    cantidadConflictos: number
  ): 'critico' | 'alto' | 'medio' | 'bajo' {
    if (porcentajeSobreposicion > 70 && cantidadConflictos > 3) return 'critico';
    if (porcentajeSobreposicion > 60 || cantidadConflictos > 2) return 'alto';
    if (porcentajeSobreposicion > 40) return 'medio';
    return 'bajo';
  }

  private determinarPrioridad(
    diferenciaMinutos: number,
    pasajerosEnRiesgo: number
  ): 'critica' | 'alta' | 'media' | 'baja' {
    if (diferenciaMinutos < 10 && pasajerosEnRiesgo > 100) return 'critica';
    if (diferenciaMinutos < 15 || pasajerosEnRiesgo > 80) return 'alta';
    if (pasajerosEnRiesgo > 30) return 'media';
    return 'baja';
  }

  private generarRecomendacionesCompetencia(
    sobreposiciones: SobreposicionLinea[],
    conflictos: ConflictoHorario[]
  ) {
    const recomendaciones: any[] = [];

    conflictos
      .filter(c => c.prioridad === 'critica' || c.prioridad === 'alta')
      .forEach(conflicto => {
        if (conflicto.tipo === 'adelanto-competencia') {
          recomendaciones.push({
            id: `rec-${conflicto.id}`,
            tipo: 'adelanto-horario',
            titulo: `Adelanta tu horario en línea ${conflicto.lineaUCOT}`,
            descripcion: `Competidor (${conflicto.competidor}) adelantó a ${conflicto.horarioCompetencia}. Tú sales a ${conflicto.horarioUCOT}.`,
            accionSugerida: `Considera adelantar tu salida a ${Math.max(0, parseInt(conflicto.horarioCompetencia.split(':')[0]) - 1)}:${conflicto.horarioCompetencia.split(':')[1]}`,
            impactoEstimado: conflicto.pasajerosEnRiesgo * 0.6,
            riesgo: 'medio',
            probabilidadExito: 70
          });
        }
      });

    return recomendaciones;
  }

  private determinarGradoCompetencia(
    cantidadSobreposiciones: number
  ): 'alto' | 'medio' | 'bajo' {
    if (cantidadSobreposiciones > 5) return 'alto';
    if (cantidadSobreposiciones > 2) return 'medio';
    return 'bajo';
  }
}

export const competitionService = new CompetitionService();
