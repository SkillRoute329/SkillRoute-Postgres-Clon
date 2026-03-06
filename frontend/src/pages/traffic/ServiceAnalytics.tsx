import { useState, useEffect } from 'react';
import { InspectionService } from '../../services/api';
import type { Inspection } from '../../types/inspections';
import { BarChart3, MapPin, Clock, Users, Loader2, Calendar } from 'lucide-react';

type PointStats = {
  controlPointId: string;
  controlPointLabel: string;
  lineId: string;
  count: number;
  avgDeltaMinutes: number;
  passengerTrend: {
    BAJO: number;
    MEDIO: number;
    ALTO: number;
    numeric: number;
    numericSum: number;
    numericCount: number;
  };
};

function normalizeLoadValue(load: Inspection['passengerLoad']): 'BAJO' | 'MEDIO' | 'ALTO' | number {
  if (typeof load === 'number') return load;
  if (load === 'BAJO' || load === 'MEDIO' || load === 'ALTO') return load;
  return 'MEDIO';
}

function aggregateByControlPoint(inspections: Inspection[]): PointStats[] {
  const byKey: Record<
    string,
    {
      lineId: string;
      pointId: string;
      pointLabel: string;
      deltas: number[];
      loads: Array<'BAJO' | 'MEDIO' | 'ALTO' | number>;
    }
  > = {};

  inspections.forEach((i) => {
    const key = `${i.lineId}|${i.controlPointId}`;
    if (!byKey[key]) {
      byKey[key] = {
        lineId: i.lineId,
        pointId: i.controlPointId,
        pointLabel: i.controlPointId,
        deltas: [],
        loads: [],
      };
    }
    byKey[key].deltas.push(i.timeDeltaMinutes);
    const load = normalizeLoadValue(i.passengerLoad);
    byKey[key].loads.push(load);
  });

  return Object.values(byKey)
    .map((v) => {
      const count = v.deltas.length;
      const avgDeltaMinutes = count ? v.deltas.reduce((a, b) => a + b, 0) / count : 0;
      const passengerTrend = {
        BAJO: 0,
        MEDIO: 0,
        ALTO: 0,
        numericSum: 0,
        numericCount: 0,
        numeric: 0,
      };
      v.loads.forEach((l) => {
        if (l === 'BAJO') passengerTrend.BAJO++;
        else if (l === 'MEDIO') passengerTrend.MEDIO++;
        else if (l === 'ALTO') passengerTrend.ALTO++;
        else if (typeof l === 'number') {
          passengerTrend.numericSum += l;
          passengerTrend.numericCount++;
        }
      });
      passengerTrend.numeric = passengerTrend.numericCount
        ? passengerTrend.numericSum / passengerTrend.numericCount
        : 0;
      return {
        controlPointId: v.pointId,
        controlPointLabel: v.pointLabel,
        lineId: v.lineId,
        count,
        avgDeltaMinutes,
        passengerTrend: passengerTrend as PointStats['passengerTrend'],
      };
    })
    .sort(
      (a, b) =>
        a.lineId.localeCompare(b.lineId) || a.controlPointId.localeCompare(b.controlPointId),
    );
}

const ServiceAnalytics = () => {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterLine, setFilterLine] = useState('');

  useEffect(() => {
    setLoading(true);
    InspectionService.getAll({
      serviceDate: filterDate || undefined,
      lineId: filterLine || undefined,
    })
      .then(setInspections)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filterDate, filterLine]);

  const stats = aggregateByControlPoint(inspections);
  const lines = Array.from(new Set(inspections.map((i) => i.lineId))).sort();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <header className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="text-primary-500 w-7 h-7" />
          Estadísticas de Servicio
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Promedios de atraso/adelanto por punto de control y tendencia de pasajeros.
        </p>
      </header>

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-sm">Línea</span>
          <select
            value={filterLine}
            onChange={(e) => setFilterLine(e.target.value)}
            className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white"
          >
            <option value="">Todas</option>
            {lines.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : stats.length === 0 ? (
        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-8 text-center text-slate-500">
          No hay inspecciones para los filtros seleccionados.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {stats.map((s) => (
            <div
              key={`${s.lineId}-${s.controlPointId}`}
              className="rounded-xl bg-slate-800/80 border border-slate-700 p-5"
            >
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                <MapPin className="w-4 h-4" />
                <span className="font-medium text-white">{s.controlPointLabel}</span>
                <span className="text-slate-500">Línea {s.lineId}</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-slate-500" />
                <span
                  className={`text-lg font-mono font-bold ${s.avgDeltaMinutes > 0 ? 'text-amber-400' : s.avgDeltaMinutes < 0 ? 'text-emerald-400' : 'text-slate-300'}`}
                >
                  {s.avgDeltaMinutes > 0
                    ? `+${s.avgDeltaMinutes.toFixed(1)}`
                    : s.avgDeltaMinutes.toFixed(1)}{' '}
                  min
                </span>
                <span className="text-slate-500 text-sm">
                  promedio{' '}
                  {s.avgDeltaMinutes > 0
                    ? 'atraso'
                    : s.avgDeltaMinutes < 0
                      ? 'adelanto'
                      : 'en hora'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-slate-500" />
                <span className="text-slate-400">Tendencia:</span>
                <span>
                  B{s.passengerTrend.BAJO} M{s.passengerTrend.MEDIO} A{s.passengerTrend.ALTO}
                </span>
                {s.passengerTrend.numericCount > 0 && (
                  <span className="text-slate-500">
                    | Prom. num: {s.passengerTrend.numeric.toFixed(0)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-2">{s.count} registro(s)</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServiceAnalytics;
