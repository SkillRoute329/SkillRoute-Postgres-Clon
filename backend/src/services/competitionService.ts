import sqlDb, { db } from '../config/database';
import { logger } from '../config/logger';
import {
  Competidor,
  LineaCompetencia,
  SobreposicionLinea,
  ConflictoHorario,
  CambioHistorico,
  AnalisisCompetitividadLinea,
  ReporteCompetencia,
  ComparacionOperador,
  RecomendacionCompetencia
} from '../types/competition';

// Servicio de análisis de competencia - Semana 4
//
// AUTONOMIA-PARCIAL (2026-05-13): este servicio aún consulta Firestore para
// las colecciones `lineas`, `competidores` y `cambios_historicos` que no
// existen en el schema Postgres del clon. Las consultas están envueltas en
// try/catch para que si Firestore no es alcanzable (offline) la pantalla
// muestre estado vacío honesto en vez de crash. Migración a Postgres queda
// pendiente: requiere crear tablas y pipeline de ingesta de boletaje.

class CompetitionService {
  /**
   * Helper para obtener un parámetro operativo desde PostgreSQL local
   */
  private async getParametroValor(key: string, defaultValor: number): Promise<number> {
    try {
      const row = await sqlDb('parametros_operativos').where('key', key).first();
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

            const pasajerosEnRiesgo = await this.estimarPasajerosEnRiesgo(
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
      logger.warn(`[AUTONOMIA-PARCIAL] Sobreposición no disponible (Firestore?): ${(error as any)?.message ?? error}`);
      return [];
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
            const pasajerosEnRiesgo = await this.estimarPasajerosEnRiesgoHorario(
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
      logger.warn(`[AUTONOMIA-PARCIAL] Conflictos horarios no disponibles (Firestore?): ${(error as any)?.message ?? error}`);
      return [];
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
      logger.warn(`[AUTONOMIA-PARCIAL] Competitividad no disponible (Firestore?): ${(error as any)?.message ?? error}`);
      return {
        lineaId,
        numeroLinea: 0,
        competidoresPresentes: [] as any,
        gradoCompetencia: 'bajo',
        sobreposiciones: [],
        conflictosActivos: [],
        pasajerosEnRiesgoTotal: 0,
        recomendaciones: []
      };
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
      logger.warn(`[AUTONOMIA-PARCIAL] Reporte competencia no disponible (Firestore?): ${(error as any)?.message ?? error}`);
      return {
        periodo: { inicio: fechaInicio, fin: fechaFin },
        totalLineasUCOT: 0,
        lineasConCompetencia: 0,
        competidoresActivos: [] as any,
        cambiosDetectados: [],
        sobreposicionesTop: [],
        conflictosActivos: [],
        pasajerosEnRiesgo: 0,
        recomendacionesUrgentes: []
      };
    }
  }

  // ============ FUNCIONES AUXILIARES ============
  private calcularPorcentajeSobreposicion(
    recorrido1: any[],
    recorrido2: any[]
  ): number {
    if (!recorrido1.length || !recorrido2.length) return 0;
    
    // Resolución profesional: comparamos cada punto del recorrido1 con el recorrido2
    // Si un punto de R1 tiene un punto de R2 a menos de 200 metros, se considera superpuesto
    let puntosSuperpuestos = 0;
    const TOLERANCIA_METROS = 200;

    for (const p1 of recorrido1) {
      const existeCerca = recorrido2.some(p2 => 
        this.calcularDistanciaHaversine(p1.latitude, p1.longitude, p2.latitude, p2.longitude) < TOLERANCIA_METROS
      );
      if (existeCerca) puntosSuperpuestos++;
    }

    return (puntosSuperpuestos / recorrido1.length) * 100;
  }

  private calcularDistanciaPromedio(recorrido1: any[], recorrido2: any[]): number {
    let sumaDistancias = 0;
    let puntosCercanos = 0;
    const UMBRAL_PROXIMIDAD = 500; // metros

    for (const p1 of recorrido1) {
      let minContextDist = Infinity;
      for (const p2 of recorrido2) {
        const d = this.calcularDistanciaHaversine(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
        if (d < minContextDist) minContextDist = d;
      }
      
      if (minContextDist < UMBRAL_PROXIMIDAD) {
        sumaDistancias += minContextDist;
        puntosCercanos++;
      }
    }

    return puntosCercanos > 0 ? sumaDistancias / puntosCercanos : 5000;
  }

  private calcularDistanciaHaversine(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Radio de la Tierra en metros
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

  private async estimarPasajerosEnRiesgo(lineaId: string, porcentajeSobreposicion: number): Promise<number> {
    // ISO/IEC 27001 / COBIT: Parametrizacion dinamica en base de datos PostgreSQL soberana.
    // Fuente: Balcombe et al. (elasticidad cruzada 0.2-0.3)
    const pasajerosPromedioDiarios = await this.getParametroValor('pasajeros_promedio_bus_dia', 380);
    const factorCompetencia = await this.getParametroValor('factor_competencia_dro', 0.25);
    
    return Math.round(
      pasajerosPromedioDiarios * (porcentajeSobreposicion / 100) * factorCompetencia
    );
  }

  private async estimarPasajerosEnRiesgoHorario(
    lineaId: string,
    horario: string,
    diferenciaMinutos: number
  ): Promise<number> {
    // Si la diferencia es < 5 min, el riesgo es altisimo (robo de parada / bunching de competencia)
    // Si la diferencia es > 15 min, el riesgo es residual.
    // Degradacion exponencial segun literatura de planificacion de transporte.
    let factorTemporal = 0;
    const diffAbs = Math.abs(diferenciaMinutos);
    
    if (diffAbs < 5) factorTemporal = 1.0;
    else if (diffAbs < 10) factorTemporal = 0.6;
    else if (diffAbs < 15) factorTemporal = 0.3;
    else if (diffAbs < 30) factorTemporal = 0.1;

    // Promedio Montevideo parametrizado
    const pasajerosPorViaje = await this.getParametroValor('pasajeros_por_viaje_promedio', 45);
    return Math.round(pasajerosPorViaje * factorTemporal);
  }

  private determinarNivelRiesgo(
    porcentajeSobreposicion: number,
    cantidadConflictos: number
  ): 'critico' | 'alto' | 'medio' | 'bajo' {
    if (porcentajeSobreposicion > 65 && cantidadConflictos >= 3) return 'critico';
    if (porcentajeSobreposicion > 50 || cantidadConflictos >= 2) return 'alto';
    if (porcentajeSobreposicion > 25) return 'medio';
    return 'bajo';
  }

  private determinarPrioridad(
    diferenciaMinutos: number,
    pasajerosEnRiesgo: number
  ): 'critica' | 'alta' | 'media' | 'baja' {
    if (Math.abs(diferenciaMinutos) <= 5 && pasajerosEnRiesgo > 35) return 'critica';
    if (Math.abs(diferenciaMinutos) <= 10 || pasajerosEnRiesgo > 20) return 'alta';
    if (pasajerosEnRiesgo > 10) return 'media';
    return 'baja';
  }

  private generarRecomendacionesCompetencia(
    sobreposiciones: SobreposicionLinea[],
    conflictos: ConflictoHorario[]
  ) {
    const recomendaciones: RecomendacionCompetencia[] = [];

    // Priorizar conflictos críticos de horario (Adelantos)
    conflictos
      .filter(c => c.prioridad === 'critica' || c.prioridad === 'alta')
      .forEach(conflicto => {
        if (conflicto.tipo === 'adelanto-competencia') {
          const [h, m] = conflicto.horarioCompetencia.split(':').map(Number);
          // Sugerir adelanto de 5 min extra respecto a la competencia
          const minDeseado = m - 5;
          const hDeseada = minDeseado < 0 ? h - 1 : h;
          const mDeseada = minDeseado < 0 ? 60 + minDeseado : minDeseado;
          
          const horaSugerida = `${String(hDeseada).padStart(2, '0')}:${String(mDeseada).padStart(2, '0')}`;

          recomendaciones.push({
            id: `rec-intel-${conflicto.id}`,
            tipo: 'adelanto-horario',
            titulo: `Adelanto Estratégico - Bloqueo de Rival`,
            descripcion: `El rival (${conflicto.competidor}) está saliendo a las ${conflicto.horarioCompetencia}, justo antes que tú (${conflicto.horarioUCOT}).`,
            accionSugerida: `Adelantar salida a las ${horaSugerida} para capturar demanda antes que el rival.`,
            impactoEstimado: Math.round(conflicto.pasajerosEnRiesgo * 0.8),
            riesgo: 'bajo',
            probabilidadExito: 85
          });
        }
      });

    // Recomendación de ruta si hay mucha sobreposición
    sobreposiciones
      .filter(s => s.porcentajeSobreposicion > 80)
      .forEach(s => {
        recomendaciones.push({
          id: `rec-route-${s.id}`,
          tipo: 'cambio-ruta',
          titulo: 'Diversificación de Mercado',
          descripcion: `La línea tiene un ${Math.round(s.porcentajeSobreposicion)}% de coincidencia con ${s.competidor} (Línea ${s.numeroLineaCompetencia}).`,
          accionSugerida: 'Evaluar desvío por calles paralelas con demanda insatisfecha.',
          impactoEstimado: 25,
          riesgo: 'alto',
          probabilidadExito: 40
        });
      });

    return recomendaciones;
  }

  private determinarGradoCompetencia(
    cantidadSobreposiciones: number
  ): 'alto' | 'medio' | 'bajo' {
    if (cantidadSobreposiciones >= 4) return 'alto';
    if (cantidadSobreposiciones >= 2) return 'medio';
    return 'bajo';
  }
}

export const competitionService = new CompetitionService();
