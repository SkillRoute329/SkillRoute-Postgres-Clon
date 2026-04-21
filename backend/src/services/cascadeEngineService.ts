/**
 * cascadeEngineService — Motor de reactividad operativa UCOT
 *
 * Cada evento operativo (ausencia conductor, vehículo a taller, gap GPS)
 * dispara una cadena automática:
 *
 *   Evento → Evaluar impacto → Buscar solución → Crear alerta → Emitir Socket.io
 *
 * El largador / inspector reciben la alerta en tiempo real y confirman
 * la acción sugerida. El sistema nunca actúa sin confirmación humana —
 * solo propone y alerta.
 */

import { Server } from 'socket.io';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import logger from '../config/logger';
import {
  marcarAusencia,
  asignarReserva,
  marcarVehiculoEnTaller,
  getResumenDiario,
  TurnoDia,
  ConductorDia,
} from './listeroService';
import { fetchBusesLive, EMPRESA_CODES } from './immRealtimeService';

// ─── Tipos de alerta ──────────────────────────────────────────────────────────

export type TipoAlerta =
  | 'ausencia_conductor'
  | 'vehiculo_en_taller'
  | 'gap_frecuencia'
  | 'bunching'
  | 'rival_cercano'
  | 'infraccion_imminente'
  | 'reserva_disponible'
  | 'cobertura_critica';

export type UrgenciaAlerta = 'baja' | 'media' | 'alta' | 'critica';

export interface AlertaOperativa {
  id?: string;
  fecha: string;
  tipo: TipoAlerta;
  urgencia: UrgenciaAlerta;
  lineaId: string | null;
  conductorId: string | null;
  vehiculoId: string | null;
  turnoId: string | null;
  titulo: string;
  mensaje: string;
  accionSugerida: string | null;
  datosExtra: Record<string, unknown>;
  atendida: boolean;
  atendidaPor: string | null;
  horaAtendida: string | null;
  impactoIngresosUSD: number | null;
  createdAt: admin.firestore.Timestamp | null;
}

// ─── Singleton de la instancia Socket.io ─────────────────────────────────────

let _io: Server | null = null;

export function setSocketServer(io: Server): void {
  _io = io;
}

function emitAlerta(alerta: AlertaOperativa): void {
  if (_io) {
    _io.emit('alerta-operativa', alerta);
    logger.info(`[CASCADE] Socket emitido: ${alerta.tipo} urgencia=${alerta.urgencia}`);
  }
}

function emitResumenActualizado(resumen: unknown): void {
  if (_io) {
    _io.emit('resumen-diario-actualizado', resumen);
  }
}

// ─── Crear y persistir alerta ─────────────────────────────────────────────────

async function crearAlerta(alerta: Omit<AlertaOperativa, 'id' | 'createdAt'>): Promise<string> {
  const ref = db.collection('alertas_operativas').doc();
  const full: AlertaOperativa = {
    ...alerta,
    atendida: false,
    atendidaPor: null,
    horaAtendida: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
  };
  await ref.set(full);
  emitAlerta({ ...full, id: ref.id });
  return ref.id;
}

// ─── CASCADA 1: Ausencia de conductor ────────────────────────────────────────

