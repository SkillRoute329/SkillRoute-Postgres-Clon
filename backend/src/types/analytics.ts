// Tipos para análisis de ingresos y viabilidad de cartones - Semana 5

export interface Carton {
  id: string;
  lineaId: string;
  numeroLinea: number;
  operador: string;
  horarioInicio: string; // "06:00"
  horarioFin: string; // "22:00"
  diasSemana: number[]; // 0-6 (lunes a domingo)
  viajesPorDia: number;
  rutaId: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartoonViabilidad {
  id: string;
  cartoonId: string;
  lineaId: string;
  numeroLinea: number;
  horarioInicio: string;
  horarioFin: string;
  viajesPorDia: number;

  // Ingresos
  pasajerosEstimados: number; // por día
  ingresosEstimados: number; // pesos/día
  ingresosEstimadosMes: number; // pesos/mes

  // Costos
  costosEstimados: number; // pesos/día (combustible, conductor, mantenimiento)
  costosEstimadosMes: number; // pesos/mes

  // Rentabilidad
  margenEstimado: number; // pesos/día
  margenEstimadoMes: number; // pesos/mes
  porcentajeMargen: number; // % de margen

  // Viabilidad
  esViable: boolean;
  puntajeViabilidad: number; // 0-100
  nivelViabilidad: 'muy-viable' | 'viable' | 'marginal' | 'no-viable';

  // Alertas
  alertas: AlertaCartoon[];

  // Análisis
  factoresRiesgo: FactorRiesgo[];
  recomendaciones: RecomendacionCartoon[];

  calculadoEn: Date;
}

export interface AlertaCartoon {
  id: string;
  tipo: 'marginal' | 'no-viable' | 'competencia-cercana' | 'baja-ocupacion' | 'costo-alto';
  titulo: string;
  mensaje: string;
  severidad: 'critica' | 'alta' | 'media' | 'baja';
  impacto: number; // pesos/día en riesgo
  recomendacion: string;
}

export interface FactorRiesgo {
  nombre: string;
  descripcion: string;
  impacto: 'alto' | 'medio' | 'bajo';
  valorActual: number;
  valorOptimo: number;
  brecha: number;
}

export interface RecomendacionCartoon {
  id: string;
  tipo: 'ajuste-horario' | 'aumento-frecuencia' | 'cancelacion' | 'fusionar' | 'expansion';
  titulo: string;
  descripcion: string;
  accion: string;
  impactoEstimado: number; // pesos/mes mejora
  probabilidadExito: number; // 0-100
  complejidad: 'baja' | 'media' | 'alta';
}

export interface PronosticoIngreso {
  id: string;
  lineaId: string;
  numeroLinea: number;

  // Escenario actual
  pasajerosActuales: number;
  ingresosActuales: number;

  // Escenarios simulados
  escenarios: {
    nombre: string; // 'Actual', 'Adelanto 15min', 'Aumento frecuencia', etc.
    pasajerosProyectados: number;
    ingresosProyectados: number;
    cambioVsActual: number; // % cambio
    impacto: number; // pesos/mes
    confianza: number; // 0-100
  }[];

  // Datos históricos
  historicoUltimos30Dias: RegistroBoletaje[];
  tendencia: 'creciente' | 'estable' | 'decreciente';

  analisisEn: Date;
}

export interface RegistroBoletaje {
  fecha: Date;
  lineaId: string;
  operador: string;
  boletosVendidos: number;
  ingresos: number;
  pasajeros: number;
  ocupacionPromedio: number; // %
  horaInicio?: string;
  horaFin?: string;
}

export interface DatosLinea {
  lineaId: string;
  numeroLinea: number;
  operador: string;

  // Período
  periodo: {
    inicio: Date;
    fin: Date;
  };

  // Datos históricos
  boletesTotalVendidos: number;
  ingresosTotal: number;
  pasajerosTotalTransportados: number;

  // Promedios
  boletosPorDia: number;
  ingresosPorDia: number;
  pasajerosPorDia: number;

