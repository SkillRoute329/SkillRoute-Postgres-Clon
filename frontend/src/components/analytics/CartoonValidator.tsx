import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, TrendingDown, DollarSign, Users } from 'lucide-react';
import axios from 'axios';

interface CartoonValidatorProps {
  cartoonId: string;
  titulo?: string;
  height?: string;
}

export function CartoonValidator({
  cartoonId,
  titulo = 'Validador de Cartones',
  height = '600px',
}: CartoonValidatorProps) {
  const [viabilidad, setViabilidad] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchViability = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await axios.get(`/api/analytics/cartoon/${cartoonId}/viability`);
        setViabilidad(res.data.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Error cargando viabilidad');
      } finally {
        setLoading(false);
      }
    };

    fetchViability();
  }, [cartoonId]);

  if (loading) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200"
      >
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-2"></div>
          <p className="text-gray-600">Analizando cartón...</p>
        </div>
      </div>
    );
  }

  if (error || !viabilidad) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-red-50 rounded-lg border border-red-200"
      >
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <p className="text-red-700">{error || 'Error cargando cartón'}</p>
        </div>
      </div>
    );
  }

  const nivelColor = {
    'muy-viable': 'bg-green-50 border-green-500',
    viable: 'bg-blue-50 border-blue-500',
    marginal: 'bg-yellow-50 border-yellow-500',
    'no-viable': 'bg-red-50 border-red-500',
  };

  const nivelBadgeColor = {
    'muy-viable': 'bg-green-600 text-white',
    viable: 'bg-blue-600 text-white',
    marginal: 'bg-yellow-600 text-white',
    'no-viable': 'bg-red-600 text-white',
  };

  return (
    <div
      style={{ height }}
      className={`rounded-lg border-l-4 p-4 flex flex-col ${nivelColor[viabilidad.nivelViabilidad as keyof typeof nivelColor]}`}
    >
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">{titulo}</h3>
          <p className="text-sm text-gray-600">
            Línea {viabilidad.numeroLinea} • {viabilidad.horarioInicio}-{viabilidad.horarioFin}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded text-sm font-bold ${
              nivelBadgeColor[viabilidad.nivelViabilidad as keyof typeof nivelBadgeColor]
            }`}
          >
            {viabilidad.nivelViabilidad.toUpperCase()}
          </span>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800">{viabilidad.puntajeViabilidad}</p>
            <p className="text-xs text-gray-600">Score</p>
          </div>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-3 gap-3 mb-4 pb-4 border-b border-gray-300">
        <div className="bg-white bg-opacity-60 p-3 rounded">
          <div className="flex items-center gap-1 mb-1">
            <Users className="w-4 h-4 text-blue-600" />
            <p className="text-xs text-gray-600">Pasajeros/día</p>
          </div>
          <p className="text-lg font-bold text-gray-900">{viabilidad.pasajerosEstimados}</p>
        </div>

        <div className="bg-white bg-opacity-60 p-3 rounded">
          <div className="flex items-center gap-1 mb-1">
            <DollarSign className="w-4 h-4 text-green-600" />
            <p className="text-xs text-gray-600">Ingresos/día</p>
          </div>
          <p className="text-lg font-bold text-green-700">
            ${viabilidad.ingresosEstimados.toLocaleString()}
          </p>
        </div>

        <div className="bg-white bg-opacity-60 p-3 rounded">
          <div className="flex items-center gap-1 mb-1">
            <TrendingDown className="w-4 h-4 text-gray-600" />
            <p className="text-xs text-gray-600">Costos/día</p>
          </div>
          <p className="text-lg font-bold text-gray-900">
            ${viabilidad.costosEstimados.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Margen */}
      <div className="mb-4 p-3 bg-white bg-opacity-60 rounded">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-gray-900">Margen Estimado</p>
          <p
            className={`text-lg font-bold ${
              viabilidad.margenEstimado > 0 ? 'text-green-700' : 'text-red-700'
            }`}
          >
            ${viabilidad.margenEstimado.toLocaleString()}/día
          </p>
        </div>
        <p className="text-sm text-gray-600">
          ${viabilidad.margenEstimadoMes.toLocaleString()}/mes •{' '}
          {viabilidad.porcentajeMargen.toFixed(1)}% margen
        </p>

        {/* Barra de progreso */}
        <div className="mt-2 w-full bg-gray-300 rounded h-2">
          <div
            className={`h-2 rounded transition ${
              viabilidad.margenEstimado > 5000
                ? 'bg-green-600'
                : viabilidad.margenEstimado > 2000
                  ? 'bg-blue-600'
                  : viabilidad.margenEstimado > 0
                    ? 'bg-yellow-600'
                    : 'bg-red-600'
            }`}
            style={{
              width: `${Math.min(100, (viabilidad.puntajeViabilidad / 100) * 100)}%`,
            }}
          />
        </div>
      </div>

      {/* Alertas */}
      {viabilidad.alertas.length > 0 && (
        <div className="mb-4 space-y-2 flex-1 overflow-y-auto">
          <p className="text-sm font-semibold text-gray-800">⚠️ Alertas Detectadas:</p>
          {viabilidad.alertas.map((alerta: any) => (
            <div
              key={alerta.id}
              className={`p-2 rounded text-sm ${
                alerta.severidad === 'critica'
                  ? 'bg-red-100 text-red-800 border border-red-300'
                  : alerta.severidad === 'alta'
                    ? 'bg-orange-100 text-orange-800 border border-orange-300'
                    : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
              }`}
            >
              <p className="font-semibold">{alerta.titulo}</p>
              <p className="text-xs">{alerta.mensaje}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recomendaciones */}
      {viabilidad.recomendaciones.length > 0 && (
        <div className="bg-white bg-opacity-60 p-3 rounded">
          <p className="text-sm font-semibold text-gray-800 mb-2">💡 Recomendaciones:</p>
          {viabilidad.recomendaciones.slice(0, 2).map((rec: any) => (
            <p key={rec.id} className="text-xs text-gray-700 mb-1">
              • {rec.accion}
            </p>
          ))}
        </div>
      )}

      {/* Veredicto */}
      <div className="mt-4 pt-3 border-t border-gray-300">
        {viabilidad.esViable ? (
          <div className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-700 font-semibold">
              Este cartón es VIABLE. Genera ingresos positivos.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-semibold">
              Este cartón NO ES VIABLE. Está generando pérdidas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
