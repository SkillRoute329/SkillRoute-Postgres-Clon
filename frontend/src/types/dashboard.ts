/**
 * Tipos para Dashboard Ejecutivo (Semana 8-9)
 * TypeScript interfaces para type-safe data handling
 */

// KPI Principal
export interface KPIPrincipal {
  nombre: string;
  valor: number;
  unidad: string;
  cambioVsAnterior: number;
  tendencia: 'creciente' | 'estable' | 'decreciente';
  objetivo?: number;
  porcentajeAlcanzado: number;
  alerta: boolean;
  color: 'green' | 'blue' | 'red' | 'yellow';
}

// Métricas del Dashboard
export interface DashboardMetricas {
  periodo: {
    inicio: Date;
    fin: Date;
  };
  operador: string;
  ingresosTotales: KPIPrincipal;
  pasajerosTotales: KPIPrincipal;
  lineasActivas: KPIPrincipal;
  ocupacionPromedio: KPIPrincipal;
  cumplimientoHorario: KPIPrincipal;
  lineasEnRiesgo?: number;
  cartonesMarginales?: number;
  conflictosCompetencia?: number;
}

// Alerta de Línea
export interface AlertaLinea {
  tipo: string;
  severidad: 'critica' | 'alta' | 'media' | 'baja';
  mensaje: string;
  accion_recomendada: string;
}

// Estado de Línea
export interface EstadoLinea {
  lineaId: string;
  numeroLinea: number;
  estado: 'operativa' | 'marginal' | 'riesgo' | 'critica';
  ingresos: number;
  pasajeros: number;
  cumplimiento: number;
  ocupacion: number;
  competencia?: string[];
  alertas?: AlertaLinea[];
  recomendacion: string;
}

// Recomendación Ejecutiva
export interface RecomendacionEjecutiva {
  id: string;
  titulo: string;
  descripcion: string;
  impacto: number;
  urgencia: 'alta' | 'media' | 'baja';
  accion_sugerida: string;
  lineasAfectadas?: number[];
  probabilidadExito: number;
  tiempoImplementacion: string;
}

// Salud Operacional
export interface SaludOperacional {
  porcentajeLineasOperativas: number;
  porcentajeLineasEnRiesgo: number;
  porcentajeCartonesNoViables: number;
  indiceGeneral: number;
  estado: 'excelente' | 'bueno' | 'regular' | 'critico';
  recomendacion_urgente?: string;
}

// Proyección de Ingresos
export interface ProyeccionIngresos {
  periodo: string;
  ingresosProyectados: number;
  ingresosActuales?: number;
  cambioEsperado: number;
  confianza: number;
  principales_drivers?: string[];
}

// Resumen Competitivo
export interface ResumenCompetitivo {
  amenazasActivas: number;
  oportunidadesIdentificadas: number;
  cambiosCompetenciaUltimaSemana: number;
  competidorMasPeligroso: string;
  lineasMasCompetidas: string[];
  recomendacionesDefensivas?: string[];
}

// Tendencia para gráficos
export type TendenciaGrafico = 'creciente' | 'estable' | 'decreciente';

// Score operacional
export type ScoreOperacional = 'excelente' | 'bueno' | 'regular' | 'critico';

// Dashboard Ejecutivo Completo
export interface DashboardEjecutivo {
  id: string;
  operador: string;
  fecha: Date;
  salud_operacional: SaludOperacional;
  metricas: DashboardMetricas;
  lineas: EstadoLinea[];
  resumen_competitivo: ResumenCompetitivo;
  proyecciones: ProyeccionIngresos[];
  recomendaciones: RecomendacionEjecutiva[];
  alertas_criticas: AlertaLinea[];
  resumen_texto: string;
}
