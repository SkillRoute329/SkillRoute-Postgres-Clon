/**
 * AdminParametrosOperativos — UI Super Admin de parámetros operativos
 * ====================================================================
 * Cierre de Fase 1 (2026-04-23).
 *
 * Permite al Super Admin:
 *   - Ver todos los parámetros económicos/operativos del sistema
 *   - Ver fuente oficial + URL verificable + nivel de confianza + disclaimer
 *   - Editar el valor (con registro en historial)
 *   - Consultar historial de cambios por parámetro
 *   - Hacer seed inicial de defaults a Firestore
 *
 * Protección: ruta con guard roles=['ADMIN','SUPERADMIN'] + firestore.rules isAdminNorm().
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Save,
  X,
  Clock,
  ExternalLink,
  Info,
  AlertTriangle,
  CheckCircle2,
  Database,
  Edit3,
  History,
  Sparkles,
} from 'lucide-react';
import type { ParametroEconomico } from '../../config/parametros-operativos';
import {
  loadAll,
  subscribeAll,
  listParametros,
  updateParametro,
  seedInitial,
  getHistorial,
  confidenceBadgeClass,
  confidenceLabelEs,
  type HistorialEntry,
} from '../../services/firestore/parametrosOperativos';
import { useAuth } from '../../context/AuthContext';
// Sweep timestamps #74 (2026-04-23): helper Montevideo UTC-3
import { formatFechaHoraMvd } from '../../utils/formatTimestamp';

type Row = { key: string; param: ParametroEconomico };

export default function AdminParametrosOperativos() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftValor, setDraftValor] = useState<string>('');
  const [draftFuente, setDraftFuente] = useState<string>('');
  const [draftUrl, setDraftUrl] = useState<string>('');
  const [draftMotivo, setDraftMotivo] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<HistorialEntry[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [search, setSearch] = useState('');

  // ── Cargar y suscribir a cambios ────────────────────────────────────────
  useEffect(() => {
    let unsub: undefined | (() => void);
    (async () => {
      await loadAll();
      setRows(listParametros());
      setLoading(false);
      // Onsnapshot mantiene el cache al día; re-listamos tras cada cambio
      unsub = subscribeAll(() => {
        setRows(listParametros());
      });
    })();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // ── Filtrado por búsqueda ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.key.toLowerCase().includes(s) ||
        r.param.fuente?.toLowerCase().includes(s) ||
        r.param.unidad?.toLowerCase().includes(s),
    );
  }, [rows, search]);

  // ── Iniciar edición ──────────────────────────────────────────────────────
  const startEdit = (row: Row) => {
    setEditingKey(row.key);
    setDraftValor(String(row.param.valor ?? ''));
    setDraftFuente(row.param.fuente ?? '');
    setDraftUrl(row.param.fuenteUrl ?? '');
    setDraftMotivo('');
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setDraftMotivo('');
  };

  // ── Guardar cambio ───────────────────────────────────────────────────────
  const handleSave = useCallback(
    async (row: Row) => {
      setSaving(true);
      setFeedback(null);
      try {
        const valorNuevo = coerceValor(draftValor, row.param.valor);
        await updateParametro(
          row.key,
          {
            valor: valorNuevo,
            fuente: draftFuente || row.param.fuente,
            fuenteUrl: draftUrl || row.param.fuenteUrl,
          },
          draftMotivo || undefined,
        );
        setFeedback({ type: 'ok', msg: `✔ ${row.key} actualizado` });
        setEditingKey(null);
        // refresco manual por si el snapshot tarda
        await loadAll();
        setRows(listParametros());
      } catch (e: any) {
        setFeedback({ type: 'err', msg: `✘ ${e?.message ?? 'Error desconocido'}` });
      } finally {
        setSaving(false);
      }
    },
    [draftValor, draftFuente, draftUrl, draftMotivo],
  );

  // ── Seed inicial ─────────────────────────────────────────────────────────
  const handleSeed = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const { creados, existentes } = await seedInitial();
      setFeedback({
        type: 'ok',
        msg: `Seed OK — ${creados} nuevos · ${existentes} ya existentes`,
      });
      await loadAll();
      setRows(listParametros());
    } catch (e: any) {
      setFeedback({ type: 'err', msg: `Seed falló — ${e?.message ?? 'Error'}` });
    } finally {
      setSaving(false);
    }
  };

  // ── Abrir historial ──────────────────────────────────────────────────────
  const openHistory = async (key: string) => {
    setHistoryKey(key);
    setHistoryData([]);
    const data = await getHistorial(key, 15);
    setHistoryData(data);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6 space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            <Database className="w-7 h-7 text-primary-500" />
            Parámetros Operativos
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-3xl">
            Fuente única de verdad para los valores económicos y operativos que el sistema usa para
            calcular ingresos, costos, proyecciones y detecciones de competencia. Cada valor tiene
            su fuente oficial y se puede editar acá — los cambios quedan en historial con autor y
            timestamp.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar parámetro…"
            className="input-field text-xs w-48"
            aria-label="Buscar parámetro"
          />
          <button
            onClick={handleSeed}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600/90 hover:bg-primary-600 text-white text-xs font-bold border border-primary-500/30 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Seed inicial
          </button>
          <button
            onClick={async () => {
              setLoading(true);
              await loadAll();
              setRows(listParametros());
              setLoading(false);
            }}
            disabled={loading || saving}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 border border-white/5 text-xs text-slate-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          role="status"
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-red-500/10 text-red-400 border-red-500/30'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {feedback.msg}
          <button
            onClick={() => setFeedback(null)}
            className="ml-auto text-slate-500 hover:text-white"
            aria-label="Cerrar notificación"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Aviso de transparencia */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20">
        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <strong className="text-blue-300">Política de datos:</strong> los parámetros marcados como{' '}
          <em>Estimación</em> o <em>Provisional</em> son la mejor aproximación disponible sin
          ground-truth real. Algunos resultados del sistema pueden contener errores por esta razón,
          pero se basan en fuentes oficiales o literatura internacional (UITP, ANCAP, MTSS, STM,
          TRL). Actualizalos acá cuando consigas un valor más preciso. Todo cambio queda auditado.
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-white/[0.06] bg-slate-900/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5 text-xs font-bold text-slate-400 uppercase tracking-wider">
          {loading ? 'Cargando…' : `${filtered.length} parámetros`}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filtered.map((row) => (
              <ParametroRow
                key={row.key}
                row={row}
                editing={editingKey === row.key}
                draftValor={draftValor}
                draftFuente={draftFuente}
                draftUrl={draftUrl}
                draftMotivo={draftMotivo}
                setDraftValor={setDraftValor}
                setDraftFuente={setDraftFuente}
                setDraftUrl={setDraftUrl}
                setDraftMotivo={setDraftMotivo}
                onStart={() => startEdit(row)}
                onSave={() => handleSave(row)}
                onCancel={cancelEdit}
                onHistory={() => openHistory(row.key)}
                saving={saving}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal historial */}
      {historyKey && (
        <HistoryModal
          paramKey={historyKey}
          entries={historyData}
          onClose={() => setHistoryKey(null)}
        />
      )}

      {/* Footer info */}
      <p className="text-xs text-slate-600 text-center pt-4">
        Autor sesión: {user?.fullName ?? user?.email ?? 'anónimo'} · Rol: {user?.role ?? '—'}
        {' · '}
        Ver <span className="text-primary-400">FUENTES_OFICIALES.md</span> en la raíz del proyecto
        para metodología.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTES
// ═══════════════════════════════════════════════════════════════════════════

function ParametroRow({
  row,
  editing,
  draftValor,
  draftFuente,
  draftUrl,
  draftMotivo,
  setDraftValor,
  setDraftFuente,
  setDraftUrl,
  setDraftMotivo,
  onStart,
  onSave,
  onCancel,
  onHistory,
  saving,
}: {
  row: Row;
  editing: boolean;
  draftValor: string;
  draftFuente: string;
  draftUrl: string;
  draftMotivo: string;
  setDraftValor: (v: string) => void;
  setDraftFuente: (v: string) => void;
  setDraftUrl: (v: string) => void;
  setDraftMotivo: (v: string) => void;
  onStart: () => void;
  onSave: () => void;
  onCancel: () => void;
  onHistory: () => void;
  saving: boolean;
}) {
  const p = row.param;
  const badge = confidenceBadgeClass(p.confidence);
  const label = confidenceLabelEs(p.confidence);

  return (
    <div className="p-5 hover:bg-white/[0.015] transition-colors">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Columna izquierda: key + valor + unidad */}
        <div className="min-w-[250px] flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-mono text-sm font-bold text-white">{row.key}</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${badge}`}>
              {label}
            </span>
          </div>
          {editing ? (
            <div className="mt-3 space-y-2">
              <label className="text-xs text-slate-400 block">
                Valor ({p.unidad}):
                <input
                  type={typeof p.valor === 'number' ? 'number' : 'text'}
                  step="any"
                  value={draftValor}
                  onChange={(e) => setDraftValor(e.target.value)}
                  className="input-field text-sm w-full mt-1"
                  autoFocus
                />
              </label>
              <label className="text-xs text-slate-400 block">
                Fuente:
                <input
                  type="text"
                  value={draftFuente}
                  onChange={(e) => setDraftFuente(e.target.value)}
                  className="input-field text-xs w-full mt-1"
                  placeholder="Ej: ANCAP — precios gasoil oficiales"
                />
              </label>
              <label className="text-xs text-slate-400 block">
                URL de la fuente:
                <input
                  type="url"
                  value={draftUrl}
                  onChange={(e) => setDraftUrl(e.target.value)}
                  className="input-field text-xs w-full mt-1"
                  placeholder="https://…"
                />
              </label>
              <label className="text-xs text-slate-400 block">
                Motivo del cambio (opcional, queda en historial):
                <input
                  type="text"
                  value={draftMotivo}
                  onChange={(e) => setDraftMotivo(e.target.value)}
                  className="input-field text-xs w-full mt-1"
                  placeholder="Ej: ajuste de tarifa STM abril 2026"
                />
              </label>
            </div>
          ) : (
            <>
              <p className="text-2xl font-black text-primary-300 mt-2">
                {String(p.valor)}
                <span className="text-sm font-normal text-slate-500 ml-2">{p.unidad}</span>
              </p>
              {p.disclaimer && (
                <p className="text-xs text-amber-400/80 mt-2 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{p.disclaimer}</span>
                </p>
              )}
            </>
          )}
        </div>

        {/* Columna derecha: fuente + acciones */}
        <div className="min-w-[280px] flex-1 text-right space-y-1.5">
          {!editing && (
            <>
              <p className="text-xs text-slate-400">
                <strong className="text-slate-300">Fuente:</strong> {p.fuente}
              </p>
              {p.fuenteUrl && (
                <a
                  href={p.fuenteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary-400 hover:underline inline-flex items-center gap-1"
                >
                  Verificar fuente <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <p className="text-xs text-slate-600">
                Vigente desde: {p.fechaVigenciaDesde}
              </p>
            </>
          )}

          <div className="flex gap-2 justify-end pt-2 flex-wrap">
            {editing ? (
              <>
                <button
                  onClick={onSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  Guardar
                </button>
                <button
                  onClick={onCancel}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onStart}
                  disabled={!p.editableByAdmin}
                  title={p.editableByAdmin ? 'Editar valor' : 'No editable'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600/80 hover:bg-primary-600 text-white text-xs font-bold border border-primary-500/30 disabled:opacity-40"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar
                </button>
                <button
                  onClick={onHistory}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/70 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                >
                  <History className="w-3.5 h-3.5" />
                  Historial
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {p.nota && !editing && (
        <p className="text-xs text-slate-500 mt-3 italic border-t border-white/5 pt-2">{p.nota}</p>
      )}
    </div>
  );
}

function HistoryModal({
  paramKey,
  entries,
  onClose,
}: {
  paramKey: string;
  entries: HistorialEntry[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h3 className="text-lg font-black text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary-400" />
            Historial — <span className="font-mono text-primary-400">{paramKey}</span>
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1"
            aria-label="Cerrar historial"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          {entries.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              Sin historial registrado. Los cambios futuros quedarán aquí.
            </p>
          ) : (
            <div className="space-y-3">
              {entries.map((h) => (
                <div
                  key={h.id}
                  className="p-3 rounded-xl bg-slate-800/60 border border-white/5 text-xs"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="text-slate-400">Valor: </span>
                      <span className="font-mono text-red-400">
                        {String(h.valorAnterior ?? '∅')}
                      </span>
                      <span className="text-slate-500 mx-2">→</span>
                      <span className="font-mono text-emerald-400">{String(h.valorNuevo)}</span>
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      {formatFechaHoraMvd(h.timestamp, '—')}
                    </div>
                  </div>
                  <p className="text-slate-400 mt-1">
                    <strong className="text-slate-300">Por:</strong> {h.changedByName}
                  </p>
                  {h.fuenteAnterior !== h.fuenteNueva && (
                    <p className="text-slate-500 mt-1">
                      Fuente: <span className="line-through">{h.fuenteAnterior ?? '—'}</span> →{' '}
                      {h.fuenteNueva}
                    </p>
                  )}
                  {h.motivo && (
                    <p className="text-slate-400 mt-1 italic">Motivo: {h.motivo}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function coerceValor(raw: string, current: any): any {
  if (typeof current === 'number') {
    const n = Number(raw);
    if (Number.isNaN(n)) throw new Error('Valor numérico inválido');
    return n;
  }
  if (typeof current === 'boolean') return raw === 'true' || raw === '1';
  return raw;
}
