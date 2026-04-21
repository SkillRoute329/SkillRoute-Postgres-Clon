/**
 * listeroService — Motor de programación diaria de UCOT
 *
 * Flujo real:
 *   Listero arma turnos_dia (conductor + vehículo + línea + horario)
 *   → Conductor se presenta o falta
 *   → Si falta: cascadeEngine busca reserva + genera alertas
 *   → Largador confirma sustitución o cancela el servicio
 *   → KPIs se actualizan en tiempo real
 */

import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { AppError } from '../types/index';
import logger from '../config/logger';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type EstadoTurno =
  | 'programado'
  | 'activo'
  | 'completado'
  | 'cancelado'
  | 'sin_conductor'
  | 'cubierto_reserva';

export type TurnoNombre = 'madrugada' | 'mañana' | 'tarde' | 'noche';

export type EstadoConductorHoy =
  | 'disponible'
  | 'en_servicio'
  | 'ausente'
  | 'reserva'
  | 'franco'
  | 'licencia'
  | 'enfermo';

export interface TurnoDia {
  id?: string;
  fecha: string; // YYYY-MM-DD
  conductorId: string | null;
  conductorNombre: string | null;
  conductorInterno: string | null; // número de socio UCOT
  vehiculoId: string;
  vehiculoInterno: string; // número interno del coche (ej: "142")
  lineaId: string; // '300', '17', etc.
  varianteKey: string | null;
  turno: TurnoNombre;
  horaSalida: string; // 'HH:MM'
  horaLlegadaEstimada: string; // 'HH:MM'
  terminal: string; // terminal de salida
  estado: EstadoTurno;
  reservaActivada: boolean;
  conductorReservaId: string | null;
  conductorReservaNombre: string | null;
  importanciaLinea: number; // 1-5 (5 = crítica, riesgo regulatorio alto)
  impactoIngresosEstimado: number | null; // USD si se cancela el servicio
  observaciones: string | null;
  firmaConductor: boolean;
  horaFirma: string | null;
  createdAt: admin.firestore.Timestamp | null;
  updatedAt: admin.firestore.Timestamp | null;
}

export interface ConductorDia {
  id: string;
  internalNumber: string;
  fullName: string;
  rol: string;
  estadoHoy: EstadoConductorHoy;
  turnoAsignado: TurnoNombre | null;
  lineaAsignada: string | null;
  vehiculoAsignado: string | null;
  horaUltimoServicio: string | null; // para validar descanso OIT (min 9h)
  esConductorReserva: boolean;
  telefono: string | null;
}

export interface VehiculoDia {
  id: string;
  interno: string;
  patente: string | null;
  tipo: 'diesel' | 'electrico' | 'hibrido';
  estadoHoy: 'disponible' | 'en_servicio' | 'en_taller' | 'reserva' | 'baja';
  lineaAsignada: string | null;
  conductorAsignado: string | null;
  bateriaActual: number | null; // % solo eléctricos
  kilometrajeHoy: number | null;
  ultimaInspeccion: string | null;
  motivoBaja: string | null;
}

export interface ResumenDiario {
  fecha: string;
  turnosTotal: number;
  turnosCubiertos: number;
  turnosSinConductor: number;
  turnosCanceladosTotal: number;
  conductoresDisponibles: number;
  conductoresAusentes: number;
  conductoresReservaLibres: number;
  vehiculosDisponibles: number;
  vehiculosEnTaller: number;
  coberturaFlota: number; // % flota activa vs programada
  alertasActivas: number;
  impactoIngresosRiesgoUSD: number;
  lineasEnRiesgoIMM: string[]; // líneas que pueden tener gap regulatorio
}

// ─── Importancia de línea (para priorizar reservas) ──────────────────────────

const IMPORTANCIA_LINEA: Record<string, number> = {
  '300': 5, // alta frecuencia, máximo solapamiento competidores
  '306': 5,
  '329': 4,
  '330': 4,
  '17': 4,
  '316': 4,
  '328': 3,
  '370': 3,
  '79': 3,
  '396': 2,
  default: 2,
};

// Estimación de pasajeros por servicio (viaje completo) por línea
const PASAJEROS_POR_SERVICIO: Record<string, number> = {
  '300': 45,
  '306': 40,
  '329': 38,
  '330': 35,
  '17': 42,
  '316': 36,
  '328': 30,
  '370': 28,
  '79': 25,
  default: 20,
};

