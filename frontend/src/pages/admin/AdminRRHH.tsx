import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Users,
  Receipt,
  Plus,
  Trash2,
  Edit2,
  X,
  DollarSign,
  Percent,
  FileUp,
  FileDown,
  Search,
  ChevronDown,
  Phone,
  RefreshCw,
  Save,
  CalendarDays,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';
import { useAuth } from '../../context/AuthContext';
import { DepartmentService, DiscountService, DataImportService } from '../../services/api';
import clsx from 'clsx';
import { JornalesTab } from './JornalesTab';
import { ConfigSalarialTab } from './ConfigSalarialTab';
import { PreferenciasTab } from './PreferenciasTab';

const AdminRRHH = () => {
  const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
  const [activeTab, setActiveTab] = useState<'users' | 'structure' | 'discounts' | 'jornales' | 'salarios' | 'preferencias'>('users');

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto animate-fade-in-up pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1 md:mb-2 flex items-center gap-2">
            <Users className="w-8 h-8 text-primary-500" />
            Recursos Humanos (RRHH)
          </h1>
          <p className="text-slate-400 text-sm md:text-base">
            Gestión de personal, estructura organizacional y compensaciones.
          </p>
        </div>
      </div>

      <div className="flex border-b border-slate-700 mb-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('users')}
          className={clsx(
            'px-6 py-3 font-medium text-sm transition-colors border-b-2',
            activeTab === 'users'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-slate-400 hover:text-white',
          )}
        >
          Personal (691)
        </button>
        <button
          onClick={() => setActiveTab('structure')}
          className={clsx(
            'px-6 py-3 font-medium text-sm transition-colors border-b-2',
            activeTab === 'structure'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-slate-400 hover:text-white',
          )}
        >
          Estructura y Cargos
        </button>
        <button
          onClick={() => setActiveTab('discounts')}
          className={clsx(
            'px-6 py-3 font-medium text-sm transition-colors border-b-2',
            activeTab === 'discounts'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-slate-400 hover:text-white',
          )}
        >
          Descuentos y Retenciones
        </button>
        <button
          onClick={() => setActiveTab('jornales')}
          className={clsx(
            'px-6 py-3 font-medium text-sm transition-colors border-b-2 flex items-center gap-1.5',
            activeTab === 'jornales'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-white',
          )}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          Jornales
        </button>
        <button
          onClick={() => setActiveTab('salarios')}
          className={clsx(
            'px-6 py-3 font-medium text-sm transition-colors border-b-2 flex items-center gap-1.5',
            activeTab === 'salarios'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-white',
          )}
        >
          <Settings2 className="w-3.5 h-3.5" />
          Config. Salarial
        </button>
        <button
          onClick={() => setActiveTab('preferencias')}
          className={clsx(
            'px-6 py-3 font-medium text-sm transition-colors border-b-2 flex items-center gap-1.5',
            activeTab === 'preferencias'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-white',
          )}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Preferencias GenAI
        </button>
      </div>

      <div className="min-h-[400px]">
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'structure' && <StructureTab />}
        {activeTab === 'discounts' && <DiscountsTab />}
        {activeTab === 'jornales' && <JornalesTab />}
        {activeTab === 'salarios' && <ConfigSalarialTab />}
        {activeTab === 'preferencias' && <PreferenciasTab />}
      </div>
    </div>
  );
};

// ─── TIPOS Y HELPERS ──────────────────────────────────────────────────────────
interface Empleado {
  id: string;
  internalNumber?: string;
  interno?: string;
  fullName?: string;
  nombre?: string;
  apellido?: string;
  cargo?: string;
  rol?: string;
  role?: string;
  telefono?: string;
  estado?: string;
}

const ROL_LABEL: Record<string, string> = {
  conductor: 'Conductor',
  inspector: 'Inspector',
  admin: 'Administración',
  mantenimiento: 'Mantenimiento',
  maniobrista: 'Maniobrista',
  listero: 'Listero',
  'tráfico': 'Tráfico',
  tecnologia: 'Tecnología',
  DRIVER: 'Conductor',
  INSPECTOR: 'Inspector',
  ADMIN: 'Administración',
  TRAFFIC: 'Tráfico',
  MAINTENANCE: 'Mantenimiento',
  LISTERO: 'Listero',
  SuperAdmin: 'SuperAdmin',
};

