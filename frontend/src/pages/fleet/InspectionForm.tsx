
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, CheckCircle, AlertTriangle, ArrowRight, Bus } from 'lucide-react';
import { FleetService } from '../../services/api';

const InspectionForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [lastInspection, setLastInspection] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Form Data
    const [odometer, setOdometer] = useState('');
    const [fuelLevel, setFuelLevel] = useState('Full');
    const [damages, setDamages] = useState<any[]>([]); // New damages being reported

    useEffect(() => {
        if (id) loadLastStatus();
    }, [id]);

    const loadLastStatus = async () => {
        try {
            const data = await FleetService.getLastInspection(Number(id));
            setLastInspection(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddDamage = (zone: string) => {
        const desc = prompt(`Describe el daño en: ${zone}`);
        if (desc) {
            setDamages([...damages, { zone, description: desc, severity: 'Medium' }]);
        }
    };

    const handleSubmit = async () => {
        try {
            const status = damages.length > 0 ? 'WithDamages' : 'OK';
            await FleetService.createInspection({
                vehicleId: id,
                type: 'StartShift',
                odometer,
                fuelLevel,
                status,
                newDamages: damages
            });
            alert('Relevo completado con éxito');
            navigate('/fleet');
        } catch (error) {
            alert('Error al guardar reporte');
        }
    };

    if (loading) return <div className="p-8 text-white">Cargando datos del vehículo...</div>;

    return (
        <div className="max-w-3xl mx-auto p-6 animate-fade-in-up pb-24">
            {/* Header */}
            <div className="mb-8 flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center">
                    <Bus className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white">Inspección de Unidad (Relevo)</h1>
                    <p className="text-slate-400">Paso {step} de 3</p>
                </div>
            </div>

            {/* STEP 1: Estado Anterior (La Verdad) */}
            {step === 1 && (
                <div className="space-y-6">
                    <div className="glass-panel p-6 border-l-4 border-l-blue-500">
                        <h3 className="text-lg font-bold text-white mb-4">Estado Reportado Anteriormente</h3>

                        {!lastInspection ? (
                            <div className="text-slate-400 italic">No hay registros previos. Vehículo presuntamente OK.</div>
                        ) : (
                            <div>
                                <div className="text-sm text-slate-400 mb-4">
                                    Último reporte por: <span className="text-white">{lastInspection.user?.fullName}</span> hace unos días.
                                </div>

                                {lastInspection.damages?.length === 0 ? (
                                    <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 p-3 rounded-lg">
                                        <CheckCircle className="w-5 h-5" /> Sin daños reportados previamente.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {lastInspection.damages.map((d: any) => (
                                            <div key={d.id} className="flex items-center gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700">
                                                <AlertTriangle className="w-5 h-5 text-orange-400" />
                                                <div>
                                                    <div className="text-white font-medium">{d.zone}</div>
                                                    <div className="text-sm text-slate-400">{d.description}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <button onClick={() => setStep(2)} className="btn btn-primary w-full py-4 text-lg">
                        Continuar <ArrowRight className="w-5 h-5 ml-2" />
                    </button>
                </div>
            )}

            {/* STEP 2: Nueva Inspección */}
            {step === 2 && (
                <div className="space-y-6">
                    <h3 className="text-lg font-bold text-white">¿Cómo recibes la unidad?</h3>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm text-slate-400">Odómetro (Km)</label>
                            <input
                                type="number"
                                className="input-field w-full"
                                value={odometer}
                                onChange={e => setOdometer(e.target.value)}
                                placeholder="Ej. 150230"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm text-slate-400">Combustible</label>
                            <select
                                className="input-field w-full"
                                value={fuelLevel}
                                onChange={e => setFuelLevel(e.target.value)}
                            >
                                <option value="Full">Lleno (Full)</option>
                                <option value="3/4">3/4 de Tanque</option>
                                <option value="1/2">Medio Tanque</option>
                                <option value="1/4">1/4 (Reserva)</option>
                            </select>
                        </div>
                    </div>

                    <div className="border-t border-slate-700 pt-6">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-white font-medium">Reportar Nuevos Daños</h4>
                            <span className="text-xs text-slate-500">Toca para agregar</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {['Frente', 'Atrás', 'Lateral Izq', 'Lateral Der', 'Interior', 'Ruedas'].map((zone) => (
                                <button
                                    key={zone}
                                    onClick={() => handleAddDamage(zone)}
                                    className="p-4 bg-slate-800 hover:bg-slate-700 rounded-xl border border-dashed border-slate-600 hover:border-red-500 transition-colors flex flex-col items-center gap-2"
                                >
                                    <Camera className="w-6 h-6 text-slate-400" />
                                    <span className="text-sm text-slate-300">{zone}</span>
                                </button>
                            ))}
                        </div>

                        {/* Lista de daños nuevos reportados ahora */}
                        {damages.length > 0 && (
                            <div className="mt-6 space-y-2">
                                <h5 className="text-red-400 text-sm font-bold uppercase tracking-wider">Nuevos Daños Detectados:</h5>
                                {damages.map((d, i) => (
                                    <div key={i} className="flex justify-between items-center bg-red-900/10 border border-red-500/20 p-2 rounded px-3">
                                        <span className="text-white text-sm">[{d.zone}] {d.description}</span>
                                        <button onClick={() => setDamages(damages.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-white">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-4">
                        <button onClick={() => setStep(1)} className="flex-1 py-3 text-slate-400">Atrás</button>
                        <button onClick={handleSubmit} className="flex-1 btn btn-primary py-3">
                            Confirmar y Tomar Turno
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Necesario importar Trash2 para el componente (quick fix inline import)
import { Trash2 } from 'lucide-react';

export default InspectionForm;
