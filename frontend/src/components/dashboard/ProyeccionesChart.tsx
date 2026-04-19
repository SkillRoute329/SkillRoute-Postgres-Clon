import React from 'react';
import type { ProyeccionIngresos } from '../../types/dashboard';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface ProyeccionesChartProps {
  proyecciones: ProyeccionIngresos[];
}

const widthMap: Record<number, string> = {
  0: 'w-0',
  5: 'w-[5%]',
  10: 'w-[10%]',
  15: 'w-[15%]',
  20: 'w-[20%]',
  25: 'w-[25%]',
  30: 'w-[30%]',
  35: 'w-[35%]',
  40: 'w-[40%]',
  45: 'w-[45%]',
  50: 'w-[50%]',
  55: 'w-[55%]',
  60: 'w-[60%]',
  65: 'w-[65%]',
  70: 'w-[70%]',
  75: 'w-[75%]',
  80: 'w-[80%]',
  85: 'w-[85%]',
  90: 'w-[90%]',
  95: 'w-[95%]',
  100: 'w-full',
};

export function ProyeccionesChart({ proyecciones }: ProyeccionesChartProps) {
  // Preparar datos para el gráfico
  const datosGrafico = proyecciones.map((p) => ({
    periodo: p.periodo,
    actual: p.ingresosActuales,
    proyectado: p.ingresosProyectados,
    cambio: p.cambioEsperado,
    confianza: p.confianza,
  }));

  const _maxIngreso = Math.max(...datosGrafico.map((d) => Math.max(d.actual ?? 0, d.proyectado)));

  return (
    <div className="space-y-6">
      {/* Gráfico de barras comparativas */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h4 className="text-lg font-bold text-gray-900 mb-4">Comparación: Actual vs Proyectado</h4>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={datosGrafico}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="periodo" />
            <YAxis />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => `$${(Number(value) / 1000000).toFixed(1)}M`}
              contentStyle={{ backgroundColor: '#f3f4f6', border: '1px solid #d1d5db' }}
            />
            <Legend />
            <Bar dataKey="actual" fill="#3b82f6" name="Actual" radius={[8, 8, 0, 0]} />
            <Bar dataKey="proyectado" fill="#10b981" name="Proyectado" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detalles de cada proyección */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {proyecciones.map((proy, idx) => {
          const cambioPositivo = proy.cambioEsperado > 0;
          const confianzaAlta = proy.confianza >= 80;

          return (
            <div
              key={idx}
              className={`rounded-lg shadow-lg p-6 border-l-4 ${
                cambioPositivo ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'
              }`}
            >
              {/* Período */}
              <p className="text-sm font-semibold text-gray-600 mb-2">PERÍODO</p>
              <h3
                className={`text-xl font-bold mb-4 ${
                  cambioPositivo ? 'text-green-900' : 'text-red-900'
                }`}
              >
                {proy.periodo}
              </h3>

              {/* Ingresos actuales */}
              <div className="mb-4">
                <p className="text-xs text-gray-600 font-semibold mb-1">Ingresos Actuales</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${((proy.ingresosActuales ?? 0) / 1000000).toFixed(1)}M
                </p>
              </div>

              {/* Ingresos proyectados */}
              <div className="mb-4">
                <p className="text-xs text-gray-600 font-semibold mb-1">Ingresos Proyectados</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${(proy.ingresosProyectados / 1000000).toFixed(1)}M
                </p>
              </div>

              {/* Cambio esperado */}
              <div
                className={`rounded-lg p-3 mb-4 flex items-center gap-2 ${
                  cambioPositivo
                    ? 'bg-green-100 border border-green-300'
                    : 'bg-red-100 border border-red-300'
                }`}
              >
                {cambioPositivo ? (
                  <TrendingUp className="w-5 h-5 text-green-600" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-600" />
                )}
                <div>
                  <p className="text-xs text-gray-600 font-semibold">Cambio Esperado</p>
                  <p
                    className={`text-lg font-bold ${
                      cambioPositivo ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {cambioPositivo ? '+' : ''}
                    {proy.cambioEsperado}%
                  </p>
                </div>
              </div>

              {/* Confianza */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-600 font-semibold">Confianza del Pronóstico</p>
                  <span
                    className={`text-sm font-bold px-2 py-1 rounded ${
                      confianzaAlta
                        ? 'bg-green-200 text-green-800'
                        : 'bg-yellow-200 text-yellow-800'
                    }`}
                  >
                    {proy.confianza}%
                  </span>
                </div>
                <div className="w-full bg-gray-300 rounded-full h-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      confianzaAlta ? 'bg-green-500' : 'bg-yellow-500'
                    } ${widthMap[Math.round(proy.confianza / 5) * 5] || 'w-0'}`}
                  ></div>
                </div>
              </div>

              {/* Drivers principales */}
              {proy.principales_drivers && proy.principales_drivers.length > 0 && (
                <div className="bg-white bg-opacity-60 rounded p-3">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Principales Factores:</p>
                  <ul className="space-y-1">
                    {proy.principales_drivers.map((driver, dIdx) => (
                      <li key={dIdx} className="text-xs text-gray-700 flex items-start gap-2">
                        <span className="text-blue-600 mt-1">•</span>
                        <span>{driver}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Resumen general */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-lg p-6 border-2 border-blue-300">
        <h4 className="text-lg font-bold text-gray-900 mb-4">📊 Análisis Consolidado</h4>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-600 font-semibold mb-1">Promedio Cambio Esperado</p>
            <p
              className={`text-3xl font-bold ${
                proyecciones.reduce((sum, p) => sum + p.cambioEsperado, 0) / proyecciones.length > 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}
            >
              {(
                proyecciones.reduce((sum, p) => sum + p.cambioEsperado, 0) / proyecciones.length
              ).toFixed(1)}
              %
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-600 font-semibold mb-1">Confianza Promedio</p>
            <p className="text-3xl font-bold text-blue-600">
              {Math.round(
                proyecciones.reduce((sum, p) => sum + p.confianza, 0) / proyecciones.length,
              )}
              %
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4">
          <p className="text-sm font-semibold text-gray-900 mb-2">💡 Insight:</p>
          <p className="text-sm text-gray-700">
            {proyecciones.reduce((sum, p) => sum + p.cambioEsperado, 0) / proyecciones.length > 0
              ? '✓ Las proyecciones indican crecimiento consistente en los próximos períodos. Se recomienda capitalizar esta tendencia con inversiones estratégicas.'
              : '⚠️ Las proyecciones muestran presión descendente. Considera implementar medidas defensivas y optimizaciones operacionales.'}
          </p>
        </div>
      </div>
    </div>
  );
}
