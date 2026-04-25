/**
 * RouteErrorBoundary — Aísla fallos por módulo sin derribar la app entera.
 *
 * Uso:
 *   <RouteErrorBoundary module="Terminal Listero">
 *     <TerminalListero />
 *   </RouteErrorBoundary>
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Nombre del módulo para mostrar en el mensaje de error */
  module?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Solo logear en desarrollo — en producción el console.drop del build elimina esto
    if (import.meta.env.DEV) {
      console.error(`[RouteErrorBoundary] ${this.props.module || 'Módulo'}:`, error, info);
    }
    // Monitoring (Sentry si está configurado, sino fallback a console.error
    // dentro del wrapper). No bloqueante — si monitoring falla, el boundary
    // sigue mostrando la UI de fallback igualmente.
    try {
      // Import asíncrono para no acoplar el boundary al servicio
      import('../services/monitoring').then(({ captureException }) => {
        captureException(error, {
          tag: `route_boundary.${this.props.module ?? 'unknown'}`,
          level: 'error',
          extra: {
            componentStack: info.componentStack,
            module: this.props.module ?? null,
          },
        });
      }).catch(() => { /* noop */ });
    } catch {
      /* noop — el reporte de error nunca debe romper el boundary */
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isChunkError =
      this.state.error?.message?.includes('Failed to fetch') ||
      this.state.error?.message?.includes('Loading chunk') ||
      this.state.error?.name === 'ChunkLoadError';

    if (isChunkError) {
      window.location.reload();
      return null;
    }

    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[40vh] gap-4 text-center p-8">
        <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
          <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-black text-white mb-1">
            Error en {this.props.module || 'este módulo'}
          </h3>
          <p className="text-slate-400 text-sm max-w-sm">
            Este módulo encontró un problema inesperado. El resto de la aplicación sigue funcionando.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mt-3 text-left text-[10px] text-red-400 bg-slate-900 border border-slate-800 rounded-lg p-3 max-w-sm overflow-auto max-h-32">
              {this.state.error.message}
            </pre>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-primary-600/20 hover:bg-primary-600/40 text-primary-400 border border-primary-600/30 rounded-lg text-sm font-bold transition-colors"
          >
            Reintentar
          </button>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-slate-300 font-bold transition-colors"
          >
            ← Volver
          </button>
        </div>
      </div>
    );
  }
}
