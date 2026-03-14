// Tipos para Dashboard Ejecutivo - Semana 8-9

export interface KPIPrincipal {
  nombre: string;
  valor: number;
  unidad: string;
  cambioVsAnterior: number; // %
  tendencia: 'creciente' | 'estable' | 'decreciente';
  objetivo: number;
  porcentajeAlcanzado: number; // % del objetivo
  alerta: boolean;
  color: 'green' | 'blue' | 'yellow' | 'red';
}

export interface DashboardMetricas {
  periodo: {
    inicio: Date;
    fin: Date;
  };
  operador: string;

  // KPIs principales
  ingresosTotales: KPIPrincipal;
  pasajerosTotales: KPIPrincipal;
  lineasActivas: KPIPrincipal;
  ocupacionPromedio: KPIPrincipal;
  cumplimientoHorario: KPIPrincipal;

  // Análisis
  lineasEnRiesgo: number;
  cartonesMarginales: number;
  conflictosCompetencia: number;
}

export interface EstadoLinea {
  lineaId: string;
  numeroLinea: number;
  estado: 'operativa' | 'marginal' | 'riesgo' | 'critica';
  ingresos: number;
  pasajeros: number;
  cumplimiento: number; // %
  ocupacion: number; // %
  competencia: string[];
  alertas: AlertaLinea[];
  recomendacion: string;
}

export interface AlertaLinea {
  tipo: 'competencia' | 'ingresos' | 'ocupacion' | 'cumplimiento' | 'marginal';
  severidad: 'critica' | 'alta' | 'media' | 'baja';
  mensaje: string;
  accion_recomendada: string;
}

export interface RecomendacionEjecutiva {
  id: string;
  titulo: string;
  descripcion: string;
  impacto: number; // pesos/mes
  urgencia: 'critica' | 'alta' | 'media' | 'baja';
  accion_sugerida: string;
  lineasAfectadas: number[];
  probabilidadExito: number; // 0-100
  tiempoImplementacion: string; // "1 día", "1 semana", etc.
}

export interface ResumenCompetitivo {
  amenazasActivas: number;
  oportunidadesIdentificadas: number;
  cambiosCompetenciaUltimaSemana: number;
  competidorMasPeligroso: string;
  lineasMasCompetidas: number[];
  recomendacionesDefensivas: string[];
}

export interface ProyeccionIngresos {
  periodo: string; // "Este mes", "Próximo mes", etc.
  ingresosProyectados: number;
  ingresosActuales: number;
  cambioEsperado: number; // %
  confianza: number; // 0-100
  principales_drivers: string[]; // "Línea 3 adelanto", "Aumento demanda", etc.
}

export interface SaludOperacional {
  porcentajeLineasOperativas: number;
  porcentajeLineasEnRiesgo: number;
  porcentajeCartonesNoViables: number;
  indiceGeneral: number; // 0-100 (salud general)
  estado: 'excelente' | 'bueno' | 'regular' | 'critico';
  recomendacion_urgente?: string;
}

export interface DashboardEjecutivo {
  id: string;
  operador: string;
  fecha: Date;

  // Resumen general
  salud_operacional: SaludOperacional;

  // KPIs
  metricas: DashboardMetricas;

  // Estado de líneas
  lineas: EstadoLinea[];

  // Competencia
  resumen_competitivo: ResumenCompetitivo;

  // Proyecciones
  proyecciones: ProyeccionIngresos[];

  // Recomendaciones
  recomendaciones: RecomendacionEjecutiva[];

  // Alertas críticas
  alertas_criticas: AlertaLinea[];

  // Resumen ejecutivo
  resumen_texto: string;
}

export interface TendenciaGrafico {
  fecha: Date;
  ingresos: number;
  pasajeros: number;
  ocupacion: number;
  cumplimiento: number;
}

export interface ComparativaZonas {
  zona: string;
  lineas_operador: number;
  ingresos: number;
  ocupacion_promedio: number;
  competencia_presente: boolean;
}

export interface ScoreOperacional {
  linea_id: string;
  numero_linea: number;
  score_ingresos: number; // 0-100
  score_ocupacion: number; // 0-100
  score_cumplimiento: number; // 0-100
  score_competitivo: number; // 0-100
  score_general: number; // promedio
  ranking_operador: number; // posición entre líneas propias
}

export interface IndicadorSalud {
  nombre: string;
  valor: number;
  minimo: number;
  optimo: number;
  maximo: number;
  estado: 'bueno' | 'alerta' | 'critico';
}
