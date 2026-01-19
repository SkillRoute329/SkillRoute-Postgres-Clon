import { useState, useEffect } from 'react';
import { MapPin, Clock, Users, CheckCircle, AlertTriangle, ClipboardList, Download, RefreshCw, Save } from 'lucide-react';
import { CartonService, ShiftService, BulletinService } from '../../services/api';
import clsx from 'clsx';
import { line300Data, line300ReverseData } from '../../data/lineTemplates';

// Types tailored for the Bulletin view
interface BulletinRow {
    serviceId: string;
    serviceNumber: string;
    busNumber: string; // New: Bus Number
    scheduledTime: string; // HH:mm
    actualTime: string; // HH:mm
    delay: number; // minutes
    occupancy: 'Low' | 'Medium' | 'High' | 'Full';
    occupancyCount: string; // New: Real ticket count
    status: 'Pending' | 'OnTime' | 'Late' | 'Early';
}

const OCCUPANCY_OPTIONS = [
    { value: 'Low', label: 'Baja', color: 'bg-green-500/20 text-green-400' },
    { value: 'Medium', label: 'Media', color: 'bg-yellow-500/20 text-yellow-400' },
    { value: 'High', label: 'Alta', color: 'bg-orange-500/20 text-orange-400' },
    { value: 'Full', label: 'Lleno', color: 'bg-red-500/20 text-red-400' }
];

