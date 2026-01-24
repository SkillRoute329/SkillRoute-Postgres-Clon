
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../services/api';
import { UserPlus, Save, AlertCircle, CheckCircle } from 'lucide-react';

const UserManagement = () => {
    const { token } = useAuth();
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        internalNumber: '',
        ci: '',
        password: '',
        role: 'User',
        departmentId: '',
        jobRoleId: ''
    });
    const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatus(null);

        try {
            const res = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            const data = await res.json();

            if (res.ok) {
                setStatus({ type: 'success', msg: 'Usuario creado exitosamente.' });
                setFormData({ firstName: '', lastName: '', internalNumber: '', ci: '', password: '', role: 'User', departmentId: '', jobRoleId: '' });
            } else {
                setStatus({ type: 'error', msg: data.message || 'Error al crear usuario.' });
            }
        } catch (err) {
            setStatus({ type: 'error', msg: 'Error de conexión.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-6 bg-slate-900 border border-slate-800 rounded-xl shadow-xl animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
                <div className="w-12 h-12 bg-primary-600/20 rounded-full flex items-center justify-center">
                    <UserPlus className="w-6 h-6 text-primary-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Alta de Personal</h2>
                    <p className="text-sm text-slate-400">Crear usuario y legajo vinculado.</p>
                </div>
            </div>

            {status && (
                <div className={`p-4 rounded-lg flex items-center gap-2 mb-6 ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {status.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    <span>{status.msg}</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-medium text-slate-400 mb-1 block">Nombre</label>
                        <input className="input-field" required value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-400 mb-1 block">Apellido</label>
                        <input className="input-field" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-medium text-slate-400 mb-1 block">Cédula (CI)</label>
                        <input className="input-field" placeholder="1.234.567-8" value={formData.ci} onChange={e => setFormData({ ...formData, ci: e.target.value })} />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-400 mb-1 block">Nro Interno (Legajo)</label>
                        <input className="input-field" required placeholder="1234" value={formData.internalNumber} onChange={e => setFormData({ ...formData, internalNumber: e.target.value })} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-medium text-slate-400 mb-1 block">Rol Sistema</label>
                        <select className="input-field" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                            <option value="User">Usuario / Chofer</option>
                            <option value="Inspector">Inspector</option>
                            <option value="Admin">Administrativo</option>
                            <option value="SuperAdmin">Super Admin</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-400 mb-1 block">Contraseña</label>
                        <input className="input-field" type="password" required value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                    </div>
                </div>

                <button
                    disabled={loading}
                    className="w-full btn btn-primary flex items-center justify-center gap-2 py-3 mt-6"
                >
                    {loading ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></span> : <Save className="w-5 h-5" />}
                    Guardar Usuario
                </button>
            </form>
        </div>
    );
};

export default UserManagement;
