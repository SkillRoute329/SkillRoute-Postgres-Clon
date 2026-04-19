import { useState, useEffect, type DragEvent } from 'react';
import { Users, Bus, AlertTriangle, CheckCircle, Search, ShieldAlert } from 'lucide-react';
import { UserService, ProgramacionDiariaService, FleetService } from '../../services/firestore';
import type { User, Vehicle } from '../../services/firestore/types';
import type { ProgramacionDiariaRecord } from '../../services/firestore/programacionDiaria';
import { validateAssignment } from '../../utils/syndicateRules';
import clsx from 'clsx';
import toast from 'react-hot-toast';

export default function ListeroModule() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [programacion, setProgramacion] = useState<ProgramacionDiariaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Drag state
  const [draggedDriver, setDraggedDriver] = useState<User | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [usersData, vehiclesData, progData] = await Promise.all([
          UserService.getAll(),
          FleetService.getVehicles(),
          ProgramacionDiariaService.getByDate(selectedDate),
        ]);

        // Filter only drivers
        setDrivers(
          usersData.filter((u: User) => /conductor|driver|chofer/i.test(u.role || u.rol || '')),
        );
        setVehicles(vehiclesData);
        setProgramacion(progData);
      } catch {
        toast.error('Error cargando datos del Listero.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedDate]);

  // Derived data
  const assignedDriverIds = new Set(programacion.map((p) => p.conductor).filter(Boolean));

  const availableDrivers = drivers.filter(
    (d) =>
      !assignedDriverIds.has(String(d.id || d.uid)) &&
      (d.fullName || d.email || '').toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Group programacion by vehicle if no vehicle assigned put in "Sin Coche"
  const slots = programacion.reduce(
    (acc, current) => {
      const vId = current.vehiculo || 'sin_coche';
      if (!acc[vId]) acc[vId] = [];
      acc[vId].push(current);
      return acc;
    },
    {} as Record<string, ProgramacionDiariaRecord[]>,
  );

  // Unassigned vehicles that might need service (Mocking some if empty)
  const unassignedVehicles = vehicles
    .filter((v) => !slots[String(v.id)] && v.status === 'ACTIVE')
    .slice(0, 10);

  // Handlers for Drag and Drop
  const handleDragStart = (e: DragEvent<HTMLDivElement>, driver: User) => {
    setDraggedDriver(driver);
    e.dataTransfer.setData('text/plain', String(driver.id || driver.uid));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = async (
    e: DragEvent<HTMLDivElement>,
    slot: ProgramacionDiariaRecord | Vehicle,
    type: 'programacion' | 'vehicle',
  ) => {
    e.preventDefault();
    if (!draggedDriver) return;

    const driverId = String(draggedDriver.id || draggedDriver.uid);
    const driverName = draggedDriver.fullName || draggedDriver.email || 'Conductor';

    // OIT/MTOP Real Validation: Check if driver rested >= 9 hours.
    // Fetch actual previous shift
    const prevShift = await ProgramacionDiariaService.getLastShiftByDriver(driverId);
    const result = { valid: true, error: '' };
    const currStartTime =
      type === 'programacion'
        ? (slot as ProgramacionDiariaRecord).horaInicio || '00:00'
        : new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });

    if (prevShift && prevShift.horaInicio) {
      // Assuming 8h average shift for end time bounds.
      const [h, m] = prevShift.horaInicio.split(':').map(Number);
      const endH = String((h + 8) % 24).padStart(2, '0');
      const prevEnd = `${endH}:${String(m).padStart(2, '0')}`;
      const vResult = validateAssignment(driverId, currStartTime, prevEnd);
      result.valid = vResult.valid;
      result.error = vResult.error || '';
    }

    if (!result.valid) {
      if (
        !confirm(
          `⚠️ ALERTA OIT/MTOP (Fatiga):\n${driverName} incumple el descanso mínimo. Detalle: ${result.error}\n¿Desea forzar la adjudicación documentada bajo excepción táctica?`,
        )
      ) {
        setDraggedDriver(null);
        return;
      }
      toast('Asignación forzada (Excepción registrada)', { icon: '⚠️' });
    }

    try {
      if (type === 'programacion') {
        const prog = slot as ProgramacionDiariaRecord;
        if (prog.id) {
          // Updating existing
          await ProgramacionDiariaService.update(prog.id, { conductor: driverId });
          setProgramacion((prev) =>
            prev.map((p) => (p.id === prog.id ? { ...p, conductor: driverId } : p)),
          );
        }
      } else {
        const v = slot as Vehicle;
        // Creating new
        const newRecord: Parameters<typeof ProgramacionDiariaService.add>[0] & { id?: string } = {
          date: selectedDate,
          linea: 'VAB', // Vacio a Base
          servicio: 'EXTRA',
          vehiculo: String(v.id),
          conductor: driverId,
          horaInicio: new Date().toLocaleTimeString('es-UY', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        };
        const savedRef = await ProgramacionDiariaService.add(newRecord);
        newRecord.id = savedRef.id;
        setProgramacion((prev) => [...prev, newRecord as ProgramacionDiariaRecord]);
      }
      toast.success(`${driverName} asignado correctamente.`);
    } catch {
      toast.error('Error guardando la asignación.');
    }

    setDraggedDriver(null);
  };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto animate-fade-in-up pb-24 h-[calc(100vh-80px)] flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1 flex items-center gap-2">
            <Users className="w-8 h-8 text-primary-500" />
            Terminal de Listero (Drag & Drop)
          </h1>
          <p className="text-slate-400 text-sm">
            Asignación táctica de personal. Arrastre choferes desde el retén hacia los coches.
            Control de OIT/Franco activo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            aria-label="Seleccionar fecha de operación"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          {/* DRIVERS COLUMN */}
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-800/80 border-b border-slate-700 shrink-0">
              <h2 className="font-bold text-white flex items-center gap-2 mb-3">
                <Users className="w-5 h-5 text-blue-400" />
                Retén y Disponibles
                <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full ml-auto">
                  {availableDrivers.length} libres
                </span>
              </h2>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar chofer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-primary-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 relative">
              {availableDrivers.map((d) => (
                <div
                  key={d.id || d.uid}
                  draggable
                  onDragStart={(e) => handleDragStart(e, d)}
                  className="bg-slate-800 border border-slate-700 p-3 rounded-lg cursor-grab active:cursor-grabbing hover:border-primary-400 transition-colors shadow-sm flex flex-col relative overflow-hidden group"
                >
                  {/* Decorator line */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 group-hover:bg-primary-500 transition-colors" />

                  <div className="font-medium text-white ml-2 flex justify-between items-center">
                    <span>{d.fullName || d.email}</span>
                    <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                      ID: {((d.id || d.uid) as string).slice(-4).toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 ml-2 mt-1">
                    Rol: {d.role || d.rol || 'Conductor'}
                  </div>
                </div>
              ))}
              {availableDrivers.length === 0 && (
                <div className="text-center text-slate-500 mt-10">
                  No hay conductores disponibles para asignar
                </div>
              )}
            </div>
          </div>

          {/* VEHICLES / SERVICES COLUMN */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden relative">
            <div className="p-4 bg-slate-800/80 border-b border-slate-700 shrink-0">
              <h2 className="font-bold text-white flex items-center gap-2">
                <Bus className="w-5 h-5 text-emerald-400" />
                Grilla Operativa ({selectedDate})
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Render Programacion Existente */}
              {programacion.map((prog) => (
                <div
                  key={prog.id || Math.random().toString()}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDrop={(e) => handleDrop(e, prog, 'programacion')}
                  className={clsx(
                    'border-2 border-dashed p-4 rounded-xl transition-all shadow-sm flex flex-col',
                    prog.conductor
                      ? 'border-emerald-500/30 bg-emerald-950/20'
                      : 'border-amber-500/50 bg-amber-950/30 hover:bg-amber-900/40',
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <Bus
                        className={clsx(
                          'w-5 h-5',
                          prog.conductor ? 'text-emerald-400' : 'text-amber-400',
                        )}
                      />
                      <span className="font-bold text-white">Coche {prog.vehiculo || '?'}</span>
                    </div>
                    <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">
                      Servicio {prog.servicio} L{prog.linea}
                    </span>
                  </div>

                  {prog.conductor ? (
                    <div className="mt-2 p-2 bg-slate-800 rounded flex items-center justify-between border border-slate-700">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                          <span className="text-sm font-medium text-slate-200">
                            Chofer ID: {prog.conductor.slice(-4).toUpperCase()}
                          </span>
                        </div>
                        {prog.firmaConductor ? (
                          <span className="text-[10px] text-emerald-400 font-bold ml-6 bg-emerald-900/30 px-1.5 py-0.5 rounded-sm w-fit">
                            FIRMADO
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-500 font-bold ml-6 bg-amber-900/30 px-1.5 py-0.5 rounded-sm w-fit">
                            PENDIENTE FIRMA
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">{prog.horaInicio}</span>
                    </div>
                  ) : (
                    <div className="mt-2 p-3 bg-slate-900/50 rounded flex items-center justify-center border border-slate-800 min-h-[50px]">
                      <span className="text-sm text-slate-400 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        Arrastre un chofer aquí
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {/* Render Unassigned Vehicles as extra dropslots */}
              {unassignedVehicles.map((v) => (
                <div
                  key={v.id}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDrop={(e) => handleDrop(e, v, 'vehicle')}
                  className="border-2 border-dashed border-slate-700 bg-slate-800/20 hover:bg-slate-800/50 p-4 rounded-xl transition-all shadow-sm flex flex-col"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <Bus className="w-5 h-5 text-slate-400" />
                      <span className="font-bold text-slate-300">
                        Coche {v.internalNumber || v.id}
                      </span>
                    </div>
                    <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded">
                      Libre
                    </span>
                  </div>
                  <div className="mt-2 p-3 bg-slate-900/50 rounded flex items-center justify-center border border-slate-800 min-h-[50px]">
                    <span className="text-sm text-slate-400">Soltar chofer para crear Extra</span>
                  </div>
                </div>
              ))}

              {programacion.length === 0 && unassignedVehicles.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center p-12 text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  <ShieldAlert className="w-12 h-12 mb-3 text-slate-700" />
                  <p>No hay coches ni programación disponible para el día.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
