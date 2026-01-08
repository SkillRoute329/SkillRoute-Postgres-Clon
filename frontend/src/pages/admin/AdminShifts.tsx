import { useState, useEffect } from 'react';
import { ShiftService, type Shift } from '../../services/api';
import { PDFService } from '../../services/pdf';
import ShiftCard from '../../components/ShiftCard';
import EditShiftModal from '../../components/EditShiftModal';
import AssignShiftModal from '../../components/AssignShiftModal';
import { Search, Filter, FileText, Loader2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

const AdminShifts = () => {
    const activeTabState = useState<'Created' | 'Public' | 'Assigned'>('Created');
    const [activeTab, setActiveTab] = activeTabState;
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingShift, setEditingShift] = useState<Shift | null>(null);
    const [assigningShiftId, setAssigningShiftId] = useState<number | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'reject', id: number } | null>(null);

    useEffect(() => {
        loadShifts();
    }, []);

    const loadShifts = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await ShiftService.getAll();
            setShifts(data || []);
            return data || [];
        } catch (error) {
            console.error('Error loading shifts', error);
            setError('No se pudieron cargar los turnos. Por favor, verifique su conexión.');
            setShifts([]);
            return [];
        } finally {
            setIsLoading(false);
        }
    };

    const handleAction = async (action: string, id: number) => {
        const shift = shifts.find(s => s.id === id);
        if (!shift) return;

        if (action === 'approve') {
            if (shift.transformaFacil) {
                const discount = prompt('Este turno es TransformaFácil. Ingrese el monto del descuento para el administrador:', '200');
                if (discount !== null) {
                    shift.transformaFacilDiscount = Number(discount);
                    shift.totalValue = Number(shift.totalValue) - shift.transformaFacilDiscount; // Apply discount to total
                }
            }
            await ShiftService.publish(id);
            alert('Turno aprobado y publicado.');
            loadShifts();
        }

        if (action === 'reject') {
            setConfirmAction({ type: 'reject', id });
        }

        if (action === 'delete') {
            setConfirmAction({ type: 'delete', id });
        }

        if (action === 'edit') {
            setEditingShift(shift);
        }

        if (action === 'assign') {
            setAssigningShiftId(id);
        }
    };

    const handleAssignShift = async (userId: number) => {
        if (assigningShiftId) {
            try {
                await ShiftService.assign(assigningShiftId, userId);
                alert('Turno asignado exitosamente.');
                loadShifts();
            } catch (error: any) {
                alert(error.message || 'Error al asignar el turno.');
            }
        }
    };

    const executeConfirmAction = async () => {
        if (!confirmAction) return;

        try {
            await ShiftService.delete(confirmAction.id);
            alert(confirmAction.type === 'reject' ? 'Turno rechazado y eliminado.' : 'Turno eliminado exitosamente.');
            loadShifts();
        } catch (error) {
            console.error('Error deleting shift:', error);
            alert('Error al procesar la solicitud.');
        } finally {
            setConfirmAction(null);
        }
    };

    // Search State
    const [searchText, setSearchText] = useState('');

    const filteredShifts = shifts.filter(s => {
        const matchesTab = s.status === activeTab;
        const search = searchText.toLowerCase();

        if (!searchText) return matchesTab;

        const matchesSearch =
            s.serviceNumber?.toLowerCase().includes(search) ||
            s.carNumber?.toLowerCase().includes(search) ||
            s.assigneeName?.toLowerCase().includes(search) ||
            s.assigneeInternalNumber?.includes(search) ||
            s.creatorName?.toLowerCase().includes(search) ||
            s.line?.toLowerCase().includes(search);

        return matchesTab && matchesSearch;
    });

    const TabButton = ({ name, label, count }: { name: string, label: string, count: number }) => (
        <button
            onClick={() => setActiveTab(name as any)}
            className={clsx(
                "pb-4 px-4 text-sm font-medium transition-all relative",
                activeTab === name
                    ? "text-primary-400"
                    : "text-slate-400 hover:text-white"
            )}
        >
            <span>{label}</span>
            <span className={clsx(
                "ml-2 text-xs py-0.5 px-2 rounded-full",
                activeTab === name ? "bg-primary-500/20 text-primary-300" : "bg-slate-800 text-slate-500"
            )}>
                <span>{count}</span>
            </span>
            {activeTab === name && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary-500 rounded-t-full"></span>
            )}
        </button>
    );

    // State for PDF Automation
    const [autoDownload, setAutoDownload] = useState(false);
    const [downloadInterval, setDownloadInterval] = useState(60); // minutes
    const [lastDownloadTime, setLastDownloadTime] = useState<number>(Date.now());

    // Load automation settings from localStorage
    useEffect(() => {
        const storedAuto = localStorage.getItem('admin_pdf_auto');
        const storedInterval = localStorage.getItem('admin_pdf_interval');
        if (storedAuto) setAutoDownload(storedAuto === 'true');
        if (storedInterval) setDownloadInterval(Number(storedInterval));
    }, []);

    // Save automation settings
    useEffect(() => {
        localStorage.setItem('admin_pdf_auto', String(autoDownload));
        localStorage.setItem('admin_pdf_interval', String(downloadInterval));
    }, [autoDownload, downloadInterval]);

    // Automation Logic
    useEffect(() => {
        let intervalId: any;

        if (autoDownload && downloadInterval > 0) {
            const checkAndDownload = async () => {
                const now = Date.now();
                const timeSinceLast = (now - lastDownloadTime) / 1000 / 60; // minutes

                if (timeSinceLast >= downloadInterval) {

                    // Fetch fresh data
                    const freshData = await loadShifts();

                    // Filter only today's shifts
                    const today = new Date().toLocaleDateString();
                    const todaysShifts = freshData.filter(s => new Date(s.date).toLocaleDateString() === today);

                    if (todaysShifts.length > 0) {
                        PDFService.generateDailyReport(todaysShifts, today);
                        setLastDownloadTime(now);

                    }
                }
            };

            // Check every minute
            intervalId = setInterval(checkAndDownload, 60000);
        }

        return () => clearInterval(intervalId);
    }, [autoDownload, downloadInterval, lastDownloadTime]); // removed shifts from dependency to avoid loop if loadShifts changes state, though we are using freshData locally

    const handleManualDownload = () => {
        const today = new Date().toLocaleDateString();
        // Allow downloading filtered list OR all today's lists. Use filtered for manual to respect tabs? 
        // User requested "de todos los movimientos", so let's offer a general download.
        // We will prioritize downloading ALL of TODAY's movements regardless of tab.
        const todaysShifts = shifts.filter(s => new Date(s.date).toLocaleDateString() === today);

        if (todaysShifts.length > 0) {
            PDFService.generateDailyReport(todaysShifts, today);
        } else {
            // Fallback to current view if "today" is empty? Or just alert.
            alert('No hay movimientos con fecha de hoy para generar el reporte general.');
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Header */}
            {/* Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight"><span>Gestión de Turnos</span></h1>
                    <p className="text-slate-400"><span>Administra, aprueba y asigna turnos.</span></p>
                </div>

                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center bg-slate-800/50 p-3 rounded-2xl border border-slate-700/50 w-full xl:w-auto">

                    {/* Automation Controls */}
                    <div className="flex items-center justify-between md:justify-start gap-2 px-2 border-b md:border-b-0 md:border-r border-slate-700 md:mr-2 pb-2 md:pb-0">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="autoPDF"
                                checked={autoDownload}
                                onChange={(e) => setAutoDownload(e.target.checked)}
                                className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-primary-500 focus:ring-primary-500/50"
                            />
                            <label htmlFor="autoPDF" className="text-sm text-slate-300 cursor-pointer select-none font-medium">
                                Auto PDF
                            </label>
                        </div>

                        {autoDownload && (
                            <div className="flex items-center gap-1 animate-fade-in">
                                <input
                                    type="number"
                                    min="1"
                                    value={downloadInterval}
                                    onChange={(e) => setDownloadInterval(Number(e.target.value))}
                                    className="w-16 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-sm text-center focus:border-primary-500 outline-none"
                                />
                                <span className="text-xs text-slate-400">min</span>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 w-full">
                        <button
                            onClick={handleManualDownload}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl transition-all shadow-lg shadow-primary-900/20 border border-primary-500 font-bold whitespace-nowrap"
                            title="Descargar Reporte General del Día"
                        >
                            <FileText className="w-5 h-5" />
                            <span>Descargar General</span>
                        </button>

                        <div className="relative group flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-primary-400" />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl pl-9 pr-4 py-2 text-sm focus:border-primary-500 focus:outline-none transition-all"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            {confirmAction && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl scale-100 animate-scale-in">
                        <h3 className="text-xl font-bold text-white mb-2">
                            <span>{confirmAction.type === 'reject' ? '¿Rechazar Turno?' : '¿Eliminar Turno?'}</span>
                        </h3>
                        <p className="text-slate-400 mb-6">
                            <span>{confirmAction.type === 'reject'
                                ? '¿Estás seguro de que deseas rechazar y eliminar este turno?'
                                : 'Esta acción eliminará el turno permanentemente y no se puede deshacer.'}</span>
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmAction(null)}
                                className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors font-medium"
                            >
                                <span>Cancelar</span>
                            </button>
                            <button
                                onClick={executeConfirmAction}
                                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/20 transition-all font-bold"
                            >
                                <span>{confirmAction.type === 'reject' ? 'Sí, Rechazar' : 'Sí, Eliminar'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="border-b border-slate-800 flex gap-4">
                <TabButton name="Created" label="Pendientes" count={shifts.filter(s => s.status === 'Created').length} />
                <TabButton name="Public" label="Públicos" count={shifts.filter(s => s.status === 'Public').length} />
                <TabButton name="Assigned" label="Asignados" count={shifts.filter(s => s.status === 'Assigned').length} />
            </div>

            {/* Content */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 mb-6 flex items-center gap-3 animate-fade-in">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                    <div className="flex-1">
                        <h3 className="text-red-400 font-bold text-sm">Error de Conexión</h3>
                        <p className="text-red-300/80 text-sm">{error}</p>
                    </div>
                    <button onClick={loadShifts} className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-xs font-bold transition-colors">
                        Reintentar
                    </button>
                </div>
            )}

            {isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-500 animate-fade-in">
                    <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-4" />
                    <span className="text-sm font-medium text-slate-400 animate-pulse">Cargando turnos en tiempo real...</span>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredShifts.length > 0 ? (
                        filteredShifts.map(shift => (
                            <ShiftCard
                                key={shift.id}
                                shift={shift}
                                variant="admin"
                                onAction={handleAction}
                            />
                        ))
                    ) : (
                        <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-2xl bg-slate-900/50">
                            <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-4 text-slate-600">
                                <Filter className="w-6 h-6" />
                            </div>
                            <p><span>No hay turnos en esta categoría</span></p>
                        </div>
                    )}
                </div>
            )}

            {/* Edit Modal */}
            {editingShift && (
                <EditShiftModal
                    shift={editingShift}
                    onClose={() => setEditingShift(null)}
                    onSave={() => {
                        loadShifts();
                        setEditingShift(null);
                    }}
                />
            )}

            {/* Assign Modal */}
            {assigningShiftId && (
                <AssignShiftModal
                    onClose={() => setAssigningShiftId(null)}
                    onAssign={handleAssignShift}
                    currentAssigneeId={shifts.find(s => s.id === assigningShiftId)?.assignedTo}
                />
            )}
        </div>
    );
};

export default AdminShifts;
