/**
 * Reglas operativas — UCOT (empresa 70)
 * =======================================
 * Estructura salarial: Consejo de Salarios Grupo 12 (Transporte Terrestre)
 * Modelo laboral: cooperativa — conductores son "socios" con participación en excedentes
 *
 * ⚠️  TODO_UCOT: campos marcados con este tag deben confirmarse con datos reales de UCOT
 *     antes de usar en producción. Los valores actuales son estimaciones de referencia
 *     basadas en convenios colectivos del sector (Grupo 12, 2024-2025).
 */

import type {
  ReglasPorEmpresa,
  EventoConductorAusente,
  EventoConductorAsignado,
  EventoVehiculoFueraDeServicio,
  EventoViajeTardio,
  EventoViajeCancelado,
  EfectoConsecuencia,
  ContextoConsecuencia,
} from '../consequenceEngine';

// ── Parámetros configurables UCOT ─────────────────────────────────────────────

const UCOT_PARAMS = {
  // TODO_UCOT: confirmar con planilla salarial real
  salarioBaseHora: 210,          // UYU/hora — base Grupo 12, 2025
  adicionalTurnoPartido: 1200,   // UYU fijo por turno partido
  adicionalNocturno: 0.35,       // % sobre base por hora nocturna (inicio <6h o >22h)
  adicionalSabado: 0.50,         // % sobre base por día sábado
  adicionalDomingoFeriado: 1.00, // % sobre base por domingo/feriado
  adicionalGuardia: 800,         // UYU fijo al conductor de reserva llamado fuera de turno
  porcentajeAntiguedadAnual: 0.02, // 2% de incremento por año de antigüedad (TODO_UCOT)

  // TODO_UCOT: confirmar fórmula exacta del contrato STM vigente
  subsidioPorKm: 28,             // UYU/km operado — referencia STM 2024

  // OTP: umbral de penalidad según contrato STM
  // TODO_UCOT: confirmar ventana real del contrato
  umbralOTPPenalidad: 85,        // % mínimo de OTP antes de penalidad
  penalPorPuntoPorcentual: 0.005, // % de subsidio mensual que se pierde por cada punto de OTP bajo umbral

  // Regla disciplinaria: N ausencias injustificadas en X días → alerta
  ausenciasParaAlertaDisciplinaria: 3,
  ventanaAusenciasDias: 30,

  // Capacidad promedio por coche para cálculo de pasajeros afectados
  // TODO_UCOT: ajustar por tipo de coche real
  capacidadPromedioCoche: 80,
};

// ── Helpers internos ──────────────────────────────────────────────────────────

function fmtUYU(n: number): string {
  return `$${Math.round(Math.abs(n)).toLocaleString('es-UY')} UYU`;
}

function signo(n: number): string {
  return n >= 0 ? `+${fmtUYU(n)}` : `-${fmtUYU(n)}`;
}

// ── Implementación de reglas UCOT ─────────────────────────────────────────────

