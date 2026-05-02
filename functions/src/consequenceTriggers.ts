/**
 * Motor de Consecuencias — Triggers automáticos (Firestore)
 * ===========================================================
 * Cuando algo real pasa en el sistema, el motor se dispara solo.
 * No requiere acción del usuario — la cascada se calcula y las
 * alertas aparecen automáticamente en el dashboard.
 *
 * Colecciones vigiladas:
 *  - licencias_personal  → onAbsenceCreated
 *  - daily_shifts        → onShiftAssigned
 *  - vehicle_events      → onVehicleStatusChanged
 *  - otp_daily           → onOTPUpdated
 */

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { propagarEvento, EventoOperativo } from './consequenceEngine';
import { obtenerReglasEmpresa } from './rules/index';

// ── Helpers compartidos ───────────────────────────────────────────────────────

async function construirContextoFirestore(evento: EventoOperativo) {
  const db = getFirestore();
  const empresaId = evento.empresaId;
  const conductorId = (evento as any).conductorId;
  const lineaId     = (evento as any).lineaId;
  const fecha       = (evento as any).fecha ?? new Date().toISOString().slice(0, 10);

  let ausenciasUltimos30Dias = 0;
  let reservasDisponibles: { id: string; nombre: string }[] = [];
  let otpActualLinea = 90;
  let busesEnLinea = 10;
  let viajesAfectados = 3;

  try {
    // Ausencias del conductor en los últimos 30 días
    if (conductorId) {
      const hace30 = new Date();
      hace30.setDate(hace30.getDate() - 30);
      const snap = await db.collection('licencias_personal')
        .where('employeeId', '==', conductorId)
        .where('empresaId', '==', empresaId)
        .where('startDate', '>=', hace30.toISOString().slice(0, 10))
        .get();
      ausenciasUltimos30Dias = snap.size;
    }

    // Conductores de reserva disponibles
    const res = await db.collection('daily_shifts')
      .where('empresaId', '==', empresaId)
      .where('date', '==', fecha)
      .where('estado', '==', 'reserva_disponible')
      .limit(5).get();
    reservasDisponibles = res.docs.map(d => ({
      id: d.id,
      nombre: d.data().conductorNombre ?? 'Socio de reserva',
    }));

    // OTP actual de la línea
    if (lineaId) {
      const otp = await db.collection('otp_daily')
        .where('lineaId', '==', lineaId)
        .where('empresaId', '==', empresaId)
        .orderBy('fecha', 'desc').limit(1).get();
      if (!otp.empty) otpActualLinea = otp.docs[0]!.data().otp ?? 90;

      // Buses activos en la línea
      const buses = await db.collection('vehicle_events')
        .where('lineaId', '==', lineaId)
        .where('empresaId', '==', empresaId)
        .where('estado', '==', 'activo')
        .get();
      busesEnLinea = buses.size || 10;
    }

    // Viajes del turno afectado
    const turnoId = (evento as any).turnoId;
    if (turnoId) {
      const turno = await db.collection('daily_shifts').doc(turnoId).get();
      if (turno.exists) {
        viajesAfectados = turno.data()?.tripCount ?? 3;
        busesEnLinea    = turno.data()?.busesEnLinea ?? busesEnLinea;
      }
    }
  } catch (_) { /* usar defaults */ }

  return { ausenciasUltimos30Dias, reservasDisponibles, otpActualLinea, busesEnLinea, viajesAfectados, pasajerosPromedio: 35 };
}

