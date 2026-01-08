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
        // Automatically reload strictly for DOM-related chunk loading errors or removeChild/insertBefore
        if (error.message.includes('removeChild') || error.message.includes('insertBefore') || error.message.includes('Loading chunk')) {
            window.location.reload();
        }
    }

    private handleReload = () => {
        window.location.reload();
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
                        <p className="text-slate-400 mb-6">
                            Ha ocurrido un error inesperado en la aplicación.
                            <br />
                            <span className="text-xs font-mono text-red-300 bg-red-900/20 p-1 rounded mt-2 inline-block">
                                {this.state.error?.message}
                            </span>
                        </p>

                        <button
                            onClick={this.handleReload}
                            className="bg-primary-600 hover:bg-primary-500 text-white font-bold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 w-full"
                        >
                            <RefreshCw className="w-5 h-5" />
                            Recargar Página
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
