import React, { useState, useEffect } from 'react';
import { TrendingUp, Clock, Bus, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { fetchConductorRanking, type ConductorSummary } from '../../services/autoStatsService';

function badge(pct: number) {
  if (pct >= 80) return 'bg-emerald-500/20 text-emerald-300 border border-emerald-700/40';
  if (pct >= 60) return 'bg-amber-500/20 text-amber-300 border border-amber-700/40';
  return 'bg-red-500/20 text-red-300 border border-red-700/40';
}

export const JornalesTab: React.FC = () => {
  const [conductores, setConductores] = useState<ConductorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    fetchConductorRanking('70')
      .then(r => setConductores(r.conductores ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtrados = conductores.filter(c =>
    !busqueda ||
    String(c.interno).includes(busqueda) ||
    c.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <Clock className="w-5 h-5 animate-spin mr-2" /> Cargando jornales...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-400 bg-red-500/10 rounded-lg p-4">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span>Error al cargar jornales: {error}</span>
      </div>
    );
  }

  if (conductores.length === 0) {
    return (
      <div className="text-center text-slate-400 py-12">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>Sin datos de jornales aún.</p>
        <p className="text-xs mt-1">El cron nocturno acumula jornales automáticamente cada noche a las 23:30.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div>
          <h2 className="text-white font-semibold">Jornales por Conductor</h2>
          <p className="text-xs text-slate-400">
            {conductores.length} conductores · acumulación automática diaria
          </p>
        </div>
        <input
          type="text"
          placeholder="Buscar interno o nombre..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm w-full sm:w-64 focus:border-blue-500 outline-none"
        />
      </div>

      {/* Tabla */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-left">
              <th className="px-4 py-3 text-xs text-slate-500 uppercase tracking-wider">Interno</th>
              <th className="px-4 py-3 text-xs text-slate-500 uppercase tracking-wider">Nombre</th>
              <th className="px-4 py-3 text-xs text-slate-500 uppercase tracking-wider text-center">Jornales</th>
              <th className="px-4 py-3 text-xs text-slate-500 uppercase tracking-wider text-center">OTP%</th>
              <th className="px-4 py-3 text-xs text-slate-500 uppercase tracking-wider">Última actividad</th>
              <th className="px-4 py-3 text-xs text-slate-500 uppercase tracking-wider">Coches</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtrados.map(c => (
              <React.Fragment key={c.interno}>
                <tr
                  className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                  onClick={() => setExpanded(expanded === c.interno ? null : c.interno)}
                >
                  <td className="px-4 py-3 font-mono text-blue-300 font-semibold">{c.interno}</td>
                  <td className="px-4 py-3 text-slate-200">{c.nombre}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-2xl font-black text-white">{c.diasActivos}</span>
                    <span className="text-slate-500 text-xs ml-1">días</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge(c.pctEnTiempo)}`}>
                      {c.pctEnTiempo.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{c.ultimaActividad ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {c.cochesOperados?.slice(0, 3).join(', ')}
                    {(c.cochesOperados?.length ?? 0) > 3 && ` +${(c.cochesOperados?.length ?? 0) - 3}`}
                  </td>
                  <td className="px-2 py-3 text-slate-500">
                    {expanded === c.interno ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </td>
                </tr>
                {expanded === c.interno && (
                  <tr>
                    <td colSpan={7} className="bg-slate-800/60 px-4 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div className="bg-slate-900 rounded-lg p-3 text-center">
                          <div className="text-xs text-slate-500 mb-1">Atrasado</div>
                          <div className="text-lg font-bold text-red-400">{c.pctAtrasado.toFixed(1)}%</div>
                        </div>
                        <div className="bg-slate-900 rounded-lg p-3 text-center">
                          <div className="text-xs text-slate-500 mb-1">Adelantado</div>
                          <div className="text-lg font-bold text-amber-400">{c.pctAdelantado.toFixed(1)}%</div>
                        </div>
                        <div className="bg-slate-900 rounded-lg p-3 text-center">
                          <div className="text-xs text-slate-500 mb-1">Vel. Media</div>
                          <div className="text-lg font-bold text-slate-200">{c.velocidadMedia.toFixed(0)} km/h</div>
                        </div>
                        <div className="bg-slate-900 rounded-lg p-3 text-center">
                          <div className="text-xs text-slate-500 mb-1">Total eventos GPS</div>
                          <div className="text-lg font-bold text-slate-200">{c.totalEventos.toLocaleString()}</div>
                        </div>
                      </div>
                      {/* Historial por día */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-500">
                              <th className="py-1 pr-3 text-left">Fecha</th>
                              <th className="py-1 pr-3 text-left">Coche</th>
                              <th className="py-1 pr-3 text-left">Turno</th>
                              <th className="py-1 pr-3 text-right">OTP%</th>
                              <th className="py-1 pr-3 text-right">Atr%</th>
                              <th className="py-1 text-right">Vel km/h</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...(c.historial ?? [])].reverse().map((h, i) => (
                              <tr key={i} className="border-t border-slate-700/50">
                                <td className="py-1 pr-3 font-mono">{h.fecha}</td>
                                <td className="py-1 pr-3 text-blue-300">
                                  <Bus className="w-3 h-3 inline mr-1" />{h.coche}
                                </td>
                                <td className="py-1 pr-3 text-slate-400">{h.turno ?? '—'}</td>
                                <td className="py-1 pr-3 text-right text-emerald-400">{h.pctEnTiempo.toFixed(1)}%</td>
                                <td className="py-1 pr-3 text-right text-red-400">{h.pctAtrasado.toFixed(1)}%</td>
                                <td className="py-1 text-right">{h.velocidadMedia.toFixed(0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-600 text-center flex items-center justify-center gap-1">
        <TrendingUp className="w-3 h-3" />
        Jornales = días trabajados con GPS registrado. Actualización automática cada noche a las 23:30.
      </p>
    </div>
  );
};
