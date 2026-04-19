import React, { useState, useEffect } from 'react';
import { Plus, Building2, Copy } from 'lucide-react';
import api from '../../services/api';

const TenantsManager = () => {
  const [tenants, setTenants] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  // Form
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    adminInternalNumber: '',
    adminFirstName: '',
    adminLastName: '',
    adminPassword: '',
  });

  const [createdInfo, setCreatedInfo] = useState<any>(null);

  const fetchTenants = async () => {
    try {
      const res = await api.get('/tenants');
      setTenants((res.data || []) as any[]);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    void fetchTenants();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/tenants', formData);
      setCreatedInfo(res.data);
      setShowModal(false);
      fetchTenants();
      alert('Empresa creada exitosamente');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Error al crear empresa');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Building2 className="text-pink-500" />
          Gestión de Empresas (Tenants)
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus size={20} />
          Nueva Empresa
        </button>
      </div>

      {/* List */}
      <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 overflow-x-auto touch-pan-x">
        <table className="w-full text-left min-w-[700px]">
          <thead className="bg-slate-900/50 text-slate-400 text-sm uppercase">
            <tr>
              <th className="p-4">ID</th>
              <th className="p-4">Nombre</th>
              <th className="p-4">Slug / Código</th>
              <th className="p-4">Usuarios</th>
              <th className="p-4">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {tenants.map((t) => (
              <tr key={t.id} className="hover:bg-slate-700/30">
                <td className="p-4 text-slate-500">#{t.id}</td>
                <td className="p-4 font-medium text-white">{t.name}</td>
                <td className="p-4 font-mono text-xs bg-slate-900/50 px-2 py-1 rounded w-fit">
                  {t.slug}
                </td>
                <td className="p-4 text-slate-400">{t._count?.users || 0}</td>
                <td className="p-4">
                  <span
                    className={`px-2 py-1 rounded text-xs ${t.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
                  >
                    {t.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Created Success Info */}
      {createdInfo && (
        <div className="bg-green-500/10 border border-green-500/50 p-6 rounded-xl mt-4">
          <h3 className="text-xl font-bold text-green-400 mb-2">¡Empresa Creada!</h3>
          <p className="mb-4">
            Comparte este enlace para que los usuarios se registren directamente:
          </p>

          <div className="flex items-center gap-2 bg-slate-900 p-3 rounded border border-slate-700">
            <code className="flex-1 text-green-300 font-mono text-sm break-all">
              {createdInfo.inviteLink}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(createdInfo.inviteLink)}
              className="text-slate-400 hover:text-white"
            >
              <Copy size={18} />
            </button>
          </div>

          <div className="mt-4 text-sm text-slate-400">
            <p>
              Admin Inicial:{' '}
              <span className="text-white font-mono">{createdInfo.admin.internalNumber}</span>
            </p>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 p-6 rounded-xl w-full max-w-lg border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">Nueva Empresa</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Nombre Empresa</label>
                <input
                  required
                  type="text"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej. Transportes S.A."
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Slug / Código (Único)</label>
                <input
                  required
                  type="text"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="Ej. transportes-sa"
                />
              </div>

              <div className="border-t border-slate-700 my-4 pt-4">
                <h3 className="text-sm font-semibold text-pink-400 mb-2">
                  Crear Primer Administrador
                </h3>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input
                    required
                    type="text"
                    className="bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    value={formData.adminFirstName}
                    onChange={(e) => setFormData({ ...formData, adminFirstName: e.target.value })}
                    placeholder="Nombre"
                  />
                  <input
                    required
                    type="text"
                    className="bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    value={formData.adminLastName}
                    onChange={(e) => setFormData({ ...formData, adminLastName: e.target.value })}
                    placeholder="Apellido"
                  />
                </div>
                <div className="mb-2">
                  <input
                    required
                    type="text"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    value={formData.adminInternalNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, adminInternalNumber: e.target.value })
                    }
                    placeholder="Número Interno Admin (Ej. 9999)"
                  />
                </div>
                <div>
                  <input
                    required
                    type="password"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    value={formData.adminPassword}
                    onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                    placeholder="Contraseña Admin"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-pink-600 hover:bg-pink-700 px-4 py-2 rounded text-white font-medium"
                >
                  Crear Empresa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantsManager;
