import { useState, useEffect } from 'react';
import { ShiftService, type Shift } from '../../services/api';
import ShiftCard from '../../components/ShiftCard';
import { Search, Info } from 'lucide-react';
import { getCurrentUser } from '../../utils/auth';
import { generateShiftTicket } from '../../utils/pdfGenerator';

const Marketplace = () => {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [confirmationShift, setConfirmationShift] = useState<Shift | null>(null);

    useEffect(() => {
        loadPublicShifts();
    }, []);

    const loadPublicShifts = async () => {
        setIsLoading(true);
        try {
            const data = await ShiftService.getAll();
            setShifts(data.filter(s => s.status === 'Public'));
        } catch (error) {
            console.error('Error loading shifts:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleTakeShift = async (id: number) => {
        const user = getCurrentUser();
        if (!user) {
            alert('Debes iniciar sesión para tomar un turno');
            return;
        }

        try {
            const shiftToTake = shifts.find(s => s.id === id);
            await ShiftService.assign(id, user.id);
            if (shiftToTake) {
                setConfirmationShift(shiftToTake);
            } else {
                loadPublicShifts();
            }
        } catch (error) {
            console.error('Error taking shift:', error);
            alert('Error al tomar el turno');
        }
    };

    const handleDownloadPdf = () => {
        if (confirmationShift) {
            const user = getCurrentUser();
            generateShiftTicket(confirmationShift, user);
            setConfirmationShift(null);
            loadPublicShifts();
        }
    };

    const handleCloseModal = () => {
        setConfirmationShift(null);
        loadPublicShifts();
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight"><span>Mercado de Turnos</span></h1>
                    <p className="text-slate-400"><span>Encuentra y toma turnos disponibles publicados por compañeros.</span></p>
                </div>

                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-primary-400" />
                    <input
                        type="text"
                        placeholder="Filtrar por línea, coche..."
                        className="bg-slate-900 border border-slate-700 text-white rounded-xl pl-9 pr-4 py-2 text-sm focus:border-primary-500 focus:outline-none w-full md:w-64 transition-all"
                    />
                </div>
            </div>

            <div className="bg-primary-900/10 border border-primary-500/20 p-4 rounded-xl flex items-start gap-3">
                <Info className="w-5 h-5 text-primary-400 mt-0.5 shrink-0" />
                <p className="text-sm text-primary-200">
                    <span>Estos turnos han sido aprobados por el administrador para que cualquier usuario pueda tomarlos. Al tomar uno, se sumará a tu historial y balance.</span>
                </p>
            </div>

            {isLoading ? (
                <div className="text-center py-20 text-slate-500 animate-pulse font-medium">
                    <span>Buscando turnos disponibles...</span>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {shifts.length > 0 ? (
                        shifts.map(shift => (
                            <ShiftCard
                                key={shift.id}
                                shift={shift}
                                variant="public"
                                onAction={(action, id) => {
                                    if (action === 'take') handleTakeShift(id);
                                }}
                            />
                        ))
                    ) : (
                        <div className="col-span-full text-center py-20 bg-slate-900/50 rounded-2xl border border-slate-800">
                            <p className="text-slate-500"><span>No hay turnos disponibles en el mercado actualmente.</span></p>
                        </div>
                    )}
                </div>
            )}

            {confirmationShift && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-scale-in">
                        <div className="text-center">
                            <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Search className="w-10 h-10 text-green-500" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2"><span>¡Turno Asignado!</span></h2>
                            <p className="text-slate-400 mb-8"><span>El turno ha sido correctamente asignado a tu perfil. ¿Deseas descargar el comprobante ahora?</span></p>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handleDownloadPdf}
                                    className="w-full bg-primary-600 hover:bg-primary-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-primary-900/20 flex items-center justify-center gap-2"
                                >
                                    <span>Descargar Comprobante</span>
                                </button>
                                <button
                                    onClick={handleCloseModal}
                                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-4 rounded-2xl transition-all"
                                >
                                    <span>Más tarde</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Marketplace;
