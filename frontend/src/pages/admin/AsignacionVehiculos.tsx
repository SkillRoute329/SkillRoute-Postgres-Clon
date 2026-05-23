/**
 * AsignacionVehiculos.tsx
 *
 * Panel admin/tráfico para asignar número de coche a cada conductor.
 * Sin esta asignación, la pantalla "Mi Rendimiento" del conductor
 * muestra "Sin vehículo asignado" y no puede mostrar estadísticas.
 *
 * Datos: colección `users` filtrada por rol DRIVER / CONDUCTOR.
 * Escritura: updateDoc users/{uid}.coche_id — permitido a ADMIN
 * por reglas Firestore (isAdminNorm()).
 */

import { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
} from '../../config/firestoreShim';
import { db } from '../../config/firebase';
import {
  Bus,
  Search,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Edit2,
  Check,
  X,
  Users,
  UserCheck,
  UserX,
  Info,
} from 'lucide-react';

/* ─── Tipos ───────────────────────────────────────────── */

interface DriverUser {
  uid: string;
  nombre: string;
  email: string;
  role: string;
  cocheId: string | null;
  ultimoLogin: string | null;
}

/* ─── Helpers ─────────────────────────────────────────── */

/**
 * Limpia nombres que vinieron corruptos del Excel de personal.
 * Ejemplo: "2+00+0" es una fórmula Excel exportada como texto.
 * Si el nombre parece una expresión aritmética o está vacío, devuelve '—'.
 */
function limpiarNombre(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return '—';
  const s = raw.trim();
  if (!s) return '—';
  // Detecta patrones tipo "2+00+0", "0+0", números con operadores
  if (/^[\d\s+\-*/]+$/.test(s)) return '—';
  return s;
}

/* ─── Componente ──────────────────────────────────────── */

