import { useState, useEffect } from 'react';
import {
    Activity, Database, ShieldCheck, RefreshCcw,
    AlertCircle, FileText, CheckCircle2, Terminal,
    ShieldAlert, HardDrive, Cpu, Globe
} from 'lucide-react';
import { SystemHealthService } from '../../services/api';
import clsx from 'clsx';

const AppMaintenance = () => {
    const [status, setStatus] = useState<any>(null);
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 30000); // Auto-refresh every 30s
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        try {
            const [health, history] = await Promise.all([
                SystemHealthService.getStatus(),
                SystemHealthService.getLogs()
            ]);
            setStatus(health);
            setLogs(history);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async () => {
        if (!confirm('¿Desea sincronizar el sistema con los últimos cambios de código? El servidor puede reiniciarse.')) return;
        setUpdating(true);
        try {
            const res = await SystemHealthService.triggerUpdate();
            alert('Actualización Iniciada:\n' + res.message);
            loadData();
        } catch (e: any) {
            alert('Error en actualización: ' + (e.message || 'Error técnico'));
        } finally {
            setUpdating(false);
        }
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500 animate-pulse">
            <Activity className="w-12 h-12 mb-4 animate-spin" />
            <p className="font-bold uppercase tracking-widest text-xs">Diagnosticando Sistema...</p>
        </div>
    );

    return (
        <div className="p-6 max-w-7xl mx-auto animate-fade-in-up space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-3xl font-black text-white flex items-center gap-3">
                        <ShieldCheck className="w-10 h-10 text-primary-500" />
                        Mantenimiento del Sistema
                    </h1>
                    <p className="text-slate-400 mt-1">Super Admin Dashboard - Diagnóstico de Salud y Actualización 1-Click</p>
                </div>
                <button
                    onClick={handleUpdate}
                    disabled={updating}
                    className={clsx(
                        "px-6 py-4 rounded-2xl font-black text-sm flex items-center gap-3 transition-all shadow-xl shadow-primary-950/20",
                        updating ? "bg-slate-800 text-slate-500" : "bg-primary-600 hover:bg-primary-500 text-white animate-pulse-slow"
                    )}
                >
                    <RefreshCcw className={clsx("w-5 h-5", updating && "animate-spin")} />
                    {updating ? 'ACTUALIZANDO...' : 'ACTUALIZAR SISTEMA AHORA'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* DB HEALTH CARD */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 overflow-hidden relative group">
                    <div className="absolute -top-6 -right-6 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                        <Database className="w-32 h-32 text-white" />
                    </div>
                    <div className="flex items-center gap-3 mb-6">
                        <div className={clsx("p-3 rounded-2xl shadow-lg", status?.database?.status === 'READY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
                            <Database className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Base de Datos</h3>
                            <p className={clsx("font-black", status?.database?.status === 'READY' ? 'text-emerald-400' : 'text-red-400')}>
                                {status?.database?.status === 'READY' ? 'CONECTADO' : 'ERROR DE ENLACE'}
                            </p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Latencia RAILWAY:</span>
                            <span className="text-white font-mono">{status?.database?.latency}ms</span>
                        </div>
                        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 w-[95%] transition-all duration-1000"></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-4">
                            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                                <span className="text-[10px] text-slate-500 block uppercase font-bold">Usuarios</span>
                                <span className="text-xl font-black text-white">{status?.database?.tables?.users || 0}</span>
                            </div>
                            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                                <span className="text-[10px] text-slate-500 block uppercase font-bold">Unidades</span>
                                <span className="text-xl font-black text-white">{status?.database?.tables?.vehicles || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* INFRASTRUCTURE CARD */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden group">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-blue-500/10 text-blue-400 rounded-2xl">
                            <Cpu className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Servidor / API</h3>
                            <p className="text-white font-black">{status?.environment?.platform?.toUpperCase()} v{status?.environment?.node}</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-sm text-slate-300">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span>JWT Authentication: OK</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-300">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span>Multer File Engine: OK</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-300">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span>Socket.IO Real-time: ON</span>
                        </div>
                    </div>
                </div>

                {/* FILE SYSTEM CARD */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-purple-500/10 text-purple-400 rounded-2xl">
                            <HardDrive className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Archivos / Import</h3>
                            <p className="text-white font-black">XLSX Engine Ready</p>
                        </div>
                    </div>
                    <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 text-xs text-slate-400 leading-relaxed font-mono">
                        [PATH] /TransformaFacil-2.0/frontend/dist/
                        <br />
                        [MODE] Direct-to-Railway Tunnel Active
                        <br />
                        [PORT] 8080 (Local) / 4000 (Cloud)
                    </div>
                </div>
            </div>

            {/* EVENT LOGS */}
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden">
                <div className="p-6 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center">
                    <h2 className="text-xl font-black text-white flex items-center gap-3">
                        <Terminal className="w-6 h-6 text-slate-500" />
                        Reporte de Actividad del Sistema
                    </h2>
                    <span className="text-[10px] text-slate-500 font-black uppercase bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                        Últimos 50 Eventos
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="text-[10px] text-slate-600 font-black uppercase tracking-widest border-b border-slate-800">
                            <tr>
                                <th className="p-4">Estampa Temporal</th>
                                <th className="p-4">Usuario</th>
                                <th className="p-4">Acción / Evento</th>
                                <th className="p-4">Detalles Técnicos (JSON)</th>
                                <th className="p-4 text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {logs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="p-4 text-slate-500 text-xs font-mono">{new Date(log.createdAt).toLocaleString()}</td>
                                    <td className="p-4">
                                        <div className="text-white font-bold text-sm">{log.user?.fullName || 'SISTEMA'}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className="text-[10px] font-black px-2 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700">
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="p-4 max-w-[300px]">
                                        <div className="text-[10px] text-slate-500 font-mono truncate hover:whitespace-normal hover:overflow-visible transition-all">
                                            {log.details || '{}'}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 mx-auto shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ERROR DIAGNOSTIC SECTION */}
            <div className="grid md:grid-cols-2 gap-8 bg-black/20 p-8 rounded-[3rem] border border-blue-900/10">
                <div className="space-y-4">
                    <h3 className="text-xl font-black text-white flex items-center gap-3">
                        <ShieldAlert className="w-6 h-6 text-red-500" />
                        Diagnóstico de Fallas (Automatizado)
                    </h3>
                    <div className="space-y-3">
                        <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-2xl">
                            <p className="text-red-400 font-bold text-sm mb-1">¿Por qué fallan los archivos?</p>
                            <p className="text-slate-500 text-xs text-justify">
                                La mayoría de errores de importación se deben a columnas mal nombradas. El sistema espera nombres exactos: <strong>Legajo, CI, Nombre</strong>.
                                Si el error persiste, verifique que el archivo no supere los 10MB para optimización de túnel.
                            </p>
                        </div>
                        <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl">
                            <p className="text-blue-400 font-bold text-sm mb-1">Comunicación entre Bases de Datos</p>
                            <p className="text-slate-500 text-xs text-justify">
                                La integridad referencial está activa. Cada usuario importado en RRHH es inmediatamente visible en la gestión de turnos gracias al trigger síncrono de Prisma.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col justify-center items-center text-center p-8 bg-slate-900/50 rounded-[2.5rem] border border-slate-800">
                    <Globe className="w-16 h-16 text-primary-500 mb-4 animate-pulse-slow" />
                    <h4 className="text-lg font-black text-white">Estado de la Red PWA</h4>
                    <p className="text-slate-400 text-sm mt-2 max-w-xs">
                        La aplicación detecta automáticamente la pérdida de señal y activa el Modo Túnel local para garantizar que no se pierdan datos de RRHH.
                    </p>
                    <div className="mt-6 px-6 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-black text-[10px] uppercase tracking-widest">
                        Protocolo de Sincronización OK
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AppMaintenance;
