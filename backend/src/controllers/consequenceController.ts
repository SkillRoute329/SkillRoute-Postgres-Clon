/**
 * consequenceController — Motor de Consecuencias (FASE 5.28, 2026-05-19)
 *
 * POST /api/consequencePreview
 *   body: { evento: { tipo, ...campos según tipo } }
 *
 * Antes 404 (MotorConsecuencias.tsx). Es la columna vertebral del
 * COMETIDO DE INTERCONEXIÓN: dado un evento operativo cualquiera (ausencia
 * de conductor, vehículo fuera de servicio, retraso, viaje cancelado),
 * calcula y devuelve los efectos en cada dominio (RRHH, NÓMINA, OPERACIONES,
 * OTP, SUBSIDIO, FINANZAS, DISCIPLINA).
 *
 * Reglas verificables y explicables, no inventadas — basadas en la
 * normativa de UCOT y de la IMM:
 *   - Tarifa MTOP UCOT: ~$1.350/h aproximadamente (cifra pública sujeta a
 *     ajuste; configurable en system_config['config_salarial_descuentos']).
 *   - Subsidio STM: el operador percibe valor por km comprometido. Cada km
 *     no realizado descuenta del subsidio mensual.
 *   - OTP: cada minuto fuera del rango ±3min cuenta como impuntualidad.
 *   - Disciplina: ausencia injustificada => número rojo automático.
 *
 * Sin acoplamiento al frontend: este endpoint devuelve sólo los efectos
 * calculados; la persistencia real se ejecuta cuando el usuario presiona
 * "Ejecutar" en MotorConsecuencias (TODO ese flujo).
 */

import { Request, Response } from 'express';
import sqlDb from '../config/database';
import logger from '../config/logger';
import { busCascade, busEmit } from '../services/socketBus';
import { getMotorConfig, DEFAULTS as MOTOR_DEFAULTS } from '../services/motorConfigService';

type Dominio = 'RRHH' | 'NOMINA' | 'OPERACIONES' | 'OTP' | 'SUBSIDIO' | 'FINANZAS' | 'DISCIPLINA';
type Severidad = 'info' | 'advertencia' | 'critico';

interface Efecto {
  dominio: Dominio;
  severidad: Severidad;
  titulo: string;
  descripcion: string;
  delta?: number;
  unidad?: string;
  entidadAfectadaId: string;
  entidadAfectadaTipo: string;
  requiereAccion: boolean;
  accionSugerida?: string;
}

interface Resumen {
  impactoNomina: number;
  impactoSubsidio: number;
  deltaOTP: number;
  viajesEnRiesgo: number;
  kmPerdidos: number;
  severidadGlobal: Severidad;
  requiereIntervencionInmediata: boolean;
}

// FASE 5.32 (2026-05-21): los parámetros vienen de motorConfigService que
// los lee de system_config con cache de 60s. Las constantes locales son
// fallback en línea para sincronía en las funciones de reglas; el handler
// HTTP rehidrata las variables al inicio de cada request.
let TARIFA_HORA_UYU = MOTOR_DEFAULTS.tarifaHoraUyu;
let SUBSIDIO_POR_KM_UYU = MOTOR_DEFAULTS.subsidioPorKmUyu;
let COSTO_RESERVA_EXTRA_UYU = MOTOR_DEFAULTS.costoReservaExtraUyu;

function leerEvento(body: unknown): Record<string, unknown> {
  const ev = (body as Record<string, unknown>)?.evento;
  return (ev && typeof ev === 'object') ? (ev as Record<string, unknown>) : {};
}

function severidadCombinada(efectos: Efecto[]): Severidad {
  if (efectos.some((e) => e.severidad === 'critico')) return 'critico';
  if (efectos.some((e) => e.severidad === 'advertencia')) return 'advertencia';
  return 'info';
}

// ─── Reglas por tipo de evento ────────────────────────────────────────────

