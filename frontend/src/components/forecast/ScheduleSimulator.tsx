import React, { useState } from 'react';
import { useSimulator } from '../../hooks/useForecastData';
import { AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Play } from 'lucide-react';

interface ScheduleSimulatorProps {
  lineaId: string;
  numeroLinea: number;
  horarioActual?: string;
  titulo?: string;
  height?: string;
}

export function ScheduleSimulator({
  lineaId,
  numeroLinea,
  horarioActual = '06:00',
  titulo = 'Simulador de Horarios',
  height = '600px'
}: ScheduleSimulatorProps) {
  const { simulacion, resumen, loading, error, simular, reset } = useSimulator();

  const [horarioNuevo, setHorarioNuevo] = useState(horarioActual);
  const [razon, setRazon] = useState('Adelanto competitivo');

  const handleSimular = async () => {
    await simular(lineaId, [
      {
        horarioActual,
        horarioNuevo,
        razon
      }
    ]);
  };

  return (
    <div style={{ height }} className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col">
      <h3 className="text-lg font-bold text-gray-800 mb-4">{titulo}</h3>

      {/* Panel de entrada */}
      {!simulacion && (
        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Horario Actual
            </label>
            <input
              type="time"
              value={horarioActual}
              disabled
              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Horario Nuevo
            </label>
            <input
              type="time"
              value={horarioNuevo}
              onChange={(e) => setHorarioNuevo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Razón del cambio
            </label>
            <select
              value={razon}
              onChange={(e) => setRazon(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
            >
              <option>Adelanto competitivo</option>
              <option>Respuesta a competencia</option>
              <option>Optimización de demanda</option>
              <option>Cambio de ruta</option>
              <option>Otro</option>
            </select>
          </div>

          <button
            onClick={handleSimular}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            <Play className="w-4 h-4" />
            {loading ? 'Simulando...' : 'Simular Cambio'}
          </button>
        </div>
      )}

      {/* Resultados */}
      {simulacion && (
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {/* Comparación */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 p-3 rounded border border-gray-200">
              <p className="text-xs text-gray-600 mb-1">Escenario Actual</p>
              <p className="text-sm font-bold text-gray-900">
                {simulacion.resultados.escenarioActual.pasajeros} pasajeros
              </p>
              <p className="text-xs text-gray-600">
                ${simulacion.resultados.escenarioActual.ingresos}/día
              </p>
            </div>

            <div className={`p-3 rounded border-2 ${
              simulacion.resultados.escenarioNuevo.cambioAbsoluto > 0
                ? 'bg-green-50 border-green-500'
                : 'bg-red-50 border-red-500'
            }`}>
              <p className="text-xs text-gray-600 mb-1">Escenario Nuevo</p>
              <p className="text-sm font-bold text-gray-900">
                {simulacion.resultados.escenarioNuevo.pasajeros} pasajeros
              </p>
              <p className={`text-xs font-bold ${
                simulacion.resultados.escenarioNuevo.cambioAbsoluto > 0
                  ? 'text-green-700'
                  : 'text-red-700'
              }`}>
                ${simulacion.resultados.escenarioNuevo.ingresos}/día
              </p>
            </div>
          </div>

          {/* Cambio */}
          <div className={`p-4 rounded-lg border-2 ${
            simulacion.resultados.escenarioNuevo.cambioAbsoluto > 0
              ? 'bg-green-50 border-green-500'
              : 'bg-red-50 border-red-500'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold text-gray-900">Cambio Neto</p>
              <div className="flex items-center gap-2">
                {simulacion.resultados.escenarioNuevo.cambioAbsoluto > 0 ? (
                  <TrendingUp className="w-6 h-6 text-green-600" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-red-600" />
                )}
                <span className={`text-2xl font-bold ${
                  simulacion.resultados.escenarioNuevo.cambioAbsoluto > 0
                    ? 'text-green-700'
                    : 'text-red-700'
                }`}>
                  {simulacion.resultados.escenarioNuevo.cambioAbsoluto > 0 ? '+' : ''}
                  ${simulacion.resultados.escenarioNuevo.cambioAbsoluto.toLocaleString()}
                </span>
              </div>
            </div>

            <p className="text-sm text-gray-600">
              {simulacion.resultados.escenarioNuevo.cambioRelativo > 0 ? '+' : ''}
              {simulacion.resultados.escenarioNuevo.cambioRelativo}% / día
            </p>

            <p className={`text-sm font-bold mt-2 ${
              simulacion.resultados.escenarioNuevo.cambioAbsoluto > 0
                ? 'text-green-700'
                : 'text-red-700'
            }`}>
              Impacto mensual: ${simulacion.resultados.impactoTotal.toLocaleString()}
            </p>
          </div>

          {/* Veredicto */}
          <div className={`p-3 rounded-lg border-2 flex items-start gap-3 ${
            simulacion.riesgo === 'bajo'
              ? 'bg-green-50 border-green-500'
              : simulacion.riesgo === 'medio'
              ? 'bg-yellow-50 border-yellow-500'
              : 'bg-red-50 border-red-500'
          }`}>
            {simulacion.riesgo === 'bajo' ? (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`font-bold ${
                simulacion.riesgo === 'bajo'
                  ? 'text-green-700'
                  : simulacion.riesgo === 'medio'
                  ? 'text-yellow-700'
                  : 'text-red-700'
              }`}>
                {simulacion.riesgo === 'bajo' ? '✓ RECOMENDADO' : simulacion.riesgo === 'medio' ? '⚠️ ANALIZAR' : '✗ NO RECOMENDADO'}
              </p>
              <p className="text-xs text-gray-700 mt-1">{simulacion.recomendacion}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 p-3 rounded mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {simulacion && (
        <button
          onClick={reset}
          className="w-full py-2 px-4 bg-gray-200 text-gray-900 font-bold rounded hover:bg-gray-300"
        >
          Nueva Simulación
        </button>
      )}
    </div>
  );
}
