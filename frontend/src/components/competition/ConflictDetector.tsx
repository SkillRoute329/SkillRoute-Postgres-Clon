import React from 'react';
import { useCompetitionData } from '../../hooks/useCompetitionData';
import { AlertTriangle, Clock, TrendingDown } from 'lucide-react';

interface ConflictDetectorProps {
  lineaId: string;
  numeroLinea: number;
  title?: string;
  height?: string;
}

export function ConflictDetector({
  lineaId,
  numeroLinea,
  title = 'Detección de Conflictos de Horarios',
  height = '500px',
}: ConflictDetectorProps) {
  const { conflictos, loading, error } = useCompetitionData({
    lineaId,
    autoRefresh: true,
    refreshInterval: 600000,
  });

  if (loading) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200"
      >
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-2"></div>
          <p className="text-gray-600">Detectando conflictos...</p>
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

  // Agrupar conflictos por prioridad
  const conflictosPorPrioridad = {
    critica: conflictos.filter((c) => c.prioridad === 'critica'),
    alta: conflictos.filter((c) => c.prioridad === 'alta'),
    media: conflictos.filter((c) => c.prioridad === 'media'),
    baja: conflictos.filter((c) => c.prioridad === 'baja'),
  };

  const getPriorityColor = (prioridad: string) => {
    switch (prioridad) {
      case 'critica':
        return { bg: 'bg-red-50', border: 'border-red-500', badge: 'bg-red-600' };
      case 'alta':
        return { bg: 'bg-orange-50', border: 'border-orange-500', badge: 'bg-orange-600' };
      case 'media':
        return { bg: 'bg-yellow-50', border: 'border-yellow-500', badge: 'bg-yellow-600' };
      default:
        return { bg: 'bg-blue-50', border: 'border-blue-500', badge: 'bg-blue-600' };
    }
  };

  return (
    <div
      style={{ height }}
      className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
        <div className="flex gap-2">
          {Object.entries(conflictosPorPrioridad).map(
            ([prioridad, items]) =>
              items.length > 0 && (
                <div
                  key={prioridad}
                  className={`px-2 py-1 rounded text-xs font-bold text-white ${
                    getPriorityColor(prioridad).badge
                  }`}
                >
                  {prioridad.charAt(0).toUpperCase() + prioridad.slice(1)}: {items.length}
                </div>
              ),
          )}
        </div>
      </div>

      {/* Conflictos críticos primero */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {conflictos.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>✓ Sin conflictos de horarios detectados</p>
          </div>
        ) : (
          Object.entries(conflictosPorPrioridad).map(
            ([prioridad, items]) =>
              items.length > 0 && (
                <div key={prioridad}>
                  {/* Encabezado de sección */}
                  <div className="mb-2 mt-3 first:mt-0">
                    <p className="text-xs font-bold text-gray-700 uppercase">
                      {prioridad === 'critica'
                        ? '🚨 CRÍTICO'
                        : prioridad === 'alta'
                          ? '⚠️ ALTO'
                          : prioridad === 'media'
                            ? '⚡ MEDIO'
                            : '📌 BAJO'}
                    </p>
                  </div>

                  {/* Items */}
                  {items.map((conflicto) => {
                    const colors = getPriorityColor(prioridad);
                    const diferencia = Math.abs(conflicto.diferenciaminutos);

                    return (
                      <div
                        key={conflicto.id}
                        className={`p-3 rounded-lg border-l-4 ${colors.bg} ${colors.border}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="font-semibold text-gray-900">
                              {conflicto.competidor} - Línea {conflicto.lineaCompetencia}
                            </p>
                            <p className="text-sm text-gray-600">Tu línea {numeroLinea}</p>
                          </div>
                          <span
                            className={`px-2 py-1 rounded text-xs font-bold text-white ${colors.badge}`}
                          >
                            {prioridad.toUpperCase()}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4 text-blue-600" />
                            <span className="text-gray-700">Tú: {conflicto.horarioUCOT}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4 text-gray-600" />
                            <span className="text-gray-700">
                              Comp: {conflicto.horarioCompetencia}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-sm">
                          {conflicto.tipo === 'adelanto-competencia' ? (
                            <TrendingDown className="w-4 h-4 text-red-600" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-green-600" />
                          )}
                          <span className="text-gray-700">
                            Diferencia: {diferencia} minutos -{' '}
                            {conflicto.tipo === 'adelanto-competencia'
                              ? `Competencia adelanta`
                              : 'Tú adelantas'}
                          </span>
                        </div>

                        <div className="mt-2 pt-2 border-t border-gray-300 border-opacity-30 text-xs text-gray-600">
                          <p>Riesgo: {conflicto.pasajerosEnRiesgo} pasajeros/día aproximadamente</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ),
          )
        )}
      </div>

      {/* Footer con recomendación */}
      {conflictosPorPrioridad.critica.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-200 bg-red-50 p-3 rounded">
          <p className="text-xs font-bold text-red-700 mb-1">⚠️ ACCIÓN RECOMENDADA:</p>
          <p className="text-xs text-red-600">
            Revisa tus horarios en línea {numeroLinea}. Tienes{' '}
            {conflictosPorPrioridad.critica.length} conflicto(s) crítico(s) que podrían causar
            pérdida de pasajeros.
          </p>
        </div>
      )}

      <div className="mt-2 text-xs text-gray-600">
        <p>Última actualización: {new Date().toLocaleTimeString()}</p>
      </div>
    </div>
  );
}
