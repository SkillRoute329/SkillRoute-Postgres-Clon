
import { useState, useEffect } from 'react';
import { PenaltyService } from '../../../services/api';
import { AlertTriangle, StopCircle } from 'lucide-react';
import RulesManager from './RulesManager';

const PenalizationsPage = () => {
    const [redNumbers, setRedNumbers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await PenaltyService.getRedNumbers();
            setRedNumbers(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in-up pb-24">
            <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <StopCircle className="w-8 h-8 text-red-500" />
                    Gestión de Conducta y Penalizaciones
                </h1>
                <p className="text-slate-400 text-sm">Monitoreo de infracciones automáticas y configuración de normas.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Red Numbers (Violators) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-slate-900 border border-red-900/30 rounded-2xl overflow-hidden">
                        <div className="p-6 bg-red-950/20 border-b border-red-900/30 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" />
                                Números Rojos (Infracciones Detectadas)
                            </h2>
                            <button onClick={loadData} className="text-xs text-slate-400 hover:text-white">Actualizar</button>
                        </div>

                        <div className="p-0">
                            {loading ? (
                                <div className="p-8 text-center text-slate-500">Analizando datos...</div>
                            ) : redNumbers.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-500">
                                        <AlertTriangle className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-white font-medium mb-1">Todo en orden</h3>
                                    <p className="text-slate-400 text-sm">No se detectaron usuarios en infracción esta semana.</p>
                                </div>
                            ) : (
                                <table className="w-full text-left text-sm text-slate-400">
                                    <thead className="text-xs uppercase bg-slate-950/50 text-slate-500">
                                        <tr>
                                            <th className="px-6 py-4">Usuario</th>
                                            <th className="px-6 py-4">Infracción</th>
                                            <th className="px-6 py-4 text-center">Ocurrencias</th>
                                            <th className="px-6 py-4 text-right">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {redNumbers.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                                                <td className="px-6 py-4 font-medium text-white">{item.userName}</td>
                                                <td className="px-6 py-4">
                                                    <span className="bg-red-500/10 text-red-400 px-2 py-1 rounded text-xs border border-red-500/20">
                                                        {item.ruleName}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center text-white font-bold">{item.count}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <button className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg border border-slate-700">
                                                        Aplicar Sanción
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Rules Config */}
                <div className="space-y-6">
                    <RulesManager />
                </div>
            </div>
        </div>
    );
};

export default PenalizationsPage;