export async function procesarAusenciaConductor(
  conductorId: string,
  conductorNombre: string,
  fecha: string,
  motivo: string,
  registradoPor: string,
): Promise<void> {
  logger.warn(`[CASCADE] Inicio cascada ausencia: ${conductorNombre} (${conductorId})`);

  const { turnosAfectados, reservasDisponibles } = await marcarAusencia(
    conductorId,
    fecha,
    motivo,
    registradoPor,
  );

  if (turnosAfectados.length === 0) {
    logger.info('[CASCADE] Ausencia registrada sin turnos asignados hoy');
    return;
  }

  for (const turno of turnosAfectados) {
    const importancia = turno.importanciaLinea ?? 2;
    const urgencia: UrgenciaAlerta =
      importancia >= 5 ? 'critica' : importancia >= 4 ? 'alta' : importancia >= 3 ? 'media' : 'baja';

    if (reservasDisponibles.length > 0) {
      // Hay reserva disponible → alerta MEDIA con sugerencia
      const reserva = reservasDisponibles[0];
      await crearAlerta({
        fecha,
        tipo: 'reserva_disponible',
        urgencia: 'media',
        lineaId: turno.lineaId,
        conductorId,
        vehiculoId: turno.vehiculoId,
        turnoId: turno.id ?? null,
        titulo: `Reserva disponible — L${turno.lineaId} ${turno.horaSalida}`,
        mensaje: `${conductorNombre} ausente (${motivo}). Coche ${turno.vehiculoInterno}, salida ${turno.horaSalida}. Reserva disponible: ${reserva.fullName}.`,
        accionSugerida: `Asignar a ${reserva.fullName} (INT ${reserva.internalNumber})`,
        datosExtra: {
          conductorAusenteNombre: conductorNombre,
          reservaId: reserva.id,
          reservaNombre: reserva.fullName,
          reservaInterno: reserva.internalNumber,
          motivoAusencia: motivo,
        },
        impactoIngresosUSD: turno.impactoIngresosEstimado,
      });
    } else {
      // Sin reserva → alerta según importancia de la línea
      const esCritica = importancia >= 4;
      await crearAlerta({
        fecha,
        tipo: esCritica ? 'infraccion_imminente' : 'ausencia_conductor',
        urgencia,
        lineaId: turno.lineaId,
        conductorId,
        vehiculoId: turno.vehiculoId,
        turnoId: turno.id ?? null,
        titulo: `${esCritica ? '⚠️ RIESGO IMM' : 'Sin cobertura'} — L${turno.lineaId} ${turno.horaSalida}`,
        mensaje: `${conductorNombre} ausente. Coche ${turno.vehiculoInterno} sin conductor para salida ${turno.horaSalida}. Sin reservas disponibles. ${esCritica ? 'Gap de frecuencia probable — riesgo de infracción IMM.' : ''}`,
        accionSugerida: esCritica
          ? 'Contactar al Jefe de Tráfico inmediatamente. Evaluar redistribución de servicios.'
          : 'Verificar si otro conductor puede extender su turno (con autorización)',
        datosExtra: {
          conductorAusenteNombre: conductorNombre,
          motivoAusencia: motivo,
          reservasDisponibles: 0,
          riesgoIMM: esCritica,
        },
        impactoIngresosUSD: turno.impactoIngresosEstimado,
      });
    }
  }

  // Verificar si la cobertura total cayó por debajo del umbral crítico (< 80%)
  const resumen = await getResumenDiario(fecha);
  emitResumenActualizado(resumen);

  if (resumen.coberturaFlota < 80) {
    await crearAlerta({
      fecha,
      tipo: 'cobertura_critica',
      urgencia: 'critica',
      lineaId: null,
      conductorId: null,
      vehiculoId: null,
      turnoId: null,
      titulo: `⚠️ Cobertura de flota crítica: ${resumen.coberturaFlota}%`,
      mensaje: `La cobertura operativa cayó al ${resumen.coberturaFlota}%. ${resumen.turnosSinConductor} servicios sin cobertura. Impacto estimado: USD ${resumen.impactoIngresosRiesgoUSD}. Líneas en riesgo IMM: ${resumen.lineasEnRiesgoIMM.join(', ') || 'ninguna aún'}.`,
      accionSugerida: 'Reunión urgente con Jefe de Tráfico. Activar protocolo de emergencia operativa.',
      datosExtra: resumen as unknown as Record<string, unknown>,
      impactoIngresosUSD: resumen.impactoIngresosRiesgoUSD,
    });
  }
}

// ─── CASCADA 2: Vehículo a taller ────────────────────────────────────────────

export async function procesarVehiculoEnTaller(
  vehiculoId: string,
  vehiculoInterno: string,
  motivo: string,
  registradoPor: string,
  fecha: string,
): Promise<void> {
  logger.warn(`[CASCADE] Inicio cascada vehículo en taller: interno ${vehiculoInterno}`);

  const { turnosAfectados, vehiculosReservaDisponibles } = await marcarVehiculoEnTaller(
    vehiculoId,
    motivo,
    registradoPor,
    fecha,
  );

  for (const turno of turnosAfectados) {
    const importancia = turno.importanciaLinea ?? 2;
    const urgencia: UrgenciaAlerta = importancia >= 4 ? 'alta' : 'media';

    if (vehiculosReservaDisponibles.length > 0) {
      const reemplzo = vehiculosReservaDisponibles[0];
      await crearAlerta({
        fecha,
        tipo: 'vehiculo_en_taller',
        urgencia: 'media',
        lineaId: turno.lineaId,
        conductorId: turno.conductorId,
        vehiculoId,
        turnoId: turno.id ?? null,
        titulo: `Coche ${vehiculoInterno} a taller — reemplazo disponible`,
        mensaje: `Coche ${vehiculoInterno} enviado a taller (${motivo}). Afecta L${turno.lineaId} salida ${turno.horaSalida}. Coche de reserva disponible: interno ${reemplzo.interno}.`,
        accionSugerida: `Reasignar a coche ${reemplzo.interno}. El conductor ${turno.conductorNombre ?? ''} puede continuar con el vehículo de reserva.`,
        datosExtra: {
          vehiculoAveriado: vehiculoInterno,
          motivoBaja: motivo,
          reemplazoCocheInterno: reemplzo.interno,
          reemplazoCocheId: reemplzo.id,
          tipoReemplazo: reemplzo.tipo,
        },
        impactoIngresosUSD: null,
      });
    } else {
      await crearAlerta({
        fecha,
        tipo: importancia >= 4 ? 'infraccion_imminente' : 'vehiculo_en_taller',
        urgencia,
        lineaId: turno.lineaId,
        conductorId: turno.conductorId,
        vehiculoId,
        turnoId: turno.id ?? null,
        titulo: `${urgencia === 'alta' ? '⚠️ ' : ''}Coche ${vehiculoInterno} a taller — sin reemplazo`,
        mensaje: `Coche ${vehiculoInterno} enviado a taller (${motivo}). Sin vehículos de reserva disponibles. L${turno.lineaId} salida ${turno.horaSalida} en riesgo.`,
        accionSugerida: 'Verificar taller para liberación urgente. Evaluar redistribución de servicios en la línea.',
        datosExtra: {
          vehiculoAveriado: vehiculoInterno,
          motivoBaja: motivo,
          reservasDisponibles: 0,
        },
        impactoIngresosUSD: turno.impactoIngresosEstimado,
      });
    }
  }

  const resumen = await getResumenDiario(fecha);
  emitResumenActualizado(resumen);
}