const AdminBoletines = () => {
    const [lines, setLines] = useState<string[]>([]);
    const [selectedLine, setSelectedLine] = useState<string>('');

    // New: Destinations (Directions)
    const [destinations, setDestinations] = useState<string[]>([]);
    const [selectedDestination, setSelectedDestination] = useState<string>('');

    const [stops, setStops] = useState<string[]>([]);
    const [selectedStop, setSelectedStop] = useState<string>('');

    // Raw data
    const [allCartons, setAllCartons] = useState<any[]>([]);
    const [dailyShifts, setDailyShifts] = useState<any[]>([]); // New: Store today's shifts
    const [bulletinRows, setBulletinRows] = useState<BulletinRow[]>([]);

    const [loading, setLoading] = useState(false);
    const [showImportMenu, setShowImportMenu] = useState(false);

    useEffect(() => {
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

            // Fetch Cartons (Structure) and Shifts (Assignments) in parallel
            const [cartonsData, shiftsData] = await Promise.all([
                CartonService.getAll(1),
                ShiftService.getAll(today)
            ]);

            setAllCartons(cartonsData);
            setDailyShifts(shiftsData); // Store shifts

            // Extract unique lines from cartons
            const uniqueLines = Array.from(new Set(cartonsData.map((c: any) => c.line))).sort();
            setLines(uniqueLines as string[]);
        } catch (error) {
            console.error("Error loading data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleImportTemplate = async (templateData: any) => {
        try {
            setLoading(true);

            // Transform UI data to Backend DTO
            const payload = {
                seasonId: 1, // Fixed for demo/phase 1
                serviceNumber: templateData.serviceNumber,
                line: templateData.line,
                variant: templateData.title,
                startTime: templateData.startTime,
                endTime: templateData.endTime,
                totalHours: templateData.totalHours,
                liquidHours: templateData.liquidHours,
                kilometers: templateData.kilometers,
                routeData: {
                    headers: templateData.headers,
                    rows: templateData.rows,
                    startLocationDescription: templateData.startLocationDescription
                }
            };

            await CartonService.save(payload);
            await loadData(); // Reload to pick up new carton
            setShowImportMenu(false);
            alert("Matriz importada correctamente. Ahora puedes seleccionarla en los filtros.");
        } catch (error) {
            console.error("Error importing template:", error);
            alert("Error al importar matriz. Verifica la consola para más detalles.");
        } finally {
            setLoading(false);
        }
    };

    // 1. When Line changes -> Find unique Destinations (Last Stop)
    useEffect(() => {
        if (!selectedLine || allCartons.length === 0) {
            setDestinations([]);
            setSelectedDestination('');
            return;
        }

        const lineCartons = allCartons.filter(c => c.line === selectedLine);

        // Extract the location of the LAST header for each carton
        const dests = new Set<string>();
        lineCartons.forEach(c => {
            if (c.routeData?.headers?.length > 0) {
                const lastHeader = c.routeData.headers[c.routeData.headers.length - 1];
                dests.add(lastHeader.location);
            }
        });

        setDestinations(Array.from(dests).sort());
        setSelectedDestination('');
    }, [selectedLine, allCartons]);

    // 2. When Destination changes -> Find available Control Points (Stops)
    useEffect(() => {
        if (!selectedDestination || !selectedLine) {
            setStops([]);
            setSelectedStop('');
            return;
        }

        // Filter cartons matching Line AND Destination (Last stop matches)
        const relevantCartons = allCartons.filter(c =>
            c.line === selectedLine &&
            c.routeData?.headers?.length > 0 &&
            c.routeData.headers[c.routeData.headers.length - 1].location === selectedDestination
        );

        // Get unique stops from these cartons
        const uniqueStops = new Set<string>();
        relevantCartons.forEach(c => {
            c.routeData.headers.forEach((h: any) => {
                uniqueStops.add(h.location);
            });
        });

        setStops(Array.from(uniqueStops));
        setSelectedStop('');
    }, [selectedDestination, selectedLine, allCartons]);

    // 3. When Stop changes -> Generate Bulletin
    useEffect(() => {
        if (!selectedLine || !selectedDestination || !selectedStop) {
            setBulletinRows([]);
            return;
        }

        generateBulletin();
    }, [selectedStop, selectedDestination, selectedLine, dailyShifts]);

    const generateBulletin = () => {
        // Filter: Line + Destination
        const relevantCartons = allCartons.filter(c =>
            c.line === selectedLine &&
            c.routeData?.headers?.length > 0 &&
            c.routeData.headers[c.routeData.headers.length - 1].location === selectedDestination
        );

        const rows: BulletinRow[] = [];

        relevantCartons.forEach(carton => {
            if (!carton.routeData || !carton.routeData.headers) return;

            const headerIndex = carton.routeData.headers.findIndex((h: any) => h.location === selectedStop);
            if (headerIndex === -1) return;

            const headerId = carton.routeData.headers[headerIndex].id;

            carton.routeData.rows.forEach((r: any, idx: number) => {
                const timeAtStop = r.times[headerId];
                if (timeAtStop) {
                    // PRELOAD LOGIC: Find shift with matching service number
                    const serviceNum = r.serviceNumber || '';
                    const matchShift = dailyShifts.find((s: any) => s.serviceNumber === serviceNum);
                    const preloadedBus = matchShift ? matchShift.carNumber : '';

                    rows.push({
                        serviceId: `${carton.id}-${idx}`,
                        serviceNumber: serviceNum || '???',
                        busNumber: preloadedBus, // Auto-filled from Daily Shifts!
                        scheduledTime: timeAtStop,
                        actualTime: '',
                        delay: 0,
                        occupancy: 'Medium',
                        occupancyCount: '',
                        status: 'Pending'
                    });
                }
            });
        });

        rows.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
        setBulletinRows(rows);
    };

    const handleUpdateRow = (index: number, field: keyof BulletinRow, value: any) => {
        const newRows = [...bulletinRows];
        newRows[index] = { ...newRows[index], [field]: value };

        // Auto-calculate delay if time changes
        if (field === 'actualTime') {
            const planned = parseTime(newRows[index].scheduledTime);
            const actual = parseTime(value);
            if (planned !== null && actual !== null) {
                const diff = (actual - planned); // minutes
                newRows[index].delay = diff;
                newRows[index].status = diff > 5 ? 'Late' : diff < -2 ? 'Early' : 'OnTime';
            }
        }

        setBulletinRows(newRows);
    };

    const parseTime = (timeStr: string): number | null => {
        if (!timeStr || !timeStr.includes(':')) return null;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const handleQuickTime = (index: number) => {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        handleUpdateRow(index, 'actualTime', timeStr);
    };

    const handleSave = async () => {
        if (bulletinRows.length === 0) return;

        try {
            setLoading(true);
            const today = getTodayStr();

            const payload = {
                date: today,
                entries: bulletinRows
                    .filter(r => r.actualTime) // Only save rows with data
                    .map(row => ({
                        serviceNumber: row.serviceNumber,
                        location: selectedStop,
                        scheduledTime: row.scheduledTime,
                        actualTime: row.actualTime,
                        delay: row.delay,
                        busNumber: row.busNumber,
                        occupancyCount: row.occupancyCount,
                        occupancy: row.occupancy,
                        status: row.status
                    }))
            };

            await BulletinService.save(payload);
            alert("Boletín guardado correctamente.");
        } catch (error) {
            console.error("Save error:", error);
            alert("Error al guardar boletín.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up pb-24 relative">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <ClipboardList className="w-8 h-8 text-primary-500" />
                        Boletines de Inspección
                    </h1>
                    <p className="text-slate-400 text-sm">Control de paso, horarios y ocupación por parada.</p>
                </div>

                {/* Global Controls */}
                <div className="flex gap-2">
                    <button
                        onClick={handleSave}
                        disabled={bulletinRows.length === 0 || loading}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors shadow-lg"
                    >
                        <Save className="w-5 h-5" /> Guardar Cambios
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => setShowImportMenu(!showImportMenu)}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors border border-slate-600 shadow-lg"
                        >
                            <Download className="w-5 h-5" /> Importar Matrices
                        </button>

                        {showImportMenu && (
                            <div className="absolute top-12 right-0 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-2 w-64 z-50">
                                <p className="text-[10px] uppercase font-bold text-slate-500 mb-2 px-2">Matrices Disponibles</p>
                                <button
                                    onClick={() => handleImportTemplate(line300Data)}
                                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-700 rounded-lg flex items-center gap-2"
                                >
                                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                                    Línea 300 (Ida)
                                </button>
                                <button
                                    onClick={() => handleImportTemplate(line300ReverseData)}
                                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-700 rounded-lg flex items-center gap-2"
                                >
                                    <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                                    Línea 300 (Vuelta)
                                </button>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={loadData}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl border border-slate-700"
                        title="Recargar Datos"
                    >
                        <RefreshCw className={clsx("w-5 h-5", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            <div className='flex flex-col gap-4'>
                {/* Control Panel */}
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto bg-slate-800/50 p-2 rounded-xl border border-slate-700">
                    <select
                        value={selectedLine}
                        onChange={(e) => { setSelectedLine(e.target.value); setSelectedDestination(''); setSelectedStop(''); }}
                        className="bg-slate-900 text-white border border-slate-700 rounded-lg px-4 py-2 outline-none focus:border-primary-500"
                    >
                        <option value="">Seleccionar Línea</option>
                        {lines.map(l => <option key={l} value={l}>Línea {l}</option>)}
                    </select>

                    <select
                        value={selectedDestination}
                        disabled={!selectedLine}
                        onChange={(e) => { setSelectedDestination(e.target.value); setSelectedStop(''); }}
                        className="bg-slate-900 text-white border border-slate-700 rounded-lg px-4 py-2 outline-none focus:border-primary-500 disabled:opacity-50"
                    >
                        <option value="">Seleccionar Sentido (Destino)</option>
                        {destinations.map(d => <option key={d} value={d}>Hacia {d}</option>)}
                    </select>

                    <select
                        value={selectedStop}
                        disabled={!selectedDestination}
                        onChange={(e) => setSelectedStop(e.target.value)}
                        className="bg-slate-900 text-white border border-slate-700 rounded-lg px-4 py-2 outline-none focus:border-primary-500 disabled:opacity-50"
                    >
                        <option value="">Punto de Control</option>
                        {stops.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>

            {/* Content Area */}
            {!selectedStop ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500 bg-slate-900/30 rounded-3xl border-2 border-dashed border-slate-800">
                    <MapPin className="w-16 h-16 mb-4 text-slate-700" />
                    <p className="text-lg font-medium">Configura el filtro de inspección</p>
                    <p className="text-sm">Selecciona Línea, Sentido y Punto de Control.</p>
                </div>
            ) : (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="p-4 border-b border-slate-800 bg-slate-900 flex justify-between items-center sticky top-0 z-10">
                        <div>
                            <h3 className="text-white font-bold text-lg">{selectedStop}</h3>
                            <p className="text-xs text-slate-400">Línea {selectedLine} • {bulletinRows.length} Servicios programados</p>
                        </div>
                        <div className="text-right">
                            {/* Indicators/Legend */}
                            <div className="flex gap-2 text-[10px] items-center">
                                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> En Hora</span>
                                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> Atrasado</span>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700 bg-slate-800/50">
                                    {/* Actions */}
                                    <th className="p-4 font-medium text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {bulletinRows.map((row, idx) => (
                                    <tr key={idx} className={clsx(
                                        "hover:bg-slate-800/50 transition-colors group",
                                        row.status === 'Late' && "bg-red-900/10", // Stronger red BG
                                        row.status === 'Early' && "bg-blue-900/10"
                                    )}>
                                        <td className="p-4">
                                            <div className="font-bold text-white text-lg">{row.serviceNumber}</div>
                                        </td>
                                        <td className="p-4">
                                            <input
                                                type="text"
                                                value={row.busNumber}
                                                onChange={(e) => handleUpdateRow(idx, 'busNumber', e.target.value)}
                                                placeholder="---"
                                                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white font-bold w-16 text-center focus:border-primary-500 outline-none"
                                            />
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2 text-slate-300 font-mono text-lg">
                                                <Clock className="w-4 h-4 text-slate-600" />
                                                {row.scheduledTime}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex gap-2 items-center">
                                                <input
                                                    type="time"
                                                    value={row.actualTime}
                                                    onChange={(e) => handleUpdateRow(idx, 'actualTime', e.target.value)}
                                                    className={clsx(
                                                        "bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono w-24 focus:border-primary-500 outline-none font-bold",
                                                        row.status === 'Late' && "border-red-500 text-red-400",
                                                        row.status === 'Early' && "border-blue-500 text-blue-400",
                                                        row.status === 'OnTime' && "border-emerald-500 text-emerald-400"
                                                    )}
                                                />
                                                <button
                                                    onClick={() => handleQuickTime(idx)}
                                                    className="p-2 bg-slate-800 hover:bg-primary-600 text-slate-400 hover:text-white rounded-lg transition-colors"
                                                    title="Marcar Ahora"
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {row.delay !== 0 && (
                                                <span className={clsx(
                                                    "text-xs font-bold mt-1 block",
                                                    row.delay > 3 ? "text-red-400 animate-pulse" : // > 3 Min Red
                                                        row.delay < -3 ? "text-blue-400" : // < -3 Min Blue
                                                            "text-emerald-400" // On Time
                                                )}>
                                                    {row.delay > 0 ? `+${row.delay} min` : `${row.delay} min`}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            {row.status === 'Late' && <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-bold border border-red-500/20"><AlertTriangle className="w-3 h-3" /> Atrasado</div>}
                                            {row.status === 'OnTime' && <div className="inline-flex items-center px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/20">En Hora</div>}
                                            {row.status === 'Early' && <div className="inline-flex items-center px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold border border-blue-500/20">Adelantado</div>}
                                            {row.status === 'Pending' && <span className="text-slate-600 text-xs">-</span>}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex gap-1 mb-2">
                                                {OCCUPANCY_OPTIONS.map(opt => (
                                                    <button
                                                        key={opt.value}
                                                        onClick={() => handleUpdateRow(idx, 'occupancy', opt.value)}
                                                        className={clsx(
                                                            "w-8 h-8 rounded-lg flex items-center justify-center transition-all border",
                                                            row.occupancy === opt.value
                                                                ? `${opt.color} border-current scale-110 shadow-lg`
                                                                : "bg-slate-800 text-slate-600 border-transparent hover:bg-slate-700"
                                                        )}
                                                        title={opt.label}
                                                    >
                                                        <Users className="w-4 h-4" />
                                                    </button>
                                                ))}
                                            </div>
                                            <input
                                                type="number"
                                                placeholder="Tickets..."
                                                value={row.occupancyCount}
                                                onChange={(e) => handleUpdateRow(idx, 'occupancyCount', e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-500 focus:border-primary-500 outline-none"
                                            />
                                        </td>
                                        {/* Action Buttons */}
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <a
                                                    href="/dashboard/abl/penalizations"
                                                    target="_blank"
                                                    className="p-2 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors border border-slate-700"
                                                    title="Aplicar Sanción"
                                                >
                                                    <AlertTriangle className="w-4 h-4" />
                                                </a>
                                                <a
                                                    href="/dashboard/admin/maintenance"
                                                    target="_blank"
                                                    className="p-2 bg-slate-800 hover:bg-yellow-500/20 text-slate-400 hover:text-yellow-400 rounded-lg transition-colors border border-slate-700"
                                                    title="Reportar Mantenimiento"
                                                >
                                                    <RefreshCw className="w-4 h-4" />
                                                </a>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminBoletines;
