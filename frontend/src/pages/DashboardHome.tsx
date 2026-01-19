
import RoadAlertsWidget from '../components/RoadAlertsWidget';
import { useAuth } from '../context/AuthContext';

const DashboardHome = () => {
    const { user } = useAuth();

    return (
        <div className="animate-fade-in space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">
                        Hola, <span className="text-primary-400">{user?.firstName || 'Usuario'}</span>
                    </h1>
                    <p className="text-slate-400">Bienvenido al panel de operaciones.</p>
                </div>
            </div>

            {/* Alertas Viales (Waze Style) */}
            <RoadAlertsWidget />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                    <h3 className="font-bold text-white mb-2">Mi Estado</h3>
                    <div className="text-3xl font-bold text-green-400">Activo</div>
                    <p className="text-xs text-slate-500 mt-1">Sin sanciones pendientes</p>
                </div>

                {/* Placeholder for more widgets */}
                <div className="glass-panel p-6 rounded-2xl border border-slate-800 opacity-50">
                    <h3 className="font-bold text-white mb-2">Próximo Turno</h3>
                    <div className="text-lg text-slate-400">Sin asignar</div>
                </div>
            </div>
        </div>
    );
};

export default DashboardHome;