export const ucotReglas: ReglasPorEmpresa = {
  empresaId: '70',
  nombreEmpresa: 'UCOT',

  // ── 1. Conductor ausente ────────────────────────────────────────────────────

  alConductorAusente(evento: EventoConductorAusente, ctx: ContextoConsecuencia): EfectoConsecuencia[] {
    const efectos: EfectoConsecuencia[] = [];

    // ── RRHH: registro de ausencia ──────────────────────────────────────────
    const esInjustificada = evento.codigoAusencia === 'ausencia_injustificada';
    const nuevasAusencias = ctx.ausenciasUltimos30Dias + 1;
    const superaUmbral = nuevasAusencias >= UCOT_PARAMS.ausenciasParaAlertaDisciplinaria;

    efectos.push({
      dominio: 'RRHH',
      severidad: superaUmbral ? 'critico' : esInjustificada ? 'advertencia' : 'info',
      titulo: `Ausencia registrada — ${evento.conductorNombre}`,
      descripcion: `Código: ${labelAusencia(evento.codigoAusencia)}. Ausencias en 30 días: ${nuevasAusencias}/${UCOT_PARAMS.ausenciasParaAlertaDisciplinaria}. ${superaUmbral ? '⚠️  UMBRAL DISCIPLINARIO ALCANZADO.' : ''}`,
      entidadAfectadaId: evento.conductorId,
      entidadAfectadaTipo: 'CONDUCTOR',
      requiereAccion: superaUmbral,
      accionSugerida: superaUmbral ? 'Iniciar proceso disciplinario según Reglamento Interno UCOT' : undefined,
    });

    // ── NOMINA: descuento si ausencia injustificada ─────────────────────────
    if (esInjustificada) {
      const descuento = -(UCOT_PARAMS.salarioBaseHora * 8); // jornal completo
      efectos.push({
        dominio: 'NOMINA',
        severidad: 'advertencia',
        titulo: 'Descuento por ausencia injustificada',
        descripcion: `Descuento de jornal completo (~8h). El socio no recibe el día.`,
        delta: descuento,
        unidad: 'UYU',
        entidadAfectadaId: evento.conductorId,
        entidadAfectadaTipo: 'CONDUCTOR',
        requiereAccion: false,
      });
    }

    // ── OPERACIONES: búsqueda de reemplazo ─────────────────────────────────
    const hayReserva = ctx.reservasDisponibles.length > 0;
    const reserva = ctx.reservasDisponibles[0];

    efectos.push({
      dominio: 'OPERACIONES',
      severidad: hayReserva ? 'info' : 'critico',
      titulo: hayReserva ? `Reserva disponible: ${reserva?.nombre}` : 'SIN RESERVA DISPONIBLE',
      descripcion: hayReserva
        ? `El socio ${reserva?.nombre} puede cubrir el turno. Adicional de guardia: ${fmtUYU(UCOT_PARAMS.adicionalGuardia)}.`
        : `No hay socios de reserva disponibles. ${ctx.viajesAfectados} viajes quedarán sin conductor.`,
      entidadAfectadaId: evento.turnoId ?? evento.lineaId ?? evento.conductorId,
      entidadAfectadaTipo: 'TURNO',
      requiereAccion: !hayReserva,
      accionSugerida: !hayReserva ? 'Contactar socios francos cercanos al depósito. Notificar a STM si el servicio se cancela.' : undefined,
    });

    // Si hay reserva: costo adicional de guardia
    if (hayReserva) {
      efectos.push({
        dominio: 'NOMINA',
        severidad: 'info',
        titulo: `Adicional de guardia — ${reserva?.nombre}`,
        descripcion: `El socio de reserva recibe adicional por guardia sobre su turno.`,
        delta: UCOT_PARAMS.adicionalGuardia,
        unidad: 'UYU',
        entidadAfectadaId: reserva?.id ?? '',
        entidadAfectadaTipo: 'CONDUCTOR',
        requiereAccion: false,
      });
    }

    // Si NO hay reserva: cascada completa de consecuencias
    if (!hayReserva) {
      // OTP impactado
      const impactoOTP = calcularImpactoOTP(ctx.viajesAfectados, ctx.busesEnLinea);
      efectos.push({
        dominio: 'OTP',
        severidad: 'critico',
        titulo: `OTP de la línea degradado`,
        descripcion: `${ctx.viajesAfectados} viajes no ejecutados. OTP actual ${ctx.otpActualLinea.toFixed(1)}% → estimado ${(ctx.otpActualLinea - impactoOTP).toFixed(1)}%`,
        delta: -impactoOTP,
        unidad: '%',
        entidadAfectadaId: evento.lineaId ?? evento.empresaId,
        entidadAfectadaTipo: 'LINEA',
        requiereAccion: ctx.otpActualLinea - impactoOTP < UCOT_PARAMS.umbralOTPPenalidad,
        accionSugerida:
          ctx.otpActualLinea - impactoOTP < UCOT_PARAMS.umbralOTPPenalidad
            ? 'OTP cae bajo umbral STM. Notificar al Jefe de Tráfico y documentar para defensa ante STM.'
            : undefined,
      });

      // Km perdidos y subsidio
      const kmPerdidos = ctx.viajesAfectados * 12; // TODO_UCOT: km promedio por viaje según línea
      const subsidioLost = ucotReglas.calcularImpactoSubsidio(kmPerdidos, evento.lineaId ?? '');
      efectos.push({
        dominio: 'SUBSIDIO',
        severidad: 'advertencia',
        titulo: 'Subsidio STM no devengado',
        descripcion: `${kmPerdidos} km no operados → subsidio no devengado.`,
        delta: -subsidioLost,
        unidad: 'UYU',
        entidadAfectadaId: '70',
        entidadAfectadaTipo: 'EMPRESA',
        requiereAccion: false,
      });

      // Finanzas: ingresos perdidos por pasajeros
      const ingresosPerdidos = ctx.viajesAfectados * ctx.pasajerosPromedio * 45; // UYU 45 = boleto promedio TODO_UCOT
      efectos.push({
        dominio: 'FINANZAS',
        severidad: 'advertencia',
        titulo: 'Ingresos STM Card perdidos',
        descripcion: `~${ctx.viajesAfectados * ctx.pasajerosPromedio} pasajeros sin servicio. Estimado de ingresos perdidos.`,
        delta: -ingresosPerdidos,
        unidad: 'UYU',
        entidadAfectadaId: '70',
        entidadAfectadaTipo: 'EMPRESA',
        requiereAccion: false,
      });

      // Impacto en distribución de excedentes (UCOT es cooperativa)
      efectos.push({
        dominio: 'FINANZAS',
        severidad: 'info',
        titulo: 'Impacto en excedentes cooperativos',
        descripcion: `Los km no operados reducen el excedente del período. El socio ausente contribuyó 0 km a la flota hoy. Afecta el cálculo de distribución anual.`,
        entidadAfectadaId: evento.conductorId,
        entidadAfectadaTipo: 'CONDUCTOR',
        requiereAccion: false,
      });
    }

    // ── DISCIPLINA: historial del socio ─────────────────────────────────────
    if (superaUmbral) {
      efectos.push({
        dominio: 'DISCIPLINA',
        severidad: 'critico',
        titulo: `Alerta disciplinaria — ${evento.conductorNombre}`,
        descripcion: `${nuevasAusencias} ausencias en 30 días supera el umbral de ${UCOT_PARAMS.ausenciasParaAlertaDisciplinaria}. Requiere intervención de RRHH.`,
        entidadAfectadaId: evento.conductorId,
        entidadAfectadaTipo: 'CONDUCTOR',
        requiereAccion: true,
        accionSugerida: 'Convocar al socio a entrevista disciplinaria. Registrar en legajo personal.',
      });
    }

    return efectos;
  },

  // ── 2. Conductor asignado a turno ────────────────────────────────────────────

  alConductorAsignado(evento: EventoConductorAsignado, _ctx: ContextoConsecuencia): EfectoConsecuencia[] {
    const efectos: EfectoConsecuencia[] = [];

    // Confirmar asignación en operaciones
    efectos.push({
      dominio: 'OPERACIONES',
      severidad: 'info',
      titulo: `Turno asignado — ${evento.conductorNombre}`,
      descripcion: `Línea ${evento.lineaId} · Coche ${evento.cocheId} · ${evento.horaInicio}:00 · ${evento.duracionHoras}h${evento.esTurnoPartido ? ' (turno partido)' : ''}`,
      entidadAfectadaId: evento.turnoId,
      entidadAfectadaTipo: 'TURNO',
      requiereAccion: false,
    });

    // Km esperados → subsidio esperado
    const subsidioEsperado = ucotReglas.calcularImpactoSubsidio(evento.kmEsperados, evento.lineaId);
    efectos.push({
      dominio: 'SUBSIDIO',
      severidad: 'info',
      titulo: 'Subsidio STM proyectado',
      descripcion: `${evento.kmEsperados} km proyectados a ${fmtUYU(UCOT_PARAMS.subsidioPorKm)}/km.`,
      delta: subsidioEsperado,
      unidad: 'UYU',
      entidadAfectadaId: '70',
      entidadAfectadaTipo: 'EMPRESA',
      requiereAccion: false,
    });

    // Km → costo combustible (diesel: ~$6.5/km promedio TODO_UCOT)
    const costoCombustible = evento.kmEsperados * 6.5;
    efectos.push({
      dominio: 'FINANZAS',
      severidad: 'info',
      titulo: 'Costo operativo proyectado del turno',
      descripcion: `Combustible estimado: ${fmtUYU(costoCombustible)} (~6.5 UYU/km). TODO_UCOT: ajustar con precio combustible actual.`,
      delta: -costoCombustible,
      unidad: 'UYU',
      entidadAfectadaId: evento.turnoId,
      entidadAfectadaTipo: 'TURNO',
      requiereAccion: false,
    });

    return efectos;
  },

  // ── 3. Vehículo fuera de servicio ─────────────────────────────────────────

  alVehiculoFueraDeServicio(evento: EventoVehiculoFueraDeServicio, ctx: ContextoConsecuencia): EfectoConsecuencia[] {
    const efectos: EfectoConsecuencia[] = [];
    const esAveria = evento.motivo === 'averia' || evento.motivo === 'accidente';

    // Operaciones: necesidad de vehículo de reemplazo
    efectos.push({
      dominio: 'OPERACIONES',
      severidad: esAveria ? 'critico' : 'advertencia',
      titulo: `Coche ${evento.cocheNumero} fuera de servicio`,
      descripcion: `Motivo: ${labelMotivo(evento.motivo)}. Tiempo estimado: ${evento.horasEstimadas}h.${evento.conductorAfectadoId ? ` Conductor afectado debe recibir coche de reemplazo.` : ''}`,
      entidadAfectadaId: evento.cocheId,
      entidadAfectadaTipo: 'VEHICULO',
      requiereAccion: true,
      accionSugerida: 'Asignar coche de reemplazo del parque disponible. Si no hay: evaluar cancelar turno y notificar.',
    });

    // Mantenimiento
    efectos.push({
      dominio: 'FINANZAS',
      severidad: esAveria ? 'advertencia' : 'info',
      titulo: `Costo de mantenimiento — Coche ${evento.cocheNumero}`,
      descripcion: esAveria
        ? 'Avería no planificada — costo de corrección generalmente 3-5× mayor que mantenimiento preventivo. TODO_UCOT: registrar en sistema de mantenimiento.'
        : 'Mantenimiento preventivo planificado — costo dentro del presupuesto esperado.',
      entidadAfectadaId: evento.cocheId,
      entidadAfectadaTipo: 'VEHICULO',
      requiereAccion: esAveria,
      accionSugerida: esAveria ? 'Abrir orden de trabajo en sistema de mantenimiento. Registrar para análisis de confiabilidad.' : undefined,
    });

    // Si la avería afecta una línea: impacto OTP y subsidio
    if (evento.lineaId && ctx.viajesAfectados > 0) {
      const kmPerdidos = ctx.viajesAfectados * 12;
      efectos.push({
        dominio: 'SUBSIDIO',
        severidad: 'advertencia',
        titulo: 'Subsidio en riesgo por coche fuera de servicio',
        descripcion: `Hasta ${ctx.viajesAfectados} viajes sin vehículo.`,
        delta: -ucotReglas.calcularImpactoSubsidio(kmPerdidos, evento.lineaId),
        unidad: 'UYU',
        entidadAfectadaId: '70',
        entidadAfectadaTipo: 'EMPRESA',
        requiereAccion: false,
      });
    }

    return efectos;
  },

  // ── 4. Viaje con retraso ─────────────────────────────────────────────────

  alViajeTardio(evento: EventoViajeTardio, ctx: ContextoConsecuencia): EfectoConsecuencia[] {
    const efectos: EfectoConsecuencia[] = [];
    const esCritico = evento.minutosRetraso >= 10;
    const esCausaConductor = evento.causa === 'conductor';

    efectos.push({
      dominio: 'OTP',
      severidad: esCritico ? 'advertencia' : 'info',
      titulo: `Retraso ${evento.minutosRetraso} min — Línea ${evento.lineaId}`,
      descripcion: `Parada: ${evento.parada}. Causa: ${evento.causa ?? 'desconocida'}. ${esCritico ? 'Supera umbral de 10 min (incumplimiento OTP).' : 'Dentro de ventana de tolerancia.'}`,
      entidadAfectadaId: evento.lineaId,
      entidadAfectadaTipo: 'LINEA',
      requiereAccion: ctx.otpActualLinea < UCOT_PARAMS.umbralOTPPenalidad + 2,
    });

    // Si la causa es atribuible al conductor: afecta su historial
    if (esCausaConductor && evento.conductorId) {
      efectos.push({
        dominio: 'RRHH',
        severidad: esCritico ? 'advertencia' : 'info',
        titulo: 'Retraso registrado en historial del conductor',
        descripcion: `Retraso de ${evento.minutosRetraso} min registrado en ficha. El OTP individual del conductor se actualiza. Si es patrón recurrente: afecta evaluación y distribución de excedentes.`,
        entidadAfectadaId: evento.conductorId,
        entidadAfectadaTipo: 'CONDUCTOR',
        requiereAccion: false,
      });
    }

    // OTP por debajo de umbral → riesgo de penalidad STM
    if (ctx.otpActualLinea - 1 < UCOT_PARAMS.umbralOTPPenalidad) {
      efectos.push({
        dominio: 'SUBSIDIO',
        severidad: 'critico',
        titulo: 'Riesgo de penalidad STM por OTP',
        descripcion: `OTP de la línea ${ctx.otpActualLinea.toFixed(1)}% está bajo umbral STM (${UCOT_PARAMS.umbralOTPPenalidad}%). Cada punto porcentual adicional por debajo implica penalidad en subsidio mensual.`,
        entidadAfectadaId: evento.lineaId,
        entidadAfectadaTipo: 'LINEA',
        requiereAccion: true,
        accionSugerida: 'Revisar horario de la línea. Evaluar ajuste de tiempos en boletín o refuerzo con coche adicional.',
      });
    }

    return efectos;
  },

  // ── 5. Viaje cancelado ────────────────────────────────────────────────────

  alViajeCancelado(evento: EventoViajeCancelado, ctx: ContextoConsecuencia): EfectoConsecuencia[] {
    const efectos: EfectoConsecuencia[] = [];

    efectos.push({
      dominio: 'OTP',
      severidad: 'critico',
      titulo: `Viaje cancelado — Línea ${evento.lineaId}`,
      descripcion: `${evento.kmPerdidos} km no recorridos. Causa: ${evento.causa}.`,
      delta: -1,
      unidad: 'viajes',
      entidadAfectadaId: evento.lineaId,
      entidadAfectadaTipo: 'LINEA',
      requiereAccion: true,
      accionSugerida: 'Registrar cancelación en sistema STM. Evaluar impacto en contrato.',
    });

    efectos.push({
      dominio: 'SUBSIDIO',
      severidad: 'advertencia',
      titulo: 'Km cancelados — subsidio no devengado',
      descripcion: `${evento.kmPerdidos} km no operados.`,
      delta: -ucotReglas.calcularImpactoSubsidio(evento.kmPerdidos, evento.lineaId),
      unidad: 'UYU',
      entidadAfectadaId: '70',
      entidadAfectadaTipo: 'EMPRESA',
      requiereAccion: false,
    });

    const ingresosPerdidos = ctx.pasajerosPromedio * 45;
    efectos.push({
      dominio: 'FINANZAS',
      severidad: 'advertencia',
      titulo: 'Ingresos perdidos por cancelación',
      descripcion: `~${ctx.pasajerosPromedio} pasajeros afectados.`,
      delta: -ingresosPerdidos,
      unidad: 'UYU',
      entidadAfectadaId: '70',
      entidadAfectadaTipo: 'EMPRESA',
      requiereAccion: false,
    });

    return efectos;
  },

  // ── Cálculo salarial — socio UCOT ──────────────────────────────────────────

  calcularSalarioTurno(evento: EventoConductorAsignado) {
    const horaBase = UCOT_PARAMS.salarioBaseHora;
    const base = horaBase * evento.duracionHoras;

    // Antigüedad: 2% anual acumulado
    const multAntiguedad = 1 + evento.aniosAntiguedad * UCOT_PARAMS.porcentajeAntiguedadAnual;
    const baseConAntiguedad = base * multAntiguedad;

    const adicionales: Record<string, number> = {};

    // Tipo de día
    if (evento.tipoDia === 'feriado' || evento.tipoDia === 'domingo') {
      adicionales['adicional_feriado_domingo'] = baseConAntiguedad * UCOT_PARAMS.adicionalDomingoFeriado;
    } else if (evento.tipoDia === 'sabado') {
      adicionales['adicional_sabado'] = baseConAntiguedad * UCOT_PARAMS.adicionalSabado;
    }

    // Horario nocturno (inicio antes de 6am o después de 22pm)
    if (evento.horaInicio < 6 || evento.horaInicio >= 22) {
      adicionales['adicional_nocturno'] = baseConAntiguedad * UCOT_PARAMS.adicionalNocturno;
    }

    // Turno partido
    if (evento.esTurnoPartido) {
      adicionales['adicional_turno_partido'] = UCOT_PARAMS.adicionalTurnoPartido;
    }

    const totalAdicionales = Object.values(adicionales).reduce((a, b) => a + b, 0);

    return {
      base: baseConAntiguedad,
      adicionales,
      total: baseConAntiguedad + totalAdicionales,
      moneda: 'UYU' as const,
    };
  },

  // ── Cálculo de subsidio STM ─────────────────────────────────────────────────

  calcularImpactoSubsidio(kmPerdidos: number, _lineaId: string): number {
    // TODO_UCOT: si hay tarifa diferencial por línea, usar tabla por lineaId
    return kmPerdidos * UCOT_PARAMS.subsidioPorKm;
  },
};

// ── Labels de apoyo ──────────────────────────────────────────────────────────

function labelAusencia(codigo: EventoConductorAusente['codigoAusencia']): string {
  const labels: Record<string, string> = {
    licencia_medica: 'Licencia médica',
    licencia_gremial: 'Licencia gremial',
    ausencia_justificada: 'Ausencia justificada',
    ausencia_injustificada: 'Ausencia injustificada',
    accidente_trabajo: 'Accidente de trabajo',
  };
  return labels[codigo] ?? codigo;
}

function labelMotivo(motivo: EventoVehiculoFueraDeServicio['motivo']): string {
  const labels: Record<string, string> = {
    averia: 'Avería no planificada',
    mantenimiento_preventivo: 'Mantenimiento preventivo',
    accidente: 'Accidente',
    inspeccion_tecnica: 'Inspección técnica obligatoria',
  };
  return labels[motivo] ?? motivo;
}

function calcularImpactoOTP(viajesAfectados: number, totalBuses: number): number {
  if (totalBuses === 0) return 0;
  return (viajesAfectados / Math.max(totalBuses * 3, 1)) * 100;
}