function reglasConductorAusente(ev: Record<string, unknown>): Efecto[] {
  const conductorId = String(ev.conductorId ?? 'conductor-?');
  const conductorNombre = String(ev.conductorNombre ?? 'Conductor');
  const codigo = String(ev.codigoAusencia ?? 'no_especificado').toLowerCase();
  const turnoId = String(ev.turnoId ?? 'turno-?');
  const lineaId = String(ev.lineaId ?? '');
  const horas = Number(ev.duracionHoras ?? 8);
  const justificada = ['licencia_medica', 'licencia_anual', 'estudio', 'familiar', 'paro'].includes(codigo);

  const efectos: Efecto[] = [];

  // RRHH
  efectos.push({
    dominio: 'RRHH',
    severidad: 'info',
    titulo: 'Ausencia registrada',
    descripcion: `${conductorNombre} ausente (${codigo}). Día contado en historial.`,
    delta: 1,
    unidad: 'día',
    entidadAfectadaId: conductorId,
    entidadAfectadaTipo: 'conductor',
    requiereAccion: false,
  });

  // NOMINA
  const sueldoPerdido = justificada ? 0 : Math.round(TARIFA_HORA_UYU * horas);
  if (sueldoPerdido > 0) {
    efectos.push({
      dominio: 'NOMINA',
      severidad: 'advertencia',
      titulo: 'Jornal no devengado',
      descripcion: `Ausencia ${codigo}: descuento por ${horas}h a $${TARIFA_HORA_UYU}/h.`,
      delta: -sueldoPerdido,
      unidad: 'UYU',
      entidadAfectadaId: conductorId,
      entidadAfectadaTipo: 'conductor',
      requiereAccion: false,
    });
  }

  // DISCIPLINA — solo si injustificada
  if (codigo.includes('injust')) {
    efectos.push({
      dominio: 'DISCIPLINA',
      severidad: 'critico',
      titulo: 'Número rojo abierto',
      descripcion: `Ausencia injustificada → apertura automática en abl_red_numbers.`,
      entidadAfectadaId: conductorId,
      entidadAfectadaTipo: 'conductor',
      requiereAccion: true,
      accionSugerida: 'Citar al conductor y aplicar regla disciplinaria correspondiente.',
    });
  }

  // OPERACIONES — turno descubierto, requiere reserva
  efectos.push({
    dominio: 'OPERACIONES',
    severidad: 'advertencia',
    titulo: 'Turno sin chofer',
    descripcion: `El turno ${turnoId} (línea ${lineaId || 'N/A'}) queda sin cubrir. Buscar reserva.`,
    entidadAfectadaId: turnoId,
    entidadAfectadaTipo: 'turno',
    requiereAccion: true,
    accionSugerida: 'Asignar conductor de reserva (módulo Listero).',
  });

  // FINANZAS — costo extra reserva
  efectos.push({
    dominio: 'FINANZAS',
    severidad: 'info',
    titulo: 'Costo extra reserva',
    descripcion: `Activar reserva genera un costo aproximado de $${COSTO_RESERVA_EXTRA_UYU}.`,
    delta: -COSTO_RESERVA_EXTRA_UYU,
    unidad: 'UYU',
    entidadAfectadaId: conductorId,
    entidadAfectadaTipo: 'conductor',
    requiereAccion: false,
  });

  // OTP — si no se cubre con reserva, viaje no sale → impacto OTP
  efectos.push({
    dominio: 'OTP',
    severidad: 'advertencia',
    titulo: 'Riesgo de OTP',
    descripcion: `Si no se cubre con reserva, el viaje no se realiza: -1 viaje completo en la línea ${lineaId || 'N/A'}.`,
    delta: -1,
    unidad: 'viaje',
    entidadAfectadaId: lineaId,
    entidadAfectadaTipo: 'linea',
    requiereAccion: false,
  });

  // SUBSIDIO — viaje no realizado = km no facturable a STM
  const kmEsperados = Number(ev.kmEsperados ?? 0);
  if (kmEsperados > 0) {
    const subsidioPerdido = Math.round(kmEsperados * SUBSIDIO_POR_KM_UYU);
    efectos.push({
      dominio: 'SUBSIDIO',
      severidad: 'advertencia',
      titulo: 'Subsidio STM en riesgo',
      descripcion: `Si el viaje no sale: ${kmEsperados}km × $${SUBSIDIO_POR_KM_UYU} = $${subsidioPerdido} no facturable.`,
      delta: -subsidioPerdido,
      unidad: 'UYU',
      entidadAfectadaId: lineaId,
      entidadAfectadaTipo: 'linea',
      requiereAccion: false,
    });
  }

  return efectos;
}

