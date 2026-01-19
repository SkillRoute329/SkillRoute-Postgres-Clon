import React, { useEffect, useState } from 'react';
import {
    AlertTriangle, CheckCircle, Clock, Plus, Search,
    Settings, Briefcase
} from 'lucide-react';
import { MaintenanceService, FleetService, DepartmentService } from '../../services/api';
import clsx from 'clsx';

const STATUS_CONFIG: any = {
    'PENDING': { label: 'Enviado', color: 'bg-yellow-500/20 text-yellow-400', icon: Clock },
    'RECEIVED': { label: 'Recibido', color: 'bg-blue-500/20 text-blue-400', icon: CheckCircle },
    'IN_PROCESS': { label: 'En Proceso', color: 'bg-indigo-500/20 text-indigo-400', icon: Settings },
    'SCHEDULED': { label: 'Programado', color: 'bg-purple-500/20 text-purple-400', icon: Clock },
    'DISCARDED': { label: 'Descartado', color: 'bg-slate-500/20 text-slate-400', icon: AlertTriangle },
    'COMPLETED': { label: 'Finalizado', color: 'bg-green-500/20 text-green-400', icon: CheckCircle }
};

const MaintenanceDashboard = () => {
    const [reports, setReports] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterCheck, setFilterCheck] = useState('all'); // all, pending, process

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newReport, setNewReport] = useState({
        vehicleId: '',
        departmentId: '',
        title: '',
        description: '',
        priority: 'NORMAL',
        photoUrl: ''
    });

    useEffect(() => {
        // Initial Fetch
        const init = async () => {
            setLoading(true);
            try {
                const [vData, dData] = await Promise.all([
                    FleetService.getVehicles(),
                    DepartmentService.getAll()
                ]);
                setVehicles(vData);
                setDepartments(dData);
                fetchReports();
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const fetchReports = async () => {
        try {
            const data = await MaintenanceService.getAll({
                reportStatus: filterCheck !== 'all' ? filterCheck : undefined
            });
            setReports(data);
        } catch (e) { console.error(e); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await MaintenanceService.create(newReport);
            setIsModalOpen(false);
            fetchReports();
            // Reset form
            setNewReport({
                vehicleId: '',
                departmentId: '',
                title: '',
                description: '',
                priority: 'NORMAL',
                photoUrl: ''
            });
        } catch (error) {
            alert('Error al crear reporte');
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Settings className="w-8 h-8 text-primary-500" />
                        Mantenimiento y Denuncias
                    </h1>
                    <p className="text-slate-400">Gestión de novedades, roturas y mantenimientos de flota.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" /> Nueva Denuncia
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {['all', 'PENDING', 'IN_PROCESS', 'COMPLETED'].map(status => (
                    <button
                        key={status}
                        onClick={() => setFilterCheck(status)}
                        className={clsx(
                            "px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                            filterCheck === status
                                ? "bg-primary-600 text-white"
                                : "bg-slate-800 text-slate-400 hover:text-white"
                        )}
                    >
                        {status === 'all' ? 'Todos' : STATUS_CONFIG[status]?.label || status}
                    </button>
                ))}
            </div>

            {/* Reports Grid */}
            {loading ? (
                <div className="text-center py-12 text-slate-400">Cargando reportes...</div>
            ) : reports.length === 0 ? (
                <div className="text-center py-12 bg-slate-900 rounded-xl border border-slate-800">
                    <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-white">Sin Novedades</h3>
                    <p className="text-slate-400">No hay reportes que coincidan con los filtros.</p>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {reports.map((report) => (
                        <div key={report.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors flex flex-col">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="font-bold text-xl text-white">Unit {report.vehicle?.internalNumber}</div>
                                    {report.vehicle?.plate && <div className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{report.vehicle.plate}</div>}
                                </div>
                                <div className={clsx("px-2 py-1 rounded text-xs font-bold flex items-center gap-1", STATUS_CONFIG[report.status]?.color)}>
                                    {STATUS_CONFIG[report.status]?.label || report.status}
                                </div>
                            </div>

                            <h3 className="font-medium text-white mb-1 truncate">{report.title}</h3>
                            <p className="text-sm text-slate-400 line-clamp-2 mb-4 flex-1">{report.description}</p>

                            <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-800 text-xs text-slate-500">
                                <div className="flex items-center gap-1">
                                    <Briefcase className="w-3 h-3" />
                                    {report.department?.name || 'General'}
                                </div>
                                <div>
                                    {new Date(report.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* New Report Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-800 shadow-xl p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white">Nueva Denuncia / Reporte</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                                <XIcon className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Vehículo / Coche</label>
                                    <select
                                        className="input-field w-full"
                                        value={newReport.vehicleId}
                                        onChange={e => setNewReport({ ...newReport, vehicleId: e.target.value })}
                                        required
                                    >
                                        <option value="">Seleccionar...</option>
                                        {vehicles.map(v => (
                                            <option key={v.id} value={v.id}>{v.internalNumber} - {v.plate}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Área Destino</label>
                                    <select
                                        className="input-field w-full"
                                        value={newReport.departmentId}
                                        onChange={e => setNewReport({ ...newReport, departmentId: e.target.value })}
                                    >
                                        <option value="">General / Sin Asignar</option>
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Título Breve</label>
                                <input
                                    type="text"
                                    className="input-field w-full"
                                    placeholder="Ej. Luz trasera quemada, Aire no enfría"
                                    value={newReport.title}
                                    onChange={e => setNewReport({ ...newReport, title: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Descripción Detallada</label>
                                <textarea
                                    className="input-field w-full"
                                    rows={3}
                                    placeholder="Describa el problema..."
                                    value={newReport.description}
                                    onChange={e => setNewReport({ ...newReport, description: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Prioridad</label>
                                <div className="flex gap-4">
                                    {['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map(p => (
                                        <label key={p} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="priority"
                                                value={p}
                                                checked={newReport.priority === p}
                                                onChange={e => setNewReport({ ...newReport, priority: e.target.value })}
                                                className="accent-primary-500"
                                            />
                                            <span className="text-sm text-slate-300 capitalize">{p.toLowerCase()}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2 text-slate-400 hover:text-white">Cancelar</button>
                                <button type="submit" className="flex-1 btn btn-primary py-2">Crear Reporte</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

// Helper Icon for Modal Close
const XIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
);

export default MaintenanceDashboard;