async function persistirCascada(
  resultado: ReturnType<typeof propagarEvento>,
  sourceCollection: string,
  sourceDocId: string,
) {
  const db = getFirestore();

  // 1. Guardar el resultado completo en consequence_events (trazabilidad)
  await db.collection('consequence_events').add({
    ...resultado,
    sourceCollection,
    sourceDocId,
    createdAt: FieldValue.serverTimestamp(),
  });

  // 2. Escribir alertas críticas/con acción a alertas_regulacion (aparecen en el dashboard)
  const alertables = resultado.efectos.filter(
    e => e.severidad === 'critico' || e.severidad === 'advertencia' || e.requiereAccion
  );

  for (const efecto of alertables) {
    await db.collection('alertas_regulacion').add({
      tipo: 'CONSECUENCIA_OPERATIVA',
      dominio: efecto.dominio,
      titulo: efecto.titulo,
      mensaje: efecto.descripcion,
      urgencia: efecto.severidad === 'critico' ? 'critica' : 'alta',
      empresaId: resultado.evento.empresaId,
      accionSugerida: efecto.accionSugerida ?? null,
      delta: efecto.delta ?? null,
      unidad: efecto.unidad ?? null,
      sourceEventType: resultado.evento.tipo,
      timestamp: FieldValue.serverTimestamp(),
      leido: false,
    });
  }

  // 3. Si hay impacto en subsidio: registrar en subsidy_ledger
  const subsidioEfecto = resultado.efectos.find(e => e.dominio === 'SUBSIDIO' && e.delta !== undefined);
  if (subsidioEfecto?.delta) {
    await db.collection('subsidy_ledger').add({
      empresaId: resultado.evento.empresaId,
      fecha: (resultado.evento as any).fecha ?? new Date().toISOString().slice(0, 10),
      tipo: 'IMPACTO_EVENTO',
      eventoTipo: resultado.evento.tipo,
      delta: subsidioEfecto.delta,
      descripcion: subsidioEfecto.descripcion,
      sourceDocId,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

// ── Trigger 1: Conductor ausente (licencias_personal) ────────────────────────

export const onAbsenceCreated = onDocumentCreated(
  { document: 'licencias_personal/{docId}', region: 'us-central1' },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const empresaId = data.empresaId ?? '70';
    const reglas = obtenerReglasEmpresa(empresaId);
    if (!reglas) return;

    const evento: EventoOperativo = {
      tipo: 'CONDUCTOR_AUSENTE',
      empresaId,
      conductorId:     data.employeeId ?? data.conductorId ?? 'desconocido',
      conductorNombre: data.employeeName ?? data.conductorNombre ?? 'Conductor',
      fecha:           data.startDate ?? new Date().toISOString().slice(0, 10),
      codigoAusencia:  mapCodigoAusencia(data.tipoLicencia ?? data.codigoAusencia),
      turnoId:         data.turnoId ?? undefined,
      lineaId:         data.lineaId ?? undefined,
    };

    const contexto = await construirContextoFirestore(evento);
    const resultado = propagarEvento(evento, reglas, contexto);
    await persistirCascada(resultado, 'licencias_personal', event.params.docId);
  }
);

// ── Trigger 2: Turno asignado (daily_shifts) ──────────────────────────────────

export const onShiftAssigned = onDocumentCreated(
  { document: 'daily_shifts/{docId}', region: 'us-central1' },
  async (event) => {
    const data = event.data?.data();
    if (!data || !data.conductorId || data.estado === 'reserva_disponible') return;

    const empresaId = data.empresaId ?? '70';
    const reglas = obtenerReglasEmpresa(empresaId);
    if (!reglas) return;

    const evento: EventoOperativo = {
      tipo: 'CONDUCTOR_ASIGNADO',
      empresaId,
      conductorId:     data.conductorId,
      conductorNombre: data.conductorNombre ?? 'Conductor',
      turnoId:         event.params.docId,
      lineaId:         data.lineaId ?? data.linea ?? '',
      cocheId:         data.cocheId ?? data.coche ?? '',
      fecha:           data.date ?? new Date().toISOString().slice(0, 10),
      horaInicio:      data.horaInicio ?? 6,
      duracionHoras:   data.duracionHoras ?? 8,
      esTurnoPartido:  data.esTurnoPartido ?? false,
      tipoDia:         data.tipoDia ?? 'habil',
      kmEsperados:     data.kmEsperados ?? 100,
      aniosAntiguedad: data.aniosAntiguedad ?? 0,
    };

    const contexto = await construirContextoFirestore(evento);
    const resultado = propagarEvento(evento, reglas, contexto);

    // Para asignaciones: no generar alertas (es info), pero sí guardar el cálculo salarial
    await getFirestore().collection('consequence_events').add({
      ...resultado,
      sourceCollection: 'daily_shifts',
      sourceDocId: event.params.docId,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Actualizar el documento del turno con el salario calculado
    const salario = reglas.calcularSalarioTurno(evento as any);
    await event.data!.ref.update({
      salarioCalculado: salario,
      subsidioEsperado: reglas.calcularImpactoSubsidio(evento.kmEsperados ?? 0, evento.lineaId ?? ''),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
);

// ── Trigger 3: Vehículo fuera de servicio (vehicle_events) ────────────────────

export const onVehicleStatusChanged = onDocumentUpdated(
  { document: 'vehicle_events/{docId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();
    if (!after) return;

    const fueraDespues = after.estado === 'fuera_de_servicio' || after.estado === 'averia';
    const fueraBefore  = before?.estado === 'fuera_de_servicio' || before?.estado === 'averia';
    if (!fueraDespues || fueraBefore) return; // solo cuando recién entra en estado fuera

    const empresaId = after.empresaId ?? '70';
    const reglas = obtenerReglasEmpresa(empresaId);
    if (!reglas) return;

    const evento: EventoOperativo = {
      tipo: 'VEHICULO_FUERA_DE_SERVICIO',
      empresaId,
      cocheId:              event.params.docId,
      cocheNumero:          after.codigoVehiculo ?? after.numero ?? '?',
      motivo:               mapMotivoVehiculo(after.estado, after.motivo),
      lineaId:              after.lineaId ?? after.linea ?? undefined,
      turnoAfectadoId:      after.turnoId ?? undefined,
      conductorAfectadoId:  after.conductorId ?? undefined,
      horasEstimadas:       after.horasEstimadas ?? 4,
    };

    const contexto = await construirContextoFirestore(evento);
    const resultado = propagarEvento(evento, reglas, contexto);
    await persistirCascada(resultado, 'vehicle_events', event.params.docId);
  }
);

// ── Trigger 4: OTP daily actualizado ─────────────────────────────────────────

export const onOTPUpdated = onDocumentCreated(
  { document: 'otp_daily/{docId}', region: 'us-central1' },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const otp = data.otp ?? 100;
    const umbral = 85; // TODO: leer de parámetros operativos por empresa

    // Solo generar alerta si el OTP cae bajo umbral
    if (otp >= umbral) return;

    const db = getFirestore();
    await db.collection('alertas_regulacion').add({
      tipo: 'OTP_BAJO_UMBRAL',
      dominio: 'OTP',
      titulo: `OTP bajo umbral — Línea ${data.lineaId}`,
      mensaje: `OTP del día: ${otp.toFixed(1)}% (umbral STM: ${umbral}%). Riesgo de penalidad en subsidio mensual.`,
      urgencia: otp < 80 ? 'critica' : 'alta',
      empresaId: data.empresaId ?? '70',
      lineaId: data.lineaId,
      otpValue: otp,
      umbral,
      accionSugerida: 'Revisar distribución de frecuencias. Evaluar ajuste de tiempos en boletín.',
      timestamp: FieldValue.serverTimestamp(),
      leido: false,
    });
  }
);

// ── Mappers de códigos ────────────────────────────────────────────────────────

function mapCodigoAusencia(raw: string | undefined): any {
  const map: Record<string, string> = {
    medica: 'licencia_medica',
    enfermedad: 'licencia_medica',
    gremial: 'licencia_gremial',
    accidente: 'accidente_trabajo',
    injustificada: 'ausencia_injustificada',
    justificada: 'ausencia_justificada',
  };
  if (!raw) return 'ausencia_justificada';
  const key = raw.toLowerCase().replace(/[_\s]/g, '');
  for (const [k, v] of Object.entries(map)) {
    if (key.includes(k)) return v;
  }
  return raw; // pasar tal cual si ya está en formato correcto
}

function mapMotivoVehiculo(estado: string, motivo?: string): any {
  if (motivo) return motivo;
  if (estado === 'averia') return 'averia';
  if (estado === 'mantenimiento') return 'mantenimiento_preventivo';
  if (estado === 'accidente') return 'accidente';
  return 'averia';
}