const TARIFA_PROMEDIO_UYU = 38; // tarifa STM 2024
const TIPO_CAMBIO_USD = 40;

function calcularImpactoIngresosUSD(lineaId: string): number {
  const pasajeros = PASAJEROS_POR_SERVICIO[lineaId] ?? PASAJEROS_POR_SERVICIO.default;
  return Math.round((pasajeros * TARIFA_PROMEDIO_UYU) / TIPO_CAMBIO_USD);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function horaAMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutosDescansoEntre(horaFin: string, horaInicio: string): number {
  const fin = horaAMinutos(horaFin);
  const ini = horaAMinutos(horaInicio);
  // Si fin > ini, ya pasó la medianoche
  return ini >= fin ? ini - fin : 24 * 60 - fin + ini;
}

// ─── CRUD Turnos ─────────────────────────────────────────────────────────────

export async function getTurnosByFecha(fecha: string): Promise<TurnoDia[]> {
  const snap = await db
    .collection('turnos_dia')
    .where('fecha', '==', fecha)
    .orderBy('horaSalida', 'asc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TurnoDia));
}

export async function createTurno(turno: Omit<TurnoDia, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = db.collection('turnos_dia').doc();
  await ref.set({
    ...turno,
    estado: turno.estado ?? 'programado',
    reservaActivada: false,
    conductorReservaId: null,
    conductorReservaNombre: null,
    firmaConductor: false,
    horaFirma: null,
    importanciaLinea: turno.importanciaLinea ?? (IMPORTANCIA_LINEA[turno.lineaId] ?? 2),
    impactoIngresosEstimado: calcularImpactoIngresosUSD(turno.lineaId),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  logger.info(`[LISTERO] Turno creado ${ref.id} — L${turno.lineaId} coche ${turno.vehiculoInterno} ${turno.horaSalida}`);
  return ref.id;
}

export async function updateTurno(
  turnoId: string,
  cambios: Partial<TurnoDia>,
): Promise<void> {
  await db.collection('turnos_dia').doc(turnoId).update({
    ...cambios,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function deleteTurno(turnoId: string): Promise<void> {
  await db.collection('turnos_dia').doc(turnoId).delete();
}

// ─── Conductores del día ──────────────────────────────────────────────────────

export async function getConductoresDia(fecha: string): Promise<ConductorDia[]> {
  // Leer personal + sus turnos del día para derivar estado
  const [personalSnap, turnosSnap] = await Promise.all([
    db.collection('personal').get(),
    db.collection('turnos_dia').where('fecha', '==', fecha).get(),
  ]);

  const turnosPorConductor = new Map<string, TurnoDia>();
  turnosSnap.docs.forEach((d) => {
    const t = d.data() as TurnoDia;
    if (t.conductorId) turnosPorConductor.set(t.conductorId, { id: d.id, ...t });
    if (t.conductorReservaId) turnosPorConductor.set(t.conductorReservaId, { id: d.id, ...t });
  });

  return personalSnap.docs
    .map((d) => {
      const data = d.data();
      const turno = turnosPorConductor.get(d.id);
      return {
        id: d.id,
        internalNumber: data.internalNumber ?? data.interno ?? '',
        fullName: data.fullName ?? data.nombre ?? '',
        rol: data.role ?? data.rol ?? 'conductor',
        estadoHoy: (data.estadoHoy ?? 'disponible') as EstadoConductorHoy,
        turnoAsignado: turno ? turno.turno : null,
        lineaAsignada: turno ? turno.lineaId : null,
        vehiculoAsignado: turno ? turno.vehiculoInterno : null,
        horaUltimoServicio: data.horaUltimoServicio ?? null,
        esConductorReserva: data.esConductorReserva ?? false,
        telefono: data.telefono ?? null,
      } as ConductorDia;
    })
    .filter((c) => /conductor|driver|chofer|micrero|guarda/i.test(c.rol));
}

// ─── Marcar ausencia (dispara cascada) ───────────────────────────────────────

export async function marcarAusencia(
  conductorId: string,
  fecha: string,
  motivo: string,
  registradoPor: string,
): Promise<{ turnosAfectados: TurnoDia[]; reservasDisponibles: ConductorDia[] }> {
  // Actualizar estado del conductor en personal
  await db.collection('personal').doc(conductorId).update({
    estadoHoy: 'ausente',
    motivoAusencia: motivo,
    ausenciaRegistradaPor: registradoPor,
    ausenciaFecha: fecha,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Buscar turnos asignados a este conductor hoy
  const turnosSnap = await db
    .collection('turnos_dia')
    .where('fecha', '==', fecha)
    .where('conductorId', '==', conductorId)
    .get();

  const turnosAfectados: TurnoDia[] = [];
  for (const doc of turnosSnap.docs) {
    const turno = { id: doc.id, ...doc.data() } as TurnoDia;
    await doc.ref.update({
      estado: 'sin_conductor',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    turnosAfectados.push({ ...turno, estado: 'sin_conductor' });
  }

  // Buscar conductores de reserva disponibles
  const reservasDisponibles = await buscarReservasDisponibles(fecha, turnosAfectados);

  logger.warn(`[LISTERO] Ausencia registrada: conductor ${conductorId} — ${turnosAfectados.length} turnos sin cobertura`);

  return { turnosAfectados, reservasDisponibles };
}

// ─── Buscar conductores de reserva ───────────────────────────────────────────

export async function buscarReservasDisponibles(
  fecha: string,
  turnosAfectados: TurnoDia[],
): Promise<ConductorDia[]> {
  const conductoresDia = await getConductoresDia(fecha);

  return conductoresDia.filter((c) => {
    // Solo disponibles o reserva explícita
    if (c.estadoHoy !== 'disponible' && c.estadoHoy !== 'reserva') return false;
    // Verificar descanso OIT: mínimo 9 horas (540 min) desde último servicio
    if (c.horaUltimoServicio && turnosAfectados.length > 0) {
      const primerTurno = turnosAfectados[0];
      const descanso = minutosDescansoEntre(c.horaUltimoServicio, primerTurno.horaSalida);
      if (descanso < 540) return false; // menos de 9 horas
    }
    return true;
  });
}

// ─── Asignar conductor de reserva ────────────────────────────────────────────

export async function asignarReserva(
  turnoId: string,
  conductorReservaId: string,
  conductorReservaNombre: string,
  asignadoPor: string,
): Promise<void> {
  await db.collection('turnos_dia').doc(turnoId).update({
    estado: 'cubierto_reserva',
    reservaActivada: true,
    conductorReservaId,
    conductorReservaNombre,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Actualizar estado del conductor reserva
  await db.collection('personal').doc(conductorReservaId).update({
    estadoHoy: 'en_servicio',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`[LISTERO] Reserva activada: turno ${turnoId} → conductor ${conductorReservaId} por ${asignadoPor}`);
}

// ─── Marcar vehículo en taller ────────────────────────────────────────────────

export async function marcarVehiculoEnTaller(
  vehiculoId: string,
  motivo: string,
  registradoPor: string,
  fecha: string,
): Promise<{ turnosAfectados: TurnoDia[]; vehiculosReservaDisponibles: VehiculoDia[] }> {
  await db.collection('vehicles').doc(vehiculoId).update({
    estadoHoy: 'en_taller',
    motivoBaja: motivo,
    bajaRegistradaPor: registradoPor,
    bajaFecha: fecha,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const turnosSnap = await db
    .collection('turnos_dia')
    .where('fecha', '==', fecha)
    .where('vehiculoId', '==', vehiculoId)
    .get();

  const turnosAfectados: TurnoDia[] = [];
  for (const doc of turnosSnap.docs) {
    await doc.ref.update({
      estado: 'sin_conductor', // reutilizamos el estado para "sin vehículo"
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    turnosAfectados.push({ id: doc.id, ...doc.data() } as TurnoDia);
  }

  const vehiculosReservaDisponibles = await buscarVehiculosReserva(fecha);

  logger.warn(`[LISTERO] Vehículo ${vehiculoId} enviado a taller — ${turnosAfectados.length} turnos afectados`);

  return { turnosAfectados, vehiculosReservaDisponibles };
}

// ─── Buscar vehículos de reserva ──────────────────────────────────────────────

export async function buscarVehiculosReserva(fecha: string): Promise<VehiculoDia[]> {
  const turnosSnap = await db
    .collection('turnos_dia')
    .where('fecha', '==', fecha)
    .get();

  const vehiculosEnUso = new Set(turnosSnap.docs.map((d) => d.data().vehiculoId));

  const vehiculosSnap = await db
    .collection('vehicles')
    .where('estadoHoy', 'in', ['disponible', 'reserva'])
    .get();

  return vehiculosSnap.docs
    .filter((d) => !vehiculosEnUso.has(d.id))
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        interno: data.internalNumber ?? data.interno ?? d.id,
        patente: data.patente ?? null,
        tipo: data.tipo ?? 'diesel',
        estadoHoy: data.estadoHoy ?? 'disponible',
        lineaAsignada: null,
        conductorAsignado: null,
        bateriaActual: data.bateriaActual ?? null,
        kilometrajeHoy: data.kilometrajeHoy ?? null,
        ultimaInspeccion: data.lastCheckDate ?? null,
        motivoBaja: null,
      } as VehiculoDia;
    });
}

// ─── Firma de conductor (cartón digital) ─────────────────────────────────────

export async function registrarFirma(
  turnoId: string,
  conductorId: string,
  horaFirma: string,
): Promise<void> {
  const turnoRef = db.collection('turnos_dia').doc(turnoId);
  const turnoSnap = await turnoRef.get();

  if (!turnoSnap.exists) throw new AppError(404, 'Turno no encontrado');

  const turno = turnoSnap.data() as TurnoDia;
  if (turno.conductorId !== conductorId && turno.conductorReservaId !== conductorId) {
    throw new AppError(403, 'El conductor no está asignado a este turno');
  }

  await turnoRef.update({
    firmaConductor: true,
    horaFirma,
    estado: 'activo',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`[LISTERO] Firma registrada: turno ${turnoId} conductor ${conductorId} a las ${horaFirma}`);
}

// ─── Resumen del día ──────────────────────────────────────────────────────────

export async function getResumenDiario(fecha: string): Promise<ResumenDiario> {
  const [turnos, conductores, alertasSnap, vehiculosSnap] = await Promise.all([
    getTurnosByFecha(fecha),
    getConductoresDia(fecha),
    db.collection('alertas_operativas').where('fecha', '==', fecha).where('atendida', '==', false).get(),
    db.collection('vehicles').get(),
  ]);

  const turnosSinConductor = turnos.filter((t) =>
    t.estado === 'sin_conductor' || t.estado === 'cancelado',
  );

  const impactoTotal = turnosSinConductor.reduce(
    (acc, t) => acc + (t.impactoIngresosEstimado ?? 0),
    0,
  );

  const lineasEnRiesgo = [
    ...new Set(
      turnosSinConductor
        .filter((t) => t.importanciaLinea >= 4)
        .map((t) => t.lineaId),
    ),
  ];

  const vehiculos = vehiculosSnap.docs.map((d) => d.data());
  const vehiculosEnTaller = vehiculos.filter((v) => v.estadoHoy === 'en_taller').length;
  const vehiculosDisponibles = vehiculos.filter((v) =>
    v.estadoHoy === 'disponible' || v.estadoHoy === 'en_servicio',
  ).length;

  const coberturaFlota =
    turnos.length > 0
      ? Math.round(
          (turnos.filter((t) => t.estado !== 'sin_conductor' && t.estado !== 'cancelado').length /
            turnos.length) *
            100,
        )
      : 100;

  return {
    fecha,
    turnosTotal: turnos.length,
    turnosCubiertos: turnos.filter(
      (t) => t.estado === 'activo' || t.estado === 'cubierto_reserva' || t.estado === 'completado',
    ).length,
    turnosSinConductor: turnosSinConductor.length,
    turnosCanceladosTotal: turnos.filter((t) => t.estado === 'cancelado').length,
    conductoresDisponibles: conductores.filter((c) => c.estadoHoy === 'disponible').length,
    conductoresAusentes: conductores.filter((c) => c.estadoHoy === 'ausente').length,
    conductoresReservaLibres: conductores.filter(
      (c) => c.estadoHoy === 'reserva' || (c.estadoHoy === 'disponible' && c.esConductorReserva),
    ).length,
    vehiculosDisponibles,
    vehiculosEnTaller,
    coberturaFlota,
    alertasActivas: alertasSnap.size,
    impactoIngresosRiesgoUSD: impactoTotal,
    lineasEnRiesgoIMM: lineasEnRiesgo,
  };
}
