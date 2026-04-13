/**
 * Terminal Listero — Panel Operativo Unificado UCOT
 *
 * 4 vistas:
 *  1. Lista      — Pool de conductores libres + grilla D&D operativa diaria
 *  2. Coches     — Personal asignado por coche, régimen de rotación, T1/T2 esta semana
 *  3. Semana     — Grid semanal de servicios por coche con conductor asignado
 *  4. Correlativos — Solicitudes de cobertura entre conductores con análisis de factibilidad
 */
import { useState, useEffect, useRef } from 'react';
import {
  Bus,
  Users,
  Calendar,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  UserPlus,
  Wrench,
  FileWarning,
  PlusCircle,
  X,
  Upload,
  ChevronDown,
  ChevronRight,
  ArrowLeftRight,
  MapPin,
  AlertCircle,
  Search,
  History,
  Filter,
} from 'lucide-react';
import {
  UserService,
  FleetService,
  ServicioEstadoService,
  ActiveAssignmentsService,
  CochePersonalService,
  CorrelativoService,
  calcularFactibilidadCorrelativo,
  ProgramacionSemanalService,
  esParaliza,
  esNocturno,
} from '../../services/firestore';
import { ProgramacionDiariaService } from '../../services/firestore/programacionDiaria';
import { SystemConfigService } from '../../services/firestore/systemConfig';
import type { User, Vehicle } from '../../services/firestore/types';
import type { ServicioEstadoRecord } from '../../services/firestore/servicioEstado';
import type { ProgramacionDiariaRecord } from '../../services/firestore/programacionDiaria';
import type { CochePersonal, PersonalAsignado } from '../../services/firestore/cochePersonal';
import type { CorrelativoRequest, TurnoCorrelativo } from '../../services/firestore/correlativo';
import type { ProgramacionSemanalRecord, DistribucionCoche } from '../../services/firestore/programacionSemanal';
import { validateAssignment } from '../../utils/syndicateRules';
import { computeSemaforo } from '../../utils/semaforoListero';
import { reportarAveria } from '../../services/assignmentService';
import type { ReportarAveriaResult } from '../../services/assignmentService';
import PersonalBulkUpload from '../../components/traffic/PersonalBulkUpload';
import { useAuth } from '../../context/AuthContext';

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveUserName(u: {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  internalNumber?: string;
  uid?: string;
  id?: unknown;
}): string {
  const joined = [u.firstName, u.lastName].filter(Boolean).join(' ');
  return u.fullName || joined || u.internalNumber || String(u.uid || u.id || '');
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function getWeekDates(baseDate: string): string[] {
  const d = new Date(baseDate + 'T12:00:00');
  const day = d.getDay();
  // Lunes de la semana
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  // 7 días: lunes → domingo
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(mon);
    dd.setDate(mon.getDate() + i);
    return dd.toISOString().split('T')[0];
  });
}

type TabId = 'lista' | 'coches' | 'semana' | 'correlativos' | 'historial';
type Semaforo = 'verde' | 'naranja' | 'rojo' | 'amarillo';