const ROL_COLOR: Record<string, string> = {
  conductor: 'bg-blue-900/60 text-blue-300 border-blue-700/50',
  DRIVER: 'bg-blue-900/60 text-blue-300 border-blue-700/50',
  inspector: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/50',
  INSPECTOR: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/50',
  admin: 'bg-purple-900/60 text-purple-300 border-purple-700/50',
  ADMIN: 'bg-purple-900/60 text-purple-300 border-purple-700/50',
  mantenimiento: 'bg-orange-900/60 text-orange-300 border-orange-700/50',
  MAINTENANCE: 'bg-orange-900/60 text-orange-300 border-orange-700/50',
  listero: 'bg-yellow-900/60 text-yellow-300 border-yellow-700/50',
  LISTERO: 'bg-yellow-900/60 text-yellow-300 border-yellow-700/50',
  'tráfico': 'bg-cyan-900/60 text-cyan-300 border-cyan-700/50',
  TRAFFIC: 'bg-cyan-900/60 text-cyan-300 border-cyan-700/50',
  maniobrista: 'bg-rose-900/60 text-rose-300 border-rose-700/50',
  SuperAdmin: 'bg-red-900/60 text-red-300 border-red-700/50',
};

const ROLES_LIST = [
  'conductor', 'inspector', 'admin', 'mantenimiento',
  'maniobrista', 'listero', 'tráfico', 'tecnologia',
];

function empInterno(e: Empleado) { return e.internalNumber ?? e.interno ?? ''; }
function empNombre(e: Empleado) { return e.fullName ?? ([e.nombre, e.apellido].filter(Boolean).join(' ') || e.id); }
function empRol(e: Empleado) { return e.rol ?? e.role ?? ''; }
function maskPhone(tel: string): string {
  const c = tel.replace(/\D/g, '');
  return c.length < 7 ? '***' : `${c.slice(0, 3)}***${c.slice(-4)}`;
}

