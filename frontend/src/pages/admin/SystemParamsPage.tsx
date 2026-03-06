/**
 * Parámetros del Sistema: tolerancia de desvío (min) y otros. Persistido en Firestore system_config.
 */
import { useState, useEffect } from 'react';
import { Settings, Save, Loader2 } from 'lucide-react';
import { SystemConfigService } from '../../services/firestore/systemConfig';

export default function SystemParamsPage() {
  const [toleranciaMinutos, setToleranciaMinutos] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    SystemConfigService.get()
      .then((c) => {
        setToleranciaMinutos(c.toleranciaMinutos);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await SystemConfigService.setToleranciaMinutos(toleranciaMinutos);
      setMessage('Guardado. El motor de desvíos usará ±' + toleranciaMinutos + ' min.');
    } catch (e) {
      setMessage('Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2">
        <Settings className="w-8 h-8 text-primary-400" />
        Parámetros del Sistema
      </h1>
      <p className="text-slate-400 text-sm">
        Valores leídos globalmente por el motor de desvíos (puntualidad, semáforo Listero).
      </p>
      <div className="glass-panel p-6 rounded-2xl border border-slate-700">
        <label className="block text-slate-300 font-medium mb-2">
          Margen de tolerancia (minutos)
        </label>
        <p className="text-xs text-slate-500 mb-2">
          Desvío dentro de ± este valor se considera puntual (ej. ±10 min).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={0}
            max={60}
            value={toleranciaMinutos}
            onChange={(e) => setToleranciaMinutos(Number(e.target.value) || 0)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white w-24"
          />
          <span className="text-slate-400 text-sm">minutos</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
        </div>
        {message && (
          <p
            className={
              message.startsWith('Error')
                ? 'text-red-400 mt-2 text-sm'
                : 'text-emerald-400 mt-2 text-sm'
            }
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
