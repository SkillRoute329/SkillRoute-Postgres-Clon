import { useState, useEffect } from "react";
import {
    Clock,
    Bus,
    Filter,
    Users,
    MapPin
} from "lucide-react";
import clsx from "clsx";
import { CartonService } from "../../services/api";

interface ServiceItem {
    id: number;
    tenantId: number;
    seasonId: number;
    serviceCode: string;
    serviceNumber: string;
    line: string;
    variant: string | null;
    dayType: string;
    vehicleType: string;
    startTime: string;
    endTime: string;
    totalHours: string | null;
    liquidHours: string | null;
    kilometers: string | null;
    routeData: string;
}

const RotationMatrix = () => {
    const [services, setServices] = useState<ServiceItem[]>([]);
    const [loading, setLoading] = useState(false);

    // Filters
    const [filterSeason, setFilterSeason] = useState(2); // ID 2: VERANO 2026
    const [filterDayType, setFilterDayType] = useState('HABIL');

    useEffect(() => {
        loadData();
    }, [filterSeason, filterDayType]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Using ID 2 for demo purposes, this should be dynamic
            const data = await CartonService.getAll(filterSeason, filterDayType as any);
            setServices(data || []);
        } catch (error) {
            console.error("Failed to load services", error);
        } finally {
            setLoading(false);
        }
    };

    // Grouping Logic
    const groupedServices = services.reduce((acc, curr) => {
        const type = curr.vehicleType || 'MECANICOS';
        if (!acc[type]) acc[type] = [];
        acc[type].push(curr);
        return acc;
    }, {} as Record<string, ServiceItem[]>);

    return (
        <div className="space-y-6 animate-fade-in-up pb-24">

            {/* --- HEADER --- */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                        Matriz de Rotación
                    </h1>
                    <p className="text-slate-400 mt-1">
                        Visualización operativa de servicios por tipo de flota
                    </p>
                </div>

                <div className="flex gap-2">
                    <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 transition-colors">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-medium">Filtros</span>
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-xl hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-900/20">
                        <Users className="w-4 h-4 text-white" />
                        <span className="text-sm font-bold text-white">Auto-Asignar</span>
                    </button>
                </div>
            </div>

            {/* --- CONTROLS BAR --- */}
            <div className="p-4 bg-slate-800/50 border border-slate-700/50 rounded-2xl flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-3 bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-700">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-mono text-slate-300">Temporada:</span>
                    <select
                        className="bg-transparent text-sm font-bold text-white focus:outline-none"
                        value={filterSeason}
                        onChange={(e) => setFilterSeason(Number(e.target.value))}
                    >
                        <option value={2}>VERANO 2026</option>
                        <option value={1}>INVIERNO 2025</option>
                    </select>
                </div>

                <div className="flex items-center gap-3 bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-700">
                    <Bus className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-mono text-slate-300">Tipo Día:</span>
                    <select
                        className="bg-transparent text-sm font-bold text-white focus:outline-none"
                        value={filterDayType}
                        onChange={(e) => setFilterDayType(e.target.value)}
                    >
                        <option value="HABIL">DÍA HÁBIL</option>
                        <option value="SABADO">SÁBADO</option>
                        <option value="DOMINGO">DOMINGO</option>
                    </select>
                </div>
            </div>

            {/* --- CONTENT GRID --- */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
                </div>
            ) : Object.keys(groupedServices).length === 0 ? (
                <div className="text-center py-20 text-slate-500 bg-slate-900/30 rounded-3xl border border-slate-800 border-dashed">
                    <Bus className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">No hay servicios cargados para esta selección.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-8">
                    {Object.entries(groupedServices).map(([type, items]) => (
                        <div key={type} className="space-y-4">
                            {/* Group Header */}
                            <div className="flex items-center gap-3 pb-2 border-b border-slate-700">
                                <div className="p-2 bg-indigo-500/10 rounded-lg">
                                    <Bus className="w-6 h-6 text-indigo-400" />
                                </div>
                                <h2 className="text-xl font-bold text-white uppercase tracking-wider">
                                    FLOTA {type}
                                    <span className="ml-3 text-sm font-normal text-slate-400 bg-slate-800 px-2 py-1 rounded-full">{items.length} Coches</span>
                                </h2>
                            </div>

                            {/* Service Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {items.map((srv) => (
                                    <div key={srv.id} className="relative group bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-indigo-500/50 transition-all hover:shadow-xl hover:shadow-indigo-900/10">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <span className="text-2xl font-black text-white">{srv.serviceCode}</span>
                                                <div className="flex items-center gap-1 text-xs text-slate-400 uppercase font-bold mt-1">
                                                    <span className={clsx(
                                                        "px-1.5 py-0.5 rounded",
                                                        srv.line === '300' ? 'bg-red-500/20 text-red-300' : 'bg-blue-500/20 text-blue-300'
                                                    )}>LÍNEA {srv.line}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-lg font-mono font-bold text-emerald-400 flex items-center justify-end gap-1">
                                                    {srv.startTime}
                                                    <span className="text-slate-600 text-xs">Inicio</span>
                                                </div>
                                                <div className="text-sm font-mono text-slate-500 flex items-center justify-end gap-1">
                                                    {srv.endTime}
                                                    <span className="text-xs">Fin</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Assignment Slot */}
                                        <div className="mt-4 pt-3 border-t border-slate-700/50">
                                            <button className="w-full py-2 px-3 rounded-lg border border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-indigo-500 hover:bg-slate-700/50 transition-all flex items-center justify-center gap-2 text-sm font-medium group-hover:bg-slate-700">
                                                <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-[10px] font-bold">?</div>
                                                Asignar Conductor
                                            </button>
                                        </div>

                                        {/* Route Variant Badge */}
                                        {srv.variant && (
                                            <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                                                <MapPin className="w-3 h-3" />
                                                <span className="truncate max-w-full">{srv.variant}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default RotationMatrix;