interface FilaServicio {
  /** programacion_diaria doc id */
  id: string;
  servicioId: string;
  linea: string;
  cocheId: string | null;
  conductorId: string | null;
  conductorNombre: string | null;
  horaInicio: string;
  semaforo: Semaforo;
  atrasoMinutos: number;
  estado?: ServicioEstadoRecord;
  record: ProgramacionDiariaRecord;
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function SemaforoDot({ color }: { color: Semaforo }) {
  const cls =
    color === 'verde'
      ? 'bg-emerald-500'
      : color === 'naranja'
        ? 'bg-amber-500'
        : color === 'amarillo'
          ? 'bg-yellow-400'
          : 'bg-red-500';
  const label =
    color === 'verde' ? 'Operativo' : color === 'naranja' ? 'Parcial' : color === 'amarillo' ? 'Atraso' : 'Crítico';
  return <span className={`inline-block w-3 h-3 rounded-full ${cls}`} title={label} />;
}

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Badge({
  color,
  children,
}: {
  color: 'green' | 'amber' | 'red' | 'blue' | 'slate';
  children: React.ReactNode;
}) {
  const cls =
    color === 'green'
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : color === 'amber'
        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
        : color === 'red'
          ? 'bg-red-500/20 text-red-400 border-red-500/30'
          : color === 'blue'
            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
            : 'bg-slate-700/50 text-slate-400 border-slate-600/30';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${cls}`}>
      {children}
    </span>
  );
}

// ─── TAB: Coches ─────────────────────────────────────────────────────────────

function TabCoches({
  coches,
  users,
  vehicles,
  loading,
  onAvanzarRotacion,
}: {
  coches: CochePersonal[];
  users: User[];
  vehicles: Vehicle[];
  loading: boolean;
  onAvanzarRotacion: (coche: CochePersonal) => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const userMap = new Map(users.map((u) => [String(u.uid || u.id), u]));
  const vehicleMap = new Map(vehicles.map((v) => [v.internalNumber || '', v]));

  const regimenLabel: Record<string, string> = {
    semana_semana: 'Semana/Semana',
    '15_15': '15/15',
    fijo_t1: 'Fijo T1',
    fijo_t2: 'Fijo T2',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
      </div>
    );
  }

  if (coches.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <Bus className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>No hay coches configurados.</p>
        <p className="text-xs mt-1">Use la ingesta de datos para cargar el modelo de coches.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {coches.map((coche) => {
        const vehicle = vehicleMap.get(coche.cocheInternalNumber);
        const isExpanded = expandedId === (coche.id || coche.cocheInternalNumber);
        const t1User = coche.turnoT1Actual ? userMap.get(coche.turnoT1Actual) : undefined;
        const semanaActual = coche.bloquesSemana.find(
          (b) => b.semana === (coche.semanaActualCartones || 1),
        );
        const key = coche.id || coche.cocheInternalNumber;

        return (
          <div key={key} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center gap-3 p-4 hover:bg-slate-800/50 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : key)}
            >
              <div className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center font-black text-white text-sm">
                {coche.cocheInternalNumber}
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white">Coche {coche.cocheInternalNumber}</span>
                  {vehicle && (
                    <span className="text-xs text-slate-500">{vehicle.brand} {vehicle.model}</span>
                  )}
                  <Badge color={coche.activo !== false ? 'green' : 'red'}>
                    {coche.activo !== false ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                  <span>{regimenLabel[coche.regimen] || coche.regimen}</span>
                  <span>·</span>
                  <span>{coche.personal.length} conductores</span>
                  {semanaActual && (
                    <>
                      <span>·</span>
                      <span>Línea {semanaActual.linea}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {t1User && (
                  <div className="text-right hidden sm:block">
                    <div className="text-[10px] text-slate-500">T1 semana</div>
                    <div className="text-sm font-medium text-white">
                      {resolveUserName(t1User as Parameters<typeof resolveUserName>[0])}
                    </div>
                  </div>
                )}
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-slate-800 p-4 space-y-4">
                <div>
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                    Personal Asignado
                  </h4>
                  <div className="space-y-2">
                    {coche.personal.map((p) => {
                      const u = userMap.get(p.userId);
                      const isT1 = coche.turnoT1Actual === p.userId;
                      const isT2 = coche.turnoT2Actual === p.userId;
                      return (
                        <div key={p.userId} className="flex items-center gap-3 bg-slate-800/50 rounded-lg px-3 py-2">
                          <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-xs font-black text-white">
                            {p.internalNumber}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-white">
                              {u ? resolveUserName(u as Parameters<typeof resolveUserName>[0]) : (p.fullName || p.internalNumber)}
                            </div>
                            <div className="text-xs text-slate-500">
                              T{p.turnoBase} base · {p.esFijo ? 'Fijo' : 'Rotativo'}
                            </div>
                          </div>
                          {isT1 && <Badge color="blue">T1 esta semana</Badge>}
                          {isT2 && <Badge color="amber">T2 esta semana</Badge>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {semanaActual && (
                  <div>
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                      Cartones Sem {coche.semanaActualCartones} · {semanaActual.temporada} · Línea {semanaActual.linea}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {semanaActual.servicios.map((s) => (
                        <span key={s} className="bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono px-2 py-1 rounded">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(coche.regimen === 'semana_semana' || coche.regimen === '15_15') && (
                  <button
                    className="flex items-center gap-1.5 bg-primary-600/20 hover:bg-primary-600/40 text-primary-400 border border-primary-600/30 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors"
                    onClick={() => onAvanzarRotacion(coche)}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Avanzar Rotación
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── TAB: Semana (Informe de Tránsito) ───────────────────────────────────────

const DIAS_SEMANA_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_SEMANA_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Celda de servicio individual en el informe */
function CeldaServicio({
  dist,
  onClick,
}: {
  dist: DistribucionCoche;
  onClick?: () => void;
}) {
  const paraliza = esParaliza(dist.servicio);
  const nocturno = esNocturno(dist.servicio);

  if (paraliza) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left px-2 py-1 rounded bg-red-900/30 border border-red-700/40 text-red-400 font-black text-xs hover:bg-red-900/50 transition-colors"
        title="Coche paralizado — click para ver conductores en lista"
      >
        Paraliza
      </button>
    );
  }

  return (
    <div className={`px-2 py-1 rounded text-xs font-mono font-bold ${
      nocturno
        ? 'bg-indigo-900/30 border border-indigo-700/30 text-indigo-300'
        : 'bg-slate-800 border border-slate-700 text-slate-200'
    }`}>
      {dist.servicio}
    </div>
  );
}

/** Modal: conductores que paralizan y necesitan reasignación */
function ModalParaliza({
  fecha,
  cocheInternalNumber,
  coches,
  distribuciones,
  users,
  onClose,
  onAsignar,
}: {
  fecha: string;
  cocheInternalNumber: string;
  coches: CochePersonal[];
  distribuciones: DistribucionCoche[];
  users: User[];
  onClose: () => void;
  onAsignar: (userId: string, turnoBase: 1 | 2, targetCocheNum: string, targetServicio: string) => Promise<void>;
}) {
  const cocheConfig = coches.find((c) => c.cocheInternalNumber === cocheInternalNumber);
  const userMap = new Map(users.map((u) => [String(u.uid || u.id), u]));
  const [saving, setSaving] = useState<string | null>(null);
  const [asignaciones, setAsignaciones] = useState<Record<string, { coche: string; servicio: string }>>({});

  if (!cocheConfig) {
    return (
      <Modal onClose={onClose}>
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="font-bold text-white">Coche {cocheInternalNumber} — Paraliza</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-4 text-slate-400 text-sm">
          Coche no configurado en el sistema. Configure el personal del coche en la pestaña Coches.
        </div>
      </Modal>
    );
  }

  // Servicios disponibles hoy (no paralizan, mismo día)
  const serviciosDisponibles = distribuciones.filter((d) => !esParaliza(d.servicio));

  return (
    <Modal onClose={onClose}>
      <div className="p-4 border-b border-slate-700 flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-xs font-black flex items-center justify-center">P</span>
            Coche {cocheInternalNumber} Paraliza
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{fecha} · Asignar conductores a otra unidad</p>
        </div>
        <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
      </div>
      <div className="p-4 space-y-4 overflow-y-auto flex-1">
        <p className="text-xs text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded-lg px-3 py-2">
          ⚠️ Regla UCOT: Respetar turno del conductor. T1 → T1 en nueva unidad, T2 → T2.
        </p>

        {cocheConfig.personal.map((p) => {
          const u = userMap.get(p.userId);
          const nombre = u ? resolveUserName(u as Parameters<typeof resolveUserName>[0]) : (p.fullName || p.internalNumber);
          const isT1 = cocheConfig.turnoT1Actual === p.userId || p.turnoBase === 1;
          const turnoLabel = isT1 ? 'T1 (Mañana)' : 'T2 (Tarde)';
          const asig = asignaciones[p.userId];

          return (
            <div key={p.userId} className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0">
                  {p.internalNumber}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-white">{nombre}</div>
                  <div className="text-xs text-slate-500">Int. {p.internalNumber} · <span className={isT1 ? 'text-blue-400' : 'text-amber-400'}>{turnoLabel}</span></div>
                </div>
                {asig && <Badge color="green">Asignado</Badge>}
              </div>

              {!asig && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Nueva Unidad</label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                      onChange={(e) => {
                        const [coche, servicio] = e.target.value.split('|');
                        setAsignaciones((prev) => ({ ...prev, [p.userId]: { coche, servicio } }));
                      }}
                      defaultValue=""
                    >
                      <option value="">— Coche disponible —</option>
                      {serviciosDisponibles.map((d) => (
                        <option key={d.cocheInternalNumber} value={`${d.cocheInternalNumber}|${d.servicio}`}>
                          Coche {d.cocheInternalNumber} → {d.servicio}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      disabled={!asig && !asignaciones[p.userId] || saving === p.userId}
                      onClick={async () => {
                        const a = asignaciones[p.userId];
                        if (!a) return;
                        setSaving(p.userId);
                        await onAsignar(p.userId, p.turnoBase, a.coche, a.servicio);
                        setSaving(null);
                        setAsignaciones((prev) => ({ ...prev, [p.userId]: a }));
                      }}
                      className="w-full flex items-center justify-center gap-1 bg-primary-600/20 hover:bg-primary-600/40 text-primary-400 border border-primary-600/30 rounded-lg px-2 py-1.5 text-xs font-bold transition-colors disabled:opacity-40"
                    >
                      {saving === p.userId ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                      Asignar
                    </button>
                  </div>
                </div>
              )}

              {asig && (
                <div className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Reasignado → Coche {asig.coche} · Servicio {asig.servicio}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="p-4 border-t border-slate-700 shrink-0">
        <button onClick={onClose} className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg py-2 text-sm text-slate-300 font-bold transition-colors">
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

function TabSemana({
  coches,
  users,
  baseDate,
  onDateChange,
}: {
  coches: CochePersonal[];
  users: User[];
  baseDate: string;
  onDateChange: (d: string) => void;
}) {
  const weekDates = getWeekDates(baseDate);
  const today = todayISO();

  // State: one ProgramacionSemanalRecord per day of the week
  const [semanaData, setSemanaData] = useState<Map<string, ProgramacionSemanalRecord>>(new Map());
  const [loadingSemana, setLoadingSemana] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [selectedFecha, setSelectedFecha] = useState<string | null>(null);
  const [modalParaliza, setModalParaliza] = useState<{ fecha: string; coche: string } | null>(null);

  // Input buffer for editing a day's distribution
  const [editBuffer, setEditBuffer] = useState<DistribucionCoche[]>([]);
  const [editFecha, setEditFecha] = useState('');
  const [saving, setSaving] = useState(false);

  // Load week data
  useEffect(() => {
    setLoadingSemana(true);
    const d = new Date(baseDate + 'T12:00:00');
    const day = d.getDay() || 7;
    const mon = new Date(d);
    mon.setDate(d.getDate() - (day - 1));

    const promises = weekDates.map((fecha) =>
      ProgramacionSemanalService.getByFecha(fecha).then((r) => ({ fecha, r })),
    );
    Promise.all(promises).then((results) => {
      const map = new Map<string, ProgramacionSemanalRecord>();
      results.forEach(({ fecha, r }) => { if (r) map.set(fecha, r); });
      setSemanaData(map);
      setLoadingSemana(false);
    });
  }, [baseDate]);

  const handleParalizaAsignar = async (
    userId: string,
    _turnoBase: 1 | 2,
    targetCoche: string,
    targetServicio: string,
  ) => {
    const fecha = selectedFecha || today;
    // 1. Registrar asignación en ServicioEstado y ActiveAssignments
    await ServicioEstadoService.setState(targetServicio, fecha, {
      choferActual: userId,
      cocheActual: targetCoche,
      status: 'activo',
    });
    await ActiveAssignmentsService.recordAssignment(targetServicio, fecha, targetCoche, userId, {});
    // 2. Cascada: si hay un coche paralizado en el modal, marcar su personal como enLista
    if (modalParaliza) {
      const cocheConfig = coches.find((c) => c.cocheInternalNumber === modalParaliza.coche);
      if (cocheConfig?.id) {
        const otrosUserIds = cocheConfig.personal
          .filter((p) => p.userId !== userId)
          .map((p) => p.userId);
        if (otrosUserIds.length > 0) {
          await CochePersonalService.marcarEnLista(cocheConfig.id, otrosUserIds);
        }
      }
    }
  };

  const handleSaveDay = async () => {
    if (!editFecha || editBuffer.length === 0) return;
    setSaving(true);
    const record = await ProgramacionSemanalService.save(editFecha, editBuffer);
    setSemanaData((prev) => new Map(prev).set(editFecha, record));
    setSaving(false);
    setEditMode(false);
    setEditBuffer([]);
  };

  // Build a quick lookup: fecha → {coche → servicio}
  const servicioMap = new Map<string, Map<string, string>>();
  semanaData.forEach((record, fecha) => {
    const cocheMap = new Map<string, string>();
    record.distribuciones.forEach((d) => {
      cocheMap.set(d.cocheInternalNumber, d.servicio);
    });
    servicioMap.set(fecha, cocheMap);
  });

  // All coches appearing in any day of the week (from semanaData OR configured coches)
  const allCocheNums = new Set<string>();
  coches.forEach((c) => allCocheNums.add(c.cocheInternalNumber));
  semanaData.forEach((r) => r.distribuciones.forEach((d) => allCocheNums.add(d.cocheInternalNumber)));
  const sortedCoches = Array.from(allCocheNums).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={baseDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white"
        />
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-red-900/50 border border-red-700/40 inline-block" />
            Paraliza
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-indigo-900/30 border border-indigo-700/30 inline-block" />
            Nocturn
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-slate-800 border border-slate-700 inline-block" />
            Operativo
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          {editMode ? (
            <>
              <button onClick={() => setEditMode(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-slate-300 font-bold transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveDay} disabled={saving}
                className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 border border-primary-700 rounded-lg text-xs text-white font-bold transition-colors flex items-center gap-1">
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Guardar
              </button>
            </>
          ) : (
            <button
              onClick={() => { setEditMode(true); setEditFecha(today); setEditBuffer([]); }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-slate-300 font-bold transition-colors flex items-center gap-1">
              <PlusCircle className="w-3 h-3" />
              Cargar Informe
            </button>
          )}
        </div>
      </div>

      {/* Edit form: paste/type the day's distribution */}
      {editMode && (
        <div className="bg-slate-900 border border-primary-700/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-black text-white">Cargar Informe de Tránsito</h4>
            <input type="date" value={editFecha} onChange={(e) => setEditFecha(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white" />
          </div>
          <p className="text-xs text-slate-500">
            Ingrese las distribuciones en formato: <span className="font-mono text-slate-300">COCHE SERVICIO</span> (una por línea).
            Ejemplo: <span className="font-mono text-slate-300">35 Paraliza</span> o <span className="font-mono text-slate-300">10 1079</span> o <span className="font-mono text-slate-300">21 Noc 1048</span>
          </p>
          <textarea
            rows={10}
            placeholder={"1 Paraliza\n2 1001\n3 1042\n10 1079\n21 Noc 1048\n..."}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-slate-600 resize-y"
            onChange={(e) => {
              const lines = e.target.value.split('\n').filter((l) => l.trim());
              const dists: DistribucionCoche[] = [];
              lines.forEach((line, i) => {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 2) return;
                const coche = parts[0];
                const servicio = parts.slice(1).join(' ');
                dists.push({ cocheInternalNumber: coche, servicio, orden: i });
              });
              setEditBuffer(dists);
            }}
          />
          <div className="text-xs text-slate-500">
            {editBuffer.length} coches · {editBuffer.filter((d) => esParaliza(d.servicio)).length} paralizan
          </div>
        </div>
      )}

      {/* Grid: Informe de Tránsito format */}
      {loadingSemana ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-3 py-2 text-slate-500 font-black uppercase tracking-widest sticky left-0 bg-slate-950 z-10 w-16">
                  Coche
                </th>
                {weekDates.map((fecha) => {
                  const dayName = DIAS_SEMANA_SHORT[new Date(fecha + 'T12:00:00').getDay()];
                  const isToday = fecha === today;
                  const record = semanaData.get(fecha);
                  return (
                    <th key={fecha}
                      className={`px-2 py-2 text-center font-black uppercase tracking-widest min-w-[90px] ${isToday ? 'text-primary-400' : 'text-slate-500'}`}>
                      {dayName}
                      <div className="text-[10px] font-normal text-slate-600 mt-0.5">{fecha.slice(5)}</div>
                      {record && (
                        <div className="flex items-center justify-center gap-1 mt-0.5">
                          <span className="text-[9px] text-emerald-600">{record.totalServicios}op</span>
                          {(record.totalParalizas || 0) > 0 && (
                            <span className="text-[9px] text-red-500">{record.totalParalizas}par</span>
                          )}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedCoches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-600">
                    Sin datos de distribución semanal. Use "Cargar Informe" para ingresar el Informe de Tránsito.
                  </td>
                </tr>
              ) : (
                sortedCoches.map((cocheNum) => (
                  <tr key={cocheNum} className="border-b border-slate-900/80 hover:bg-slate-900/20 transition-colors">
                    <td className="px-3 py-1.5 font-black text-white sticky left-0 bg-slate-950 z-10">
                      {cocheNum}
                    </td>
                    {weekDates.map((fecha) => {
                      const servicio = servicioMap.get(fecha)?.get(cocheNum);
                      const record = semanaData.get(fecha);
                      const dist = record?.distribuciones.find((d) => d.cocheInternalNumber === cocheNum);
                      const isToday = fecha === today;
                      return (
                        <td key={fecha} className={`px-1.5 py-1 ${isToday ? 'bg-primary-900/5' : ''}`}>
                          {servicio && dist ? (
                            <CeldaServicio
                              dist={dist}
                              onClick={esParaliza(servicio) ? () => {
                                setSelectedFecha(fecha);
                                setModalParaliza({ fecha, coche: cocheNum });
                              } : undefined}
                            />
                          ) : (
                            <span className="text-slate-800 text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Paraliza modal */}
      {modalParaliza && (
        <ModalParaliza
          fecha={modalParaliza.fecha}
          cocheInternalNumber={modalParaliza.coche}
          coches={coches}
          distribuciones={semanaData.get(modalParaliza.fecha)?.distribuciones || []}
          users={users}
          onClose={() => setModalParaliza(null)}
          onAsignar={handleParalizaAsignar}
        />
      )}
    </div>
  );
}

// ─── TAB: Lista (D&D operativo) ──────────────────────────────────────────────

function TabLista({
  selectedDate,
  onDateChange,
  filas,
  conductoresLibres,
  loadingFilas,
  onDropConductor,
  onOpenAsignar,
  onOpenSuplente,
  onOpenAveria,
  onOpenInfraccion,
  onOpenBulkUpload,
}: {
  selectedDate: string;
  onDateChange: (d: string) => void;
  filas: FilaServicio[];
  conductoresLibres: User[];
  loadingFilas: boolean;
  onDropConductor: (userId: string, fila: FilaServicio) => Promise<void>;
  onOpenAsignar: (fila: FilaServicio) => void;
  onOpenSuplente: (fila: FilaServicio) => void;
  onOpenAveria: (fila: FilaServicio) => void;
  onOpenInfraccion: (fila: FilaServicio) => void;
  onOpenBulkUpload: () => void;
}) {
  const dragRef = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const counts = { verde: 0, naranja: 0, amarillo: 0, rojo: 0 };
  filas.forEach((f) => counts[f.semaforo]++);

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-0">
      {/* Retén */}
      <aside className="w-full lg:w-60 shrink-0">
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Retén / Lista</span>
            <Badge color="amber">{conductoresLibres.length}</Badge>
          </div>
          <div className="p-2 space-y-1 max-h-[55vh] overflow-y-auto custom-scrollbar">
            {conductoresLibres.length === 0 ? (
              <p className="text-xs text-slate-600 px-2 py-4 text-center">Sin conductores libres</p>
            ) : (
              conductoresLibres.map((u) => {
                const uid = String(u.uid || u.id);
                return (
                  <div
                    key={uid}
                    draggable
                    onDragStart={() => { dragRef.current = uid; }}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-2 py-2 cursor-grab active:cursor-grabbing transition-colors"
                  >
                    <div className="w-7 h-7 bg-primary-600/20 border border-primary-600/30 rounded-full flex items-center justify-center text-xs font-black text-primary-400 shrink-0">
                      {(u.internalNumber || '').slice(-2) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white truncate">
                        {resolveUserName(u as Parameters<typeof resolveUserName>[0])}
                      </div>
                      <div className="text-[10px] text-slate-500">Int. {u.internalNumber || '—'}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="p-2 border-t border-slate-800">
            <button
              onClick={onOpenBulkUpload}
              className="w-full flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-400 font-bold transition-colors"
            >
              <Upload className="w-3 h-3" />
              Importar Lista
            </button>
          </div>
        </div>
      </aside>

      {/* Grilla */}
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white"
          />
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{counts.verde}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />{counts.naranja}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />{counts.amarillo}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{counts.rojo}</span>
          </div>
        </div>

        {loadingFilas ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
          </div>
        ) : filas.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Sin servicios para esta fecha.</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-[62vh] overflow-y-auto custom-scrollbar pr-1">
            {filas.map((fila) => (
              <div
                key={fila.id}
                onDragOver={(e) => { e.preventDefault(); setDragOver(fila.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const uid = dragRef.current;
                  if (uid) { dragRef.current = null; await onDropConductor(uid, fila); }
                }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-all text-sm ${
                  dragOver === fila.id
                    ? 'bg-primary-900/30 border-primary-500 shadow-lg shadow-primary-900/20'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <SemaforoDot color={fila.semaforo} />
                <span className="font-mono text-slate-400 w-14 shrink-0 text-xs">{fila.servicioId}</span>
                <span className="text-slate-500 w-8 shrink-0 text-xs">{fila.linea}</span>
                <span className="text-slate-500 w-11 shrink-0 text-xs">{fila.horaInicio}</span>

                <div className="flex-1 min-w-0">
                  {fila.cocheId ? (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Bus className="w-3 h-3 shrink-0" />{fila.cocheId}
                    </span>
                  ) : (
                    <span className="text-xs text-red-400">Sin coche</span>
                  )}
                </div>

                <div className="w-24 shrink-0 truncate text-xs">
                  {fila.conductorNombre ? (
                    <span className="text-emerald-400">{fila.conductorNombre}</span>
                  ) : (
                    <span className="text-slate-600 italic">Sin conductor</span>
                  )}
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button title="Asignar" onClick={() => onOpenAsignar(fila)}
                    className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-colors">
                    <UserPlus className="w-3.5 h-3.5" />
                  </button>
                  <button title="Suplente" onClick={() => onOpenSuplente(fila)}
                    className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-amber-400 transition-colors">
                    <Users className="w-3.5 h-3.5" />
                  </button>
                  <button title="Avería" onClick={() => onOpenAveria(fila)}
                    className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-orange-400 transition-colors">
                    <Wrench className="w-3.5 h-3.5" />
                  </button>
                  <button title="Infracción" onClick={() => onOpenInfraccion(fila)}
                    className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-red-400 transition-colors">
                    <FileWarning className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB: Correlativos ────────────────────────────────────────────────────────

function TabCorrelativos({
  correlativos,
  users,
  coches,
  loading,
  onAprobar,
  onRechazar,
  onNuevoCorrelativo,
}: {
  correlativos: CorrelativoRequest[];
  users: User[];
  coches: CochePersonal[];
  loading: boolean;
  onAprobar: (id: string) => Promise<void>;
  onRechazar: (id: string) => Promise<void>;
  onNuevoCorrelativo: () => void;
}) {
  const estadoColor: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'slate'> = {
    pendiente: 'amber',
    aprobado: 'green',
    rechazado: 'red',
    completado: 'blue',
  };

  const pendientes = correlativos.filter((c) => c.estado === 'pendiente');
  const resueltos = correlativos.filter((c) => c.estado !== 'pendiente');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge color="amber">{pendientes.length} pendientes</Badge>
          <Badge color="slate">{resueltos.length} resueltos</Badge>
        </div>
        <button
          onClick={onNuevoCorrelativo}
          className="flex items-center gap-1.5 bg-primary-600/20 hover:bg-primary-600/40 text-primary-400 border border-primary-600/30 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          Nueva Solicitud
        </button>
      </div>

      {correlativos.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <ArrowLeftRight className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>No hay solicitudes de correlativo.</p>
        </div>
      )}

      {[...pendientes, ...resueltos].map((c) => (
        <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-white">Int. {c.solicitanteInternalNumber}{c.solicitanteNombre ? ` · ${c.solicitanteNombre}` : ''}</span>
                <ArrowLeftRight className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="font-bold text-white">Int. {c.cubiertaInternalNumber}{c.cubiertaNombre ? ` · ${c.cubiertaNombre}` : ''}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{c.fecha}</div>
            </div>
            <Badge color={estadoColor[c.estado] || 'slate'}>
              {c.estado.charAt(0).toUpperCase() + c.estado.slice(1)}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {([['Turno cubierto (T1)', c.turno1], ['Turno propio (T2)', c.turno2]] as const).map(([label, t]) => (
              <div key={label} className="bg-slate-800/50 rounded-lg p-2 space-y-0.5">
                <div className="text-slate-500 font-bold mb-1">{label}</div>
                {(t as TurnoCorrelativo).cocheInternalNumber && (
                  <div className="flex items-center gap-1 text-slate-300">
                    <Bus className="w-3 h-3" />Coche {(t as TurnoCorrelativo).cocheInternalNumber}
                  </div>
                )}
                {(t as TurnoCorrelativo).linea && (
                  <div className="flex items-center gap-1 text-slate-300">
                    <MapPin className="w-3 h-3" />Línea {(t as TurnoCorrelativo).linea}
                  </div>
                )}
                {((t as TurnoCorrelativo).horaInicio || (t as TurnoCorrelativo).horaFin) && (
                  <div className="flex items-center gap-1 text-slate-300">
                    <Clock className="w-3 h-3" />{(t as TurnoCorrelativo).horaInicio}–{(t as TurnoCorrelativo).horaFin}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={`flex items-start gap-2 rounded-lg p-2.5 text-xs ${
            c.factible
              ? 'bg-emerald-900/20 border border-emerald-700/30 text-emerald-400'
              : 'bg-red-900/20 border border-red-700/30 text-red-400'
          }`}>
            {c.factible
              ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
            <div>
              <div className="font-bold">{c.factible ? 'Factible' : 'No factible'}</div>
              {c.recomendacion && <div className="mt-0.5 opacity-80">{c.recomendacion}</div>}
            </div>
          </div>

          {c.notas && <div className="text-xs text-slate-400 italic">Notas: {c.notas}</div>}

          {c.estado === 'pendiente' && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => c.id && onAprobar(c.id)}
                className="flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />Aprobar
              </button>
              <button
                onClick={() => c.id && onRechazar(c.id)}
                className="flex items-center gap-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />Rechazar
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Modal: Asignar Conductor ─────────────────────────────────────────────────

function ModalAsignar({
  fila,
  conductores,
  titulo,
  onClose,
  onConfirm,
}: {
  fila: FilaServicio;
  conductores: User[];
  titulo?: string;
  onClose: () => void;
  onConfirm: (userId: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Modal onClose={onClose}>
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <h3 className="font-bold text-white">{titulo || 'Asignar Conductor'}</h3>
        <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs text-slate-400">
          Servicio <span className="font-mono text-white">{fila.servicioId}</span> · Coche {fila.cocheId || '—'}
        </p>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
          <option value="">— Seleccionar conductor —</option>
          {conductores.map((u) => (
            <option key={String(u.uid || u.id)} value={String(u.uid || u.id)}>
              {resolveUserName(u as Parameters<typeof resolveUserName>[0])} (Int. {u.internalNumber || '—'})
            </option>
          ))}
        </select>
      </div>
      <div className="p-4 border-t border-slate-700 flex gap-2">
        <button onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-lg py-2 text-sm text-slate-300 font-bold transition-colors">
          Cancelar
        </button>
        <button
          disabled={!selected || saving}
          onClick={async () => { setSaving(true); await onConfirm(selected); setSaving(false); }}
          className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg py-2 text-sm text-white font-bold transition-colors flex items-center justify-center gap-1"
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}Confirmar
        </button>
      </div>
    </Modal>
  );
}

// ─── Modal: Avería ────────────────────────────────────────────────────────────

function ModalAveria({
  fila,
  vehicles,
  assignedCocheIds,
  selectedDate,
  onClose,
}: {
  fila: FilaServicio;
  vehicles: Vehicle[];
  assignedCocheIds: Set<string>;
  selectedDate: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<ReportarAveriaResult | null>(null);
  const [saving, setSaving] = useState(false);

  const handleReportar = async () => {
    if (!fila.cocheId) return;
    setSaving(true);
    try {
      const r = await reportarAveria(fila.cocheId, selectedDate, vehicles, assignedCocheIds);
      setResult(r);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <h3 className="font-bold text-white">Reportar Avería</h3>
        <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs text-slate-400">Coche {fila.cocheId || '—'} · Servicio {fila.servicioId}</p>
        {!result ? (
          <>
            <p className="text-sm text-slate-300">
              Se marcará el coche como fuera de servicio y se buscarán coches de reemplazo del retén.
            </p>
            <div className="flex gap-2 pt-2">
              <button onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-lg py-2 text-sm text-slate-300 font-bold transition-colors">
                Cancelar
              </button>
              <button
                disabled={saving || !fila.cocheId}
                onClick={handleReportar}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg py-2 text-sm text-white font-bold transition-colors flex items-center justify-center gap-1"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}Confirmar Avería
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4" />Avería registrada
            </div>
            <p className="text-xs text-slate-400">{result.serviciosMarcadosPendiente.length} servicios marcados como pendiente de coche.</p>
            {result.cochesSugeridos.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-1 font-bold">Coches de reemplazo sugeridos:</p>
                {result.cochesSugeridos.slice(0, 5).map((v) => (
                  <div key={String(v.id)} className="bg-slate-800 rounded px-2 py-1 text-xs text-slate-300 mb-1">
                    Coche {v.internalNumber || v.id} {v.brand ? `· ${v.brand}` : ''}
                  </div>
                ))}
              </div>
            )}
            <button onClick={onClose} className="w-full bg-slate-800 hover:bg-slate-700 rounded-lg py-2 text-sm text-slate-300 font-bold transition-colors mt-2">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Modal: Infracción ────────────────────────────────────────────────────────

function ModalInfraccion({
  fila,
  selectedDate,
  onClose,
}: {
  fila: FilaServicio;
  selectedDate: string;
  onClose: () => void;
}) {
  const tipos = ['Exceso velocidad', 'Pasada roja', 'Incumplimiento horario', 'Incidente pasajero', 'Otro'];
  const [tipo, setTipo] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <Modal onClose={onClose}>
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <h3 className="font-bold text-white">Registrar Infracción</h3>
        <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
      </div>
      <div className="p-4 space-y-3">
        {done ? (
          <div className="flex items-center gap-2 text-emerald-400 font-bold py-4 justify-center">
            <CheckCircle2 className="w-5 h-5" />Infracción registrada
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-400">Servicio {fila.servicioId} · {fila.conductorNombre || 'Sin conductor'}</p>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">— Tipo de infracción —</option>
              {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones..." rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 resize-none" />
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-lg py-2 text-sm text-slate-300 font-bold transition-colors">
                Cancelar
              </button>
              <button
                disabled={!tipo || saving}
                onClick={async () => {
                  setSaving(true);
                  await ServicioEstadoService.setState(fila.servicioId, selectedDate, { status: 'incidencia' });
                  setSaving(false);
                  setDone(true);
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg py-2 text-sm text-white font-bold transition-colors flex items-center justify-center gap-1"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}Registrar
              </button>
            </div>
          </>
        )}
        {done && (
          <button onClick={onClose} className="w-full bg-slate-800 hover:bg-slate-700 rounded-lg py-2 text-sm text-slate-300 font-bold transition-colors">
            Cerrar
          </button>
        )}
      </div>
    </Modal>
  );
}

// ─── Modal: Nuevo Correlativo ─────────────────────────────────────────────────

function ModalNuevoCorrelativo({
  users,
  coches,
  fecha,
  onClose,
  onConfirm,
}: {
  users: User[];
  coches: CochePersonal[];
  fecha: string;
  onClose: () => void;
  onConfirm: (data: Omit<CorrelativoRequest, 'id' | 'mismoCoche' | 'gapMinutos' | 'factible' | 'recomendacion' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}) {
  const [solId, setSolId] = useState('');
  const [cubId, setCubId] = useState('');
  const [t1Coche, setT1Coche] = useState('');
  const [t1Linea, setT1Linea] = useState('');
  const [t1Ini, setT1Ini] = useState('');
  const [t1Fin, setT1Fin] = useState('');
  const [t2Coche, setT2Coche] = useState('');
  const [t2Linea, setT2Linea] = useState('');
  const [t2Ini, setT2Ini] = useState('');
  const [t2Fin, setT2Fin] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof calcularFactibilidadCorrelativo> | null>(null);
  const [saving, setSaving] = useState(false);

  const sol = users.find((u) => String(u.uid || u.id) === solId);
  const cub = users.find((u) => String(u.uid || u.id) === cubId);

  return (
    <Modal onClose={onClose}>
      <div className="p-4 border-b border-slate-700 flex items-center justify-between shrink-0">
        <h3 className="font-bold text-white">Nueva Solicitud de Correlativo</h3>
        <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
      </div>
      <div className="p-4 space-y-3 overflow-y-auto flex-1">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1 block">Solicitante (cubre)</label>
            <select value={solId} onChange={(e) => setSolId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white">
              <option value="">— Interno —</option>
              {users.map((u) => (
                <option key={String(u.uid || u.id)} value={String(u.uid || u.id)}>
                  {u.internalNumber} · {resolveUserName(u as Parameters<typeof resolveUserName>[0])}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1 block">Cubierto</label>
            <select value={cubId} onChange={(e) => setCubId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white">
              <option value="">— Interno —</option>
              {users.map((u) => (
                <option key={String(u.uid || u.id)} value={String(u.uid || u.id)}>
                  {u.internalNumber} · {resolveUserName(u as Parameters<typeof resolveUserName>[0])}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Turno 1 (cubierto)</div>
            <select value={t1Coche} onChange={(e) => setT1Coche(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white">
              <option value="">— Coche —</option>
              {coches.map((c) => <option key={c.cocheInternalNumber} value={c.cocheInternalNumber}>{c.cocheInternalNumber}</option>)}
            </select>
            <input placeholder="Línea" value={t1Linea} onChange={(e) => setT1Linea(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-600" />
            <div className="grid grid-cols-2 gap-1">
              <input type="time" value={t1Ini} onChange={(e) => setT1Ini(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
              <input type="time" value={t1Fin} onChange={(e) => setT1Fin(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Turno 2 (propio)</div>
            <select value={t2Coche} onChange={(e) => setT2Coche(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white">
              <option value="">— Coche —</option>
              {coches.map((c) => <option key={c.cocheInternalNumber} value={c.cocheInternalNumber}>{c.cocheInternalNumber}</option>)}
            </select>
            <input placeholder="Línea" value={t2Linea} onChange={(e) => setT2Linea(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-600" />
            <div className="grid grid-cols-2 gap-1">
              <input type="time" value={t2Ini} onChange={(e) => setT2Ini(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
              <input type="time" value={t2Fin} onChange={(e) => setT2Fin(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
            </div>
          </div>
        </div>

        <button
          onClick={() => setPreview(calcularFactibilidadCorrelativo(
            { cocheInternalNumber: t1Coche, linea: t1Linea, horaInicio: t1Ini, horaFin: t1Fin },
            { cocheInternalNumber: t2Coche, linea: t2Linea, horaInicio: t2Ini, horaFin: t2Fin },
          ))}
          className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg py-2 text-sm text-slate-300 font-bold transition-colors"
        >
          Verificar Factibilidad
        </button>

        {preview && (
          <div className={`flex items-start gap-2 rounded-lg p-2.5 text-xs ${
            preview.factible
              ? 'bg-emerald-900/20 border border-emerald-700/30 text-emerald-400'
              : 'bg-red-900/20 border border-red-700/30 text-red-400'
          }`}>
            {preview.factible ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
            <div>
              <div className="font-bold">{preview.factible ? 'Factible' : 'No factible'}</div>
              <div className="mt-0.5 opacity-80">{preview.recomendacion}</div>
            </div>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-slate-700 flex gap-2 shrink-0">
        <button onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-lg py-2 text-sm text-slate-300 font-bold transition-colors">
          Cancelar
        </button>
        <button
          disabled={!solId || !cubId || saving}
          onClick={async () => {
            if (!solId || !cubId) return;
            setSaving(true);
            await onConfirm({
              fecha,
              solicitanteUserId: solId,
              solicitanteInternalNumber: sol?.internalNumber || '',
              solicitanteNombre: sol ? resolveUserName(sol as Parameters<typeof resolveUserName>[0]) : undefined,
              cubiertaUserId: cubId,
              cubiertaInternalNumber: cub?.internalNumber || '',
              cubiertaNombre: cub ? resolveUserName(cub as Parameters<typeof resolveUserName>[0]) : undefined,
              turno1: { cocheInternalNumber: t1Coche, linea: t1Linea, horaInicio: t1Ini, horaFin: t1Fin },
              turno2: { cocheInternalNumber: t2Coche, linea: t2Linea, horaInicio: t2Ini, horaFin: t2Fin },
              estado: 'pendiente',
            });
            setSaving(false);
          }}
          className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg py-2 text-sm text-white font-bold transition-colors flex items-center justify-center gap-1"
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}Crear Solicitud
        </button>
      </div>
    </Modal>
  );
}

// ─── TAB HISTORIAL ────────────────────────────────────────────────────────────

function TabHistorial({ users }: { users: User[] }) {
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];

  const [modo, setModo] = useState<'conductor' | 'coche'>('conductor');
  const [busqueda, setBusqueda] = useState('');
  const [desde, setDesde] = useState(monthAgo);
  const [hasta, setHasta] = useState(today);
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState<import('../../services/firestore/activeAssignments').ActiveAssignmentRecord[]>([]);
  const [error, setError] = useState('');

  // Buscar usuario por nº interno o apellido
  const resolveChofer = (term: string): string | null => {
    const norm = term.trim().toUpperCase();
    const u = users.find(
      (u) => u.internalNumber === norm || u.lastName?.toUpperCase().includes(norm) || u.fullName?.toUpperCase().includes(norm)
    );
    return u?.uid ?? null;
  };

  const buscar = async () => {
    setError('');
    setResultados([]);
    const term = busqueda.trim();
    if (!term) { setError('Ingresa un interno o apellido'); return; }
    setLoading(true);
    try {
      if (modo === 'conductor') {
        const uid = resolveChofer(term);
        if (!uid) { setError(`No se encontró conductor: "${term}"`); setLoading(false); return; }
        const res = await ActiveAssignmentsService.getByChofer(uid, desde, hasta);
        setResultados(res);
      } else {
        const res = await ActiveAssignmentsService.getByCoche(term, desde, hasta);
        setResultados(res);
      }
    } catch (e: any) {
      setError(e.message ?? 'Error al consultar');
    } finally {
      setLoading(false);
    }
  };

  // Para mostrar nombre de conductor
  const nombreChofer = (uid: string | null) => {
    if (!uid) return '—';
    const u = users.find((u) => u.uid === uid || u.id === uid);
    return u ? `Int.${u.internalNumber} ${u.lastName ?? u.fullName ?? ''}` : uid;
  };

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Filtros */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
          <Filter className="w-4 h-4 text-primary-400" />
          Búsqueda Histórica
        </div>

        {/* Modo */}
        <div className="flex gap-2">
          {(['conductor', 'coche'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setModo(m); setResultados([]); setError(''); setBusqueda(''); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                modo === m
                  ? 'bg-primary-600 border-primary-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {m === 'conductor' ? 'Por Conductor' : 'Por Coche'}
            </button>
          ))}
        </div>

        {/* Búsqueda */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder={modo === 'conductor' ? 'Nº interno o apellido...' : 'Nº de coche...'}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscar()}
              className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
            />
          </div>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="px-2 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-primary-500"
          />
          <span className="text-slate-500 self-center text-xs">→</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="px-2 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-primary-500"
          />
          <button
            onClick={buscar}
            disabled={loading}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg text-sm font-bold text-white transition-colors flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>

      {/* Resultados */}
      {resultados.length > 0 && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
            <History className="w-4 h-4 text-primary-400" />
            <span className="text-sm font-bold text-white">{resultados.length} registros encontrados</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="px-4 py-2 text-left">Fecha</th>
                  <th className="px-4 py-2 text-left">Servicio</th>
                  <th className="px-4 py-2 text-left">Coche</th>
                  <th className="px-4 py-2 text-left">Conductor</th>
                  <th className="px-4 py-2 text-left">Línea</th>
                  <th className="px-4 py-2 text-left">Cambios</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((r, i) => (
                  <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2 text-slate-300 font-mono">{r.date}</td>
                    <td className="px-4 py-2">
                      <span className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 font-bold text-white">{r.servicioId}</span>
                    </td>
                    <td className="px-4 py-2">
                      {r.cocheId ? (
                        <span className="bg-blue-900/30 border border-blue-800 rounded px-1.5 py-0.5 text-blue-300 font-bold">{r.cocheId}</span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-300">{nombreChofer(r.choferId)}</td>
                    <td className="px-4 py-2 text-slate-400">{r.linea ?? '—'}</td>
                    <td className="px-4 py-2">
                      {r.historial.length > 0 ? (
                        <span className="bg-amber-900/30 border border-amber-800 rounded px-1.5 py-0.5 text-amber-300 text-[10px] font-bold">
                          {r.historial.length} cambio{r.historial.length > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-[10px]">sin cambios</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && resultados.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-600">
          <History className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">Busca por conductor o coche para ver el historial de servicios</p>
        </div>
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function TerminalListero() {
  const { user: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('lista');

  // ── Shared ──
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [users, setUsers] = useState<User[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingBase, setLoadingBase] = useState(true);

  // ── Coches ──
  const [coches, setCoches] = useState<CochePersonal[]>([]);
  const [loadingCoches, setLoadingCoches] = useState(false);
  const cochesLoaded = useRef(false);

  // ── Lista ──
  const [filas, setFilas] = useState<FilaServicio[]>([]);
  const [conductoresLibres, setConductoresLibres] = useState<User[]>([]);
  const [programacion, setProgramacion] = useState<ProgramacionDiariaRecord[]>([]);
  const [loadingFilas, setLoadingFilas] = useState(false);
  const [toleranciaMinutos, setToleranciaMinutos] = useState(5);

  // ── Correlativos ──
  const [correlativos, setCorrelativos] = useState<CorrelativoRequest[]>([]);
  const [loadingCorrelativos, setLoadingCorrelativos] = useState(false);

  // ── Modals ──
  const [modalAsignar, setModalAsignar] = useState<FilaServicio | null>(null);
  const [modalSuplente, setModalSuplente] = useState<FilaServicio | null>(null);
  const [modalAveria, setModalAveria] = useState<FilaServicio | null>(null);
  const [modalInfraccion, setModalInfraccion] = useState<FilaServicio | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showNuevoCorrelativo, setShowNuevoCorrelativo] = useState(false);

  // ── Tolerancia ──
  useEffect(() => {
    SystemConfigService.get()
      .then((cfg) => setToleranciaMinutos(cfg.toleranciaMinutos))
      .catch(() => {});
  }, []);

  // ── Base data ──
  useEffect(() => {
    Promise.all([UserService.getAll(), FleetService.getVehicles()])
      .then(([u, v]) => { setUsers(u); setVehicles(v); })
      .finally(() => setLoadingBase(false));
  }, []);

  // ── Coches (load once, or when tab requires it) ──
  useEffect(() => {
    if (activeTab !== 'coches' && activeTab !== 'semana' && activeTab !== 'correlativos') return;
    if (cochesLoaded.current) return;
    setLoadingCoches(true);
    CochePersonalService.getAll()
      .then((c) => { setCoches(c); cochesLoaded.current = true; })
      .finally(() => setLoadingCoches(false));
  }, [activeTab]);

  // ── Correlativos subscription ──
  useEffect(() => {
    if (activeTab !== 'correlativos') return;
    setLoadingCorrelativos(true);
    const unsub = CorrelativoService.subscribe((items) => {
      setCorrelativos(items);
      setLoadingCorrelativos(false);
    });
    return unsub;
  }, [activeTab]);

  // ── Lista: estado vivo + programacion ──
  useEffect(() => {
    setLoadingFilas(true);
    // Fetch programacion once per date
    ProgramacionDiariaService.getByDate(selectedDate)
      .then(setProgramacion)
      .catch(() => setProgramacion([]));

    // Subscribe to servicio_estado for live semáforo
    const unsub = ServicioEstadoService.subscribeByDate(selectedDate, (estados) => {
      const estadoMap = new Map(estados.map((e) => [e.servicioId, e]));

      setProgramacion((prog) => {
        const built: FilaServicio[] = prog.map((r) => {
          const servId = String(r.servicio || '');
          const estado = estadoMap.get(servId);
          const hasCoche = !!(estado?.cocheActual || r.vehiculo);
          const hasConductor = !!(estado?.choferActual || r.conductor);
          const atraso = estado?.atrasoMinutos || 0;
          const sem = computeSemaforo(hasCoche, hasConductor, estado?.status, atraso, toleranciaMinutos);

          const conductorId = estado?.choferActual || String(r.conductor || '') || null;
          let conductorNombre: string | null = null;
          if (conductorId) {
            const u = users.find((x) => String(x.uid || x.id) === conductorId);
            if (u) conductorNombre = resolveUserName(u as Parameters<typeof resolveUserName>[0]);
            else conductorNombre = conductorId.slice(0, 8);
          }

          return {
            id: String(r.id || ''),
            servicioId: servId,
            linea: String(r.linea || ''),
            cocheId: estado?.cocheActual || String(r.vehiculo || '') || null,
            conductorId,
            conductorNombre,
            horaInicio: String(r.horaInicio || ''),
            semaforo: sem,
            atrasoMinutos: atraso,
            estado,
            record: r,
          };
        });
        built.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
        setFilas(built);
        setLoadingFilas(false);
        return prog;
      });
    });

    return () => unsub();
  }, [selectedDate, users, toleranciaMinutos]);

  // Conductores libres (derived from programacion)
  useEffect(() => {
    const asignadoIds = new Set(
      programacion.map((r) => String(r.conductor || '')).filter(Boolean),
    );
    const libres = users.filter(
      (u) =>
        (u.role === 'driver' || u.role === 'conductor' || u.rol === 'conductor') &&
        !asignadoIds.has(String(u.uid || u.id)),
    );
    setConductoresLibres(libres);
  }, [programacion, users]);

  // ── Handlers ──

  const handleDropConductor = async (userId: string, fila: FilaServicio) => {
    const cocheId = fila.cocheId || '';

    // UNOTT validation (best-effort: check if conductor has another shift today)
    const prevRecord = programacion.find((r) => String(r.conductor || '') === userId && r.servicio !== fila.servicioId);
    if (prevRecord?.horaInicio && fila.horaInicio) {
      const v = validateAssignment(userId, fila.horaInicio, prevRecord.horaInicio);
      if (!v.valid) {
        alert(`⚠️ UNOTT: ${v.error}`);
        return;
      }
    }

    await Promise.all([
      ServicioEstadoService.setState(fila.servicioId, selectedDate, {
        choferActual: userId,
        cocheActual: cocheId,
        status: 'activo',
        linea: fila.linea,
        horaInicio: fila.horaInicio,
      }),
      ActiveAssignmentsService.recordAssignment(fila.servicioId, selectedDate, cocheId, userId, {
        linea: fila.linea,
        horaInicio: fila.horaInicio,
      }),
    ]);

    // Update programacion record
    if (fila.record.id) {
      await ProgramacionDiariaService.update(fila.record.id, { conductor: userId });
    }
  };

  const handleAvanzarRotacion = async (coche: CochePersonal) => {
    if (!coche.id) return;
    await CochePersonalService.avanzarRotacion(coche.id, coche);
    cochesLoaded.current = false;
    setLoadingCoches(true);
    CochePersonalService.getAll()
      .then((c) => { setCoches(c); cochesLoaded.current = true; })
      .finally(() => setLoadingCoches(false));
  };

  const assignedCocheIds = new Set(filas.map((f) => f.cocheId || '').filter(Boolean));

  // ── Tabs ──
  const tabs: { id: TabId; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'lista', label: 'Lista Diaria', icon: ClipboardList },
    { id: 'coches', label: 'Coches', icon: Bus, badge: coches.length || undefined },
    { id: 'semana', label: 'Semana', icon: Calendar },
    {
      id: 'correlativos',
      label: 'Correlativos',
      icon: ArrowLeftRight,
      badge: correlativos.filter((c) => c.estado === 'pendiente').length || undefined,
    },
    { id: 'historial', label: 'Historial', icon: History },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-black text-white">Terminal Listero</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedDate} · {users.length} conductores · {vehicles.length} coches
              {loadingBase && ' · cargando…'}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-slate-800 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold border-b-2 transition-all whitespace-nowrap relative shrink-0 ${
                  active
                    ? 'border-primary-500 text-primary-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {(tab.badge || 0) > 0 && (
                  <span className="bg-amber-500 text-black text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === 'lista' && (
          <TabLista
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            filas={filas}
            conductoresLibres={conductoresLibres}
            loadingFilas={loadingFilas}
            onDropConductor={handleDropConductor}
            onOpenAsignar={setModalAsignar}
            onOpenSuplente={setModalSuplente}
            onOpenAveria={setModalAveria}
            onOpenInfraccion={setModalInfraccion}
            onOpenBulkUpload={() => setShowBulkUpload(true)}
          />
        )}
        {activeTab === 'coches' && (
          <TabCoches
            coches={coches}
            users={users}
            vehicles={vehicles}
            loading={loadingCoches}
            onAvanzarRotacion={handleAvanzarRotacion}
          />
        )}
        {activeTab === 'semana' && (
          <TabSemana
            coches={coches}
            programacion={programacion}
            users={users}
            baseDate={selectedDate}
          />
        )}
        {activeTab === 'correlativos' && (
          <TabCorrelativos
            correlativos={correlativos}
            users={users}
            coches={coches}
            loading={loadingCorrelativos}
            onAprobar={async (id) => CorrelativoService.aprobar(id, authUser?.uid || 'listero')}
            onRechazar={async (id) => CorrelativoService.rechazar(id, authUser?.uid || 'listero')}
            onNuevoCorrelativo={() => setShowNuevoCorrelativo(true)}
          />
        )}
        {activeTab === 'historial' && (
          <TabHistorial users={users} />
        )}
      </div>

      {/* Modals */}
      {modalAsignar && (
        <ModalAsignar
          fila={modalAsignar}
          conductores={conductoresLibres}
          onClose={() => setModalAsignar(null)}
          onConfirm={async (uid) => { await handleDropConductor(uid, modalAsignar); setModalAsignar(null); }}
        />
      )}

      {modalSuplente && (
        <ModalAsignar
          fila={modalSuplente}
          conductores={conductoresLibres}
          titulo="Asignar Suplente"
          onClose={() => setModalSuplente(null)}
          onConfirm={async (uid) => { await handleDropConductor(uid, modalSuplente); setModalSuplente(null); }}
        />
      )}

      {modalAveria && (
        <ModalAveria
          fila={modalAveria}
          vehicles={vehicles}
          assignedCocheIds={assignedCocheIds}
          selectedDate={selectedDate}
          onClose={() => setModalAveria(null)}
        />
      )}

      {modalInfraccion && (
        <ModalInfraccion
          fila={modalInfraccion}
          selectedDate={selectedDate}
          onClose={() => setModalInfraccion(null)}
        />
      )}

      {showBulkUpload && (
        <Modal onClose={() => setShowBulkUpload(false)}>
          <div className="p-4 border-b border-slate-700 flex items-center justify-between shrink-0">
            <h3 className="font-bold text-white">Importar Lista de Personal</h3>
            <button onClick={() => setShowBulkUpload(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>
          <div className="p-4 overflow-y-auto flex-1">
            <PersonalBulkUpload onComplete={() => setShowBulkUpload(false)} />
          </div>
        </Modal>
      )}

      {showNuevoCorrelativo && (
        <ModalNuevoCorrelativo
          users={users}
          coches={coches}
          fecha={selectedDate}
          onClose={() => setShowNuevoCorrelativo(false)}
          onConfirm={async (data) => {
            await CorrelativoService.create(data);
            setShowNuevoCorrelativo(false);
          }}
        />
      )}
    </div>
  );
}
