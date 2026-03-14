import React from 'react';
import { useGrowthProjection } from '../../hooks/useForecastData';
import { TrendingUp, TrendingDown, Calendar } from 'lucide-react';

interface GrowthProjectionProps {
  lineaId: string;
  numeroLinea: number;
  meses?: number;
  titulo?: string;
  height?: string;
}

export function GrowthProjection({
  lineaId,
  numeroLinea,
  meses = 6,
  titulo = 'Proyección de Crecimiento',
  height = '500px'
}: GrowthProjectionProps) {
  const { proyeccion, resumen, loading, error } = useGrowthProjection(lineaId, meses);

  if (loading) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200"
      >
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-2"></div>
          <p className="text-gray-600">Calculando proyecciones...</p>
        </div>
      </div>
    );
  }

  if (error || !proyeccion) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-red-50 rounded-lg border border-red-200"
      >
        <p className="text-red-700">{error || 'Error cargando proyección'}</p>
      </div>
    );
  }

  const tendenciaColor = {
    'creciente': 'text-green-700 bg-green-50',
    'estable': 'text-blue-700 bg-blue-50',
    'decreciente': 'text-red-700 bg-red-50'
  };

  return (
    <div style={{ height }} className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-800">{titulo}</h3>
        <span className="px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded">LÍNEA {numeroLinea}</span>
      </div>

      {/* Resumen */}
      {resumen && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gradient-to-br from-green-50 to-green-100 p-3 rounded border border-green-200">
            <p className="text-xs text-gray-600">Tasa Mensual</p>
            <p className="text-xl font-bold text-green-700">{resumen.tasaMensual}</p>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded border border-blue-200">
            <p className="text-xs text-gray-600">Crecimiento Total</p>
            <p className="text-xl font-bold text-blue-700">{resumen.crecimientoTotal}</p>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-3 rounded border border-purple-200">
            <p className="text-xs text-gray-600">Confianza</p>
            <p className="text-xl font-bold text-purple-700">{resumen.confianza}</p>
          </div>

          <div className={`p-3 rounded border flex items-center justify-between ${tendenciaColor[resumen.tendencia as keyof typeof tendenciaColor] || 'bg-gray-50'}`}>
            <p className="text-xs">Tendencia</p>
            <p className="text-sm font-bold">{resumen.tendencia}</p>
          </div>
        </div>
      )}

      {/* Gráfico simple de proyecciones */}
      <div className="flex-1 overflow-y-auto mb-4">
        <p className="text-sm font-semibold text-gray-800 mb-3">📊 Proyecciones Mensuales:</p>
        <div className="space-y-2">
          {proyeccion.proyecciones.map((proj: any, idx: number) => {
            const maxIngreso = Math.max(
              ...proyeccion.proyecciones.map((p: any) => p.ingresoProyectado)
            );
            const porcentajeBarra = (proj.ingresoProyectado / maxIngreso) * 100;

            return (
              <div key={idx}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-700">
                    Mes {proj.mes} ({new Date(proj.fecha).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })})
                  </p>
                  <p className="text-xs font-bold text-gray-900">
                    ${(proj.ingresoProyectado / 1000).toFixed(0)}K
                  </p>
                </div>

                <div className="w-full bg-gray-200 rounded h-6 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-green-500 h-full flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${porcentajeBarra}%` }}
                  >
                    {porcentajeBarra > 20 && (
                      <p className="text-xs font-bold text-white">{Math.round(porcentajeBarra)}%</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer con análisis */}
      <div className="bg-blue-50 border border-blue-200 p-3 rounded">
        <p className="text-xs font-bold text-blue-900 mb-1">💡 Análisis:</p>
        <p className="text-xs text-blue-800">
          {proyeccion.tasaCrecimientoMensual > 0
            ? `Tu línea está creciendo. A este ritmo, los ingresos aumentarán un ${Math.round(proyeccion.tasaCrecimientoMensual)}% cada mes.`
            : proyeccion.tasaCrecimientoMensual < 0
            ? `Tu línea está decreciendo. Requiere atención inmediata y cambios estratégicos.`
            : 'Tu línea está estable. Mantén la operación actual.'}
        </p>
      </div>
    </div>
  );
}
