import { useState, useEffect } from 'react';
import { API_URL } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { UserPlus, Users, Search, Save, X, FileUp, FileDown, Download } from 'lucide-react';
import { DataImportService } from '../../services/api';

const Employees = () => {
  const { token } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // Form State
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    ci: '',
    internalNumber: '',
    position: 'Chofer',
    role: 'User',
  });

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    // Fetch users for now as they contain employee info
    // Ideal: fetch /api/employees endpoint if exists, otherwise /api/users
    try {
      const res = await fetch(`${API_URL}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setEmployees(await res.json());
    } catch (e) {
      console.error(e);
    }
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
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        alert('Empleado creado correctamente');
        setShowModal(false);
        setForm({
          firstName: '',
          lastName: '',
          ci: '',
          internalNumber: '',
          position: 'Chofer',
          role: 'User',
        });
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

  const handleExport = async () => {
    try {
      const blob = await DataImportService.exportEmployees();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `empleados_ucot_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      alert('Error al exportar');
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await DataImportService.uploadEmployees(formData);
      alert(
        `Éxito: ${(res as { success?: boolean; count?: number; errors?: unknown[] }).success ?? res.count} procesados. Errores: ${(res as { errors?: unknown[] }).errors?.length ?? 0}`,
      );
      setShowImportModal(false);
      setFile(null);
      loadEmployees();
    } catch (e: any) {
      alert('Error en importación: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await DataImportService.downloadEmployeeTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla_empleados_ucot.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      alert('Error al descargar plantilla');
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
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl border border-slate-700 flex items-center gap-2 transition-all"
          >
            <FileDown className="w-5 h-5" />
            Exportar
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl border border-slate-700 flex items-center gap-2 transition-all"
          >
            <FileUp className="w-5 h-5" />
            Importar (XLSX)
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="btn btn-primary flex items-center gap-2 shadow-lg shadow-primary-900/20"
          >
            <UserPlus className="w-5 h-5" />
            Nuevo Empleado
          </button>
        </div>
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
                  <span
                    className={`px-2 py-1 rounded text-xs font-bold ${emp.role === 'Admin' || emp.role === 'SuperAdmin' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-700 text-slate-300'}`}
                  >
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
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Nombre</label>
                  <input
                    className="input-field"
                    required
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Apellido</label>
                  <input
                    className="input-field"
                    required
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Cédula (Usuario)</label>
                  <input
                    className="input-field"
                    required
                    placeholder="1.234.567-8"
                    value={form.ci}
                    onChange={(e) => setForm({ ...form, ci: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Nro. Legajo</label>
                  <input
                    className="input-field"
                    placeholder="Opcional"
                    value={form.internalNumber}
                    onChange={(e) => setForm({ ...form, internalNumber: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Cargo (RRHH)</label>
                  <select
                    className="input-field"
                    value={form.position}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                  >
                    <option value="Chofer">Chofer</option>
                    <option value="Inspector">Inspector</option>
                    <option value="Mecánico">Mecánico</option>
                    <option value="Administrativo">Administrativo</option>
                  </select>
                </div>
                <div>
                  <label className="label">Rol Sistema</label>
                  <select
                    className="input-field"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="User">Usuario Básico</option>
                    <option value="Inspector">Inspector</option>
                    <option value="Admin">Administrador</option>
                  </select>
                </div>
              </div>

              <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-500/20 text-xs text-blue-300 mt-4">
                <p>ℹ️ La contraseña inicial será el número de Cédula.</p>
              </div>

              <button
                disabled={loading}
                className="btn btn-primary w-full mt-4 flex justify-center items-center gap-2"
              >
                {loading ? (
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white"></span>
                ) : (
                  <Save className="w-5 h-5" />
                )}
                Crear Empleado
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Importación Masiva</h2>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="text-center p-6 border-2 border-dashed border-slate-700 rounded-xl hover:border-primary-500 transition-colors cursor-pointer group">
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  id="employee-file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <label htmlFor="employee-file" className="cursor-pointer">
                  <FileUp className="w-12 h-12 text-slate-500 mx-auto mb-2 group-hover:text-primary-400" />
                  <p className="text-sm text-slate-300">
                    {file ? file.name : 'Seleccionar archivo Excel (.xlsx)'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">Soporta más de 1000 registros</p>
                </label>
              </div>

              <button
                onClick={handleDownloadTemplate}
                className="w-full flex items-center justify-center gap-2 text-xs text-primary-400 hover:text-primary-300"
              >
                <Download className="w-4 h-4" /> Bajar Plantilla RRHH
              </button>

              <div className="pt-4 flex gap-3 border-t border-slate-800">
                <button
                  disabled={importing}
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 py-2 text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  disabled={importing || !file}
                  onClick={handleImport}
                  className="flex-1 btn btn-primary py-2 flex justify-center items-center gap-2"
                >
                  {importing && (
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white"></span>
                  )}
                  Iniciar Carga
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;