function reglasVehiculoFueraServicio(ev: Record<string, unknown>): Efecto[] {
  const cocheId = String(ev.cocheId ?? 'coche-?');
  const cocheNumero = String(ev.cocheNumero ?? '???');
  const motivo = String(ev.motivoVehiculo ?? 'desconocido');
  const horas = Number(ev.horasEstimadas ?? 4);
  const kmPerdidos = Number(ev.kmPerdidos ?? 0);
  const lineaId = String(ev.lineaId ?? '');

  const efectos: Efecto[] = [];

  efectos.push({
    dominio: 'OPERACIONES',
    severidad: 'critico',
    titulo: 'Vehículo fuera de servicio',
    descripcion: `Coche ${cocheNumero} (${motivo}). Estimado: ${horas}h sin operar. Buscar bus de reserva.`,
    entidadAfectadaId: cocheId,
    entidadAfectadaTipo: 'vehiculo',
    requiereAccion: true,
    accionSugerida: 'Asignar bus de reserva o cancelar turno asociado.',
  });

  if (kmPerdidos > 0) {
    const subsidioPerdido = Math.round(kmPerdidos * SUBSIDIO_POR_KM_UYU);
    efectos.push({
      dominio: 'SUBSIDIO',
      severidad: 'advertencia',
      titulo: 'KM no realizados',
      descripcion: `${kmPerdidos}km perdidos × $${SUBSIDIO_POR_KM_UYU} = -$${subsidioPerdido} subsidio.`,
      delta: -subsidioPerdido,
      unidad: 'UYU',
      entidadAfectadaId: lineaId,
      entidadAfectadaTipo: 'linea',
      requiereAccion: false,
    });
  }

  const costoReparacion = motivo === 'averia' ? 25000 : motivo === 'choque' ? 80000 : 8000;
  efectos.push({
    dominio: 'FINANZAS',
    severidad: motivo === 'choque' ? 'critico' : 'advertencia',
    titulo: 'Costo de reparación estimado',
    descripcion: `Motivo ${motivo}: costo de referencia $${costoReparacion}.`,
    delta: -costoReparacion,
    unidad: 'UYU',
    entidadAfectadaId: cocheId,
    entidadAfectadaTipo: 'vehiculo',
    requiereAccion: false,
  });

  efectos.push({
    dominio: 'OTP',
    severidad: 'advertencia',
    titulo: 'Frecuencia reducida',
    descripcion: `La línea ${lineaId || 'N/A'} corre con menos buses durante ${horas}h.`,
    entidadAfectadaId: lineaId,
    entidadAfectadaTipo: 'linea',
    requiereAccion: false,
  });

  return efectos;
}

function reglasRetrasoOperativo(ev: Record<string, unknown>): Efecto[] {
  const conductorId = String(ev.conductorId ?? 'conductor-?');
  const lineaId = String(ev.lineaId ?? '');
  const minutos = Number(ev.minutosRetraso ?? 0);

  const efectos: Efecto[] = [];

  const deltaOtp = -Math.min(15, Math.abs(minutos));
  efectos.push({
    dominio: 'OTP',
    severidad: minutos > 10 ? 'critico' : 'advertencia',
    titulo: 'Pérdida de puntualidad',
    descripcion: `Retraso de ${minutos}min: cada minuto fuera de ±3 cuenta como impuntual.`,
    delta: deltaOtp,
    unidad: 'puntos OTP',
    entidadAfectadaId: lineaId,
    entidadAfectadaTipo: 'linea',
    requiereAccion: false,
  });

  if (minutos > 10) {
    efectos.push({
      dominio: 'SUBSIDIO',
      severidad: 'advertencia',
      titulo: 'Riesgo de penalización STM',
      descripcion: `IMM puede aplicar penalización si OTP mensual cae bajo 85%.`,
      entidadAfectadaId: lineaId,
      entidadAfectadaTipo: 'linea',
      requiereAccion: false,
    });
  }

  if (minutos > 5) {
    efectos.push({
      dominio: 'DISCIPLINA',
      severidad: 'info',
      titulo: 'Evento registrado al conductor',
      descripcion: `Si reincide, contribuye a apertura de número rojo.`,
      entidadAfectadaId: conductorId,
      entidadAfectadaTipo: 'conductor',
      requiereAccion: false,
    });
  }

  return efectos;
}

