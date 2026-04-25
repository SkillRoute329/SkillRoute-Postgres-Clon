/**
 * ParametrosOperativos.tsx — Admin > Parámetros Operativos
 * ==========================================================
 * Permite a cada operador (UCOT, CUTCSA, COME, COETC) configurar:
 *   - Turnos personales (TurnoPersonal[]) — primer/segundo/tarde/noche
 *     con horaInicio y horaFin, o turnos personalizados.
 *   - Umbrales OTP (anticipado / demorado en minutos).
 *   - Ventanas pico AM/PM (para coloreo en chart distribución horaria).
 *
 * Persistencia: parametros_operativos/{agencyId}. Si no hay doc, se
 * muestran los defaults de franjasHorarias.ts. El primer save crea el doc.
 *
 * Acceso: rol ADMIN o ROOT (controlado por firestore.rules).
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Plus, Trash2, AlertTriangle, Clock, Settings, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  loadParametrosOperativos,
  saveTurnosOperador,
  saveUmbralesOperativos,
  type ParametrosOperativos,
} from '../../services/parametrosOperativosService';
import type { TurnoPersonal } from '../../utils/franjasHorarias';
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';

const OPERADORES = [
  { codigo: 70, label: 'UCOT' },
  { codigo: 50, label: 'CUTCSA' },
  { codigo: 20, label: 'COME' },
  { codigo: 10, label: 'COETC' },
] as const;

export default function ParametrosOperativosPage() {
  const { user } = useAuth();
  const { empresaPropia: agencyId, setEmpresaPropia: setAgencyId } = useEmpresaPropia();
  const [params, setParams] = useState<ParametrosOperativos | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state local — para que los inputs sean controlled
  const [turnos, setTurnos] = useState<TurnoPersonal[]>([]);
  const [otpEarlyMin, setOtpEarlyMin] = useState<number>(5);
  const [otpLateMin, setOtpLateMin] = useState<number>(5);
  const [picoAMIni, setPicoAMIni] = useState<string>('07:00');
  const [picoAMFin, setPicoAMFin] = useState<string>('09:00');
  const [picoPMIni, setPicoPMIni] = useState<string>('17:00');
  const [picoPMFin, setPicoPMFin] = useState<string>('20:00');

  // Load al cambiar agencyId
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSuccess(null);
    (async () => {
      try {
        const p = await loadParametrosOperativos(agencyId);
        if (cancelled) return;
        setParams(p);
        setTurnos(p.turnos);
        setOtpEarlyMin(p.otpEarlyMin);
        setOtpLateMin(p.otpLateMin);
        setPicoAMIni(p.ventanaPicoAM.ini);
        setPicoAMFin(p.ventanaPicoAM.fin);
        setPicoPMIni(p.ventanaPicoPM.ini);
        setPicoPMFin(p.ventanaPicoPM.fin);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agencyId]);

  const updateTurno = (idx: number, patch: Partial<TurnoPersonal>) => {
    setTurnos((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const addTurno = () => {
    setTurnos((prev) => [
      ...prev,
      { id: `custom_${Date.now()}`, label: 'Nuevo turno', horaInicio: '00:00', horaFin: '08:00' },
    ]);
  };

  const removeTurno = (idx: number) => {
    if (turnos.length <= 1) return;
    setTurnos((prev) => prev.filter((_, i) => i !== idx));
  };

  const dirty = useMemo(() => {
    if (!params) return false;
    if (turnos.length !== params.turnos.length) return true;
    for (let i = 0; i < turnos.length; i++) {
      const t = turnos[i]!; const o = params.turnos[i]!;
      if (t.id !== o.id || t.label !== o.label || t.horaInicio !== o.horaInicio || t.horaFin !== o.horaFin) return true;
    }
    if (otpEarlyMin !== params.otpEarlyMin) return true;
    if (otpLateMin !== params.otpLateMin) return true;
    if (picoAMIni !== params.ventanaPicoAM.ini || picoAMFin !== params.ventanaPicoAM.fin) return true;
    if (picoPMIni !== params.ventanaPicoPM.ini || picoPMFin !== params.ventanaPicoPM.fin) return true;
    return false;
  }, [turnos, otpEarlyMin, otpLateMin, picoAMIni, picoAMFin, picoPMIni, picoPMFin, params]);

  const handleSave = async () => {
    if (!user?.uid) {
      setError('Usuario no autenticado');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveTurnosOperador(agencyId, turnos, user.uid);
      await saveUmbralesOperativos(agencyId, {
        otpEarlyMin,
        otpLateMin,
        ventanaPicoAM: { ini: picoAMIni, fin: picoAMFin },
        ventanaPicoPM: { ini: picoPMIni, fin: picoPMFin },
      }, user.uid);
      setSuccess('Cambios guardados. Los nuevos parámetros se aplican en próximas clasificaciones.');
      // Re-load para refrescar el estado __default
      const fresh = await loadParametrosOperativos(agencyId);
      setParams(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !params) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <Settings className="w-6 h-6 text-cyan-400" />
          Parámetros Operativos
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Configurá los turnos de personal, umbrales de cumplimiento OTP y
          ventanas pico para cada operador. Cambios entran en vigencia
          inmediatamente al guardar.
        </p>
      </header>

      {/* Selector de operador */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Operador:
        </label>
        <select
          value={agencyId}
          onChange={(e) => setAgencyId(Number(e.target.value))}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          {OPERADORES.map((o) => (
            <option key={o.codigo} value={o.codigo}>{o.label}</option>
          ))}
        </select>
        {params?.__default && (
          <span className="ml-2 text-[10px] font-bold text-amber-400 bg-amber-900/30 border border-amber-700/40 px-2 py-1 rounded">
            Sin configuración guardada — mostrando defaults
          </span>
        )}
        {params?.actualizadoEn && (
          <span className="ml-auto text-[10px] text-slate-500">
            Última edición: {params.actualizadoEn.toLocaleString('es-UY')}
          </span>
        )}
      </div>

      {/* Banners de estado */}
      {error && (
        <div className="bg-red-950/30 border border-red-700/50 rounded-lg p-3 flex items-center gap-2 text-sm text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-950/30 border border-emerald-700/50 rounded-lg p-3 flex items-center gap-2 text-sm text-emerald-300">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Sección 1: Turnos */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            Turnos de Personal
          </h2>
          <button
            onClick={addTurno}
            className="flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 px-2 py-1 rounded border border-cyan-700/40 hover:bg-cyan-900/20"
          >
            <Plus className="w-3 h-3" /> Agregar
          </button>
        </div>
        <div className="space-y-2">
          {turnos.map((t, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-950/50 p-2 rounded">
              <input
                type="text"
                value={t.id}
                onChange={(e) => updateTurno(idx, { id: e.target.value })}
                placeholder="ID"
                className="col-span-2 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 font-mono"
              />
              <input
                type="text"
                value={t.label}
                onChange={(e) => updateTurno(idx, { label: e.target.value })}
                placeholder="Etiqueta visible"
                className="col-span-4 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
              />
              <input
                type="time"
                value={t.horaInicio}
                onChange={(e) => updateTurno(idx, { horaInicio: e.target.value })}
                className="col-span-2 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-cyan-300 font-mono"
              />
              <span className="col-span-1 text-center text-slate-600">→</span>
              <input
                type="time"
                value={t.horaFin}
                onChange={(e) => updateTurno(idx, { horaFin: e.target.value })}
                className="col-span-2 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-cyan-300 font-mono"
              />
              <button
                onClick={() => removeTurno(idx)}
                disabled={turnos.length <= 1}
                className="col-span-1 text-red-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed flex justify-center"
                title="Eliminar turno"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-2">
          Los turnos pueden cruzar medianoche (ej. 20:00 → 04:30). El motor de
          franjasHorarias.ts los resuelve correctamente. ID es un identificador
          interno, label se muestra al usuario.
        </p>
      </section>

      {/* Sección 2: Umbrales OTP UITP */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Umbrales OTP (UITP / TfL)
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Anticipado máx (min)
            </span>
            <input
              type="number"
              min={1} max={30}
              value={otpEarlyMin}
              onChange={(e) => setOtpEarlyMin(Number(e.target.value))}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white font-mono"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Desviación &gt; -{otpEarlyMin}min ⇒ ANTICIPADO
            </span>
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Demorado máx (min)
            </span>
            <input
              type="number"
              min={1} max={30}
              value={otpLateMin}
              onChange={(e) => setOtpLateMin(Number(e.target.value))}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white font-mono"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Desviación &gt; +{otpLateMin}min ⇒ DEMORADO
            </span>
          </label>
        </div>
        <p className="text-[10px] text-slate-500 mt-3">
          Estándar UITP / TfL: |desviación| ≤ 5 min = A_TIEMPO. Algunos
          operadores usan +10/-5 min como umbrales asimétricos. Los cambios
          se aplican en cálculos futuros — los datos históricos NO se
          recalculan.
        </p>
      </section>

      {/* Sección 3: Ventanas pico */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-amber-400" />
          Ventanas Pico Operativas
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Pico AM</span>
            <div className="flex items-center gap-2 mt-1">
              <input type="time" value={picoAMIni} onChange={(e) => setPicoAMIni(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-amber-300 font-mono" />
              <span className="text-slate-600">→</span>
              <input type="time" value={picoAMFin} onChange={(e) => setPicoAMFin(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-amber-300 font-mono" />
            </div>
          </div>
          <div>
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Pico PM</span>
            <div className="flex items-center gap-2 mt-1">
              <input type="time" value={picoPMIni} onChange={(e) => setPicoPMIni(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-amber-300 font-mono" />
              <span className="text-slate-600">→</span>
              <input type="time" value={picoPMFin} onChange={(e) => setPicoPMFin(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-amber-300 font-mono" />
            </div>
          </div>
        </div>
      </section>

      {/* Botón save */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg shadow-lg transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
