
import React, { useEffect, useState } from 'react';
import { CartonService } from '../services/api';
import { AlertTriangle, CheckCircle, Clock, TrendingDown, TrendingUp, Users } from 'lucide-react';

interface Suggestion {
    serviceNumber: string;
    line: string;
    location: string;
    scheduledTime: string;
    avgActualTime: string;
    diffMinutes: number;
    sampleSize: number;
    recommendation: string;
    severity: 'High' | 'Medium' | 'Low';
    avgLoad: number;
    loadStatus: 'High' | 'Low' | 'Normal';
}

const OptimizationPanel: React.FC<{ seasonId?: number }> = ({ seasonId }) => {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadData();
    }, [seasonId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await CartonService.getSuggestions(seasonId);
            setSuggestions(data);
        } catch (error) {
            console.error("Error loading suggestions", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-4 text-center text-slate-400">Analizando tiempos reales vs carga...</div>;

    if (suggestions.length === 0) return (
        <div className="bg-slate-800/50 p-6 rounded-lg text-center border border-slate-700">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-white">Excelente Performance</h3>
            <p className="text-slate-400">Tiempos y cargas equilibrados. Sin ajustes requeridos.</p>
        </div>
    );

    return (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
                <h3 className="font-semibold text-white flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    Análisis de Optimización ({suggestions.length})
                </h3>
                <span className="text-xs text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                    Prioridad: Carga vs Tiempo
                </span>
            </div>

            <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-xs sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-3">Servicio</th>
                            <th className="px-4 py-3">Punto de Control</th>
                            <th className="px-4 py-3">Desviación</th>
                            <th className="px-4 py-3">Carga Prom.</th>
                            <th className="px-4 py-3">Acción Recomendada</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {suggestions.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                                <td className="px-4 py-3 align-top">
                                    <div className="font-bold text-white text-lg">{item.serviceNumber}</div>
                                    <span className="text-xs text-slate-500">Línea {item.line}</span>
                                </td>

                                <td className="px-4 py-3 align-top">
                                    <div className="text-slate-300 font-medium">{item.location}</div>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                        <Clock size={12} /> Prog: {item.scheduledTime}
                                    </div>
                                </td>

                                <td className="px-4 py-3 align-top">
                                    <div className={`flex items-center gap-1 font-bold ${item.diffMinutes > 0 ? 'text-red-400' : 'text-emerald-400'
                                        }`}>
                                        {item.diffMinutes > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                        {Math.abs(item.diffMinutes)} min
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-1">
                                        {item.diffMinutes > 0 ? 'Atraso' : 'Adelanto'}
                                    </div>
                                </td>

                                <td className="px-4 py-3 align-top">
                                    <div className={`flex items-center gap-1 font-bold ${item.avgLoad > 40 ? 'text-red-400' : item.avgLoad < 5 ? 'text-blue-400' : 'text-slate-300'
                                        }`}>
                                        <Users size={16} /> {item.avgLoad} pax
                                    </div>
                                    {item.avgLoad > 40 && <span className="text-[10px] text-red-500 font-bold">ALTA</span>}
                                    {item.avgLoad < 5 && <span className="text-[10px] text-blue-500 font-bold">BAJA</span>}
                                </td>

                                <td className="px-4 py-3 align-top">
                                    <div className={`p-2 rounded-lg text-xs border ${item.severity === 'High'
                                        ? 'bg-red-900/20 text-red-200 border-red-500/30'
                                        : item.severity === 'Medium'
                                            ? 'bg-amber-900/20 text-amber-200 border-amber-500/30'
                                            : 'bg-blue-900/20 text-blue-200 border-blue-500/30'
                                        }`}>
                                        {item.recommendation}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default OptimizationPanel;
