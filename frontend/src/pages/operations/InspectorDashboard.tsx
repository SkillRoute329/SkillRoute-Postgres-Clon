
import React, { useState, useEffect } from 'react';
import { BulletinService } from '../../services/api';
import { Clock, MapPin, Users, Save, Search, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface ControlPoint {
    location: string;
    scheduledTime: string;
    actualTime: string;
    delay: number;
    status: 'Pending' | 'Completed' | 'Skipped';
    serviceNumber: string;
    occupancy?: number;
}

const InspectorDashboard = () => {
    const { user } = useAuth();
    const [serviceNumber, setServiceNumber] = useState('');
    const [points, setPoints] = useState<ControlPoint[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeService, setActiveService] = useState<string | null>(null);

    // Modal State
    const [selectedPoint, setSelectedPoint] = useState<ControlPoint | null>(null);
    const [inputTime, setInputTime] = useState('');
    const [inputPax, setInputPax] = useState('');

    const loadService = async () => {
        if (!serviceNumber) return;
        setLoading(true);
        try {
            const template = await BulletinService.getTemplate(serviceNumber);
            setPoints(template);
            setActiveService(serviceNumber);
        } catch (error) {
            alert('No se encontró el servicio o cartón.');
            setPoints([]);
        } finally {
            setLoading(false);
        }
    };

    const handlePointClick = (point: ControlPoint) => {
        const now = new Date();
        const currentHHMM = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

        setSelectedPoint(point);
        setInputTime(point.actualTime || currentHHMM);
        setInputPax(point.occupancy?.toString() || '');
    };

    const savePoint = async () => {
        if (!selectedPoint) return;

        // Calculate Delay
        // Simple Minut Difference logic
        // TODO: Handle day rollover if needed, assume same day for MVP
        const [schedH, schedM] = selectedPoint.scheduledTime.split(':').map(Number);
        const [actH, actM] = inputTime.split(':').map(Number);

        const schedMin = schedH * 60 + schedM;
        const actMin = actH * 60 + actM;
        const diff = actMin - schedMin;

        const updatedPoint: ControlPoint = {
            ...selectedPoint,
            actualTime: inputTime,
            delay: diff,
            occupancy: inputPax ? parseInt(inputPax) : 0,
            status: 'Completed'
        };

        setLoading(true);
        try {
            // Save to Backend
            await BulletinService.save({
                date: new Date().toISOString(),
                entries: [{
                    serviceNumber: activeService,
                    location: updatedPoint.location,
                    scheduledTime: updatedPoint.scheduledTime,
                    actualTime: updatedPoint.actualTime,
                    delay: updatedPoint.delay,
                    occupancyCount: updatedPoint.occupancy,
                    status: 'Completed'
                }]
            });

            // Update Local State
            setPoints(prev => prev.map(p =>
                p.location === updatedPoint.location && p.scheduledTime === updatedPoint.scheduledTime
                    ? updatedPoint
                    : p
            ));

            setSelectedPoint(null);
        } catch (e) {
            alert('Error al guardar registro');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 space-y-6 pb-24">
            {/* Header */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Users className="text-primary-500" />
                        Control de Tránsito
                    </h1>
                    <p className="text-slate-400 text-sm">Inspector: <span className="text-white font-mono">{user?.internalNumber}</span></p>
                </div>

                {activeService && (
                    <div className="bg-primary-900/30 px-4 py-2 rounded-xl border border-primary-500/30 text-center">
                        <span className="text-xs text-primary-300 uppercase font-bold">Servicio Activo</span>
                        <div className="text-2xl font-mono font-bold text-white leading-none">{activeService}</div>
                    </div>
                )}
            </div>

            {/* Selector */}
            {!activeService ? (
                <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center space-y-4">
                    <h2 className="text-xl text-white font-medium">Seleccionar Servicio a Controlar</h2>
                    <div className="flex max-w-md mx-auto gap-2">
                        <input
                            value={serviceNumber}
                            onChange={e => setServiceNumber(e.target.value)}
                            placeholder="Ej. 1042, 2290..."
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-lg font-mono focus:ring-2 focus:ring-primary-500 outline-none"
                        />
                        <button
                            onClick={loadService}
                            disabled={!serviceNumber || loading}
                            className="bg-primary-600 hover:bg-primary-500 text-white px-6 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
                        >
                            <Search className="w-5 h-5" /> Buscar
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                        <h3 className="text-slate-400 uppercase text-xs font-bold tracking-wider">Puntos de Control ({points.length})</h3>
                        <button onClick={() => setActiveService(null)} className="text-xs text-red-400 hover:text-red-300">Cambiar Servicio</button>
                    </div>

                    <div className="grid gap-3">
                        {points.map((point, idx) => (
                            <button
                                key={idx}
                                onClick={() => handlePointClick(point)}
                                className={`w-full text-left p-4 rounded-xl border transition-all relative overflow-hidden group
                                    ${point.status === 'Completed'
                                        ? 'bg-slate-900/50 border-slate-800 opacity-75 hover:opacity-100'
                                        : 'bg-slate-800 border-slate-700 hover:border-primary-500/50 hover:bg-slate-750'
                                    }
                                `}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs
                                            ${point.status === 'Completed' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-700 text-slate-300'}
                                        `}>
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <div className="text-white font-bold text-lg leading-none">{point.location}</div>
                                            <div className="text-slate-500 text-xs mt-1 flex items-center gap-2">
                                                <Clock className="w-3 h-3" /> Prog: {point.scheduledTime}
                                            </div>
                                        </div>
                                    </div>

                                    {point.status === 'Completed' ? (
                                        <div className="text-right">
                                            <div className="text-lg font-mono font-bold text-emerald-400">{point.actualTime}</div>
                                            <div className={`text-xs font-bold ${point.delay > 0 ? 'text-red-400' : 'text-emerald-500'}`}>
                                                {point.delay > 0 ? `+${point.delay} min` : `${point.delay} min`}
                                            </div>
                                        </div>
                                    ) : (
                                        <ArrowRight className="text-slate-600 group-hover:text-primary-500 transition-colors" />
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Modal de Registro */}
            {selectedPoint && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4 animate-fade-in">
                    <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-6 shadow-2xl relative">
                        <h3 className="text-xl font-bold text-white mb-1">Registrar Control</h3>
                        <p className="text-slate-400 text-sm mb-6">{selectedPoint.location} (Prog: {selectedPoint.scheduledTime})</p>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs uppercase font-bold text-slate-500 mb-2">Hora Real de Paso</label>
                                <input
                                    type="time"
                                    value={inputTime}
                                    onChange={e => setInputTime(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-3xl font-mono text-center text-white focus:ring-2 focus:ring-primary-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs uppercase font-bold text-slate-500 mb-2">Carga (Pasajeros Abordo)</label>
                                <input
                                    type="number"
                                    value={inputPax}
                                    onChange={e => setInputPax(e.target.value)}
                                    placeholder="0"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-3xl font-mono text-center text-white focus:ring-2 focus:ring-primary-500 outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <button
                                    onClick={() => setSelectedPoint(null)}
                                    className="bg-slate-800 text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-700"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={savePoint}
                                    className="bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 shadow-lg shadow-emerald-900/20"
                                >
                                    Confirmar
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
