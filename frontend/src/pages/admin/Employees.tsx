
import { useState, useEffect } from 'react';
import { API_URL } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { UserPlus, Users, Search, Save, X } from 'lucide-react';

const Employees = () => {
    const { token } = useAuth();
    const [employees, setEmployees] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(false);

    // Form State
    const [form, setForm] = useState({
        firstName: '',
        lastName: '',
        ci: '',
        internalNumber: '',
        position: 'Chofer',
        role: 'User'
    });

    useEffect(() => {
        loadEmployees();
    }, []);

    const loadEmployees = async () => {
        // Fetch users for now as they contain employee info
        // Ideal: fetch /api/employees endpoint if exists, otherwise /api/users
        try {
            const res = await fetch(`${API_URL}/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setEmployees(await res.json());
        } catch (e) { console.error(e); }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Auto-generate password = CI
            const payload = {
                ...form,
                password: form.ci,
            };

            const res = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert('Empleado creado correctamente');
                setShowModal(false);
                setForm({ firstName: '', lastName: '', ci: '', internalNumber: '', position: 'Chofer', role: 'User' });
                loadEmployees();
            } else {
                const err = await res.json();
                alert('Error: ' + err.message);
            }
        } catch (e) {
            alert('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto animate-fade-in-up">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Users className="w-8 h-8 text-primary-500" />
                        Gestión de Empleados
                    </h1>
                    <p className="text-slate-400">Administración de RRHH y Usuarios del Sistema</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <UserPlus className="w-5 h-5" />
                    Nuevo Empleado
                </button>
            </div>

            {/* Employee List */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <table className="w-full">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-xs font-bold">
                        <tr>
                            <th className="p-4 text-left">Empleado</th>
                            <th className="p-4 text-left">Cédula / Legajo</th>
                            <th className="p-4 text-left">Cargo</th>
                            <th className="p-4 text-left">Rol Sistema</th>
                            <th className="p-4 text-center">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {employees.map((emp) => (
                            <tr key={emp.id} className="hover:bg-slate-800/50 transition-colors">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold">
                                            {emp.firstName?.[0]}
                                        </div>
                                        <div>
                                            <div className="font-bold text-white">{emp.fullName}</div>
                                            <div className="text-xs text-slate-500">{emp.email || 'Sin email'}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="text-white font-mono">{emp.ci}</div>
                                    <div className="text-xs text-slate-500">Int: {emp.internalNumber}</div>
                                </td>
                                <td className="p-4 text-slate-300">{emp.jobRole?.name || emp.position || '—'}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${emp.role === 'Admin' || emp.role === 'SuperAdmin' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-700 text-slate-300'}`}>
                                        {emp.role}
                                    </span>
                                </td>
                                <td className="p-4 text-center">
                                    <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 animate-fade-in-up">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white">Nuevo Empleado</h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Nombre</label>
                                    <input className="input-field" required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
                                </div>
                                <div>
                                    <label className="label">Apellido</label>
                                    <input className="input-field" required value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Cédula (Usuario)</label>
                                    <input className="input-field" required placeholder="1.234.567-8" value={form.ci} onChange={e => setForm({ ...form, ci: e.target.value })} />
                                </div>
                                <div>
                                    <label className="label">Nro. Legajo</label>
                                    <input className="input-field" placeholder="Opcional" value={form.internalNumber} onChange={e => setForm({ ...form, internalNumber: e.target.value })} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Cargo (RRHH)</label>
                                    <select className="input-field" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}>
                                        <option value="Chofer">Chofer</option>
                                        <option value="Inspector">Inspector</option>
                                        <option value="Mecánico">Mecánico</option>
                                        <option value="Administrativo">Administrativo</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="label">Rol Sistema</label>
                                    <select className="input-field" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                                        <option value="User">Usuario Básico</option>
                                        <option value="Inspector">Inspector</option>
                                        <option value="Admin">Administrador</option>
                                    </select>
                                </div>
                            </div>

                            <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-500/20 text-xs text-blue-300 mt-4">
                                <p>ℹ️ La contraseña inicial será el número de Cédula.</p>
                            </div>

                            <button disabled={loading} className="btn btn-primary w-full mt-4 flex justify-center items-center gap-2">
                                {loading ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white"></span> : <Save className="w-5 h-5" />}
                                Crear Empleado
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Employees;
