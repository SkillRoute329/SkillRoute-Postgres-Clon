import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);

        // Check for ChunkLoadError or common DOM errors
        const isChunkError = error.message.includes('Loading chunk') ||
            error.message.includes('import') ||
            error.name === 'ChunkLoadError';

        if (isChunkError) {
            const retries = parseInt(sessionStorage.getItem('chunk_load_retries') || '0', 10);
            if (retries < 3) {
                sessionStorage.setItem('chunk_load_retries', String(retries + 1));
                // Force reload bypassing cache if possible, and append timestamp to avoid browser cache
                const url = new URL(window.location.href);
                url.searchParams.set('t', Date.now().toString());
                window.location.href = url.toString();
                return;
            }
        }
    }

    private handleHardReset = async () => {
        if (confirm('Esto borrará todos los datos locales y recargará la aplicación. ¿Continuar?')) {
            try {
                // 1. Clear Storage
                localStorage.clear();
                sessionStorage.clear();

                // 2. Unregister Service Workers
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (const registration of registrations) {
                        await registration.unregister();
                    }
                }

                // 3. Clear Cache API
                if ('caches' in window) {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                }

                // 4. Force Reload with Cache Busting
                sessionStorage.removeItem('chunk_load_retries');
                const url = new URL(window.location.href);
                url.searchParams.set('reset', Date.now().toString());
                window.location.href = url.toString();

            } catch (e) {
                console.error('Reset failed', e);
                window.location.reload();
            }
        }
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white p-4">
                    <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 mb-6">
                            <TriangleAlert className="w-8 h-8 text-red-500" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">¡Ups! Algo salió mal.</h2>
                        <p className="text-slate-400 mb-6 text-sm">
                            Hemos detectado un problema técnico. Puede deberse a una actualización reciente o un problema de conexión.
                            <br />
                            <span className="text-xs font-mono text-red-300 bg-red-900/20 p-1 rounded mt-2 inline-block max-w-full overflow-hidden text-ellipsis">
                                {this.state.error?.message}
                            </span>
                        </p>

                        <button
                            onClick={() => window.location.reload()}
                            className="bg-primary-600 hover:bg-primary-500 text-white font-bold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 w-full mb-3"
                        >
                            <RefreshCw className="w-5 h-5" />
                            Intentar Recargar
                        </button>

                        <button
                            onClick={this.handleHardReset}
                            className="bg-red-900/30 hover:bg-red-900/50 text-red-200 font-medium py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 w-full text-sm border border-red-800/50"
                        >
                            🛠️ Restablecimiento Completo (Soluciona Errores)
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