function reglasViajeCancelado(ev: Record<string, unknown>): Efecto[] {
  const lineaId = String(ev.lineaId ?? '');
  const kmEsperados = Number(ev.kmEsperados ?? 0);
  const causa = String(ev.causaViaje ?? 'no especificada');

  const efectos: Efecto[] = [];

  efectos.push({
    dominio: 'OPERACIONES',
    severidad: 'advertencia',
    titulo: 'Viaje cancelado',
    descripcion: `Viaje cancelado por: ${causa}.`,
    delta: -1,
    unidad: 'viaje',
    entidadAfectadaId: lineaId,
    entidadAfectadaTipo: 'linea',
    requiereAccion: false,
  });

  if (kmEsperados > 0) {
    const subsidioPerdido = Math.round(kmEsperados * SUBSIDIO_POR_KM_UYU);
    efectos.push({
      dominio: 'SUBSIDIO',
      severidad: 'advertencia',
      titulo: 'KM no facturables',
      descripcion: `${kmEsperados}km × $${SUBSIDIO_POR_KM_UYU}/km = -$${subsidioPerdido} en subsidio STM.`,
      delta: -subsidioPerdido,
      unidad: 'UYU',
      entidadAfectadaId: lineaId,
      entidadAfectadaTipo: 'linea',
      requiereAccion: false,
    });
  }

  efectos.push({
    dominio: 'OTP',
    severidad: 'critico',
    titulo: 'Viaje no realizado',
    descripcion: 'Un viaje cancelado cuenta como viaje en riesgo en el OTP del día.',
    delta: -1,
    unidad: 'viaje en riesgo',
    entidadAfectadaId: lineaId,
    entidadAfectadaTipo: 'linea',
    requiereAccion: false,
  });

  return efectos;
}

function resumirEfectos(efectos: Efecto[]): Resumen {
  const sumByDominio = (d: Dominio) =>
    efectos.filter((e) => e.dominio === d && typeof e.delta === 'number').reduce((s, e) => s + (e.delta ?? 0), 0);
  return {
    impactoNomina: sumByDominio('NOMINA') + sumByDominio('FINANZAS'),
    impactoSubsidio: sumByDominio('SUBSIDIO'),
    deltaOTP: sumByDominio('OTP'),
    viajesEnRiesgo: efectos.filter((e) => e.dominio === 'OTP' && (e.delta ?? 0) < 0).length,
    kmPerdidos: efectos
      .filter((e) => e.dominio === 'SUBSIDIO' && e.descripcion.toLowerCase().includes('km'))
      .reduce((s) => s + 1, 0),
    severidadGlobal: severidadCombinada(efectos),
    requiereIntervencionInmediata: efectos.some((e) => e.requiereAccion && e.severidad === 'critico'),
  };
}

