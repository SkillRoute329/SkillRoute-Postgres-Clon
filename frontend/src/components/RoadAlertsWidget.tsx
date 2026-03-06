import { useState, useEffect } from 'react';
import { RoadAlertService } from '../services/api';
import { AlertTriangle, Info, ShieldAlert, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

const RoadAlertsWidget = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const auth = useAuth();
  const user = auth?.user ?? null;
  const canCreate = user?.role === 'Admin' || user?.role === 'SuperAdmin';

  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'DESVIO',
    affectedLine: '',
    severity: 'MEDIUM',
  });

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      const data = await RoadAlertService.getAll();
      if (data == null || data === undefined) {
        setAlerts([]);
        return;
      }
      setAlerts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('RoadAlertsWidget loadAlerts', error);
      setAlerts([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = form ?? {
      title: '',
      description: '',
      type: 'DESVIO',
      affectedLine: '',
      severity: 'MEDIUM',
    };
    try {
      await RoadAlertService.create({ ...f, affectedLine: (f.affectedLine ?? '') || 'Todas' });
      setShowForm(false);
      setForm({ title: '', description: '', type: 'DESVIO', affectedLine: '', severity: 'MEDIUM' });
      loadAlerts();
    } catch (error) {
      alert('Error al crear la alerta');
    }
  };

  const handleResolve = async (id: number | string) => {
    if (id == null || id === undefined) return;
    if (!confirm('¿Marcar como resuelto / finalizado?')) return;
    try {
      await RoadAlertService.resolve(String(id));
      loadAlerts();
    } catch (error) {
      alert('Error al resolver alerta');
    }
  };

  // Removed early return to ensure visibility
  // if (alerts.length === 0 && !canCreate) return null;

  return (
    <div id="road-alerts-widget" className="mb-6 space-y-4">
      {/* Header / Title */}
      <div className="flex justify-between items-center px-2">
        <h3 className="text-white font-bold flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-yellow-500" />
          <span>Alertas Viales</span>
        </h3>
        {canCreate && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="hidden md:block text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            + Reportar Novedad
          </button>
        )}
      </div>

      {/* Empty State */}
      {alerts.length === 0 && !showForm && (
        <div className="glass-panel p-4 rounded-xl border border-slate-800/50 flex items-center gap-3 opacity-60">
          <Info className="w-5 h-5 text-slate-400" />
          <span className="text-sm text-slate-400">
            No hay alertas viales activas en este momento.
          </span>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="glass-panel p-4 rounded-xl border border-yellow-500/30 animate-fade-in-up">
          <div className="flex justify-between items-center mb-3 border-b border-slate-700 pb-2">
            <span className="text-sm font-bold text-yellow-500 uppercase">Nueva Alerta</span>
            <button onClick={() => setShowForm(false)}>
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select
                className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg p-2"
                value={form?.type ?? 'DESVIO'}
                onChange={(e) =>
                  setForm((prev) => ({
                    title: prev?.title ?? '',
                    description: prev?.description ?? '',
                    type: e.target.value,
                    affectedLine: prev?.affectedLine ?? '',
                    severity: prev?.severity ?? 'MEDIUM',
                  }))
                }
              >
                <option value="DESVIO">Desvío</option>
                <option value="ACCIDENTE">Accidente</option>
                <option value="FERIA">Feria</option>
                <option value="MANIFESTACION">Manifestación</option>
                <option value="OBRAS">Obras</option>
              </select>
              <select
                className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg p-2"
                value={form?.severity ?? 'MEDIUM'}
                onChange={(e) =>
                  setForm((prev) => ({
                    title: prev?.title ?? '',
                    description: prev?.description ?? '',
                    type: prev?.type ?? 'DESVIO',
                    affectedLine: prev?.affectedLine ?? '',
                    severity: e.target.value,
                  }))
                }
              >
                <option value="LOW">Baja (Info)</option>
                <option value="MEDIUM">Media (Precaución)</option>
                <option value="HIGH">Alta (Crítico)</option>
              </select>
            </div>
            <input
              placeholder="Título Corto (Ej: Accidente Av. Italia)"
              className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg p-2"
              value={form?.title ?? ''}
              onChange={(e) =>
                setForm((prev) => ({
                  title: e.target.value,
                  description: prev?.description ?? '',
                  type: prev?.type ?? 'DESVIO',
                  affectedLine: prev?.affectedLine ?? '',
                  severity: prev?.severity ?? 'MEDIUM',
                }))
              }
              required
            />
            <input
              placeholder="Línea Afectada (Opcional)"
              className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg p-2"
              value={form?.affectedLine ?? ''}
              onChange={(e) =>
                setForm((prev) => ({
                  title: prev?.title ?? '',
                  description: prev?.description ?? '',
                  type: prev?.type ?? 'DESVIO',
                  affectedLine: e.target.value,
                  severity: prev?.severity ?? 'MEDIUM',
                }))
              }
            />
            <textarea
              placeholder="Descripción detallada del desvío o situación..."
              className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg p-2 h-20"
              value={form?.description ?? ''}
              onChange={(e) =>
                setForm((prev) => ({
                  title: prev?.title ?? '',
                  description: e.target.value,
                  type: prev?.type ?? 'DESVIO',
                  affectedLine: prev?.affectedLine ?? '',
                  severity: prev?.severity ?? 'MEDIUM',
                }))
              }
              required
            />
            <button className="w-full bg-yellow-600 hover:bg-yellow-700 text-black font-bold py-2 rounded-lg transition-colors">
              Publicar Alerta
            </button>
          </form>
        </div>
      )}

      {/* Alerts List - null-safe */}
      <div className="grid gap-3">
        {(alerts || []).filter(Boolean).map((alert) => {
          const a = alert as {
            id?: string;
            title?: string;
            description?: string;
            type?: string;
            severity?: string;
            affectedLine?: string;
            createdAt?: string;
            creado_en?: string;
          };
          const severity = a?.severity ?? 'MEDIUM';
          const dateStr = a?.creado_en ?? a?.createdAt;
          return (
            <div
              key={a?.id ?? Math.random()}
              className={clsx(
                'relative p-4 rounded-xl border-l-4 shadow-lg animate-fade-in',
                severity === 'HIGH'
                  ? 'bg-red-900/20 border-red-500'
                  : severity === 'MEDIUM'
                    ? 'bg-yellow-900/10 border-yellow-500'
                    : 'bg-blue-900/20 border-blue-500',
              )}
            >
              {canCreate && a?.id && (
                <button
                  onClick={() => handleResolve(a.id)}
                  className="absolute top-2 right-2 text-slate-400 hover:text-green-500"
                  title="Marcar Resuelto"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <div className="flex items-start gap-3">
                <div
                  className={clsx(
                    'p-2 rounded-full',
                    severity === 'HIGH'
                      ? 'bg-red-500 text-white'
                      : severity === 'MEDIUM'
                        ? 'bg-yellow-500 text-black'
                        : 'bg-blue-500 text-white',
                  )}
                >
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm uppercase flex items-center gap-2">
                    {a?.title ?? 'Sin título'}
                    {a?.affectedLine && a.affectedLine !== 'Todas' && (
                      <span className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-200">
                        Linea {a.affectedLine}
                      </span>
                    )}
                  </h4>
                  <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                    {a?.description ?? ''}
                  </p>
                  <div className="mt-2 text-[10px] text-slate-500 font-mono">
                    {dateStr ? new Date(dateStr).toLocaleString() : '—'} • {a?.type ?? 'DESVIO'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* FAB - Floating Action Button for Mobile */}
      {canCreate && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 bg-yellow-500 text-black rounded-full shadow-lg shadow-yellow-500/20 flex items-center justify-center animate-bounce-in"
        >
          <AlertTriangle className="w-6 h-6" />
        </button>
      )}
    </div>
  );
};

export default RoadAlertsWidget;
