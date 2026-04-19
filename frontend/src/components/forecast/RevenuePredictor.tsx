import React from 'react';
import { useForecastData } from '../../hooks/useForecastData';
import { TrendingUp, TrendingDown, DollarSign, Users, Target } from 'lucide-react';

interface RevenuePredictorProps {
  lineaId: string;
  numeroLinea: number;
  titulo?: string;
  height?: string;
}

export function RevenuePredictor({
  lineaId,
  numeroLinea,
  titulo = 'Predictor de Ingresos',
  height = '600px',
}: RevenuePredictorProps) {
  const { pronostico, mejorEscenario, peorEscenario, loading, error } = useForecastData({
    lineaId,
    autoRefresh: true,
    refreshInterval: 900000, // 15 minutos
  });

  if (loading) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200"
      >
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-2"></div>
          <p className="text-gray-600">Calculando escenarios...</p>
        </div>
      </div>
    );
  }

  if (error || !pronostico) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-red-50 rounded-lg border border-red-200"
      >
        <p className="text-red-700">{error || 'Error cargando pronóstico'}</p>
      </div>
    );
  }

  return (
    <div
      style={{ height }}
      className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col"
    >
      <h3 className="text-lg font-bold text-gray-800 mb-4">{titulo}</h3>

      {/* Escenario actual */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-bold text-gray-900">📊 Escenario Actual</h4>
          <span className="px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded">
            LÍNEA {numeroLinea}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-600">Pasajeros/día</p>
            <p className="text-2xl font-bold text-blue-700">{pronostico.pasajerosActuales}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Ingresos/día</p>
            <p className="text-2xl font-bold text-green-700">
              ${pronostico.ingresosActuales.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Mejores escenarios */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-4">
        <p className="text-sm font-semibold text-gray-800">📈 Mejores Escenarios:</p>

        {pronostico.escenarios
          .filter((e: any) => e.cambioVsActual > 0)
          .sort((a: any, b: any) => b.impacto - a.impacto)
          .slice(0, 3)
          .map((escenario: any) => (
            <div key={escenario.nombre} className="bg-green-50 border border-green-200 p-3 rounded">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-gray-900">{escenario.nombre}</p>
                <span className="px-2 py-1 bg-green-600 text-white text-xs font-bold rounded">
                  +{escenario.cambioVsActual}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-xs text-gray-600">Pasajeros</p>
                  <p className="font-bold text-gray-900">{escenario.pasajerosProyectados}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Ingresos</p>
                  <p className="font-bold text-green-700">
                    ${escenario.ingresosProyectados.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Mes</p>
                  <p className="font-bold text-green-700">
                    ${(escenario.impacto / 1000).toFixed(0)}K
                  </p>
                </div>
              </div>
              <p className="text-xs text-green-700 mt-2">Confianza: {escenario.confianza}%</p>
            </div>
          ))}
      </div>

      {/* Peores escenarios */}
      <div className="bg-red-50 border border-red-200 p-3 rounded mb-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">📉 Escenario Riesgo:</p>
        {peorEscenario && (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{peorEscenario.nombre}</p>
              <p className="text-xs text-gray-600">{peorEscenario.cambioVsActual}%</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-600">Impacto/mes</p>
              <p className="font-bold text-red-700">
                ${(peorEscenario.impacto / 1000).toFixed(0)}K
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Recomendación */}
      <div className="bg-yellow-50 border border-yellow-300 p-3 rounded">
        <p className="text-sm font-bold text-yellow-900 mb-2">💡 Recomendación:</p>
        {mejorEscenario && (
          <p className="text-xs text-yellow-800">
            Implementar "{mejorEscenario.nombre}" podría aumentar ingresos hasta $
            {(mejorEscenario.impacto / 1000).toFixed(0)}K/mes con {mejorEscenario.confianza}% de
            confianza.
          </p>
        )}
      </div>
    </div>
  );
}
