/**
 * IncidentCommandCenter — Centro de Mando de Incidencias en Tiempo Real
 *
 * Lee incidencias exclusivamente desde Firestore (colección 'incidencias').
 * Unifica reportes de conductores (DRIVER_APP) y del panel de despacho.
 * Cero simulaciones — todos los datos son reales.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from '../../config/firestoreShim';
import { db } from '../../config/firebase';

import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  RefreshCw,
  MapPin,
  Zap,
  TrendingUp,
  Bus,
  Shield,
  X,
  GitMerge,
  Plus,
  Edit2,
  Trash2
} from 'lucide-react';
import {
  INCIDENCIA_META,
  tiempoRelativo,
  crearIncidenciaManual,
  actualizarIncidencia,
  eliminarIncidencia,
  type TipoIncidencia
} from '../../services/incidenciasService';
import toast from 'react-hot-toast';
import PanelTrazabilidad360 from './PanelTrazabilidad360';

/* ─── Types ───────────────────────────────────────────── */

interface FirestoreIncidencia {
  id: string;
  vehicleId?: string;
  lineaNombre?: string;
  lineaCodigo?: string;
  type?: string;
  status: 'ABIERTO' | 'EN_PROCESO' | 'CERRADO';
  priority?: 'ALTA' | 'MEDIA' | 'BAJA';
  description?: string;
  reportedBy?: { uid: string; name: string };
  createdAt?: { seconds: number; nanoseconds: number };
  source?: string;
  lat?: number;
  lng?: number;
}

type FiltroEstado = 'TODOS' | 'ABIERTO' | 'EN_PROCESO' | 'CERRADO';
type FiltroTipo = 'TODOS' | 'MECANICA' | 'ACCIDENTE' | 'EVASION' | 'DEMORA' | 'DRIVER_APP';

/* ─── Helpers ─────────────────────────────────────────── */

const PRIORIDAD_COLOR: Record<string, string> = {
  ALTA: 'text-red-400 bg-red-500/10',
  MEDIA: 'text-amber-400 bg-amber-500/10',
  BAJA: 'text-slate-400 bg-slate-500/10',
};

const HEX_TO_TW: Record<string, string> = {
  '#f97316': 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  '#ef4444': 'text-red-400 bg-red-500/10 border-red-500/20',
  '#eab308': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  '#dc2626': 'text-red-500 bg-red-600/10 border-red-600/20',
  '#f59e0b': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  '#8b5cf6': 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  '#64748b': 'text-slate-400 bg-slate-500/10 border-slate-500/20',
};

function resolveMeta(type: string | undefined): {
  label: string;
  emoji: string;
  colorClass: string;
} {
  const meta = INCIDENCIA_META[type ?? 'otro'];
  if (meta) {
    if (meta.color.startsWith('text-')) {
      return { label: meta.label, emoji: meta.emoji, colorClass: meta.color };
    }
    const mapped = HEX_TO_TW[meta.color] || 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    return {
      label: meta.label,
      emoji: meta.emoji,
      colorClass: mapped,
    };
  }
  return {
    label: 'Otro',
    emoji: '📋',
    colorClass: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  };
}

/* ─── Component ───────────────────────────────────────── */

