import React, { useState, useEffect } from 'react';
import { AlertTriangle, TrendingDown, DollarSign } from 'lucide-react';
import axios from 'axios';

interface LinesAtRiskPanelProps {
  operador?: string;
  titulo?: string;
  height?: string;
}

export function LinesAtRiskPanel({
  operador = 'UCOT',
  titulo = 'Líneas en Riesgo',
  height = '500px'
}: LinesAtRiskPanelProps) {
  const [lineasEnRiesgo, setLineasEnRiesgo] = useState<any[]>([]);
  const [resumen, setResumen] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await axios.get(`/api/analytics/lines/at-risk?operador=${operador}`);
        setLineasEnRiesgo(res.data.data.lineasEnRiesgo);
        setResumen(res.data.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Error cargando líneas en riesgo');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [operador]);

  if (loading) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200"
      >
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-2"></div>
          <p className="text-gray-600">Analizando líneas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-red-50 rounded-lg border border-red-200"
      >
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height }} className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-800">{titulo}</h3>
        {resumen && (
          <div className="flex gap-2">
            <div className="px-3 py-1 bg-red-100 rounded-full text-sm font-bold text-red-700">
              {resumen.totalLineasEnRiesgo} líneas
            </div>
            <div className="px-3 py-1 bg-orange-100 rounded-full text-sm font-bold text-orange-700">
              ${(resumen.ingresoBleEdoTotal / 1000).toFixed(0)}K riesgo
            </div>
          </div>
        )}
      </div>

      {lineasEnRiesgo.length === 0 ? (
        <div className="flex items-center justify-center h-full text-green-600">
          <div className="text-center">
            <p className="text-lg font-semibold">✓ Sin líneas en riesgo</p>
            <p className="text-sm text-gray-600">Todas tus líneas están operando normalmente</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2">
          {lineasEnRiesgo.map(linea => (
            <div
              key={linea.lineaId}
              className="p-3 bg-red-50 border-l-4 border-red-500 rounded-lg"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-gray-900">Línea {linea.numeroLinea}</p>
                  <p className="text-xs text-gray-600">{linea.causaProbable}</p>
                </div>
                <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded">
                  {linea.caida.toFixed(1)}% ↓
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                <div className="flex items-center gap-1">
                  <TrendingDown className="w-4 h-4 text-red-600" />
                  <span className="text-gray-700">{linea.pasajerosEnRiesgo} pasajeros</span>
                </div>
                <div className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4 text-red-600" />
                  <span className="text-gray-700">
                    ${(linea.ingresoEnRiesgo / 1000).toFixed(1)}K/mes
                  </span>
                </div>
              </div>

              {linea.recomendacionesUrgentes.length > 0 && (
                <div className="text-xs bg-red-100 text-red-800 p-2 rounded">
                  <p className="font-semibold mb-1">Acciones recomendadas:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {linea.recomendacionesUrgentes.map((rec: string, idx: number) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {resumen && resumen.totalLineasEnRiesgo > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-200 bg-red-50 p-3 rounded">
          <p className="text-xs font-bold text-red-700 mb-1">⚠️ IMPACTO TOTAL ESTIMADO:</p>
          <p className="text-sm text-red-600">
            ${(resumen.ingresoBleEdoTotal / 1000000).toFixed(2)}M en riesgo este mes
          </p>
        </div>
      )}
    </div>
  );
}
