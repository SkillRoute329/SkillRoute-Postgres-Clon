import ErrorBoundary from '../../components/ErrorBoundary';
import RoadAlertsWidget from '../../components/RoadAlertsWidget';

/**
 * Vista de página para "Alertas de Vía" (menú lateral).
 * Reutiliza la lógica y UI de RoadAlertsWidget. Envuelta en ErrorBoundary para que un fallo no rompa la app.
 */
const RoadAlertsPage = () => {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-white">Alertas de Vía</h1>
        <p className="text-slate-400 text-sm mt-1">
          Novedades, desvíos e incidencias viales en tiempo real.
        </p>
      </div>
      <ErrorBoundary>
        <RoadAlertsWidget />
      </ErrorBoundary>
    </div>
  );
};

export default RoadAlertsPage;
