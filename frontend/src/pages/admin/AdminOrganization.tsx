import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, X, ChevronDown, ChevronRight, Briefcase, Users } from 'lucide-react';
import { DepartmentService } from '../../services/api';

const AdminOrganization = () => {
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDepts, setExpandedDepts] = useState<number[]>([]);

  // State for Modals
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);

  // State for Forms
  const [editingDept, setEditingDept] = useState<any>(null); // If null, creating new
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null); // For adding role

  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const depts = await DepartmentService.getAll();
      setDepartments(depts);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (deptId: number) => {
    setExpandedDepts((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId],
    );
  };

  const handleDeptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingDept) {
        await DepartmentService.update(editingDept.id, formData);
      } else {
        await DepartmentService.create(formData);
      }
      setIsDeptModalOpen(false);
      fetchData();
    } catch (error) {
      alert('Error al guardar área');
    }
  };

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeptId) return;
    try {
      await DepartmentService.addRole(String(selectedDeptId), formData);
      setIsRoleModalOpen(false);
      fetchData();
      // Ensure expanded so user sees new role
      if (!expandedDepts.includes(selectedDeptId)) {
        setExpandedDepts((prev) => [...prev, selectedDeptId]);
      }
    } catch (error) {
      alert('Error al guardar cargo');
    }
  };

  const handleDeleteDept = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar esta área? Se eliminarán también todos sus cargos.'))
      return;
    try {
      await DepartmentService.delete(String(id));
      fetchData();
    } catch (error) {
      alert('Error al eliminar');
    }
  };

  const handleDeleteRole = async (roleId: number) => {
    if (!confirm('¿Eliminar este cargo?')) return;
    try {
      await DepartmentService.deleteRole(String(roleId));
      fetchData();
    } catch (error) {
      alert('Error al eliminar cargo');
    }
  };

  const openDeptModal = (dept: any = null) => {
    setEditingDept(dept);
    setFormData({
      name: dept?.name || '',
      description: dept?.description || '',
    });
    setIsDeptModalOpen(true);
  };

  const openRoleModal = (deptId: number) => {
    setSelectedDeptId(deptId);
    setFormData({ name: '', description: '' });
    setIsRoleModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Organización (Estructura)</h1>
          <p className="text-slate-400">
            Define las Áreas de Trabajo y los Cargos pertenecientes a cada una.
          </p>
        </div>
        <button
          onClick={() => openDeptModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nueva Área</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-400">Cargando estructura...</p>
        </div>
      ) : departments.length === 0 ? (
        <div className="text-center py-12 bg-slate-900 rounded-xl border border-slate-800">
          <Briefcase className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No hay áreas definidas</h3>
          <p className="text-slate-400 mb-6">
            Comienza creando la primera área de trabajo (ej. Administración, Tránsito).
          </p>
          <button
            onClick={() => openDeptModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Crear Área</span>
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {departments.map((dept) => (
            <div
              key={dept.id}
              className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden"
            >
              {/* Area Header */}
              <div className="flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors">
                <div
                  className="flex items-center gap-4 flex-1 cursor-pointer"
                  onClick={() => toggleExpand(dept.id)}
                >
                  <button className="text-slate-400 hover:text-white transition-colors">
                    {expandedDepts.includes(dept.id) ? (
                      <ChevronDown className="w-5 h-5" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </button>
                  <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{dept.name}</h3>
                    {dept.description && (
                      <p className="text-sm text-slate-400">{dept.description}</p>
                    )}
                  </div>
                  <div className="ml-4 px-2 py-0.5 bg-slate-800 rounded text-xs font-medium text-slate-400">
                    {dept.jobRoles?.length || 0} Cargos
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openRoleModal(dept.id)}
                    className="p-2 text-primary-400 hover:bg-primary-500/10 rounded-lg transition-colors text-sm flex items-center gap-1"
                    title="Agregar Cargo"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Cargo</span>
                  </button>
                  <button
                    onClick={() => openDeptModal(dept)}
                    className="p-2 text-slate-400 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Editar Área"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteDept(dept.id)}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Eliminar Área"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Job Roles List (Expanded) */}
              {expandedDepts.includes(dept.id) && (
                <div className="border-t border-slate-800 bg-slate-900/50 p-4 pl-14">
                  {!dept.jobRoles || dept.jobRoles.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">
                      No hay cargos registrados en esta área.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {dept.jobRoles.map((role: any) => (
                        <div
                          key={role.id}
                          className="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-slate-700/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">
                              <Users className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-medium text-white">{role.name}</div>
                              {role.description && (
                                <div className="text-xs text-slate-400">{role.description}</div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteRole(role.id)}
                            className="text-slate-500 hover:text-red-400 p-1 rounded transition-colors"
                            title="Eliminar Cargo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Department Modal */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl w-full max-w-md border border-slate-800 shadow-xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">
                {editingDept ? 'Editar Área' : 'Nueva Área de Trabajo'}
              </h3>
              <button
                onClick={() => setIsDeptModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleDeptSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Nombre del Área
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                  placeholder="Ej. Tránsito, Administración"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Descripción</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                  placeholder="Opcional"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Job Role Modal */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl w-full max-w-md border border-slate-800 shadow-xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Nuevo Cargo</h3>
              <button
                onClick={() => setIsRoleModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleRoleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Nombre del Cargo
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                  placeholder="Ej. Inspector, Jefe de Turno"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Descripción</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                  placeholder="Opcional"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                >
                  Guardar Cargo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOrganization;
