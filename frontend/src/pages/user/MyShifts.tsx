import { useState, useEffect } from 'react';
import { ShiftService, type Shift } from '../../services/api';
import ShiftCard from '../../components/ShiftCard';
import { Clock, AlertCircle } from 'lucide-react';
import { getCurrentUser } from '../../utils/auth';

const MyShifts = () => {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [deleteId, setDeleteId] = useState<number | null>(null);

    useEffect(() => {
        loadShifts();
    }, []);

    const loadShifts = async () => {
        try {
            const allShifts = await ShiftService.getAll();
            const currentUser = getCurrentUser();

            if (!currentUser) {
                setError('No se pudo identificar al usuario actual');
                return;
            }

            // Filter shifts assigned to current user OR created by current user
            const myShifts = allShifts.filter(s =>
                // Assigned to me
                String(s.assignedTo) === String(currentUser.id) ||
                String(s.assignedTo) === String(currentUser.internalNumber) ||
                // Created by me (and probably pending)
                String(s.createdBy) === String(currentUser.id)
            );

            setShifts(myShifts);
        } catch (err) {
            console.error('Error loading shifts:', err);
            setError('Error al cargar sus turnos');
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (action: string, id: number) => {
        if (action === 'delete') {
            setDeleteId(id); // Open Modal
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;

        try {
            await ShiftService.delete(deleteId);
            setDeleteId(null);
            await loadShifts();
        } catch (err) {
            console.error('Error deleting shift:', err);
            alert('Error al eliminar el turno. Inténtalo de nuevo.');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in-up relative">
            {/* Delete Confirmation Modal */}
            {deleteId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl scale-100 animate-scale-in">
                        <h3 className="text-xl font-bold text-white mb-2">¿Eliminar Turno?</h3>
                        <p className="text-slate-400 mb-6">Esta acción no se puede deshacer. ¿Estás seguro de que deseas continuar?</p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteId(null)}
                                className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/20 transition-all font-bold"
                            >
                                Sí, Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div>
                <h1 className="text-2xl font-bold text-white"><span>Mis Turnos</span></h1>
                <p className="text-slate-400"><span>Historial de turnos asignados y realizados</span></p>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-500">
                    <AlertCircle className="w-5 h-5" />
                    <p><span>{error}</span></p>
                </div>
            )}

            {shifts.length === 0 ? (
                <div className="text-center py-20 bg-slate-800/30 rounded-2xl border border-slate-800 dashed border-2">
                    <Clock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-slate-400"><span>No tienes turnos asignados</span></h3>
                    <p className="text-slate-500 mt-2"><span>Los turnos que tomes aparecerán aquí.</span></p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {shifts.map(shift => (
                        <ShiftCard
                            key={shift.id}
                            shift={shift}
                            onAction={handleAction}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default MyShifts;
