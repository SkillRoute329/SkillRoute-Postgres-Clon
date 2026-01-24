
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { BulletinService } from '../../services/api';
import { Search, RotateCcw, Save, Users, Clock, AlertTriangle } from 'lucide-react';
import { LINE_ARCHETYPES, line300Data, line300ReverseData } from '../../data/lineTemplates';

// Types
interface MatrixCell {
    service: string;
    headerId: string;
    scheduledTime: string;
    actualTime?: string;
    delay?: number;
    status: 'Pending' | 'Completed' | 'Skipped';
    occupancy?: number;
}

const InspectorDashboard = () => {
    const { user } = useAuth();
    const [line, setLine] = useState('');
    const [variant, setVariant] = useState<'IDA' | 'VUELTA'>('IDA');
    const [matrixMode, setMatrixMode] = useState(false);

    // Matrix Data
    const [headers, setHeaders] = useState<any[]>([]);
    const [rows, setRows] = useState<any[]>([]);

    // Modal Interaction
    const [selectedCell, setSelectedCell] = useState<MatrixCell | null>(null);
    const [inputTime, setInputTime] = useState('');
    const [inputPax, setInputPax] = useState('');

    const loadMatrix = async () => {
        if (!line) return;

        // 1. Load Template (Archetype)
        // For MVP we just use the static line300Data if line is 300, else we try to find it.
        // In full version, this comes from API: /service-definitions?line=300

        let templateData: any = null;
        if (line === '300') {
            templateData = variant === 'IDA' ? line300Data : line300ReverseData;
        } else if (LINE_ARCHETYPES[line]) {
            // Reconstruct if we only have headers but no rows logic in Archetype (Archetype is simpler)
            // Ideally we need the full ServiceDefinition rows.
            // Let's alert if not found for now.
            alert('Línea no configurada completamente en demo. Usar 300.');
            return;
        } else {
            alert('Línea no encontrada. Pruebe 300.');
            return;
        }

        // 2. Load Actuals (Bulletin Entries for Today)
        // TODO: backend fetch using BulletinService.getEntries({ line, date: today })
        // For now, local state only.

        setHeaders(templateData.headers);
        setRows(templateData.rows);
        setMatrixMode(true);
    };

    const handleCellClick = (row: any, header: any) => {
        const schedTime = row.times[header.id];
        if (!schedTime) return; // Empty cell (skipped stop)

        const now = new Date();
        const currentHHMM = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

        setSelectedCell({
            service: row.serviceNumber,
            headerId: header.id,
            scheduledTime: schedTime,
            status: 'Pending',
            actualTime: currentHHMM
        });

        setInputTime(currentHHMM);
        setInputPax('');
    };

    const saveControl = async () => {
        if (!selectedCell) return;

        // Calculate Delay
        const [schedH, schedM] = selectedCell.scheduledTime.split(':').map(Number);
        const [actH, actM] = inputTime.split(':').map(Number);
        const diff = (actH * 60 + actM) - (schedH * 60 + schedM);

        try {
            await BulletinService.save({
                date: new Date().toISOString(),
                entries: [{
                    serviceNumber: selectedCell.service,
                    location: headers.find(h => h.id === selectedCell.headerId)?.location, // Look up name
                    scheduledTime: selectedCell.scheduledTime,
                    actualTime: inputTime,
                    delay: diff,
                    occupancyCount: inputPax ? parseInt(inputPax) : 0,
                    status: 'Completed'
                }]
            });

            // Visual Update locally (Optimistic)
            // We need to update the "Rows" state to reflect this new Actual time?
            // "DigitalCarton" data structure was "times: { h1: '10:00' }". It doesn't store actuals/metadata easily in the *same* string.
            // We need a parallel state for "Actuals".

            // For MVP display, we just close modal. The Matrix assumes static plan for now.
            // To show "Green/Red", we'd need to fetch and overlay status.

            setSelectedCell(null);
            alert(`Registro Guardado: Servicio ${selectedCell.service}, Atraso: ${diff} min`);

        } catch (e) {
            alert('Error al guardar');
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden pb-16">
            {/* Header / Selector */}
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Users className="text-primary-500" />
                        <span className="hidden md:inline">Control Inspectores</span>
                    </h1>

                    <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                        <input
                            className="bg-transparent text-center w-20 px-2 outline-none font-bold font-mono"
                            placeholder="300"
                            value={line}
                            onChange={e => setLine(e.target.value)}
                        />
                        <div className="w-px bg-slate-700 mx-1"></div>
                        <button
                            onClick={() => setVariant('IDA')}
                            className={`px-3 py-1 rounded text-xs font-bold ${variant === 'IDA' ? 'bg-primary-600' : 'text-slate-400'}`}
                        >
                            IDA
                        </button>
                        <button
                            onClick={() => setVariant('VUELTA')}
                            className={`px-3 py-1 rounded text-xs font-bold ${variant === 'VUELTA' ? 'bg-primary-600' : 'text-slate-400'}`}
                        >
                            VTA
                        </button>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button onClick={loadMatrix} className="bg-primary-600 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-primary-500">
                        <Search size={16} /> <span className="hidden sm:inline">Cargar Matriz</span>
                    </button>
                </div>
            </div>

            {/* Matrix View */}
            {!matrixMode ? (
                <div className="flex-1 flex items-center justify-center p-8 text-slate-500 text-center">
                    <div>
                        <Search className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <p>Ingrese Línea y presione Cargar para ver la Sábana Horaria</p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-auto custom-scrollbar relative">
                    <table className="w-full text-xs border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 shadow-xl">
                            <tr>
                                <th className="p-3 text-left font-bold text-slate-400 w-24 border-r border-slate-800 sticky left-0 bg-slate-900 z-20">Servicio</th>
                                {headers.map(h => (
                                    <th key={h.id} className="p-2 text-center font-medium text-slate-300 min-w-[80px] border-r border-slate-800 whitespace-nowrap rotate-0">
                                        <div className="writing-mode-vertical transform -rotate-180 h-32 flex items-center justify-center">
                                            {h.location}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-slate-900/50">
                            {rows.map((row) => (
                                <tr key={row.id} className="hover:bg-slate-800 transition-colors border-b border-slate-800/50">
                                    <td className="p-3 font-bold text-white border-r border-slate-800 sticky left-0 bg-slate-900/90 z-10">
                                        {row.serviceNumber}
                                    </td>
                                    {headers.map(h => (
                                        <td
                                            key={h.id}
                                            onClick={() => handleCellClick(row, h)}
                                            className={`p-2 text-center border-r border-slate-800/50 cursor-pointer hover:bg-white/10 transition-colors
                                                ${!row.times[h.id] ? 'bg-slate-950/50' : ''}
                                            `}
                                        >
                                            <span className="font-mono text-slate-300 font-medium">
                                                {row.times[h.id] || '-'}
                                            </span>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Inspector Tools Modal */}
            {selectedCell && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl p-6 shadow-2xl">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-white">Registrar Paso</h3>
                                <p className="text-slate-400 text-xs mt-1">
                                    Servicio {selectedCell.service} • {headers.find(h => h.id === selectedCell.headerId)?.location}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="text-slate-500 text-[10px] uppercase font-bold">Programado</span>
                                <div className="text-xl font-mono text-white">{selectedCell.scheduledTime}</div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                <label className="block text-xs uppercase font-bold text-slate-500 mb-2">Hora Real</label>
                                <div className="flex gap-2">
                                    <Clock className="text-primary-500 mt-2" />
                                    <input
                                        type="time"
                                        value={inputTime}
                                        onChange={e => setInputTime(e.target.value)}
                                        className="flex-1 bg-transparent text-3xl font-mono text-white font-bold outline-none text-center"
                                    />
                                </div>
                            </div>

                            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                <label className="block text-xs uppercase font-bold text-slate-500 mb-2">Pasajeros</label>
                                <div className="flex gap-2">
                                    <Users className="text-primary-500 mt-2" />
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={inputPax}
                                        onChange={e => setInputPax(e.target.value)}
                                        className="flex-1 bg-transparent text-3xl font-mono text-white font-bold outline-none text-center"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setSelectedCell(null)} className="flex-1 py-3 text-slate-400 font-bold hover:bg-slate-800 rounded-xl">
                                    Volver
                                </button>
                                <button onClick={saveControl} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 shadow-lg shadow-emerald-900/20">
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InspectorDashboard;
