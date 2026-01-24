import React, { useEffect, useState } from 'react';
import {
    AlertTriangle, CheckCircle, Clock, Plus, Search,
    Settings, Briefcase, Trash2, Camera
} from 'lucide-react';
import { MaintenanceService, FleetService, DepartmentService, UniversalService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import clsx from 'clsx';

const STATUS_CONFIG: any = {
    'ENVIADO': { label: 'Enviado', color: 'bg-yellow-500/20 text-yellow-400', icon: Clock },
    'RECIBIDO': { label: 'Recibido', color: 'bg-blue-500/20 text-blue-400', icon: CheckCircle },
    'EN_PROCESO': { label: 'En Proceso', color: 'bg-indigo-500/20 text-indigo-400', icon: Settings },
    'PROGRAMADO': { label: 'Programado', color: 'bg-purple-500/20 text-purple-400', icon: Clock },
    'DESCARTADO': { label: 'Descartado', color: 'bg-slate-500/20 text-slate-400', icon: AlertTriangle },
    'FINALIZADO': { label: 'Finalizado', color: 'bg-green-500/20 text-green-400', icon: CheckCircle }
};

const MaintenanceDashboard = () => {
    const [reports, setReports] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterCheck, setFilterCheck] = useState('all'); // all, pending, process

    // Create Report Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newReport, setNewReport] = useState({
        vehicleId: '',
        departmentId: '',
        title: '',
        description: '',
        priority: 'NORMAL',
        photoUrl: '', // Will keep compatibility
        evidencePhotos: '' // Base64
    });

    // Solve/Close Ticket Modal State
    const [processModalOpen, setProcessModalOpen] = useState(false);
    const [auditReport, setAuditReport] = useState<any>(null);
    const [solution, setSolution] = useState('');
    const [availableParts, setAvailableParts] = useState<any[]>([]);
    const [selectedPartId, setSelectedPartId] = useState('');
    const [selectedQty, setSelectedQty] = useState(1);
    const [usedParts, setUsedParts] = useState<any[]>([]); // { partId, sku, description, quantity }

    useEffect(() => {
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

                // Fetch Parts for autocomplete
                UniversalService.list('parts', 1, 1000).then((res: any) => {
                    setAvailableParts(res.data || []);
                }).catch(() => console.error("Error loading parts"));
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
                status: filterCheck !== 'all' ? filterCheck : undefined
            });
            setReports(data);
        } catch (e) { console.error(e); }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Optimistic Loading State or dedicated upload state could be used
            // but we reuse the main form since it blocks submit usually
            // Here we just fire and forget, blocking via async if we wanted.

            try {
                const res = await MaintenanceService.uploadFile(file);
                if (res.url) {
                    setNewReport({ ...newReport, evidencePhotos: res.url });
                    // Optional: Toast success
                }
            } catch (error) {
                console.error("Upload failed", error);
                alert("Error al subir imagen");
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await MaintenanceService.create(newReport);
            setIsModalOpen(false);
            fetchReports();
            setNewReport({
                vehicleId: '',
                departmentId: '',
                title: '',
                description: '',
                priority: 'NORMAL',
                photoUrl: '',
                evidencePhotos: ''
            });
        } catch (error) {
            alert('Error al crear reporte');
        }
    };

    const handleOpenProcess = (report: any) => {
        setAuditReport(report);
        setSolution('');
        setUsedParts([]);
        setProcessModalOpen(true);
    };

    const handleAddPart = () => {
        if (!selectedPartId) return;
        const part = availableParts.find(p => String(p.id) === selectedPartId);
        if (!part) return;

        setUsedParts(prev => [...prev, {
            partId: part.id,
            sku: part.sku,
            description: part.description,
            quantity: selectedQty
        }]);

        setSelectedPartId('');
        setSelectedQty(1);
    };

    const handleRemovePart = (index: number) => {
        setUsedParts(prev => prev.filter((_, i) => i !== index));
    };

    // --- RBAC CHECK ---
    const { user } = useAuth(); // Import useAuth hook at top level first! This snippet assumes useAuth is imported.
    // However, I need to add useAuth import at top of file first.

    const handleCloseTicket = async () => {
        if (!auditReport) return;

        // RBAC: Only Admin/SuperAdmin/Encargado
        // Assuming 'Encargado' role exists or is mapped to Admin/SuperAdmin permissions for this module.
        // If strictly 'Encargado' is a role string:
        const authorizedRoles = ['Admin', 'SuperAdmin', 'Encargado'];
        if (!user || !authorizedRoles.includes(user.role)) {
            alert('Acceso Denegado: Solo el Encargado de Taller o Admin puede cerrar tickets.');
            return;
        }

        // VALIDATION: Mandatory Description
        if (!solution || solution.trim().length < 5) {
            alert('REQUISITO: Debe detallar la solución técnica aplicada par poder cerrar la incidencia.');
            return;
        }

        // Confirmation (Implicit in "Confirmar y Cerrar" button, but let's be double sure if critical)
        if (!confirm('¿Confirma que el vehículo está reparado y listo para operar?')) return;

        try {
            await MaintenanceService.closeTicket(auditReport.id, {
                solution,
                partsUsed: usedParts
            });
            setProcessModalOpen(false);
            fetchReports();
            alert("Ticket cerrado correctamente. Stock actualizado.");
        } catch (error) {
            console.error(error);
            alert("Error al cerrar ticket");
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
                {['all', 'ENVIADO', 'EN_PROCESO', 'FINALIZADO'].map(status => (
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
                        <div key={report.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors flex flex-col relative group">

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

                            {/* Process Button Overlay */}
                            {report.status !== 'FINALIZADO' && (
                                <div className="absolute top-4 right-4">
                                    <button
                                        onClick={() => handleOpenProcess(report)}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Resolver / Cerrar Ticket"
                                    >
                                        <CheckCircle className="w-5 h-5" />
                                    </button>
                                </div>
                            )}

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

                            {/* Evidence Photo Upload */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-1 cursor-pointer flex items-center gap-2">
                                    <Camera className="w-4 h-4" />
                                    Foto de Evidencia
                                </label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="block w-full text-sm text-slate-400
                                        file:mr-4 file:py-2 file:px-4
                                        file:rounded-full file:border-0
                                        file:text-sm file:font-semibold
                                        file:bg-primary-600 file:text-white
                                        hover:file:bg-primary-500
                                    "
                                />
                                {newReport.evidencePhotos && (
                                    <div className="mt-2">
                                        <img src={newReport.evidencePhotos} alt="Preview" className="h-20 w-auto rounded border border-slate-700 object-cover" />
                                    </div>
                                )}
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

            {/* Process/Close Ticket Modal */}
            {processModalOpen && auditReport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-800 shadow-xl p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white">Cerrar Reparación</h2>
                            <button onClick={() => setProcessModalOpen(false)} className="text-slate-400 hover:text-white">
                                <XIcon className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                                <div className="text-sm font-bold text-white">Unit {auditReport.vehicle?.internalNumber} - {auditReport.title}</div>
                                <div className="text-xs text-slate-400">{auditReport.description}</div>
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Solución Aplicada</label>
                                <textarea
                                    className="input-field w-full"
                                    rows={3}
                                    placeholder="Detalla qué trabajo se realizó..."
                                    value={solution}
                                    onChange={e => setSolution(e.target.value)}
                                />
                            </div>

                            <div className="p-3 border border-slate-700 rounded-lg">
                                <label className="block text-sm font-bold text-slate-300 mb-2">Repuestos Utilizados</label>

                                <div className="flex gap-2 mb-3">
                                    <select
                                        className="input-field flex-1 text-xs"
                                        value={selectedPartId}
                                        onChange={e => setSelectedPartId(e.target.value)}
                                    >
                                        <option value="">Buscar repuesto...</option>
                                        {availableParts.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.sku} - {p.description} (Stock: {p.currentStock})
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        type="number"
                                        min="1"
                                        className="input-field w-16 text-center"
                                        value={selectedQty}
                                        onChange={e => setSelectedQty(Math.max(1, Number(e.target.value)))}
                                    />
                                    <button
                                        onClick={handleAddPart}
                                        disabled={!selectedPartId}
                                        className="bg-primary-600 px-3 rounded-lg text-white hover:bg-primary-500 disabled:opacity-50"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Parts List */}
                                <div className="space-y-2">
                                    {usedParts.map((part, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-slate-800 p-2 rounded text-sm">
                                            <div>
                                                <div className="text-white font-medium">{part.quantity}x {part.sku}</div>
                                                <div className="text-xs text-slate-400">{part.description}</div>
                                            </div>
                                            <button
                                                onClick={() => handleRemovePart(idx)}
                                                className="text-red-400 hover:text-red-300"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    {usedParts.length === 0 && <div className="text-xs text-slate-500 text-center py-2">No se usaron repuestos</div>}
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button onClick={() => setProcessModalOpen(false)} className="flex-1 py-2 text-slate-400 hover:text-white">Cancelar</button>
                                <button
                                    onClick={handleCloseTicket}
                                    className="flex-1 btn bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl font-bold shadow-lg"
                                >
                                    Confirmar y Cerrar
                                </button>
                            </div>
                        </div>
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
