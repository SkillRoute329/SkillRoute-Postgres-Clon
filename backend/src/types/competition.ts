// Tipos para análisis de competencia - Semana 4

export interface Competidor {
  id: string;
  nombre: string; // 'Cutcsa', 'COME', 'COETC', 'Raincoop', 'UCOT'
  color?: string; // para mapas
  lineas: LineaCompetencia[];
  ultimaActualizacion: Date;
  createdAt: Date;
}

export interface LineaCompetencia {
  id: string;
  numeroLinea: number;
  operador: string;
  recorrido: Parada[]; // paradas en orden
  horarios: Horario[];
  frecuencia: number; // minutos entre salidas
  historico: CambioHistorico[];
  activa: boolean;
}

export interface Parada {
  id: string;
  nombre: string;
  latitude: number;
  longitude: number;
  orden: number;
  tiempoLlegada?: number; // segundos desde salida
}

export interface Horario {
  id: string;
  horaInicio: string; // "06:00"
  horaFin: string; // "23:00"
  diasSemana: number[]; // 0-6 (lunes a domingo)
  frecuenciaMinutos: number;
}

export interface CambioHistorico {
  id: string;
  fecha: Date;
  tipo: 'horario-adelantado' | 'horario-atrasado' | 'linea-cancelada' | 'linea-nueva' | 'frecuencia-cambio';
  detalles: string;
  horarioAnterior?: Horario;
  horarioNuevo?: Horario;
  impacto: 'alto' | 'medio' | 'bajo';
  detectadoPor: string; // 'monitoreo-manual' | 'datos-publicos'
}

export interface SobreposicionLinea {
  id: string;
  lineaUCOT: string;
  numeroLineaUCOT: number;
  lineaCompetencia: string;
  numeroLineaCompetencia: number;
  competidor: string;
  porcentajeSobreposicion: number; // 0-100
  distanciaPromedio: number; // metros
  pasajerosEnRiesgo: number; // estimado basado en datos históricos
  nivelesRiesgo: 'critico' | 'alto' | 'medio' | 'bajo';
  conflictosHorarios: ConflictoHorario[];
}

export interface ConflictoHorario {
  id: string;
  lineaUCOT: string;
  lineaCompetencia: string;
  competidor: string;
  horarioUCOT: string; // "06:00"
  horarioCompetencia: string; // "05:45"
  diferenciaminutos: number;
  tipo: 'adelanto-competencia' | 'adelanto-ucot' | 'simultaneo';
  pasajerosEnRiesgo: number;
  frecuencia: 'diaria' | 'semanal' | 'puntual';
  prioridad: 'critica' | 'alta' | 'media' | 'baja';
}

export interface AnalisisCompetitividadLinea {
  lineaId: string;
  numeroLinea: number;
  competidoresPresentes: Competidor[];
  gradoCompetencia: 'alto' | 'medio' | 'bajo';
  sobreposiciones: SobreposicionLinea[];
  conflictosActivos: ConflictoHorario[];
  pasajerosEnRiesgoTotal: number;
  recomendaciones: RecomendacionCompetencia[];
}

export interface RecomendacionCompetencia {
  id: string;
  tipo: 'adelanto-horario' | 'retraso-horario' | 'aumento-frecuencia' | 'cambio-ruta' | 'cancelacion';
  titulo: string;
  descripcion: string;
  accionSugerida: string;
  impactoEstimado: number; // pasajeros ganados/perdidos
  riesgo: 'bajo' | 'medio' | 'alto';
  probabilidadExito: number; // 0-100
}

export interface ReporteCompetencia {
  periodo: {
    inicio: Date;
    fin: Date;
  };
  totalLineasUCOT: number;
  lineasConCompetencia: number;
  competidoresActivos: string[];
  cambiosDetectados: CambioHistorico[];
  sobreposicionesTop: SobreposicionLinea[];
  conflictosActivos: ConflictoHorario[];
  pasajerosEnRiesgo: number;
  recomendacionesUrgentes: RecomendacionCompetencia[];
}

export interface DatosSTMPublicos {
  fecha: Date;
  numeroLinea: number;
  operador: string;
  boletesVendidos: number;
  pasajeros: number;
  ingresos: number;
  horaInicio?: string;
  horaFin?: string;
}

export interface ComparacionOperador {
  lineaId: string;
  numeroLinea: number;
  promedioBoletos: number; // en la zona
  boletosUCOT: number;
  diferenciaVsPromedio: number; // % mejor o peor
  clasificacion: 'arriba-promedio' | 'promedio' | 'debajo-promedio';
  tendencia: 'mejorando' | 'estable' | 'empeorando';
}

export interface CuotaMercado {
  lineaId: string;
  numeroLinea: number;
  operador: string;
  boletosOperador: number;
  boletosTotal: number;
  cuotaPorcentaje: number;
  posicion: number; // 1=primero (mayor cuota)
}
