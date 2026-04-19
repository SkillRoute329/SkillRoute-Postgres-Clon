/**
 * Tipos para Pronósticos y Análisis (Semana 6-7)
 * Interfaces utilizadas por useForecastData.ts y componentes de predicción.
 */

/** Pronóstico de ingresos para una línea */
export interface PronosticoIngreso {
  lineaId: string;
  periodo: string;
  ingresoActual: number;
  ingresoProyectado: number;
  variacion: number;
  confianza: number;
  factores: FactorPronostico[];
  escenarios: EscenarioPronostico[];
}

/** Factor que influye en el pronóstico */
export interface FactorPronostico {
  nombre: string;
  impacto: number;
  tipo: 'positivo' | 'negativo' | 'neutro';
  descripcion: string;
}

/** Escenario de pronóstico (optimista/pesimista) */
export interface EscenarioPronostico {
  tipo: 'optimista' | 'base' | 'pesimista';
  ingreso: number;
  probabilidad: number;
  supuestos: string[];
}

/** Resultado de simulación de cambio de horario */
export interface SimulacionResultado {
  lineaId: string;
  cambiosAplicados: CambioHorario[];
  impactoIngresos: number;
  impactoPasajeros: number;
  analisis: string;
  riesgo: 'alto' | 'medio' | 'bajo';
  recomendacion: string;
}

/** Cambio de horario propuesto para simulación */
export interface CambioHorario {
  horarioActual: string;
  horarioNuevo: string;
  tipoServicio: string;
  motivo?: string;
}

/** Horario pico identificado */
export interface HorarioPico {
  hora: string;
  demanda: number;
  capacidadActual: number;
  deficit: number;
  recomendacion: string;
}

/** Proyección de crecimiento */
export interface ProyeccionCrecimiento {
  mes: string;
  pasajerosEstimados: number;
  ingresosEstimados: number;
  tendencia: 'creciente' | 'estable' | 'decreciente';
  confianza: number;
}

/** Benchmark comparativo entre líneas */
export interface BenchmarkLinea {
  lineaId: string;
  ingresoPorKm: number;
  pasajerosPorViaje: number;
  ocupacionPromedio: number;
  posicionEnRanking: number;
  totalLineas: number;
}
