/**
 * Centro de Mando Operativo – Panel del Listero.
 * Cerebro Operativo CEO: servicio_estado, JSON Maestro, ASIGNAR SUPLENTE (conductores libres en momento).
 */
import { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  Users,
  Bus,
  Calendar,
  Loader2,
  Wrench,
  PlusCircle,
  UserPlus,
  AlertCircle,
  MapPin,
  FileWarning,
} from 'lucide-react';
import {
  ShiftService,
  FleetService,
  UserService,
  AssignmentConflictService,
  ProgramacionDiariaService,
  CartonService,
  PersonalService,
  ServicioEstadoService,
  ActiveAssignmentsService,
} from '../../services/firestore';
import type { AssignmentConflict, Shift, Vehicle, User } from '../../services/firestore/types';
import type { ProgramacionDiariaRecord } from '../../services/firestore/programacionDiaria';
import type { ServicioEstadoRecord } from '../../services/firestore/servicioEstado';
import {
  validateAssignment,
  validateDobleTurno,
  MAX_HORAS_DIA_UCOT,
} from '../../utils/syndicateRules';
import { computeSemaforo } from '../../utils/semaforoListero';
import { getConductoresLibresEnMomento } from '../../hooks/useAssignmentEngine';
import { getMasterServicios, getMasterServicioById } from '../../data/ucotMaster';
import QuickSearchControl, {
  type QuickSearchFilters,
} from '../../components/traffic/QuickSearchControl';
import PersonalBulkUpload from '../../components/traffic/PersonalBulkUpload';
import { reportarAveria, sugerirReemplazoAveria } from '../../services/assignmentService';
import type { ReportarAveriaResult } from '../../services/assignmentService';
import { InspeccionesFlotaService } from '../../services/firestore/inspeccionesFlota';
import { MensajesInternosService } from '../../services/firestore/mensajesInternos';
import { SystemConfigService } from '../../services/firestore/systemConfig';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function yesterdayISO(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

const OPERATIONAL_STATUSES = ['ACTIVE', 'OPERATIONAL', 'OK', 'active', 'operational'];

export default function DailyListManager() {
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [alerts, setAlerts] = useState<AssignmentConflict[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [yesterdayShifts, setYesterdayShifts] = useState<Shift[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [modalAlert, setModalAlert] = useState<AssignmentConflict | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [programacionList, setProgramacionList] = useState<ProgramacionDiariaRecord[]>([]);
  const [lineas, setLineas] = useState<string[]>([]);
  const [servicios, setServicios] = useState<
    { id: string; linea: string; serviceNumber?: string }[]
  >([]);
  const [selectedLinea, setSelectedLinea] = useState('');
  const [selectedServicio, setSelectedServicio] = useState('');
  const [selectedVehiculo, setSelectedVehiculo] = useState('');
  const [selectedConductor, setSelectedConductor] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [saving, setSaving] = useState(false);
  const [exceptionDriverIds, setExceptionDriverIds] = useState<Set<string>>(new Set());
  const [exceptionList, setExceptionList] = useState<Array<{ driverId: string; type: string }>>([]);
  const [suplenteModal, setSuplenteModal] = useState<{
    servicioId: string;
    hora: string;
    conductorActual?: string;
  } | null>(null);
  const [averiaResult, setAveriaResult] = useState<ReportarAveriaResult | null>(null);
  const [quickFilters, setQuickFilters] = useState<QuickSearchFilters>({
    puntoControlId: '',
    puntoControlNombre: '',
    tiempoDesde: '',
    tiempoHasta: '',
    soloLibresAhora: false,
    query: '',
  });
  const [estadoList, setEstadoList] = useState<ServicioEstadoRecord[]>([]);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [dobleTurnoModal, setDobleTurnoModal] = useState(false);
  const [dobleTurnoForm, setDobleTurnoForm] = useState({
    t1Start: '06:00',
    t1End: '12:00',
    t2Start: '13:00',
    t2End: '19:00',
  });
  const [dobleTurnoResult, setDobleTurnoResult] = useState<{
    valid: boolean;
    totalHoras?: number;
    error?: string;
  } | null>(null);
  const [infraccionModal, setInfraccionModal] = useState<{
    servicioId: string;
    coche: string;
    linea: string;
  } | null>(null);
  const [infraccionDesc, setInfraccionDesc] = useState('');
  const [infraccionTipo, setInfraccionTipo] = useState<'infraccion' | 'multa' | 'observacion'>(
    'infraccion',
  );
  const [infraccionSaving, setInfraccionSaving] = useState(false);
  const [cambioTurnoAlerts, setCambioTurnoAlerts] = useState<
    Array<{ id?: string; titulo: string; mensaje: string; createdAt: string }>
  >([]);
  const [toleranciaMinutos, setToleranciaMinutos] = useState<number | undefined>(undefined);
  const [averiaModal, setAveriaModal] = useState<{ cocheId: string; cocheLabel: string } | null>(
    null,
  );
  const [averiaConfirmando, setAveriaConfirmando] = useState(false);

  useEffect(() => {
    SystemConfigService.get()
      .then((c) => setToleranciaMinutos(c.toleranciaMinutos))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = MensajesInternosService.subscribeCambioTurnoAlerts((list) => {
      setCambioTurnoAlerts(list.slice(0, 5));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    PersonalService.getExceptionsForDate(selectedDate)
      .then((list) => {
        setExceptionDriverIds(new Set(list.map((e) => e.driverId)));
        setExceptionList(list.map((e) => ({ driverId: e.driverId, type: e.type ?? 'otro' })));
      })
      .catch(() => {
        setExceptionDriverIds(new Set());
        setExceptionList([]);
      });
  }, [selectedDate]);

  useEffect(() => {
    const unsubAlerts = AssignmentConflictService.subscribe(setAlerts);
    return () => unsubAlerts();
  }, []);

  useEffect(() => {
    const unsubShifts = ShiftService.subscribe((s) => setShifts(s), selectedDate);
    return () => unsubShifts();
  }, [selectedDate]);

  useEffect(() => {
    const yesterday = yesterdayISO(selectedDate);
    ShiftService.getAll(yesterday)
      .then(setYesterdayShifts)
      .catch(() => setYesterdayShifts([]));
  }, [selectedDate]);

  useEffect(() => {
    const unsubVehicles = FleetService.subscribeVehicles(setVehicles);
    return () => unsubVehicles();
  }, []);

  useEffect(() => {
    const unsubUsers = UserService.subscribe(setUsers);
    return () => unsubUsers();
  }, []);

  useEffect(() => {
    setLoading(false);
  }, [alerts, shifts, vehicles, users]);

  useEffect(() => {
    ProgramacionDiariaService.getByDate(selectedDate)
      .then(setProgramacionList)
      .catch(() => setProgramacionList([]));
  }, [selectedDate]);

  useEffect(() => {
    const unsub = ServicioEstadoService.subscribeByDate(selectedDate, setEstadoList);
    return () => unsub();
  }, [selectedDate]);

  useEffect(() => {
    const fromMaster = CartonService.getLineIdsFromMaster();
    if (fromMaster.length > 0) setLineas(fromMaster);
    else
      CartonService.getLineIds()
        .then(setLineas)
        .catch(() => setLineas([]));
  }, []);

  useEffect(() => {
    if (!selectedLinea) {
      setServicios([]);
      setSelectedServicio('');
      return;
    }
    const fromMaster = CartonService.getServiciosFromMaster(selectedLinea);
    if (fromMaster.length > 0) {
      setServicios(fromMaster);
      setSelectedServicio('');
      return;
    }
    CartonService.getAll(selectedLinea)
      .then((data: unknown[]) => {
        const list = (data || []).map((x: Record<string, unknown>) => ({
          id: String(x.id ?? ''),
          linea: String(x.linea ?? selectedLinea),
          serviceNumber: String(x.serviceNumber ?? x.id ?? ''),
        }));
        setServicios(list);
        setSelectedServicio('');
      })
      .catch(() => setServicios([]));
  }, [selectedLinea]);

  const handleAsignar = async () => {
    if (!selectedLinea || !selectedServicio) return;
    setSaving(true);
    setValidationError(null);
    try {
      await ProgramacionDiariaService.add({
        date: selectedDate,
        linea: selectedLinea,
        servicio: selectedServicio,
        vehiculo: selectedVehiculo,
        conductor: selectedConductor,
        horaInicio: horaInicio || undefined,
      });
      setSelectedServicio('');
      setSelectedVehiculo('');
      setSelectedConductor('');
      setHoraInicio('');
      const updated = await ProgramacionDiariaService.getByDate(selectedDate);
      setProgramacionList(updated);
      setValidationError(null);
    } catch (e) {
      console.error(e);
      setValidationError('Error al guardar la asignación.');
    } finally {
      setSaving(false);
    }
  };

  const assignedVehicleIds = useMemo(() => {
    const set = new Set<string>();
    shifts.forEach((s) => {
      const v = s.vehicleId != null ? String(s.vehicleId) : '';
      if (v) set.add(v);
    });
    programacionList.forEach((p) => {
      if (p.vehiculo) set.add(String(p.vehiculo));
    });
    return set;
  }, [shifts, programacionList]);

  const assignedUserIds = useMemo(() => {
    const set = new Set<string>();
    shifts.forEach((s) => {
      [
        s.assignedTo,
        (s as Shift & { driverId?: string }).driverId,
        (s as Shift & { guardId?: string }).guardId,
      ].forEach((id) => {
        if (id != null) set.add(String(id));
      });
    });
    return set;
  }, [shifts]);

  const vehiclesOperativosSinAsignar = useMemo(() => {
    return vehicles.filter(
      (v) =>
        OPERATIONAL_STATUSES.includes(String(v.status ?? '').toUpperCase()) &&
        !assignedVehicleIds.has(String(v.id)),
    );
  }, [vehicles, assignedVehicleIds]);

  const personalDeLista = useMemo(() => {
    return users.filter((u) => !assignedUserIds.has(String(u.id ?? u.uid ?? '')));
  }, [users, assignedUserIds]);

  const lastEndByDriver = useMemo(() => {
    const map = new Map<string, string>();
    yesterdayShifts.forEach((s) => {
      const driverId = String((s as Shift & { driverId?: string }).driverId ?? s.assignedTo ?? '');
      if (!driverId) return;
      const end = (s.end ?? '') as string;
      if (!end) return;
      const current = map.get(driverId);
      if (!current || end > current) map.set(driverId, end);
    });
    return map;
  }, [yesterdayShifts]);

  const conflictShiftStart = useMemo(() => {
    if (!modalAlert?.shiftId) return '';
    const shift = shifts.find((s) => String(s.id) === String(modalAlert.shiftId));
    return (shift?.start as string) ?? '';
  }, [modalAlert?.shiftId, shifts]);

  const personalReten = useMemo(() => {
    if (!conflictShiftStart) return personalDeLista;
    return personalDeLista.filter((u) => {
      const uid = String(u.id ?? u.uid ?? '');
      const lastEnd = lastEndByDriver.get(uid);
      if (!lastEnd) return true;
      const result = validateAssignment(uid, conflictShiftStart, lastEnd);
      return result.valid;
    });
  }, [personalDeLista, lastEndByDriver, conflictShiftStart]);

  const conductores = useMemo(() => {
    return users.filter((u) => /conductor|driver/i.test(String(u.role ?? u.rol ?? '')));
  }, [users]);

  const conductoresLibres1310 = useMemo(() => {
    return getConductoresLibresEnMomento(
      conductores,
      shifts.map((s) => ({
        start: s.start,
        end: s.end,
        assignedTo: s.assignedTo != null ? String(s.assignedTo) : undefined,
        driverId: (s as Shift & { driverId?: string }).driverId,
      })),
      '13:10',
    );
  }, [conductores, shifts]);

  const serviciosConHoraReferencia = useMemo(() => {
    return getMasterServicios().filter((s) => s.horaInicioReferencia);
  }, []);

  type Semaforo = 'verde' | 'naranja' | 'rojo' | 'amarillo';
  interface FilaServicio {
    id: string;
    servicioId: string;
    linea: string;
    coche: string | null;
    conductor: string | null;
    horaInicio: string;
    semaforo: Semaforo;
    atrasoMinutos: number;
    estado?: ServicioEstadoRecord;
    record: ProgramacionDiariaRecord;
  }

  const filasUnificadas = useMemo((): FilaServicio[] => {
    const estadoByServicio = new Map(estadoList.map((e) => [e.servicioId, e]));
    return programacionList.map((p) => {
      const estado = estadoByServicio.get(p.servicio) ?? undefined;
      const coche = estado?.cocheActual ?? (p.vehiculo ? String(p.vehiculo) : null);
      const chofer = estado?.choferActual ?? (p.conductor ? String(p.conductor) : null);
      const atrasoMinutos = estado?.atrasoMinutos ?? 0;
      const status = estado?.status ?? 'pendiente';
      const semaforo = computeSemaforo(
        !!coche,
        !!chofer,
        status,
        atrasoMinutos,
        toleranciaMinutos,
      ) as Semaforo;

      return {
        id: p.id,
        servicioId: p.servicio,
        linea: p.linea,
        coche,
        conductor: chofer,
        horaInicio: p.horaInicio ?? '',
        semaforo,
        atrasoMinutos,
        estado,
        record: p,
      };
    });
  }, [programacionList, estadoList, toleranciaMinutos]);

  /** Conductores en retén que cumplen 9h; se ocultan Licencia Médica / falta_medica (RRHH estratégico). */
  const conductoresEnRetenParaModal = useMemo(() => {
    const hora = suplenteModal?.hora;
    if (!hora) return [];
    const conLicenciaMedica = new Set(
      exceptionList
        .filter((e) => e.type === 'falta_medica' || e.type === 'licencia')
        .map((e) => e.driverId),
    );
    return personalDeLista.filter((u) => {
      const uid = String(u.id ?? u.uid);
      if (conLicenciaMedica.has(uid)) return false;
      const lastEnd = lastEndByDriver.get(uid);
      if (!lastEnd) return true;
      return validateAssignment(uid, hora, lastEnd).valid;
    });
  }, [personalDeLista, lastEndByDriver, suplenteModal?.hora, exceptionList]);

  const handleAsignarSuplente = async (
    servicioId: string,
    hora: string,
    nuevoConductorId: string,
    cocheId: string,
  ) => {
    setValidationError(null);
    try {
      await ServicioEstadoService.assignDriverToService(
        servicioId,
        selectedDate,
        nuevoConductorId,
        cocheId,
        {
          linea: getMasterServicioById(servicioId)?.linea,
          servicio: getMasterServicioById(servicioId)?.serviceNumber,
          horaInicio: hora,
        },
      );
      await ActiveAssignmentsService.recordAssignment(
        servicioId,
        selectedDate,
        cocheId,
        nuevoConductorId,
        {
          linea: getMasterServicioById(servicioId)?.linea,
          horaInicio: hora,
        },
      );
      await ProgramacionDiariaService.add({
        date: selectedDate,
        linea: getMasterServicioById(servicioId)?.linea ?? servicioId,
        servicio: servicioId,
        vehiculo: cocheId,
        conductor: nuevoConductorId,
        horaInicio: hora,
      });
      const updated = await ProgramacionDiariaService.getByDate(selectedDate);
      setProgramacionList(updated);
      setSuplenteModal(null);
    } catch (e) {
      console.error(e);
      setValidationError('Error al asignar suplente.');
    }
  };

  const sugerenciaReemplazoAveria = useMemo(() => {
    if (!modalAlert?.vehicleId) return null;
    return sugerirReemplazoAveria(String(modalAlert.vehicleId), vehicles, assignedVehicleIds);
  }, [modalAlert?.vehicleId, vehicles, assignedVehicleIds]);

  const handleResolve = (alert: AssignmentConflict) => setModalAlert(alert);
  const handleCloseModal = () => {
    setModalAlert(null);
    setResolvingId(null);
    setValidationError(null);
  };

  const handlePatchShift = async (patch: { vehicleId?: string; assignedTo?: string }) => {
    if (!modalAlert?.shiftId) {
      handleCloseModal();
      return;
    }
    setValidationError(null);

    if (patch.assignedTo) {
      const lastEnd = lastEndByDriver.get(patch.assignedTo);
      const result = validateAssignment(patch.assignedTo, conflictShiftStart, lastEnd ?? '');
      if (!result.valid) {
        setValidationError(
          result.error ?? 'La asignación no cumple la regla de 9 h de descanso (UNOTT).',
        );
        return;
      }
    }

    setResolvingId(modalAlert.id);
    try {
      const updatePayload = patch.vehicleId
        ? { vehicleId: patch.vehicleId }
        : { assignedTo: patch.assignedTo, driverId: patch.assignedTo };
      await ShiftService.update(modalAlert.shiftId, updatePayload);
      await AssignmentConflictService.markResolved(modalAlert.id);
      handleCloseModal();
    } catch (e) {
      console.error(e);
      setValidationError('Error al guardar. Intente de nuevo.');
    } finally {
      setResolvingId(null);
    }
  };

  const { user: authUser } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {cambioTurnoAlerts.length > 0 && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 px-4 py-2 flex items-center gap-2 flex-wrap">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <span className="text-amber-200 font-medium text-sm">
            Solicitudes de cambio de turno (sin refrescar):
          </span>
          {cambioTurnoAlerts.map((a, i) => (
            <span key={a.id ?? i} className="text-xs bg-slate-800/80 px-2 py-1 rounded">
              {a.titulo}: {a.mensaje}
            </span>
          ))}
        </div>
      )}
      <header className="shrink-0 p-4 border-b border-slate-800 bg-slate-900/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary-500" />
            Lista Diaria – Centro de Mando
          </h1>
          <a
            href="/dashboard/traffic/ceo"
            className="text-sm font-medium text-primary-400 hover:text-primary-300 flex items-center gap-1"
          >
            Dashboard CEO →
          </a>
        </div>
        <p className="text-slate-400 text-sm mt-1">
          Alertas de conflicto, personal y flota disponible, grilla del día.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div>
            <label className="text-slate-400 text-sm mr-2">Fecha:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <button
            type="button"
            onClick={async () => {
              const master = getMasterServicioById('1129');
              const has1129 = programacionList.some((p) => p.servicio === '1129');
              if (!has1129) {
                await ProgramacionDiariaService.add({
                  date: selectedDate,
                  linea: master?.linea ?? '329h',
                  servicio: '1129',
                  vehiculo: '115',
                  conductor: '',
                  horaInicio: '08:00',
                });
                const updated = await ProgramacionDiariaService.getByDate(selectedDate);
                setProgramacionList(updated);
              }
              await ServicioEstadoService.setState('1129', selectedDate, {
                atrasoMinutos: 15,
                cocheActual: '115',
                linea: master?.linea ?? '329h',
                servicio: '1129',
                status: 'activo',
                horaInicio: '08:00',
              });
            }}
            className="px-3 py-2 rounded-lg bg-amber-900/50 border border-amber-600/50 text-amber-200 text-sm hover:bg-amber-800/50"
            title="Verificación: deja Servicio 1129 (Coche 115) en estado AMARILLO con atraso 15 min"
          >
            Simular atraso 15 min (1129)
          </button>
          <button
            type="button"
            onClick={async () => {
              const master = getMasterServicioById('1129');
              const linea1129 = master?.linea ?? '329h';
              const has1129 = programacionList.some((p) => p.servicio === '1129');
              if (!has1129) {
                await ProgramacionDiariaService.add({
                  date: selectedDate,
                  linea: linea1129,
                  servicio: '1129',
                  vehiculo: '115',
                  conductor: '',
                  horaInicio: '15:00',
                });
                const updated = await ProgramacionDiariaService.getByDate(selectedDate);
                setProgramacionList(updated);
              }
              await ServicioEstadoService.setState('1129', selectedDate, {
                cocheActual: '115',
                choferActual: null,
                status: 'activo',
                linea: linea1129,
                servicio: '1129',
                horaInicio: '15:00',
              });
            }}
            className="px-3 py-2 rounded-lg bg-red-900/50 border border-red-600/50 text-red-200 text-sm hover:bg-red-800/50"
            title="Verificación: Servicio 1129 sin chofer → ROJO + Asignar Suplente (conductores con 9h descanso)"
          >
            Simular falta chofer (1129)
          </button>
          <button
            type="button"
            onClick={() => {
              setDobleTurnoModal(true);
              setDobleTurnoResult(null);
            }}
            className="px-3 py-2 rounded-lg bg-indigo-900/50 border border-indigo-600/50 text-indigo-200 text-sm hover:bg-indigo-800/50"
          >
            Habilitar Doble Turno
          </button>
          {/* Nueva asignación (Listero): Servicio + Coche + Conductor → programacion_diaria */}
          <div className="flex flex-wrap items-end gap-2 mt-2 lg:mt-0">
            <div>
              <label className="block text-slate-400 text-xs mb-1">Línea</label>
              <select
                value={selectedLinea}
                onChange={(e) => setSelectedLinea(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm min-w-[72px]"
              >
                <option value="">—</option>
                {lineas.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Servicio</label>
              <select
                value={selectedServicio}
                onChange={(e) => setSelectedServicio(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm min-w-[80px]"
                disabled={!selectedLinea}
              >
                <option value="">—</option>
                {servicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.serviceNumber ?? s.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Coche</label>
              <select
                value={selectedVehiculo}
                onChange={(e) => setSelectedVehiculo(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm min-w-[72px]"
              >
                <option value="">—</option>
                {vehicles.map((v) => (
                  <option key={String(v.id)} value={String(v.id)}>
                    {v.internalNumber ?? v.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Conductor</label>
              <select
                value={selectedConductor}
                onChange={(e) => setSelectedConductor(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm min-w-[100px]"
              >
                <option value="">—</option>
                {users.map((u) => {
                  const id = String(u.id ?? u.uid);
                  const name =
                    u.fullName ||
                    [u.firstName, u.lastName].filter(Boolean).join(' ') ||
                    u.internalNumber ||
                    u.uid;
                  const hasException = exceptionDriverIds.has(id);
                  return (
                    <option key={id} value={id}>
                      {name}
                      {hasException ? ' (Excepción día)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Hora</label>
              <input
                type="text"
                placeholder="07:30"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm w-16"
              />
            </div>
            <button
              type="button"
              onClick={handleAsignar}
              disabled={saving || !selectedLinea || !selectedServicio}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-medium text-sm"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PlusCircle className="w-4 h-4" />
              )}
              Asignar
            </button>
          </div>
        </div>
        {validationError && (
          <p className="mt-2 text-red-400 text-sm" role="alert">
            {validationError}
          </p>
        )}
        <QuickSearchControl
          drivers={users}
          shiftsToday={shifts.map((s) => ({
            start: s.start,
            end: s.end,
            assignedTo: s.assignedTo != null ? String(s.assignedTo) : undefined,
            driverId: (s as Shift & { driverId?: string }).driverId,
          }))}
          nowTime="13:10"
          roleFilter="conductor"
          onChange={(f) => setQuickFilters(f)}
          initialFilters={quickFilters}
          className="mt-4"
        />
      </header>

      {/* Verificación: Avería Coche 104 a las 15:00 → sugerir reemplazo por categoría LINEA_FIJA */}
      <section
        className="mx-4 mt-4 p-4 rounded-xl border border-amber-700/50 bg-slate-800/30"
        data-testid="reportar-averia-section"
      >
        <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4" />
          Reportar avería (Rotación dinámica)
        </h2>
        <p className="text-slate-400 text-xs mb-3">
          Marca el servicio como PENDIENTE DE COCHE y sugiere reemplazo por categoría (ej. Línea
          Fija) disponible en flota.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              const res = await reportarAveria('104', selectedDate, vehicles, assignedVehicleIds);
              setAveriaResult(res);
            }}
            className="min-h-[40px] px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm"
            data-testid="btn-reportar-averia-104"
          >
            Simular avería Coche 104 (15:00)
          </button>
          {averiaResult && (
            <div className="flex-1 min-w-0 rounded-lg bg-slate-900/80 border border-slate-600 p-3 text-sm">
              <p className="text-slate-300 font-medium">
                Servicios marcados PENDIENTE DE COCHE:{' '}
                {averiaResult.serviciosMarcadosPendiente.join(', ') || 'ninguno'}.
              </p>
              <p className="text-emerald-400 mt-1">
                Categoría reemplazo: {averiaResult.categoriaReemplazo ?? '—'}. Coches sugeridos
                (Retén/Reserva):{' '}
                {averiaResult.cochesSugeridos.map((v) => v.internalNumber ?? v.id).join(', ') ||
                  'ninguno disponible'}
                .
              </p>
            </div>
          )}
        </div>
      </section>

      {serviciosConHoraReferencia.length > 0 && (
        <section
          className="mx-4 mt-4 p-4 rounded-xl border border-slate-700 bg-slate-800/30"
          data-testid="asignar-suplente-section"
        >
          <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2 mb-3">
            <UserPlus className="w-4 h-4" />
            Incidencia – Asignar suplente
          </h2>
          <p className="text-slate-400 text-xs mb-3">
            Si un conductor no se presenta en el horario del servicio, asigne un suplente (solo
            conductores sin turno activo en ese momento).
          </p>
          <div className="flex flex-wrap gap-3">
            {serviciosConHoraReferencia.map((svc) => {
              const prog = programacionList.find(
                (p) => p.servicio === svc.servicioId || p.servicio === svc.serviceNumber,
              );
              const conductorActual = prog?.conductor
                ? users.find((u) => String(u.id ?? u.uid) === prog.conductor)
                : null;
              const nombreActual = conductorActual
                ? (conductorActual.fullName ??
                  [conductorActual.firstName, conductorActual.lastName].filter(Boolean).join(' '))
                : 'PENDIENTE';
              return (
                <div
                  key={svc.servicioId}
                  className="p-3 rounded-xl bg-slate-800 border border-slate-600 flex flex-wrap items-center gap-3"
                  data-testid={`servicio-${svc.servicioId}-suplente`}
                >
                  <span className="font-mono text-white">{svc.servicioId}</span>
                  <span className="text-slate-400 text-sm">{svc.horaInicioReferencia ?? '—'}</span>
                  <span className="text-slate-400 text-sm">
                    Conductor: {nombreActual ?? 'PENDIENTE'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSuplenteModal({
                        servicioId: svc.servicioId,
                        hora: svc.horaInicioReferencia ?? '',
                        conductorActual: nombreActual,
                      })
                    }
                    className="min-h-[40px] px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm flex items-center gap-2"
                    data-testid="btn-asignar-suplente"
                  >
                    <UserPlus className="w-4 h-4" />
                    ASIGNAR SUPLENTE
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {alerts.length > 0 && (
        <div
          className="mx-4 mt-4 p-4 rounded-xl bg-red-950/50 border-2 border-red-500 text-red-100 flex items-center justify-center gap-3 min-h-[56px]"
          data-testid="crisis-widget"
          role="alert"
        >
          <span className="text-2xl">🔴</span>
          <span className="font-bold text-lg">
            {alerts.length} SERVICIO{alerts.length !== 1 ? 'S' : ''} CAÍDO
            {alerts.length !== 1 ? 'S' : ''} PARA HOY
          </span>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 overflow-auto">
        {/* Sección 1: Alertas Críticas (Top/Left) – R1/R2/R3 en tiempo real */}
        <section
          className="lg:col-span-4 space-y-3"
          data-testid="conflict-alerts-section"
          aria-label="Alertas de conflicto de asignación"
        >
          <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Alertas Críticas
          </h2>
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {alerts.length === 0 && !loading && (
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 text-slate-500 text-sm">
                Sin conflictos de asignación.
              </div>
            )}
            {alerts.map((alert) => {
              const vehicleNum = alert.vehicleInternalNumber ?? alert.vehicleId ?? '—';
              return (
                <div
                  key={alert.id}
                  className="p-4 rounded-xl bg-amber-950/30 border border-amber-600/50 text-left"
                  data-testid={vehicleNum !== '—' ? `alert-coche-taller-${vehicleNum}` : undefined}
                >
                  <div
                    className="text-red-200 font-bold text-sm"
                    data-testid="alert-message-coche-taller"
                  >
                    ⚠️ COCHE {vehicleNum} EN TALLER. SERVICIO DESCUBIERTO
                  </div>
                  <div className="text-amber-200 font-medium text-sm mt-1">
                    Conflicto de Asignación
                  </div>
                  <div className="text-slate-300 text-xs mt-1">
                    Servicio: <span className="font-mono">{alert.serviceId ?? '—'}</span>
                  </div>
                  <div className="text-slate-300 text-xs">
                    Coche caído: <span className="font-mono">{vehicleNum}</span>
                  </div>
                  <div className="text-slate-400 text-xs">
                    Personal afectado:{' '}
                    {[alert.driverName, alert.guardName].filter(Boolean).join(', ') || '—'}
                  </div>
                  {alert.message && (
                    <p className="text-slate-500 text-xs mt-1 truncate" title={alert.message}>
                      {alert.message}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => handleResolve(alert)}
                    className="mt-3 w-full min-h-[44px] rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm touch-manipulation"
                    data-testid="btn-resolver-conflict"
                  >
                    Resolver
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Sección 3: Lista del Día (Center) */}
        <section className="lg:col-span-5 overflow-x-auto">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4" />
            Lista del día
          </h2>
          <div
            className="rounded-xl border border-slate-700 overflow-hidden"
            data-testid="daily-list-table-wrap"
          >
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table
                className="w-full text-left text-sm"
                role="grid"
                data-testid="daily-list-table"
              >
                <thead className="bg-slate-800 sticky top-0">
                  <tr>
                    <th className="p-2 text-slate-400 w-8" aria-label="Estado" />
                    <th className="p-2 text-slate-400">Servicio</th>
                    <th className="p-2 text-slate-400">Coche</th>
                    <th className="p-2 text-slate-400">Conductor</th>
                    <th className="p-2 text-slate-400">Horario</th>
                    <th className="p-2 text-slate-400">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filasUnificadas.map((fila) => {
                    const cond = users.find((u) => String(u.id ?? u.uid) === fila.conductor);
                    const conductorName = cond
                      ? (cond.fullName ??
                        ([cond.firstName, cond.lastName].filter(Boolean).join(' ') ||
                          fila.conductor))
                      : fila.conductor || '—';
                    const cocheLabel = fila.coche
                      ? (vehicles.find((v) => String(v.id) === fila.coche)?.internalNumber ??
                        fila.coche)
                      : '—';
                    const isRojo = fila.semaforo === 'rojo';
                    const showNotificar = fila.semaforo === 'amarillo' || fila.semaforo === 'rojo';
                    const rowBg =
                      fila.semaforo === 'verde'
                        ? 'bg-emerald-950/30 border-l-4 border-emerald-500'
                        : fila.semaforo === 'naranja'
                          ? 'bg-amber-950/25 border-l-4 border-amber-500'
                          : fila.semaforo === 'amarillo'
                            ? 'bg-yellow-950/30 border-l-4 border-yellow-500'
                            : 'bg-red-950/30 border-l-4 border-red-500';
                    return (
                      <tr
                        key={fila.id}
                        className={`border-t border-slate-700/50 hover:bg-slate-800/50 ${rowBg} ${isRojo ? 'cursor-pointer' : ''}`}
                        onClick={() =>
                          isRojo &&
                          setSuplenteModal({
                            servicioId: fila.servicioId,
                            hora: fila.horaInicio,
                            conductorActual: fila.conductor ?? undefined,
                          })
                        }
                        data-testid={fila.servicioId === '1129' ? 'row-servicio-1129' : undefined}
                      >
                        <td className="p-2" title={fila.semaforo}>
                          <span
                            className={`inline-block w-3 h-3 rounded-full ${
                              fila.semaforo === 'verde'
                                ? 'bg-emerald-500'
                                : fila.semaforo === 'naranja'
                                  ? 'bg-amber-500'
                                  : fila.semaforo === 'amarillo'
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                            }`}
                            aria-hidden
                          />
                        </td>
                        <td className="p-2 font-mono">
                          {fila.linea} / {fila.servicioId}
                        </td>
                        <td className="p-2">{cocheLabel}</td>
                        <td className="p-2">{conductorName}</td>
                        <td className="p-2">
                          {fila.horaInicio || '—'}
                          {fila.atrasoMinutos > 0 && (
                            <span className="ml-1 text-amber-400 text-xs">
                              (-{fila.atrasoMinutos} min)
                            </span>
                          )}
                        </td>
                        <td className="p-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/dashboard/traffic/navigation?linea=${encodeURIComponent(fila.linea ?? '')}`}
                              className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 touch-manipulation"
                              title="Ver ruta teórica en mapa"
                            >
                              <MapPin className="w-4 h-4" /> Ver Mapa
                            </Link>
                            {fila.coche && (
                              <button
                                type="button"
                                onClick={() =>
                                  setAveriaModal({
                                    cocheId: fila.coche ?? '',
                                    cocheLabel: cocheLabel,
                                  })
                                }
                                className="min-h-[44px] px-3 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-medium inline-flex items-center gap-1.5 touch-manipulation"
                                title="Reportar avería (PENDIENTE DE COCHE)"
                              >
                                <Wrench className="w-4 h-4" /> Avería
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setInfraccionModal({
                                  servicioId: fila.servicioId,
                                  coche: fila.coche ?? '',
                                  linea: fila.linea ?? '',
                                })
                              }
                              className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 touch-manipulation"
                              title="Reportar infracción (vincula coche-servicio-conductor)"
                            >
                              <FileWarning className="w-4 h-4" /> Infracción
                            </button>
                            {showNotificar && (
                              <button
                                type="button"
                                onClick={() => {
                                  setNotifyingId(fila.servicioId);
                                  const msg =
                                    fila.atrasoMinutos > 0
                                      ? `Atraso ${fila.atrasoMinutos} min – verificar en Punto de Control`
                                      : 'Incidencia / falta recurso';
                                  AssignmentConflictService.notifyInspector({
                                    serviceId: fila.servicioId,
                                    message: msg,
                                    vehicleId: fila.coche ?? undefined,
                                    vehicleInternalNumber: fila.coche
                                      ? vehicles.find((v) => String(v.id) === fila.coche)
                                          ?.internalNumber
                                      : undefined,
                                  })
                                    .then(() => setNotifyingId(null))
                                    .catch(() => setNotifyingId(null));
                                }}
                                disabled={!!notifyingId}
                                className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium touch-manipulation"
                                data-testid="btn-notificar-inspector"
                              >
                                {notifyingId === fila.servicioId ? '…' : 'Notificar Inspector'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filasUnificadas.length === 0 && !loading && (
              <div className="p-6 text-center text-slate-500 text-sm">
                Sin asignaciones para esta fecha.
              </div>
            )}
          </div>
        </section>

        {/* Sección 2: Recursos Disponibles – Coches de Reserva + Personal Retén (9h) */}
        <section className="lg:col-span-3 space-y-4">
          <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
            <Bus className="w-4 h-4" />
            Coches de Reserva (operativos sin asignar)
          </h2>
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 max-h-[200px] overflow-y-auto p-2 space-y-1">
            {vehiclesOperativosSinAsignar.slice(0, 20).map((v) => (
              <div key={String(v.id)} className="text-xs text-slate-300 py-1">
                Coche {v.internalNumber ?? v.id} {v.plate ? `(${v.plate})` : ''}
              </div>
            ))}
            {vehiclesOperativosSinAsignar.length === 0 && (
              <div className="text-slate-500 text-xs">Ninguno disponible.</div>
            )}
          </div>
          <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4" />
            Personal Retén (cumple 9 h descanso)
          </h2>
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 max-h-[200px] overflow-y-auto p-2 space-y-1">
            {personalReten.slice(0, 20).map((u) => (
              <div key={String(u.id ?? u.uid)} className="text-xs text-slate-300 py-1 truncate">
                {u.fullName ||
                  [u.firstName, u.lastName].filter(Boolean).join(' ') ||
                  u.internalNumber ||
                  u.uid}
              </div>
            ))}
            {personalReten.length === 0 && (
              <div className="text-slate-500 text-xs">
                Ninguno sin asignar o con descanso válido.
              </div>
            )}
          </div>
          <PersonalBulkUpload />
        </section>
      </div>

      {/* Modal ASIGNAR SUPLENTE – conductores con rol conductor sin daily_shift activo a las 13:10 */}
      {suplenteModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSuplenteModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="suplente-modal-title"
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-700 shrink-0">
              <h3
                id="suplente-modal-title"
                className="font-bold text-white flex items-center gap-2"
              >
                <UserPlus className="w-5 h-5 text-amber-400" />
                ASIGNAR SUPLENTE – Servicio {suplenteModal.servicioId}
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                Hora: {suplenteModal.hora || 'PENDIENTE'}. Solo conductores sin turno activo en este
                momento.
              </p>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto min-h-0 flex-1">
              {validationError && (
                <div
                  className="p-3 rounded-xl bg-red-950/50 border border-red-600/50 text-red-200 text-sm"
                  role="alert"
                >
                  {validationError}
                </div>
              )}
              <p className="text-slate-400 text-xs">
                {conductoresEnRetenParaModal.length} conductor(es) en retén que cumplen 9 h de
                descanso para esta hora.
              </p>
              <div className="flex flex-wrap gap-2">
                {conductoresEnRetenParaModal.map((u) => {
                  const fila = filasUnificadas.find(
                    (f) => f.servicioId === suplenteModal.servicioId,
                  );
                  const cocheId =
                    fila?.coche ?? vehiclesOperativosSinAsignar[0]?.id ?? vehicles[0]?.id;
                  const name =
                    u.fullName ??
                    ([u.firstName, u.lastName].filter(Boolean).join(' ') ||
                      u.internalNumber ||
                      u.uid);
                  return (
                    <button
                      key={String(u.id ?? u.uid)}
                      type="button"
                      onClick={() =>
                        cocheId &&
                        handleAsignarSuplente(
                          suplenteModal.servicioId,
                          suplenteModal.hora,
                          String(u.id ?? u.uid),
                          String(cocheId),
                        )
                      }
                      disabled={!cocheId}
                      className="min-h-[44px] px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm touch-manipulation disabled:opacity-50 truncate max-w-[200px]"
                      data-testid="suplente-option"
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              {conductoresEnRetenParaModal.length === 0 && (
                <p className="text-amber-400 text-sm">
                  Ningún conductor en retén con 9 h descanso para esta hora.
                </p>
              )}
            </div>
            <div className="p-4 border-t border-slate-700 shrink-0 bg-slate-800/30 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setSuplenteModal(null)}
                className="w-full min-h-[48px] rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium touch-manipulation"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Resolver – táctil */}
      {modalAlert && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleCloseModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-h-[85vh] overflow-y-auto shadow-xl max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-700">
              <h3 id="modal-title" className="font-bold text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-400" />
                Resolver conflicto
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                Servicio {modalAlert.serviceId} – Coche{' '}
                {modalAlert.vehicleInternalNumber ?? modalAlert.vehicleId} caído.
              </p>
            </div>
            <div className="p-4 space-y-4" data-testid="modal-resolver-unott">
              <p className="text-slate-400 text-sm">
                Regla sindical UNOTT: entre el fin del turno anterior y el inicio del nuevo debe
                haber al menos 9 h de descanso. Solo se muestran conductores que cumplen.
              </p>
              {validationError && (
                <div
                  className="p-3 rounded-xl bg-red-950/50 border border-red-600/50 text-red-200 text-sm"
                  role="alert"
                >
                  {validationError}
                </div>
              )}
              <div>
                <label className="block text-slate-400 text-sm mb-2">
                  Asignar coche de reemplazo
                </label>
                {sugerenciaReemplazoAveria?.categoria && (
                  <p className="text-emerald-400 text-xs mb-2" data-testid="sugerencia-categoria">
                    Sugerencia automática: categoría {sugerenciaReemplazoAveria.categoria}{' '}
                    (disponibles en flota).
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {sugerenciaReemplazoAveria?.coches?.length
                    ? sugerenciaReemplazoAveria.coches.slice(0, 6).map((v) => (
                        <button
                          key={String(v.id)}
                          type="button"
                          disabled={!!resolvingId}
                          onClick={() => handlePatchShift({ vehicleId: String(v.id) })}
                          className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm touch-manipulation disabled:opacity-50"
                        >
                          Coche {v.internalNumber ?? v.id}
                        </button>
                      ))
                    : null}
                  {vehiclesOperativosSinAsignar
                    .filter(
                      (v) =>
                        !sugerenciaReemplazoAveria?.coches?.some(
                          (c) => String(c.id) === String(v.id),
                        ),
                    )
                    .slice(0, 6)
                    .map((v) => (
                      <button
                        key={String(v.id)}
                        type="button"
                        disabled={!!resolvingId}
                        onClick={() => handlePatchShift({ vehicleId: String(v.id) })}
                        className="min-h-[44px] px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm touch-manipulation disabled:opacity-50"
                      >
                        Coche {v.internalNumber ?? v.id}
                      </button>
                    ))}
                </div>
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-2">
                  O asignar conductor de reemplazo (Retén, 9 h descanso)
                </label>
                <div className="flex flex-wrap gap-2">
                  {personalReten.slice(0, 8).map((u) => (
                    <button
                      key={String(u.id ?? u.uid)}
                      type="button"
                      disabled={!!resolvingId}
                      onClick={() => handlePatchShift({ assignedTo: String(u.id ?? u.uid) })}
                      className="min-h-[44px] px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm touch-manipulation disabled:opacity-50 truncate max-w-[180px]"
                    >
                      {u.fullName || u.internalNumber || String(u.uid).slice(0, 8)}
                    </button>
                  ))}
                </div>
              </div>
              {resolvingId && (
                <div className="flex items-center justify-center gap-2 text-amber-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Guardando…</span>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-700">
              <button
                type="button"
                onClick={handleCloseModal}
                className="w-full min-h-[44px] rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium touch-manipulation"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Habilitar Doble Turno – valida 9h descanso y máx horas UCOT */}
      {dobleTurnoModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setDobleTurnoModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="doble-turno-title"
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-h-[85vh] overflow-y-auto shadow-xl max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-700">
              <h3 id="doble-turno-title" className="font-bold text-white">
                Habilitar Doble Turno
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                Valida 9 h de descanso entre turnos y máximo {MAX_HORAS_DIA_UCOT} h/día (UCOT).
              </p>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Turno 1 inicio</label>
                  <input
                    type="time"
                    value={dobleTurnoForm.t1Start}
                    onChange={(e) => setDobleTurnoForm((f) => ({ ...f, t1Start: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Turno 1 fin</label>
                  <input
                    type="time"
                    value={dobleTurnoForm.t1End}
                    onChange={(e) => setDobleTurnoForm((f) => ({ ...f, t1End: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Turno 2 inicio</label>
                  <input
                    type="time"
                    value={dobleTurnoForm.t2Start}
                    onChange={(e) => setDobleTurnoForm((f) => ({ ...f, t2Start: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Turno 2 fin</label>
                  <input
                    type="time"
                    value={dobleTurnoForm.t2End}
                    onChange={(e) => setDobleTurnoForm((f) => ({ ...f, t2End: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm"
                  />
                </div>
              </div>
              {dobleTurnoResult && (
                <div
                  className={`p-3 rounded-xl text-sm ${dobleTurnoResult.valid ? 'bg-emerald-950/50 border border-emerald-600/50 text-emerald-200' : 'bg-red-950/50 border border-red-600/50 text-red-200'}`}
                >
                  {dobleTurnoResult.valid
                    ? `Válido. Total: ${dobleTurnoResult.totalHoras ?? 0} h (máx ${MAX_HORAS_DIA_UCOT} h).`
                    : dobleTurnoResult.error}
                </div>
              )}
              <button
                type="button"
                onClick={() =>
                  setDobleTurnoResult(
                    validateDobleTurno(
                      dobleTurnoForm.t1Start,
                      dobleTurnoForm.t1End,
                      dobleTurnoForm.t2Start,
                      dobleTurnoForm.t2End,
                    ),
                  )
                }
                className="w-full min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
              >
                Validar doble turno
              </button>
            </div>
            <div className="p-4 border-t border-slate-700">
              <button
                type="button"
                onClick={() => setDobleTurnoModal(false)}
                className="w-full min-h-[44px] rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reportar Avería – desde fila (ej. Coche 115); botón Confirmar siempre visible */}
      {averiaModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setAveriaModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="averia-title"
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-700 shrink-0">
              <h3 id="averia-title" className="font-bold text-white text-lg">
                Reportar avería
              </h3>
              <p className="text-slate-400 text-sm mt-2">
                Coche <strong className="text-white">{averiaModal.cocheLabel}</strong> pasará a
                avería. Los servicios asignados quedarán <strong>PENDIENTE DE COCHE</strong> y se
                notificará a los conductores.
              </p>
              <p className="text-amber-400/90 text-sm mt-2">¿Desea confirmar?</p>
            </div>
            <div className="p-4 shrink-0 flex flex-col gap-3 border-t border-slate-700 bg-slate-800/30 rounded-b-2xl">
              <button
                type="button"
                onClick={async () => {
                  setAveriaConfirmando(true);
                  try {
                    const res = await reportarAveria(
                      averiaModal.cocheId,
                      selectedDate,
                      vehicles,
                      assignedVehicleIds,
                    );
                    setAveriaResult(res);
                    setAveriaModal(null);
                  } finally {
                    setAveriaConfirmando(false);
                  }
                }}
                disabled={averiaConfirmando}
                className="w-full min-h-[48px] rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-base touch-manipulation disabled:opacity-60 flex items-center justify-center gap-2"
                data-testid="modal-averia-confirmar"
              >
                {averiaConfirmando ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setAveriaModal(null)}
                className="w-full min-h-[48px] rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium touch-manipulation"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reportar Infracción – vincula coche/servicio; conductor se resuelve por historial */}
      {infraccionModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => {
            setInfraccionModal(null);
            setInfraccionDesc('');
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="infraccion-title"
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-700 shrink-0">
              <h3 id="infraccion-title" className="font-bold text-white">
                Reportar Infracción / Multa
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                Línea {infraccionModal.linea} · Servicio {infraccionModal.servicioId} · Coche{' '}
                {vehicles.find((v) => String(v.id) === infraccionModal.coche)?.internalNumber ??
                  infraccionModal.coche}
                . El conductor se identifica por historial de rotación.
              </p>
            </div>
            <div className="p-4 overflow-y-auto min-h-0 flex-1">
              <div>
                <label className="block text-slate-400 text-sm mb-1">Tipo</label>
                <select
                  value={infraccionTipo}
                  onChange={(e) =>
                    setInfraccionTipo(e.target.value as 'infraccion' | 'multa' | 'observacion')
                  }
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white min-h-[44px]"
                >
                  <option value="infraccion">Infracción</option>
                  <option value="multa">Multa</option>
                  <option value="observacion">Observación</option>
                </select>
              </div>
              <div className="mt-4">
                <label className="block text-slate-400 text-sm mb-1">Descripción</label>
                <textarea
                  value={infraccionDesc}
                  onChange={(e) => setInfraccionDesc(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  placeholder="Detalle de la infracción..."
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-700 shrink-0 flex flex-col gap-2 bg-slate-800/30 rounded-b-2xl">
              <button
                type="button"
                disabled={infraccionSaving || !infraccionDesc.trim()}
                onClick={async () => {
                  setInfraccionSaving(true);
                  try {
                    await InspeccionesFlotaService.add({
                      vehicleId: infraccionModal.coche,
                      vehicleInternalNumber: vehicles.find(
                        (v) => String(v.id) === infraccionModal.coche,
                      )?.internalNumber,
                      servicioId: infraccionModal.servicioId,
                      date: selectedDate,
                      tipo: infraccionTipo,
                      descripcion: infraccionDesc.trim(),
                      inspectorId: authUser?.uid ?? authUser?.id,
                    });
                    setInfraccionModal(null);
                    setInfraccionDesc('');
                  } finally {
                    setInfraccionSaving(false);
                  }
                }}
                className="w-full min-h-[48px] rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold touch-manipulation disabled:opacity-50"
              >
                {infraccionSaving ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setInfraccionModal(null);
                  setInfraccionDesc('');
                }}
                className="w-full min-h-[48px] rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium touch-manipulation"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
