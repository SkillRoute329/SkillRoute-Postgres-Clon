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
                <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4">
                    <h1 className="text-3xl font-bold mb-4">Algo salió mal</h1>
                    <p className="mb-4 text-slate-400">La aplicación ha encontrado un error crítico.</p>
                    <div className="bg-red-900/50 border border-red-500/50 p-4 rounded-lg mb-6 max-w-lg overflow-auto">
                        <code className="text-xs text-red-200">{this.state.error && this.state.error.toString()}</code>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="bg-primary-600 hover:bg-primary-700 px-6 py-2 rounded-lg font-bold transition-colors"
                    >
                        Recargar Aplicación
                    </button>
                    <button
                        onClick={this.handleHardReset}
                        className="mt-4 text-red-400 underline text-sm"
                    >
                        Resetear Todo (Emergencia)
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
