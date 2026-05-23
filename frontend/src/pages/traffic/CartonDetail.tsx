import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { CartonService } from '../../services/api';
import { useCartonAnalytics } from '../../hooks/useCartonAnalytics';
import { AlertTriangle, ArrowLeft, Loader2, FileText } from 'lucide-react';
import CartonFisicoView, { type CartonFisicoData } from '../../components/traffic/CartonFisicoView';
import type { CartonAlert } from '../../hooks/useCartonAnalytics';

type Header = { id: string; location?: string };
type CartonData = {
  id: string;
  linea: string;
  serviceNumber?: string;
  servicioId?: string;
  headers?: Header[];
  rawMatrix?: Array<{ checkpoints: string[] }>;
  instruccionesEspeciales?: string;
};

export default function CartonDetail() {
  const { lineId, serviceId } = useParams<{ lineId: string; serviceId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isFisico = searchParams.get('fisico') === '1';
  const [carton, setCarton] = useState<CartonData | null>(null);
  const [cartonFisico, setCartonFisico] = useState<CartonFisicoData | null>(null);
  const [loading, setLoading] = useState(true);

  const decodedLineId = lineId ? decodeURIComponent(lineId) : '';
  // Normalizar serviceId: quitar sufijos como _VERANO_2026
  const rawServiceId = serviceId ? decodeURIComponent(serviceId) : null;
  const decodedServiceId = rawServiceId
    ? rawServiceId.replace(/_(VERANO|INVIERNO)_\d{4}$/, '')
    : null;

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
      // Extraer línea base (sin variante a/b)
      const lineaBase = decodedLineId.replace(/[ab]$/, '');
      CartonService.getAll(lineaBase)
        .then((data: unknown[]) => {
          const items = (data || []) as CartonData[];
          // Buscar por id, servicioId, serviceNumber, o coincidencia parcial
          const found =
            items.find(
              (x) =>
                x.id === decodedServiceId ||
                x.servicioId === decodedServiceId ||
                x.serviceNumber === decodedServiceId ||
                String(x.id).replace(/_(VERANO|INVIERNO)_\d{4}$/, '') === decodedServiceId,
            ) ?? null;
          setCarton(found);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [decodedLineId, decodedServiceId, isFisico]);

  if (loading || loadingAnalytics) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!carton && !cartonFisico) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4">
        <FileText className="w-16 h-16 text-slate-600" />
        <p className="text-slate-400 text-lg">Cartón no encontrado.</p>
        <p className="text-slate-600 text-sm">
          Línea: {decodedLineId} | Servicio: {decodedServiceId}
        </p>
        <button
          onClick={() => navigate('/dashboard/traffic/cartons')}
          className="mt-2 px-6 py-2 bg-primary-600 hover:bg-primary-500 rounded-xl font-bold transition-all"
        >
          Volver al listado
        </button>
      </div>
    );
  }

  if (isFisico && cartonFisico) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <header className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard/traffic/cartons')}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Cartón Físico — {decodedServiceId}</h1>
        </header>
        <div className="p-4">
          <CartonFisicoView carton={cartonFisico} />
        </div>
      </div>
    );
  }

  if (!carton) return null;

  const headers = carton.headers ?? [];
  const rawMatrix = carton.rawMatrix ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate('/dashboard/traffic/cartons')}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-500" />
            Servicio {carton.serviceNumber ?? carton.id} — Línea {carton.linea}
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">Temporada Verano 2026 · Hábil</p>
        </div>
      </header>

      {alerts && alerts.length > 0 && (
        <div className="p-4 bg-yellow-900/20 border-b border-yellow-800/30">
          {alerts.map((a: CartonAlert, i: number) => (
            <div key={i} className="flex items-center gap-2 text-yellow-400 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {a.message}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {carton.instruccionesEspeciales && (
          <div className="mb-4 p-3 bg-blue-900/20 border border-blue-800/30 rounded-xl text-blue-300 text-sm">
            {carton.instruccionesEspeciales}
          </div>
        )}

        {headers.length > 0 && rawMatrix.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900">
                  <th className="px-3 py-2 text-left text-slate-400 font-bold text-xs whitespace-nowrap">
                    #
                  </th>
                  {headers.map((h) => (
                    <th
                      key={h.id}
                      className="px-3 py-2 text-left text-slate-400 font-bold text-xs whitespace-nowrap"
                    >
                      {h.location ?? h.id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawMatrix.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className={rowIdx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/40'}
                  >
                    <td className="px-3 py-2 text-slate-500 text-xs">{rowIdx + 1}</td>
                    {row.checkpoints.map((cp, colIdx) => (
                      <td
                        key={colIdx}
                        className="px-3 py-2 text-slate-200 font-mono text-xs whitespace-nowrap"
                      >
                        {cp}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <FileText className="w-12 h-12 mb-3 text-slate-700" />
            <p>No hay datos de horario disponibles para este servicio.</p>
          </div>
        )}
      </div>

    </div>
  );
}
