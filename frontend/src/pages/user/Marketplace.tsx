import { useState, useEffect } from 'react';
import { ShiftService, type Shift } from '../../services/api';
import ShiftCard from '../../components/ShiftCard';
import { Search, Info } from 'lucide-react';
import { getCurrentUser } from '../../utils/auth';

const Marketplace = () => {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadPublicShifts();
    }, []);

    const loadPublicShifts = async () => {
        setIsLoading(true);
        try {
            const data = await ShiftService.getAll();
            // Only show Public shifts
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
            await ShiftService.assign(id, user.id);
            alert('¡Turno tomado con éxito! Ahora puedes verlo en "Mis Turnos"');
            loadPublicShifts(); // Refresh
        } catch (error) {
            console.error('Error taking shift:', error);
            alert('Error al tomar el turno');
        }
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
                                onAction={(_, id) => handleTakeShift(id)}
                            />
                        ))
                    ) : (
                        <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-2xl bg-slate-900/50">
                            <p className="text-lg"><span>No hay turnos disponibles en este momento.</span></p>
                            <p className="text-sm mt-2 opacity-70"><span>¡Vuelve a consultar más tarde!</span></p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Marketplace;