// FASE 5.30 (2026-05-21): función reutilizable para uso interno (triggers
// automáticos desde listero, etc.). Devuelve la propagación sin hacer http
// response. Cuando es invocada directamente, también emite por el bus
// socket para que el frontend reciba el efecto en vivo.
export async function computeConsequencesForEvent(ev: Record<string, unknown>): Promise<{ ok: boolean; efectos: Efecto[]; resumen: Resumen; tipo: string } | { ok: false; error: string }> {
  // FASE 5.32: refrescar tarifas vigentes desde system_config antes de calcular.
  try {
    const cfg = await getMotorConfig();
    TARIFA_HORA_UYU = cfg.tarifaHoraUyu;
    SUBSIDIO_POR_KM_UYU = cfg.subsidioPorKmUyu;
    COSTO_RESERVA_EXTRA_UYU = cfg.costoReservaExtraUyu;
  } catch { /* mantener fallback */ }
  const tipo = String(ev.tipo ?? '').toUpperCase();
  let efectos: Efecto[];
  switch (tipo) {
    case 'CONDUCTOR_AUSENTE':
      efectos = reglasConductorAusente(ev); break;
    case 'VEHICULO_FUERA_DE_SERVICIO':
      efectos = reglasVehiculoFueraServicio(ev); break;
    case 'RETRASO_OPERATIVO':
      efectos = reglasRetrasoOperativo(ev); break;
    case 'VIAJE_CANCELADO':
      efectos = reglasViajeCancelado(ev); break;
    default:
      return { ok: false, error: `Tipo de evento desconocido: ${tipo || '(vacío)'}` };
  }
  const resumen = resumirEfectos(efectos);
  // Log de auditoría no bloqueante.
  // FASE 5.33 (2026-05-22): persistir también los efectos completos para
  // que el modal del widget pueda mostrar el detalle cross-dominio sin
  // recomputar. Capturar el id devuelto para incluirlo en el bus event
  // (permite linkear desde el widget al detalle del registro).
  let logId: number | null = null;
  try {
    const [inserted] = await sqlDb('logs_auditoria')
      .insert({
        accion: 'consequencePreview',
        recurso: tipo,
        detalles_jsonb: { evento: ev, totalEfectos: efectos.length, resumen, efectos },
      })
      .returning('id');
    logId = (inserted && typeof inserted === 'object' ? (inserted as { id?: number }).id : inserted as number | null) ?? null;
  } catch { /* informativo */ }
  // Emitir al bus con el id de auditoría para que el frontend pueda abrir
  // el detalle del registro persistido.
  busCascade({
    evento: ev,
    efectos,
    resumen: resumen as unknown as Record<string, unknown>,
    feedId: logId,
  } as Record<string, unknown> & { evento: Record<string, unknown>; efectos: unknown[]; resumen: Record<string, unknown> });

  // FASE 5.35 (2026-05-22): cuando el evento es crítico Y tiene línea,
  // emitir un canal específico para que pantallas de conductor avisen al
  // chofer si su línea está afectada.
  const lineaIdEv = String((ev.lineaId as string) ?? (ev.linea as string) ?? '');
  const agencyIdEv = String((ev.agencyId as string) ?? (ev.empresaId as string) ?? '');
  if (resumen.severidadGlobal === 'critico' && lineaIdEv) {
    busEmit('bus:driver:linea-critica', {
      lineaId: lineaIdEv,
      agencyId: agencyIdEv,
      tipo,
      severidad: resumen.severidadGlobal,
      causa: String((ev.causa as string) ?? (ev.causaViaje as string) ?? (ev.motivoVehiculo as string) ?? tipo),
      feedId: logId,
    });
  }
  return { ok: true, tipo, efectos, resumen };
}

export async function postConsequencePreview(req: Request, res: Response): Promise<void> {
  try {
    const ev = leerEvento(req.body);
    const result = await computeConsequencesForEvent(ev);
    if (!result.ok) {
      res.status(400).json({ ok: false, error: (result as { error: string }).error });
      return;
    }
    res.json({
      ok: true,
      evento: ev,
      efectos: (result as { efectos: Efecto[] }).efectos,
      resumen: (result as { resumen: Resumen }).resumen,
      timestamp: new Date().toISOString(),
    });
    return;
  } catch (err) {
    logger.error('[consequencePreview]', { error: String(err) });
    res.status(500).json({ ok: false, error: 'Error simulando consecuencias' });
    return;
  }
}

