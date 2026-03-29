import { useState, useEffect } from 'react';
import { BulletinService } from '../../services/api';
import { BarChart3, TrendingUp, TrendingDown, Activity, Loader2, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ServiceStatistics = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    setLoading(true);
    try {
      // Fetch ALL controls for analysis (mocking 'all' via no filters or broad query)
      // In production, we'd have a specific aggregation endpoint or Cloud Function.
      // Here we just fetch client side for the demo
      const entries = await BulletinService.getEntries({});

      // Process Data
      const services: Record<string, { totalDiff: number; count: number; loads: number[] }> = {};

      entries.forEach((e: any) => {
        const svc = e.serviceNumber;
        if (!services[svc]) services[svc] = { totalDiff: 0, count: 0, loads: [] };

        if (e.type === 'CHECK') {
          services[svc].totalDiff += e.diff || 0;
          services[svc].count++;
        }
        if (e.type === 'LOAD') {
          // Map Load to Score: Malo=1, Reg=2, Bueno=3, Exc=4
          const score =
            e.value === 'Excelente' ? 4 : e.value === 'Bueno' ? 3 : e.value === 'Regular' ? 2 : 1;
          services[svc].loads.push(score);
        }
      });

      // Agregates
      const ranking = Object.entries(services)
        .map(([svc, data]) => {
          const avgDiff = data.count > 0 ? data.totalDiff / data.count : 0;
          const avgLoad =
            data.loads.length > 0 ? data.loads.reduce((a, b) => a + b, 0) / data.loads.length : 0;

          return {
            service: svc,
            avgDiff,
            avgLoad,
            score: avgLoad * 10 - Math.abs(avgDiff), // Advanced Formula: Load Value minus Deviation
          };
        })
        .sort((a, b) => b.score - a.score);

      setStats({
        ranking,
        totalChecks: entries.length,
        bestService: ranking[0],
        worstService: ranking[ranking.length - 1],
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReport = () => {
    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.text('Reporte de Control de Inspectores', 14, 22);

    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 30);

    // KPI Summary
    doc.setFontSize(10);
    doc.text(`Total Muestras: ${stats?.totalChecks || 0}`, 14, 40);
    doc.text(
      `Mejor Servicio: #${stats?.bestService?.service || '--'} (Score: ${stats?.bestService?.score?.toFixed(1) || 0})`,
      14,
      46,
    );
    doc.text(`Peor Servicio: #${stats?.worstService?.service || '--'}`, 14, 52);

    // Table
    const tableBody = stats?.ranking.map((row: any) => [
      `#${row.service}`,
      `${row.avgDiff > 0 ? '+' : ''}${row.avgDiff.toFixed(1)}m`,
      `${row.avgLoad.toFixed(1)}/4`,
      row.score.toFixed(1),
    ]);

    autoTable(doc, {
      head: [['Servicio', 'Desvío Promedio', 'Carga Promedio', 'Puntaje']],
      body: tableBody,
      startY: 60,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [22, 163, 74] }, // Emerald-600 color
    });

    doc.save(`reporte_inspectores_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950 text-emerald-400">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );

  return (
    <div className="p-8 bg-slate-950 min-h-screen text-white space-y-8 animate-in fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-purple-500/20 rounded-xl">
            <BarChart3 className="w-8 h-8 text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Estadísticas de Servicio</h1>
            <p className="text-slate-400">Análisis de rendimiento y carga en tiempo real</p>
          </div>
        </div>
        <button
          onClick={handleDownloadReport}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20"
        >
          <Download className="w-4 h-4" />
          Descargar Reporte
        </button>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase">Mejor Servicio</span>
          </div>
          <div className="text-4xl font-black text-white mb-1">
            #{stats?.bestService?.service || '--'}
          </div>
          <p className="text-sm text-slate-400">
            Puntualidad:{' '}
            <span className="text-emerald-400">{stats?.bestService?.avgDiff.toFixed(1)}m</span> •
            Carga: {stats?.bestService?.avgLoad.toFixed(1)}/4
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <TrendingDown className="w-6 h-6 text-red-400" />
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase">Requiere Ajuste</span>
          </div>
          <div className="text-4xl font-black text-white mb-1">
            #{stats?.worstService?.service || '--'}
          </div>
          <p className="text-sm text-slate-400">
            Desvío:{' '}
            <span className="text-red-400">
              {Math.abs(stats?.worstService?.avgDiff || 0).toFixed(1)}m
            </span>
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Activity className="w-6 h-6 text-blue-400" />
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase">Total Muestras</span>
          </div>
          <div className="text-4xl font-black text-white mb-1">{stats?.totalChecks || 0}</div>
          <p className="text-sm text-slate-400">Puntos de control registrados hoy</p>
        </div>
      </div>

      {/* RANKING TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-lg font-bold">Ranking de Eficiencia</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-950 text-xs uppercase font-bold text-slate-500">
              <tr>
                <th className="p-4">Servicio</th>
                <th className="p-4 text-center">Desvío Promedio</th>
                <th className="p-4 text-center">Nivel de Carga</th>
                <th className="p-4 text-right">Puntaje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {stats?.ranking.map((item: any) => (
                <tr key={item.service} className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-bold text-white">#{item.service}</td>
                  <td
                    className={`p-4 text-center font-mono font-bold ${item.avgDiff > 2 ? 'text-red-400' : item.avgDiff < -2 ? 'text-red-400' : 'text-emerald-400'}`}
                  >
                    {item.avgDiff > 0 ? '+' : ''}
                    {item.avgDiff.toFixed(1)}m
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center gap-1">
                      {[1, 2, 3, 4].map((star) => (
                        <div
                          key={star}
                          className={`w-2 h-6 rounded-sm ${star <= item.avgLoad ? 'bg-blue-500' : 'bg-slate-800'}`}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="p-4 text-right font-black text-white">{item.score.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ServiceStatistics;
