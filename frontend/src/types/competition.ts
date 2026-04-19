/**
 * Tipos para Inteligencia Competitiva (Semana 4)
 * Interfaces utilizadas por useCompetitionData.ts y componentes de competencia.
 */

/** Sobreposición de línea con un competidor */
export interface SobreposicionLinea {
  lineaId: string;
  competidor: string;
  tramos: TramoSobreposicion[];
  porcentajeSobreposicion: number;
  pasajerosEnRiesgo: number;
  nivelesRiesgo: 'critico' | 'alto' | 'medio' | 'bajo';
  zonaAfectada: string;
}

/** Tramo individual de sobreposición */
export interface TramoSobreposicion {
  inicio: string;
  fin: string;
  longitud: number;
  pasajerosEstimados: number;
}

/** Conflicto de horario con competencia */
export interface ConflictoHorario {
  id: string;
  lineaId: string;
  competidor: string;
  horaInicio: string;
  horaFin: string;
  tipo: 'solapamiento' | 'canibalización' | 'hueco';
  prioridad: 'critica' | 'alta' | 'media' | 'baja';
  impactoEstimado: number;
  descripcion: string;
  recomendacion?: string;
}

/** Análisis de competitividad para una línea */
export interface AnalisisCompetitividadLinea {
  lineaId: string;
  scoreCompetitivo: number;
  posicionRelativa: number;
  competidoresDirectos: CompetidorDirecto[];
  fortalezas: string[];
  debilidades: string[];
  oportunidades: string[];
  amenazas: string[];
  recomendaciones: RecomendacionCompetitiva[];
}

/** Competidor directo */
export interface CompetidorDirecto {
  nombre: string;
  lineas: string[];
  cuotaMercado: number;
  tendencia: 'creciente' | 'estable' | 'decreciente';
}

/** Recomendación competitiva */
export interface RecomendacionCompetitiva {
  tipo: string;
  descripcion: string;
  impactoEsperado: number;
  urgencia: 'alta' | 'media' | 'baja';
  riesgo: 'alto' | 'medio' | 'bajo';
}
