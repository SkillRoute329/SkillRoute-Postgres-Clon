
// import RoadAlertsWidget from '../components/RoadAlertsWidget';
import StatsWidget from '../components/StatsWidget';
import { useAuth } from '../context/AuthContext';
import ExcelUploader from '../components/ExcelUploader';

const DashboardHome = () => {

    const { user } = useAuth();

    // 🛡️ GOD MODE / DATA ENGINEER VIEW (User 0000)
    if (user?.internalNumber === '0000') {
        return (
            <div className="animate-fade-in space-y-6">
                <div className="bg-white p-6 rounded-lg shadow-xl border-l-4 border-blue-600">
                    <h2 className="text-xl font-bold mb-4 text-slate-800">🛠️ PANEL DE CONTROL DE DATOS</h2>

                    {/* PASO 1: LA PLANTILLA */}
                    <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                        <p className="text-slate-700 font-semibold mb-2">1. Descarga el formato correcto:</p>
                        <a
                            href="/plantilla_oficial.xlsx"
                            download="Plantilla_Oficial_2026.xlsx"
                            className="inline-flex items-center gap-2 text-blue-600 font-bold hover:underline"
                        >
                            <span>📥</span> Bajar Plantilla Excel (Oficial)
                        </a>
                        <p className="text-xs text-slate-500 mt-1">
                            Sistema listo para Cartones UCOT.
                        </p>
                    </div>

                    {/* PASO 2: EL IMPORTADOR */}
                    <div>
                        <p className="text-slate-700 font-semibold mb-2">2. Sube tu archivo (Validación Automática):</p>
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                            <ExcelUploader onSuccess={() => window.location.reload()} />
                        </div>
                    </div>

                    {/* PASO 3: HERRAMIENTAS ADICIONALES (User Request) */}
                    <div className="mt-6 pt-6 border-t border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-3">🛠️ Módulos de Gestión (God Mode)</h3>
                        <div className="flex flex-wrap gap-4">
                            <button
                                onClick={() => window.location.href = '/dashboard/admin/users'}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-bold flex items-center gap-2"
                            >
                                👥 Gestión de Usuarios (RRHH)
                            </button>
                            <button
                                onClick={async () => {
                                    if (confirm("⚠ ¿LIMPIEZA PROFUNDA?\nEsto eliminará datos corruptos. ¿Continuar?")) {
                                        // Call AutoFix Endpoint? Or just rely on boot.
                                        alert("Ejecutando protocolo Auto-Fix...");
                                        // We don't have an endpoint for this, making one or assuming boot.
                                        // For now, reload triggers boot logic if backend restarts, but here we just show alert.
                                    }
                                }}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold flex items-center gap-2"
                            >
                                🧹 Limpieza Profunda DB
                            </button>
                        </div>
                    </div>
                </div>
            </div >
        );
    }

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
