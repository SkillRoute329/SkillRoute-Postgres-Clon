
import React, { useState, useEffect } from 'react';
import { Bus, Plus, AlertCircle } from 'lucide-react';
import { FleetService } from '../../services/api';

const VehicleList = () => {
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({ carNumber: '', plate: '', brand: '', model: '' });

    useEffect(() => {
        loadVehicles();
    }, []);

    const loadVehicles = async () => {
        try {
            const data = await FleetService.getVehicles();
            setVehicles(data);
        } catch (error) {
            console.error(error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await FleetService.createVehicle(formData);
            setShowModal(false);
            setFormData({ carNumber: '', plate: '', brand: '', model: '' });
            loadVehicles(); // Reload list
        } catch (error) {
            alert('Error al crear vehículo');
        }
    };

    const [searchTerm, setSearchTerm] = useState('');

    const filteredVehicles = vehicles.filter(v =>
        (v.carNumber && v.carNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (v.plate && v.plate.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="p-6 max-w-7xl mx-auto animate-fade-in-up">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Control de Flota</h1>
                    <p className="text-slate-400">Gestiona las unidades y su estado actual.</p>
                </div>

                <div className="flex gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <input
                            type="text"
                            placeholder="Buscar por coche o matrícula..."
                            className="input-field w-full pl-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowModal(true)}
                        className="btn btn-primary flex items-center gap-2 whitespace-nowrap"
                    >
                        <Plus className="w-5 h-5" /> Nueva Unidad
                    </button>
                </div>
            </div>

            {/* Grid de Vehículos */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredVehicles.map((v) => (
                    <div key={v.id} className="glass-panel p-6 hover:border-primary-500/50 transition-colors group relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity">
                            <Bus className="w-24 h-24 text-white" />
                        </div>

                        <div className="relative z-10">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                                    <Bus className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">Coche {v.carNumber}</h3>
                                    <p className="text-sm text-slate-400">{v.brand || 'Marca'} {v.model || 'Modelo'}</p>
                                </div>
                            </div>

                            <div className="space-y-3 mb-6">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Matrícula:</span>
                                    <span className="text-slate-300 font-mono">{v.plate || '---'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Estado:</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20`}>
                                        {v.status === 'Active' ? 'Operativo' : v.status}
                                    </span>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-4 pt-4 border-t border-slate-800">
                                <a
                                    href={`/dashboard/fleet/inspect/${v.id}`}
                                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <AlertCircle className="w-4 h-4" /> Inspeccionar / Foto
                                </a>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal Crear */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
                    <div className="bg-slate-800 rounded-2xl w-full max-w-md p-6 border border-slate-700 shadow-xl animate-scale-in">
                        <h2 className="text-xl font-bold text-white mb-4">Registrar Nueva Unidad</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="text-sm text-slate-400">Número de Coche *</label>
                                <input
                                    required
                                    type="text"
                                    className="input-field w-full"
                                    placeholder="Ej. 105"
                                    value={formData.carNumber}
                                    onChange={e => setFormData({ ...formData, carNumber: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-slate-400">Marca</label>
                                    <input
                                        type="text"
                                        className="input-field w-full"
                                        placeholder="Mercedes"
                                        value={formData.brand}
                                        onChange={e => setFormData({ ...formData, brand: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-slate-400">Modelo</label>
                                    <input
                                        type="text"
                                        className="input-field w-full"
                                        placeholder="O500"
                                        value={formData.model}
                                        onChange={e => setFormData({ ...formData, model: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-sm text-slate-400">Matrícula</label>
                                <input
                                    type="text"
                                    className="input-field w-full"
                                    placeholder="STU-1234"
                                    value={formData.plate}
                                    onChange={e => setFormData({ ...formData, plate: e.target.value })}
                                />
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-2 text-slate-400 hover:text-white transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 btn btn-primary py-2"
                                >
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VehicleList;
