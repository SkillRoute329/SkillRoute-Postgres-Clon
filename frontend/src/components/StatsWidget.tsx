
import { BarChart3, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import { clsx } from "clsx";

const StatsWidget = () => {
    // Simulated Data for Demo
    const stats = [
        {
            title: "Cumplimiento de Servicio",
            value: "94.2%",
            trend: "+1.5%",
            isPositive: true,
            icon: TrendingUp,
            color: "text-emerald-500",
            bg: "bg-emerald-500/10"
        },
        {
            title: "Línea Más Puntual",
            value: "306",
            sub: "Casabó / Geant",
            isPositive: true,
            icon: Clock,
            color: "text-blue-500",
            bg: "bg-blue-500/10"
        },
        {
            title: "Línea con Demoras",
            value: "300",
            sub: "Avg: +8 min",
            isPositive: false,
            icon: AlertTriangle,
            color: "text-red-500",
            bg: "bg-red-500/10"
        },
        {
            title: "Coches Activos",
            value: "42/45",
            sub: "3 en Mantenimiento",
            isPositive: false, // Neutral
            icon: BarChart3,
            color: "text-purple-500",
            bg: "bg-purple-500/10"
        }
    ];

    return (
        <div className="mb-6 animate-fade-in-up">
            <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary-500" />
                <span>Estado de la Operación (Vivo)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                    <div key={i} className="glass-panel p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-all">
                        <div className="flex justify-between items-start mb-2">
                            <div className={clsx("p-2 rounded-lg", stat.bg)}>
                                <stat.icon className={clsx("w-5 h-5", stat.color)} />
                            </div>
                            {stat.trend && (
                                <span className={clsx("text-xs font-bold px-2 py-0.5 rounded-full",
                                    stat.isPositive ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                                )}>
                                    {stat.trend}
                                </span>
                            )}
                        </div>
                        <div className="mt-2">
                            <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wider">{stat.title}</h4>
                            <div className="text-2xl font-black text-white mt-1">{stat.value}</div>
                            {stat.sub && <div className="text-xs text-slate-500 font-medium mt-1">{stat.sub}</div>}
                        </div>
                    </div>
                ))}
            </div>

            {/* Simple Bar Chart Visualization (HTML/CSS) */}
            <div className="mt-4 glass-panel p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-slate-400 text-xs font-bold uppercase">Evolución de Atrasos (Últimas 6 horas)</h4>
                    <span className="text-[10px] text-slate-500">Actualizado hace 1 min</span>
                </div>
                <div className="flex items-end justify-between h-24 gap-2">
                    {[
                        { label: '06:00', val: 20, color: 'bg-emerald-500' },
                        { label: '07:00', val: 35, color: 'bg-emerald-500' },
                        { label: '08:00', val: 60, color: 'bg-yellow-500' },
                        { label: '09:00', val: 85, color: 'bg-red-500' },
                        { label: '10:00', val: 45, color: 'bg-yellow-500' },
                        { label: '11:00', val: 30, color: 'bg-emerald-500' },
                    ].map((bar, idx) => (
                        <div key={idx} className="flex flex-col items-center flex-1 group">
                            <div className="relative w-full flex justify-center items-end h-full">
                                <div
                                    className={clsx("w-full max-w-[30px] rounded-t-sm transition-all duration-500 group-hover:opacity-80", bar.color)}
                                    style={{ height: `${bar.val}%` }}
                                ></div>
                                {/* Tooltip */}
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-slate-700">
                                    {bar.val > 50 ? 'Crítico' : 'Normal'}
                                </div>
                            </div>
                            <span className="text-[10px] text-slate-500 mt-2 font-mono">{bar.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default StatsWidget;
