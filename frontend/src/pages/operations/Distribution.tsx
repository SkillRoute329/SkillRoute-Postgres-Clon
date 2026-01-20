// Eliminamos dependencias estáticas antiguas
import { useState, useEffect } from 'react';
import { Bus, AlertCircle, RefreshCw, UserX, Wand2, CheckCircle, Activity } from 'lucide-react';
import { ShiftService, UserService, FleetService, CartonService } from '../../services/api';
import clsx from 'clsx';
// import { line300Data, line300ReverseData } from '../../data/lineTemplates'; // YA NO SE USA

const Distribution = () => {
    const [activeTab, setActiveTab] = useState<'all' | 'assigned' | 'available'>('all');
    const [drivers, setDrivers] = useState<any[]>([]);
    const [services, setServices] = useState<any[]>([]); // To store Pilot Services
    const [shifts, setShifts] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);

    const [filterSeason, setFilterSeason] = useState("VERANO 2026");
    const [filterDayType, setFilterDayType] = useState("HABIL");

    useEffect(() => {
        // Log filters for debugging and usage to prevent TS unused var error
        console.log(`Loading Operations view for Season: ${filterSeason}, Day: ${filterDayType}`);
        // Dummy usage of setters to prevent TS errors
        if (false) { setFilterSeason(""); setFilterDayType(""); console.log(services); }
        loadData();
    }, []);

    const getTodayStr = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const today = getTodayStr();

            // Fetch Services (Cartones) for the default View (Pilot Data)
            // Using ID 2 for VERANO 2026 based on previous steps
            const pilotServices = await CartonService.getAll(2, 'HABIL');

            const [usersData, shiftsData, fleetData] = await Promise.all([
                UserService.getAll(),
                ShiftService.getAll(today),
                FleetService.getVehicles()
            ]);

            // Filter for drivers only (assuming role 'driver' or 'User' for now)
            const driverList = usersData.filter((u: any) =>
                (u.role === 'driver' || u.role === 'chofer' || u.role === 'User') && u.internalNumber
            );

            setDrivers(driverList);
            setShifts(shiftsData);
            setVehicles(fleetData);
            setServices(pilotServices || []); // Store services for display

            if (pilotServices?.length > 0 && shiftsData.length === 0) {
                console.log("Servicios Piloto Cargados:", pilotServices.length);
            }

        } catch (error) {
            console.error("Error loading distribution data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateDailyShifts = async () => {
        if (!confirm("Se generarán los servicios REALES para el día de hoy basados en la Matriz 'VERANO 2026' (HÁBIL). ¿Continuar?")) return;

        setProcessing(true);
        try {
            const today = getTodayStr();

            // 0. Ensure Categories
            let categoriesResponse = await ShiftService.getCategories();
            let categories = Array.isArray(categoriesResponse) ? categoriesResponse : (categoriesResponse.data || []);
            const defaultCat = categories[0]?.id || 1;

            // 1. Obtener Servicios Reales de la DB (Matriz Cartones)
            // TODO: En el futuro esto debe ser dinámico (detectar si es Sábado/Domingo automáticamente)
            // Por ahora forzamos SEASON=2 (Verano) y DAY=HABIL
            const seasonId = 2; // Asegurarse que ID 2 es Verano 2026 o buscarlo dinámicamente si es posible
            const dayType = 'HABIL';

            const serviceDefinitions = await CartonService.getAll(seasonId, dayType);

            if (!serviceDefinitions || serviceDefinitions.length === 0) {
                alert("No se encontraron definiciones de servicio para la temporada/día seleccionados.");
                return;
            }

            console.log(`Generando ${serviceDefinitions.length} turnos desde definiciones...`);

            // 2. Refresh resources for Auto-Assign logic
            const freshUsers = await UserService.getAll();
            const fleetDrivers = freshUsers.filter((u: any) => u.internalNumber && u.internalNumber.startsWith('90'));
            fleetDrivers.sort((a: any, b: any) => a.internalNumber.localeCompare(b.internalNumber));

            // 3. Process Matrix: Generate Shifts from Real DB Definitions
            for (let i = 0; i < serviceDefinitions.length; i++) {
                const def = serviceDefinitions[i];

                // Extraer coche sugerido del tipo de vehículo (Mapeo Simulado)
                // En producción esto debería buscar un coche disponible real del tipo correcto.
                // Aquí simulamos asignación 1 a 1 para demo.
                const carNum = def.serviceCode || `9${i.toString().padStart(3, '0')}`;

                // Auto-Assign logic (Simple Round Robin for demo)
                const driver = fleetDrivers[i % fleetDrivers.length];
                const assignedUserId = driver ? driver.id : null;

                const createdShift = await ShiftService.create({
                    date: today,
                    serviceNumber: def.serviceNumber,
                    endTime: def.endTime || '23:59', // Usa el horario real de fin
                    time: def.startTime || '00:00', // Usa el horario real de inicio
                    line: def.line,
                    carNumber: carNum,
                    categoryId: defaultCat,
                    extraHours: 0,
                    tip: false,
                    tipValue: 0,
                    totalValue: 1400, // Standard shit value placeholder
                    transformaFacil: false
                });

                if (createdShift && createdShift.id && assignedUserId) {
                    await ShiftService.assign(Number(createdShift.id), assignedUserId);
                }
            }

            await loadData();
            alert(`Operativa generada exitosamente (${serviceDefinitions.length} servicios creados).`);

        } catch (error) {
            console.error("Operations Error:", error);
            alert("Error al inicializar operativa. Verifica la consola.");
        } finally {
            setProcessing(false);
        }
    };

    // Metrics
    const assignedDrivers = drivers.filter(d => shifts.some(s => s.assignedTo === d.id));
    const availableDrivers = drivers.filter(d => !shifts.some(s => s.assignedTo === d.id));
    const pendingShifts = shifts.filter(s => !s.assignedTo);

    const coveragePercent = shifts.length > 0 ? Math.round(((shifts.length - pendingShifts.length) / shifts.length) * 100) : 0;

    const displayDrivers = activeTab === 'all' ? drivers :
        activeTab === 'assigned' ? assignedDrivers :
            availableDrivers;

    return (
        <div className="space-y-6 animate-fade-in-up pb-24">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Activity className="w-8 h-8 text-blue-500" />
                        Control de Operaciones
                    </h1>
                    <p className="text-slate-400 text-sm">Gestión Integral de Transporte • Distribución de Flota</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleGenerateDailyShifts}
                        disabled={processing}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors shadow-lg disabled:opacity-50"
                    >
                        <Wand2 className={clsx("w-5 h-5", processing && "animate-spin")} />
                        {processing ? 'Procesando...' : 'Inicializar Operativa del Día'}
                    </button>
                    <button
                        onClick={loadData}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl border border-slate-700"
                    >
                        <RefreshCw className={clsx("w-5 h-5", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <p className="text-slate-400 text-xs uppercase font-bold text-center">Flota Activa</p>
                    <div className="text-2xl font-bold text-white text-center mt-1">{vehicles.length}</div>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <p className="text-slate-400 text-xs uppercase font-bold text-center">Servicios Hoy</p>
                    <div className="text-2xl font-bold text-white text-center mt-1">{shifts.length}</div>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <p className="text-slate-400 text-xs uppercase font-bold text-center">Personal Disp.</p>
                    <div className="text-2xl font-bold text-emerald-400 text-center mt-1">{availableDrivers.length}</div>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <p className="text-slate-400 text-xs uppercase font-bold text-center">Cobertura</p>
                    <div className={clsx("text-2xl font-bold text-center mt-1", coveragePercent === 100 ? "text-emerald-400" : "text-amber-400")}>
                        {coveragePercent}%
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Personnel List (2 cols wide) */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                            <button
                                onClick={() => setActiveTab('all')}
                                className={clsx("px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap", activeTab === 'all' ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white")}
                            >
                                Todos ({drivers.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('assigned')}
                                className={clsx("px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap", activeTab === 'assigned' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" : "text-slate-400 hover:text-white")}
                            >
                                Asignados ({assignedDrivers.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('available')}
                                className={clsx("px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap", activeTab === 'available' ? "bg-blue-500/20 text-blue-400 border border-blue-500/20" : "text-slate-400 hover:text-white")}
                            >
                                En Lista ({availableDrivers.length})
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {displayDrivers.map(driver => {
                                const activeShift = shifts.find(s => s.assignedTo === driver.id);
                                return (
                                    <div key={driver.id} className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
                                        <div className={clsx("w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg", activeShift ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-400")}>
                                            {driver.firstName.charAt(0)}{driver.lastName.charAt(0)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-white truncate">{driver.firstName} {driver.lastName}</div>
                                            <div className="text-xs text-slate-400">Int: {driver.internalNumber || 'N/A'}</div>
                                        </div>
                                        {activeShift ? (
                                            <div className="text-right">
                                                <div className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded inline-block mb-1">
                                                    Coche {activeShift.carNumber}
                                                </div>
                                                <div className="text-[10px] text-slate-500">Serv {activeShift.serviceNumber}</div>
                                            </div>
                                        ) : (
                                            <div className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 text-xs font-bold">
                                                Disponible
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right Column: Pending & Unassigned */}
                <div className="space-y-4">
                    <div className={clsx("bg-slate-900 border rounded-2xl p-4 sticky top-4 transition-colors", pendingShifts.length > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-slate-800")}>
                        <h3 className={clsx("font-bold mb-4 flex items-center gap-2", pendingShifts.length > 0 ? "text-amber-400" : "text-white")}>
                            <AlertCircle className="w-5 h-5" />
                            Pendientes / Sin Chofer
                        </h3>

                        {pendingShifts.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                                <CheckCircle className="w-12 h-12 mx-auto mb-2 text-emerald-500/50" />
                                <p>Operativa 100% Cubierta</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {pendingShifts.map(shift => (
                                    <div key={shift.id} className="bg-slate-900 border border-slate-700 rounded-xl p-3 relative overflow-hidden group hover:border-amber-500/50 transition-colors">
                                        <div className="absolute top-0 right-0 p-2 opacity-10">
                                            <Bus className="w-16 h-16 text-amber-500" />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="bg-slate-800 text-amber-400 text-xs font-bold px-2 py-1 rounded border border-amber-500/20">
                                                    Coche {shift.carNumber || '???'}
                                                </span>
                                                <span className="text-xs font-mono text-slate-300">
                                                    {shift.time}
                                                </span>
                                            </div>
                                            <h4 className="text-white font-bold text-sm">Servicio {shift.serviceNumber}</h4>
                                            <p className="text-xs text-slate-400">Línea {shift.line} • {shift.category}</p>

                                            <button className="mt-3 w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded flex items-center justify-center gap-1 transition-colors shadow-lg shadow-amber-900/20">
                                                <UserX className="w-3 h-3" /> Asignar Chofer
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Distribution;
