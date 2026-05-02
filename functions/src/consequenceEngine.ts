/**
 * Motor de Consecuencias — SkillRoute
 * ====================================
 * Grafo de dependencias operativas para empresas de transporte.
 * Cada evento dispara efectos en cascada a través de los dominios:
 * RRHH, Nómina, Operaciones, OTP, Subsidio, Finanzas, Disciplina.
 *
 * Diseño:
 *  - El motor es genérico: trabaja con cualquier empresa.
 *  - Las reglas son inyectables: cada empresa implementa CompanyRules.
 *  - La simulación no escribe datos reales (es un "¿qué pasa si...?").
 */

// ── Tipos de eventos operativos ───────────────────────────────────────────────

export type EventoConductorAusente = {
  tipo: 'CONDUCTOR_AUSENTE';
  empresaId: string;
  conductorId: string;
  conductorNombre: string;
  fecha: string; // ISO YYYY-MM-DD
  codigoAusencia: 'licencia_medica' | 'licencia_gremial' | 'ausencia_justificada' | 'ausencia_injustificada' | 'accidente_trabajo';
  turnoId?: string;
  lineaId?: string;
};

export type EventoConductorAsignado = {
  tipo: 'CONDUCTOR_ASIGNADO';
  empresaId: string;
  conductorId: string;
  conductorNombre: string;
  turnoId: string;
  lineaId: string;
  cocheId: string;
  fecha: string;
  horaInicio: number; // 0-23
  duracionHoras: number;
  esTurnoPartido: boolean;
  tipoDia: 'habil' | 'sabado' | 'domingo' | 'feriado';
  kmEsperados: number;
  aniosAntiguedad: number;
};

export type EventoVehiculoFueraDeServicio = {
  tipo: 'VEHICULO_FUERA_DE_SERVICIO';
  empresaId: string;
  cocheId: string;
  cocheNumero: string;
  motivo: 'averia' | 'mantenimiento_preventivo' | 'accidente' | 'inspeccion_tecnica';
  lineaId?: string;
  turnoAfectadoId?: string;
  conductorAfectadoId?: string;
  horasEstimadas: number;
};

export type EventoViajeTardio = {
  tipo: 'VIAJE_TARDIO';
  empresaId: string;
  viajeId: string;
  lineaId: string;
  conductorId?: string;
  cocheId?: string;
  minutosRetraso: number;
  parada: string;
  causa?: 'trafico' | 'incidente' | 'carga_pasajeros' | 'conductor' | 'vehiculo' | 'desconocida';
};

export type EventoViajeCancelado = {
  tipo: 'VIAJE_CANCELADO';
  empresaId: string;
  viajeId: string;
  lineaId: string;
  conductorId?: string;
  kmPerdidos: number;
  causa: string;
};

export type EventoOperativo =
  | EventoConductorAusente
  | EventoConductorAsignado
  | EventoVehiculoFueraDeServicio
  | EventoViajeTardio
  | EventoViajeCancelado;

// ── Tipos de efectos (consecuencias) ─────────────────────────────────────────

export type DominioEfecto = 'RRHH' | 'NOMINA' | 'OPERACIONES' | 'OTP' | 'SUBSIDIO' | 'FINANZAS' | 'DISCIPLINA';
export type SeveridadEfecto = 'info' | 'advertencia' | 'critico';

export interface EfectoConsecuencia {
  dominio: DominioEfecto;
  severidad: SeveridadEfecto;
  titulo: string;
  descripcion: string;
  /** Variación numérica (negativa = pérdida, positiva = ganancia) */
  delta?: number;
  unidad?: 'UYU' | '%' | 'km' | 'viajes' | 'horas' | 'dias';
  entidadAfectadaId: string;
  entidadAfectadaTipo: 'CONDUCTOR' | 'LINEA' | 'EMPRESA' | 'TURNO' | 'VEHICULO';
  /** Si true, requiere acción humana antes de que se resuelva */
  requiereAccion: boolean;
  accionSugerida?: string;
}

// ── Contexto de consulta (datos del sistema para que las reglas calculen) ─────

export interface ContextoConsecuencia {
  /** Cantidad de ausencias del conductor en los últimos 30 días */
  ausenciasUltimos30Dias: number;
  /** Conductores de reserva disponibles en ese turno */
  reservasDisponibles: Array<{ id: string; nombre: string }>;
  /** Viajes que quedarían sin cubrir si no hay reemplazo */
  viajesAfectados: number;
  /** KPI OTP actual de la línea (0-100) */
  otpActualLinea: number;
  /** Total buses operando en esa línea en ese turno */
  busesEnLinea: number;
  /** Pasajeros promedio por viaje en ese horario */
  pasajerosPromedio: number;
}

// ── Resumen ejecutivo de la cascada ──────────────────────────────────────────

export interface ResumenCascada {
  impactoNomina: number;       // UYU (negativo = costo extra o descuento)
  impactoSubsidio: number;     // UYU (negativo = subsidio perdido)
  deltaOTP: number;            // puntos porcentuales
  viajesEnRiesgo: number;
  kmPerdidos: number;
  severidadGlobal: SeveridadEfecto;
  requiereIntervencionInmediata: boolean;
}

