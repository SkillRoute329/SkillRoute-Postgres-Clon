import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  Settings2,
  CalendarDays,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  Tag,
  Wrench,
  BookOpen
} from 'lucide-react';
import { RotationRulesService } from '../../services/firestore/rotationRules';
import { apiClient } from '../../clients/apiClient';
import type { ReglaRotacion } from '../../types/rotation';

export const PreferenciasTab = () => {
  const [rules, setRules] = useState<ReglaRotacion[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [inputText, setInputText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [provider, setProvider] = useState<'local' | 'openai' | 'anthropic'>('local');

  const fetchRules = async () => {
    setLoadingRules(true);
    try {
      const data = await RotationRulesService.getAll();
      setRules(data);
    } catch (err) {
      console.error('Error fetching rotation rules:', err);
    } finally {
      setLoadingRules(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    setParsing(true);
    setParsedResult(null);
    setStatusMessage(null);
    try {
      const res = await apiClient.post<any>('/api/ai/parse-preferences', { 
        text: inputText,
        provider 
      });
      if (res.ok && res.data) {
        setParsedResult(res.data);
      } else {
        setStatusMessage({ type: 'error', text: 'No se pudo procesar la regla. Intente de nuevo.' });
      }
    } catch (err) {
      console.error('Error parsing preferences:', err);
      setStatusMessage({ type: 'error', text: 'Error de comunicación con el servicio de IA local.' });
    } finally {
      setParsing(false);
    }
  };

  const handleSaveRule = async () => {
    if (!parsedResult) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      await RotationRulesService.create({
        nombre: parsedResult.nombre,
        regimen: parsedResult.regimen,
        patronDescanso: parsedResult.patronDescanso,
        descripcion: parsedResult.descripcion,
        activo: true,
        maxHours: parsedResult.maxHours,
        minBreakMinutes: parsedResult.minBreakMinutes,
        avoidSplitShifts: parsedResult.avoidSplitShifts,
        lineConstraint: parsedResult.lineConstraint,
      });
      setInputText('');
      setParsedResult(null);
      setStatusMessage({ type: 'success', text: 'Regla de rotación guardada y catalogada con éxito.' });
      await fetchRules();
    } catch (err) {
      console.error('Error saving rules:', err);
      setStatusMessage({ type: 'error', text: 'Error al persistir la regla en la base de datos.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (id: string | undefined) => {
    if (!id) return;
    if (!confirm('¿Confirma que desea eliminar permanentemente esta regla de rotación?')) return;
    try {
      await RotationRulesService.delete(id);
      await fetchRules();
      setStatusMessage({ type: 'success', text: 'Regla eliminada con éxito.' });
    } catch (err) {
      console.error('Error deleting rule:', err);
      setStatusMessage({ type: 'error', text: 'Error al eliminar la regla.' });
    }
  };

  const REGIMEN_LABELS: Record<string, string> = {
    '15_15': '15x15 Rotativo',
    'semana_semana': 'Semana a Semana',
    'fijo': 'Horario Fijo',
  };

  const PATRON_LABELS: Record<string, string> = {
    'fin_de_semana_rotativo': 'Fin de Semana Rotativo',
    'sabado': 'Sábados Libres',
    'domingo': 'Domingos Libres',
    'lunes': 'Lunes Libres',
    'martes': 'Martes Libres',
    'miercoles': 'Miércoles Libres',
    'jueves': 'Jueves Libres',
    'viernes': 'Viernes Libres',
  };

  return (
    <div className="space-y-6">
      {/* Explicativo */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
          <Sparkles className="w-5 h-5 text-blue-400 animate-pulse" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
            Preference Designer — IA Copilot para Turnos
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
            Redacte las preferencias operativas del personal en lenguaje natural plano (ej. <i>"Evitar turnos partidos para la línea 103, no más de 8 horas de conducción y descanso mínimo de 45 minutos"</i>). El motor de IA local estructurará e inyectará la regla en el planificador de forma automatizada.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
              : 'bg-red-950/30 border-red-500/30 text-red-300'
          }`}
        >
          {statusMessage.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor de Preferencia Natural */}
        <section className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <form onSubmit={handleParse} className="space-y-3">
            <label className="block text-[10px] text-slate-500 uppercase font-black tracking-wider">
              Redactar Regla de Taller o Conducción (Español)
            </label>
            <textarea
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ej: Para la línea 145 los turnos no pueden exceder las 9 horas de jornada diaria y los conductores de UCOT deben gozar de un descanso mínimo de 30 minutos..."
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
            />
            
            {/* Selector de Proveedor Premium */}
            <div className="flex items-center gap-3 py-2">
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider">
                Motor de IA:
              </span>
              <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                {(['local', 'openai', 'anthropic'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvider(p)}
                    className={`px-3 py-1.5 text-[10px] font-bold rounded-md capitalize transition-all ${
                      provider === p 
                        ? p === 'openai' ? 'bg-emerald-500/20 text-emerald-400' 
                          : p === 'anthropic' ? 'bg-amber-500/20 text-amber-400' 
                          : 'bg-blue-500/20 text-blue-400'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-500">
                Usa el modelo cognitivo local para traducir lenguaje humano a JSON.
              </span>
              <button
                type="submit"
                disabled={parsing || !inputText.trim()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold py-2 px-4 rounded-xl text-xs transition-colors shrink-0"
              >
                {parsing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {parsing ? 'Analizando...' : 'Analizar Regla'}
              </button>
            </div>
          </form>

          {/* Resultado del parseo por IA */}
          {parsedResult && (
            <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-4 animate-fade-in-up">
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      Regla Estructurada Detectada
                    </span>
                    <h4 className="text-sm font-bold text-white mt-2">{parsedResult.nombre}</h4>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Score: 100% parseo
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed italic">
                  "{parsedResult.descripcion}"
                </p>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                    <span className="block text-[9px] text-slate-500 font-bold uppercase">Régimen</span>
                    <span className="text-xs font-semibold text-white">{REGIMEN_LABELS[parsedResult.regimen] ?? parsedResult.regimen}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                    <span className="block text-[9px] text-slate-500 font-bold uppercase">Descanso</span>
                    <span className="text-xs font-semibold text-white">{PATRON_LABELS[parsedResult.patronDescanso] ?? parsedResult.patronDescanso}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                    <span className="block text-[9px] text-slate-500 font-bold uppercase">Horas Máximas</span>
                    <span className="text-xs font-semibold text-white">
                      {parsedResult.maxHours ? `${parsedResult.maxHours} horas` : 'Sin límite'}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                    <span className="block text-[9px] text-slate-500 font-bold uppercase">Descanso Mínimo</span>
                    <span className="text-xs font-semibold text-white">
                      {parsedResult.minBreakMinutes ? `${parsedResult.minBreakMinutes} minutos` : 'No especifica'}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                    <span className="block text-[9px] text-slate-500 font-bold uppercase">Turnos Partidos</span>
                    <span className={`text-xs font-semibold ${parsedResult.avoidSplitShifts ? 'text-amber-400' : 'text-slate-400'}`}>
                      {parsedResult.avoidSplitShifts ? 'Evitar partidos' : 'Permitido'}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                    <span className="block text-[9px] text-slate-500 font-bold uppercase">Línea Restringida</span>
                    <span className="text-xs font-semibold text-white">
                      {parsedResult.lineConstraint ? `Línea ${parsedResult.lineConstraint}` : 'Global'}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setParsedResult(null)}
                    className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-400 text-xs font-bold"
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveRule}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {saving ? 'Guardando...' : 'Confirmar e Inyectar Regla'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Ejemplos de uso rápido */}
        <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 space-y-4">
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-slate-400" />
              Sugerencias de Redacción
            </h4>
            <p className="text-[11px] text-slate-500 mt-1">
              Haga clic sobre cualquier sugerencia para cargarla y probar el parseo táctico de IA.
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => setInputText('Limitar los turnos semanales a un máximo de 8 horas de conducción diaria y los conductores de UCOT deben gozar de domingos libres')}
              className="w-full text-left p-3 rounded-xl bg-slate-950/50 hover:bg-slate-900 border border-slate-800/60 text-[11px] text-slate-400 leading-relaxed transition-all cursor-pointer"
            >
              "Limitar los turnos semanales a un máximo de 8 horas de conducción diaria y los conductores de UCOT deben gozar de domingos libres."
            </button>
            <button
              onClick={() => setInputText('Evitar turnos partidos para la línea 121 y asegurar un descanso obligatorio de por lo menos 45 minutos')}
              className="w-full text-left p-3 rounded-xl bg-slate-950/50 hover:bg-slate-900 border border-slate-800/60 text-[11px] text-slate-400 leading-relaxed transition-all cursor-pointer"
            >
              "Evitar turnos partidos para la línea 121 y asegurar un descanso obligatorio de por lo menos 45 minutos."
            </button>
            <button
              onClick={() => setInputText('Los conductores asignados a turnos fijos tendrán sábados libres')}
              className="w-full text-left p-3 rounded-xl bg-slate-950/50 hover:bg-slate-900 border border-slate-800/60 text-[11px] text-slate-400 leading-relaxed transition-all cursor-pointer"
            >
              "Los conductores asignados a turnos fijos tendrán sábados libres."
            </button>
          </div>
        </section>
      </div>

      {/* Listado de Reglas de Rotación Guardadas */}
      <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-cyan-400" />
              Reglas de Rotación en Sistema ({rules.length})
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Políticas operativas activas inyectadas directamente en el planificador de servicios y turnos diarios.
            </p>
          </div>
          <button
            onClick={fetchRules}
            disabled={loadingRules}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-400 rounded-lg text-xs font-bold border border-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRules ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {loadingRules && rules.length === 0 ? (
          <div className="flex items-center justify-center py-12 gap-2 text-slate-500 text-xs">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Cargando catálogo de reglas...
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/80">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="px-4 py-3">Régimen</th>
                  <th className="px-4 py-3">Descanso</th>
                  <th className="px-4 py-3 text-center">Horas Máx.</th>
                  <th className="px-4 py-3 text-center">Descanso Mín.</th>
                  <th className="px-4 py-3 text-center">Turnos Partidos</th>
                  <th className="px-4 py-3 text-center">Línea</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-800/40 hover:bg-slate-900/20 text-slate-300"
                  >
                    <td className="px-4 py-3 font-bold text-white whitespace-nowrap">{r.nombre}</td>
                    <td className="px-4 py-3 max-w-xs truncate" title={r.descripcion}>{r.descripcion || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{REGIMEN_LABELS[r.regimen] ?? r.regimen}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{PATRON_LABELS[r.patronDescanso] ?? r.patronDescanso}</td>
                    <td className="px-4 py-3 text-center font-bold text-white">
                      {r.maxHours ? `${r.maxHours}h` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-white">
                      {r.minBreakMinutes ? `${r.minBreakMinutes}m` : '—'}
                    </td>
                    <td className={`px-4 py-3 text-center font-semibold ${r.avoidSplitShifts ? 'text-amber-400' : 'text-slate-500'}`}>
                      {r.avoidSplitShifts ? 'Evitar' : 'Permitido'}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-white">
                      {r.lineConstraint ? `Línea ${r.lineConstraint}` : 'Global'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDeleteRule(r.id)}
                        className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-all"
                        title="Eliminar regla"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && !loadingRules && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-500 italic">
                      No hay reglas de rotación cargadas en el sistema. Escriba una preferencia arriba para analizarla e inyectarla.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
