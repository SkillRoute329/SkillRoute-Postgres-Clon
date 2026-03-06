/**
 * Motor de Vínculo Triple (Vínculo de Oro): COCHE + CONDUCTOR + SERVICIO.
 * Sincroniza en tiempo real: vehiculos, users/personal, JSON Maestro y servicio_estado.
 * Permite al Listero asignar conductor a servicio sin borrar registro histórico.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  FleetService,
  UserService,
  ServicioEstadoService,
  ProgramacionDiariaService,
  ShiftService,
} from '../services/firestore';
import type { Vehicle, User } from '../services/firestore/types';
import type { ServicioEstadoRecord } from '../services/firestore/servicioEstado';
import type { ProgramacionDiariaRecord } from '../services/firestore/programacionDiaria';
import { getMasterServicios, getMasterServicioById } from '../data/ucotMaster';
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export interface UseAssignmentEngineOptions {
  date?: string;
}

export interface UseAssignmentEngineResult {
  /** Coches (vehiculos) en tiempo real */
  vehicles: Vehicle[];
  /** Conductores (users con rol conductor) */
  drivers: User[];
  /** Servicios del JSON Maestro para la fecha/línea */
  servicios: Array<{ servicioId: string; linea: string; serviceNumber: string }>;
  /** Estado dinámico por servicio (cocheActual, choferActual, status) */
  servicioEstados: ServicioEstadoRecord[];
  /** Asignaciones programacion_diaria del día */
  programacion: ProgramacionDiariaRecord[];
  /** Asignar conductor a servicio (Vínculo de Oro): actualiza servicio_estado + programacion_diaria sin borrar historial */
  assignDriverToService: (
    servicioId: string,
    choferId: string,
    cocheId: string,
    meta?: { linea?: string; servicio?: string; horaInicio?: string },
  ) => Promise<void>;
  /** Conductor con último fin de turno ayer (para retén 9h) */
  lastEndByDriver: Map<string, string>;
  /** Turnos de ayer (para validar 9h descanso) */
  yesterdayShifts: Array<{ assignedTo?: string; driverId?: string; end?: string }>;
  loading: boolean;
  error: string | null;
}

export function useAssignmentEngine(
  options: UseAssignmentEngineOptions = {},
): UseAssignmentEngineResult {
  const date = options.date ?? todayISO();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [servicioEstados, setServicioEstados] = useState<ServicioEstadoRecord[]>([]);
  const [programacion, setProgramacion] = useState<ProgramacionDiariaRecord[]>([]);
  const [yesterdayShifts, setYesterdayShifts] = useState<
    Array<{ assignedTo?: string; driverId?: string; end?: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const servicios = getMasterServicios();
  const drivers = users.filter(
    (u) =>
      String(u.role ?? '').toLowerCase() === 'conductor' ||
      String(u.role ?? '').toLowerCase() === 'driver' ||
      String(u.rol ?? '').toLowerCase() === 'conductor',
  );

  useEffect(() => {
    const unsubV = FleetService.subscribeVehicles(setVehicles);
    return () => unsubV();
  }, []);

  useEffect(() => {
    const unsubU = UserService.subscribe(setUsers);
    return () => unsubU();
  }, []);

  useEffect(() => {
    const unsub = ServicioEstadoService.subscribeByDate(date, setServicioEstados);
    return () => unsub();
  }, [date]);

  useEffect(() => {
    ProgramacionDiariaService.getByDate(date)
      .then(setProgramacion)
      .catch(() => setProgramacion([]));
  }, [date]);

  useEffect(() => {
    const yesterday = new Date(date + 'T12:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    ShiftService.getAll(yesterdayStr)
      .then((shifts: unknown[]) => {
        setYesterdayShifts(
          (shifts as Array<{ assignedTo?: string; driverId?: string; end?: string }>) ?? [],
        );
      })
      .catch(() => setYesterdayShifts([]));
  }, [date]);

  useEffect(() => {
    setLoading(false);
  }, [vehicles, users, servicioEstados, programacion]);

  const lastEndByDriver = new Map<string, string>();
  yesterdayShifts.forEach((s) => {
    const driverId = String((s as { driverId?: string }).driverId ?? s.assignedTo ?? '');
    if (!driverId) return;
    const end = s.end ?? '';
    if (!end) return;
    const current = lastEndByDriver.get(driverId);
    if (!current || end > current) lastEndByDriver.set(driverId, end);
  });

  const assignDriverToService = useCallback(
    async (
      servicioId: string,
      choferId: string,
      cocheId: string,
      meta?: { linea?: string; servicio?: string; horaInicio?: string },
    ) => {
      setError(null);
      const master = getMasterServicioById(servicioId);
      const linea = meta?.linea ?? master?.linea ?? servicioId.split('_')[0];
      const servicioLabel = meta?.servicio ?? master?.serviceNumber ?? servicioId;
      const horaInicio = meta?.horaInicio ?? master?.horaInicioReferencia ?? undefined;

      await ServicioEstadoService.assignDriverToService(servicioId, date, choferId, cocheId, {
        linea,
        servicio: servicioLabel,
        horaInicio,
      });

      await ProgramacionDiariaService.add({
        date,
        linea,
        servicio: servicioId,
        vehiculo: cocheId,
        conductor: choferId,
        horaInicio,
      });

      const updated = await ProgramacionDiariaService.getByDate(date);
      setProgramacion(updated);
    },
    [date],
  );

  return {
    vehicles,
    drivers,
    servicios: servicios.map((s) => ({
      servicioId: s.servicioId,
      linea: s.linea,
      serviceNumber: s.serviceNumber ?? s.servicioId,
    })),
    servicioEstados,
    programacion,
    assignDriverToService,
    lastEndByDriver,
    yesterdayShifts,
    loading,
    error,
  };
}

/** Filtra conductores que no tienen daily_shift activo en el momento dado (para ASIGNAR SUPLENTE). */
export function getConductoresLibresEnMomento(
  drivers: User[],
  shiftsAtTime: Array<{ assignedTo?: string; driverId?: string; start?: string; end?: string }>,
  timeStr: string,
): User[] {
  const timeMinutes = parseTimeToMinutes(timeStr);
  if (Number.isNaN(timeMinutes)) return drivers;

  const assignedAtTime = new Set<string>();
  shiftsAtTime.forEach((s) => {
    const start = parseTimeToMinutes((s.start ?? '').slice(0, 5));
    const end = parseTimeToMinutes((s.end ?? '').slice(0, 5));
    if (Number.isNaN(start) || Number.isNaN(end)) return;
    if (timeMinutes >= start && timeMinutes <= end) {
      const id = String((s as { driverId?: string }).driverId ?? s.assignedTo ?? '');
      if (id) assignedAtTime.add(id);
    }
  });

  return drivers.filter((d) => !assignedAtTime.has(String(d.id ?? d.uid ?? '')));
}

function parseTimeToMinutes(value: string): number {
  if (!value || typeof value !== 'string') return NaN;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return NaN;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN;
  return h * 60 + min;
}
