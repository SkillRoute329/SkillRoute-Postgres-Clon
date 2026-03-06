import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { CartonService } from '../../services/api';
import { useCartonAnalytics } from '../../hooks/useCartonAnalytics';
import { AlertTriangle, ArrowLeft, Loader2, FileText } from 'lucide-react';
import CartonFisicoView, { type CartonFisicoData } from '../../components/traffic/CartonFisicoView';

type Header = { id: string; location?: string };
type CartonData = {
  id: string;
  linea: string;
  serviceNumber?: string;
  headers?: Header[];
  rawMatrix?: Array<{ checkpoints: string[] }>;
  instruccionesEspeciales?: string;
};

export default function CartonDetail() {
  const { lineId, serviceId } = useParams<{ lineId: string; serviceId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const modeEdit = searchParams.get('mode') === 'edit';
  const isFisico = searchParams.get('fisico') === '1';

  const [carton, setCarton] = useState<CartonData | null>(null);
  const [cartonFisico, setCartonFisico] = useState<CartonFisicoData | null>(null);
  const [loading, setLoading] = useState(true);

  const decodedLineId = lineId ? decodeURIComponent(lineId) : '';
  const decodedServiceId = serviceId ? decodeURIComponent(serviceId) : null;

  const { alerts, loading: loadingAnalytics } = useCartonAnalytics(
    isFisico ? undefined : decodedServiceId,
  );

  useEffect(() => {
    if (!decodedLineId || !decodedServiceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    if (isFisico) {
      CartonService.getCartonFisicoById(decodedServiceId)
        .then((data) => {
          setCartonFisico(data ? (data as CartonFisicoData) : null);
          setCarton(null);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setCartonFisico(null);
      CartonService.getAll(decodedLineId)
        .then((data: unknown[]) => {
          const items = (data || []) as CartonData[];
          const found = items.find((x) => x.id === decodedServiceId) ?? null;
          setCarton(found);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [decodedLineId, decodedServiceId, isFisico]);

  const headers = carton?.headers ?? [];
  const rows = carton?.rawMatrix ?? [];
  const alertPointIds = new Set(alerts.map((a) => a.pointId));

  if (loading && !carton && !cartonFisico) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!carton && !cartonFisico) {
    return (
      <div className="min-h-screen bg-slate-950 p-4 flex flex-col items-center justify-center text-slate-400">
        <p>Cartón no encontrado.</p>
        <button
          type="button"
          onClick={() => navigate('/dashboard/traffic/cartons')}
          className="mt-4 px-4 py-2 rounded-lg bg-slate-700 text-white"
        >
          Volver al listado
        </button>
      </div>
    );
  }

  const displayLinea = cartonFisico?.linea ?? carton?.linea ?? '';
  const displayId = cartonFisico?.id ?? carton?.id ?? '';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="p-4 border-b border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/dashboard/traffic/cartons')}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary-500" />
              Cartón — Línea {displayLinea} · Servicio #{displayId}
              {cartonFisico && (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300">
                  Físico
                </span>
              )}
            </h1>
            {modeEdit && (
              <span className="text-amber-400 text-sm">Modo edición (solo vista por ahora)</span>
            )}
          </div>
        </div>
        {!cartonFisico && alerts.length > 0 && (
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{alerts.length} sugerencia(s) de ajuste</span>
          </div>
        )}
      </header>

      {!cartonFisico && alerts.length > 0 && (
        <div className="mx-4 mt-4 p-4 rounded-xl bg-amber-900/20 border border-amber-700/50">
          <p className="text-amber-200 font-medium mb-2">Alertas del motor de análisis</p>
          <ul className="space-y-1 text-sm text-amber-100/90">
            {alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-mono text-amber-400">{a.pointId}</span>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cartonFisico ? (
        <main className="flex-1 overflow-auto p-4 bg-slate-200" data-testid="carton-fisico-view">
          <CartonFisicoView cartonFisico={cartonFisico} />
        </main>
      ) : (
        <>
          {headers.length > 0 && rows.length > 0 && (
            <section className="mx-4 mt-4" aria-label="Cartón físico (espejo)">
              <CartonFisicoView
                carton={{
                  ...carton!,
                  serviceNumber:
                    (carton as CartonData & { serviceNumber?: string }).serviceNumber ?? carton!.id,
                  instruccionesEspeciales: (carton as CartonData).instruccionesEspeciales,
                }}
                onSaveParadas={async (cartonDocId, paradas) => {
                  try {
                    await CartonService.updateCartonParadas(cartonDocId, paradas, decodedLineId);
                  } catch (e) {
                    console.error('Error guardando cartón:', e);
                  }
                }}
              />
            </section>
          )}
          <main className="flex-1 overflow-auto p-4">
            {loadingAnalytics && rows.length === 0 ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
              </div>
            ) : headers.length === 0 || rows.length === 0 ? (
              <div className="text-slate-500 text-center py-8">
                Este cartón no tiene estructura de puntos/horarios cargada.
              </div>
            ) : (
              <div className="w-full overflow-x-auto shadow-sm rounded-xl border border-slate-700 bg-slate-900/50">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-800 border-b border-slate-700">
                      <th className="p-2 text-xs font-bold text-slate-500 uppercase w-16 sticky left-0 bg-slate-800 border-r border-slate-700">
                        #
                      </th>
                      {headers.map((h, colIdx) => (
                        <th
                          key={h.id}
                          className={`p-2 text-xs font-bold text-slate-400 uppercase min-w-[80px] border-r border-slate-700 ${alertPointIds.has(h.id) ? 'bg-amber-900/30 text-amber-300' : ''}`}
                        >
                          <div className="flex items-center gap-1">
                            {alertPointIds.has(h.id) && (
                              <span title="Sugerencia de ajuste">
                                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                              </span>
                            )}
                            <span className="truncate">{h.location ?? h.id}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={`border-b border-slate-800/50 ${rIdx % 2 === 0 ? 'bg-slate-900/30' : 'bg-slate-900/50'}`}
                      >
                        <td className="p-2 text-xs text-slate-500 font-mono sticky left-0 bg-slate-900/80 border-r border-slate-700">
                          {rIdx + 1}
                        </td>
                        {headers.map((h, colIdx) => {
                          const time = row.checkpoints?.[colIdx] ?? '—';
                          const hasAlert = alertPointIds.has(h.id);
                          return (
                            <td
                              key={h.id}
                              className={`p-2 text-sm font-mono border-r border-slate-800/50 ${hasAlert ? 'bg-amber-900/10 text-amber-100' : 'text-slate-300'}`}
                            >
                              {time}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}