// ─── CASCADA 3: Monitoreo GPS — gap de frecuencia y bunching ──────────────────

const UMBRAL_GAP_MIN = 1.5; // gap > 1.5x la frecuencia programada → alerta
const UMBRAL_BUNCHING_KM = 0.8; // dos buses < 0.8km → bunching

interface BusPos {
  interno: string;
  lat: number;
  lng: number;
  linea: string;
}

function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function analizarFrecuenciasGPS(fecha: string): Promise<void> {
  try {
    const geoJson = await fetchBusesLive(EMPRESA_CODES.UCOT);
    const features = geoJson?.features ?? [];
    if (features.length === 0) return;

    // Agrupar por línea
    const porLinea = new Map<string, BusPos[]>();
    for (const f of features) {
      const props = f.properties;
      const linea = String(props.linea ?? '');
      if (!linea) continue;
      if (!porLinea.has(linea)) porLinea.set(linea, []);
      const [lng, lat] = f.geometry.coordinates;
      porLinea.get(linea)!.push({
        interno: String(props.codigoBus ?? ''),
        lat,
        lng,
        linea,
      });
    }

    // Alertas ya emitidas en esta corrida (evitar duplicados)
    const alertasEmitidas = new Set<string>();

    for (const [lineaId, buses] of porLinea.entries()) {
      if (buses.length < 2) continue;

      // Detectar bunching: dos buses muy juntos
      for (let i = 0; i < buses.length; i++) {
        for (let j = i + 1; j < buses.length; j++) {
          const dist = distanciaKm(buses[i].lat, buses[i].lng, buses[j].lat, buses[j].lng);
          const key = `bunching-${lineaId}-${buses[i].interno}-${buses[j].interno}`;

          if (dist < UMBRAL_BUNCHING_KM && !alertasEmitidas.has(key)) {
            alertasEmitidas.add(key);

            // Verificar si ya hay alerta reciente de este tipo en Firestore (últimas 2h)
            const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const existente = await db
              .collection('alertas_operativas')
              .where('tipo', '==', 'bunching')
              .where('lineaId', '==', lineaId)
              .where('createdAt', '>', hace2h)
              .limit(1)
              .get();

            if (!existente.empty) continue;

            await crearAlerta({
              fecha,
              tipo: 'bunching',
              urgencia: 'alta',
              lineaId,
              conductorId: null,
              vehiculoId: null,
              turnoId: null,
              titulo: `Bunching detectado — Línea ${lineaId}`,
              mensaje: `Internos ${buses[i].interno} y ${buses[j].interno} separados por ${dist.toFixed(2)}km (umbral: ${UMBRAL_BUNCHING_KM}km). Gap de frecuencia en tramos anteriores.`,
              accionSugerida: `Inspector: ordenar al interno ${buses[i].interno} que espere en próxima parada. Al ${buses[j].interno} que acelere el ritmo.`,
              datosExtra: {
                bus1: buses[i].interno,
                bus2: buses[j].interno,
                distanciaKm: dist,
                lat1: buses[i].lat,
                lng1: buses[i].lng,
                lat2: buses[j].lat,
                lng2: buses[j].lng,
              },
              impactoIngresosUSD: null,
            });
          }
        }
      }
    }
  } catch (err) {
    logger.error('[CASCADE] Error analizando frecuencias GPS', { err: String(err) });
  }
}

// ─── Marcar alerta como atendida ──────────────────────────────────────────────

export async function atenderAlerta(
  alertaId: string,
  atendidaPor: string,
): Promise<void> {
  const hora = new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
  await db.collection('alertas_operativas').doc(alertaId).update({
    atendida: true,
    atendidaPor,
    horaAtendida: hora,
  });
  if (_io) {
    _io.emit('alerta-atendida', { alertaId, atendidaPor, hora });
  }
  logger.info(`[CASCADE] Alerta ${alertaId} atendida por ${atendidaPor}`);
}

// ─── Obtener alertas activas ──────────────────────────────────────────────────

export async function getAlertasActivas(fecha: string): Promise<AlertaOperativa[]> {
  const snap = await db
    .collection('alertas_operativas')
    .where('fecha', '==', fecha)
    .where('atendida', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AlertaOperativa));
}

export async function getHistorialAlertas(fecha: string): Promise<AlertaOperativa[]> {
  const snap = await db
    .collection('alertas_operativas')
    .where('fecha', '==', fecha)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AlertaOperativa));
}
