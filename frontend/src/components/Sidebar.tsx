
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
    const { logout } = useAuth();
    const location = useLocation();

    return (
        <div className="h-screen w-64 bg-slate-900 text-white flex flex-col fixed left-0 top-0 overflow-y-auto z-50 border-r border-slate-800">
            <div className="p-4 text-center font-bold text-xl border-b border-slate-700 bg-slate-800/50">
                TRANSFORMA UCOT
            </div>

            {/* --- ZONA DE EMERGENCIA HARDCODED (WINDOWS SYNC FIX) --- */}
            <div className="bg-red-600 p-4 m-2 rounded shadow-lg animate-pulse border-2 border-white">
                <p className="font-bold text-xs mb-2 text-white text-center">🆘 ACCESOS DE EMERGENCIA</p>
                <nav className="flex flex-col space-y-2">
                    <a href="/dashboard/admin/employees" className="bg-white text-red-600 p-2 rounded text-center text-xs font-black hover:bg-slate-100 transition-colors">
                        👥 GESTIONAR EMPLEADOS
                    </a>
                    <a href="/dashboard/admin/users/create" className="bg-white text-red-600 p-2 rounded text-center text-xs font-black hover:bg-slate-100 transition-colors">
                        🔑 ALTA DE PERSONAL
                    </a>
                    <a href="/dashboard/fleet" className="bg-white text-red-600 p-2 rounded text-center text-xs font-black hover:bg-slate-100 transition-colors">
                        🚌 INSPECCIÓN FLOTA
                    </a>
                </nav>
            </div>
            {/* ---------------------------------------------------- */}

            <nav className="flex-1 p-4 space-y-2">
                <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2 px-2">Menú Principal</div>
                <Link to="/dashboard" className="flex items-center gap-3 p-3 hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-700">
                    <span>🏠</span> Inicio
                </Link>
                <Link to="/dashboard/driver/navigation" className="flex items-center gap-3 p-3 hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-700">
                    <span>🗺️</span> Mapa y Tráfico
                </Link>
                <Link to="/dashboard/market" className="flex items-center gap-3 p-3 hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-700">
                    <span>🛒</span> Bolsa de Trabajo
                </Link>
                <Link to="/dashboard/driver/report" className="flex items-center gap-3 p-3 bg-red-600/10 text-red-400 hover:bg-red-600/20 rounded-xl transition-all border border-red-500/20">
                    <span>🛠️</span> Reportar Novedad
                </Link>
                <Link to="/dashboard/my-balance" className="flex items-center gap-3 p-3 hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-700">
                    <span>💰</span> Mi Cuenta
                </Link>

                <div className="mt-10 pt-4 border-t border-slate-800">
                    <button onClick={logout} className="text-red-400 w-full text-left p-3 font-bold hover:bg-red-900/20 rounded-xl transition-all flex items-center gap-3">
                        <span>❌</span> CERRAR SESIÓN
                    </button>
                </div>
            </nav>

            <div className="p-4 bg-slate-950 border-t border-slate-800">
                <div className="text-[10px] text-slate-500 text-center font-mono">
                    v3.2-POWERSHELL-OVERWRITE
                </div>
            </div>
        </div>
    );
}
