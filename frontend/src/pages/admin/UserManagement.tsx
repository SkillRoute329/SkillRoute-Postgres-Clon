import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserService } from '../../services/api'; // Still needed for CREATE (as it uses API backend for logic)
import { UserPlus, Save, Trash2, Search } from 'lucide-react';
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection';
import { showSuccess, showError, showLoading, dismiss } from '../../context/FeedbackProvider';
import { orderBy } from '../../config/firestoreShim';
import { getFirestore, deleteDoc, doc } from '../../config/firestoreShim';

const UserManagement = () => {
  const { token } = useAuth();
  // Real-Time Data!
  // We order by createdAt if possible, or just default.
  const { data: users, loading: listLoading } = useFirestoreCollection('users', [
    orderBy('createdAt', 'desc'),
  ]);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    internalNumber: '',
    ci: '',
    password: '',
    role: 'User',
    departmentId: '',
    jobRoleId: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const toastId = showLoading('Guardando perfil en BD...');

    try {
      // 🛑 STRICT MODE: Use Direct Firestore Service
      // Note: This creates the Data Profile only.
      // The user cannot login until Auth credentials are created via Admin SDK or Cloud Function.
      await UserService.create(formData);

      dismiss(toastId);
      showSuccess('Perfil guardado correctamente (Ver en Nómina)');

      // Allow form reset
      setFormData({
        firstName: '',
        lastName: '',
        internalNumber: '',
        ci: '',
        password: '',
        role: 'User',
        departmentId: '',
        jobRoleId: '',
      });
    } catch (err: any) {
      dismiss(toastId);
      console.error(err);
      showError('Error al guardar: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar a ${name}?`)) return;

    // Optimistic UI handled by Firestore Hook update, but for Delete we can do it directly via DB SDK if allowed
    // or API. Assuming client delete permission for Admin.
    const toastId = showLoading('Eliminando...');
    try {
      const db = getFirestore();
      await deleteDoc(doc(db, 'users', id)); // Or 'personnel' if that's the collection
      // Hook will auto-remove it from list
      dismiss(toastId);
      showSuccess('Eliminado');
    } catch (e: any) {
      dismiss(toastId);
      showError('Error eliminando: ' + e.message);
    }
  };

  const filteredUsers = users.filter(
    (u: any) =>
      u.firstName?.toLowerCase().includes(filter.toLowerCase()) ||
      u.lastName?.toLowerCase().includes(filter.toLowerCase()) ||
      u.internalNumber?.includes(filter),
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Create Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl p-6">
        <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
          <div className="w-12 h-12 bg-indigo-600/20 rounded-full flex items-center justify-center">
            <UserPlus className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Alta de Personal</h2>
            <p className="text-sm text-slate-400">Crear usuario y legajo vinculado.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-400 mb-1 block">Nombre</label>
              <input
                className="input-field w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-400 mb-1 block">Apellido</label>
              <input
                className="input-field w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-400 mb-1 block">Cédula (CI)</label>
              <input
                className="input-field w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                placeholder="1.234.567-8"
                value={formData.ci}
                onChange={(e) => setFormData({ ...formData, ci: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-400 mb-1 block">
                Nro Interno (Legajo)
              </label>
              <input
                className="input-field w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                required
                placeholder="1234"
                value={formData.internalNumber}
                onChange={(e) => setFormData({ ...formData, internalNumber: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-400 mb-1 block">Rol Sistema</label>
              <select
                className="input-field w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="User">Usuario / Chofer</option>
                <option value="Inspector">Inspector</option>
                <option value="Admin">Administrativo</option>
                <option value="SuperAdmin">Super Admin</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-400 mb-1 block">Contraseña</label>
              <input
                className="input-field w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
          </div>

          <button
            disabled={submitting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 py-3 mt-6 transition-all"
          >
            {submitting ? (
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></span>
            ) : (
              <Save className="w-5 h-5" />
            )}
            Guardar Usuario
          </button>
        </form>
      </div>

      {/* List Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
          <h3 className="font-bold text-white">Nómina ({filteredUsers.length})</h3>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar..."
              className="bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1 text-sm text-white w-48 focus:w-64 transition-all"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-800 max-h-[500px] overflow-y-auto">
          {listLoading ? (
            <div className="p-8 text-center text-slate-500">Cargando personal...</div>
          ) : (
            filteredUsers.map((u: any) => (
              <div
                key={u.id}
                className="p-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-sm">
                    {u.firstName?.[0]}
                    {u.lastName?.[0]}
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">
                      {u.firstName} {u.lastName}
                    </h4>
                    <p className="text-xs text-slate-400">
                      Legajo: <span className="text-indigo-400 font-mono">{u.internalNumber}</span>{' '}
                      • {u.role}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(u.id, u.firstName)}
                  className="p-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
