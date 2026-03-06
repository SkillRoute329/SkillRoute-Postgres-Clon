import { AlertTriangle, DollarSign, Clock, FileText } from 'lucide-react';

interface StatsRibbonProps {
  stats: {
    accruedWages: number;
    surchargeInvestment: number;
    pendingDocs: number;
  };
}

const StatsRibbon = ({ stats }: StatsRibbonProps) => {
  return (
    <div className="w-full bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        {/* Brand / Title */}
        <div className="flex items-center gap-2">
          <div className="bg-primary-600 p-2 rounded-lg">
            <FileText className="text-white w-5 h-5" />
          </div>
          <div>
            <h2 className="text-white font-bold text-sm uppercase tracking-wider">
              Tablero de Control
            </h2>
            <span className="text-slate-500 text-xs">UCOT Operaciones y RRHH</span>
          </div>
        </div>

        {/* Metrics */}
        <div className="flex gap-6 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
          {/* Wages */}
          <div className="flex items-center gap-3 bg-slate-800/50 px-4 py-2 rounded-xl border border-slate-700/50">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase font-bold">Jornales Devengados</p>
              <p className="text-lg font-mono font-bold text-white">
                $ {stats.accruedWages.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Surcharges */}
          <div className="flex items-center gap-3 bg-slate-800/50 px-4 py-2 rounded-xl border border-slate-700/50">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Clock className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase font-bold">Inversión Recargos</p>
              <p className="text-lg font-mono font-bold text-white">
                $ {stats.surchargeInvestment.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Alerts */}
          <div
            className={`flex items-center gap-3 px-4 py-2 rounded-xl border transition-colors ${stats.pendingDocs > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800/50 border-slate-700/50'}`}
          >
            <div
              className={`p-2 rounded-lg ${stats.pendingDocs > 0 ? 'bg-red-500/20' : 'bg-slate-700/30'}`}
            >
              <AlertTriangle
                className={`w-5 h-5 ${stats.pendingDocs > 0 ? 'text-red-400 animate-pulse' : 'text-slate-400'}`}
              />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase font-bold">Vencimientos Doc.</p>
              <p
                className={`text-lg font-mono font-bold ${stats.pendingDocs > 0 ? 'text-red-400' : 'text-slate-500'}`}
              >
                {stats.pendingDocs}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsRibbon;