  // Variabilidad
  desviacionEstandar: number;
  coeficienteVariacion: number; // CV = desv / media

  // Horarios
  boletajePorHora: { hora: string; boletos: number }[];

  // Tendencia
  crecimientoMensual: number; // %
  tendencia: 'creciente' | 'estable' | 'decreciente';
}

export interface PatronTemporal {
  tipo: 'diario' | 'semanal' | 'mensual';
  periodo: string; // "lunes", "julio", "mañana"
  boletosPromedio: number;
  desviacion: number;
  horasPico: string[]; // ["07:00", "08:00", "18:00"]
  horasValles: string[]; // ["23:00", "24:00"]
}

export interface PromediosPasajeros {
  diario: number;
  por_hora: { hora: string; promedio: number }[];
  por_dia_semana: { dia: string; promedio: number }[];
  por_zona: { zona: string; promedio: number }[];
}

export interface DemandaZona {
  zona: string;
  boletajeTotalMes: number;
  boletosPorDia: number;
  lineasOperando: number;
  competenciaPresente: boolean;
  tendencia: 'creciente' | 'estable' | 'decreciente';
}

export interface ProyeccionCrecimiento {
  lineaId: string;
  mesesProjectados: number;
  proyecciones: {
    mes: number;
    fecha: Date;
    boletosProyectados: number;
    ingresoProyectado: number;
  }[];
  tasaCrecimientoMensual: number; // %
  confianza: number; // 0-100
}

export interface Oportunidad {
  id: string;
  tipo: 'nueva-linea' | 'expansion-horarios' | 'cambio-ruta' | 'aumento-frecuencia' | 'respuesta-competencia';
  titulo: string;
  descripcion: string;
  zona: string;
  demandaEstimada: number; // pasajeros/día
  ingresosPotenciales: number; // pesos/mes
  costoImplementacion: number; // pesos

  periodoRecuperacion: number; // meses
  probabilidadExito: number; // 0-100
  recomendacion: string;
}

export interface LineaEnRiesgo {
  lineaId: string;
  numeroLinea: number;
  caida: number; // % caída vs mes anterior
  causaProbable: string;
  pasajerosEnRiesgo: number;
  ingresoEnRiesgo: number; // pesos/mes
  recomendacionesUrgentes: string[];
}

export interface SimulacionResultado {
  id: string;
  lineaId: string;
  cambios: CambioHorario[];
  resultados: {
    escenarioActual: {
      pasajeros: number;
      ingresos: number;
    };
    escenarioNuevo: {
      pasajeros: number;
      ingresos: number;
      cambioAbsoluto: number; // pesos
      cambioRelativo: number; // %
    };
    impactoTotal: number; // pesos/mes
  };
  riesgo: 'bajo' | 'medio' | 'alto';
  recomendacion: string;
}

export interface CambioHorario {
  horarioActual: string;
  horarioNuevo: string;
  razon: string;
}

export interface ComparacionOperador {
  lineaId: string;
  numeroLinea: number;
  operadorUCOT: {
    boletosPorDia: number;
    ingresosPorDia: number;
  };
  promedioZona: {
    boletosPorDia: number;
    ingresosPorDia: number;
  };
  diferenciaVsPromedio: number; // % mejor o peor
  posicion: number; // 1=mejor en zona
  clasificacion: 'arriba-promedio' | 'promedio' | 'debajo-promedio';
  tendencia: 'mejorando' | 'estable' | 'empeorando';
  recomendaciones: string[];
}

export interface BenchmarkZona {
  zona: string;
  lineas: {
    numeroLinea: number;
    operador: string;
    boletosPorDia: number;
    ranking: number;
  }[];
  promedioZona: number;
  mejorOperador: string;
  peorOperador: string;
}

export interface CuotaMercado {
  lineaId: string;
  numeroLinea: number;
  operador: string;
  boletosOperador: number;
  boletosTotal: number;
  cuotaPorcentaje: number;
  posicion: number; // 1=primero
  tendencia: 'creciendo' | 'estable' | 'cayendo';
  cambioMesAnterior: number; // % cambio
}
