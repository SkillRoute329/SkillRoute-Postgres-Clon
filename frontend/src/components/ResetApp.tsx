import { RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

const ResetApp = () => {
    const [status, setStatus] = useState<'idle' | 'clearing' | 'done'>('idle');

    const handleReset = async () => {
        if (!confirm('¿Estás seguro? Esto borrará tus credenciales guardadas y reiniciará la aplicación. Usa esto si la aplicación no carga o se queda en blanco.')) return;

        setStatus('clearing');

        // 1. Clear Local Storage
        localStorage.clear();

        // 2. Clear Session Storage
        sessionStorage.clear();

        // 3. Unregister Service Workers (if any)
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.unregister();
            }
        }

        // 4. Force Reload with Cache Ignore
        setTimeout(() => {
            window.location.href = '/login?reset=true';
        }, 1000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 text-white p-4">
            <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>

                <h1 className="text-2xl font-bold mb-2">Error de Carga / Pantalla Blanca</h1>
                <p className="text-slate-400 mb-8">
                    Si estás viendo esta pantalla o la aplicación no responde, es probable que tu navegador tenga archivos antiguos o corruptos.
                </p>

                <button
                    onClick={handleReset}
                    disabled={status !== 'idle'}
                    className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition-colors text-lg shadow-lg shadow-red-900/20"
                >
                    {status === 'idle' ? (
                        <>
                            <Trash2 className="w-6 h-6" />
                            REPARAR APLICACIÓN
                        </>
                    ) : (
                        <>
                            <RefreshCw className="w-6 h-6 animate-spin" />
                            Limpiando Sistema...
                        </>
                    )}
                </button>

                <p className="mt-6 text-sm text-slate-500">
                    Esto forzará una recarga completa y borrará la caché local.
                </p>

                <button onClick={() => window.location.reload()} className="mt-4 text-sm text-blue-400 hover:text-blue-300 underline">
                    Intentar recarga simple (F5)
                </button>
            </div>
        </div>
    );
};

export default ResetApp;
