import React, { useState } from 'react';
import { useCompetitionData } from '../../hooks/useCompetitionData';
import { AlertCircle, TrendingDown, Users, Zap } from 'lucide-react';

interface OverlapAnalysisProps {
  lineaId: string;
  numeroLinea: number;
  title?: string;
  height?: string;
}

export function OverlapAnalysis({
  lineaId,
  numeroLinea,
  title = 'Análisis de Sobreposición',
  height = '500px',
}: OverlapAnalysisProps) {
  const { sobreposiciones, loading, error, totalPasajerosEnRiesgo } = useCompetitionData({
    lineaId,
    autoRefresh: true,
    refreshInterval: 600000, // 10 minutos
  });

  const [selectedCompetidor, setSelectedCompetidor] = useState<string | null>(null);

  if (loading) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200"
      >
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-2"></div>
          <p className="text-gray-600">Analizando sobreposiciones...</p>
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
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  const filteredSobreposiciones = selectedCompetidor
    ? sobreposiciones.filter((s) => s.competidor === selectedCompetidor)
    : sobreposiciones;

  const competidoresUnicos = Array.from(new Set(sobreposiciones.map((s) => s.competidor)));

  return (
    <div
      style={{ height }}
      className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
        <div className="flex items-center gap-2 bg-red-50 px-3 py-1 rounded">
          <Users className="w-4 h-4 text-red-600" />
          <span className="text-sm font-semibold text-red-700">
            {totalPasajerosEnRiesgo} pasajeros en riesgo
          </span>
        </div>
      </div>

      {/* Filtro de competidores */}
      {competidoresUnicos.length > 0 && (
        <div className="flex gap-2 mb-4 pb-3 border-b border-gray-200">
          <button
            onClick={() => setSelectedCompetidor(null)}
            className={`px-3 py-1 rounded text-sm font-medium transition ${
              selectedCompetidor === null
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Todos ({sobreposiciones.length})
          </button>
          {competidoresUnicos.map((competidor) => (
            <button
              key={competidor}
              onClick={() => setSelectedCompetidor(competidor)}
              className={`px-3 py-1 rounded text-sm font-medium transition ${
                selectedCompetidor === competidor
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {competidor} ({sobreposiciones.filter((s) => s.competidor === competidor).length})
            </button>
          ))}
        </div>
      )}

      {/* Lista de sobreposiciones */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {filteredSobreposiciones.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>No hay sobreposiciones significativas</p>
          </div>
        ) : (
          filteredSobreposiciones.map((sobreposicion) => (
            <div
              key={sobreposicion.id}
              className={`p-3 rounded-lg border-l-4 transition ${
                sobreposicion.nivelesRiesgo === 'critico'
                  ? 'bg-red-50 border-red-500'
                  : sobreposicion.nivelesRiesgo === 'alto'
                    ? 'bg-orange-50 border-orange-500'
                    : sobreposicion.nivelesRiesgo === 'medio'
                      ? 'bg-yellow-50 border-yellow-500'
                      : 'bg-green-50 border-green-500'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-gray-900">
                    {sobreposicion.competidor} - Línea {sobreposicion.numeroLineaCompetencia}
                  </p>
                  <p className="text-sm text-gray-600">vs. Tu Línea {numeroLinea}</p>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-bold text-white ${
                    sobreposicion.nivelesRiesgo === 'critico'
                      ? 'bg-red-600'
                      : sobreposicion.nivelesRiesgo === 'alto'
                        ? 'bg-orange-600'
                        : sobreposicion.nivelesRiesgo === 'medio'
                          ? 'bg-yellow-600'
                          : 'bg-green-600'
                  }`}
                >
                  {sobreposicion.nivelesRiesgo.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-1">
                  <Zap className="w-4 h-4 text-blue-600" />
                  <span className="text-gray-700">
                    Sobreposición: {sobreposicion.porcentajeSobreposicion.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <TrendingDown className="w-4 h-4 text-red-600" />
                  <span className="text-gray-700">
                    {sobreposicion.pasajerosEnRiesgo} pasajeros/día
                  </span>
                </div>
              </div>

              {sobreposicion.conflictosHorarios.length > 0 && (
                <p className="text-xs text-gray-600 mt-2">
                  {sobreposicion.conflictosHorarios.length} conflicto(s) de horario
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-600">
        <p>Última actualización: {new Date().toLocaleTimeString()}</p>
      </div>
    </div>
  );
}
