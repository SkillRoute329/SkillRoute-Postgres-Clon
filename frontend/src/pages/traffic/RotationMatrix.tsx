import { useState, useEffect } from "react";
import {
    Clock,
    Bus,
    ChevronDown,
    ChevronRight,
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

    // Accordion State: keys are group names
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    // Filters
    const [filterSeason, setFilterSeason] = useState(2); // ID 2: VERANO 2026
    const [filterDayType, setFilterDayType] = useState('HABIL');

    useEffect(() => {
        loadData();
    }, [filterSeason, filterDayType]);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await CartonService.getAll(filterSeason, filterDayType as any);
            // Sort by serviceCode numeric
            const sorted = (data || []).sort((a: ServiceItem, b: ServiceItem) =>
                Number(a.serviceCode) - Number(b.serviceCode)
            );
            setServices(sorted);

            // Auto expand groups if few services
            if (sorted.length < 20) {
                // Expand all logic if needed, currently default closed per spec "cerrados por defecto"
                // But actually user said "cerrados por defecto", so I will strictly follow.
            }
        } catch (error) {
            console.error("Failed to load services", error);
        } finally {
            setLoading(false);
        }
    };

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [group]: !prev[group]
        }));
    };

    // Grouping Logic - Custom Order
    const vehicleTypeOrder = ['Hibrido', 'Convencional', 'Piso Bajo', 'MT15', 'Electrico', 'Micro'];

    const normalizeType = (t: string) => {
        // Normalization helper to match seed types to UI groups
        if (t.includes('Híbrido') || t.includes('Hibrido')) return 'Hibrido';
        if (t.includes('Eléctrico') || t.includes('Electrico')) return 'Electrico';
        return t;
    };

    const groupedServices = services.reduce((acc, curr) => {
        const type = normalizeType(curr.vehicleType || 'OTROS');
        if (!acc[type]) acc[type] = [];
        acc[type].push(curr);
        return acc;
    }, {} as Record<string, ServiceItem[]>);

    // Get ordered keys present in data
    const orderedGroups = Object.keys(groupedServices).sort((a, b) => {
        const idxA = vehicleTypeOrder.indexOf(a);
        const idxB = vehicleTypeOrder.indexOf(b);
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });

    const parseTurns = (dataStr: string) => {
        try {
            const data = JSON.parse(dataStr);
            // Expected seed format: { t1: "...", t2: "...", note: "..." }
            return data;
        } catch (e) {
            return {};
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up pb-24">

            {/* --- HEADER --- */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                        Matriz de Rotación
                    </h1>
                    <p className="text-slate-400 mt-1">
                        Sábana de Servicios - Verano 2026
                    </p>
                </div>

                <div className="flex gap-2">
                    {/* Controls */}
                    <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700">
                        <Clock className="w-4 h-4 text-emerald-400" />
                        <select
                            className="bg-transparent text-sm font-bold text-white focus:outline-none"
                            value={filterSeason}
                            onChange={(e) => setFilterSeason(Number(e.target.value))}
                        >
                            <option value={2}>VERANO 2026</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700">
                        <Bus className="w-4 h-4 text-blue-400" />
                        <select
                            className="bg-transparent text-sm font-bold text-white focus:outline-none"
                            value={filterDayType}
                            onChange={(e) => setFilterDayType(e.target.value)}
                        >
                            <option value="HABIL">HÁBIL</option>
                            <option value="SABADO">SÁBADO</option>
                            <option value="DOMINGO">DOMINGO</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* --- ACCORDION LIST --- */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
                </div>
            ) : Object.keys(groupedServices).length === 0 ? (
                <div className="text-center py-20 text-slate-500 bg-slate-900/30 rounded-3xl border border-slate-800 border-dashed">
                    <Bus className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">No hay datos de servicios disponibles.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {orderedGroups.map((type) => {
                        const items = groupedServices[type];
                        const isExpanded = expandedGroups[type];
                        const count = items.length;
                        // Mock assignment status for UI demo
                        const assignedPercentage = Math.floor(Math.random() * 30) + 70;

                        return (
                            <div key={type} className="bg-slate-800/40 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
                                {/* Accordion Header */}
                                <button
                                    onClick={() => toggleGroup(type)}
                                    className={clsx(
                                        "w-full flex items-center justify-between p-4 transition-colors hover:bg-slate-700/50",
                                        isExpanded ? "bg-slate-700/30" : ""
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        {isExpanded ? <ChevronDown className="w-5 h-5 text-indigo-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                                        <div className="flex flex-col items-start">
                                            <span className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                                FLOTA {type.toUpperCase()}
                                                <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full text-slate-300 font-normal border border-slate-600">
                                                    {items[0].serviceCode} - {items[items.length - 1].serviceCode}
                                                </span>
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="hidden md:flex flex-col items-end">
                                            <div className="w-32 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500" style={{ width: `${assignedPercentage}%` }}></div>
                                            </div>
                                            <span className="text-xs text-emerald-400 font-medium mt-1">{assignedPercentage}% Asignado</span>
                                        </div>
                                        <div className="bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-lg font-bold text-sm min-w-[3rem]">
                                            {count}
                                        </div>
                                    </div>
                                </button>

                                {/* Accordion Body (Table) */}
                                {isExpanded && (
                                    <div className="border-t border-slate-700/50 overflow-x-auto">
                                        <table className="w-full text-left text-sm md:text-base">
                                            <thead className="bg-slate-900/50 text-slate-400 font-mono text-xs uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-4 py-3 min-w-[80px]">Servicio</th>
                                                    <th className="px-4 py-3 min-w-[80px]">Línea</th>
                                                    <th className="px-4 py-3 min-w-[150px]">Turno 1 / Matutino</th>
                                                    <th className="px-4 py-3 min-w-[150px]">Turno 2 / Vespertino</th>
                                                    <th className="px-4 py-3 min-w-[150px]">Turno 3 / Nocturno</th>
                                                    <th className="px-4 py-3 min-w-[120px]">Estado</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/50">
                                                {items.map((srv) => {
                                                    const details = parseTurns(srv.routeData);
                                                    const isBlank = srv.line === "EN BLANCO" || srv.line === "PARALIZA";

                                                    return (
                                                        <tr key={srv.id} className={clsx("hover:bg-indigo-500/5 transition-colors", isBlank && "opacity-50 bg-slate-900/30")}>
                                                            <td className="px-4 py-3 font-bold text-white font-mono">{srv.serviceCode}</td>
                                                            <td className="px-4 py-3">
                                                                <span className={clsx(
                                                                    "px-2 py-0.5 rounded text-xs font-bold",
                                                                    srv.line === '300' ? "bg-red-500/20 text-red-300" :
                                                                        isBlank ? "bg-slate-700 text-slate-400" :
                                                                            "bg-blue-500/20 text-blue-300"
                                                                )}>
                                                                    {srv.line}
                                                                </span>
                                                            </td>
                                                            {/* Render dynamic turn columns or fallbacks */}
                                                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                                                                {details.t1 || srv.startTime + ' - ' + (srv.endTime || '?')}
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                                                                {details.t2 || '-'}
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                                                                {details.t3 || (details.note ? <span className="text-yellow-500/80 italic">{details.note}</span> : '-')}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                {isBlank ? (
                                                                    <span className="text-slate-500 text-xs uppercase font-bold">Inactivo</span>
                                                                ) : (
                                                                    <button className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded transition-colors shadow-lg shadow-indigo-900/20">
                                                                        Asignar
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default RotationMatrix;
