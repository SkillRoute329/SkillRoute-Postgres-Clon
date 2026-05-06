/**
 * AdminDisruptionsPage — Gestión de disrupciones operacionales
 * =============================================================
 * Trim+ #69 (2026-04-23)
 *
 * Lista + state machine visual para la colección `disruptions`:
 *   DETECTED → ACKNOWLEDGED → IN_PROGRESS → RESOLVED / CANCELLED
 *
 * Permite al Jefe de Tráfico / Admin crear, asignar, avanzar estado y cerrar.
 * Usa el service `services/firestore/disruptions.ts` que encapsula la lógica.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  XCircle,
  ChevronRight,
  MapPin,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useEmpresaPropia } from '../../../hooks/useEmpresaPropia';
import {
  createDisruption,
  transitionDisruption,
  subscribeActiveDisruptions,
  fetchHistory,
} from '../services/disruptionsService';
import {
  type Disruption,
  type DisruptionSeverity,
  type DisruptionStatus,
  type DisruptionType,
  VALID_TRANSITIONS,
  severityColor,
  severityEmoji,
  DisruptionTypeSchema,
  DisruptionSeveritySchema,
} from '../schemas/disruption';
import { formatFechaHoraMvd, formatRelativoMvd } from '../../../utils/formatTimestamp';

const TYPE_LABELS: Record<DisruptionType, string> = {
  DESVIO_NO_PROGRAMADO: 'Desvío no programado',
  ACCIDENTE: 'Accidente',
  FALLA_VEHICULO: 'Falla de vehículo',
  CONGESTION_TRANSITO: 'Congestión severa',
  EVENTO_MASIVO: 'Evento masivo',
  CLIMA: 'Clima',
  FALLA_INFRA: 'Falla de infraestructura',
  OTRO: 'Otro',
};

const STATUS_LABELS: Record<DisruptionStatus, string> = {
  DETECTED: 'Detectada',
  ACKNOWLEDGED: 'Atendiendo',
  IN_PROGRESS: 'En proceso',
  RESOLVED: 'Resuelta',
  CANCELLED: 'Cancelada',
};

const STATUS_COLORS: Record<DisruptionStatus, string> = {
  DETECTED: 'bg-red-500/15 text-red-400 border-red-500/30',
  ACKNOWLEDGED: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  IN_PROGRESS: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  RESOLVED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  CANCELLED: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

export default function AdminDisruptionsPage() {
  const { user } = useAuth();
  const [active, setActive] = useState<Disruption[]>([]);
  const [history, setHistory] = useState<Disruption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Disruption | null>(null);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Suscripción real-time a activas
  useEffect(() => {
    const unsub = subscribeActiveDisruptions((list) => {
      setActive(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Cargar historial al cambiar a tab history
  useEffect(() => {
    if (tab === 'history') {
      fetchHistory({ limit: 50 }).then(setHistory).catch(() => setHistory([]));
    }
  }, [tab]);

  const kpis = useMemo(() => {
    return {
      total: active.length,
      criticas: active.filter((d) => d.severidad === 'CRITICAL').length,
      mayores: active.filter((d) => d.severidad === 'MAJOR').length,
      detectadas: active.filter((d) => d.estado === 'DETECTED').length,
      atendiendo: active.filter((d) => d.estado === 'ACKNOWLEDGED' || d.estado === 'IN_PROGRESS').length,
    };
  }, [active]);

  const handleTransition = useCallback(
    async (disruption: Disruption, newStatus: DisruptionStatus) => {
      if (!disruption.id) return;
      try {
        await transitionDisruption(disruption.id, newStatus);
        setFeedback({ type: 'ok', msg: `✔ ${STATUS_LABELS[newStatus]}` });
        setTimeout(() => setFeedback(null), 3000);
      } catch (e: any) {
        setFeedback({ type: 'err', msg: `✘ ${e?.message ?? 'error'}` });
      }
    },
    [],
  );

  const list = tab === 'active' ? active : history;

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6 space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
            Disrupciones Operacionales
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-3xl">
            Control centralizado de eventos operacionales que afectan el servicio:
            desvíos no programados, accidentes, fallas de vehículos, eventos masivos.
            Workflow con state machine — cada estado audita autor y timestamp.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold shadow-lg"
            aria-label="Reportar nueva disrupción"
          >
            <Plus className="w-4 h-4" />
            Reportar disrupción
          </button>
        </div>
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div
          role="status"
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-red-500/10 text-red-400 border-red-500/30'
          }`}
        >
          {feedback.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {feedback.msg}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Activas" value={kpis.total} color="text-primary-400" />
        <KpiCard label="Críticas" value={kpis.criticas} color="text-red-500" />
        <KpiCard label="Mayores" value={kpis.mayores} color="text-orange-500" />
        <KpiCard label="Sin atender" value={kpis.detectadas} color="text-red-400" />
        <KpiCard label="En proceso" value={kpis.atendiendo} color="text-blue-400" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-900/60 rounded-xl p-1 w-fit">
        {(
          [
            ['active', 'Activas'],
            ['history', 'Historial'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === key ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-white/[0.06] bg-slate-900/60 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">
            {tab === 'active'
              ? 'Sin disrupciones activas — operación normal'
              : 'Sin disrupciones en el historial'}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {list.map((d) => (
              <DisruptionRow
                key={d.id}
                disruption={d}
                onSelect={() => setSelected(d)}
                onTransition={(newStatus) => handleTransition(d, newStatus)}
              />
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-600 text-center pt-4">
        Sesión: {user?.fullName ?? user?.email ?? 'anónimo'} · Rol: {user?.role ?? '—'}
      </p>

      {/* Modales */}
      {showCreate && (
        <CreateDisruptionModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setFeedback({ type: 'ok', msg: '✔ Disrupción reportada' });
            setTimeout(() => setFeedback(null), 3000);
          }}
        />
      )}
      {selected && <DetailModal disruption={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTES
// ═══════════════════════════════════════════════════════════════════════════

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl p-4 border border-white/[0.06] bg-slate-900/60">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function DisruptionRow({
  disruption,
  onSelect,
  onTransition,
}: {
  disruption: Disruption;
  onSelect: () => void;
  onTransition: (newStatus: DisruptionStatus) => void;
}) {
  const transitions = VALID_TRANSITIONS[disruption.estado] ?? [];

  return (
    <div className="p-4 hover:bg-white/[0.015] transition-colors">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-lg ${severityColor(disruption.severidad)}`}>
              {severityEmoji(disruption.severidad)}
            </span>
            <h3 className="text-sm font-bold text-white">{disruption.titulo}</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${STATUS_COLORS[disruption.estado]}`}>
              {STATUS_LABELS[disruption.estado]}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            <span>{TYPE_LABELS[disruption.tipo]}</span>
            <span>·</span>
            <span>
              {disruption.lineasAfectadas?.length
                ? `Líneas: ${disruption.lineasAfectadas.join(', ')}`
                : 'Toda la red'}
            </span>
            {disruption.direccionDescriptiva && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {disruption.direccionDescriptiva}
                </span>
              </>
            )}
            <span>·</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatRelativoMvd(disruption.createdAt)}
            </span>
            {disruption.reportedByName && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {disruption.reportedByName}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {transitions.map((t) => (
            <button
              key={t}
              onClick={() => onTransition(t)}
              className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all ${STATUS_COLORS[t]}`}
              title={`Mover a ${STATUS_LABELS[t]}`}
            >
              → {STATUS_LABELS[t]}
            </button>
          ))}
          <button
            onClick={onSelect}
            className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            Detalle
            <ChevronRight className="w-3 h-3 inline ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateDisruptionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const { empresaPropia } = useEmpresaPropia();
  const empresaSlug = (() => {
    switch (Number(empresaPropia)) {
      case 70: return 'ucot';
      case 50: return 'cutcsa';
      case 20: return 'come';
      case 10: return 'coetc';
      default: return 'ucot';
    }
  })();
  const [tipo, setTipo] = useState<DisruptionType>('DESVIO_NO_PROGRAMADO');
  const [severidad, setSeveridad] = useState<DisruptionSeverity>('MODERATE');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [direccion, setDireccion] = useState('');
  const [lineas, setLineas] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await createDisruption({
        tipo,
        severidad,
        titulo,
        descripcion: descripcion || undefined,
        direccionDescriptiva: direccion || undefined,
        lineasAfectadas: lineas
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean),
        operadorId: empresaSlug,
        reportedBy: (user as any)?.uid ?? 'anonymous',
        reportedByName: user?.fullName ?? user?.email ?? undefined,
      });
      onCreated();
    } catch (e: any) {
      setError(e?.message ?? 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl max-w-lg w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h3 className="text-lg font-black text-white">Nueva disrupción</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
              {error}
            </div>
          )}
          <label className="block text-xs text-slate-400">
            Tipo
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as DisruptionType)}
              className="input-field text-sm w-full mt-1"
            >
              {DisruptionTypeSchema.options.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-400">
            Severidad
            <select
              value={severidad}
              onChange={(e) => setSeveridad(e.target.value as DisruptionSeverity)}
              className="input-field text-sm w-full mt-1"
            >
              {DisruptionSeveritySchema.options.map((s) => (
                <option key={s} value={s}>
                  {severityEmoji(s)} {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-400">
            Título
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Corte calle 8 de Octubre y Propios"
              className="input-field text-sm w-full mt-1"
              autoFocus
            />
          </label>
          <label className="block text-xs text-slate-400">
            Descripción (opcional)
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              className="input-field text-sm w-full mt-1"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Ubicación descriptiva (opcional)
            <input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Av. Italia y Propios"
              className="input-field text-sm w-full mt-1"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Líneas afectadas (separadas por coma). Vacío = toda la red.
            <input
              value={lineas}
              onChange={(e) => setLineas(e.target.value)}
              placeholder="300, 306, CA1"
              className="input-field text-sm w-full mt-1"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!titulo.trim() || saving}
            className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold disabled:opacity-50"
          >
            {saving ? 'Reportando…' : 'Reportar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({
  disruption,
  onClose,
}: {
  disruption: Disruption;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl max-w-xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h3 className="text-lg font-black text-white">{disruption.titulo}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {TYPE_LABELS[disruption.tipo]} · {severityEmoji(disruption.severidad)} {disruption.severidad}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <Field label="Estado" value={STATUS_LABELS[disruption.estado]} />
          {disruption.descripcion && <Field label="Descripción" value={disruption.descripcion} />}
          {disruption.direccionDescriptiva && <Field label="Ubicación" value={disruption.direccionDescriptiva} />}
          <Field
            label="Líneas afectadas"
            value={disruption.lineasAfectadas?.length ? disruption.lineasAfectadas.join(', ') : 'Toda la red'}
          />
          <Field label="Reportada por" value={disruption.reportedByName ?? disruption.reportedBy} />
          {disruption.assignedToName && <Field label="Atendido por" value={disruption.assignedToName} />}
          <Field label="Detectada" value={formatFechaHoraMvd(disruption.detectedAt ?? disruption.createdAt)} />
          {disruption.acknowledgedAt && <Field label="Atendida" value={formatFechaHoraMvd(disruption.acknowledgedAt)} />}
          {disruption.resolvedAt && <Field label="Cerrada" value={formatFechaHoraMvd(disruption.resolvedAt)} />}
          {disruption.rootCause && <Field label="Causa raíz" value={disruption.rootCause} />}
          {disruption.accionesRealizadas && disruption.accionesRealizadas.length > 0 && (
            <Field label="Acciones" value={disruption.accionesRealizadas.join('; ')} />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</p>
      <p className="text-sm text-slate-200 mt-0.5">{value}</p>
    </div>
  );
}
