/**
 * AdminAuditLog.tsx — Página Admin para revisar el audit log
 * =============================================================
 * Lista todos los cambios registrados por los triggers Cloud Functions
 * de auditLog.ts. Filtros por colección, usuario, fecha. Drill-down a un
 * evento específico para ver before/after/diff completo.
 *
 * Acceso: rol ADMIN/SUPERADMIN (firestore.rules audit_log read isAdminNorm).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  Timestamp,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import * as XLSX from 'xlsx';
import {
  Loader2,
  AlertTriangle,
  Search,
  Filter,
  Download,
  Eye,
  X,
  History as HistoryIcon,
  User,
  Database,
  Trash2 as TrashIcon,
  Plus,
  Edit3,
} from 'lucide-react';

interface AuditEvent {
  id: string;
  ts: Date | null;
  uid: string | null;
  email: string | null;
  action: 'create' | 'update' | 'delete';
  collection: string;
  docId: string;
  diff: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

const COLLECTIONS_OPCIONES = [
  '',
  'parametros_operativos',
  'lineas_ucot',
  'lineas',
  'vehicles',
  'vehiculos',
  'users',
  'reglas_rotacion',
  'service_definitions',
  'service_matrices',
];

const DAYS_OPCIONES = [1, 3, 7, 14, 30];

export default function AdminAuditLog() {
  const { user } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filterCollection, setFilterCollection] = useState<string>('');
  const [filterUid, setFilterUid] = useState<string>('');
  const [filterAction, setFilterAction] = useState<'' | 'create' | 'update' | 'delete'>('');
  const [days, setDays] = useState<number>(7);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Drill-down modal
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  // Load events
  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
      let q = query(
        collection(db, 'audit_log'),
        where('ts', '>=', Timestamp.fromMillis(sinceMs)),
        orderBy('ts', 'desc'),
        limit(500),
      );
      if (filterCollection) {
        q = query(
          collection(db, 'audit_log'),
          where('ts', '>=', Timestamp.fromMillis(sinceMs)),
          where('collection', '==', filterCollection),
          orderBy('ts', 'desc'),
          limit(500),
        );
      }
      const snap = await getDocs(q);
      const list: AuditEvent[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ts: data.ts?.toDate?.() ?? null,
          uid: data.uid ?? null,
          email: data.email ?? null,
          action: data.action,
          collection: data.collection,
          docId: data.docId,
          diff: data.diff ?? [],
          before: data.before ?? null,
          after: data.after ?? null,
        };
      });
      setEvents(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.uid, days, filterCollection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtros locales (uid y searchTerm para no requerir índice extra)
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filterUid && e.uid !== filterUid && e.email !== filterUid) return false;
      if (filterAction && e.action !== filterAction) return false;
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        const haystack = `${e.collection} ${e.docId} ${e.diff.join(' ')} ${e.email ?? ''}`.toLowerCase();
        if (!haystack.includes(t)) return false;
      }
      return true;
    });
  }, [events, filterUid, filterAction, searchTerm]);

  // Estadísticas rápidas
  const stats = useMemo(() => {
    const byCol: Record<string, number> = {};
    const byUid: Record<string, number> = {};
    const byAction = { create: 0, update: 0, delete: 0 };
    for (const e of filteredEvents) {
      byCol[e.collection] = (byCol[e.collection] ?? 0) + 1;
      const id = e.email ?? e.uid ?? 'system';
      byUid[id] = (byUid[id] ?? 0) + 1;
      byAction[e.action] = (byAction[e.action] ?? 0) + 1;
    }
    return { byCol, byUid, byAction };
  }, [filteredEvents]);

  const handleExport = () => {
    if (filteredEvents.length === 0) return;
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(
      filteredEvents.map((e) => ({
        Fecha: e.ts?.toLocaleString('es-UY') ?? '',
        Acción: e.action,
        Colección: e.collection,
        DocID: e.docId,
        Editor: e.email ?? e.uid ?? 'system',
        Cambios: e.diff.join(', '),
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheet, 'Audit Log');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `skillroute-audit-${date}.xlsx`);
  };

  const actionIcon = (a: AuditEvent['action']) => {
    if (a === 'create') return <Plus className="w-3 h-3 text-emerald-400" />;
    if (a === 'update') return <Edit3 className="w-3 h-3 text-cyan-400" />;
    return <TrashIcon className="w-3 h-3 text-red-400" />;
  };

  const actionColor = (a: AuditEvent['action']) =>
    a === 'create'
      ? 'border-emerald-500/30 bg-emerald-900/20 text-emerald-300'
      : a === 'update'
        ? 'border-cyan-500/30 bg-cyan-900/20 text-cyan-300'
        : 'border-red-500/30 bg-red-900/20 text-red-300';

  if (loading && events.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <header className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <HistoryIcon className="w-6 h-6 text-fuchsia-400" />
          Audit Log — Trazabilidad de cambios
        </h1>
        <p className="text-sm text-slate-400 mt-1 max-w-3xl">
          Registro inmutable de cambios sobre colecciones críticas
          (parámetros, líneas, vehículos, usuarios, rotación, servicios).
          Generado por Cloud Function triggers onWrite. Cumplimiento +
          debugging.
        </p>
      </header>

      {/* Filtros */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Días</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
          >
            {DAYS_OPCIONES.map((d) => (
              <option key={d} value={d}>{d} día{d > 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Colección</label>
          <select
            value={filterCollection}
            onChange={(e) => setFilterCollection(e.target.value)}
            className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
          >
            <option value="">Todas</option>
            {COLLECTIONS_OPCIONES.filter(Boolean).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Acción</label>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value as typeof filterAction)}
            className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
          >
            <option value="">Todas</option>
            <option value="create">Creación</option>
            <option value="update">Actualización</option>
            <option value="delete">Eliminación</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Editor (uid/email)</label>
          <input
            value={filterUid}
            onChange={(e) => setFilterUid(e.target.value)}
            placeholder="filtrar..."
            className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-white font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Búsqueda libre</label>
          <div className="relative mt-1">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="docId, campo..."
              className="w-full pl-7 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
            />
          </div>
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Total</div>
          <div className="text-2xl font-black text-fuchsia-400 mt-1">{filteredEvents.length}</div>
        </div>
        <div className="bg-slate-900/60 border border-emerald-500/20 rounded-lg p-3">
          <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-bold">Creaciones</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{stats.byAction.create}</div>
        </div>
        <div className="bg-slate-900/60 border border-cyan-500/20 rounded-lg p-3">
          <div className="text-[10px] text-cyan-400 uppercase tracking-wider font-bold">Actualizaciones</div>
          <div className="text-2xl font-black text-cyan-400 mt-1">{stats.byAction.update}</div>
        </div>
        <div className="bg-slate-900/60 border border-red-500/20 rounded-lg p-3">
          <div className="text-[10px] text-red-400 uppercase tracking-wider font-bold">Eliminaciones</div>
          <div className="text-2xl font-black text-red-400 mt-1">{stats.byAction.delete}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 col-span-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Top editores</div>
          <div className="text-[11px] text-slate-300 mt-1 truncate">
            {Object.entries(stats.byUid)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([k, v]) => `${k.split('@')[0]}:${v}`)
              .join(' · ') || '—'}
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-slate-500">
          Mostrando {filteredEvents.length} de {events.length} eventos cargados
        </span>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-300 px-3 py-1.5 rounded border border-slate-700 hover:bg-slate-800"
          >
            <Filter className="w-3 h-3" /> Recargar
          </button>
          <button
            onClick={handleExport}
            disabled={filteredEvents.length === 0}
            className="flex items-center gap-1.5 text-xs font-bold text-fuchsia-300 px-3 py-1.5 rounded border border-fuchsia-700/40 hover:bg-fuchsia-900/20 disabled:opacity-40"
          >
            <Download className="w-3 h-3" /> Exportar Excel
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-950/30 border border-red-700/50 rounded-lg p-3 flex items-center gap-2 text-sm text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Tabla principal */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
        {filteredEvents.length === 0 ? (
          <div className="p-12 text-center">
            <HistoryIcon className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-400">Sin eventos en el período seleccionado</p>
            <p className="text-xs text-slate-600 mt-1">
              Probá ampliar el rango de días o cambiá los filtros.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider font-black sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-32">Fecha</th>
                  <th className="px-3 py-2">Acción</th>
                  <th className="px-3 py-2">Colección</th>
                  <th className="px-3 py-2">DocID</th>
                  <th className="px-3 py-2">Editor</th>
                  <th className="px-3 py-2">Campos cambiados</th>
                  <th className="px-3 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredEvents.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2 text-[10px] font-mono text-slate-400">
                      {e.ts?.toLocaleString('es-UY') ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${actionColor(e.action)}`}
                      >
                        {actionIcon(e.action)}
                        {e.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-fuchsia-300">{e.collection}</td>
                    <td className="px-3 py-2 font-mono text-slate-300 truncate max-w-[200px]">
                      {e.docId}
                    </td>
                    <td className="px-3 py-2 text-slate-400 truncate max-w-[150px]">
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {e.email ?? e.uid ?? 'system'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-slate-500 truncate max-w-[300px]">
                      {e.diff.length > 0 ? e.diff.join(', ') : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setSelectedEvent(e)}
                        className="text-slate-500 hover:text-fuchsia-400 transition-colors"
                        title="Ver before/after completo"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drill-down modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-slate-950 border-b border-slate-800 p-5 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-fuchsia-400" />
                  {selectedEvent.collection}/{selectedEvent.docId}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedEvent.action.toUpperCase()} ·{' '}
                  {selectedEvent.ts?.toLocaleString('es-UY') ?? '—'} ·{' '}
                  {selectedEvent.email ?? selectedEvent.uid ?? 'system'}
                </p>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {selectedEvent.diff.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Campos modificados ({selectedEvent.diff.length})
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {selectedEvent.diff.map((f) => (
                      <span
                        key={f}
                        className="text-[10px] font-mono px-2 py-0.5 rounded border border-amber-500/30 bg-amber-900/20 text-amber-300"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2">
                    Antes
                  </h3>
                  <pre className="text-[10px] font-mono text-slate-300 bg-slate-900 border border-slate-800 rounded p-3 overflow-auto max-h-[400px]">
                    {selectedEvent.before
                      ? JSON.stringify(selectedEvent.before, null, 2)
                      : '(no existía)'}
                  </pre>
                </div>
                <div>
                  <h3 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2">
                    Después
                  </h3>
                  <pre className="text-[10px] font-mono text-slate-300 bg-slate-900 border border-slate-800 rounded p-3 overflow-auto max-h-[400px]">
                    {selectedEvent.after
                      ? JSON.stringify(selectedEvent.after, null, 2)
                      : '(eliminado)'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
