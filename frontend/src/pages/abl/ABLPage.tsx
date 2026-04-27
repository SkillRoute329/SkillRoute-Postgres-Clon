import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, Clock, AlertTriangle, Bus, Search } from 'lucide-react';
import { BulletinService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import clsx from 'clsx';

const StatCard = ({ title, value, subtext, icon: Icon, colorClass }: any) => (
  <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative overflow-hidden group hover:border-slate-700 transition-colors">
    <div
      className={clsx(
        'absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity',
        colorClass,
      )}
    >
      <Icon className="w-16 h-16" />
    </div>
    <div className="relative z-10">
      <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-2">{title}</h3>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      <p className={clsx('text-xs font-medium', colorClass)}>{subtext}</p>
    </div>
  </div>
);

const ABLPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);

  // Admin Filter
  const [searchBus, setSearchBus] = useState('');
  const [busStats, setBusStats] = useState<any>(null);

  const isAdmin =
    user?.role === 'Admin' || user?.role === 'SuperAdmin' || user?.role === 'TrafficChief';

  useEffect(() => {
    loadMyStats();
  }, []);

  const loadMyStats = async () => {
    setLoading(true);
    try {
      const data = await BulletinService.getMyStats();
      setStats(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchBus = async () => {
    if (!searchBus) return;
    try {
      const data = await BulletinService.getVehicleStats(searchBus);
      setBusStats(data);
    } catch (error) {
      alert('No se encontraron datos para este coche.');
      setBusStats(null);
    }
  };

  if (loading && !stats)
    return <div className="p-8 text-center text-slate-500">Cargando ABL...</div>;

  return (
    <div className="space-y-8 animate-fade-in-up pb-24">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="w-8 h-8 text-indigo-500" />
          ABL - Análisis y Boletines
        </h1>
        <p className="text-slate-400 text-sm">Monitoreo operativo y logística.</p>
      </div>

      {/* Personal Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Puntualidad"
          value={stats?.onTimeRate != null ? stats.onTimeRate + '%' : '—'}
          subtext={
            stats?.onTimeRate > 90
              ? 'Excelente'
              : stats?.onTimeRate > 75
                ? 'Regular'
                : 'Atención Requerida'
          }
          icon={Clock}
          colorClass={
            stats?.onTimeRate > 90
              ? 'text-emerald-500'
              : stats?.onTimeRate > 75
                ? 'text-yellow-500'
                : 'text-red-500'
          }
        />
        <StatCard
          title="Retraso Promedio"
          value={(stats?.avgDelay || 0) + ' min'}
          subtext="Tiempo de desvío"
          icon={AlertTriangle}
          colorClass={(stats?.avgDelay || 0) < 2 ? 'text-emerald-500' : 'text-red-500'}
        />
        <StatCard
          title="Pasajeros Prom."
          value={stats?.avgOccupancy || 0}
          subtext="Promedio por viaje"
          icon={Users}
          colorClass="text-blue-500"
        />
        <StatCard
          title="Servicios Auditados"
          value={stats?.totalTrips || 0}
          subtext="Últimos 30 días"
          icon={TrendingUp}
          colorClass="text-indigo-500"
        />
      </div>

      {/* Admin Section */}
      {isAdmin && (
        <div className="mt-12 border-t border-slate-800 pt-8">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Bus className="w-6 h-6 text-indigo-500" />
            Análisis Avanzado (Admin/Jefes)
          </h2>

          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-2xl">
            <div className="flex gap-4 mb-6">
              <input
                type="text"
                placeholder="Número de Coche (Ej: 101)"
                value={searchBus}
                onChange={(e) => setSearchBus(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-white outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleSearchBus}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold transition-colors flex items-center gap-2"
              >
                <Search className="w-5 h-5" /> Buscar
              </button>
            </div>

            {busStats && (
              <div className="grid grid-cols-3 gap-4 animate-fade-in">
                <div className="bg-slate-800 p-4 rounded-xl text-center">
                  <div className="text-xs text-slate-400 uppercase mb-1">Puntualidad</div>
                  <div className="text-2xl font-bold text-white">
                    {100 - (busStats.avgDelay > 5 ? 20 : 0)}%
                  </div>
                </div>
                <div className="bg-slate-800 p-4 rounded-xl text-center">
                  <div className="text-xs text-slate-400 uppercase mb-1">Carga Prom.</div>
                  <div className="text-2xl font-bold text-blue-400">{busStats.avgOccupancy}</div>
                </div>
                <div className="bg-slate-800 p-4 rounded-xl text-center">
                  <div className="text-xs text-slate-400 uppercase mb-1">Muestra</div>
                  <div className="text-2xl font-bold text-slate-300">{busStats.sampleSize}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ABLPage;
