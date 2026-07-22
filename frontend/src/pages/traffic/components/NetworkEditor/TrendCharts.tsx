import React from 'react';
import { Route, MapPin, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import type { TrendData, MonthlyTrend } from './types';

interface TrendChartsProps {
  trends: TrendData | null;
  baseDistance: number;
  compDistance: number;
  sharedDistance: number;
  allowedLineas: any[];
  selectedLinea: string;
  allLineas: any[];
}

const formatMonthName = (yyyyMm: string) => {
  if (!yyyyMm) return '';
  const [year, month] = yyyyMm.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  const monthName = date.toLocaleString('es-UY', { month: 'long' });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
};

export const renderEvolution = (trendList: MonthlyTrend[]) => {
  if (!trendList || trendList.length < 2) return null;
  const last = trendList[trendList.length - 1].boarding;
  const prev = trendList[trendList.length - 2].boarding;
  const diff = last - prev;
  if (prev === 0) return null;
  const pct = (diff / prev) * 100;
  const isPos = diff > 0;
  
  return (
    <div className="flex-1 pl-4">
      <div className="text-xs uppercase text-slate-500 font-semibold mb-1">Evolución Mes a Mes</div>
      <div className={`text-lg font-bold font-mono flex items-center gap-2 ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
        {isPos ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
        <span>{isPos ? '+' : ''}{diff.toLocaleString()} ({isPos ? '+' : ''}{pct.toFixed(2)}%)</span>
      </div>
    </div>
  );
};

export const renderHeaderEvolution = (trendList: MonthlyTrend[], label: string) => {
  if (!trendList || trendList.length < 1) return null;
  const last = trendList[trendList.length - 1].boarding;
  
  if (trendList.length < 2) {
     return (
       <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-full border border-slate-700/50">
         <span className="text-xs text-slate-400 font-semibold">{label}</span>
         <span className="text-sm font-bold text-white">{last.toLocaleString()}</span>
       </div>
     );
  }

  const prev = trendList[trendList.length - 2].boarding;
  const diff = last - prev;
  const pct = prev === 0 ? 0 : (diff / prev) * 100;
  const isPos = diff >= 0;

  return (
    <div className="flex items-center gap-3 bg-slate-900/80 px-4 py-2 rounded-full border border-slate-700/50 shadow-sm">
      <div className="flex items-center gap-2 border-r border-slate-700/50 pr-3">
         <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{label}</span>
         <span className="text-sm font-bold text-white">{last.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">pax</span></span>
      </div>
      <div className={`text-sm font-bold font-mono flex items-center gap-1 ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
        {isPos ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        <span>{isPos ? '+' : ''}{diff.toLocaleString()} ({isPos ? '+' : ''}{pct.toFixed(1)}%)</span>
      </div>
    </div>
  );
};

export const TrendCharts: React.FC<TrendChartsProps> = ({
  trends,
  baseDistance,
  compDistance,
  sharedDistance,
  allowedLineas,
  selectedLinea,
  allLineas
}) => {
  if (!trends) return null;

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-min pb-6">
      <div className="flex-1 bg-slate-800/50 rounded-xl border border-slate-700 p-6 flex flex-col">
        <div className="text-sm text-slate-400 mb-1">Impacto en Nuestra Línea</div>
        <div className="text-2xl font-bold text-white mb-4">
          Línea {trends.base_line.route_id}
          <div className="text-sm font-normal text-slate-400 mt-1 line-clamp-2 leading-tight">
            {allowedLineas.find(l => l.codigo === selectedLinea)?.nombre || ''}
          </div>
        </div>
        <div className="flex gap-4 mb-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
          <div className="flex-1 border-r border-slate-700/50 pr-4">
            <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">Total Recorrido</div>
            <div className="text-sm font-mono text-white flex items-center gap-1.5">
              <Route className="w-3.5 h-3.5 text-indigo-400" />
              {baseDistance.toFixed(1)} km
            </div>
          </div>
          {renderEvolution(trends.base_line.trend_total)}
        </div>
        
        {/* GLOBAL KPI (MACRO) */}
        <div className="mb-4 bg-slate-900/80 rounded-lg p-3 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.05)]">
          <div className="text-[10px] uppercase text-indigo-400 font-bold mb-2">CONSOLIDADO GLOBAL (IDA + VUELTA)</div>
          <div className="flex flex-col gap-2">
            {(() => {
              const maxBaseTotal = Math.max(...trends.base_line.trend_total.map(t => t.boarding), 1);
              return [...trends.base_line.trend_total].reverse().map((t) => (
                <div key={`total-${t.month}`} className="w-full">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-medium">{formatMonthName(t.month)}</span>
                    <span className="font-mono text-white font-bold">{t.boarding.toLocaleString()} pax</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-400 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min((t.boarding / maxBaseTotal) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* DESGLOSE DIRECCIONAL (MICRO) */}
        <div className="flex gap-4 mt-auto">
          {/* IDA */}
          <div className="flex-1 bg-slate-900/40 rounded-lg p-3 border border-slate-700/50">
            <div className="text-[10px] uppercase text-slate-500 font-bold mb-2">Sentido Ida</div>
            <div className="flex flex-col gap-2">
              {(() => {
                const maxIda = Math.max(...trends.base_line.trend_ida.map(t => t.boarding), 1);
                return [...trends.base_line.trend_ida].reverse().map((t) => (
                  <div key={`ida-${t.month}`} className="w-full">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-slate-400">{formatMonthName(t.month).split(' ')[0]}</span>
                      <span className="font-mono text-indigo-300">{t.boarding.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${Math.min((t.boarding / maxIda) * 100, 100)}%` }} />
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
          {/* VUELTA */}
          <div className="flex-1 bg-slate-900/40 rounded-lg p-3 border border-slate-700/50">
            <div className="text-[10px] uppercase text-slate-500 font-bold mb-2">Sentido Vuelta</div>
            <div className="flex flex-col gap-2">
              {(() => {
                const maxVuelta = Math.max(...trends.base_line.trend_vuelta.map(t => t.boarding), 1);
                return [...trends.base_line.trend_vuelta].reverse().map((t) => (
                  <div key={`vuelta-${t.month}`} className="w-full">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-slate-400">{formatMonthName(t.month).split(' ')[0]}</span>
                      <span className="font-mono text-indigo-300">{t.boarding.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${Math.min((t.boarding / maxVuelta) * 100, 100)}%` }} />
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Línea Competidora */}
      {trends.competitor_line && (
        <div className="flex-1 bg-slate-800/50 rounded-xl border border-slate-700 p-6 flex flex-col">
          <div className="text-sm text-slate-400 mb-1">Fuga de Carga hacia</div>
          <div className="text-2xl font-bold text-white mb-4">
            Línea {trends.competitor_line.route_id}
            <div className="text-sm font-normal text-slate-400 mt-1 line-clamp-2 leading-tight">
              {(() => {
                const compId = trends.competitor_line.route_id + (trends.competitor_line.direction_id === 1 ? 'b' : 'a');
                return allLineas.find(l => l.codigo.toLowerCase() === compId.toLowerCase())?.nombre || '';
              })()}
            </div>
          </div>

          <div className="flex gap-4 mb-6 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
            <div className="flex-1 border-r border-slate-700/50 pr-4">
              <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">Total Recorrido</div>
              <div className="text-sm font-mono text-white flex items-center gap-1.5">
                <Route className="w-3.5 h-3.5 text-rose-400" />
                {compDistance.toFixed(1)} km
              </div>
            </div>
            <div className="flex-1 pl-2 border-r border-slate-700/50 pr-4">
              <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">Solapamiento</div>
              <div className="text-sm font-mono text-emerald-400 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {sharedDistance.toFixed(1)} km
              </div>
            </div>
            {renderEvolution(trends.competitor_line.trend)}
          </div>
          
          <div className="flex-1 flex flex-col justify-start gap-2">
            {(() => {
              const maxComp = Math.max(...trends.competitor_line.trend.map(t => t.boarding), 1);
              return [...trends.competitor_line.trend].reverse().map((t) => (
                <div key={t.month} className="w-full">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{formatMonthName(t.month)}</span>
                    <span className="font-mono text-rose-400">{t.boarding.toLocaleString()} pax</span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-rose-500 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min((t.boarding / maxComp) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
