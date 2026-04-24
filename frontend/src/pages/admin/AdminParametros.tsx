/**
 * AdminParametros — Gestión de parámetros del sistema con historial auditado.
 * Acceso: solo rol ADMIN.
 * Regla: nunca se edita un valor pasado — solo se agrega versión nueva con fechaDesde.
 */
import { useState, useEffect } from 'react';
import {
  Settings, Plus, Clock, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import {
  PARAMETRO_IDS, PARAMETRO_META, VersionParametro,
  getAllVersiones, agregarVersion, getValorActual,
  type ParametroId,
} from '../../services/parametrosService';
import { useAuth } from '../../context/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtFecha(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-UY', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function AdminParametros() {
  const { user } = useAuth();
  const [versiones, setVersiones] = useState<Record<ParametroId, VersionParametro[]>>(
    Object.fromEntries(PARAMETRO_IDS.map((id) => [id, []])) as Record<ParametroId, VersionParametro[]>,
  );
  const [loading, setLoading] = useState(true);
  const [tabActiva, setTabActiva] = useState<ParametroId>('tarifa_base');
  const [expandido, setExpandido] = useState<Record<ParametroId, boolean>>(
    Object.fromEntries(PARAMETRO_IDS.map((id) => [id, false])) as Record<ParametroId, boolean>,
  );

  // Estado del formulario
  const [form, setForm] = useState({ valor: '', fechaDesde: hoy(), nota: '' });
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const data = await getAllVersiones();
      setVersiones(data);
    } catch (e) {
      console.error('Error cargando parámetros:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const handleGuardar = async () => {
    setError(null);
    const valor = parseFloat(form.valor);
    if (isNaN(valor) || valor <= 0) { setError('El valor debe ser un número positivo.'); return; }
    if (!form.fechaDesde) { setError('Debés ingresar una fecha de vigencia.'); return; }
    if (!form.nota.trim()) { setError('La nota es obligatoria para trazabilidad.'); return; }

    const meta = PARAMETRO_META[tabActiva];
    const vigActual = getValorActual(versiones[tabActiva], meta.defaultValor);
    if (valor === vigActual && form.fechaDesde === hoy()) {
      setError('El valor ingresado es igual al vigente. Ingresá un valor diferente.'); return;
    }

    setGuardando(true);
    try {
      await agregarVersion(tabActiva, {
        valor,
        fechaDesde: form.fechaDesde,
        creadoPor: (user as any)?.email ?? (user as any)?.displayName ?? 'admin',
        nota: form.nota.trim(),
      });
      await cargar();
      setForm({ valor: '', fechaDesde: hoy(), nota: '' });
      setExito(true);
      setTimeout(() => setExito(false), 3000);
    } catch (e: unknown) {
      setError('Error al guardar. Verificá permisos de Firestore.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center">
            <Settings className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Parámetros del Sistema</h1>
            <p className="text-xs text-slate-500">Historial auditado — los valores pasados nunca se editan</p>
          </div>
        </div>

        {/* Banner informativo */}
        <div className="flex items-start gap-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-6">
          <Info className="w-4 h-4 text-amber-400 flex-none mt-0.5" />
          <p className="text-[11px] text-amber-200/70 leading-relaxed">
            Cada cambio genera una nueva versión con fecha de vigencia. Los cálculos históricos usan automáticamente
            el valor vigente en esa fecha. <strong className="text-amber-300">Nunca se modifica ni elimina un valor registrado.</strong>
          </p>
        </div>

        {/* Tabs de parámetros */}
        <div className="flex gap-1 mb-4 bg-slate-900 p-1 rounded-xl border border-slate-800">
          {PARAMETRO_IDS.map((id) => {
            const meta = PARAMETRO_META[id];
            const actual = getValorActual(versiones[id], meta.defaultValor);
            return (
              <button
                key={id}
                onClick={() => setTabActiva(id)}
                className={`flex-1 px-3 py-2.5 rounded-lg text-[10px] font-bold transition-all text-center ${
                  tabActiva === id
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <div className="truncate">{meta.label}</div>
                <div className={`text-[11px] font-black mt-0.5 ${tabActiva === id ? 'text-indigo-200' : 'text-slate-300'}`}>
                  {actual} <span className="font-normal text-[9px] opacity-70">{meta.unidad.split('/')[0].trim()}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Panel del parámetro activo */}
        {(() => {
          const meta = PARAMETRO_META[tabActiva];
          const hist = versiones[tabActiva];
          const actual = getValorActual(hist, meta.defaultValor);
          const mostrarHistorial = expandido[tabActiva];

          return (
            <div className="space-y-4">

              {/* Card valor actual */}
              <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest">{meta.label} — Valor vigente hoy</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-4xl font-black text-white">{actual}</span>
                      <span className="text-sm text-slate-400">{meta.unidad}</span>
                    </div>
                    {hist.length > 0 && (
                      <p className="text-[10px] text-slate-500 mt-1">
                        Vigente desde {fmtFecha(hist[0].fechaDesde)} · por {hist[0].creadoPor}
                      </p>
                    )}
                    {hist.length === 0 && (
                      <p className="text-[10px] text-amber-400 mt-1">⚠ Sin registros en Firestore — usando valor por defecto</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest">{hist.length} versión{hist.length !== 1 ? 'es' : ''}</p>
                  </div>
                </div>

                {/* Historial colapsable */}
                <button
                  onClick={() => setExpandido((p) => ({ ...p, [tabActiva]: !p[tabActiva] }))}
                  className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-white transition-colors"
                >
                  {mostrarHistorial ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {mostrarHistorial ? 'Ocultar historial' : `Ver historial completo (${hist.length} entradas)`}
                </button>

                {mostrarHistorial && hist.length > 0 && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
                    <div className="grid grid-cols-[1fr_1fr_1fr_2fr_1fr] gap-2 px-3 py-2 bg-slate-800/60 text-[9px] text-slate-500 uppercase tracking-widest">
                      <span>Valor</span>
                      <span>Vigente desde</span>
                      <span>Creado por</span>
                      <span>Nota</span>
                      <span>Registrado</span>
                    </div>
                    {hist.map((v, i) => (
                      <div
                        key={`${v.fechaDesde}-${i}`}
                        className={`grid grid-cols-[1fr_1fr_1fr_2fr_1fr] gap-2 px-3 py-2.5 text-[11px] border-t border-slate-800/60 ${
                          i === 0 ? 'bg-indigo-500/5' : ''
                        }`}
                      >
                        <span className={`font-black ${i === 0 ? 'text-indigo-300' : 'text-white'}`}>
                          {v.valor} <span className="text-slate-500 font-normal text-[9px]">{meta.unidad.split('/')[0].trim()}</span>
                        </span>
                        <span className="text-slate-300">{fmtFecha(v.fechaDesde)}</span>
                        <span className="text-slate-400 truncate">{v.creadoPor}</span>
                        <span className="text-slate-500 truncate">{v.nota}</span>
                        <span className="text-slate-600 text-[9px]">
                          {v.creadoEn ? new Date(v.creadoEn).toLocaleDateString('es-UY') : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {mostrarHistorial && hist.length === 0 && (
                  <div className="mt-3 text-center py-6 text-slate-600 text-xs border border-slate-800 rounded-lg">
                    <Clock className="w-6 h-6 mx-auto mb-2 text-slate-700" />
                    Sin historial registrado aún. El primer valor que ingreses será la versión inicial.
                  </div>
                )}
              </div>

              {/* Formulario nuevo valor */}
              <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-bold text-white">Agregar nuevo valor vigente</h2>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-[9px] text-slate-500 uppercase tracking-widest mb-1.5">
                      Nuevo valor ({meta.unidad})
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.valor}
                      onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))}
                      placeholder={String(actual)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-500 uppercase tracking-widest mb-1.5">
                      Vigente desde
                    </label>
                    <input
                      type="date"
                      value={form.fechaDesde}
                      onChange={(e) => setForm((p) => ({ ...p, fechaDesde: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-500 uppercase tracking-widest mb-1.5">
                      Creado por
                    </label>
                    <input
                      type="text"
                      value={(user as any)?.email ?? 'admin'}
                      disabled
                      className="w-full bg-slate-800/40 border border-slate-700/40 rounded-lg px-3 py-2 text-slate-500 text-sm cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-[9px] text-slate-500 uppercase tracking-widest mb-1.5">
                    Nota / Motivo del cambio <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.nota}
                    onChange={(e) => setForm((p) => ({ ...p, nota: e.target.value }))}
                    placeholder="Ej: Ajuste por decreto MTT enero 2026"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-400 text-xs mb-3">
                    <AlertCircle className="w-3.5 h-3.5 flex-none" />
                    {error}
                  </div>
                )}
                {exito && (
                  <div className="flex items-center gap-2 text-emerald-400 text-xs mb-3">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-none" />
                    Versión guardada correctamente en Firestore.
                  </div>
                )}

                <button
                  onClick={handleGuardar}
                  disabled={guardando || loading}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {guardando ? 'Guardando…' : 'Guardar nueva versión'}
                </button>
                <p className="text-[9px] text-slate-600 mt-2">
                  Al guardar, este valor entrará en vigencia desde la fecha indicada. Los valores anteriores permanecen intactos en el historial.
                </p>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
