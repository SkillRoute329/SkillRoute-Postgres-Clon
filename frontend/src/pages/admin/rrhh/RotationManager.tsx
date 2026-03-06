/**
 * Herramienta de gestión del Motor de Rotación de Personal.
 * Vista tipo grilla/calendario: mes completo, cambiar regla del conductor, arrastrar días libres con validación.
 */
import { useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { Calendar, Users, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  RotationRulesService,
  PersonalRotationService,
  FleetService,
  UserService,
  ActiveAssignmentsService,
} from '../../../services/firestore';
import { getMasterServicios } from '../../../data/ucotMaster';
import { generarRotacion } from '../../../services/staffAssignmentEngine';
import type { ReglaRotacion, PersonalRotacion } from '../../../types/rotation';
import type { Vehicle } from '../../../services/firestore/types';
import type { User } from '../../../services/firestore/types';

const REGIMEN_LABEL: Record<string, string> = {
  '15_15': '15 y 15',
  semana_semana: 'Semana y semana',
  fijo: 'Fijo',
};

const PATRON_LABEL: Record<string, string> = {
  fin_de_semana_rotativo: 'Sáb/Dom rotativo',
  sabado: 'Sábado',
  domingo: 'Domingo',
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
};

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

export default function RotationManager() {
  const [reglas, setReglas] = useState<ReglaRotacion[]>([]);
  const [personal, setPersonal] = useState<PersonalRotacion[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [cartonesTemplate, setCartonesTemplate] = useState<
    Array<{
      serviceNumber: string;
      lineCode: string;
      startTime: string;
      endTime?: string;
      vehicleInternalNumber?: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [assignCoche, setAssignCoche] = useState('');
  const [assignChofer, setAssignChofer] = useState('');
  const [assignServicio, setAssignServicio] = useState('');
  const [assignDate, setAssignDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignDone, setAssignDone] = useState(false);

  const masterServicios = useMemo(() => getMasterServicios(), []);

  useEffect(() => {
    const unsubR = RotationRulesService.subscribe(setReglas);
    const unsubP = PersonalRotationService.subscribe(setPersonal);
    const unsubV = FleetService.subscribeVehicles(setVehicles);
    UserService.getAll()
      .then(setUsers)
      .catch(() => setUsers([]));
    return () => {
      unsubR();
      unsubP();
      unsubV();
    };
  }, []);

  const { start: fechaInicio, end: fechaFin } = useMemo(
    () => monthRange(year, month),
    [year, month],
  );

  const asignaciones = useMemo(() => {
    if (cartonesTemplate.length === 0) return [];
    const flota = vehicles.map((v) => ({
      id: String(v.id),
      internalNumber: String(v.internalNumber ?? v.id),
      status: v.status,
    }));
    return generarRotacion({
      fechaInicio,
      fechaFin,
      personal,
      reglas,
      flota,
      cartones: cartonesTemplate,
    });
  }, [fechaInicio, fechaFin, personal, reglas, vehicles, cartonesTemplate]);

  const daysInMonth = useMemo(() => {
    const n = new Date(year, month, 0).getDate();
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(year, month - 1, i + 1);
      return d.toISOString().split('T')[0];
    });
  }, [year, month]);

  useEffect(() => {
    setLoading(false);
  }, [reglas, personal, vehicles]);

  useEffect(() => {
    console.log('Coches cargados:', vehicles.length);
  }, [vehicles]);

  const selectedPerson = selectedPersonId
    ? personal.find((p) => p.id === selectedPersonId || p.internalNumber === selectedPersonId)
    : null;

  const handleRegimenChange = async (personId: string, newReglaId: string) => {
    await PersonalRotationService.update(personId, { reglaId: newReglaId });
  };

  const handlePatronChange = async (
    personId: string,
    patron: PersonalRotacion['patronDescanso'],
  ) => {
    await PersonalRotationService.update(personId, { patronDescanso: patron });
  };

  const handleAsignarGuardar = async () => {
    if (!assignCoche || !assignChofer || !assignServicio || !assignDate) return;
    setAssignSaving(true);
    setAssignDone(false);
    try {
      const servicio = masterServicios.find(
        (s) => s.servicioId === assignServicio || s.serviceNumber === assignServicio,
      );
      await ActiveAssignmentsService.recordAssignment(
        assignServicio,
        assignDate,
        assignCoche,
        assignChofer,
        { linea: servicio?.linea ?? servicio?.lineaId, horaInicio: servicio?.horaInicioReferencia },
      );
      setAssignDone(true);
      setAssignCoche('');
      setAssignChofer('');
      setAssignServicio('');
    } catch (e) {
      console.error(e);
    } finally {
      setAssignSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto animate-fade-in-up pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1 flex items-center gap-2">
            <Calendar className="w-8 h-8 text-primary-500" />
            Motor de Rotación de Personal
          </h1>
          <p className="text-slate-400 text-sm">
            Grilla del mes: regímenes 15 y 15 / semana y semana, día de descanso y huecos para el
            Listero.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonth((m) => (m <= 1 ? 12 : m - 1))}
            className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-white font-medium min-w-[140px] text-center">
            {new Date(year, month - 1, 1).toLocaleDateString('es-UY', {
              month: 'long',
              year: 'numeric',
            })}
          </span>
          <button
            type="button"
            onClick={() => setMonth((m) => (m >= 12 ? 1 : m + 1))}
            className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-4 space-y-4">
          <section className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <h2 className="text-sm font-bold text-primary-400 uppercase tracking-wider flex items-center gap-2 mb-3">
              Asignar Coche · Conductor · Servicio
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-slate-400 text-xs mb-1">Seleccionar Coche</label>
                <select
                  value={assignCoche}
                  onChange={(e) => setAssignCoche(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  required
                >
                  <option value="">— Coche —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={String(v.id)}>
                      {v.internalNumber ?? v.id}
                    </option>
                  ))}
                  {vehicles.length === 0 && (
                    <option value="" disabled>
                      Sin vehículos (cargue flota)
                    </option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1">Seleccionar Conductor</label>
                <select
                  value={assignChofer}
                  onChange={(e) => setAssignChofer(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  required
                >
                  <option value="">— Conductor —</option>
                  {users.map((u) => (
                    <option key={u.id ?? u.uid} value={String(u.uid ?? u.id)}>
                      {u.fullName || u.internalNumber || u.email || u.uid}
                    </option>
                  ))}
                  {users.length === 0 && (
                    <option value="" disabled>
                      Sin usuarios (colección users)
                    </option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1">Seleccionar Servicio</label>
                <select
                  value={assignServicio}
                  onChange={(e) => setAssignServicio(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  required
                >
                  <option value="">— Servicio —</option>
                  {masterServicios.map((s) => (
                    <option key={s.servicioId} value={s.servicioId}>
                      {s.serviceNumber ?? s.servicioId} · L{s.linea ?? s.lineaId}
                    </option>
                  ))}
                  {masterServicios.length === 0 && (
                    <option value="" disabled>
                      Sin servicios (JSON Maestro)
                    </option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1">Fecha</label>
                <input
                  type="date"
                  value={assignDate}
                  onChange={(e) => setAssignDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleAsignarGuardar}
                disabled={assignSaving || !assignCoche || !assignChofer || !assignServicio}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-medium"
              >
                {assignSaving ? 'Guardando…' : 'Asignar y Guardar'}
              </button>
              {assignDone && (
                <p className="text-emerald-400 text-sm">Guardado en active_assignments.</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 mb-3">
              <Users className="w-4 h-4" />
              Personal con coche fijo
            </h2>
            <ul className="space-y-2 max-h-[280px] overflow-y-auto">
              {personal
                .filter((p) => p.cocheFijo)
                .map((p) => (
                  <li key={p.id ?? p.internalNumber}>
                    <button
                      type="button"
                      onClick={() => setSelectedPersonId(p.id ?? null)}
                      className={clsx(
                        'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                        selectedPersonId === p.id
                          ? 'bg-primary-500/20 border border-primary-500/50 text-white'
                          : 'bg-slate-800 border border-transparent text-slate-300 hover:bg-slate-700',
                      )}
                    >
                      <span className="font-medium">{p.fullName || p.internalNumber}</span>
                      <span className="text-slate-500 ml-2">Coche {p.cocheFijo}</span>
                    </button>
                  </li>
                ))}
              {personal.filter((p) => p.cocheFijo).length === 0 && (
                <li className="text-slate-500 text-sm">
                  Sin personal con coche fijo. Añade en Firestore (colección personal).
                </li>
              )}
            </ul>
          </section>

          {selectedPerson && (
            <section className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2 mb-3">
                <Settings className="w-4 h-4" />
                Regla de {selectedPerson.fullName || selectedPerson.internalNumber}
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Régimen</label>
                  <select
                    value={selectedPerson.reglaId}
                    onChange={(e) => handleRegimenChange(selectedPerson.id!, e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  >
                    {reglas.map((r) => (
                      <option key={r.id} value={r.id}>
                        {REGIMEN_LABEL[r.regimen] ?? r.regimen} – {r.nombre}
                      </option>
                    ))}
                    {reglas.length === 0 && (
                      <option value="">Crear reglas en Firestore (reglas_rotacion)</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Día de descanso</label>
                  <select
                    value={selectedPerson.patronDescanso}
                    onChange={(e) =>
                      handlePatronChange(
                        selectedPerson.id!,
                        e.target.value as PersonalRotacion['patronDescanso'],
                      )
                    }
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  >
                    {(Object.keys(PATRON_LABEL) as (keyof typeof PATRON_LABEL)[]).map((k) => (
                      <option key={String(k)} value={k}>
                        {PATRON_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          )}
        </aside>

        <main className="lg:col-span-8">
          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <div className="bg-slate-800 px-4 py-2 border-b border-slate-700">
              <p className="text-slate-400 text-sm">
                {cartonesTemplate.length > 0
                  ? `Vista generada con ${asignaciones.length} asignaciones (template: ${cartonesTemplate.length} servicios). Cargue R-xxx.xls para ver por vehículo.`
                  : 'Cargue un archivo R-xxx.xls (Rotación) para generar la grilla por vehículo/servicio.'}
              </p>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800/80 sticky top-0">
                  <tr>
                    <th className="p-2 text-slate-400 font-medium w-32">Fecha / Recurso</th>
                    {daysInMonth.slice(0, 14).map((d) => (
                      <th key={d} className="p-1 text-slate-500 text-[10px] w-12">
                        {new Date(d + 'T12:00:00').getDate()}
                      </th>
                    ))}
                    {daysInMonth.length > 14 && <th className="p-1 text-slate-500">…</th>}
                  </tr>
                </thead>
                <tbody>
                  {asignaciones.length === 0 && (
                    <tr>
                      <td colSpan={20} className="p-6 text-center text-slate-500">
                        Sin asignaciones. Añada reglas, personal con coche fijo y un template de
                        servicios (R-xxx.xls).
                      </td>
                    </tr>
                  )}
                  {Array.from(new Set(asignaciones.map((a) => a.vehicleInternalNumber)))
                    .slice(0, 20)
                    .map((veh) => (
                      <tr key={veh} className="border-t border-slate-700/50">
                        <td className="p-2 font-medium text-slate-300">Coche {veh}</td>
                        {daysInMonth.slice(0, 14).map((dateStr) => {
                          const cell = asignaciones.find(
                            (a) => a.vehicleInternalNumber === veh && a.date === dateStr,
                          );
                          if (!cell)
                            return (
                              <td key={dateStr} className="p-1 w-12">
                                —
                              </td>
                            );
                          if (cell.diaLibre)
                            return (
                              <td
                                key={dateStr}
                                className="p-1 w-12 bg-amber-900/20 text-amber-400"
                                title="Descanso"
                              >
                                D
                              </td>
                            );
                          if (cell.esLista && !cell.driverId)
                            return (
                              <td
                                key={dateStr}
                                className="p-1 w-12 bg-slate-700/50 text-slate-500"
                                title="Lista"
                              >
                                L
                              </td>
                            );
                          return (
                            <td
                              key={dateStr}
                              className="p-1 w-12 text-emerald-400"
                              title={cell.fullName ?? ''}
                            >
                              T{cell.turno}
                            </td>
                          );
                        })}
                        {daysInMonth.length > 14 && <td className="p-1 text-slate-500">…</td>}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
