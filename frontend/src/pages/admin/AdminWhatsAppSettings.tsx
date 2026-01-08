import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { getAuthToken } from '../../utils/auth';
import clsx from 'clsx';

const AdminWhatsAppSettings = () => {
    const [status, setStatus] = useState<string>('DISCONNECTED');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchStatus = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/whatsapp/status', {
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`
                }
            });
            const data = await res.json();
            setStatus(data.status);
            setQrCode(data.qrCode);
        } catch (error) {
            console.error('Error fetching WA status', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, []);

    const handleRestart = async () => {
        if (!confirm('¿Estás seguro de que deseas reiniciar el servicio de WhatsApp? Esto desconectará cualquier sesión activa.')) return;
        setLoading(true);
        try {
            await fetch('/api/whatsapp/restart', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`
                }
            });
            alert('Servicio reiniciando. Espera unos segundos y recarga el QR.');
            setStatus('INITIALIZING');
            setQrCode(null);
            // Wait a bit then fetch status
            setTimeout(fetchStatus, 3000);
        } catch (error) {
            console.error('Error restarting', error);
            alert('Error al reiniciar el servicio');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Configuración de WhatsApp Bot</h1>
                    <p className="text-slate-400">Escanea el código QR para vincular el bot y permitir el envío automático de mensajes.</p>
                </div>
                <button
                    onClick={handleRestart}
                    className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors border border-slate-600"
                >
                    <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
                    <span>Reiniciar Servicio</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Status Card */}
                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                    <h2 className="text-lg font-bold text-white mb-4">Estado de Conexión</h2>
                    <div className="flex items-center gap-4 mb-6">
                        {status === 'READY' ? (
                            <div className="flex items-center gap-2 text-green-400 bg-green-400/10 px-4 py-2 rounded-full border border-green-400/20">
                                <CheckCircle className="w-6 h-6" />
                                <span className="font-bold">CONECTADO</span>
                            </div>
                        ) : status === 'INITIALIZING' ? (
                            <div className="flex items-center gap-2 text-yellow-400 bg-yellow-400/10 px-4 py-2 rounded-full border border-yellow-400/20">
                                <RefreshCw className="w-6 h-6 animate-spin" />
                                <span className="font-bold">INICIANDO...</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 px-4 py-2 rounded-full border border-red-400/20">
                                <XCircle className="w-6 h-6" />
                                <span className="font-bold">DESCONECTADO</span>
                            </div>
                        )}
                    </div>

                    <p className="text-slate-400 text-sm">
                        {status === 'READY'
                            ? 'El bot está activo y enviará mensajes automáticamente al asignar turnos.'
                            : 'Escanea el código QR a la derecha para conectar.'}
                    </p>
                </div>

                {/* QR Code Card */}
                <div className="bg-white p-6 rounded-2xl border border-slate-700 flex flex-col items-center justify-center min-h-[300px]">
                    {status === 'READY' ? (
                        <div className="text-center">
                            <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
                            <p className="text-slate-800 font-bold text-lg">Dispositivo Vinculado</p>
                        </div>
                    ) : qrCode ? (
                        <div className="text-center">
                            <img src={qrCode} alt="WhatsApp QR" className="w-64 h-64 mix-blend-multiply" />
                            <p className="text-slate-500 mt-4 text-sm font-medium">Escanea con tu WhatsApp</p>
                        </div>
                    ) : (
                        <div className="text-center text-slate-400">
                            {loading ? 'Cargando QR...' : 'Esperando Código QR...'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminWhatsAppSettings;
