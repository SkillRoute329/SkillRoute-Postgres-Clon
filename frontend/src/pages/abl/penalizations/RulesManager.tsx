
import { useState, useEffect } from 'react';
import { PenaltyService } from '../../../services/api';
import { Plus, Trash2 } from 'lucide-react';

const RulesManager = () => {
    const [rules, setRules] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [newRule, setNewRule] = useState({
        name: '',
        type: 'EarlyArrival', // or LateArrival, LowLoad
        threshold: 5,
        maxCount: 3,
        periodDays: 7,
        action: 'Suspension',
        actionDuration: 1
    });

    useEffect(() => {
        loadRules();
    }, []);

    const loadRules = async () => {
        setLoading(true);
        try {
            const data = await PenaltyService.getRules();
            setRules(data);
        } catch (e) {
            console.error("Error loading rules", e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            await PenaltyService.saveRule(newRule);
            setShowForm(false);
            loadRules();
            setNewRule({
                name: '',
                type: 'EarlyArrival',
                threshold: 5,
                maxCount: 3,
                periodDays: 7,
                action: 'Suspension',
                actionDuration: 1
            });
        } catch (e) {
            alert('Error al guardar regla');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Eliminar regla?')) return;
        await PenaltyService.deleteRule(id);
        loadRules();
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Reglas de Conducta</h3>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium"
                >
                    <Plus className="w-4 h-4" /> Nueva Regla
                </button>
            </div>

            {showForm && (
                <div className="bg-slate-800 p-4 rounded-xl mb-6 space-y-4 border border-slate-700">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">Nombre Regla</label>
                            <input
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                                value={newRule.name}
                                onChange={e => setNewRule({ ...newRule, name: e.target.value })}
                                placeholder="Ej: Adelantos Recurrentes"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">Tipo Falta</label>
                            <select
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                                value={newRule.type}
                                onChange={e => setNewRule({ ...newRule, type: e.target.value })}
                            >
                                <option value="EarlyArrival">Adelanto (Early)</option>
                                <option value="LateArrival">Atraso (Late)</option>
                                <option value="LowLoad">Baja Carga (Low Load)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">Umbral (Minutos)</label>
                            <input
                                type="number"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                                value={newRule.threshold}
                                onChange={e => setNewRule({ ...newRule, threshold: Number(e.target.value) })}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">Cant. Permitida</label>
                            <input
                                type="number"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                                value={newRule.maxCount}
                                onChange={e => setNewRule({ ...newRule, maxCount: Number(e.target.value) })}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">Período (Días)</label>
                            <input
                                type="number"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                                value={newRule.periodDays}
                                onChange={e => setNewRule({ ...newRule, periodDays: Number(e.target.value) })}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">Acción (Castigo)</label>
                            <select
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                                value={newRule.action}
                                onChange={e => setNewRule({ ...newRule, action: e.target.value })}
                            >
                                <option value="Suspension">Suspensión</option>
                                <option value="Warning">Advertencia</option>
                            </select>
                        </div>
                    </div>
                    <button
                        onClick={handleSave}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg font-bold"
                    >
                        Guardar Regla
                    </button>
                </div>
            )}

            <div className="space-y-2">
                {rules.map(rule => (
                    <div key={rule.id} className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-800">
                        <div>
                            <div className="font-medium text-white">{rule.name}</div>
                            <div className="text-xs text-slate-400">
                                {rule.type} &gt; {rule.threshold} min | Max: {rule.maxCount} veces en {rule.periodDays} días
                            </div>
                        </div>
                        <button
                            onClick={() => handleDelete(rule.id)}
                            className="text-red-400 hover:text-red-300 p-2"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                {loading && <div className="text-center text-slate-500 text-sm">Cargando...</div>}
                {!loading && rules.length === 0 && <div className="text-center text-slate-500 text-sm">Sin reglas definidas.</div>}
            </div>
        </div>
    );
};

export default RulesManager;
