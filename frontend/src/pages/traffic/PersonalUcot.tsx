/**
 * PersonalUcot — Directorio de los 691 empleados reales UCOT
 * Fuente: Listado Líneas Claro Activas 2019 (seed ucot_personal.json).
 */
import { useState, useEffect, useCallback } from 'react';
import { Users, Search, RefreshCw, Phone, Badge, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface Empleado {
  id: string;
  interno?: string;
  internalNumber?: string;
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
  tráfico: 'Tráfico',
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
  tráfico: 'bg-cyan-900/60 text-cyan-300 border-cyan-700/50',
  TRAFFIC: 'bg-cyan-900/60 text-cyan-300 border-cyan-700/50',
  maniobrista: 'bg-rose-900/60 text-rose-300 border-rose-700/50',
  SuperAdmin: 'bg-red-900/60 text-red-300 border-red-700/50',
};

const ROLES_DISPONIBLES = [
  '', 'conductor', 'inspector', 'admin', 'mantenimiento',
  'maniobrista', 'listero', 'tráfico', 'tecnologia',
];

function empleadoInterno(e: Empleado): string {
  return e.interno ?? e.internalNumber ?? '';
}

function empleadoNombre(e: Empleado): string {
  return e.fullName ?? [e.nombre, e.apellido].filter(Boolean).join(' ') ?? e.id;
}

function empleadoRol(e: Empleado): string {
  return e.rol ?? e.role ?? '';
}

export default function PersonalUcot() {
  const { token } = useAuth();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [rolFiltro, setRolFiltro] = useState('');
  const [limite, setLimite] = useState(200);
  const [total, setTotal] = useState(0);
  const [seleccionado, setSeleccionado] = useState<Empleado | null>(null);

  const fetchPersonal = useCallback(async (rol: string, lim: number) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(lim) });
      if (rol) params.set('rol', rol);
      const res = await fetch(`/api/admin/personal?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setEmpleados(data.empleados ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPersonal(rolFiltro, limite);
  }, [rolFiltro, limite, fetchPersonal]);

  const filtrados = empleados.filter(e => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return (
      empleadoNombre(e).toLowerCase().includes(q) ||
      empleadoInterno(e).includes(q) ||
      (e.cargo ?? '').toLowerCase().includes(q)
    );
  });

  // Conteo por rol
  const porRol: Record<string, number> = {};
  for (const e of empleados) {
    const r = empleadoRol(e) || 'sin_rol';
    porRol[r] = (porRol[r] ?? 0) + 1;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Users className="w-7 h-7 text-primary-400" />
            Personal UCOT
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Directorio de {total} empleados — Listado Líneas Claro Activas 2019.
          </p>
        </div>
        <button
          onClick={() => fetchPersonal(rolFiltro, limite)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-sm border border-slate-700 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Stats por rol */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-6">
        {Object.entries(porRol)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([rol, cant]) => (
            <button
              key={rol}
              onClick={() => setRolFiltro(rolFiltro === rol ? '' : rol)}
              className={`rounded-xl p-3 border text-left transition-all ${
                rolFiltro === rol
                  ? 'border-primary-500 bg-primary-950/30'
                  : 'border-slate-800 bg-slate-900/40 hover:bg-slate-900'
              }`}
            >
              <p className="text-slate-400 text-[10px] truncate">{ROL_LABEL[rol] ?? rol}</p>
              <p className="text-xl font-bold text-white mt-0.5">{cant}</p>
            </button>
          ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            placeholder="Buscar por nombre, interno o cargo..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="bg-transparent text-white text-sm flex-1 focus:outline-none placeholder:text-slate-500"
          />
        </div>

        <div className="relative">
          <select
            value={rolFiltro}
            onChange={e => setRolFiltro(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl pl-4 pr-8 py-2 text-sm text-white focus:outline-none appearance-none"
          >
            <option value="">Todos los roles</option>
            {ROLES_DISPONIBLES.filter(Boolean).map(r => (
              <option key={r} value={r}>{ROL_LABEL[r] ?? r}</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={limite}
            onChange={e => setLimite(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-xl pl-4 pr-8 py-2 text-sm text-white focus:outline-none appearance-none"
          >
            <option value={100}>100 por página</option>
            <option value={200}>200 por página</option>
            <option value={500}>500 por página</option>
            <option value={691}>Todos (691)</option>
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <span className="self-center text-xs text-slate-500">
          {filtrados.length} {filtrados.length !== total ? `de ${total}` : ''} empleados
        </span>
      </div>

      {/* Layout: lista + detalle */}
      <div className="flex gap-5 items-start">
        {/* Tabla */}
        <div className="flex-1 overflow-x-auto rounded-xl border border-slate-800 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-8 h-8 animate-spin text-primary-400" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium w-16">Interno</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Cargo</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Rol</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Contacto</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(e => {
                  const rol = empleadoRol(e);
                  const rolClass = ROL_COLOR[rol] ?? 'bg-slate-800 text-slate-300 border-slate-700/50';
                  const esSeleccionado = seleccionado?.id === e.id;
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setSeleccionado(esSeleccionado ? null : e)}
                      className={`border-b border-slate-800/40 hover:bg-slate-900/40 transition-colors cursor-pointer ${esSeleccionado ? 'bg-primary-950/30' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-slate-300 font-semibold">
                          {empleadoInterno(e) || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-white font-medium">{empleadoNombre(e)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-400 text-xs">{e.cargo ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${rolClass}`}>
                          {ROL_LABEL[rol] ?? rol ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {e.telefono ? (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Phone className="w-3 h-3" />
                            {e.telefono}
                          </span>
                        ) : (
                          <span className="text-slate-700 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Panel de detalle */}
        {seleccionado && (
          <div className="w-72 shrink-0 sticky top-6">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary-900/50 flex items-center justify-center border border-primary-700/50">
                  <Badge className="w-6 h-6 text-primary-400" />
                </div>
                <button
                  onClick={() => setSeleccionado(null)}
                  className="text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              </div>

              <h3 className="font-bold text-white text-lg leading-tight mb-1">
                {empleadoNombre(seleccionado)}
              </h3>
              <p className="text-slate-400 text-sm mb-4">{seleccionado.cargo ?? '—'}</p>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Interno</span>
                  <span className="font-mono text-white font-bold">{empleadoInterno(seleccionado) || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Rol</span>
                  <span className={`px-2 py-0.5 rounded border text-xs font-medium ${ROL_COLOR[empleadoRol(seleccionado)] ?? 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                    {ROL_LABEL[empleadoRol(seleccionado)] ?? empleadoRol(seleccionado) ?? '—'}
                  </span>
                </div>
                {seleccionado.telefono && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Teléfono</span>
                    <span className="text-white">{seleccionado.telefono}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Estado</span>
                  <span className={`text-xs font-medium ${seleccionado.estado === 'activo' ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {seleccionado.estado ?? 'activo'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