// ── Interfaz de reglas por empresa (inyectable) ───────────────────────────────

export interface ReglasPorEmpresa {
  empresaId: string;
  nombreEmpresa: string;

  alConductorAusente(
    evento: EventoConductorAusente,
    contexto: ContextoConsecuencia
  ): EfectoConsecuencia[];

  alConductorAsignado(
    evento: EventoConductorAsignado,
    contexto: ContextoConsecuencia
  ): EfectoConsecuencia[];

  alVehiculoFueraDeServicio(
    evento: EventoVehiculoFueraDeServicio,
    contexto: ContextoConsecuencia
  ): EfectoConsecuencia[];

  alViajeTardio(
    evento: EventoViajeTardio,
    contexto: ContextoConsecuencia
  ): EfectoConsecuencia[];

  alViajeCancelado(
    evento: EventoViajeCancelado,
    contexto: ContextoConsecuencia
  ): EfectoConsecuencia[];

  /** Calcula el desglose salarial de un turno asignado */
  calcularSalarioTurno(evento: EventoConductorAsignado): {
    base: number;
    adicionales: Record<string, number>;
    total: number;
    moneda: 'UYU';
  };

  /** Calcula subsidio perdido por km no recorridos */
  calcularImpactoSubsidio(kmPerdidos: number, lineaId: string): number;
}

// ── Motor: propaga un evento a través de las reglas ──────────────────────────

export interface ResultadoPropagacion {
  evento: EventoOperativo;
  efectos: EfectoConsecuencia[];
  resumen: ResumenCascada;
  timestamp: string;
}

export function propagarEvento(
  evento: EventoOperativo,
  reglas: ReglasPorEmpresa,
  contexto: ContextoConsecuencia
): ResultadoPropagacion {
  let efectos: EfectoConsecuencia[] = [];

  switch (evento.tipo) {
    case 'CONDUCTOR_AUSENTE':
      efectos = reglas.alConductorAusente(evento, contexto);
      break;
    case 'CONDUCTOR_ASIGNADO':
      efectos = reglas.alConductorAsignado(evento, contexto);
      // Agregar desglose salarial como efectos de NOMINA
      const salario = reglas.calcularSalarioTurno(evento);
      efectos.push({
        dominio: 'NOMINA',
        severidad: 'info',
        titulo: 'Salario calculado para el turno',
        descripcion: `Base: ${fmt(salario.base)} + adicionales: ${fmt(Object.values(salario.adicionales).reduce((a, b) => a + b, 0))}`,
        delta: salario.total,
        unidad: 'UYU',
        entidadAfectadaId: evento.conductorId,
        entidadAfectadaTipo: 'CONDUCTOR',
        requiereAccion: false,
      });
      break;
    case 'VEHICULO_FUERA_DE_SERVICIO':
      efectos = reglas.alVehiculoFueraDeServicio(evento, contexto);
      break;
    case 'VIAJE_TARDIO':
      efectos = reglas.alViajeTardio(evento, contexto);
      break;
    case 'VIAJE_CANCELADO':
      efectos = reglas.alViajeCancelado(evento, contexto);
      break;
  }

  const resumen = calcularResumen(efectos, reglas, evento, contexto);

  return {
    evento,
    efectos,
    resumen,
    timestamp: new Date().toISOString(),
  };
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function calcularResumen(
  efectos: EfectoConsecuencia[],
  reglas: ReglasPorEmpresa,
  evento: EventoOperativo,
  contexto: ContextoConsecuencia
): ResumenCascada {
  const nomina = efectos
    .filter((e) => e.dominio === 'NOMINA' && e.delta !== undefined)
    .reduce((acc, e) => acc + (e.delta ?? 0), 0);

  const subsidio = efectos
    .filter((e) => e.dominio === 'SUBSIDIO' && e.delta !== undefined)
    .reduce((acc, e) => acc + (e.delta ?? 0), 0);

  const otpEfectos = efectos.filter((e) => e.dominio === 'OTP' && e.unidad === '%');
  const deltaOTP = otpEfectos.reduce((acc, e) => acc + (e.delta ?? 0), 0);

  const viajesEnRiesgo = efectos
    .filter((e) => e.unidad === 'viajes' && (e.delta ?? 0) < 0)
    .reduce((acc, e) => acc + Math.abs(e.delta ?? 0), 0);

  const kmPerdidos = efectos
    .filter((e) => e.unidad === 'km' && (e.delta ?? 0) < 0)
    .reduce((acc, e) => acc + Math.abs(e.delta ?? 0), 0);

  const hayCritico = efectos.some((e) => e.severidad === 'critico');
  const hayAdvertencia = efectos.some((e) => e.severidad === 'advertencia');
  const severidadGlobal: SeveridadEfecto = hayCritico
    ? 'critico'
    : hayAdvertencia
    ? 'advertencia'
    : 'info';

  const requiereIntervencion = efectos.some((e) => e.requiereAccion && e.severidad === 'critico');

  return {
    impactoNomina: nomina,
    impactoSubsidio: subsidio,
    deltaOTP,
    viajesEnRiesgo,
    kmPerdidos,
    severidadGlobal,
    requiereIntervencionInmediata: requiereIntervencion,
  };
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('es-UY')}`;
}
