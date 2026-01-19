import { useState } from 'react';
import { Save, Edit2, Plus, RotateCcw, Flag, Trash2, X } from 'lucide-react';
import clsx from 'clsx';

interface RoutePoint {
    id: string;
    location: string;
    isStop: boolean;
}

interface TimeRow {
    id: string;
    times: { [pointId: string]: string }; // Map pointId to time string
    serviceNumber?: string;
}

export interface ServiceDefinitionData {
    serviceNumber: string;
    line: string;
    title: string;
    startTime: string;
    startLocationDescription: string;
    endTime: string; // New field for End/Guardar time
    headers: RoutePoint[];
    rows: TimeRow[];
    // Track relief cells by "rowId|pointId"
    reliefs: string[];
    shiftDescriptions?: string[]; // Optional manual override for descriptions
    totalHours: string;
    waitingTime: string;
    liquidHours: string;
    kilometers: string;
}

interface DigitalCartonProps {
    data: ServiceDefinitionData;
    isEditable?: boolean;
    onSave?: (newData: ServiceDefinitionData) => void;
}

// Helper to calculate difference between HH:MM times
const calculateDuration = (start: string, end: string) => {
    if (!start || !end) return "--:--";
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);

    if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return "--:--";

    let minutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (minutes < 0) minutes += 24 * 60; // Handle midnight crossing

    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const getDurationMinutes = (start: string, end: string) => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0;

    let minutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (minutes < 0) minutes += 24 * 60;
    return minutes;
};

