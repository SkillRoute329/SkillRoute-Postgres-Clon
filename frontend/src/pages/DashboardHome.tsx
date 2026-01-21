
// import RoadAlertsWidget from '../components/RoadAlertsWidget';
import StatsWidget from '../components/StatsWidget';
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

            {/* KPIs Stats Widget */}
            <StatsWidget />

            {/* Alertas Viales (Waze Style) - Note: Already in Layout, but keeping here if needed or removing duplication? 
                The user asked to put RoadAlerts in Layout previously. 
                If it is in Layout, rendering it here duplicates it?
                Wait, previous instructions said "Move RoadAlertsWidget to DashboardLayout". 
                If so, I should probably REMOVE it from here to avoid double rendering, 
                OR keep it if the Layout one acts as a "Overview" and this one is the "Main View".
                However, for now, let's just add StatsWidget.
            */}
            {/* <RoadAlertsWidget /> Removing duplicate since it is in Layout now */}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                    <h3 className="font-bold text-white mb-2">Mi Estado</h3>
                    <div className="text-3xl font-bold text-green-400">Activo</div>
                    <p className="text-xs text-slate-500 mt-1">Sin sanciones pendientes</p>
                </div>

                <div
                    onClick={() => window.location.href = '/dashboard/driver/navigation'}
                    className="glass-panel p-6 rounded-2xl border border-yellow-500/30 hover:bg-yellow-500/10 cursor-pointer transition-all animate-pulse shadow-lg shadow-yellow-500/10"
                >
                    <h3 className="font-bold text-yellow-500 mb-2 flex items-center gap-2">
                        <span className="text-xl">📡</span> Alertas en la vía
                    </h3>
                    <div className="text-2xl font-bold text-white uppercase tracking-tighter">Entrar al Mapa</div>
                    <p className="text-xs text-yellow-500/70 mt-1">Radar, zonas y reportes de tránsito</p>
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