// ─── TAB: PERSONAL (691 empleados reales) ────────────────────────────────────
const UsersTab = () => {
  const { token } = useAuth();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [rolFiltro, setRolFiltro] = useState('');
  const [editando, setEditando] = useState<Empleado | null>(null);
  const [editForm, setEditForm] = useState({ cargo: '', rol: '', telefono: '', estado: 'activo' });
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const cargar = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/personal?limit=691', { headers: authHeaders });
      const data = await res.json();
      if (data.ok) setEmpleados(data.empleados ?? []);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = empleados.filter(e => {
    const matchRol = !rolFiltro || empRol(e) === rolFiltro;
    const matchBusq = !busqueda ||
      empNombre(e).toLowerCase().includes(busqueda.toLowerCase()) ||
      empInterno(e).includes(busqueda) ||
      (e.cargo ?? '').toLowerCase().includes(busqueda.toLowerCase());
    return matchRol && matchBusq;
  });

  const abrirEditar = (e: Empleado) => {
    setEditando(e);
    setEditForm({
      cargo: e.cargo ?? '',
      rol: empRol(e),
      telefono: e.telefono ?? '',
      estado: e.estado ?? 'activo',
    });
  };

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!editando) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/personal/${editando.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.ok) {
        setEmpleados(prev =>
          prev.map(e => e.id === editando.id ? { ...e, ...editForm } : e)
        );
        setEditando(null);
      } else {
        alert('Error: ' + data.error);
      }
    } catch {
      alert('Error al guardar');
    } finally {
      setSaving(false);
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
    } catch {
      alert('Error exportando');
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await DataImportService.uploadEmployees(formData);
      alert('Importación completada');
      setShowImport(false);
      cargar();
    } catch {
      alert('Error importando');
    } finally {
      setImporting(false);
    }
  };

  const porRol: Record<string, number> = {};
  for (const e of empleados) {
    const r = empRol(e) || 'sin_rol';
    porRol[r] = (porRol[r] ?? 0) + 1;
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div className="flex gap-2 flex-wrap flex-1">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              placeholder="Buscar nombre, interno, cargo..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="bg-transparent text-white text-sm flex-1 focus:outline-none placeholder:text-slate-500"
            />
          </div>
          <div className="relative">
            <select
              value={rolFiltro}
              onChange={e => setRolFiltro(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl pl-3 pr-8 py-2 text-sm text-white focus:outline-none appearance-none"
              title="Filtrar por rol"
            >
              <option value="">Todos los roles</option>
              {ROLES_LIST.map(r => (
                <option key={r} value={r}>{ROL_LABEL[r] ?? r}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <span className="self-center text-xs text-slate-500">
            {filtrados.length} de {empleados.length} empleados
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={cargar}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-sm border border-slate-700"
            title="Actualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExport}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-2 text-sm"
          >
            <FileDown className="w-4 h-4" /> Exportar
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-2 text-sm"
          >
            <FileUp className="w-4 h-4" /> Importar
          </button>
        </div>
      </div>

      {/* Stats por rol */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(porRol).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([rol, cant]) => (
          <button
            key={rol}
            onClick={() => setRolFiltro(rolFiltro === rol ? '' : rol)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
              rolFiltro === rol
                ? 'border-primary-500 bg-primary-950/30 text-primary-300'
                : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-600'
            }`}
          >
            {ROL_LABEL[rol] ?? rol}: <span className="font-bold text-white">{cant}</span>
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-primary-400" />
            <span className="text-slate-400 text-sm">Cargando empleados reales...</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60">
                <th className="text-left px-4 py-3 text-slate-400 font-medium w-16">Interno</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Cargo</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Rol</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Teléfono</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden sm:table-cell">Estado</th>
                <th className="w-12 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(e => {
                const rol = empRol(e);
                const rolClass = ROL_COLOR[rol] ?? 'bg-slate-800 text-slate-300 border-slate-700/50';
                return (
                  <tr
                    key={e.id}
                    className="border-b border-slate-800/40 hover:bg-slate-900/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-slate-300 font-semibold">
                        {empInterno(e) || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white font-medium">{empNombre(e)}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-slate-400 text-xs">{e.cargo ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${rolClass}`}>
                        {ROL_LABEL[rol] ?? rol ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {e.telefono ? (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Phone className="w-3 h-3" />{maskPhone(e.telefono)}
                        </span>
                      ) : (
                        <span className="text-slate-700 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`text-xs font-medium ${
                        (e.estado ?? 'activo') === 'activo' ? 'text-emerald-400' : 'text-slate-500'
                      }`}>
                        {e.estado ?? 'activo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => abrirEditar(e)}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title="Editar empleado"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500 text-sm">
                    {empleados.length === 0
                      ? 'No se encontraron empleados. Ejecute "Carga Datos UCOT" primero.'
                      : 'Sin resultados para los filtros aplicados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal editar empleado */}
      {editando && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">{empNombre(editando)}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Interno {empInterno(editando) || editando.id}
                </p>
              </div>
              <button onClick={() => setEditando(null)} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardar} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Cargo</label>
                <input
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
                  value={editForm.cargo}
                  onChange={e => setEditForm({ ...editForm, cargo: e.target.value })}
                  placeholder="Ej. Conductor de Ómnibus"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Rol</label>
                <div className="relative">
                  <select
                    value={editForm.rol}
                    onChange={e => setEditForm({ ...editForm, rol: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-3 pr-8 py-2 text-white text-sm focus:outline-none appearance-none focus:border-primary-500"
                    title="Rol del empleado"
                  >
                    <option value="">Sin rol</option>
                    {ROLES_LIST.map(r => (
                      <option key={r} value={r}>{ROL_LABEL[r] ?? r}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Teléfono</label>
                <input
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
                  value={editForm.telefono}
                  onChange={e => setEditForm({ ...editForm, telefono: e.target.value })}
                  placeholder="Ej. 099123456"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Estado</label>
                <div className="relative">
                  <select
                    value={editForm.estado}
                    onChange={e => setEditForm({ ...editForm, estado: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-3 pr-8 py-2 text-white text-sm focus:outline-none appearance-none focus:border-primary-500"
                    title="Estado del empleado"
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                    <option value="licencia">Licencia</option>
                    <option value="baja">Baja</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-colors"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditando(null)}
                  className="px-4 text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal importar */}
      {showImport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Importar Personal</h2>
              <button onClick={() => setShowImport(false)}>
                <X className="w-6 h-6 text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center hover:border-primary-500 transition-colors cursor-pointer">
                <input
                  type="file"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="import-rrhh-file"
                  accept=".xlsx"
                />
                <label htmlFor="import-rrhh-file" className="cursor-pointer">
                  <FileUp className="w-12 h-12 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-300">{file ? file.name : 'Vincular archivo Excel'}</p>
                </label>
              </div>
              <button
                disabled={importing || !file}
                onClick={handleImport}
                className="w-full bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl"
              >
                {importing ? 'Procesando...' : 'Iniciar Carga'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── TAB: ESTRUCTURA Y CARGOS ─────────────────────────────────────────────────
const StructureTab = () => {
  const [depts, setDepts] = useState<any[]>([]);
  const [editingDept, setEditingDept] = useState<any>(null);
  const [activeDeptId, setActiveDeptId] = useState<number | null>(null);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: '', description: '' });
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    baseSalary: '',
    extraHourValue: '',
  });

  const loadData = async () => {
    try {
      const data = await DepartmentService.getAll();
      setDepts(data);
    } catch (e) {
      console.error('Error cargando áreas:', e);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingDept) {
        await DepartmentService.update(editingDept.id, deptForm);
      } else {
        await DepartmentService.create(deptForm);
      }
      setShowDeptModal(false);
      setEditingDept(null);
      setDeptForm({ name: '', description: '' });
      loadData();
    } catch {
      alert('Error');
    }
  };

  const handleDeleteDept = async (id: number) => {
    if (!confirm('Se eliminará el área y sus cargos. ¿Confirmar?')) return;
    await DepartmentService.delete(String(id));
    loadData();
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDeptId) return;
    try {
      await DepartmentService.addRole(String(activeDeptId), {
        ...roleForm,
        baseSalary: Number(roleForm.baseSalary),
        extraHourValue: Number(roleForm.extraHourValue),
      });
      setShowRoleModal(false);
      setRoleForm({ name: '', description: '', baseSalary: '', extraHourValue: '' });
      loadData();
    } catch {
      alert('Error');
    }
  };

  const handleDeleteRole = async (roleId: number) => {
    if (!confirm('¿Eliminar cargo?')) return;
    await DepartmentService.deleteRole(String(roleId));
    loadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => {
            setEditingDept(null);
            setDeptForm({ name: '', description: '' });
            setShowDeptModal(true);
          }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nueva Área
        </button>
      </div>

      <div className="grid gap-6">
        {depts.map((dept) => (
          <div key={dept.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 bg-slate-800/50 flex justify-between items-center border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-400" />
                  {dept.name}
                </h3>
                <p className="text-sm text-slate-400">{dept.description}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingDept(dept);
                    setDeptForm({ name: dept.name, description: dept.description });
                    setShowDeptModal(true);
                  }}
                  className="p-2 hover:bg-slate-700 rounded text-slate-400"
                  aria-label={`Editar área ${dept.name}`}
                  title={`Editar área ${dept.name}`}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteDept(dept.id)}
                  className="p-2 hover:bg-red-500/20 rounded text-red-400"
                  aria-label={`Eliminar área ${dept.name}`}
                  title={`Eliminar área ${dept.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-semibold text-slate-500 uppercase">Cargos / Roles</h4>
                <button
                  onClick={() => {
                    setActiveDeptId(dept.id);
                    setShowRoleModal(true);
                  }}
                  className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Agregar Cargo
                </button>
              </div>

              {(dept.jobRoles ?? []).length === 0 ? (
                <p className="text-sm text-slate-600 italic">Sin cargos definidos.</p>
              ) : (
                <div className="space-y-2">
                  {(dept.jobRoles ?? []).map((role: any) => (
                    <div
                      key={role.id}
                      className="flex items-center justify-between p-3 bg-slate-950/50 rounded-lg border border-slate-800/50"
                    >
                      <div>
                        <div className="font-medium text-slate-200">{role.name}</div>
                        <div className="text-xs text-slate-500 flex gap-4 mt-1">
                          <span>Jornal: <span className="text-green-400">${role.baseSalary}</span></span>
                          <span>Hora Extra: <span className="text-blue-400">${role.extraHourValue}</span></span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteRole(role.id)}
                        className="text-slate-600 hover:text-red-400"
                        aria-label={`Eliminar cargo ${role.name}`}
                        title={`Eliminar cargo ${role.name}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showDeptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-slate-900 w-full max-w-sm p-6 rounded-xl border border-slate-800">
            <h3 className="font-bold text-white mb-4">
              {editingDept ? 'Editar Área' : 'Nueva Área'}
            </h3>
            <form onSubmit={handleSaveDept} className="space-y-3">
              <input
                className="input-field w-full"
                placeholder="Nombre (ej. Mantenimiento)"
                value={deptForm.name}
                onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                required
                title="Nombre del área"
                aria-label="Nombre del área"
              />
              <input
                className="input-field w-full"
                placeholder="Descripción"
                value={deptForm.description}
                onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                title="Descripción del área"
                aria-label="Descripción del área"
              />
              <button className="btn btn-primary w-full">Guardar</button>
              <button
                type="button"
                onClick={() => setShowDeptModal(false)}
                className="w-full text-center text-sm mt-2 text-slate-500"
              >
                Cancelar
              </button>
            </form>
          </div>
        </div>
      )}

      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-slate-900 w-full max-w-sm p-6 rounded-xl border border-slate-800">
            <h3 className="font-bold text-white mb-4">Nuevo Cargo</h3>
            <form onSubmit={handleSaveRole} className="space-y-3">
              <input
                className="input-field w-full"
                placeholder="Nombre (ej. Oficial Mecánico)"
                value={roleForm.name}
                onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                required
                title="Nombre del cargo"
                aria-label="Nombre del cargo"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase text-slate-500 font-bold">Valor Jornal</label>
                  <input
                    type="number"
                    className="input-field w-full"
                    placeholder="0.00"
                    value={roleForm.baseSalary}
                    onChange={(e) => setRoleForm({ ...roleForm, baseSalary: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-slate-500 font-bold">Valor H. Extra</label>
                  <input
                    type="number"
                    className="input-field w-full"
                    placeholder="0.00"
                    value={roleForm.extraHourValue}
                    onChange={(e) => setRoleForm({ ...roleForm, extraHourValue: e.target.value })}
                  />
                </div>
              </div>
              <button className="btn btn-primary w-full mt-2">Guardar Cargo</button>
              <button
                type="button"
                onClick={() => setShowRoleModal(false)}
                className="w-full text-center text-sm mt-2 text-slate-500"
              >
                Cancelar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── TAB: DESCUENTOS Y RETENCIONES ────────────────────────────────────────────
const DiscountsTab = () => {
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', type: 'PERCENTAGE', value: '' });

  const load = async () => {
    try {
      const data = await DiscountService.getAll();
      setDiscounts(data);
    } catch (_err) {
      console.error('Error cargando descuentos:', _err);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await DiscountService.create(formData);
      setShowModal(false);
      setFormData({ name: '', type: 'PERCENTAGE', value: '' });
      load();
    } catch {
      alert('Error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminar descuento?')) return;
    await DiscountService.delete(String(id));
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-blue-500/10 p-4 rounded-xl border border-blue-500/20">
        <div className="flex gap-3">
          <Receipt className="w-10 h-10 text-blue-400" />
          <div>
            <h3 className="font-bold text-white hidden md:block">Categorías de Descuentos</h3>
            <p className="text-sm text-blue-300">
              Defina descuentos fijos o porcentuales (BPS, IRPF, Sindicato).
            </p>
          </div>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary whitespace-nowrap">
          <Plus className="w-4 h-4 inline mr-2" /> Nuevo Descuento
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {discounts.map((d) => (
          <div
            key={d.id}
            className="glass-panel p-5 flex flex-col justify-between group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity">
              {d.type === 'PERCENTAGE' ? (
                <Percent className="w-16 h-16" />
              ) : (
                <DollarSign className="w-16 h-16" />
              )}
            </div>
            <div>
              <h4 className="font-bold text-lg text-white mb-1">{d.name}</h4>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-primary-400">
                  {d.type === 'PERCENTAGE' ? `${d.value}%` : `$${d.value}`}
                </span>
                <span className="text-xs text-slate-500 uppercase font-semibold">
                  {d.type === 'PERCENTAGE' ? 'Del Salario' : 'Monto Fijo'}
                </span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => handleDelete(d.id)}
                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-slate-900 w-full max-w-sm p-6 rounded-xl border border-slate-800">
            <h3 className="font-bold text-white mb-4">Nuevo Descuento</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm text-slate-400">Nombre (Concepto)</label>
                <input
                  className="input-field w-full"
                  placeholder="Ej. BPS"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-400">Tipo</label>
                  <select
                    className="input-field w-full"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    title="Tipo de descuento"
                    aria-label="Tipo de descuento"
                  >
                    <option value="PERCENTAGE">Porcentaje (%)</option>
                    <option value="FIXED">Fijo ($)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-400">Valor</label>
                  <input
                    type="number"
                    className="input-field w-full"
                    placeholder="15"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500 italic">
                {formData.type === 'PERCENTAGE'
                  ? `Se descontará el ${formData.value || 0}% del salario bruto.`
                  : `Se descontarán $${formData.value || 0} fijos.`}
              </p>
              <button className="btn btn-primary w-full mt-2">Crear Descuento</button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-full text-center text-sm mt-2 text-slate-500"
              >
                Cancelar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminRRHH;