const formatTimeFromMinutes = (totalMinutes: number) => {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const subtractTime = (totalStr: string, subtractStr: string) => {
    if (!totalStr || !subtractStr) return totalStr;
    const [h1, m1] = totalStr.split(':').map(Number);
    const [h2, m2] = subtractStr.split(':').map(Number);

    if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return totalStr;

    let minutes = (h1 * 60 + m1) - (h2 * 60 + m2);
    if (minutes < 0) minutes = 0; // No negative time

    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

const DigitalCarton = ({ data: initialData, isEditable = false, onSave }: DigitalCartonProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [isReliefMode, setIsReliefMode] = useState(false);
    const [data, setData] = useState<ServiceDefinitionData>(initialData);
    const [draggedRelief, setDraggedRelief] = useState<string | null>(null);

    const handleSave = () => {
        setIsEditing(false);
        setIsReliefMode(false);
        if (onSave) onSave(data);
    };

    const handleChange = (field: keyof ServiceDefinitionData, value: any) => {
        // Create temp updated data
        const updatedData = { ...data, [field]: value };

        // Auto-calculate Total and Liquid Hours if relevant fields change
        if (field === 'startTime' || field === 'endTime' || field === 'waitingTime') {
            const newTotal = calculateDuration(updatedData.startTime, updatedData.endTime);
            if (newTotal !== "--:--") {
                updatedData.totalHours = newTotal;
                updatedData.liquidHours = subtractTime(newTotal, updatedData.waitingTime);
            }
        }

        setData(updatedData);
    };

    const updateHeader = (idx: number, val: string) => {
        const newHeaders = [...data.headers];
        newHeaders[idx].location = val;
        setData({ ...data, headers: newHeaders });
    };

    const updateTime = (rowIdx: number, pointId: string, time: string) => {
        const newRows = [...data.rows];
        if (!newRows[rowIdx]) return;
        newRows[rowIdx].times = { ...newRows[rowIdx].times, [pointId]: time };
        setData({ ...data, rows: newRows });
    };

    const toggleRelief = (rowId: string, pointId: string) => {
        if (!isReliefMode) return;

        const compositeId = `${rowId}|${pointId}`;
        const newReliefs = data.reliefs?.includes(compositeId)
            ? data.reliefs.filter(id => id !== compositeId)
            : [...(data.reliefs || []), compositeId];

        setData({ ...data, reliefs: newReliefs });
    };

    const deleteColumn = (colId: string) => {
        if (confirm('¿Eliminar esta parada/columna?')) {
            setData(prev => ({
                ...prev,
                headers: prev.headers.filter(h => h.id !== colId),
                // Also remove times associated with this column from all rows
                rows: prev.rows.map(row => {
                    const newTimes = { ...row.times };
                    delete newTimes[colId];
                    return { ...row, times: newTimes };
                }),
                // Remove any reliefs associated with this column
                reliefs: prev.reliefs.filter(reliefId => !reliefId.endsWith(`|${colId}`))
            }));
        }
    };

    const deleteRow = (rowId: string) => {
        if (confirm('¿Eliminar esta fila de horarios?')) {
            setData(prev => ({
                ...prev,
                rows: prev.rows.filter(r => r.id !== rowId),
                // Remove any reliefs associated with this row
                reliefs: prev.reliefs.filter(reliefId => !reliefId.startsWith(`${rowId}|`))
            }));
        }
    };

    // Calculate Shifts
    const getShifts = () => {
        // 1. Collect Relief Times in order
        const reliefTimes: { time: string, location: string }[] = [];

        // Iterate rows then headers to find reliefs in chronological order
        data.rows.forEach(row => {
            data.headers.forEach(header => {
                const compositeId = `${row.id}|${header.id}`;
                if (data.reliefs?.includes(compositeId)) {
                    const time = row.times[header.id];
                    if (time) reliefTimes.push({ time, location: header.location });
                }
            });
        });

        // 2. Build Segments
        // Start -> Relief 1
        // Relief 1 -> Relief N
        // Relief N -> End
        const points = [
            { time: data.startTime, label: data.startLocationDescription || 'Saca Coche' },
            ...reliefTimes.map((r, i) => ({ time: r.time, label: `Relevo ${i + 1} (${r.location})` })),
            { time: data.endTime || '??:??', label: 'Guarda Coche' }
        ];

        const shifts = [];
        // Only calculate if we have at least start and end or some reliefs
        if (!data.startTime && points.length < 2) return [];

        for (let i = 0; i < points.length - 1; i++) {
            const start = points[i];
            const end = points[i + 1];

            // Calculate duration and extra
            const durationMins = getDurationMinutes(start.time, end.time);
            const extraMins = Math.max(0, durationMins - 450); // 7h 30m = 450 mins

            // Default descriptions logic
            let defaultDesc = "Turno Operativo";
            if (i === 0) defaultDesc = `Saca Coche / ${data.startLocationDescription}`;
            else if (i === points.length - 2) defaultDesc = "Guarda Coche en Terreno";
            else defaultDesc = `Relevo Intermedio (${start.label})`;

            shifts.push({
                index: i + 1,
                start: start.time,
                end: end.time,
                duration: formatTimeFromMinutes(durationMins),
                extra: extraMins > 0 ? formatTimeFromMinutes(extraMins) : null,
                defaultDesc
            });
        }
        return shifts;
    };

    const shifts = getShifts();

    // Drag and Drop Logic for Reliefs
    const handleDragStart = (e: React.DragEvent, id: string) => {
        // Only allow dragging if we are in edit mode (and specifically if it is a relief cell)
        // But the draggable attribute controls the start.
        setDraggedRelief(id);
        e.dataTransfer.effectAllowed = 'move';
        // Transparent drag image or default
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (draggedRelief) {
            e.preventDefault(); // Allow drop
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const handleDrop = (e: React.DragEvent, targetRowId: string, targetPointId: string) => {
        e.preventDefault();
        if (!draggedRelief) return;

        const targetId = `${targetRowId}|${targetPointId}`;

        // If dropping on itself, do nothing
        if (draggedRelief === targetId) {
            setDraggedRelief(null);
            return;
        }

        // Move logic: Remove old, Add new
        const newReliefs = (data.reliefs || [])
            .filter(id => id !== draggedRelief) // Remove old
            .concat(targetId); // Add new

        setData({ ...data, reliefs: newReliefs });
        setDraggedRelief(null);
    };

    if (!isEditable && isEditing) setIsEditing(false); // Safety sync

    return (
        <div className="relative group p-1 md:p-6 select-none">
            {/* Toolbar */}
            {isEditable && (
                <div className="flex justify-end gap-2 mb-4 print:hidden">
                    {isEditing ? (
                        <>
                            <button
                                onClick={() => setIsReliefMode(!isReliefMode)}
                                className={clsx(
                                    "px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-bold transition-all shadow-lg active:scale-95",
                                    isReliefMode ? "bg-red-600 text-white shadow-red-900/20" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                                )}
                            >
                                <Flag className="w-4 h-4" /> {isReliefMode ? 'Terminar Relevos' : 'Marcar Relevo'}
                            </button>

                            <button onClick={() => setData(initialData)} className="bg-slate-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm hover:bg-slate-600 transition-colors">
                                <RotateCcw className="w-4 h-4" /> Restaurar
                            </button>
                            <button onClick={handleSave} className="bg-green-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm hover:bg-green-500 shadow-lg shadow-green-900/20 font-bold transition-transform active:scale-95">
                                <Save className="w-4 h-4" /> Guardar Cambios
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setIsEditing(true)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm hover:bg-blue-500 shadow-lg shadow-blue-900/20 font-bold transition-transform active:scale-95">
                            <Edit2 className="w-4 h-4" /> Editar Cartón
                        </button>
                    )}
                </div>
            )}

            {isReliefMode && (
                <div className="text-center text-red-500 font-bold mb-2 animate-pulse uppercase text-xs">
                    Modo Relevo: Click para crear/eliminar • Arrastra para mover
                </div>
            )}

            <div className={`p-1 md:p-4 border-2 border-slate-900 bg-white text-black font-mono shadow-2xl w-full mx-auto transition-all ${isEditing ? 'ring-4 ring-blue-500/20 scale-[1.005]' : ''}`}>

                {/* Header Section */}
                <div className="w-full overflow-x-auto touch-pan-x mb-2">
                    <div className="flex justify-between items-end border-b-2 border-black pb-2 min-w-[600px] md:min-w-[800px]">
                        <div className="text-center w-32">
                            <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-600">Linea</p>
                            {isEditing ? (
                                <input
                                    value={data.line}
                                    onChange={e => handleChange('line', e.target.value)}
                                    className="text-3xl md:text-4xl font-black text-blue-900 w-full text-center border-b border-blue-300 focus:outline-none bg-blue-50"
                                />
                            ) : (
                                <p className="text-3xl md:text-4xl font-black text-blue-900">{data.line}</p>
                            )}
                        </div>

                        <div className="flex-1 flex flex-col items-center justify-end px-4">
                            <p className="text-[9px] md:text-[10px] font-bold mb-1 text-slate-500 text-center">U.C.O.T. MOBILE</p>
                            <div className="w-full bg-[#8ce655] border-2 border-black py-1 md:py-1.5 px-3 md:px-6 font-black text-lg md:text-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-center uppercase tracking-tight">
                                {isEditing ? (
                                    <input
                                        value={data.title}
                                        onChange={e => handleChange('title', e.target.value)}
                                        className="w-full bg-transparent text-center focus:outline-none border-b border-black/20 placeholder-black/30 font-black text-lg md:text-xl"
                                    />
                                ) : data.title}
                            </div>
                        </div>

                        <div className="text-center w-32">
                            <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-600">Servicio N°</p>
                            {isEditing ? (
                                <input
                                    value={data.serviceNumber}
                                    onChange={e => handleChange('serviceNumber', e.target.value)}
                                    className="text-3xl md:text-4xl font-black text-black w-full text-center border-b border-blue-300 focus:outline-none bg-blue-50"
                                />
                            ) : (
                                <p className="text-3xl md:text-4xl font-black">{data.serviceNumber}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Grid Section */}
                <div className="w-full overflow-x-auto touch-pan-x border-2 border-black mb-1 relative">
                    <table className="w-full text-center border-collapse table-fixed min-w-[600px] md:min-w-[800px]">
                        <thead>
                            <tr>
                                {data.headers.map((point, idx) => (
                                    <th key={point.id} className="border-r border-black/50 p-1 bg-white align-bottom h-28 md:h-36 w-10 md:w-12 relative group/col overflow-visible">
                                        {isEditing && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); deleteColumn(point.id); }}
                                                className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-100 hover:bg-red-200 text-red-600 rounded-full p-1 z-20 shadow-sm opacity-0 group-hover/col:opacity-100 transition-opacity border border-red-200"
                                                title="Eliminar Columna"
                                            >
                                                <X size={10} />
                                            </button>
                                        )}
                                        <div className="h-full w-full flex items-end justify-center pb-2">
                                            <div className="[writing-mode:vertical-rl] transform rotate-180 whitespace-nowrap text-left font-bold text-[9px] md:text-[11px] h-24 md:h-32 w-4 flex items-center">
                                                {isEditing ? (
                                                    <input
                                                        value={point.location}
                                                        onChange={e => updateHeader(idx, e.target.value)}
                                                        className="bg-transparent focus:outline-none focus:bg-blue-50 w-full h-full text-left"
                                                    />
                                                ) : <span className="w-full">{point.location}</span>}
                                            </div>
                                        </div>
                                    </th>
                                ))}
                                {isEditing && <th className="w-8 border-l border-black/50 bg-slate-50"></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map((row, rowIdx) => (
                                <tr key={row.id} className="h-7 md:h-8 group/row">
                                    {data.headers.map((point) => {
                                        const time = row.times[point.id] || '';
                                        const compositeId = `${row.id}|${point.id}`;
                                        const isRelief = data.reliefs?.includes(compositeId);

                                        return (
                                            <td
                                                key={point.id}
                                                onClick={() => toggleRelief(row.id, point.id)}
                                                draggable={isEditing && isRelief}
                                                onDragStart={(e) => handleDragStart(e, compositeId)}
                                                onDragOver={handleDragOver}
                                                onDrop={(e) => handleDrop(e, row.id, point.id)}
                                                className={clsx(
                                                    "border-t border-r border-black/50 p-0 relative transition-colors cursor-default",
                                                    isEditing && !isReliefMode && "hover:bg-blue-50",
                                                    isReliefMode && "cursor-pointer hover:bg-amber-50",
                                                    isRelief && "border-[3px] border-red-600 z-10 cursor-move"
                                                )}
                                            >
                                                {isEditing && !isReliefMode ? (
                                                    <input
                                                        value={time}
                                                        onChange={e => updateTime(rowIdx, point.id, e.target.value)}
                                                        className="w-full h-full text-center font-bold focus:outline-none bg-transparent text-[9px] md:text-[11px] min-w-[30px] md:min-w-[40px]"
                                                        placeholder="----"
                                                    />
                                                ) : (
                                                    <span className={clsx(
                                                        "block w-full h-full py-1 md:py-1.5 font-bold text-[9px] md:text-[11px]",
                                                        isRelief ? "text-red-700 bg-red-100/20" : ""
                                                    )}>
                                                        {time}
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                    {isEditing && (
                                        <td className="border-t border-l border-black/50 p-0 bg-slate-50 align-middle">
                                            <button
                                                onClick={() => deleteRow(row.id)}
                                                className="w-full h-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                title="Eliminar Fila"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {isEditing && (
                        <div className="absolute top-0 right-0 h-full w-8 bg-slate-100 border-l border-black flex flex-col items-center justify-center gap-2 opacity-0 hover:opacity-100 transition-opacity z-10 cursor-pointer"
                            onClick={() => {
                                const newId = `col-${Date.now()}`;
                                setData({
                                    ...data,
                                    headers: [...data.headers, { id: newId, location: 'NUEVA PARADA', isStop: true }]
                                });
                            }} title="Agregar Parada">
                            <Plus className="w-5 h-5 text-green-600" />
                        </div>
                    )}
                </div>

                {/* Add Row Button (Edit Mode) */}
                {isEditing && (
                    <div className="flex justify-center mb-4">
                        <button
                            onClick={() => {
                                const newRowId = `row-${Date.now()}`;
                                setData({
                                    ...data,
                                    rows: [...data.rows, { id: newRowId, times: {} }]
                                });
                            }}
                            className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-1 rounded border border-blue-200 transition-colors"
                        >
                            <Plus className="w-3 h-3 md:w-4 h-4" /> Agregar Horario (Fila)
                        </button>
                    </div>
                )}

                {/* Timings Bar */}
                <div className="w-full overflow-x-auto touch-pan-x mb-2">
                    <div className="border-2 border-black bg-white p-1 md:p-1.5 text-center font-bold text-[10px] md:text-sm flex items-center justify-center gap-1 min-w-[600px] md:min-w-[800px]">
                        <span className="uppercase">SACA COCHE A LA HORA:</span>
                        {isEditing ? (
                            <div className="flex gap-2 items-center bg-blue-50 px-2 rounded ml-2 flex-1">
                                <input
                                    value={data.startTime}
                                    onChange={e => handleChange('startTime', e.target.value)}
                                    className="w-14 md:w-16 text-center font-bold text-red-600 bg-transparent focus:outline-none text-lg md:text-xl"
                                    placeholder="00:00"
                                />
                                <input
                                    value={data.startLocationDescription}
                                    onChange={e => handleChange('startLocationDescription', e.target.value)}
                                    className="flex-1 font-bold bg-transparent focus:outline-none uppercase"
                                    placeholder="Descripción Saca Coche"
                                />
                                <span className="pl-2 md:pl-4 border-l border-blue-200 uppercase">GUARDA:</span>
                                <input
                                    value={data.endTime || ''}
                                    onChange={e => handleChange('endTime', e.target.value)}
                                    className="w-14 md:w-16 text-center font-bold text-red-600 bg-transparent focus:outline-none text-lg md:text-xl ml-1"
                                    placeholder="00:00"
                                />
                            </div>
                        ) : (
                            <>
                                <span className="text-red-600 text-base md:text-lg mx-1">{data.startTime}</span>
                                <span className="uppercase mr-4">{data.startLocationDescription}</span>
                                <span className="uppercase border-l-2 border-black pl-4">GUARDA:</span>
                                <span className="text-red-600 text-base md:text-lg mx-1">{data.endTime || '??:??'}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* SHIFT SUMMARY CALCULATION */}
                <div className="w-full overflow-x-auto touch-pan-x mb-2">
                    <div className="border-2 border-black border-t-0 p-1 bg-slate-50 min-w-[600px] md:min-w-[800px]">
                        <h4 className="font-bold text-[9px] md:text-xs uppercase mb-1 border-b border-black pb-0.5">Cálculo de Turnos (Automático)</h4>
                        <div className="grid grid-cols-1 gap-1">
                            {shifts.map((shift, i) => (
                                <div key={i} className="flex items-center text-[9px] md:text-[10px] uppercase font-bold border-b border-black/10 last:border-0 pb-0.5">
                                    <div className="w-16 md:w-20 bg-blue-100 text-center mr-2 rounded text-blue-800">
                                        TURNO {shift.index}
                                    </div>
                                    <div className="w-24 md:w-32 text-center border-r border-black/20 pr-2">
                                        <span className="text-red-700">{shift.start}</span> a <span className="text-red-700">{shift.end}</span>
                                    </div>
                                    <div className="w-20 md:w-24 text-center border-r border-black/20 px-2 flex flex-col justify-center">
                                        <span>{shift.duration} hs</span>
                                        {shift.extra && (
                                            <span className="text-[8px] md:text-[9px] text-red-600 bg-red-100 rounded px-1 font-bold whitespace-nowrap mt-0.5">
                                                + {shift.extra} EXTRA
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 pl-2">
                                        {isEditing ? (
                                            <input
                                                placeholder={shift.defaultDesc}
                                                className="w-full bg-transparent border-b border-dashed border-slate-300 focus:outline-none focus:border-blue-500 placeholder-slate-400 text-[9px] md:text-[10px]"
                                                value={data.shiftDescriptions?.[i] || ''}
                                                onChange={(e) => {
                                                    const newDescs = [...(data.shiftDescriptions || [])];
                                                    newDescs[i] = e.target.value;
                                                    setData({ ...data, shiftDescriptions: newDescs });
                                                }}
                                            />
                                        ) : (
                                            <span className="text-slate-700">{data.shiftDescriptions?.[i] || shift.defaultDesc}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer Info */}
                <div className="w-full overflow-x-auto touch-pan-x mb-2">
                    <div className="border-t-2 border-black pt-2 mt-2 font-bold grid grid-cols-1 gap-1 min-w-[600px] md:min-w-[800px]">
                        <div className="bg-[#fff9c4] border border-black p-1 text-[9px] md:text-[10px] text-center w-full uppercase leading-tight">
                            Es obligacion salir con expendedora encendida y cerrar ventanillas del coche al guardar en el terreno
                        </div>

                        <div className="flex justify-between items-center bg-slate-50 border border-slate-300 p-1 md:p-2 text-[9px] md:text-xs uppercase mt-1">
                            <div className="flex gap-1 md:gap-2 items-center">
                                <span>Hs Totales:</span>
                                {isEditing ? <input value={data.totalHours} onChange={e => handleChange('totalHours', e.target.value)} className="w-12 md:w-14 bg-white border px-1" /> : <span>{data.totalHours}</span>}
                            </div>
                            <div className="flex gap-1 md:gap-2 items-center">
                                <span>Esperas:</span>
                                {isEditing ? <input value={data.waitingTime} onChange={e => handleChange('waitingTime', e.target.value)} className="w-12 md:w-14 bg-white border px-1" /> : <span>{data.waitingTime}</span>}
                            </div>
                            <div className="flex gap-1 md:gap-2 items-center">
                                <span>Hs Líquidas:</span>
                                {isEditing ? <input value={data.liquidHours} onChange={e => handleChange('liquidHours', e.target.value)} className="w-12 md:w-14 bg-white border px-1" /> : <span>{data.liquidHours}</span>}
                            </div>
                            <div className="flex gap-1 md:gap-2 items-center">
                                <span>KM:</span>
                                {isEditing ? <input value={data.kilometers} onChange={e => handleChange('kilometers', e.target.value)} className="w-16 md:w-24 bg-white border px-1" /> : <span>{data.kilometers}</span>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-2 text-[8px] text-center text-slate-400 font-sans tracking-widest uppercase">
                    TransForma- Digital System
                </div>
            </div>
            <div className="h-20 md:hidden"></div> {/* Mobile Bottom Spacer */}
        </div>
    );
};

export default DigitalCarton;
