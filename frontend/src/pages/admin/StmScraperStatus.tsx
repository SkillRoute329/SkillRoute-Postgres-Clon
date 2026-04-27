import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, limit, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Activity, Database, Clock, ArrowDownToLine, ServerCrash } from 'lucide-react';
import toast from 'react-hot-toast';

interface ScrapingLog {
  id: string;
  tiempo: Timestamp;
  status: 'SUCCESS' | 'ERROR';
  bytes_descargados: number;
  vehiculos_competencia: number;
  ancho_banda_mbps: number;
  error_msg?: string;
}

const StmScraperStatus: React.FC = () => {
  const [logs, setLogs] = useState<ScrapingLog[]>([]);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    // Nota: Esta colección (scrapping_logs) asume la configuración en el backend ingestaIMM.
    // Mantenemos simetría con una estructura de datos real.
    const q = query(
      collection(db, 'scrapping_logs'),
      orderBy('tiempo', 'desc'),
      limit(15)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: ScrapingLog[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as ScrapingLog);
      });
      setLogs(data);
    }, (err) => {
      console.warn("Falla monitor scraper", err);
      toast.error("Motor de Scrapping Desconectado. Contactar SRE.");
      setIsActive(false);
    });

    return () => unsubscribe();
  }, []);

  const latest = logs[0];
  const totalBuses = logs.reduce((acc, l) => acc + (l.vehiculos_competencia || 0), 0);

  return (
    <div className="min-h-screen bg-slate-950 p-6 font-mono text-slate-300">
      
      <div className="flex justify-between items-center border-b border-indigo-900/50 pb-6 mb-8">
        <div>
          <h1 className="text-3xl font-black text-indigo-400 flex items-center gap-3 tracking-tighter">
            <ServerCrash className={`w-8 h-8 ${isActive ? 'animate-pulse text-indigo-400' : 'text-red-500'}`} />
            STM.SCRAPER[MONITOR]
          </h1>
          <p className="text-indigo-900 text-sm mt-1">Conexión cifrada vía API del Estado. Extrae pings Rival cada 60s.</p>
        </div>
        
        <div className="flex gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded px-4 py-2 flex flex-col items-end">
            <span className="text-xs text-slate-500 font-bold uppercase">Estado Link</span>
            <span className={`font-bold ${isActive ? 'text-emerald-400' : 'text-red-500'}`}>
              {isActive ? 'ESTABLE / CONECTADO' : 'TIMEOUT / OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-indigo-950/20 border border-indigo-900/50 p-6 rounded-xl flex flex-col items-center justify-center">
          <Activity className="w-8 h-8 text-emerald-400 mb-2" />
          <span className="text-sm font-bold text-slate-500 text-center">Rendimiento (Mbps)</span>
          <span className="text-2xl font-black text-white">{latest?.ancho_banda_mbps?.toFixed(2) || '0.00'}</span>
        </div>
        
        <div className="bg-indigo-950/20 border border-indigo-900/50 p-6 rounded-xl flex flex-col items-center justify-center">
          <Database className="w-8 h-8 text-blue-400 mb-2" />
          <span className="text-sm font-bold text-slate-500 text-center">Buses Infectados</span>
          <span className="text-2xl font-black text-white">{latest?.vehiculos_competencia || 0}</span>
        </div>
        
        <div className="bg-indigo-950/20 border border-indigo-900/50 p-6 rounded-xl flex flex-col items-center justify-center">
          <ArrowDownToLine className="w-8 h-8 text-purple-400 mb-2" />
          <span className="text-sm font-bold text-slate-500 text-center">Payload Promedio</span>
          <span className="text-2xl font-black text-white">
            {latest?.bytes_descargados ? (latest.bytes_descargados / 1024).toFixed(1) : '0.0'} KB
          </span>
        </div>
        
        <div className="bg-indigo-950/20 border border-indigo-900/50 p-6 rounded-xl flex flex-col items-center justify-center">
          <Clock className="w-8 h-8 text-orange-400 mb-2" />
          <span className="text-sm font-bold text-slate-500 text-center">Último Heartbeat</span>
          <span className="text-xl font-bold text-white text-center">
            {latest?.tiempo ? latest.tiempo.toDate().toLocaleTimeString() : '--:--:--'}
          </span>
        </div>
      </div>

      {/* Terminal de Logs */}
      <h3 className="uppercase font-bold text-xs tracking-widest text-slate-500 mb-3 ml-1">Terminal de Volcado Raw</h3>
      <div className="bg-black border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        <div className="p-4 h-96 overflow-y-auto w-full">
          {logs.length === 0 ? (
            <div className="animate-pulse text-indigo-500/50">Esperando conexión entrante...</div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="text-slate-600 border-b border-slate-900">
                <tr>
                  <th className="font-normal pb-2">Fecha/Hora</th>
                  <th className="font-normal pb-2">Estado</th>
                  <th className="font-normal pb-2">Competidores</th>
                  <th className="font-normal pb-2">Tráfico</th>
                  <th className="font-normal pb-2">Respuesta</th>
                </tr>
              </thead>
              <tbody className="text-slate-400">
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-900/50 hover:bg-slate-900/20 transition-colors">
                    <td className="py-2 text-indigo-400 font-bold">{log.tiempo?.toDate().toLocaleString('es-UY') || 'N/D'}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-black ${log.status === 'SUCCESS' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2">{log.vehiculos_competencia} objs</td>
                    <td className="py-2">{(log.bytes_descargados / 1024).toFixed(2)} KB</td>
                    <td className="py-2 font-mono text-xs opacity-70 truncate max-w-xs">{log.error_msg || 'Paquetes procesados correctamente'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
    </div>
  );
};

export default StmScraperStatus;