export default function IncidentCommandCenter() {
  const [firestoreInc, setFirestoreInc] = useState<FirestoreIncidencia[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('ABIERTO');
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('TODOS');
  const [loading, setLoading] = useState(true);
  const [docLimit, setDocLimit] = useState(20);
  const [selected, setSelected] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  
  // CRUD States
  const [crudModalOpen, setCrudModalOpen] = useState(false);
  const [crudMode, setCrudMode] = useState<'CREATE'|'EDIT'>('CREATE');
  const [crudData, setCrudData] = useState<any>({});
  const [crudSaving, setCrudSaving] = useState(false);

  /* ── Firestore live listener ── */
  useEffect(() => {
    let isMounted = true;
    const q = query(collection(db, 'incidencias'), orderBy('createdAt', 'desc'), limit(docLimit));
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!isMounted) return;
        setFirestoreInc(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FirestoreIncidencia, 'id'>) })),
        );
        setLoading(false);
      },
      () => {
        if (isMounted) setLoading(false);
      },
    );
    return () => {
      isMounted = false;
      unsub();
    };
  }, [docLimit]);

  /* ── CRUD Handlers ── */
  const handleOpenCreate = () => {
    setCrudMode('CREATE');
    setCrudData({ type: 'otro', description: '', priority: 'MEDIA', vehicleId: '' });
    setCrudModalOpen(true);
  };

  const handleOpenEdit = (inc: FirestoreIncidencia) => {
    setCrudMode('EDIT');
    setCrudData({ 
      id: inc.id,
      type: inc.type, 
      description: inc.description || '', 
      priority: inc.priority || 'MEDIA', 
      vehicleId: inc.vehicleId || '' 
    });
    setCrudModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Anular permanentemente esta incidencia?')) return;
    try {
      await eliminarIncidencia(id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveCrud = async () => {
    setCrudSaving(true);
    try {
      if (crudMode === 'CREATE') {
        await crearIncidenciaManual(crudData.type, crudData.description, crudData.priority, crudData.vehicleId);
      } else {
        await actualizarIncidencia(crudData.id, {
          type: crudData.type,
          description: crudData.description,
          priority: crudData.priority,
          vehicleId: crudData.vehicleId
        });
      }
      setCrudModalOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setCrudSaving(false);
    }
  };

  /* ── Resolver incidencia Firestore ── */
  const resolveFirestore = async (id: string) => {
    setResolving(id);
    try {
      await updateDoc(doc(db, 'incidencias', id), {
        status: 'CERRADO',
        closedAt: serverTimestamp(),
      });
      toast.success('Incidencia resuelta exitosamente');
    } catch (e) {
      console.error('Error resolviendo incidencia:', e);
      toast.error('Error al intentar resolver la incidencia. Compruebe su conexión.');
    } finally {
      setResolving(null);
    }
  };

  /* ── KPIs (Memoized) ── */
  const { totalAbiertas, totalProceso, totalCerradas, altaPrioridad } = useMemo(() => {
    return {
      totalAbiertas: firestoreInc.filter((i) => i.status === 'ABIERTO').length,
      totalProceso: firestoreInc.filter((i) => i.status === 'EN_PROCESO').length,
      totalCerradas: firestoreInc.filter((i) => i.status === 'CERRADO').length,
      altaPrioridad: firestoreInc.filter((i) => i.priority === 'ALTA' && i.status !== 'CERRADO').length,
    };
  }, [firestoreInc]);

  /* ── Filtros firestore (Memoized) ── */
  const filteredFirestore = useMemo(() => {
    return firestoreInc.filter((i) => {
      if (filtroEstado !== 'TODOS' && i.status !== filtroEstado) return false;

      if (filtroTipo === 'DRIVER_APP') {
        if (i.source !== 'DRIVER_APP') return false;
      } else if (filtroTipo !== 'TODOS') {
        if (i.type !== filtroTipo) return false;
      }

      return true;
    });
  }, [firestoreInc, filtroEstado, filtroTipo]);

  const totalVisible = filteredFirestore.length;

  /* ─── RENDER ─────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">
              Centro de Mando — Incidencias
            </h1>
            <p className="text-xs text-slate-500">Tiempo real · Firestore Central</p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Abiertas',
            value: totalAbiertas,
            icon: AlertTriangle,
            color: 'text-red-400',
            bg: 'bg-red-500/10 border-red-500/20',
            pulse: totalAbiertas > 0,
          },
          {
            label: 'En proceso',
            value: totalProceso,
            icon: Clock,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10 border-amber-500/20',
            pulse: false,
          },
          {
            label: 'Alta prioridad',
            value: altaPrioridad,
            icon: Zap,
            color: 'text-orange-400',
            bg: 'bg-orange-500/10 border-orange-500/20',
            pulse: altaPrioridad > 0,
          },
          {
            label: 'Cerradas hoy',
            value: totalCerradas,
            icon: CheckCircle,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10 border-emerald-500/20',
            pulse: false,
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-2xl p-4 border ${kpi.bg} flex items-center gap-3`}
          >
            <div className="relative">
              <kpi.icon className={`w-6 h-6 ${kpi.color}`} />
              {kpi.pulse && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-ping" />
              )}
            </div>
            <div>
              <p className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-slate-500">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {/* Estado */}
          <div className="flex items-center gap-1 bg-slate-800/40 rounded-xl p-1 border border-white/5">
            <Filter className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
            {(['TODOS', 'ABIERTO', 'EN_PROCESO', 'CERRADO', 'ANULADO'] as FiltroEstado[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltroEstado(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filtroEstado === f
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {f === 'EN_PROCESO' ? 'EN PROCESO' : f}
            </button>
          ))}
        </div>
        {/* Tipo */}
        <div className="flex items-center gap-1 bg-slate-800/40 rounded-xl p-1 border border-white/5">
          <Bus className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
          {(
            ['TODOS', 'MECANICA', 'ACCIDENTE', 'EVASION', 'DEMORA', 'DRIVER_APP'] as FiltroTipo[]
          ).map((f) => (
            <button
              key={f}
              onClick={() => setFiltroTipo(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filtroTipo === f
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {f === 'TODOS'
                ? 'TODOS'
                : f === 'DRIVER_APP'
                  ? '🚌 CONDUCTORES'
                  : resolveMeta(f).emoji + ' ' + resolveMeta(f).label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-500/20"
        >
          <Plus className="w-4 h-4" />
          Nueva Incidencia
        </button>
      </div>
    </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-red-500" />
        </div>
      ) : totalVisible === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
          <CheckCircle className="w-12 h-12 text-emerald-500/40" />
          <p className="text-sm font-semibold">Sin incidencias activas con estos filtros</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Firestore incidents */}
          {filteredFirestore.map((inc) => {
            const meta = resolveMeta(inc.type);
            const isOpen = inc.status === 'ABIERTO' || inc.status === 'EN_PROCESO';
            const isDriverApp = inc.source === 'DRIVER_APP';

            return (
              <div
                key={inc.id}
                className={`rounded-2xl border p-4 transition-all cursor-pointer ${
                  selected === inc.id
                    ? 'border-blue-500/50 bg-blue-500/5'
                    : isDriverApp
                      ? isOpen
                        ? 'border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40'
                        : 'border-white/[0.04] bg-slate-900/30 opacity-60'
                      : isOpen
                        ? 'border-white/[0.06] bg-slate-900/60 hover:border-white/10'
                        : 'border-white/[0.04] bg-slate-900/30 opacity-60'
                }`}
                onClick={() => setSelected(selected === inc.id ? null : inc.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-black border shrink-0 ${meta.colorClass}`}
                    >
                      {meta.emoji} {meta.label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {inc.description ?? `Incidencia ${inc.type}`}
                      </p>
                      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                        {inc.vehicleId && (
                          <span>
                            Vehículo: <span className="text-slate-300">{inc.vehicleId}</span>
                          </span>
                        )}
                        {inc.lineaNombre && (
                          <span className="flex items-center gap-1">
                            <Bus className="w-3 h-3" /> {inc.lineaNombre}
                          </span>
                        )}
                        {inc.reportedBy && (
                          <span>
                            · por{' '}
                            <span className="text-slate-300">
                              {inc.reportedBy.name && inc.reportedBy.name !== inc.reportedBy.uid
                                ? inc.reportedBy.name
                                : 'Conductor sin identificar'}
                            </span>
                          </span>
                        )}
                        {inc.lat && inc.lng && (
                          <span className="flex items-center gap-1 ml-2">
                            <MapPin className="w-3 h-3" />
                            {inc.lat.toFixed(4)}, {inc.lng.toFixed(4)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isDriverApp && (
                      <span className="px-2 py-0.5 rounded-lg text-xs font-bold transition-colors bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        CONDUCTOR
                      </span>
                    )}
                    {inc.priority && (
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-lg transition-colors ${PRIORIDAD_COLOR[inc.priority]}`}
                      >
                        {inc.priority}
                      </span>
                    )}
                    <span className="text-xs text-slate-500">
                      {inc.createdAt ? tiempoRelativo(inc.createdAt.seconds) : '—'}
                    </span>

                    {isOpen && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenEdit(inc); }}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-all"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(inc.id); }}
                          className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all"
                          title="Anular (Soft-Delete)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void resolveFirestore(inc.id);
                          }}
                          disabled={resolving === inc.id}
                          className="flex items-center gap-1 px-2 py-1 ml-1 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25 transition-all disabled:opacity-50"
                        >
                          {resolving === inc.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle className="w-3 h-3" />
                          )}
                          Resolver
                        </button>
                      </div>
                    )}
                    {!isOpen && inc.status !== 'ANULADO' && (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-700/40 text-slate-500 text-xs">
                        <X className="w-3 h-3" /> Cerrada
                      </span>
                    )}
                    {!isOpen && inc.status === 'ANULADO' && (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/10 text-rose-500 text-xs font-bold">
                        <Trash2 className="w-3 h-3" /> Anulada
                      </span>
                    )}
                  </div>
                </div>
                {/* Expanded - Trazabilidad 360 */}
                {selected === inc.id && (
                  <div className="mt-4 pt-4 border-t border-white/10 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-2 mb-3 px-2 text-indigo-400">
                      <GitMerge className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Trazabilidad 360° Activa</span>
                    </div>
                    <div className="bg-slate-950/50 rounded-xl overflow-hidden border border-white/5">
                      <PanelTrazabilidad360 incidentId={inc.id} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {/* Botón Cargar Más */}
          {firestoreInc.length >= docLimit && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => setDocLimit(prev => prev + 20)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold border border-slate-700 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-3 h-3" />
                Cargar más registros antiguos
              </button>
            </div>
          )}
        </div>
      )}

      {/* Source Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-600 border-t border-white/5 pt-4">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Firestore (Despacho / App)
        </span>
        <span className="flex items-center gap-1.5 ml-auto">
          <TrendingUp className="w-3 h-3" />
          {totalAbiertas} pendientes · {totalCerradas} resueltas
        </span>
      </div>

      {/* CRUD Modal */}
      {crudModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-white/5">
              <h3 className="text-lg font-bold text-white">
                {crudMode === 'CREATE' ? 'Crear Incidencia' : 'Editar Incidencia'}
              </h3>
              <button onClick={() => setCrudModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Tipo</label>
                <select 
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  value={crudData.type}
                  onChange={e => setCrudData({...crudData, type: e.target.value})}
                >
                  {Object.keys(INCIDENCIA_META).map(k => (
                    <option key={k} value={k}>{INCIDENCIA_META[k].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Prioridad</label>
                <select 
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  value={crudData.priority}
                  onChange={e => setCrudData({...crudData, priority: e.target.value})}
                >
                  <option value="BAJA">Baja</option>
                  <option value="MEDIA">Media</option>
                  <option value="ALTA">Alta</option>
                  <option value="CRITICA">Crítica</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nº Vehículo (Opcional)</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Ej: 35"
                  value={crudData.vehicleId}
                  onChange={e => setCrudData({...crudData, vehicleId: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Descripción</label>
                <textarea 
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 min-h-[80px]"
                  placeholder="Detalles de la incidencia..."
                  value={crudData.description}
                  onChange={e => setCrudData({...crudData, description: e.target.value})}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-white/5 bg-slate-900/50">
              <button 
                onClick={() => setCrudModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveCrud}
                disabled={crudSaving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50"
              >
                {crudSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

