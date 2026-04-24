/**
 * WidgetErrorBoundary — Contenedor que aísla fallos de un widget
 * ===============================================================
 * Mes+1 #3 (2026-04-23)
 *
 * Si un widget interno lanza una excepción React, muestra un placeholder
 * en lugar de tirar la página entera. Uso típico:
 *
 *   <WidgetErrorBoundary label="Dashboard CEO — Sparklines">
 *     <SparklineKPI data={flotaHistory} />
 *   </WidgetErrorBoundary>
 *
 * El placeholder muestra el label + un botón "Reintentar" que resetea
 * el estado y re-renderiza los hijos. Los errores se loguean a console
 * (y en una próxima fase se enviarán a un reporter centralizado).
 */

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  /** Etiqueta humana del widget — lo que ve el usuario si algo falla. */
  label: string;
  /** Contenido a envolver. */
  children: React.ReactNode;
  /**
   * Opcional — fallback custom en lugar del placeholder default.
   * Recibe el error y una función reset.
   */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

export class WidgetErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Logueo estructurado — en producción esto debería ir a Sentry / Firebase Crashlytics.
    console.error(`[WidgetErrorBoundary:${this.props.label}]`, {
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  reset = (): void => this.setState({ error: null });

  render(): React.ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <div
          role="alert"
          className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-300">
              {this.props.label} — no disponible
            </p>
            <p className="text-xs text-amber-400/70 mt-1 truncate">
              {this.state.error.message || 'Error desconocido'}
            </p>
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-white/5 text-xs text-slate-300"
            aria-label={`Reintentar ${this.props.label}`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default WidgetErrorBoundary;
