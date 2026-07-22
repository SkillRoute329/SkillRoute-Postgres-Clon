/**
 * IncidentCommandCenter — Centro de Mando de Incidencias en Tiempo Real
 * Refactorizado bajo las 6 Leyes del Skillmanager
 * - Multi-tenant (agency_id a través de useIncidencias)
 * - Trazabilidad y Data Provenance (is_simulated, source_system, audit_logs)
 * - Clean Code (Separación de hook, extracción de Modal)
 */

import { useState, useMemo } from 'react';
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

import { INCIDENCIA_META, tiempoRelativo } from '../../services/incidenciasService';
import PanelTrazabilidad360 from './PanelTrazabilidad360';
import { useIncidencias, type FirestoreIncidencia } from '../../hooks/useIncidencias';
import { IncidenciaModal } from './components/IncidenciaModal';

type FiltroEstado = 'TODOS' | 'ABIERTO' | 'EN_PROCESO' | 'CERRADO' | 'ANULADO';
type FiltroTipo = 'TODOS' | 'MECANICA' | 'ACCIDENTE' | 'EVASION' | 'DEMORA' | 'DRIVER_APP';

const PRIORIDAD_COLOR: Record<string, string> = {
  ALTA: 'text-red-400 bg-red-500/10',
  MEDIA: 'text-amber-400 bg-amber-500/10',
  BAJA: 'text-slate-400 bg-slate-500/10',
  CRITICA: 'text-rose-500 bg-rose-600/10 border-rose-600/30'
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

function resolveMeta(type: string | undefined) {
  const meta = INCIDENCIA_META[type ?? 'otro'];
  if (meta) {
    if (meta.color.startsWith('text-')) {
      return { label: meta.label, emoji: meta.emoji, colorClass: meta.color };
    }
    const mapped = HEX_TO_TW[meta.color] || 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    return { label: meta.label, emoji: meta.emoji, colorClass: mapped };
  }
  return { label: 'Otro', emoji: '📋', colorClass: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };
}

export default function IncidentCommandCenter() {
  const [docLimit, setDocLimit] = useState(20);
  const {
    incidencias,
    loading,
    createIncidencia,
    updateIncidencia,
    anularIncidencia,
    resolverIncidencia,
  } = useIncidencias(docLimit);

  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('ABIERTO');
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('TODOS');
  const [selected, setSelected] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  // CRUD States
  const [crudModalOpen, setCrudModalOpen] = useState(false);
  const [crudMode, setCrudMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [crudData, setCrudData] = useState<Partial<FirestoreIncidencia>>({});
  const [crudSaving, setCrudSaving] = useState(false);

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
    if (!confirm('¿Anular permanentemente esta incidencia? (Quedará registrada en la auditoría)')) return;
    await anularIncidencia(id);
  };

  const handleSaveCrud = async (data: Partial<FirestoreIncidencia>) => {
    setCrudSaving(true);
    try {
      if (crudMode === 'CREATE') {
        await createIncidencia(data);
      } else if (data.id) {
        await updateIncidencia(data.id, data);
      }
      setCrudModalOpen(false);
    } finally {
      setCrudSaving(false);
    }
  };

  const resolveFirestore = async (id: string) => {
    setResolving(id);
    try {
      await resolverIncidencia(id);
    } finally {
      setResolving(null);
    }
  };

  /* ── KPIs (Memoized) ── */
  const { totalAbiertas, totalProceso, totalCerradas, altaPrioridad } = useMemo(() => {
    return {
      totalAbiertas: incidencias.filter((i) => i.status === 'ABIERTO').length,
      totalProceso: incidencias.filter((i) => i.status === 'EN_PROCESO').length,
      totalCerradas: incidencias.filter((i) => i.status === 'CERRADO').length,
      altaPrioridad: incidencias.filter((i) => (i.priority === 'ALTA' || i.priority === 'CRITICA') && i.status !== 'CERRADO' && i.status !== 'ANULADO').length,
    };
  }, [incidencias]);

  /* ── Filtros firestore (Memoized) ── */
  const filteredIncidencias = useMemo(() => {
    return incidencias.filter((i) => {
      if (filtroEstado !== 'TODOS' && i.status !== filtroEstado) return false;
      if (filtroTipo === 'DRIVER_APP') {
        if (i.source !== 'DRIVER_APP') return false;
      } else if (filtroTipo !== 'TODOS') {
        if (i.type !== filtroTipo) return false;
      }
      return true;
    });
  }, [incidencias, filtroEstado, filtroTipo]);

  const totalVisible = filteredIncidencias.length;

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
            <p className="text-xs text-slate-500">Tiempo real · Protegido Multi-Tenant</p>
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
          <div key={kpi.label} className={`rounded-2xl p-4 border ${kpi.bg} flex items-center gap-3`}>
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
            {(['TODOS', 'MECANICA', 'ACCIDENTE', 'EVASION', 'DEMORA', 'DRIVER_APP'] as FiltroTipo[]).map((f) => (
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
          {filteredIncidencias.map((inc) => {
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
                          <span>Vehículo: <span className="text-slate-300">{inc.vehicleId}</span></span>
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
          {incidencias.length >= docLimit && (
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
          Firestore (Despacho / App) - Trazabilidad Segura
        </span>
        <span className="flex items-center gap-1.5 ml-auto">
          <TrendingUp className="w-3 h-3" />
          {totalAbiertas} pendientes · {totalCerradas} resueltas
        </span>
      </div>

      {crudModalOpen && (
        <IncidenciaModal
          mode={crudMode}
          initialData={crudData}
          onClose={() => setCrudModalOpen(false)}
          onSave={handleSaveCrud}
          saving={crudSaving}
        />
      )}
    </div>
  );
}