export default function AsignacionVehiculos() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conductores, setConductores] = useState<DriverUser[]>([]);
  const [buscar, setBuscar] = useState('');
  const [filtroSinCoche, setFiltroSinCoche] = useState(false);
  const [editandoUid, setEditandoUid] = useState<string | null>(null);
  const [valorEdit, setValorEdit] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const q = query(
        collection(db, 'users'),
        where('role', 'in', ['DRIVER', 'CONDUCTOR']),
      );
      const snap = await getDocs(q);
      const lista: DriverUser[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          nombre: limpiarNombre(data.nombre ?? data.displayName ?? data.name),
          email: data.email ?? '—',
          role: data.role ?? '—',
          cocheId: data.coche_id ?? data.cocheId ?? data.vehicle ?? null,
          ultimoLogin: data.lastLogin ?? data.lastSignIn ?? null,
        };
      }).sort((a, b) => {
        // Sin coche primero, luego por nombre
        if (!a.cocheId && b.cocheId) return -1;
        if (a.cocheId && !b.cocheId) return 1;
        return a.nombre.localeCompare(b.nombre);
      });
      setConductores(lista);
    } catch {
      setError('No se pudo cargar la lista de conductores.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    if (editandoUid) inputRef.current?.focus();
  }, [editandoUid]);

  const iniciarEdicion = (c: DriverUser) => {
    setEditandoUid(c.uid);
    setValorEdit(c.cocheId ?? '');
  };

  const cancelarEdicion = () => {
    setEditandoUid(null);
    setValorEdit('');
  };

  const guardar = async (uid: string) => {
    const nuevo = valorEdit.trim();
    setGuardando(true);
    try {
      await updateDoc(doc(db, 'users', uid), { coche_id: nuevo || null });
      setConductores((prev) =>
        prev.map((c) =>
          c.uid === uid ? { ...c, cocheId: nuevo || null } : c,
        ),
      );
      setGuardadoOk(uid);
      setTimeout(() => setGuardadoOk(null), 2000);
      setEditandoUid(null);
    } catch {
      setError('No se pudo guardar. Verificá tu conexión o permisos.');
    } finally {
      setGuardando(false);
    }
  };

  /* ─── Derived ────────────────────────────── */

  const filtrados = conductores.filter((c) => {
    const texto =
      buscar === '' ||
      c.nombre.toLowerCase().includes(buscar.toLowerCase()) ||
      c.email.toLowerCase().includes(buscar.toLowerCase()) ||
      (c.cocheId ?? '').toLowerCase().includes(buscar.toLowerCase());
    const sinCoche = !filtroSinCoche || !c.cocheId;
    return texto && sinCoche;
  });

  const totalSinCoche = conductores.filter((c) => !c.cocheId).length;
  const totalConCoche = conductores.filter((c) => c.cocheId).length;

  /* ─── Render ─────────────────────────────── */

  return (
    <div className="bg-slate-950 min-h-screen p-6">
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-700/6 rounded-full blur-[160px] pointer-events-none" />

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-200">Asignación de Vehículos</h1>
          <p className="text-sm text-slate-400 mt-1">
            Asigná un número de coche a cada conductor para habilitar su autocontrol
          </p>
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-all disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Banner de transparencia — modelo de asignación en desarrollo */}
      <div
        className="bg-slate-800/50 border border-slate-700/60 rounded-xl px-4 py-3 mb-5 flex items-start gap-2.5 text-xs text-slate-400"
        title="Estamos modelando la operativa real UCOT (turnos 1°/2°/3°/nocturno, rotación correlativa de servicios, paralización IMM). El detalle del rediseño está en el documento referenciado."
      >
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500" />
        <span>
          Vista del día actual. La rotación semanal de turnos y la matriz de coches × conductores fijos están en el módulo de{' '}
          <span className="text-slate-300 font-medium">Listero Operativo</span>{' '}
          (en desarrollo).
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 text-sm">{error}</p>
            <button onClick={() => setError(null)} className="mt-1 text-xs text-red-400 underline">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Cargando */}
      {cargando && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-slate-400 text-sm">Cargando conductores…</p>
        </div>
      )}

      {!cargando && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <Users className="w-4 h-4 text-blue-400" />
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-widest">Conductores</p>
              </div>
              <p className="text-3xl font-black text-white">{conductores.length}</p>
            </div>

            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-widest">Con coche</p>
              </div>
              <p className="text-3xl font-black text-emerald-400">{totalConCoche}</p>
            </div>

            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center">
                  <UserX className="w-4 h-4 text-red-400" />
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-widest">Sin asignar</p>
              </div>
              <p className={`text-3xl font-black ${totalSinCoche > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                {totalSinCoche}
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar por nombre, email o coche…"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={() => setFiltroSinCoche((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                filtroSinCoche
                  ? 'bg-red-500/20 border-red-500/50 text-red-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserX className="w-3.5 h-3.5" />
              Solo sin asignar
            </button>
            {(buscar || filtroSinCoche) && (
              <span className="text-xs text-slate-500">
                {filtrados.length} de {conductores.length}
              </span>
            )}
          </div>

          {/* Tabla */}
          {filtrados.length === 0 ? (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-10 text-center">
              <Users className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">
                {conductores.length === 0
                  ? 'No hay conductores registrados con rol DRIVER o CONDUCTOR.'
                  : 'Ningún conductor coincide con los filtros.'}
              </p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/60 border-b border-slate-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-widest">Conductor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-widest">Rol</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-widest">Coche asignado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-widest">Estado</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filtrados.map((c) => (
                    <tr key={c.uid} className="hover:bg-slate-800/30 transition-colors">
                      {/* Conductor */}
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-200 text-sm">{c.nombre}</p>
                        <p className="text-xs text-slate-500">{c.email}</p>
                      </td>

                      {/* Rol */}
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-slate-800 border-slate-700 text-slate-400">
                          {c.role}
                        </span>
                      </td>

                      {/* Coche — inline edit */}
                      <td className="px-4 py-3">
                        {editandoUid === c.uid ? (
                          <div className="flex items-center gap-2">
                            <input
                              ref={inputRef}
                              type="text"
                              value={valorEdit}
                              onChange={(e) => setValorEdit(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') guardar(c.uid);
                                if (e.key === 'Escape') cancelarEdicion();
                              }}
                              placeholder="Nro. de coche"
                              className="w-28 px-2 py-1 text-sm bg-slate-700 border border-blue-500 rounded-lg text-white focus:outline-none"
                            />
                            <button
                              onClick={() => guardar(c.uid)}
                              disabled={guardando}
                              className="p-1 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/40 transition-all disabled:opacity-50"
                              title="Guardar"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={cancelarEdicion}
                              className="p-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-all"
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {c.cocheId ? (
                              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                                <Bus className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                {c.cocheId}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-600 italic">Sin asignar</span>
                            )}
                            {guardadoOk === c.uid && (
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                          </div>
                        )}
                      </td>

                      {/* Estado badge */}
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          c.cocheId
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : 'bg-red-500/15 border-red-500/40 text-red-300'
                        }`}>
                          {c.cocheId ? 'Habilitado' : 'Sin coche'}
                        </span>
                      </td>

                      {/* Acción */}
                      <td className="px-4 py-3 text-right">
                        {editandoUid !== c.uid && (
                          <button
                            onClick={() => iniciarEdicion(c)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-all ml-auto"
                          >
                            <Edit2 className="w-3 h-3" />
                            {c.cocheId ? 'Cambiar' : 'Asignar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Nota operativa */}
          <p className="text-xs text-slate-600 mt-4 text-center">
            El número de coche se guarda en el perfil del conductor. Entrará en efecto la próxima vez que abra "Mi Rendimiento".
          </p>
        </>
      )}
    </div>
  );
}
